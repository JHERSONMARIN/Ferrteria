import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/ventas
router.get('/', async (req, res) => {
  try {
    const sales = await prisma.venta.findMany({
      select: {
        id: true,
        docType: true,
        numDoc: true,
        payMethod: true,
        mixCash: true,
        mixDigital: true,
        payCode: true,
        total: true,
        status: true,
        createdAt: true,
        cliente: { select: { name: true, doc: true, type: true } },
        vendedor: { select: { name: true, role: true } },
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

    const formatted = sales.map(s => ({
      id: s.id,
      time: new Date(s.createdAt).toLocaleString('es-PE'),
      doc: s.docType === 'FACTURA' ? 'Factura' : (s.docType === 'BOLETA' ? 'Boleta' : 'Nota de Venta'),
      numDoc: s.numDoc,
      customer: s.cliente ? s.cliente.name : 'Público General',
      customerDoc: s.cliente ? s.cliente.doc : '00000000',
      seller: s.vendedor ? s.vendedor.name : 'General',
      method: s.payMethod,
      payCode: s.payCode,
      total: s.total,
      detalles: s.detalles,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener historial de ventas.' });
  }
});

// POST /api/ventas (Procesar Venta Atómica con Kardex & Validación de Límite de Crédito)
router.post('/', async (req, res) => {
  try {
    const { docType, payMethod, mixCash, mixDigital, payCode, clienteId, vendedorId, cart, usuarioCajaId } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: 'El carrito de venta no puede estar vacío.' });
    }

    const docTypeEnum = docType === 'Factura' ? 'FACTURA' : (docType === 'Boleta' ? 'BOLETA' : 'NOTA_VENTA');
    let payMethodEnum = 'EFECTIVO';
    if (payMethod === 'Tarjeta') payMethodEnum = 'TARJETA';
    if (payMethod === 'Yape/Plin') payMethodEnum = 'YAPE_PLIN';
    if (payMethod === 'Transferencia') payMethodEnum = 'TRANSFERENCIA';
    if (payMethod === 'Pago Mixto') payMethodEnum = 'PAGO_MIXTO';
    if (payMethod === 'Fiado') payMethodEnum = 'FIADO';

    // Transacción Atómica
    const ventaResult = await prisma.$transaction(async (tx) => {
      // 1. Calcular Correlativo y Número de Comprobante
      const serie = docTypeEnum === 'FACTURA' ? 'F001' : (docTypeEnum === 'BOLETA' ? 'B001' : 'T001');
      const salesCount = await tx.venta.count();
      const numDoc = `${serie}-${String(salesCount + 1).padStart(6, '0')}`;

      // 2. Verificar Stock y calcular total
      let totalVenta = 0;
      for (const item of cart) {
        const prod = await tx.producto.findUnique({ where: { id: item.id } });
        if (!prod || !prod.active) {
          throw new Error(`El producto ${item.name || item.id} no existe o no está activo.`);
        }
        if (prod.stock < item.qty) {
          throw new Error(`Stock insuficiente para ${prod.name}. Disponible: ${prod.stock}`);
        }
        totalVenta += prod.price * item.qty;
      }

      // 3. Validación de Límite de Crédito si el pago es al FIADO
      if (payMethodEnum === 'FIADO') {
        if (!clienteId) {
          throw new Error('Para ventas al FIADO debe seleccionar un cliente registrado.');
        }
        const cId = parseInt(clienteId);
        const clientObj = await tx.cliente.findUnique({
          where: { id: cId },
          include: { creditoCliente: true }
        });

        if (!clientObj) {
          throw new Error('El cliente seleccionado no existe.');
        }

        const currentDebt = clientObj.creditoCliente ? clientObj.creditoCliente.debtTotal : 0;
        const maxCred = clientObj.maxCredit || 1000.0;
        const availableCred = maxCred - currentDebt;

        if (totalVenta > availableCred) {
          throw new Error(`Crédito insuficiente para ${clientObj.name}. Límite: S/ ${maxCred.toFixed(2)}, Deuda Actual: S/ ${currentDebt.toFixed(2)}, Disponible: S/ ${availableCred.toFixed(2)}. Intentó fiar: S/ ${totalVenta.toFixed(2)}.`);
        }
      }

      // Verificar si hay una caja abierta para el usuario
      const cajaAbierta = await tx.cajaChica.findFirst({
        where: {
          usuarioId: Number(usuarioCajaId || vendedorId),
          estado: 'ABIERTA',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!cajaAbierta) {
        throw new Error('No hay una caja abierta para este usuario.');
      }

      // 4. Crear Venta
      const venta = await tx.venta.create({
        data: {
          docType: docTypeEnum,
          numDoc: numDoc,
          payMethod: payMethodEnum,
          mixCash: parseFloat(mixCash) || 0,
          mixDigital: parseFloat(mixDigital) || 0,
          payCode: payCode ? payCode.trim() : null,
          total: totalVenta,
          clienteId: clienteId ? parseInt(clienteId) : null,
          vendedorId: vendedorId ? parseInt(vendedorId) : null,
          cajaId: cajaAbierta.id,
        }
      });

      // Datos de la venta
      const efectivoVenta =
        payMethodEnum === 'EFECTIVO'
          ? totalVenta
          : payMethodEnum === 'PAGO_MIXTO'
            ? Number(mixCash) || 0
            : 0;

      const digitalVenta =
        ['TARJETA', 'YAPE_PLIN', 'TRANSFERENCIA'].includes(payMethodEnum)
          ? totalVenta
          : payMethodEnum === 'PAGO_MIXTO'
            ? Number(mixDigital) || 0
            : 0;

      if (payMethodEnum === 'PAGO_MIXTO') {
        if (Math.abs(efectivoVenta + digitalVenta - totalVenta) > 0.01) {
          throw new Error('El pago mixto no coincide con el total de la venta.');
        }
      }

      // 5. Crear DetalleVenta, Descontar Stock y Log Kardex por cada item
      for (const item of cart) {
        const itemSubtotal = item.price * item.qty;

        await tx.detalleVenta.create({
          data: {
            ventaId: venta.id,
            productoId: item.id,
            quantity: item.qty,
            unitPrice: item.price,
            subtotal: itemSubtotal,
          }
        });

        // Actualizar Stock
        const updatedProd = await tx.producto.update({
          where: { id: item.id },
          data: { stock: { decrement: item.qty } }
        });

        // Registro Kardex
        await tx.movimientoKardex.create({
          data: {
            productoId: item.id,
            type: 'SALIDA',
            qty: item.qty,
            stockAfter: updatedProd.stock,
            ref: `Venta ${numDoc}`,
          }
        });

        // Actualizar Caja con ventas acumuladas
        const usuarioCajaId = vendedorId ? parseInt(vendedorId) : null;

        if (!usuarioCajaId) {
          throw new Error('No se pudo identificar al usuario de caja.');
        }

        const cajaAbierta = await tx.cajaChica.findFirst({
          where: {
            usuarioId: usuarioCajaId,
            estado: 'ABIERTA',
          },
          orderBy: { createdAt: 'desc' },
        });

      }

      // 6. Si la venta es al FIADO, actualizar estado de cuenta del cliente
      if (payMethodEnum === 'FIADO' && clienteId) {
        const cId = parseInt(clienteId);
        
        let credito = await tx.creditoCliente.findUnique({ where: { clienteId: cId } });
        if (!credito) {
          credito = await tx.creditoCliente.create({
            data: { clienteId: cId, debtTotal: 0, maxCredit: 1000.0 }
          });
        }

        const resumenCompra = cart.map(i => `${i.qty}x ${i.name}`).join(', ');

        await tx.creditoCliente.update({
          where: { clienteId: cId },
          data: {
            debtTotal: { increment: totalVenta },
            lastPurchase: new Date(),
          }
        });

        await tx.abonoCredito.create({
          data: {
            creditoId: credito.id,
            amount: totalVenta,
            docRef: numDoc,
            desc: resumenCompra,
            type: 'CARGO',
          }
        });
      }

      return venta;
    });

    res.status(201).json({ success: true, venta: ventaResult });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'La venta ya fue procesada anteriormente (duplicado detectado).' });
    }
    res.status(400).json({ error: error.message || 'Error al procesar la venta.' });
  }
});

export default router;
