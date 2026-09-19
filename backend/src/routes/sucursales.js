import express from 'express';
import { prisma } from '../db.js';
import { listBranches, createBranch, updateBranch, BranchError } from '../services/branches.js';

const router = express.Router();

const handle = (context, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof BranchError) return res.status(error.status).json({ error: error.message });
    console.error(`[sucursales.js] ${context}:`, error);
    res.status(500).json({ error: `No se pudo ${context}.` });
  }
};

// GET /api/sucursales (activas; ?todas=1 incluye las desactivadas, solo para el administrador)
router.get('/', handle('listar las sucursales', async (req, res) => {
  const includeInactive = req.query.todas === '1' && req.user.role === 'ADMINISTRADOR';
  res.json(await listBranches(prisma, { includeInactive }));
}));

// POST /api/sucursales { name, address }
router.post('/', handle('crear la sucursal', async (req, res) => {
  res.status(201).json(await createBranch(prisma, req.body));
}));

// PUT /api/sucursales/:id { name?, address?, active? }
router.put('/:id', handle('actualizar la sucursal', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new BranchError('Sucursal no válida.');
  res.json(await updateBranch(prisma, id, req.body));
}));

export default router;
