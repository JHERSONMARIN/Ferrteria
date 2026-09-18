import express from 'express';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';
import { createSessionToken } from '../services/sessionTokens.js';
import { secondsBlocked, registerFailure, registerSuccess } from '../services/loginThrottle.js';
import { authenticate, setSessionCookie, clearSessionCookie } from '../middleware/authenticate.js';

const router = express.Router();

// Si el usuario no existe se verifica igual contra este hash, para que el tiempo de respuesta
// no delate qué nombres de usuario existen.
const DUMMY_HASH = await hashPassword('ferresys-usuario-inexistente');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { user, pass } = req.body;
    if (!user || !pass) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
    }

    const blockedFor = secondsBlocked(user.trim(), req.ip);
    if (blockedFor > 0) {
      return res.status(429).json({
        error: `Demasiados intentos fallidos. Intente nuevamente en ${Math.ceil(blockedFor / 60)} minuto(s).`,
        codigo: 'DEMASIADOS_INTENTOS',
      });
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

    const validPassword = await verifyPassword(String(pass), usuario ? usuario.pass : DUMMY_HASH);
    if (!usuario || !validPassword || !usuario.active) {
      registerFailure(user.trim(), req.ip);
      return res.status(401).json({ error: 'Credenciales incorrectas o usuario inactivo.' });
    }

    registerSuccess(user.trim(), req.ip);
    setSessionCookie(res, createSessionToken(usuario));
    const { pass: _, ...userData } = usuario;
    res.json({ success: true, user: userData });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno de servidor en autenticación.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

// GET /api/auth/me: usuario de la sesión actual (también sirve de latido para detectar cambios)
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
