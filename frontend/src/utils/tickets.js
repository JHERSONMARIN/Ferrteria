const DOC_TITLES = {
  Factura: 'FACTURA ELECTRÓNICA',
  Boleta: 'BOLETA DE VENTA',
  'Nota de Venta': 'NOTA DE VENTA',
};

const now = () => new Date().toLocaleString('es-PE');

// Datos del comprobante impreso a partir de lo que registró el servidor.
export function buildSaleTicket({ numDoc, docType, payMethod, items, total, sellerName, customer, customerName, customerDni, customerRuc }) {
  return {
    docTitle: DOC_TITLES[docType] || DOC_TITLES['Nota de Venta'],
    numDoc,
    dateStr: now(),
    customerName: customer ? customer.name : customerName || 'Público General',
    customerDoc: customer ? customer.doc : customerDni || customerRuc || '00000000',
    docLabelTitle: customer ? (customer.type === 'EMPRESA' ? 'RUC' : 'DNI') : customerDni ? 'DNI' : 'RUC',
    sellerName: sellerName || 'General',
    payMethod,
    items,
    total,
    isFiscal: docType === 'Boleta' || docType === 'Factura',
  };
}

// Ticket que el cliente lleva a caja: no es comprobante de pago.
export function buildOrderTicket(order) {
  return {
    docTitle: 'PEDIDO · PRESENTAR EN CAJA',
    numDoc: `N° ${order.id}`,
    dateStr: now(),
    customerName: order.customer,
    customerDoc: order.customerDoc || '-',
    docLabelTitle: 'Doc.',
    sellerName: order.seller,
    payMethod: 'PENDIENTE DE PAGO',
    items: order.items,
    total: order.total,
    isFiscal: false,
  };
}
