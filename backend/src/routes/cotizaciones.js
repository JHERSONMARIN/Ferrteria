import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/cotizaciones
router.get('/', async (req, res) => {
  try {
    const cotizaciones = await prisma.cotizacion.findMany({
      select: {
        id: true,
        numDoc: true,
        total: true,
        validDays: true,
        status: true,
        createdAt: true,
        cliente: { select: { id: true, name: true, doc: true, phone: true } },
        vendedor: { select: { name: true } },
        detalles: {
          select: {
            quantity: true,
            unitPrice: true,
            subtotal: true,
            producto: { select: { id: true, name: true, code: true, price: true, stock: true } }
          }
        }
      },
      orderBy: { id: 'desc' }
    });

    const formatted = cotizaciones.map(c => ({
      id: c.id,
      numDoc: c.numDoc,
      total: c.total,
      validDays: c.validDays,
      status: c.status,
      date: new Date(c.createdAt).toLocaleString('es-PE'),
      customer: c.cliente ? c.cliente.name : 'Público General',
      customerDoc: c.cliente ? c.cliente.doc : '00000000',
      clienteId: c.clienteId,
      seller: c.vendedor ? c.vendedor.name : 'General',
      detalles: c.detalles,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar cotizaciones.' });
  }
});

// POST /api/cotizaciones (Generar nueva Cotización / Proforma)
router.post('/', async (req, res) => {
  try {
    const { clienteId, vendedorId, validDays, cart } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: 'El carrito de la cotización no puede estar vacío.' });
    }

    const count = await prisma.cotizacion.count();
    const numDoc = `COT-${String(count + 1).padStart(6, '0')}`;

    let total = 0;
    cart.forEach(item => {
      total += (parseFloat(item.price) || 0) * (parseInt(item.qty) || 0);
    });

    const cotizacion = await prisma.cotizacion.create({
      data: {
        numDoc,
        total,
        validDays: parseInt(validDays) || 7,
        clienteId: clienteId ? parseInt(clienteId) : null,
        vendedorId: vendedorId ? parseInt(vendedorId) : null,
        detalles: {
          create: cart.map(item => ({
            productoId: parseInt(item.id),
            quantity: parseInt(item.qty),
            unitPrice: parseFloat(item.price),
            subtotal: parseFloat(item.price) * parseInt(item.qty),
          }))
        }
      },
      include: {
        cliente: true,
        detalles: { include: { producto: true } }
      }
    });

    res.status(201).json({ success: true, cotizacion });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error al generar la cotización.' });
  }
});

// POST /api/cotizaciones/:id/convertir (Convertir Cotización a Venta Real)
router.post('/:id/convertir', async (req, res) => {
  try {
    const cotId = parseInt(req.params.id);
    const { docType, payMethod, mixCash, mixDigital, payCode } = req.body;

    const cot = await prisma.cotizacion.findUnique({
      where: { id: cotId },
      include: { detalles: { include: { producto: true } }, cliente: true }
    });

    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada.' });
    if (cot.status === 'CONVERTIDO') {
      return res.status(400).json({ error: 'Esta cotización ya fue convertida a venta previamente.' });
    }

    const cart = cot.detalles.map(d => ({
      id: d.productoId,
      name: d.producto.name,
      qty: d.quantity,
      price: d.unitPrice,
    }));

    // Reutilizar lógica de venta atómica enviando al endpoint interno o ejecutando la transacción
    const docTypeEnum = docType === 'Factura' ? 'FACTURA' : (docType === 'Boleta' ? 'BOLETA' : 'NOTA_VENTA');
    let payMethodEnum = 'EFECTIVO';
    if (payMethod === 'Tarjeta') payMethodEnum = 'TARJETA';
    if (payMethod === 'Yape/Plin') payMethodEnum = 'YAPE_PLIN';
    if (payMethod === 'Transferencia') payMethodEnum = 'TRANSFERENCIA';
    if (payMethod === 'Pago Mixto') payMethodEnum = 'PAGO_MIXTO';
    if (payMethod === 'Fiado') payMethodEnum = 'FIADO';

    const ventaResult = await prisma.$transaction(async (tx) => {
      // 1. Verificar stock
      for (const item of cart) {
        const prod = await tx.producto.findUnique({ where: { id: item.id } });
        if (!prod || prod.stock < item.qty) {
          throw new Error(`Stock insuficiente para ${item.name} al convertir cotización. Stock actual: ${prod ? prod.stock : 0}`);
        }
      }

      // 2. Correlativo
      const serie = docTypeEnum === 'FACTURA' ? 'F001' : (docTypeEnum === 'BOLETA' ? 'B001' : 'T001');
      const salesCount = await tx.venta.count();
      const numDoc = `${serie}-${String(salesCount + 1).padStart(6, '0')}`;

      // 3. Crear Venta
      const venta = await tx.venta.create({
        data: {
          docType: docTypeEnum,
          numDoc: numDoc,
          payMethod: payMethodEnum,
          mixCash: parseFloat(mixCash) || 0,
          mixDigital: parseFloat(mixDigital) || 0,
          payCode: payCode ? payCode.trim() : null,
          total: cot.total,
          clienteId: cot.clienteId,
          vendedorId: cot.vendedorId,
        }
      });

      // 4. Detalle, Stock y Kardex
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

        const updatedProd = await tx.producto.update({
          where: { id: item.id },
          data: { stock: { decrement: item.qty } }
        });

        await tx.movimientoKardex.create({
          data: {
            productoId: item.id,
            type: 'SALIDA',
            qty: item.qty,
            stockAfter: updatedProd.stock,
            ref: `Venta por Cotización ${cot.numDoc}`,
          }
        });
      }

      // 5. Marcar Cotización como CONVERTIDA
      await tx.cotizacion.update({
        where: { id: cotId },
        data: { status: 'CONVERTIDO' }
      });

      return venta;
    });

    res.json({ success: true, venta: ventaResult });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al convertir cotización.' });
  }
});

export default router;
