const DOC_TITLES = {
  Factura: 'FACTURA ELECTRÓNICA',
  Boleta: 'BOLETA DE VENTA',
  'Nota de Venta': 'NOTA DE VENTA',
};

const now = () => new Date().toLocaleString('es-PE');

// Fecha de emisión en el formato que pide SUNAT para el QR (AAAA-MM-DD, hora local).
const issueDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Datos del comprobante impreso a partir de lo que registró el servidor.
export function buildSaleTicket({ numDoc, docType, payMethod, items, total, discount = 0, sellerName, customer, customerName, customerDni, customerRuc }) {
  return {
    docTitle: DOC_TITLES[docType] || DOC_TITLES['Nota de Venta'],
    numDoc,
    dateStr: now(),
    issueDate: issueDate(),
    customerName: customer ? customer.name : customerName || 'Público General',
    customerDoc: customer ? customer.doc : customerDni || customerRuc || '00000000',
    docLabelTitle: customer ? (customer.type === 'EMPRESA' ? 'RUC' : 'DNI') : customerDni ? 'DNI' : 'RUC',
    sellerName: sellerName || 'General',
    payMethod,
    items,
    total,
    discount,
    isFiscal: docType === 'Boleta' || docType === 'Factura',
  };
}
