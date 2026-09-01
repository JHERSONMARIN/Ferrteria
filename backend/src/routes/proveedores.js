import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/proveedores
router.get('/', async (req, res) => {
  try {
    const list = await prisma.proveedor.findMany({
      orderBy: { id: 'desc' }
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar proveedores.' });
  }
});

// POST /api/proveedores
router.post('/', async (req, res) => {
  try {
    const { ruc, name, phone, address } = req.body;
    if (!ruc || !name) {
      return res.status(400).json({ error: 'RUC y Nombre de Proveedor requeridos.' });
    }

    const created = await prisma.proveedor.create({
      data: {
        ruc: ruc.trim(),
        name: name.trim(),
        phone: phone ? phone.trim() : null,
        address: address ? address.trim() : null,
      }
    });

    res.status(201).json(created);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'El proveedor con este RUC ya existe.' });
    }
    res.status(500).json({ error: 'Error al registrar proveedor.' });
  }
});

export default router;
