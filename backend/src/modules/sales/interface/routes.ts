// Rutas HTTP de ventas: /api/ventas (venta directa), /api/pedidos y /api/cotizaciones.
import express, { type Request, type Response } from 'express';
import { z } from '@ferresys/contracts/zod';
import { AppError, errorBody } from '@ferresys/shared/errors';
import { prisma } from '../../../db.ts';
import { allowModules } from '../../identity/index.ts';
import { id, parseInput } from '../../../lib/validation.ts';
import { SaleError } from '../domain/sale.ts';
import { processSale } from '../application/directSale.ts';
import { listSales } from '../application/history.ts';
import {
  cancelOrder, createOrder, dispatchOrder, getOrder, listDispatchedToday, listOrders, payOrder,
} from '../application/orders.ts';
import { cancelQuote, convertQuote, createQuote, listQuotes } from '../application/quotes.ts';
import type { Sendable } from '@ferresys/contracts/common';
import {
  CancelOrderBody, ConvertQuoteBody, DirectSaleBody, DispatchBody, OrderBody, PayOrderBody, QuoteBody,
  type DirectSaleSaved, type DispatchedOrder, type Order, type OrderSaved, type Quote, type QuoteCancelled, type QuoteSaved,
} from '@ferresys/contracts/sales';

type Handler = (req: Request, res: Response) => Promise<unknown>;

// Venta, caja, stock, envío, series y plan: todos son errores de negocio con su código.
// duplicateMessage: si dos ventas toman el mismo número a la vez (muy raro), se pide reintentar.
const handle = (context: string, fn: Handler, duplicateMessage = 'No se pudo generar el número de comprobante. Intente nuevamente.') =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof AppError) return res.status(error.status).json(errorBody(error));
      if ((error as { code?: string }).code === 'P2002') {
        return res.status(409).json({ error: duplicateMessage, codigo: 'VENTA_NUMERO_DUPLICADO' });
      }
      console.error(`[ventas] ${context}:`, error);
      res.status(500).json({ error: 'Error interno al procesar la venta.' });
    }
  };

const saleError = (message: string) => new SaleError(message);

// ---------- /api/ventas ----------

export const salesRoutes = express.Router();

// GET /api/ventas: ventas cobradas.
salesRoutes.get('/', handle('listar las ventas', async (req, res) => {
  res.json(await listSales(prisma));
}));

// POST /api/ventas: venta directa. La caja es siempre la del usuario de la sesión; el vendedor puede elegirse en el POS.
salesRoutes.post('/', handle('registrar la venta', async (req, res) => {
  const venta = await processSale(prisma, parseInput(DirectSaleBody, req.body, saleError), req.user);
  res.status(201).json({ success: true, venta } satisfies Sendable<DirectSaleSaved>);
}));

// ---------- /api/pedidos ----------

const OrderParams = z.object({ id: id('Número de pedido no válido.') });
const orderId = (req: Request) => parseInput(OrderParams, req.params, saleError).id;
const QueueQuery = z.object({
  status: z.enum(['PENDING_PAYMENT', 'PAID'], { error: 'Estado no válido.' }).default('PENDING_PAYMENT'),
});

export const orderRoutes = express.Router();

// GET /api/pedidos?status=PENDING_PAYMENT|PAID  (cola de caja o de despacho)
orderRoutes.get('/', allowModules({ default: ['caja', 'despacho', 'pos'] }), handle('listar los pedidos', async (req, res) => {
  res.json(await listOrders(prisma, parseInput(QueueQuery, req.query, saleError).status, req.user) satisfies Sendable<Order[]>);
}));

// GET /api/pedidos/despachados-hoy  (respaldo de lo que salió hoy del almacén)
orderRoutes.get('/despachados-hoy', allowModules({ default: ['despacho', 'pos', 'caja'] }), handle('listar lo despachado hoy', async (req, res) => {
  res.json(await listDispatchedToday(prisma, req.user) satisfies Sendable<DispatchedOrder[]>);
}));

