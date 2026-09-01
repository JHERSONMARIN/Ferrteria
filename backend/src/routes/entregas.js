import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/entregas (Optimizado para polling continuo <15ms)
router.get('/', async (req, res) => {
  try {
    const list = await prisma.entrega.findMany({
      select: {
        id: true,
        ref: true,
        address: true,
        status: true,
        createdAt: true,
        cliente: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
          }
        },
        repartidor: {
          select: {
            id: true,
            name: true,
            role: true,
          }
        },
        detalles: {
          select: {
            quantity: true,
            producto: {
              select: {
                name: true,
              }
            }
          }
        }
      },
      orderBy: { id: 'desc' }
    });

    const formatted = list.map(d => ({
      id: d.id,
      ref: d.ref,
      client: d.cliente.name,
      phone: d.cliente.phone,
      seller: d.repartidor ? d.repartidor.name : 'Sin asignar',
      address: d.address || d.cliente.address || 'Sin dirección',
      date: new Date(d.createdAt).toLocaleString('es-PE'),
      status: d.status === 'ENTREGADO' ? 'Entregado' : (d.status === 'CANCELADO' ? 'Cancelado' : 'Pendiente'),
      items: d.detalles.map(dt => `${dt.quantity}x ${dt.producto.name}`).join(', '),
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar entregas.' });
  }
});

// POST /api/entregas
router.post('/', async (req, res) => {
  try {
    const { clienteId, repartidorId, address, items } = req.body;

    if (!clienteId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cliente y al menos un producto requeridos.' });
    }

    const entregaResult = await prisma.$transaction(async (tx) => {
      const count = await tx.entrega.count();
      const refCode = `ENT-${String(count + 1).padStart(4, '0')}`;

      // Descontar stock y registrar Kardex por entrega
      for (const item of items) {
        const prod = await tx.producto.findUnique({ where: { id: item.id } });
        if (!prod || prod.stock < item.qty) {
          throw new Error(`Stock insuficiente para el producto ${item.name || item.id}`);
        }
      }

      const entrega = await tx.entrega.create({
        data: {
          ref: refCode,
          clienteId: parseInt(clienteId),
          repartidorId: repartidorId ? parseInt(repartidorId) : null,
          address: address ? address.trim() : '',
          status: 'PENDIENTE',
        }
      });

      for (const item of items) {
        await tx.detalleEntrega.create({
          data: {
            entregaId: entrega.id,
            productoId: item.id,
            quantity: item.qty,
          }
        });

        // Actualizar Stock
        const updatedProd = await tx.producto.update({
          where: { id: item.id },
          data: { stock: { decrement: item.qty } }
        });

        // Registrar Kardex
        await tx.movimientoKardex.create({
          data: {
            productoId: item.id,
            type: 'SALIDA',
            qty: item.qty,
            stockAfter: updatedProd.stock,
            ref: `Orden de Entrega ${refCode}`,
          }
        });
      }

      return entrega;
    });

    res.status(201).json({ success: true, entrega: entregaResult });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al programar entrega.' });
  }
});

// PATCH /api/entregas/:id/estado
router.patch('/:id/estado', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    const updated = await prisma.entrega.update({
      where: { id },
      data: {
        status: status === 'Entregado' || status === 'ENTREGADO' ? 'ENTREGADO' : 'PENDIENTE'
      }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error al cambiar estado de entrega.' });
  }
});

export default router;
