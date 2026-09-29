// Módulo de auditoría (núcleo, simple): registro de cambios importantes y su consulta.
// Es lo único que el resto del sistema importa de este módulo.
export { AUDIT_ACTIONS, AuditQueryError, changedFields, recordAudit, type AuditAction, type Changes } from './audit.ts';
export { default as auditRoutes } from './routes.ts';
