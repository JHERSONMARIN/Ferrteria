// Reportes por período. Se agregan en SQL para no traer todas las ventas a memoria.
// Una venta cuenta el día en que se cobró (paidAt; las anteriores a la Fase 3 no lo tienen y usan
// createdAt). Las fechas son días de Perú (UTC-5, sin horario de verano). Las consultas crudas no pasan
// por la conversión de Decimal de db.js, por eso los montos se convierten a float8 en el SQL.

import { Prisma } from '@prisma/client';
import { roundMoney, roundQuantity } from '../utils/quantities.js';

export class ReportError extends Error {}

const BUSINESS_TIME_ZONE = 'America/Lima';
const BUSINESS_UTC_OFFSET = '-05:00';
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;
const TOP_PRODUCTS = 20;
const ROTATION_LIMIT = 50;
// Por debajo de esta cobertura (días de venta que alcanza el stock) conviene reponer.
const LOW_COVERAGE_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

const todayInLima = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const startOfDay = (day) => new Date(`${day}T00:00:00.000${BUSINESS_UTC_OFFSET}`);
const addDays = (day, n) => new Date(startOfDay(day).getTime() + n * DAY_MS).toISOString().slice(0, 10);

export function parseRange(query) {
  for (const key of ['from', 'to']) {
    if (query[key] && !DAY_PATTERN.test(query[key])) throw new ReportError('Fecha no válida (use AAAA-MM-DD).');
  }
  const to = query.to || todayInLima();
  const from = query.from || addDays(to, -(DEFAULT_DAYS - 1));
  if (Number.isNaN(startOfDay(from).getTime()) || Number.isNaN(startOfDay(to).getTime())) {
    throw new ReportError('Fecha no válida.');
  }
  const days = Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS) + 1;
  if (days < 1) throw new ReportError('La fecha inicial debe ser anterior o igual a la final.');
  if (days > MAX_DAYS) throw new ReportError(`El rango no puede superar ${MAX_DAYS} días.`);
  return { from, to, days, start: startOfDay(from), end: new Date(startOfDay(to).getTime() + DAY_MS) };
}

const PAY_METHOD_LABELS = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', YAPE_PLIN: 'Yape/Plin', TRANSFERENCIA: 'Transferencia', PAGO_MIXTO: 'Pago mixto', FIADO: 'Fiado',
};

