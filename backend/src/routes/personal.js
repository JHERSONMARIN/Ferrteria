import express from 'express';
import { prisma } from '../db.js';
import { hashPassword, validateNewPassword, PasswordPolicyError } from '../services/passwords.js';
import { recordAudit, changedFields } from '../services/audit.js';

// Sucursal asignada: debe existir y estar activa. Sin valor, se usa la del administrador que crea.
async function parseBranch(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const branchId = parseInt(value, 10);
  const branch = Number.isNaN(branchId) ? null : await prisma.branch.findUnique({ where: { id: branchId }, select: { active: true } });
  if (!branch || !branch.active) return null;
  return branchId;
}

const router = express.Router();

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
        branchId: true,
        branch: { select: { id: true, name: true } },
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

    validateNewPassword(pass);

    const existing = await prisma.usuario.findUnique({ where: { user: user.trim() } });
    if (existing) {
      return res.status(400).json({ error: 'El nombre de usuario ya existe. Elija otro.' });
    }

    const branchId = await parseBranch(req.body.branchId, req.user.branchId);
    if (branchId === null) return res.status(400).json({ error: 'La sucursal elegida no existe o está desactivada.' });

    const passwordHash = await hashPassword(pass);
    const created = await prisma.$transaction(async (tx) => {
      const newUser = await tx.usuario.create({
        data: {
          name: name.trim(),
          user: user.trim(),
          pass: passwordHash,
          // La clave la define el administrador: el empleado debe cambiarla al ingresar.
          mustChangePassword: true,
          role: role || 'VENDEDOR',
          modules: modules || ['pos'],
          active: true,
          branchId,
        },
        select: {
          id: true,
          name: true,
          user: true,
          role: true,
          modules: true,
          active: true,
          branchId: true,
        }
      });
      await recordAudit(tx, {
        action: 'USER_CREATED',
        entity: 'Usuario',
        entityId: newUser.id,
        summary: `Usuario ${newUser.user} (${newUser.name}) creado como ${newUser.role}`,
        details: { user: newUser.user, role: newUser.role, modules: newUser.modules, branchId: newUser.branchId },
        user: req.user,
      });
      return newUser;
    });

    res.status(201).json(created);
  } catch (error) {
    if (error instanceof PasswordPolicyError) {
      return res.status(400).json({ error: error.message });
    }
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

    if (req.body.branchId !== undefined && req.body.branchId !== '') {
      const branchId = await parseBranch(req.body.branchId, current.branchId);
      if (branchId === null) return res.status(400).json({ error: 'La sucursal elegida no existe o está desactivada.' });
      if (branchId !== current.branchId) {
        // Lo que cobre iría a una caja de la otra sucursal: primero debe salir de su turno.
        const inShift = await prisma.cashSessionMember.count({ where: { userId: id, leftAt: null, session: { estado: 'ABIERTA' } } });
        if (inShift > 0) return res.status(409).json({ error: 'Está en un turno de caja abierto: debe cerrarlo o salir antes de cambiar de sucursal.' });
      }
      updateData.branchId = branchId;
    }

    if (typeof active === 'boolean') {
      if (id === 1 && !active) {
        return res.status(400).json({ error: 'No se puede desactivar al Administrador principal del sistema.' });
      }
      updateData.active = active;
    }

    // Si pasaron una nueva contraseña no vacía
    if (pass && pass.trim().length > 0) {
      try {
        validateNewPassword(pass);
      } catch (policyError) {
        return res.status(400).json({ error: policyError.message });
      }
      updateData.pass = await hashPassword(pass);
      // Si un administrador restablece la clave de otro usuario, esta queda como temporal.
      updateData.mustChangePassword = id !== req.user.id;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.usuario.update({
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
          branchId: true,
        }
      });
      // La contraseña nunca se guarda en la auditoría: solo que se cambió.
      const changes = changedFields(current, saved, ['name', 'user', 'role', 'modules', 'active', 'branchId']) || {};
      if (updateData.pass) changes.password = { before: null, after: 'restablecida' };
      if (Object.keys(changes).length > 0) {
        await recordAudit(tx, {
          action: 'USER_UPDATED',
          entity: 'Usuario',
          entityId: id,
          summary: `Usuario ${saved.user}: ${Object.keys(changes).join(', ')}`,
          details: changes,
          user: req.user,
        });
      }
      return saved;
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

    const target = await prisma.usuario.findUnique({ where: { id }, select: { user: true, name: true, role: true } });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' });

    await prisma.$transaction(async (tx) => {
      // La auditoría se escribe antes de borrar: su usuario queda en null pero conserva el nombre.
      await recordAudit(tx, {
        action: 'USER_DELETED',
        entity: 'Usuario',
        entityId: id,
        summary: `Usuario ${target.user} (${target.name}) eliminado`,
        details: target,
        user: req.user,
      });
      await tx.usuario.delete({ where: { id } });
    });
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
