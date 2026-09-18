import { nextDocumentNumber, DocumentSeriesError } from './documentSeries.js';

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

// Agrupa productos repetidos y rechaza ids o cantidades que no sean enteros positivos.
// Se ordena por id para que las ventas concurrentes bloqueen filas en el mismo orden.
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
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new VentaError(`Cantidad inválida para ${item?.name || `el producto ${id}`}. Debe ser un entero mayor a 0.`);
    }
    cantidades.set(id, (cantidades.get(id) || 0) + qty);
  }

  return [...cantidades].map(([id, qty]) => ({ id, qty })).sort((a, b) => a.id - b.id);
}

export async function cargarProductosActivos(db, items) {
  const productos = await db.producto.findMany({
    where: { id: { in: items.map(i => i.id) } },
    select: { id: true, name: true, code: true, price: true, stock: true, active: true },
  });
  const porId = new Map(productos.map(p => [p.id, p]));

  for (const item of items) {
    const prod = porId.get(item.id);
    if (!prod || !prod.active) {
      throw new VentaError(`El producto ${prod?.name || item.id} no existe o no está activo.`);
    }
  }
  return porId;
}

function cotizacionVigente(cot) {
  const vence = new Date(cot.createdAt);
  vence.setDate(vence.getDate() + cot.validDays);
  return vence >= new Date();
}

