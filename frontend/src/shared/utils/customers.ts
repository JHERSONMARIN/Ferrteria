export interface CustomerRef {
  doc: string;
  name: string;
}

export const customerOptionLabel = (customer: CustomerRef) => `${customer.doc} - ${customer.name}`;

// Solo coincidencias exactas: una búsqueda parcial podía asignar la venta (o un fiado) a otro cliente.
export function findCustomerByInput<T extends CustomerRef>(clients: readonly T[], input: string): T | null {
  const text = input.trim();
  if (!text) return null;
  return clients.find(c => customerOptionLabel(c) === text || c.doc === text) || null;
}
