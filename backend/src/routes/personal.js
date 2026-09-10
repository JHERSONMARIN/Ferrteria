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

// PUT /api/personal/:id
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID de usuario inválido.' });
    }

    const { name, user, pass, role, modules, active } = req.body;

    if (!name || !user) {
      return res.status(400).json({ error: 'El nombre y el usuario son obligatorios.' });
    }

    const current = await prisma.usuario.findUnique({ where: { id } });
    if (!current) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Verificar si el nuevo username ya lo tiene otro usuario
    const cleanUser = user.trim();
    if (cleanUser.toLowerCase() !== current.user.toLowerCase()) {
      const existing = await prisma.usuario.findUnique({ where: { user: cleanUser } });
      if (existing && existing.id !== id) {
        return res.status(400).json({ error: 'El nombre de usuario ya está siendo usado por otro empleado.' });
      }
    }

    const updateData = {
      name: name.trim(),
      user: cleanUser,
      role: role || current.role,
      modules: Array.isArray(modules) ? modules : current.modules,
    };

    if (typeof active === 'boolean') {
      if (id === 1 && !active) {
        return res.status(400).json({ error: 'No se puede desactivar al Administrador principal del sistema.' });
      }
      updateData.active = active;
    }

    // Si pasaron una nueva contraseña no vacía
    if (pass && pass.trim().length > 0) {
      if (pass.trim().length < 4) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
      }
      updateData.pass = pass.trim();
    }

    const updated = await prisma.usuario.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        user: true,
        role: true,
        modules: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error al actualizar usuario en la base de datos.' });
  }
});

// DELETE /api/personal/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID de usuario inválido.' });
    }
    if (id === 1) {
      return res.status(400).json({ error: 'No se puede eliminar el usuario administrador principal del sistema.' });
    }

    await prisma.usuario.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'No se puede eliminar el usuario porque tiene ventas o movimientos vinculados. En su lugar, desactívelo desde Editar.'
      });
    }
    res.status(500).json({ error: 'Error al eliminar usuario.' });
  }
});

export default router;
