import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/personal
router.get('/', async (req, res) => {
  try {
    const list = await prisma.usuario.findMany({
      select: {
        id: true,
        name: true,
        user: true,
        role: true,
        modules: true,
        active: true,
        createdAt: true,
      },
      orderBy: { id: 'desc' }
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar personal.' });
  }
});

// POST /api/personal
router.post('/', async (req, res) => {
  try {
    const { name, user, pass, role, modules } = req.body;
    if (!name || !user || !pass) {
      return res.status(400).json({ error: 'Nombre, usuario y contraseña son obligatorios.' });
    }

    const existing = await prisma.usuario.findUnique({ where: { user: user.trim() } });
    if (existing) {
      return res.status(400).json({ error: 'El nombre de usuario ya existe. Elija otro.' });
    }

    const created = await prisma.usuario.create({
      data: {
        name: name.trim(),
        user: user.trim(),
        pass: pass.trim(),
        role: role || 'VENDEDOR',
        modules: modules || ['pos'],
        active: true,
      },
      select: {
        id: true,
        name: true,
        user: true,
        role: true,
        modules: true,
        active: true,
      }
    });

    res.status(201).json(created);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'El usuario ya se encuentra registrado.' });
    }
    res.status(500).json({ error: 'Error al guardar personal.' });
  }
});

// DELETE /api/personal/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.usuario.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar usuario.' });
  }
});

export default router;
