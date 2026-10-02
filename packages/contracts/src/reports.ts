// Panel de inicio y reportes por período (módulo reports del backend).
import type { IsoDay } from './common.ts';

/** GET /api/dashboard/stats */
export interface DashboardStats {
  ingresosCaja: number;
  deudaCreditos: number;
  salesCount: number;
  totalProductsCount: number;
  totalInventoryValue: number;
  lowStockCount: number;
  vendedores: {
    id: number;
    name: string;
    role: string;
    ventasCount: number;
    totalVendido: number;
    entregasAsignadas: number;
    entregasCompletadas: number;
  }[];
  recentSales: { doc: string | null; customer: string; seller: string; method: string | null; total: number }[];
}

/** Ventas agrupadas por una persona (vendedor o cajero). */
export interface PersonTotals {
  userId: number | null;
  name: string;
  sales: number;
  total: number;
  average: number;
}

/** Un producto en la rotación del período. */
export interface ProductRotation {
  id: number;
  code: string;
  name: string;
  unit: string;
  stock: number;
  sold: number;
  /** Promedio vendido por día en el período. */
  dailyAverage: number;
  /** Días de venta que alcanza el stock al ritmo del período; null si no se vendió. */
  coverageDays: number | null;
  stockValue: number;
}

/** GET /api/dashboard/reportes?from=&to=&branchId= */
export interface SalesReport {
  range: { from: IsoDay; to: IsoDay; days: number };
  branchId: number | null;
  summary: { sales: number; revenue: number; discounts: number; discountedSales: number; averageTicket: number };
  payMethods: { method: string; label: string; sales: number; total: number }[];
  sellers: (PersonTotals & { discounts: number })[];
  cashiers: PersonTotals[];
  daily: { day: IsoDay; sales: number; total: number }[];
  topProducts: { id: number; code: string; name: string; unit: string; quantity: number; amount: number; sales: number }[];
  rotation: {
    lowCoverageDays: number;
    lowCoverage: ProductRotation[];
    lowCoverageCount: number;
    noMovement: ProductRotation[];
    noMovementCount: number;
    noMovementValue: number;
  };
}
