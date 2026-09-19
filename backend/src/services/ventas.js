import { nextDocumentNumber, DocumentSeriesError } from './documentSeries.js';
import { takeAvailableStock, StockError } from './stock.js';
import { quantityProblem, roundQuantity, roundMoney, MAX_QUANTITY_DECIMALS } from '../utils/quantities.js';
import { getSettings } from './settings.js';
import { parseDeliveryRequest, scheduleDeliveryForSale, DeliveryError } from './deliveries.js';
import { recordAudit } from './audit.js';
import { requireOpenSession, CashError } from './cashRegisters.js';

export class VentaError extends Error {
  constructor(message, status = 400, codigo = null, extra = null) {
    super(message);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

const DOC_TYPES = { Factura: 'FACTURA', Boleta: 'BOLETA' };
const PAY_METHODS = {
  Efectivo: 'EFECTIVO',
  Tarjeta: 'TARJETA',
  'Yape/Plin': 'YAPE_PLIN',
  Transferencia: 'TRANSFERENCIA',
  'Pago Mixto': 'PAGO_MIXTO',
  Fiado: 'FIADO',
};

const redondear = (n) => Math.round(n * 100) / 100;

// Agrupa productos repetidos y rechaza ids inválidos o cantidades no positivas. Si el producto admite
// fracciones se valida después, al cargarlo. Se ordena por id para que las ventas concurrentes
// bloqueen filas en el mismo orden.
export function normalizarCarrito(cart) {
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new VentaError('El carrito no puede estar vacío.');
  }

  const cantidades = new Map();
  for (const item of cart) {
    const id = Number(item?.id);
    const qty = Number(item?.qty);
    if (!Number.isInteger(id) || id <= 0) {
      throw new VentaError('El carrito contiene un producto inválido.');
    }
    if (!Number.isFinite(qty) || qty <= 0 || roundQuantity(qty) !== qty) {
      throw new VentaError(`Cantidad inválida para ${item?.name || `el producto ${id}`}: debe ser mayor a 0 y con hasta ${MAX_QUANTITY_DECIMALS} decimales.`);
    }
    cantidades.set(id, roundQuantity((cantidades.get(id) || 0) + qty));
  }

  return [...cantidades].map(([id, qty]) => ({ id, qty })).sort((a, b) => a.id - b.id);
}

export async function cargarProductosActivos(db, items) {
  const productos = await db.producto.findMany({
    where: { id: { in: items.map(i => i.id) } },
    select: { id: true, name: true, code: true, price: true, wholesalePrice: true, stock: true, active: true, allowsFractions: true, unit: true },
  });
  const porId = new Map(productos.map(p => [p.id, p]));

  for (const item of items) {
    const prod = porId.get(item.id);
    if (!prod || !prod.active) {
      throw new VentaError(`El producto ${prod?.name || item.id} no existe o no está activo.`);
    }
    const problem = quantityProblem(item.qty, prod.allowsFractions);
    if (problem) throw new VentaError(`La cantidad de ${prod.name} ${problem}.`);
  }
  return porId;
}

function cotizacionVigente(cot) {
  const vence = new Date(cot.createdAt);
  vence.setDate(vence.getDate() + cot.validDays);
  return vence >= new Date();
}

const toId = (v) => (v === undefined || v === null || v === '' ? null : parseInt(v, 10) || null);

export const toDocTypeEnum = (docType) => DOC_TYPES[docType] || 'NOTA_VENTA';
export const toPayMethodEnum = (payMethod) => PAY_METHODS[payMethod] || 'EFECTIVO';

export async function priceListFor(tx, clienteId) {
  if (!clienteId) return 'RETAIL';
  const client = await tx.cliente.findUnique({ where: { id: clienteId }, select: { priceList: true } });
  return client?.priceList ?? 'RETAIL';
}

export const unitPriceFor = (product, priceList) =>
  (priceList === 'WHOLESALE' && product.wholesalePrice != null ? product.wholesalePrice : product.price);

// Precio de cada línea: el de la cotización si sigue vigente; si no, el de la lista del cliente
// (mayorista o minorista). Nunca se usa el precio que manda el navegador.
export async function priceLines(tx, items, cotizacionId, clienteId = null) {
  const productos = await cargarProductosActivos(tx, items);
  const priceList = await priceListFor(tx, clienteId);

  const preciosCotizados = new Map();
  if (cotizacionId) {
    const cot = await tx.cotizacion.findUnique({
      where: { id: cotizacionId },
      include: { detalles: { select: { productoId: true, unitPrice: true } } },
    });
    if (!cot) throw new VentaError('La cotización no existe.', 404);
    if (cot.status !== 'PENDIENTE') {
      throw new VentaError(`La cotización ${cot.numDoc} ya fue ${cot.status === 'CONVERTIDO' ? 'convertida a venta' : 'cancelada'}.`);
    }
    if (cotizacionVigente(cot)) {
      cot.detalles.forEach(d => preciosCotizados.set(d.productoId, d.unitPrice));
    }
  }

  const lineas = items.map(item => {
    const prod = productos.get(item.id);
    const price = preciosCotizados.get(item.id) ?? unitPriceFor(prod, priceList);
    return { ...item, name: prod.name, code: prod.code, price, subtotal: redondear(price * item.qty) };
  });
  return { lineas, total: redondear(lineas.reduce((sum, l) => sum + l.subtotal, 0)) };
}

export async function markQuoteConverted(tx, cotizacionId) {
  const { count } = await tx.cotizacion.updateMany({
    where: { id: cotizacionId, status: 'PENDIENTE' },
    data: { status: 'CONVERTIDO' },
  });
  if (count === 0) throw new VentaError('La cotización ya fue procesada.', 409);
}

// Descuento que pide el POS: { type: 'PERCENT' | 'AMOUNT', value }. Sin descuento → null.
export function parseDiscountRequest(raw) {
  if (raw === undefined || raw === null) return null;
  if (raw.type !== 'PERCENT' && raw.type !== 'AMOUNT') throw new VentaError('Tipo de descuento no válido.');
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value < 0) throw new VentaError('El descuento debe ser un número positivo.');
  if (raw.type === 'PERCENT' && value > 100) throw new VentaError('El descuento no puede superar el 100 %.');
  return value === 0 ? null : { type: raw.type, value };
}

