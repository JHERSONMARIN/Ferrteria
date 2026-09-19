import express from 'express';
import { prisma } from '../db.js';
import { createTransfer, listTransfers, TransferError } from '../services/transfers.js';
import { BranchError } from '../services/branches.js';
import { StockError } from '../services/stock.js';

const router = express.Router();

const handle = (context, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof TransferError || error instanceof BranchError || error instanceof StockError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(`[transferencias.js] ${context}:`, error);
    res.status(500).json({ error: `No se pudo ${context}.` });
  }
};

// GET /api/transferencias?branchId=
router.get('/', handle('listar las transferencias', async (req, res) => {
  res.json(await listTransfers(prisma, req.query));
}));

// POST /api/transferencias { fromBranchId?, toBranchId, items: [{ id, qty }], notes }
router.post('/', handle('registrar la transferencia', async (req, res) => {
  res.status(201).json(await createTransfer(prisma, req.body, req.user));
}));

export default router;
