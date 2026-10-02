// Envíos a domicilio: reglas puras. Una entrega nace de una venta cobrada y no mueve stock: el stock ya
// lo descontó la venta (directo / caja) o lo descontará el despacho (por etapas o con envío).
import { AppError } from '@ferresys/shared/errors';
import type { DeliveryAddress } from '@ferresys/contracts/deliveries';

export class DeliveryError extends AppError {
  static override area = 'ENVIO';
}

export type DeliveryStatus = 'PENDIENTE' | 'EN_CAMINO' | 'ENTREGADO' | 'CANCELADO';
export const ACTIVE_STATUSES: DeliveryStatus[] = ['PENDIENTE', 'EN_CAMINO'];
export const FINISHED_STATUSES: DeliveryStatus[] = ['ENTREGADO', 'CANCELADO'];

// Datos del envío ya validados (DeliveryAddressBody del contrato).
export type DeliveryRequest = DeliveryAddress;

export interface CourierCandidate {
  active: boolean;
  role: string;
  modules: unknown;
  branchId: number | null;
}

export const deliveryRef = (numDoc: string) => `ENT-${numDoc}`;

// La sucursal debe tener activados los envíos (Configuración → Modo de trabajo).
export function assertBranchDelivers(branch: { name: string; deliveriesEnabled: boolean } | null | undefined): void {
  if (branch && branch.deliveriesEnabled === false) {
    throw new DeliveryError(`${branch.name} no hace envíos a domicilio.`, 400);
  }
}

// Los productos solo salen a reparto cuando ya dejaron el almacén (la venta está despachada).
// Las entregas antiguas, sin venta, nunca esperan despacho.
export const isWaitingDispatch = (saleStatus: string | null) => saleStatus !== null && saleStatus !== 'DISPATCHED';

// Reparte quien es repartidor, administrador o tiene el módulo Entregas, de la misma sucursal del envío.
export function canDeliver(courier: CourierCandidate | null, branchId: number | null): boolean {
  if (!courier || !courier.active) return false;
  if (branchId && courier.branchId !== branchId) return false;
  const modules = Array.isArray(courier.modules) ? courier.modules : [];
  return courier.role === 'ADMINISTRADOR' || courier.role === 'REPARTIDOR' || modules.includes('deliveries');
}

// Un repartidor solo se toma lo libre para sí mismo y solo suelta lo suyo: no se pisan entre ellos.
// El administrador y quien atiende la tienda asignan libremente.
export function assertCourierChange(
  actor: { id: number; role: string },
  currentCourier: { id: number; name: string } | null,
  newCourierId: number | null,
): void {
  if (actor.role !== 'REPARTIDOR') return;
  const takes = newCourierId === actor.id && !currentCourier;
  const releases = newCourierId === null && currentCourier?.id === actor.id;
  if (!takes && !releases) {
    throw new DeliveryError(currentCourier
      ? `Este pedido ya lo tomó ${currentCourier.name}.`
      : 'Solo puede tomar el pedido para usted mismo.', 409);
  }
}

// Nota que queda en el envío cancelado.
export const cancellationNote = (previous: string | null, actorName: string, reason?: string | null) =>
  [previous, `Envío cancelado por ${actorName}${reason?.trim() ? `: ${reason.trim()}` : ''}`]
    .filter(Boolean).join(' · ').slice(0, 300);
