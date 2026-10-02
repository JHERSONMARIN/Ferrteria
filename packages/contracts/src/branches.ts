// Sucursales (módulo branches del backend).
import type { IsoDate } from './common.ts';
import type { DispatchRole, SaleFlowMode } from './identity.ts';

/** GET /api/sucursales (con ?todas=1 el administrador ve también las desactivadas). */
export interface Branch {
  id: number;
  name: string;
  address: string | null;
  active: boolean;
  saleFlowMode: SaleFlowMode;
  deliveriesEnabled: boolean;
  dispatchRole: DispatchRole | null;
  userCount: number;
  cashRegisterCount: number;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}
