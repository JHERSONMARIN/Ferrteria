// Registro de auditoría (módulo audit del backend).
import type { IsoDate } from './common.ts';

/** Un registro: quién hizo qué y cuándo. details puede traer cambios { campo: { before, after } }. */
export interface AuditEntry {
  id: number;
  action: string;
  actionLabel: string;
  entity: string;
  entityId: string | null;
  summary: string;
  details: unknown;
  createdAt: IsoDate;
  userId: number | null;
  /** Se guarda el nombre: el registro sigue legible si el usuario se elimina. */
  userName: string;
}

/** GET /api/auditoria?page=&action=&userId=&from=&to= */
export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  /** Acciones que se registran, con su nombre en castellano. */
  actions: Record<string, string>;
}
