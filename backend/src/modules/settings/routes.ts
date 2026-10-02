// Rutas HTTP de la configuración de la empresa (/api/settings). Leerla puede cualquiera con sesión;
// cambiarla, solo el administrador (lo decide server.js).
import express from 'express';
import { readFileSync } from 'node:fs';
import { AppError, errorBody } from '@ferresys/shared/errors';
import { prisma } from '../../db.ts';
import { AVAILABLE_MODULES } from '../../config/modules.js';
import { INDUSTRY, LICENSED_FEATURES, LICENSED_MODULES, LIMITS, licenseStatus } from '../licensing/index.ts';
import { vocabulary } from '../../industries/index.ts';
import { getSettings, updateSettings } from './settings.ts';
import type { Sendable } from '@ferresys/contracts/common';
import type { SettingsResponse, SettingsSaved } from '@ferresys/contracts/settings';

const router = express.Router();

// Estilos disponibles (backend/src/config/themes.json): los mismos que usa la consola de VALETEC.
const THEMES = JSON.parse(readFileSync(new URL('../../config/themes.json', import.meta.url), 'utf8')).estilos;

// GET /api/settings: la configuración, las series de comprobante y lo que permite el plan.
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
      licensedFeatures: LICENSED_FEATURES, limits: LIMITS, license: licenseStatus(), industry: INDUSTRY, vocabulary,
    } satisfies Sendable<SettingsResponse>);
  } catch (error) {
    console.error('[configuración] Error al obtener la configuración:', error);
    res.status(500).json({ error: 'No se pudo obtener la configuración de la empresa.' });
  }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  try {
    const settings = await updateSettings(prisma, (req.body ?? {}) as Record<string, unknown>, req.user);
    res.json({ success: true, settings } satisfies Sendable<SettingsSaved>);
  } catch (error) {
    if (error instanceof AppError) return res.status(error.status).json(errorBody(error));
    console.error('[configuración] Error al guardar la configuración:', error);
    res.status(500).json({ error: 'No se pudo guardar la configuración de la empresa.' });
  }
});

export default router;
