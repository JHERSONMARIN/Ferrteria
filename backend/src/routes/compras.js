import express from 'express';
import { prisma } from '../db.js';
import { quantityProblem, roundMoney } from '../utils/quantities.js';
import { addStock } from '../services/stock.js';
import { resolveBranchId, BranchError } from '../services/branches.js';

const router = express.Router();

// GET /api/compras
router.get('/', async (req, res) => {
  try {
    const list = await prisma.compra.findMany({
      select: {
        id: true,
        numDoc: true,
        total: true,
        createdAt: true,
        proveedor: {
          select: { name: true, ruc: true }
        },
        detalles: {
          select: {
            quantity: true,
            unitPrice: true,
            subtotal: true,
            producto: { select: { name: true, code: true } }
          }
        }
      },
      orderBy: { id: 'desc' }
    });

    const formatted = list.map(c => ({
      id: c.id,
      numDoc: c.numDoc,
      provider: c.proveedor.name,
      providerRuc: c.proveedor.ruc,
      total: c.total,
      date: new Date(c.createdAt).toLocaleString('es-PE'),
      detalles: c.detalles,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar compras.' });
  }
});

// POST /api/compras (Registrar Compra a Proveedor -> Aumenta Stock y Kardex ENTRADA)
router.post('/', async (req, res) => {
  try {
    const { proveedorId, numDoc, items } = req.body;

    if (!proveedorId || !numDoc || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Proveedor, número de documento y al menos un producto requeridos.' });
    }

    // La mercadería entra a la sucursal del usuario (o la que indique el administrador).
    const branchId = await resolveBranchId(prisma, req.user, req.body.branchId);
    const result = await prisma.$transaction(async (tx) => {
      // Cada línea se valida contra su producto: enteros, o hasta 3 decimales si se vende fraccionado.
      const lines = [];
      for (const item of items) {
        const product = await tx.producto.findUnique({
          where: { id: parseInt(item.id, 10) },
          select: { id: true, name: true, active: true, allowsFractions: true },
        });
        if (!product || !product.active) throw new Error(`El producto ${item.name || item.id} no existe o no está activo.`);
        const qty = Number(item.qty);
        const problem = quantityProblem(qty, product.allowsFractions);
        if (problem) throw new Error(`La cantidad de ${product.name} ${problem}.`);
        const cost = Number(item.cost);
        if (!Number.isFinite(cost) || cost < 0) throw new Error(`El costo de ${product.name} no es válido.`);
        lines.push({ id: product.id, qty, cost, subtotal: roundMoney(qty * cost) });
      }
      const totalCompra = roundMoney(lines.reduce((sum, l) => sum + l.subtotal, 0));

      const compra = await tx.compra.create({
        data: {
          proveedorId: parseInt(proveedorId),
          numDoc: numDoc.trim(),
          total: totalCompra,
          branchId,
        }
      });

      for (const { id: prodId, qty: qtyNum, cost: costNum, subtotal } of lines) {
        await tx.detalleCompra.create({
          data: {
            compraId: compra.id,
            productoId: prodId,
            quantity: qtyNum,
            unitPrice: costNum,
            subtotal,
          }
        });

        // Incrementar Stock en Almacén
        const stockAfter = await addStock(tx, prodId, qtyNum, branchId);

        // Registrar ENTRADA en Kardex
        await tx.movimientoKardex.create({
          data: {
            productoId: prodId,
            type: 'ENTRADA',
            qty: qtyNum,
            stockAfter,
            ref: `Compra a Proveedor (Doc: ${numDoc.trim()})`,
            usuarioId: req.user.id,
            branchId,
          }
        });
      }

      return compra;
    });

    res.status(201).json({ success: true, compra: result });
  } catch (error) {
    if (error instanceof BranchError) return res.status(error.status).json({ error: error.message });
    res.status(400).json({ error: error.message || 'Error al registrar compra.' });
  }
});

export default router;
