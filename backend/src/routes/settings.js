import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma } from '../db.js';
import { LICENSED_MODULES, LICENSED_FEATURES, LIMITS, licenseStatus } from '../services/license.js';
import {
  getSettings,
  updateSettings,
  AVAILABLE_MODULES,
  SettingsValidationError,
} from '../services/settings.js';

const router = express.Router();

// Estilos disponibles (backend/src/config/themes.json): los mismos que usa la consola de VALETEC.
const THEMES = JSON.parse(readFileSync(fileURLToPath(new URL('../config/themes.json', import.meta.url)), 'utf8')).estilos;

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const [settings, documentSeries] = await Promise.all([
      getSettings(prisma),
      prisma.documentSeries.findMany({
        orderBy: [{ branchId: 'asc' }, { documentType: 'asc' }, { series: 'asc' }],
        include: { branch: { select: { id: true, name: true } } },
      }),
    ]);
    res.json({
      settings, documentSeries, themes: THEMES, availableModules: AVAILABLE_MODULES, licensedModules: LICENSED_MODULES,
      licensedFeatures: LICENSED_FEATURES, limits: LIMITS, license: licenseStatus(),
    });
  } catch (error) {
    console.error('[settings.js] Error al obtener la configuración:', error);
    res.status(500).json({ error: 'No se pudo obtener la configuración de la empresa.' });
  }
});

// PUT /api/settings
// TODO(Fase 2): restringir a administradores cuando exista autenticación en la API.
router.put('/', async (req, res) => {
  try {
    const settings = await updateSettings(prisma, req.body, req.user);
    res.json({ success: true, settings });
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('[settings.js] Error al guardar la configuración:', error);
    res.status(500).json({ error: 'No se pudo guardar la configuración de la empresa.' });
  }
});

export default router;
