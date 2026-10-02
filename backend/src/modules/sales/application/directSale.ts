// Venta directa (modo Directo): se cobra, se emite el comprobante y se entrega en un solo paso.
import type { prisma, Tx } from '../../../db.ts';
import { getSettings } from '../../settings/index.ts';
import type { SessionUser } from '../../../types/express.d.ts';
import { requireOpenSession } from '../../cash/index.ts';
import { assertBranchDelivers, scheduleDeliveryForSale, type DeliveryRequest } from '../../deliveries/index.ts';
import { reserveStock, takeAvailableStock } from '../../inventory/index.ts';
import { industryHooks, parseSaleData, type IndustryData } from '../../../industries/index.ts';
import type { DirectSaleInput } from '@ferresys/contracts/sales';
import {
  SaleError, assertExpectedTotal, publicLines, unitColumns,
  type CartItem, type DiscountRequest, type DocType, type PayMethod,
} from '../domain/sale.ts';
import { nextDocumentNumber } from '../infrastructure/documentSeries.ts';
import * as repo from '../infrastructure/saleRepository.ts';
import { applyDiscount, auditDiscount, markQuoteConverted, paymentFor, priceLines, saleLinesFor } from './pricing.ts';

type Client = typeof prisma;

interface SaleData {
  items: CartItem[];
  docType: DocType;
  payMethod: PayMethod;
  mixCash: unknown;
  mixDigital: unknown;
  payCode: string | null;
  clienteId: number | null;
  sellerId: number;
  cashierId: number;
  quoteId: number | null;
  expectedTotal: number | null;
  delivery: DeliveryRequest | null;
  discountRequest: DiscountRequest | null;
  user: SessionUser;
  maxDiscountPercent: number;
  industryData: IndustryData | undefined;
}

async function executeSale(tx: Tx, data: SaleData) {
  const { lines, total: subtotal } = await priceLines(tx, data.items, data.quoteId, data.clienteId);
  const { discount, total } = applyDiscount(subtotal, data.discountRequest, data.user, data.maxDiscountPercent);
  assertExpectedTotal(data.expectedTotal, lines, total);
  await industryHooks.beforeSale(tx, {
    kind: 'direct', branchId: data.user.branchId, customerId: data.clienteId, lines: saleLinesFor(lines), user: data.user,
    data: data.industryData,
  });
  if (data.quoteId) await markQuoteConverted(tx, data.quoteId);

  const payment = await paymentFor(tx, { payMethod: data.payMethod, total, mixCash: data.mixCash, mixDigital: data.mixDigital, clienteId: data.clienteId });
  const sessionId = await requireOpenSession(tx, data.cashierId);
  const numDoc = await nextDocumentNumber(tx, data.docType, data.user.branchId);
  const now = new Date();
  const delivery = data.delivery;

  const sale = await tx.venta.create({
    data: {
      docType: data.docType,
      numDoc,
      payMethod: data.payMethod,
      mixCash: data.payMethod === 'PAGO_MIXTO' ? payment.cash : 0,
      mixDigital: data.payMethod === 'PAGO_MIXTO' ? payment.digital : 0,
      payCode: data.payCode,
      total,
      discount,
      discountById: discount > 0 ? data.user.id : null,
      clienteId: data.clienteId,
      vendedorId: data.sellerId,
      cajaId: sessionId,
      paidById: data.cashierId,
      // La mercadería sale de la sucursal de quien cobra en el POS.
      branchId: data.user.branchId,
      cotizacionId: data.quoteId,
      // Con envío a domicilio la mercadería sigue en el local: queda por despachar hasta entregarla al repartidor.
      status: delivery ? 'PAID' : 'DISPATCHED',
      paidAt: now,
      dispatchedAt: delivery ? null : now,
      dispatchedById: delivery ? null : data.sellerId,
      industryData: data.industryData ?? {},
    },
  });

  await repo.addCashIncome(tx, sessionId, payment);
  await auditDiscount(tx, { saleId: sale.id, reference: numDoc, subtotal, discount, total, request: data.discountRequest, user: data.user });

  for (const line of lines) {
    await tx.detalleVenta.create({
      data: {
        ventaId: sale.id, productoId: line.id, quantity: line.qty, unitPrice: line.price, subtotal: line.subtotal, ...unitColumns(line),
      },
    });
    // Por despachar: se reserva y el kardex registra la salida al despachar.
    if (delivery) {
      await reserveStock(tx, line.id, line.baseQty, data.user.branchId);
      continue;
    }
    const stockAfter = await takeAvailableStock(tx, line.id, line.baseQty, data.user.branchId);
    const ref = data.quoteId ? `Venta ${numDoc} (por cotización)` : `Venta ${numDoc}`;
    await repo.writeKardexExit(tx, { productId: line.id, qty: line.baseQty, stockAfter, ref, userId: data.sellerId, branchId: data.user.branchId });
    await industryHooks.onStockMovement(tx, {
      direction: 'out', source: 'sale', productId: line.id, qty: line.baseQty, branchId: data.user.branchId, stockAfter, ref, userId: data.sellerId,
    });
  }

  if (data.payMethod === 'FIADO') await repo.chargeCredit(tx, { clienteId: data.clienteId!, total, numDoc, lines });

  const entrega = delivery
    ? await scheduleDeliveryForSale(tx, { ventaId: sale.id, numDoc, clienteId: data.clienteId, lines, delivery })
    : null;

  return { ...sale, subtotal, items: publicLines(lines), delivery: entrega };
}

// user: quien tiene la sesión; cobra y aplica el descuento. El vendedor puede ser otro (sin vendedorId, el mismo).
export async function processSale(client: Client, input: DirectSaleInput, user: SessionUser) {
  const settings = await getSettings(client);
  // El modo es de la sucursal de quien vende.
  if (user.branch?.saleFlowMode !== 'DIRECT') {
    throw new SaleError('Su sucursal trabaja con pedidos: registre la venta como pedido y cóbrela en caja.', 409, 'MODO_PEDIDOS');
  }

  const data: SaleData = {
    items: input.cart,
    docType: input.docType,
    payMethod: input.payMethod,
    mixCash: input.mixCash,
    mixDigital: input.mixDigital,
    payCode: input.payCode,
    clienteId: input.clienteId,
    sellerId: input.vendedorId ?? user.id,
    cashierId: user.id,
    quoteId: input.cotizacionId,
    expectedTotal: input.totalEsperado,
    delivery: input.delivery,
    discountRequest: input.discount,
    user,
    maxDiscountPercent: Number(settings.maxDiscountPercent),
    industryData: parseSaleData(input.industryData),
  };
  if (data.delivery) assertBranchDelivers(user.branch);

  return client.$transaction(tx => executeSale(tx, data));
}
