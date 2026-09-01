import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/creditos (Lista de clientes con deuda y límite de crédito)
router.get('/', async (req, res) => {
  try {
    const list = await prisma.creditoCliente.findMany({
      where: { debtTotal: { gt: 0 } },
      select: {
        id: true,
        debtTotal: true,
        maxCredit: true,
        lastPurchase: true,
        cliente: {
          select: {
            id: true,
            name: true,
            doc: true,
            phone: true,
            maxCredit: true,
          }
        },
        abonos: {
          select: {
            id: true,
            amount: true,
            docRef: true,
            desc: true,
            type: true,
            createdAt: true,
          },
          orderBy: { id: 'desc' }
        }
      },
      orderBy: { debtTotal: 'desc' }
    });

    const formatted = list.map(c => {
      const maxCred = c.cliente.maxCredit || c.maxCredit || 1000.0;
      const debt = c.debtTotal;
      const available = Math.max(0, maxCred - debt);

      return {
        id: c.id,
        clienteId: c.cliente.id,
        name: c.cliente.name,
        doc: c.cliente.doc,
        phone: c.cliente.phone,
        debt,
        maxCredit: maxCred,
        availableCredit: available,
        lastPurchase: new Date(c.lastPurchase).toLocaleString('es-PE'),
        abonos: c.abonos.map(a => ({
          id: a.id,
          date: new Date(a.createdAt).toLocaleString('es-PE'),
          type: a.type,
          amount: a.amount,
          docRef: a.docRef,
          desc: a.desc,
        }))
      };
    });

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener estado de créditos.' });
  }
});

// POST /api/creditos/abono (Registrar Abono o Saldar Deuda)
router.post('/abono', async (req, res) => {
  try {
    const { clienteId, amount } = req.body;
    const val = parseFloat(amount);

    if (!clienteId || isNaN(val) || val <= 0) {
      return res.status(400).json({ error: 'Cliente y monto válido requeridos.' });
    }

    const cId = parseInt(clienteId);

    const credito = await prisma.creditoCliente.findUnique({
      where: { clienteId: cId }
    });

    if (!credito || credito.debtTotal <= 0) {
      return res.status(400).json({ error: 'El cliente no tiene deudas pendientes.' });
    }

    if (val > credito.debtTotal) {
      return res.status(400).json({ error: 'El abono no puede superar la deuda pendiente actual.' });
    }

    const count = await prisma.abonoCredito.count();
    const docRef = `REC-${String(count + 1).padStart(6, '0')}`;

    await prisma.$transaction(async (tx) => {
      await tx.creditoCliente.update({
        where: { clienteId: cId },
        data: {
          debtTotal: { decrement: val }
        }
      });

      await tx.abonoCredito.create({
        data: {
          creditoId: credito.id,
          amount: val,
          docRef,
          desc: `Abono de cliente en caja (Recibo: ${docRef})`,
          type: 'ABONO',
        }
      });
    });

    res.json({ success: true, docRef });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar abono.' });
  }
});

export default router;
