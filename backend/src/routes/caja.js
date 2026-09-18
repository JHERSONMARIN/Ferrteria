import express from 'express';
import { prisma } from '../db.js';
import {
  CashError, getCashStatus, openSession, joinSession, leaveSession, closeSession,
  listRegisters, createRegister, updateRegister,
} from '../services/cashRegisters.js';

const router = express.Router();

const handle = (context, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof CashError) return res.status(error.status).json({ error: error.message });
    console.error(`[caja.js] ${context}:`, error);
    res.status(500).json({ error: `Error al ${context}.` });
  }
};

const parseId = (value) => {
  const id = parseInt(value, 10);
  if (Number.isNaN(id)) throw new CashError('Identificador no válido.');
  return id;
};

const requireAdmin = (req) => {
  if (req.user.role !== 'ADMINISTRADOR') throw new CashError('Solo el administrador gestiona las cajas.', 403);
};

// GET /api/caja/estado-actual: turno del usuario o, si no tiene, cajas para abrir o unirse.
router.get('/estado-actual', handle('obtener el estado de caja', async (req, res) => {
  res.json(await getCashStatus(prisma, req.user));
}));

// POST /api/caja/apertura { cashRegisterId, montoInicial }
router.post('/apertura', handle('abrir la caja', async (req, res) => {
  const caja = await openSession(prisma, req.body, req.user);
  res.status(201).json({ success: true, caja });
}));

// POST /api/caja/turnos/:id/unirse
router.post('/turnos/:id/unirse', handle('unirse al turno', async (req, res) => {
  await joinSession(prisma, parseId(req.params.id), req.user);
  res.json({ success: true });
}));

// POST /api/caja/turnos/:id/salir
router.post('/turnos/:id/salir', handle('salir del turno', async (req, res) => {
  await leaveSession(prisma, parseId(req.params.id), req.user);
  res.json({ success: true });
}));

// POST /api/caja/cierre { cajaId, montoCierreConteo }
router.post('/cierre', handle('cerrar la caja', async (req, res) => {
  const result = await closeSession(prisma, { sessionId: parseId(req.body.cajaId), montoCierreConteo: req.body.montoCierreConteo }, req.user);
  res.json({ success: true, ...result });
}));

// Administración de cajas físicas (solo administrador).
router.get('/registros', handle('listar las cajas', async (req, res) => {
  requireAdmin(req);
  res.json(await listRegisters(prisma));
}));

router.post('/registros', handle('crear la caja', async (req, res) => {
  requireAdmin(req);
  res.status(201).json(await createRegister(prisma, req.body));
}));

router.put('/registros/:id', handle('actualizar la caja', async (req, res) => {
  requireAdmin(req);
  res.json(await updateRegister(prisma, parseId(req.params.id), req.body));
}));

export default router;
