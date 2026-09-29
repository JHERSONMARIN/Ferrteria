// Módulo de configuración (núcleo, simple): datos de la empresa, módulos activos y tope de descuento.
// Es lo único que el resto del sistema importa de este módulo.
export { SettingsValidationError, getSettings } from './settings.ts';
export { default as settingsRoutes } from './routes.ts';