// Aplica el descuento sobre la suma de las líneas. El administrador no tiene tope; el resto del
// personal puede descontar hasta el % configurado por la empresa.
export function applyDiscount(subtotal, request, user, maxPercent) {
  if (!request) return { discount: 0, total: subtotal };
  const discount = roundMoney(request.type === 'PERCENT' ? subtotal * request.value / 100 : request.value);
  if (discount >= subtotal) throw new VentaError('El descuento no puede cubrir todo el total de la venta.');
  if (user?.role !== 'ADMINISTRADOR') {
    const allowed = roundMoney(subtotal * maxPercent / 100);
    if (discount > allowed) {
      throw new VentaError(
        maxPercent > 0
          ? `Su descuento máximo es ${maxPercent} % (S/ ${allowed.toFixed(2)} en esta venta).`
          : 'No tiene permitido aplicar descuentos. Solicítelo a un administrador.',
        403,
        'DESCUENTO_EXCEDIDO'
      );
    }
  }
  return { discount, total: roundMoney(subtotal - discount) };
}

export async function auditDiscount(tx, { saleId, reference, subtotal, discount, total, request, user }) {
  if (discount <= 0) return;
  await recordAudit(tx, {
    action: 'DISCOUNT_APPLIED',
    entity: 'Venta',
    entityId: saleId,
    summary: `Descuento de S/ ${discount.toFixed(2)} en ${reference} (de S/ ${subtotal.toFixed(2)} a S/ ${total.toFixed(2)})`,
    details: { subtotal, discount, total, type: request.type, value: request.value },
    user,
  });
}

export function assertExpectedTotal(totalEsperado, lineas, total) {
  if (totalEsperado === undefined || totalEsperado === null) return;
  if (Math.abs(Number(totalEsperado) - total) > 0.01) {
    throw new VentaError(
      `Los precios cambiaron: el total actual es S/ ${total.toFixed(2)} y no S/ ${Number(totalEsperado).toFixed(2)}. Revise el carrito antes de cobrar.`,
      409,
      'PRECIOS_CAMBIARON',
      { precios: lineas.map(l => ({ id: l.id, price: l.price })) }
    );
  }
}