export async function salesReport(db, query) {
  const range = parseRange(query);
  // Ventas cobradas dentro del rango; se reutiliza en todas las consultas. Las columnas guardan la hora
  // UTC sin zona y la sesión de PostgreSQL está en hora de Lima: los límites se pasan a UTC de forma
  // explícita para que la comparación no dependa de la zona de la sesión.
  const utc = (date) => Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const inRange = Prisma.sql`v.status IN ('PAID', 'DISPATCHED')
    AND COALESCE(v."paidAt", v."createdAt") >= ${utc(range.start)} AND COALESCE(v."paidAt", v."createdAt") < ${utc(range.end)}`;
  const localDay = Prisma.sql`((COALESCE(v."paidAt", v."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE})::date`;

  const [summaryRows, payMethods, sellers, cashiers, daily, topProducts, products] = await Promise.all([
    db.$queryRaw`SELECT count(*)::int AS sales, COALESCE(sum(v.total), 0)::float8 AS revenue, COALESCE(sum(v.discount), 0)::float8 AS discounts,
        count(*) FILTER (WHERE v.discount > 0)::int AS "discountedSales"
      FROM ventas v WHERE ${inRange}`,
    db.$queryRaw`SELECT v."payMethod"::text AS method, count(*)::int AS sales, sum(v.total)::float8 AS total
      FROM ventas v WHERE ${inRange} GROUP BY v."payMethod" ORDER BY total DESC`,
    db.$queryRaw`SELECT v."vendedorId" AS "userId", COALESCE(u.name, 'Sin vendedor') AS name, count(*)::int AS sales,
        sum(v.total)::float8 AS total, sum(v.discount)::float8 AS discounts
      FROM ventas v LEFT JOIN usuarios u ON u.id = v."vendedorId" WHERE ${inRange}
      GROUP BY v."vendedorId", u.name ORDER BY total DESC`,
    db.$queryRaw`SELECT v."paidById" AS "userId", COALESCE(u.name, 'Sin registrar') AS name, count(*)::int AS sales, sum(v.total)::float8 AS total
      FROM ventas v LEFT JOIN usuarios u ON u.id = v."paidById" WHERE ${inRange}
      GROUP BY v."paidById", u.name ORDER BY total DESC`,
    db.$queryRaw`SELECT to_char(${localDay}, 'YYYY-MM-DD') AS day, count(*)::int AS sales, sum(v.total)::float8 AS total
      FROM ventas v WHERE ${inRange} GROUP BY 1 ORDER BY 1`,
    db.$queryRaw`SELECT p.id, p.code, p.name, p.unit, sum(d.quantity)::float8 AS quantity, sum(d.subtotal)::float8 AS amount,
        count(DISTINCT d."ventaId")::int AS sales
      FROM detalle_ventas d JOIN ventas v ON v.id = d."ventaId" JOIN productos p ON p.id = d."productoId"
      WHERE ${inRange} GROUP BY p.id ORDER BY amount DESC LIMIT ${TOP_PRODUCTS}`,
    db.$queryRaw`SELECT p.id, p.code, p.name, p.unit, p.stock::float8 AS stock, p.price::float8 AS price,
        COALESCE(sold.quantity, 0)::float8 AS sold
      FROM productos p
      LEFT JOIN (
        SELECT d."productoId", sum(d.quantity) AS quantity
        FROM detalle_ventas d JOIN ventas v ON v.id = d."ventaId" WHERE ${inRange} GROUP BY d."productoId"
      ) sold ON sold."productoId" = p.id
      WHERE p.active`,
  ]);

  const summary = summaryRows[0];
  const withAverage = (row) => ({ ...row, total: roundMoney(row.total), average: row.sales ? roundMoney(row.total / row.sales) : 0 });

  // Ventas por día, incluidos los días sin ventas (para el gráfico).
  const dailyByDay = new Map(daily.map(d => [d.day, d]));
  const dailySeries = Array.from({ length: range.days }, (_, i) => {
    const day = addDays(range.from, i);
    const row = dailyByDay.get(day);
    return { day, sales: row?.sales ?? 0, total: roundMoney(row?.total ?? 0) };
  });

  // Rotación: cobertura = días de venta que alcanza el stock al ritmo del período.
  const rotation = products.map(p => {
    const dailyAverage = p.sold / range.days;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit,
      stock: roundQuantity(p.stock),
      sold: roundQuantity(p.sold),
      dailyAverage: roundQuantity(dailyAverage),
      coverageDays: dailyAverage > 0 ? Math.floor(p.stock / dailyAverage) : null,
      stockValue: roundMoney(Math.max(p.stock, 0) * p.price),
    };
  });
  const lowCoverage = rotation
    .filter(p => p.coverageDays !== null && p.coverageDays < LOW_COVERAGE_DAYS)
    .sort((a, b) => a.coverageDays - b.coverageDays);
  const noMovement = rotation.filter(p => p.sold === 0 && p.stock > 0).sort((a, b) => b.stockValue - a.stockValue);

  return {
    range: { from: range.from, to: range.to, days: range.days },
    summary: {
      sales: summary.sales,
      revenue: roundMoney(summary.revenue),
      discounts: roundMoney(summary.discounts),
      discountedSales: summary.discountedSales,
      averageTicket: summary.sales ? roundMoney(summary.revenue / summary.sales) : 0,
    },
    payMethods: payMethods.map(m => ({ ...m, label: PAY_METHOD_LABELS[m.method] || m.method, total: roundMoney(m.total) })),
    sellers: sellers.map(s => ({ ...withAverage(s), discounts: roundMoney(s.discounts) })),
    cashiers: cashiers.map(withAverage),
    daily: dailySeries,
    topProducts: topProducts.map(p => ({ ...p, quantity: roundQuantity(p.quantity), amount: roundMoney(p.amount) })),
    rotation: {
      lowCoverageDays: LOW_COVERAGE_DAYS,
      lowCoverage: lowCoverage.slice(0, ROTATION_LIMIT),
      lowCoverageCount: lowCoverage.length,
      noMovement: noMovement.slice(0, ROTATION_LIMIT),
      noMovementCount: noMovement.length,
      noMovementValue: roundMoney(noMovement.reduce((sum, p) => sum + p.stockValue, 0)),
    },
  };
}
