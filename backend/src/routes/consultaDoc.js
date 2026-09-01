import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/clientes/consulta-doc/:doc
router.get('/consulta-doc/:doc', async (req, res) => {
  try {
    const doc = req.params.doc.trim();

    // 1. Buscar primero en base de datos local
    const client = await prisma.cliente.findUnique({
      where: { doc },
      select: { type: true, doc: true, name: true, phone: true, email: true, address: true }
    });

    if (client) {
      return res.json({ foundInDb: true, client });
    }

    // 2. Si es DNI (8 dígitos) o RUC (11 dígitos), hacer consulta inteligente
    if (doc.length === 8) {
      // Intentar API pública o formateo automático DNI
      try {
        const apiRes = await fetch(`https://api.apis.net.pe/v1/dni?numero=${doc}`);
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (data && data.nombre) {
            return res.json({
              foundInDb: false,
              client: {
                type: 'NATURAL',
                doc,
                name: data.nombre,
                address: data.direccion || '',
              }
            });
          }
        }
      } catch (e) {
        // Fallback
      }

      return res.json({
        foundInDb: false,
        client: { type: 'NATURAL', doc, name: `Persona DNI ${doc}`, address: '' }
      });
    }

    if (doc.length === 11) {
      try {
        const apiRes = await fetch(`https://api.apis.net.pe/v1/ruc?numero=${doc}`);
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (data && data.nombre) {
            return res.json({
              foundInDb: false,
              client: {
                type: 'EMPRESA',
                doc,
                name: data.nombre,
                address: data.direccion || '',
              }
            });
          }
        }
      } catch (e) {
        // Fallback
      }

      return res.json({
        foundInDb: false,
        client: { type: 'EMPRESA', doc, name: `EMPRESA RUC ${doc}`, address: 'Av. Industrial Cajamarca' }
      });
    }

    res.status(404).json({ error: 'Documento no válido (debe tener 8 u 11 dígitos).' });
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar documento.' });
  }
});

export default router;
