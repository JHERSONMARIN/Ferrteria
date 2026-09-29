// Módulo de sucursales (núcleo, simple): locales de la empresa, su modo de trabajo y sus envíos.
// Es lo único que el resto del sistema importa de este módulo.
export { BranchError, resolveBranchId } from './branches.ts';
export { default as branchRoutes } from './routes.ts';
