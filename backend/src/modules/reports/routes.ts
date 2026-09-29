// Rutas HTTP del panel y los reportes (/api/dashboard).
import express, { type Request, type Response } from 'express';
import { AppError, errorBody } from '@ferresys/shared/errors';
import { prisma } from '../../db.ts';
import { dashboardStats, salesReport } from './reports.ts';

const router = express.Router();

const handle = (failure: string, fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof AppError) return res.status(error.status).json(errorBody(error));
    console.error(`[reportes] ${failure}`, error);
    res.status(500).json({ error: failure });
  }
};

// GET /api/dashboard/stats
router.get('/stats', handle('Error al obtener datos de dashboard.', async (req, res) => {
  res.json(await dashboardStats(prisma));
}));

// GET /api/dashboard/reportes?from=AAAA-MM-DD&to=AAAA-MM-DD&branchId= (por defecto, los últimos 30 días)
router.get('/reportes', handle('No se pudieron generar los reportes.', async (req, res) => {
  res.json(await salesReport(prisma, req.query as { from?: string; to?: string; branchId?: string }));
}));

export default router;
