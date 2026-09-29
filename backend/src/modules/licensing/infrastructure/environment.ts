// La licencia llega en las variables de entorno de la instancia: las escribe deploy/set-plan.sh o la
// consola de VALETEC en el .env de la empresa. Se lee una vez al arrancar; cambiarla requiere reiniciar.
import { z } from 'zod';
import { parseFeatures, parseLimit, parseModules, type License } from '../domain/license.ts';

const LicenseEnvironment = z.object({
  PLAN: z.string().optional(),
  LICENSED_MODULES: z.string().optional(),
  LICENSED_FEATURES: z.string().optional(),
  MAX_USERS: z.string().optional(),
  MAX_BRANCHES: z.string().optional(),
  MAX_CASH_REGISTERS: z.string().optional(),
  LICENSE_EXPIRES_AT: z.string().optional(),
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Un dato mal escrito en el .env no debe dejar a la empresa sin sistema: se avisa en el registro y se
// ignora ese dato.
export function readLicense(
  env: Record<string, string | undefined>,
  availableModules: readonly string[],
  alwaysEnabledModules: readonly string[],
): License {
  const vars = LicenseEnvironment.parse(env);
  const modules = parseModules(vars.LICENSED_MODULES, availableModules, alwaysEnabledModules);
  const features = parseFeatures(vars.LICENSED_FEATURES);
  if (modules.unknown.length > 0) {
    console.warn(`[license] Se ignoran módulos desconocidos en LICENSED_MODULES: ${modules.unknown.join(', ')}`);
  }
  if (features.unknown.length > 0) {
    console.warn(`[license] Se ignoran funciones desconocidas en LICENSED_FEATURES: ${features.unknown.join(', ')}`);
  }

  let expiresAt = vars.LICENSE_EXPIRES_AT?.trim() || null;
  if (expiresAt && !DATE.test(expiresAt)) {
    console.warn(`[license] LICENSE_EXPIRES_AT no es una fecha AAAA-MM-DD (${expiresAt}): se ignora.`);
    expiresAt = null;
  }

  return {
    plan: vars.PLAN?.trim() || null,
    modules: modules.licensed,
    features: features.licensed,
    limits: {
      maxUsers: parseLimit(vars.MAX_USERS),
      maxBranches: parseLimit(vars.MAX_BRANCHES),
      maxCashRegisters: parseLimit(vars.MAX_CASH_REGISTERS),
    },
    expiresAt,
  };
}
