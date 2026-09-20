import express from 'express';
import { prisma } from '../db.js';
import { listAuditLogs, AuditQueryError } from '../services/audit.js';
import { respondIfLicenseError } from '../services/license.js';

const router = express.Router();

// GET /api/auditoria?action=&userId=&from=AAAA-MM-DD&to=AAAA-MM-DD&page=
router.get('/', async (req, res) => {
  try {
    res.json(await listAuditLogs(prisma, req.query));
  } catch (error) {
    if (respondIfLicenseError(res, error)) return;
    if (error instanceof AuditQueryError) return res.status(400).json({ error: error.message });
    console.error('[auditoria.js] Error al consultar la auditoría:', error);
    res.status(500).json({ error: 'No se pudo consultar la auditoría.' });
  }
});

export default router;
