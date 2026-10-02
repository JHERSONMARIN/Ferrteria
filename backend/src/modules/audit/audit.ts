// Registro de auditoría: quién hizo cada cambio importante y cuándo. Se escribe con el mismo cliente (tx)
// que la operación auditada, para que ambas se confirmen o se descarten juntas.
import type { Prisma } from '@prisma/client';
import type { prisma } from '../../db.ts';
import { AppError } from '@ferresys/shared/errors';
import { requireFeature } from '../licensing/index.ts';

export const AUDIT_ACTIONS = {
  SALE_CANCELLED: 'Pedido anulado',
  DISCOUNT_APPLIED: 'Descuento aplicado',
  PRICE_CHANGED: 'Cambio de precio',
  CASH_CLOSED: 'Cierre de caja',
  STOCK_ADJUSTED: 'Ajuste manual de stock',
  STOCK_TRANSFERRED: 'Transferencia entre sucursales',
  SETTINGS_CHANGED: 'Configuración modificada',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario modificado',
  USER_DELETED: 'Usuario eliminado',
  CLIENT_UPDATED: 'Cliente modificado',
  CREDIT_LIMIT_CHANGED: 'Límite de crédito modificado',
  PRICE_LIST_CHANGED: 'Lista de precios modificada',
  QUOTE_CANCELLED: 'Cotización anulada',
  DELIVERY_CANCELLED: 'Envío cancelado',
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export class AuditQueryError extends AppError {
  static override area = 'AUDITORIA';
}

const SYSTEM_USER_NAME = 'Sistema';
const MAX_SUMMARY_LENGTH = 300;

export interface AuditEntry {
  action: AuditAction;
  entity: string;
  entityId?: string | number | null;
  summary: string;
  details?: unknown;
  /** Quién hizo la operación; sin usuario queda como "Sistema" (ej. pedidos vencidos). */
  user?: { id: number; name: string } | null;
}

export async function recordAudit(db: Pick<typeof prisma, 'auditLog'>, entry: AuditEntry): Promise<void> {
  if (!AUDIT_ACTIONS[entry.action]) throw new Error(`Acción de auditoría desconocida: ${entry.action}`);
  await db.auditLog.create({
    data: {
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId === null || entry.entityId === undefined ? null : String(entry.entityId),
      summary: entry.summary.slice(0, MAX_SUMMARY_LENGTH),
      details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
      userId: entry.user?.id ?? null,
      userName: entry.user?.name ?? SYSTEM_USER_NAME,
    },
  });
}

export type Changes = Record<string, { before: unknown; after: unknown }>;

// Solo los campos que cambiaron: { campo: { before, after } }, o null si no cambió ninguno.
// Un campo que no viene en `after` (undefined) no se está cambiando.
export function changedFields(before: object, after: object, fields: readonly string[]): Changes | null {
  const was = before as Record<string, unknown>;
  const now = after as Record<string, unknown>;
  const changes: Changes = {};
  for (const field of fields) {
    if (now[field] === undefined) continue;
    if (JSON.stringify(was[field] ?? null) !== JSON.stringify(now[field] ?? null)) {
      changes[field] = { before: was[field] ?? null, after: now[field] ?? null };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

// ---------- Consulta ----------

// Las fechas del filtro son días de Perú (UTC-5, sin horario de verano).
const BUSINESS_UTC_OFFSET = '-05:00';
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const AUDIT_PAGE_SIZE = 50;

export interface AuditQuery {
  action?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: string;
}

// Filtro de la consulta: acción, usuario y rango de días. Valores inválidos se rechazan con su mensaje.
export function auditFilter(query: AuditQuery) {
  const where: Prisma.AuditLogWhereInput = {};
  if (query.action) {
    if (!(query.action in AUDIT_ACTIONS)) throw new AuditQueryError('Acción no válida.');
    where.action = query.action;
  }
  if (query.userId) {
    const userId = parseInt(query.userId, 10);
    if (Number.isNaN(userId)) throw new AuditQueryError('Usuario no válido.');
    where.userId = userId;
  }
  for (const day of [query.from, query.to]) {
    if (day && !DAY_PATTERN.test(day)) throw new AuditQueryError('Fecha no válida (use AAAA-MM-DD).');
  }
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from && { gte: new Date(`${query.from}T00:00:00.000${BUSINESS_UTC_OFFSET}`) }),
      ...(query.to && { lte: new Date(`${query.to}T23:59:59.999${BUSINESS_UTC_OFFSET}`) }),
    };
  }
  return { where, page: Math.max(1, parseInt(query.page ?? '', 10) || 1) };
}

export async function listAuditLogs(client: typeof prisma, query: AuditQuery) {
  requireFeature('audit');
  const { where, page } = auditFilter(query);
  const [total, items] = await Promise.all([
    client.auditLog.count({ where }),
    client.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * AUDIT_PAGE_SIZE, take: AUDIT_PAGE_SIZE }),
  ]);
  return {
    items: items.map(item => ({ ...item, actionLabel: AUDIT_ACTIONS[item.action as AuditAction] || item.action })),
    total,
    page,
    pageSize: AUDIT_PAGE_SIZE,
    actions: AUDIT_ACTIONS,
  };
}
