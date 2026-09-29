// Rutas HTTP de caja (/api/caja): validan la entrada y llaman a los casos de uso.
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { errorBody } from '@ferresys/shared/errors';
import { prisma } from '../../../db.ts';
import { id, optionalId, parseInput } from '../../../lib/validation.ts';
import { respondIfLicenseError } from '../../licensing/index.ts';
import { CashError } from '../domain/cash.ts';
import * as cash from '../application/cashService.ts';

const router = express.Router();

// Los montos los valida el dominio (con su mensaje); aquí se revisa la forma de lo demás.
const OpenBody = z.object({ cashRegisterId: optionalId('Caja no válida.'), montoInicial: z.unknown() });
const CloseBody = z.object({ cajaId: id('Identificador no válido.'), montoCierreConteo: z.unknown() });
const RegisterBody = z.object({ name: z.unknown(), branchId: optionalId('Sucursal no válida.') });
const RegisterUpdate = z.object({
  name: z.unknown().optional(),
  branchId: optionalId('Sucursal no válida.'),
  active: z.boolean({ error: 'Estado no válido.' }).optional(),
});
const Params = z.object({ id: id('Identificador no válido.') });

const cashError = (message: string) => new CashError(message);
const body = <S extends z.ZodType>(schema: S, req: Request) => parseInput(schema, req.body, cashError);
const paramId = (req: Request) => parseInput(Params, req.params, cashError).id;

type Handler = (req: Request, res: Response) => Promise<unknown>;

const handle = (context: string, fn: Handler) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (respondIfLicenseError(res, error)) return;
    if (error instanceof CashError) return res.status(error.status).json(errorBody(error));
    console.error(`[caja] ${context}:`, error);
    res.status(500).json({ error: `Error al ${context}.` });
  }
};

const requireAdmin = (req: Request) => {
  if (req.user.role !== 'ADMINISTRADOR') throw new CashError('Solo el administrador gestiona las cajas.', 403);
};

// GET /api/caja/estado-actual: turno del usuario o, si no tiene, cajas para abrir o unirse.
router.get('/estado-actual', handle('obtener el estado de caja', async (req, res) => {
  res.json(await cash.getCashStatus(prisma, req.user));
}));

// POST /api/caja/apertura { cashRegisterId, montoInicial }
router.post('/apertura', handle('abrir la caja', async (req, res) => {
  const caja = await cash.openSession(prisma, body(OpenBody, req), req.user);
  res.status(201).json({ success: true, caja });
}));

// POST /api/caja/turnos/:id/unirse
router.post('/turnos/:id/unirse', handle('unirse al turno', async (req, res) => {
  await cash.joinSession(prisma, paramId(req), req.user);
  res.json({ success: true });
}));

// POST /api/caja/turnos/:id/salir
router.post('/turnos/:id/salir', handle('salir del turno', async (req, res) => {
  await cash.leaveSession(prisma, paramId(req), req.user);
  res.json({ success: true });
}));

// POST /api/caja/cierre { cajaId, montoCierreConteo }
router.post('/cierre', handle('cerrar la caja', async (req, res) => {
  const { cajaId, montoCierreConteo } = body(CloseBody, req);
  const result = await cash.closeSession(prisma, { sessionId: cajaId, montoCierreConteo }, req.user);
  res.json({ success: true, ...result });
}));

// Administración de cajas físicas (solo administrador).
router.get('/registros', handle('listar las cajas', async (req, res) => {
  requireAdmin(req);
  res.json(await cash.listRegisters(prisma));
}));

router.post('/registros', handle('crear la caja', async (req, res) => {
  requireAdmin(req);
  res.status(201).json(await cash.createRegister(prisma, body(RegisterBody, req), req.user));
}));

router.put('/registros/:id', handle('actualizar la caja', async (req, res) => {
  requireAdmin(req);
  res.json(await cash.updateRegister(prisma, paramId(req), body(RegisterUpdate, req)));
}));

export default router;