// GET /api/pedidos/:id
orderRoutes.get('/:id', allowModules({ default: ['caja', 'despacho', 'pos'] }), handle('obtener el pedido', async (req, res) => {
  res.json(await getOrder(prisma, orderId(req)) satisfies Sendable<Order>);
}));

// POST /api/pedidos  (el vendedor envía el pedido a caja)
orderRoutes.post('/', allowModules({ default: ['pos'] }), handle('crear el pedido', async (req, res) => {
  res.status(201).json({ success: true, pedido: await createOrder(prisma, parseInput(OrderBody, req.body, saleError), req.user) } satisfies Sendable<OrderSaved>);
}));

// POST /api/pedidos/:id/cobrar
orderRoutes.post('/:id/cobrar', allowModules({ default: ['caja'] }), handle('cobrar el pedido', async (req, res) => {
  res.json({ success: true, pedido: await payOrder(prisma, orderId(req), parseInput(PayOrderBody, req.body, saleError), req.user) } satisfies Sendable<OrderSaved>);
}));

// POST /api/pedidos/:id/despachar  { repartidorId? }
// Quién despacha lo decide la sucursal (domain/dispatch.ts); aquí solo se exige alguno de esos módulos.
orderRoutes.post('/:id/despachar', allowModules({ default: ['despacho', 'pos', 'caja'] }), handle('despachar el pedido', async (req, res) => {
  const { repartidorId } = parseInput(DispatchBody, req.body, saleError);
  res.json({ success: true, pedido: await dispatchOrder(prisma, orderId(req), req.user, repartidorId ?? null) } satisfies Sendable<OrderSaved>);
}));

// POST /api/pedidos/:id/anular  { reason? }
orderRoutes.post('/:id/anular', allowModules({ default: ['caja', 'pos'] }), handle('anular el pedido', async (req, res) => {
  const { reason } = parseInput(CancelOrderBody, req.body, saleError);
  res.json({ success: true, pedido: await cancelOrder(prisma, orderId(req), req.user, reason ?? undefined) } satisfies Sendable<OrderSaved>);
}));

// ---------- /api/cotizaciones ----------

const QuoteParams = z.object({ id: id('ID de cotización no válido.') });
const quoteId = (req: Request) => parseInput(QuoteParams, req.params, saleError).id;
const QUOTE_NUMBER_TAKEN = 'No se pudo generar el número de cotización. Intente nuevamente.';

export const quoteRoutes = express.Router();

// GET /api/cotizaciones
quoteRoutes.get('/', handle('listar las cotizaciones', async (req, res) => {
  res.json(await listQuotes(prisma) satisfies Sendable<Quote[]>);
}));

// POST /api/cotizaciones  { cart, clienteId?, validDays? }
quoteRoutes.post('/', handle('generar la cotización', async (req, res) => {
  res.status(201).json({ success: true, cotizacion: await createQuote(prisma, parseInput(QuoteBody, req.body, saleError), req.user) } satisfies Sendable<QuoteSaved>);
}, QUOTE_NUMBER_TAKEN));

// POST /api/cotizaciones/:id/convertir: cobrarla como venta directa.
quoteRoutes.post('/:id/convertir', handle('convertir la cotización', async (req, res) => {
  res.json({ success: true, venta: await convertQuote(prisma, quoteId(req), parseInput(ConvertQuoteBody, req.body, saleError), req.user) } satisfies Sendable<DirectSaleSaved>);
}));

// DELETE /api/cotizaciones/:id: anularla (queda registrada, en estado CANCELADO).
quoteRoutes.delete('/:id', handle('anular la cotización', async (req, res) => {
  const cotizacion = await cancelQuote(prisma, quoteId(req), req.user);
  res.json({ success: true, message: 'Cotización eliminada (cancelada) exitosamente.', cotizacion } satisfies Sendable<QuoteCancelled>);
}));
