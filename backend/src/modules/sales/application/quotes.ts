// Cotizaciones (proformas): precios congelados por unos días. Se convierten en venta desde el POS o se anulan.
import type { prisma } from '../../../db.ts';
import { recordAudit } from '../../audit/index.ts';
import type { SessionUser } from '../../../types/express.d.ts';
import { nextQuoteNumber } from '../domain/documentNumber.ts';
import { SaleError, normalizeCart, sumLines, unitColumns, unitFields, unitPriceFor } from '../domain/sale.ts';
import { roundMoney } from '../../../utils/quantities.ts';
import * as repo from '../infrastructure/saleRepository.ts';
import { processSale, toId } from './directSale.ts';
import { loadCartProducts } from './pricing.ts';

type Client = typeof prisma;

export async function listQuotes(client: Client) {
  const quotes = await client.cotizacion.findMany({
    select: {
      id: true, numDoc: true, total: true, validDays: true, status: true, createdAt: true, clienteId: true,
      cliente: { select: { id: true, name: true, doc: true, phone: true } },
      vendedor: { select: { name: true } },
      detalles: {
        select: {
          quantity: true, unitPrice: true, subtotal: true, unitId: true, unitName: true, unitFactor: true,
          producto: { select: { id: true, name: true, code: true, price: true, stock: true, reserved: true, unit: true, allowsFractions: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return quotes.map(q => ({
    id: q.id,
    numDoc: q.numDoc,
    total: q.total,
    validDays: q.validDays,
    status: q.status,
    date: q.createdAt.toLocaleString('es-PE'),
    createdAt: q.createdAt,
    customer: q.cliente ? q.cliente.name : 'Público General',
    customerDoc: q.cliente ? q.cliente.doc : '00000000',
    clienteId: q.clienteId,
    seller: q.vendedor ? q.vendedor.name : 'General',
    detalles: q.detalles,
  }));
}

// Precios de la lista del cliente al momento de cotizar; el número sigue al de la última cotización.
export async function createQuote(client: Client, payload: Record<string, unknown>, user: SessionUser) {
  const items = normalizeCart(payload.cart);
  const clienteId = toId(payload.clienteId);
  const products = await loadCartProducts(client, items);
  const priceList = await repo.priceListOf(client, clienteId);

  const details = items.map(item => {
    const product = products.get(item.id)!;
    const unit = product.saleUnits.find(u => u.id === item.unitId) ?? null;
    const unitPrice = unitPriceFor(product, priceList, unit);
    return {
      productoId: item.id,
      quantity: item.qty,
      unitPrice,
      subtotal: roundMoney(unitPrice * item.qty),
      ...unitColumns(unitFields(unit, item.qty)),
    };
  });

  const last = await client.cotizacion.findFirst({ orderBy: { numDoc: 'desc' }, select: { numDoc: true } });
  return client.cotizacion.create({
    data: {
      numDoc: nextQuoteNumber(last?.numDoc),
      total: sumLines(details),
      validDays: parseInt(String(payload.validDays), 10) || 7,
      clienteId,
      vendedorId: user.id,
      detalles: { create: details },
    },
    include: { cliente: true, detalles: { include: { producto: true } } },
  });
}

// Cobra la cotización como venta directa con sus productos y, si sigue vigente, sus precios.
export async function convertQuote(client: Client, quoteId: number, payload: Record<string, unknown>, user: SessionUser) {
  const quote = await client.cotizacion.findUnique({
    where: { id: quoteId },
    include: { detalles: { select: { productoId: true, quantity: true, unitId: true } } },
  });
  if (!quote) throw new SaleError('Cotización no encontrada.', 404);
  return processSale(client, {
    docType: payload.docType,
    payMethod: payload.payMethod,
    mixCash: payload.mixCash,
    mixDigital: payload.mixDigital,
    payCode: payload.payCode,
    usuarioCajaId: user.id,
    vendedorId: payload.vendedorId || quote.vendedorId,
    clienteId: quote.clienteId,
    cotizacionId: quote.id,
    cart: quote.detalles.map(d => ({ id: d.productoId, qty: Number(d.quantity), unitId: d.unitId })),
  }, user);
}

export async function cancelQuote(client: Client, quoteId: number, user: SessionUser) {
  const quote = await client.cotizacion.findUnique({ where: { id: quoteId } });
  if (!quote) throw new SaleError('Cotización no encontrada.', 404);
  if (quote.status === 'CONVERTIDO') throw new SaleError('No se puede eliminar: esta cotización ya fue convertida a venta.');
  if (quote.status === 'CANCELADO') throw new SaleError('Esta cotización ya se encuentra cancelada.');

  return client.$transaction(async (tx) => {
    const updated = await tx.cotizacion.update({ where: { id: quoteId }, data: { status: 'CANCELADO' } });
    await recordAudit(tx, {
      action: 'QUOTE_CANCELLED',
      entity: 'Cotizacion',
      entityId: quoteId,
      summary: `Cotización ${quote.numDoc} de S/ ${Number(quote.total).toFixed(2)} anulada`,
      details: { numDoc: quote.numDoc, total: Number(quote.total) },
      user,
    });
    return updated;
  });
}
