// Historial de ventas cobradas (pantalla de reportes y reimpresión de comprobantes).
import type { prisma } from '../../../db.ts';
import { docTypeLabel } from '../domain/sale.ts';

type Client = typeof prisma;

export async function listSales(client: Client) {
  const sales = await client.venta.findMany({
    where: { status: { in: ['PAID', 'DISPATCHED'] } },
    select: {
      id: true, docType: true, numDoc: true, payMethod: true, mixCash: true, mixDigital: true, payCode: true,
      total: true, discount: true, status: true, createdAt: true,
      cliente: { select: { name: true, doc: true, type: true } },
      vendedor: { select: { name: true, role: true } },
      detalles: { select: { quantity: true, unitPrice: true, subtotal: true, unitName: true, producto: { select: { name: true, code: true } } } },
    },
    orderBy: { id: 'desc' },
  });
  return sales.map(s => ({
    id: s.id,
    time: s.createdAt.toLocaleString('es-PE'),
    doc: docTypeLabel(s.docType ?? ''),
    numDoc: s.numDoc,
    customer: s.cliente ? s.cliente.name : 'Público General',
    customerDoc: s.cliente ? s.cliente.doc : '00000000',
    seller: s.vendedor ? s.vendedor.name : 'General',
    method: s.payMethod,
    payCode: s.payCode,
    total: s.total,
    discount: s.discount,
    detalles: s.detalles,
  }));
}
