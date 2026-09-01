import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { user, pass } = req.body;
    if (!user || !pass) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { user: user.trim() },
      select: {
        id: true,
        name: true,
        user: true,
        pass: true,
        role: true,
        modules: true,
        active: true,
      }
    });

    if (!usuario || usuario.pass !== pass.trim() || !usuario.active) {
      return res.status(401).json({ error: 'Credenciales incorrectas o usuario inactivo.' });
    }

    // No devolvemos el hash o password plano en respuesta completa
    const { pass: _, ...userData } = usuario;
    res.json({ success: true, user: userData });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno de servidor en autenticación.' });
  }
});

// GET /api/usuarios/check/:id (Heartbeat de sesión)
router.get('/check/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        user: true,
        role: true,
        modules: true,
        active: true,
      }
    });

    if (!usuario || !usuario.active) {
      return res.status(401).json({ active: false, error: 'Usuario desactivado o no encontrado.' });
    }

    res.json({ active: true, user: usuario });
  } catch (error) {
    res.status(500).json({ active: false, error: error.message });
  }
});

export default router;