// Valida el medio de pago y devuelve cuánto entra en efectivo y cuánto en digital.
export async function validatePayment(tx, { payMethodEnum, mixCash, mixDigital, clienteId, total }) {
  let cash = 0;
  let digital = 0;
  if (payMethodEnum === 'EFECTIVO') cash = total;
  else if (['TARJETA', 'YAPE_PLIN', 'TRANSFERENCIA'].includes(payMethodEnum)) digital = total;
  else if (payMethodEnum === 'PAGO_MIXTO') {
    cash = Number(mixCash);
    digital = Number(mixDigital);
    if (!Number.isFinite(cash) || !Number.isFinite(digital) || cash < 0 || digital < 0) {
      throw new VentaError('Los montos del pago mixto son inválidos.');
    }
    if (Math.abs(cash + digital - total) > 0.01) {
      throw new VentaError('El pago mixto no coincide con el total de la venta.');
    }
  }

  if (payMethodEnum === 'FIADO') {
    if (!clienteId) throw new VentaError('Para ventas al FIADO debe seleccionar un cliente registrado.');
    const cliente = await tx.cliente.findUnique({ where: { id: clienteId }, include: { creditoCliente: true } });
    if (!cliente) throw new VentaError('El cliente seleccionado no existe.');

    const deudaActual = cliente.creditoCliente ? cliente.creditoCliente.debtTotal : 0;
    const limite = cliente.maxCredit || 1000.0;
    const disponible = limite - deudaActual;
    if (total > disponible) {
      throw new VentaError(`Crédito insuficiente para ${cliente.name}. Límite: S/ ${limite.toFixed(2)}, Deuda Actual: S/ ${deudaActual.toFixed(2)}, Disponible: S/ ${disponible.toFixed(2)}. Intentó fiar: S/ ${total.toFixed(2)}.`);
    }
  }
  return { cash, digital };
}

// Turno de caja en el que está quien cobra (puede ser compartido con otros cajeros).
export async function findOpenCashRegister(tx, userId) {
  return { id: await requireOpenSession(tx, userId) };
}

export async function recordCashIncome(tx, cajaId, { cash, digital }) {
  if (cash <= 0 && digital <= 0) return;
  await tx.cajaChica.update({
    where: { id: cajaId },
    data: { ventasEfectivo: { increment: cash }, ventasDigital: { increment: digital } },
  });
}

export async function recordCreditCharge(tx, { clienteId, total, numDoc, lineas }) {
  let credito = await tx.creditoCliente.findUnique({ where: { clienteId } });
  if (!credito) {
    credito = await tx.creditoCliente.create({ data: { clienteId, debtTotal: 0, maxCredit: 1000.0 } });
  }
  await tx.creditoCliente.update({
    where: { clienteId },
    data: { debtTotal: { increment: total }, lastPurchase: new Date() },
  });
  await tx.abonoCredito.create({
    data: {
      creditoId: credito.id,
      amount: total,
      docRef: numDoc,
      desc: lineas.map(l => `${l.qty}x ${l.name}`).join(', '),
      type: 'CARGO',
    },
  });
}

export async function writeKardexExit(tx, { productId, qty, stockAfter, ref, userId, branchId }) {
  await tx.movimientoKardex.create({
    data: { productoId: productId, type: 'SALIDA', qty, stockAfter, ref, usuarioId: userId, branchId },
  });
}

export const publicLines = (lineas) =>
  lineas.map(({ id, name, code, qty, price, subtotal }) => ({ id, name, code, qty, price, subtotal }));

