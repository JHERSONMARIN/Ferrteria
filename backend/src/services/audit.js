// Registro de auditoría. Se escribe con el mismo cliente (tx) que la operación auditada para que
// ambas se confirmen o se descarten juntas.

export const AUDIT_ACTIONS = {
  SALE_CANCELLED: 'Pedido anulado',
  DISCOUNT_APPLIED: 'Descuento aplicado',
  PRICE_CHANGED: 'Cambio de precio',
  CASH_CLOSED: 'Cierre de caja',
  STOCK_ADJUSTED: 'Ajuste manual de stock',
  SETTINGS_CHANGED: 'Configuración modificada',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario modificado',
  USER_DELETED: 'Usuario eliminado',
  CREDIT_LIMIT_CHANGED: 'Límite de crédito modificado',
  PRICE_LIST_CHANGED: 'Lista de precios modificada',
  QUOTE_CANCELLED: 'Cotización anulada',
  DELIVERY_CANCELLED: 'Envío cancelado',
};

const SYSTEM_USER_NAME = 'Sistema';
const MAX_SUMMARY_LENGTH = 300;

// user: quien hizo la operación; sin usuario se registra como "Sistema" (ej. pedidos vencidos).
export async function recordAudit(db, { action, entity, entityId = null, summary, details = null, user = null }) {
  if (!AUDIT_ACTIONS[action]) throw new Error(`Acción de auditoría desconocida: ${action}`);
  await db.auditLog.create({
    data: {
      action,
      entity,
      entityId: entityId === null || entityId === undefined ? null : String(entityId),
      summary: summary.slice(0, MAX_SUMMARY_LENGTH),
      details,
      userId: user?.id ?? null,
      userName: user?.name ?? SYSTEM_USER_NAME,
    },
  });
}

// Solo los campos que cambiaron: { campo: { before, after } }, o null si no cambió ninguno.
export function changedFields(before, after, fields) {
  const changes = {};
  for (const field of fields) {
    if (after[field] === undefined) continue;
    if (JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)) {
      changes[field] = { before: before[field] ?? null, after: after[field] ?? null };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

// Las fechas del filtro son días de Perú (UTC-5, sin horario de verano).
const BUSINESS_UTC_OFFSET = '-05:00';
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 50;

export class AuditQueryError extends Error {}

export async function listAuditLogs(db, query) {
  const where = {};
  if (query.action) {
    if (!AUDIT_ACTIONS[query.action]) throw new AuditQueryError('Acción no válida.');
    where.action = query.action;
  }
  if (query.userId) {
    const userId = parseInt(query.userId, 10);
    if (Number.isNaN(userId)) throw new AuditQueryError('Usuario no válido.');
    where.userId = userId;
  }
  for (const key of ['from', 'to']) {
    if (query[key] && !DAY_PATTERN.test(query[key])) throw new AuditQueryError('Fecha no válida (use AAAA-MM-DD).');
  }
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(`${query.from}T00:00:00.000${BUSINESS_UTC_OFFSET}`);
    if (query.to) where.createdAt.lte = new Date(`${query.to}T23:59:59.999${BUSINESS_UTC_OFFSET}`);
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);

  return {
    items: items.map(item => ({ ...item, actionLabel: AUDIT_ACTIONS[item.action] || item.action })),
    total,
    page,
    pageSize: PAGE_SIZE,
    actions: AUDIT_ACTIONS,
  };
}
