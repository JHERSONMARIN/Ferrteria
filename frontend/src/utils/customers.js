export const customerOptionLabel = (customer) => `${customer.doc} - ${customer.name}`;

// Solo coincidencias exactas: una búsqueda parcial podía asignar la venta (o un fiado) a otro cliente.
export function findCustomerByInput(clients, input) {
  const text = input.trim();
  if (!text) return null;
  return clients.find(c => customerOptionLabel(c) === text || c.doc === text) || null;
}