// Venta directa (modo DIRECTO): se cobra, se emite el comprobante y se entrega en un solo paso.
async function ejecutarVenta(tx, datos) {
  const {
    items, docTypeEnum, payMethodEnum, mixCash, mixDigital, payCode,
    clienteId, vendedorId, cajaUsuarioId, cotizacionId, totalEsperado, delivery,
    discountRequest, user, maxDiscountPercent,
  } = datos;

  const { lineas, total: subtotal } = await priceLines(tx, items, cotizacionId, clienteId);
  const { discount, total } = applyDiscount(subtotal, discountRequest, user, maxDiscountPercent);
  assertExpectedTotal(totalEsperado, lineas, total);
  if (cotizacionId) await markQuoteConverted(tx, cotizacionId);

  const payment = await validatePayment(tx, { payMethodEnum, mixCash, mixDigital, clienteId, total });
  const cajaAbierta = await findOpenCashRegister(tx, cajaUsuarioId);
  const numDoc = await nextDocumentNumber(tx, docTypeEnum);
  const now = new Date();

  const venta = await tx.venta.create({
    data: {
      docType: docTypeEnum,
      numDoc,
      payMethod: payMethodEnum,
      mixCash: payMethodEnum === 'PAGO_MIXTO' ? payment.cash : 0,
      mixDigital: payMethodEnum === 'PAGO_MIXTO' ? payment.digital : 0,
      payCode: payCode ? String(payCode).trim() : null,
      total,
      discount,
      discountById: discount > 0 ? user.id : null,
      clienteId,
      vendedorId,
      cajaId: cajaAbierta.id,
      paidById: cajaUsuarioId,
      // La mercadería sale de la sucursal de quien cobra en el POS.
      branchId: user.branchId,
      cotizacionId,
      status: 'DISPATCHED',
      paidAt: now,
      dispatchedAt: now,
      dispatchedById: vendedorId,
    },
  });

  await recordCashIncome(tx, cajaAbierta.id, payment);
  await auditDiscount(tx, { saleId: venta.id, reference: numDoc, subtotal, discount, total, request: discountRequest, user });

  for (const linea of lineas) {
    const stockAfter = await takeAvailableStock(tx, linea.id, linea.qty, user.branchId);
    await tx.detalleVenta.create({
      data: { ventaId: venta.id, productoId: linea.id, quantity: linea.qty, unitPrice: linea.price, subtotal: linea.subtotal },
    });
    await writeKardexExit(tx, {
      productId: linea.id,
      qty: linea.qty,
      stockAfter,
      ref: cotizacionId ? `Venta ${numDoc} (por cotización)` : `Venta ${numDoc}`,
      userId: vendedorId,
      branchId: user.branchId,
    });
  }

  if (payMethodEnum === 'FIADO') await recordCreditCharge(tx, { clienteId, total, numDoc, lineas });

  const entrega = delivery
    ? await scheduleDeliveryForSale(tx, { ventaId: venta.id, numDoc, clienteId, lines: lineas, delivery })
    : null;

  return { ...venta, subtotal, items: publicLines(lineas), delivery: entrega };
}

// user: quien tiene la sesión; es quien aplica el descuento (el vendedor puede ser otro).
export async function procesarVenta(prisma, payload, user) {
  const settings = await getSettings(prisma);
  if (settings.saleFlowMode !== 'DIRECT') {
    throw new VentaError('La empresa trabaja con pedidos: registre la venta como pedido y cóbrela en caja.', 409, 'MODO_PEDIDOS');
  }

  const items = normalizarCarrito(payload.cart);
  const vendedorId = toId(payload.vendedorId);
  const cajaUsuarioId = toId(payload.usuarioCajaId) || vendedorId;
  if (!cajaUsuarioId) throw new VentaError('Debe indicarse el usuario de caja.');

  const datos = {
    items,
    docTypeEnum: toDocTypeEnum(payload.docType),
    payMethodEnum: toPayMethodEnum(payload.payMethod),
    mixCash: payload.mixCash,
    mixDigital: payload.mixDigital,
    payCode: payload.payCode,
    clienteId: toId(payload.clienteId),
    vendedorId,
    cajaUsuarioId,
    cotizacionId: toId(payload.cotizacionId),
    totalEsperado: payload.totalEsperado,
    delivery: parseDeliveryRequest(payload.delivery),
    discountRequest: parseDiscountRequest(payload.discount),
    user,
    maxDiscountPercent: settings.maxDiscountPercent,
  };

  return prisma.$transaction(tx => ejecutarVenta(tx, datos));
}

export function responderErrorVenta(res, error, contexto) {
  if (error instanceof VentaError) {
    return res.status(error.status).json({ error: error.message, codigo: error.codigo, ...error.extra });
  }
  if (error instanceof DocumentSeriesError) {
    return res.status(400).json({ error: error.message });
  }
  if (error instanceof DeliveryError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof CashError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof StockError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error.code === 'P2002') {
    return res.status(409).json({ error: 'No se pudo generar el número de comprobante. Intente nuevamente.' });
  }
  console.error(`[${contexto}]`, error);
  return res.status(500).json({ error: 'Error interno al procesar la venta.' });
}
