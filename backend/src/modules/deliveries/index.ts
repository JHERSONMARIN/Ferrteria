// Módulo de envíos a domicilio (núcleo): cualquier comercio que reparte lo usa igual.
// Es lo único que el resto del sistema importa de este módulo.
export { DeliveryError, assertBranchDelivers, parseDeliveryRequest, type DeliveryRequest } from './domain/delivery.ts';
export { assertCanDeliver, scheduleDeliveryForSale } from './application/deliveries.ts';
export { default as deliveryRoutes } from './interface/routes.ts';