async function ejecutarVenta(tx, datos) {
  const {
    items, docTypeEnum, payMethodEnum, mixCash, mixDigital, payCode,
    clienteId, vendedorId, cajaUsuarioId, cotizacionId, totalEsperado,
  } = datos;

  const productos = await cargarProductosActivos(tx, items);

  // Una cotización vigente respeta los precios cotizados; vencida, se cobra a precio actual.
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

    const { count } = await tx.cotizacion.updateMany({
      where: { id: cotizacionId, status: 'PENDIENTE' },
      data: { status: 'CONVERTIDO' },
    });
    if (count === 0) throw new VentaError(`La cotización ${cot.numDoc} ya fue procesada.`, 409);
  }

  const lineas = items.map(item => {
    const prod = productos.get(item.id);
    const price = preciosCotizados.get(item.id) ?? prod.price;
    return { ...item, name: prod.name, code: prod.code, price, subtotal: redondear(price * item.qty) };
  });
  const totalVenta = redondear(lineas.reduce((sum, l) => sum + l.subtotal, 0));

  if (totalEsperado !== undefined && totalEsperado !== null && Math.abs(Number(totalEsperado) - totalVenta) > 0.01) {
    throw new VentaError(
      `Los precios cambiaron: el total actual es S/ ${totalVenta.toFixed(2)} y no S/ ${Number(totalEsperado).toFixed(2)}. Revise el carrito antes de cobrar.`,
      409,
      'PRECIOS_CAMBIARON',
      { precios: lineas.map(l => ({ id: l.id, price: l.price })) }
    );
  }

  let efectivoVenta = 0;
  let digitalVenta = 0;
  if (payMethodEnum === 'EFECTIVO') efectivoVenta = totalVenta;
  else if (['TARJETA', 'YAPE_PLIN', 'TRANSFERENCIA'].includes(payMethodEnum)) digitalVenta = totalVenta;
  else if (payMethodEnum === 'PAGO_MIXTO') {
    efectivoVenta = Number(mixCash);
    digitalVenta = Number(mixDigital);
    if (!Number.isFinite(efectivoVenta) || !Number.isFinite(digitalVenta) || efectivoVenta < 0 || digitalVenta < 0) {
      throw new VentaError('Los montos del pago mixto son inválidos.');
    }
    if (Math.abs(efectivoVenta + digitalVenta - totalVenta) > 0.01) {
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
    if (totalVenta > disponible) {
      throw new VentaError(`Crédito insuficiente para ${cliente.name}. Límite: S/ ${limite.toFixed(2)}, Deuda Actual: S/ ${deudaActual.toFixed(2)}, Disponible: S/ ${disponible.toFixed(2)}. Intentó fiar: S/ ${totalVenta.toFixed(2)}.`);
    }
  }

  const cajaAbierta = await tx.cajaChica.findFirst({
    where: { usuarioId: cajaUsuarioId, estado: 'ABIERTA' },
    orderBy: { createdAt: 'desc' },
  });
  if (!cajaAbierta) throw new VentaError('No hay una caja abierta para este usuario.');

  const numDoc = await nextDocumentNumber(tx, docTypeEnum);

  const venta = await tx.venta.create({
    data: {
      docType: docTypeEnum,
      numDoc,
      payMethod: payMethodEnum,
      mixCash: payMethodEnum === 'PAGO_MIXTO' ? efectivoVenta : 0,
      mixDigital: payMethodEnum === 'PAGO_MIXTO' ? digitalVenta : 0,
      payCode: payCode ? String(payCode).trim() : null,
      total: totalVenta,
      clienteId,
      vendedorId,
      cajaId: cajaAbierta.id,
    },
  });

  if (efectivoVenta > 0 || digitalVenta > 0) {
    await tx.cajaChica.update({
      where: { id: cajaAbierta.id },
      data: {
        ventasEfectivo: { increment: efectivoVenta },
        ventasDigital: { increment: digitalVenta },
      },
    });
  }

  for (const linea of lineas) {
    // Descuento condicional: si otra venta ya tomó el stock, no se actualiza ninguna fila.
    const { count } = await tx.producto.updateMany({
      where: { id: linea.id, active: true, stock: { gte: linea.qty } },
      data: { stock: { decrement: linea.qty } },
    });
    const { stock } = await tx.producto.findUnique({ where: { id: linea.id }, select: { stock: true } });
    if (count === 0) {
      throw new VentaError(`Stock insuficiente para ${linea.name}. Disponible: ${stock}.`, 409);
    }

    await tx.detalleVenta.create({
      data: {
        ventaId: venta.id,
        productoId: linea.id,
        quantity: linea.qty,
        unitPrice: linea.price,
        subtotal: linea.subtotal,
      },
    });

    await tx.movimientoKardex.create({
      data: {
        productoId: linea.id,
        type: 'SALIDA',
        qty: linea.qty,
        stockAfter: stock,
        ref: cotizacionId ? `Venta ${numDoc} (por cotización)` : `Venta ${numDoc}`,
        usuarioId: vendedorId,
      },
    });
  }

  if (payMethodEnum === 'FIADO') {
    let credito = await tx.creditoCliente.findUnique({ where: { clienteId } });
    if (!credito) {
      credito = await tx.creditoCliente.create({ data: { clienteId, debtTotal: 0, maxCredit: 1000.0 } });
    }

    await tx.creditoCliente.update({
      where: { clienteId },
      data: { debtTotal: { increment: totalVenta }, lastPurchase: new Date() },
    });

    await tx.abonoCredito.create({
      data: {
        creditoId: credito.id,
        amount: totalVenta,
        docRef: numDoc,
        desc: lineas.map(l => `${l.qty}x ${l.name}`).join(', '),
        type: 'CARGO',
      },
    });
  }

  return { ...venta, items: lineas.map(({ id, name, code, qty, price, subtotal }) => ({ id, name, code, qty, price, subtotal })) };
}

export async function procesarVenta(prisma, payload) {
  const items = normalizarCarrito(payload.cart);
  const toId = (v) => (v === undefined || v === null || v === '' ? null : parseInt(v, 10) || null);

  const vendedorId = toId(payload.vendedorId);
  const cajaUsuarioId = toId(payload.usuarioCajaId) || vendedorId;
  if (!cajaUsuarioId) throw new VentaError('Debe indicarse el usuario de caja.');

  const datos = {
    items,
    docTypeEnum: DOC_TYPES[payload.docType] || 'NOTA_VENTA',
    payMethodEnum: PAY_METHODS[payload.payMethod] || 'EFECTIVO',
    mixCash: payload.mixCash,
    mixDigital: payload.mixDigital,
    payCode: payload.payCode,
    clienteId: toId(payload.clienteId),
    vendedorId,
    cajaUsuarioId,
    cotizacionId: toId(payload.cotizacionId),
    totalEsperado: payload.totalEsperado,
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
  if (error.code === 'P2002') {
    return res.status(409).json({ error: 'No se pudo generar el número de comprobante. Intente nuevamente.' });
  }
  console.error(`[${contexto}]`, error);
  return res.status(500).json({ error: 'Error interno al procesar la venta.' });
}
