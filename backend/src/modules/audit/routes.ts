// Ruta HTTP de la auditoría (/api/auditoria), solo para el administrador.
import express from 'express';
import { AppError, errorBody } from '@ferresys/shared/errors';
import { prisma } from '../../db.ts';
import { listAuditLogs, type AuditQuery } from './audit.ts';
import type { Sendable } from '@ferresys/contracts/common';
import type { AuditPage } from '@ferresys/contracts/audit';

const router = express.Router();

// GET /api/auditoria?action=&userId=&from=AAAA-MM-DD&to=AAAA-MM-DD&page=
router.get('/', async (req, res) => {
  try {
    res.json(await listAuditLogs(prisma, req.query as AuditQuery) satisfies Sendable<AuditPage>);
  } catch (error) {
    if (error instanceof AppError) return res.status(error.status).json(errorBody(error));
    console.error('[auditoría] Error al consultar la auditoría:', error);
    res.status(500).json({ error: 'No se pudo consultar la auditoría.' });
  }
});

export default router;
