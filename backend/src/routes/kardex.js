import express from 'express';
import { prisma } from '../db.js';
import { quantityProblem, roundQuantity } from '../utils/quantities.js';
import { recordAudit } from '../services/audit.js';
import { takeAvailableStock, addStock, StockError } from '../services/stock.js';
import { resolveBranchId, BranchError } from '../services/branches.js';

const router = express.Router();

/**
 * GET /api/kardex
 * Filtra movimientos de almacén por producto, tipo y periodo temporal:
 * - productCode: código específico de producto
 * - type: ENTRADA | SALIDA
 * - period: 'today' | 'week' | 'month' | 'all' | 'custom'
 * - startDate / endDate: para rango personalizado
 */
router.get('/', async (req, res) => {
  try {
    const { productCode, type, period = 'month', startDate, endDate, branchId } = req.query;

    const where = {};

    // Filtro por sucursal (sin filtro: todas).
    if (branchId) {
      const id = parseInt(branchId, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'Sucursal no válida.' });
      where.branchId = id;
    }

    // Filtro por producto
    if (productCode && productCode.trim()) {
      where.producto = { code: productCode.trim() };
    }

    // Filtro por tipo de movimiento
    if (type && (type === 'ENTRADA' || type === 'SALIDA')) {
      where.type = type;
    }

    // Filtro temporal
    const now = new Date();
    if (period === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      where.createdAt = { gte: startOfDay };
    } else if (period === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - 7);
      startOfWeek.setHours(0, 0, 0, 0);
      where.createdAt = { gte: startOfWeek };
    } else if (period === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      where.createdAt = { gte: startOfMonth };
    } else if (period === 'custom' && (startDate || endDate)) {
      where.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        where.createdAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const records = await prisma.movimientoKardex.findMany({
      where,
      select: {
        id: true,
        type: true,
        qty: true,
        stockAfter: true,
        ref: true,
        createdAt: true,
        producto: {
          select: {
            code: true,
            name: true,
            unit: true,
            price: true,
          },
        },
        usuario: {
          select: {
            id: true,
            name: true,
            user: true,
            role: true,
          },
        },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { id: 'desc' },
    });

    const formatted = records.map((r) => ({
      id: r.id,
      date: new Date(r.createdAt).toLocaleString('es-PE'),
      timestamp: r.createdAt,
      code: r.producto?.code || '',
      name: r.producto?.name || '',
      unit: r.producto?.unit || 'Unidad',
      type: r.type,
      qty: r.qty,
      stockAfter: r.stockAfter,
      ref: r.ref,
      user: r.usuario ? r.usuario.name : 'Sistema / General',
      userRole: r.usuario ? r.usuario.role : '',
      branch: r.branch,
    }));

    // Métricas del periodo filtrado
    const totalIn = records
      .filter((r) => r.type === 'ENTRADA')
      .reduce((sum, r) => sum + (r.qty || 0), 0);

    const totalOut = records
      .filter((r) => r.type === 'SALIDA')
      .reduce((sum, r) => sum + (r.qty || 0), 0);

    const summary = {
      totalIn,
      totalOut,
      netBalance: totalIn - totalOut,
      movementCount: records.length,
      period,
    };

    res.json({
      records: formatted,
      summary,
    });
  } catch (error) {
    console.error('[kardex.js] Error al obtener movimientos de Kardex:', error);
    res.status(500).json({ error: 'Error al obtener movimientos de Kardex.' });
  }
});

/**
 * POST /api/kardex (Movimiento manual)
 * Permite registrar ingresos o salidas manuales (ajustes, mermas, inventarios iniciales)
 */
router.post('/', async (req, res) => {
  try {
    const { productoId, type, qty, ref } = req.body;
    const usuarioId = req.user.id;
    const qtyNum = Number(qty);

    if (!productoId || !type || !Number.isFinite(qtyNum) || qtyNum <= 0) {
      return res.status(400).json({ error: 'Parámetros inválidos para registrar el movimiento.' });
    }

    const branchId = await resolveBranchId(prisma, req.user, req.body.branchId);
    const result = await prisma.$transaction(async (tx) => {
      const prod = await tx.producto.findUnique({
        where: { id: parseInt(productoId, 10) },
      });
      if (!prod) throw new Error('Producto no encontrado.');
      const problem = quantityProblem(qtyNum, prod.allowsFractions);
      if (problem) throw new Error(`La cantidad ${problem}.`);

      const before = await tx.branchStock.findUnique({
        where: { branchId_productoId: { branchId, productoId: prod.id } },
        select: { stock: true },
      });
      const stockBefore = before?.stock ?? 0;

      // Lo reservado por pedidos no se puede sacar manualmente (takeAvailableStock lo impide).
      const newStock = type === 'ENTRADA'
        ? await addStock(tx, prod.id, qtyNum, branchId)
        : await takeAvailableStock(tx, prod.id, qtyNum, branchId);

      // Crear registro en Kardex
      const km = await tx.movimientoKardex.create({
        data: {
          productoId: prod.id,
          type: type === 'ENTRADA' ? 'ENTRADA' : 'SALIDA',
          qty: qtyNum,
          stockAfter: newStock,
          ref: ref ? ref.trim() : 'Movimiento Manual',
          usuarioId: usuarioId ? parseInt(usuarioId, 10) : null,
          branchId,
        },
      });

      await recordAudit(tx, {
        action: 'STOCK_ADJUSTED',
        entity: 'Producto',
        entityId: prod.id,
        summary: `${km.type === 'ENTRADA' ? 'Entrada' : 'Salida'} manual de ${qtyNum} ${prod.unit} de ${prod.code} ${prod.name} `
          + `(stock ${stockBefore} → ${newStock}): ${km.ref}`,
        details: { type: km.type, qty: qtyNum, stockBefore, stockAfter: newStock, ref: km.ref, branchId },
        user: req.user,
      });

      return { km, newStock };
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof BranchError || error instanceof StockError) return res.status(error.status).json({ error: error.message });
    console.error('[kardex.js] Error al registrar movimiento:', error);
    res.status(400).json({ error: error.message || 'Error al procesar movimiento de Kardex.' });
  }
});

export default router;
