// Cajas, turnos y arqueo (módulo cash del backend).
import type { IsoDate } from './common.ts';

export interface CashierTotals {
  userId: number | null;
  name: string;
  sales: number;
  cash: number;
  digital: number;
}

/** El turno abierto en el que está el usuario. */
export interface CashSession {
  id: number;
  /** id null: caja personal de antes de que existieran las cajas físicas. */
  register: { id: number | null; name: string };
  openedBy: string;
  montoInicial: number;
  ventasEfectivo: number;
  ventasDigital: number;
  saldoTeoricoEfectivo: number;
  byCashier: CashierTotals[];
  members: { id: number; name: string; joinedAt: IsoDate }[];
  /** Fecha y hora para mostrar (es-PE). */
  createdAt: string;
  openedAt: IsoDate;
}

/** Una caja de la sucursal, con su turno abierto si lo tiene: para abrirla o unirse. */
export interface RegisterToJoin {
  id: number;
  name: string;
  session: { id: number; openedBy: string; openedAt: IsoDate; members: string[] } | null;
}

/** GET /api/caja/estado-actual */
export type CashStatus =
  | { abierta: true; caja: CashSession; registers: RegisterToJoin[] }
  | { abierta: false; caja: null; registers: RegisterToJoin[] };
