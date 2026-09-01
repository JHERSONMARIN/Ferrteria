import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/caja/estado-actual?usuarioId=1
router.get('/estado-actual', async (req, res) => {
  try {
    const { usuarioId } = req.query;
    if (!usuarioId) {
      return res.status(400).json({ error: 'usuarioId requerido.' });
    }

    const uId = parseInt(usuarioId);

    // Buscar caja abierta para este usuario
    const cajaAbierta = await prisma.cajaChica.findFirst({
      where: { usuarioId: uId, estado: 'ABIERTA' },
      include: {
        ventas: {
          select: { total: true, payMethod: true, mixCash: true, mixDigital: true }
        }
      }
    });

    if (!cajaAbierta) {
      return res.json({ abierta: false, caja: null });
    }

    // Calcular ventas acumuladas del turno
    let ventasEfectivo = 0;
    let ventasDigital = 0;

    cajaAbierta.ventas.forEach(v => {
      if (v.payMethod === 'EFECTIVO') ventasEfectivo += v.total;
      else if (v.payMethod === 'PAGO_MIXTO') {
        ventasEfectivo += v.mixCash || 0;
        ventasDigital += v.mixDigital || 0;
      } else if (v.payMethod !== 'FIADO') {
        ventasDigital += v.total;
      }
    });

    const saldoTeoricoEfectivo = cajaAbierta.montoInicial + ventasEfectivo;

    res.json({
      abierta: true,
      caja: {
        id: cajaAbierta.id,
        montoInicial: cajaAbierta.montoInicial,
        ventasEfectivo,
        ventasDigital,
        saldoTeoricoEfectivo,
        createdAt: new Date(cajaAbierta.createdAt).toLocaleString('es-PE'),
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener estado de caja.' });
  }
});

// POST /api/caja/apertura
router.post('/apertura', async (req, res) => {
  try {
    const { usuarioId, montoInicial } = req.body;
    const monto = parseFloat(montoInicial) || 0;

    if (!usuarioId) return res.status(400).json({ error: 'Usuario requerido.' });

    const uId = parseInt(usuarioId);

    // Verificar que no tenga ya una caja abierta
    const existente = await prisma.cajaChica.findFirst({
      where: { usuarioId: uId, estado: 'ABIERTA' }
    });

    if (existente) {
      return res.status(400).json({ error: 'Ya tienes una caja abierta para este turno.' });
    }

    const nuevaCaja = await prisma.cajaChica.create({
      data: {
        usuarioId: uId,
        montoInicial: monto,
        estado: 'ABIERTA',
      }
    });

    res.status(201).json({ success: true, caja: nuevaCaja });
  } catch (error) {
    res.status(500).json({ error: 'Error al abrir caja.' });
  }
});

// POST /api/caja/cierre
router.post('/cierre', async (req, res) => {
  try {
    const { cajaId, montoCierreConteo } = req.body;
    const conteo = parseFloat(montoCierreConteo) || 0;

    if (!cajaId) return res.status(400).json({ error: 'cajaId requerido.' });

    const cId = parseInt(cajaId);

    const caja = await prisma.cajaChica.findUnique({
      where: { id: cId },
      include: {
        ventas: { select: { total: true, payMethod: true, mixCash: true, mixDigital: true } }
      }
    });

    if (!caja || caja.estado === 'CERRADA') {
      return res.status(400).json({ error: 'La caja especificada no existe o ya está cerrada.' });
    }

    let ventasEfectivo = 0;
    let ventasDigital = 0;

    caja.ventas.forEach(v => {
      if (v.payMethod === 'EFECTIVO') ventasEfectivo += v.total;
      else if (v.payMethod === 'PAGO_MIXTO') {
        ventasEfectivo += v.mixCash || 0;
        ventasDigital += v.mixDigital || 0;
      } else if (v.payMethod !== 'FIADO') {
        ventasDigital += v.total;
      }
    });

    const saldoTeorico = caja.montoInicial + ventasEfectivo;
    const diferencia = conteo - saldoTeorico;

    const cajaCerrada = await prisma.cajaChica.update({
      where: { id: cId },
      data: {
        ventasEfectivo,
        ventasDigital,
        montoCierreConteo: conteo,
        diferencia,
        estado: 'CERRADA',
        closedAt: new Date(),
      }
    });

    res.json({ success: true, caja: cajaCerrada, saldoTeorico, diferencia });
  } catch (error) {
    res.status(500).json({ error: 'Error al cerrar caja.' });
  }
});

export default router;
