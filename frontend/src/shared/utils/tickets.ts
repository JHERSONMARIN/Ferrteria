const DOC_TITLES: Record<string, string> = {
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
// Lo que se imprime en el ticket (ver shared/print/TicketPrint.tsx).
export interface TicketItem {
  qty: number;
  name?: string;
  unitName?: string | null;
  price: number;
  /** Descuento de la línea (ya incluido en el descuento total del ticket). */
  discount?: number;
}

export interface TicketData {
  docTitle?: string;
  numDoc?: string;
  dateStr?: string;
  issueDate?: string;
  customerName?: string;
  customerDoc?: string;
  docLabelTitle?: string;
  sellerName?: string;
  payMethod?: string;
  items?: TicketItem[];
  total?: number;
  discount?: number;
  isFiscal?: boolean;
}

interface SaleTicketInput {
  numDoc: string;
  docType: string;
  payMethod: string;
  items: TicketItem[];
  total: number;
  discount?: number;
  sellerName?: string | null;
  customer?: { name: string; doc: string; type?: string } | null;
  customerName?: string | null;
  customerDni?: string | null;
  customerRuc?: string | null;
}

export function buildSaleTicket({ numDoc, docType, payMethod, items, total, discount = 0, sellerName, customer, customerName, customerDni, customerRuc }: SaleTicketInput): TicketData {
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
