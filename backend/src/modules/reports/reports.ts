// Panel y reportes por período. Los reportes se agregan en SQL para no traer todas las ventas a memoria.
// Una venta cuenta el día en que se cobró (paidAt; las anteriores a la Fase 3 no lo tienen y usan
// createdAt). Las consultas crudas no pasan por la conversión de Decimal de db.ts: los montos se
// convierten a float8 en el mismo SQL.
import { Prisma } from '@prisma/client';
import type { prisma } from '../../db.ts';
import { roundMoney, roundQuantity } from '../../utils/quantities.js';
import { requireFeature } from '../licensing/index.ts';
import {
  BUSINESS_TIME_ZONE, LOW_COVERAGE_DAYS, PAY_METHOD_LABELS, ReportError, dailySeries, parseRange, rotation, withAverage,
  type ProductMovement,
} from './period.ts';

type Client = typeof prisma;

const TOP_PRODUCTS = 20;
const ROTATION_LIMIT = 50;
const DEFAULT_MIN_STOCK = 10;

// Solo cuentan como venta las cobradas: los pedidos pendientes o anulados no son ingresos.
const COMPLETED_SALE = { status: { in: ['PAID', 'DISPATCHED'] } } satisfies Prisma.VentaWhereInput;

// Panel de inicio: caja, créditos, inventario, desempeño del personal y últimas ventas.
export async function dashboardStats(client: Client) {
  const [income, credits, salesCount, products, staff, recent] = await Promise.all([
    client.venta.aggregate({ _sum: { total: true }, where: { payMethod: { not: 'FIADO' }, ...COMPLETED_SALE } }),
    client.creditoCliente.aggregate({ _sum: { debtTotal: true } }),
    client.venta.count({ where: COMPLETED_SALE }),
    client.producto.findMany({ where: { active: true }, select: { id: true, stock: true, minStock: true, price: true } }),
    client.usuario.findMany({
      where: { role: { in: ['VENDEDOR', 'ADMINISTRADOR', 'REPARTIDOR'] }, active: true },
      select: {
        id: true, name: true, role: true,
        ventasAsignadas: { where: COMPLETED_SALE, select: { total: true } },
        entregasAsignadas: { select: { status: true } },
      },
    }),
    client.venta.findMany({
      where: COMPLETED_SALE, take: 10, orderBy: { id: 'desc' },
      select: { numDoc: true, payMethod: true, total: true, cliente: { select: { name: true } }, vendedor: { select: { name: true } } },
    }),
  ]);

  const stock = products.map(p => ({ stock: Number(p.stock), minStock: p.minStock === null ? null : Number(p.minStock), price: Number(p.price) }));
  return {
    ingresosCaja: Number(income._sum.total ?? 0),
    deudaCreditos: Number(credits._sum.debtTotal ?? 0),
    salesCount,
    totalProductsCount: products.length,
    totalInventoryValue: Number(stock.reduce((sum, p) => sum + p.stock * p.price, 0).toFixed(2)),
    lowStockCount: stock.filter(p => p.stock <= (p.minStock ?? DEFAULT_MIN_STOCK)).length,
    vendedores: staff.map(v => ({
      id: v.id,
      name: v.name,
      role: v.role,
      ventasCount: v.ventasAsignadas.length,
      totalVendido: v.ventasAsignadas.reduce((sum, s) => sum + Number(s.total), 0),
      entregasAsignadas: v.entregasAsignadas.length,
      entregasCompletadas: v.entregasAsignadas.filter(e => e.status === 'ENTREGADO').length,
    })),
    recentSales: recent.map(s => ({
      doc: s.numDoc,
      customer: s.cliente ? s.cliente.name : 'Público General',
      seller: s.vendedor ? s.vendedor.name : 'General',
      method: s.payMethod,
      total: s.total,
    })),
  };
}

interface GroupRow { userId: number | null; name: string; sales: number; total: number }

export async function salesReport(client: Client, query: { from?: string; to?: string; branchId?: string }) {
  requireFeature('period_reports');
  const period = parseRange(query);
  // Sucursal opcional: sin ella, toda la empresa.
  let branchId: number | null = null;
  if (query.branchId) {
    branchId = parseInt(query.branchId, 10);
    if (Number.isNaN(branchId)) throw new ReportError('Sucursal no válida.');
  }
  const inBranch = branchId ? Prisma.sql`AND v."branchId" = ${branchId}` : Prisma.empty;
  // Las columnas guardan la hora UTC sin zona y la sesión de PostgreSQL está en hora de Lima: los límites
  // se pasan a UTC de forma explícita para que la comparación no dependa de la zona de la sesión.
  const utc = (date: Date) => Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const inRange = Prisma.sql`v.status IN ('PAID', 'DISPATCHED')
    AND COALESCE(v."paidAt", v."createdAt") >= ${utc(period.start)} AND COALESCE(v."paidAt", v."createdAt") < ${utc(period.end)} ${inBranch}`;
  const localDay = Prisma.sql`((COALESCE(v."paidAt", v."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE})::date`;
  // Con sucursal, la rotación usa el stock de esa sucursal; sin ella, el total de la empresa.
  const stockColumn = branchId
    ? Prisma.sql`COALESCE((SELECT b.stock FROM branch_stock b WHERE b."productoId" = p.id AND b."branchId" = ${branchId}), 0)::float8`
    : Prisma.sql`p.stock::float8`;

  const [summaryRows, payMethods, sellers, cashiers, daily, topProducts, products] = await Promise.all([
    client.$queryRaw<{ sales: number; revenue: number; discounts: number; discountedSales: number }[]>`
      SELECT count(*)::int AS sales, COALESCE(sum(v.total), 0)::float8 AS revenue, COALESCE(sum(v.discount), 0)::float8 AS discounts,
        count(*) FILTER (WHERE v.discount > 0)::int AS "discountedSales"
      FROM ventas v WHERE ${inRange}`,
    client.$queryRaw<{ method: string; sales: number; total: number }[]>`
      SELECT v."payMethod"::text AS method, count(*)::int AS sales, sum(v.total)::float8 AS total
      FROM ventas v WHERE ${inRange} GROUP BY v."payMethod" ORDER BY total DESC`,
    client.$queryRaw<(GroupRow & { discounts: number })[]>`
      SELECT v."vendedorId" AS "userId", COALESCE(u.name, 'Sin vendedor') AS name, count(*)::int AS sales,
        sum(v.total)::float8 AS total, sum(v.discount)::float8 AS discounts
      FROM ventas v LEFT JOIN usuarios u ON u.id = v."vendedorId" WHERE ${inRange}
      GROUP BY v."vendedorId", u.name ORDER BY total DESC`,
    client.$queryRaw<GroupRow[]>`
      SELECT v."paidById" AS "userId", COALESCE(u.name, 'Sin registrar') AS name, count(*)::int AS sales, sum(v.total)::float8 AS total
      FROM ventas v LEFT JOIN usuarios u ON u.id = v."paidById" WHERE ${inRange}
      GROUP BY v."paidById", u.name ORDER BY total DESC`,
    client.$queryRaw<{ day: string; sales: number; total: number }[]>`
      SELECT to_char(${localDay}, 'YYYY-MM-DD') AS day, count(*)::int AS sales, sum(v.total)::float8 AS total
      FROM ventas v WHERE ${inRange} GROUP BY 1 ORDER BY 1`,
    client.$queryRaw<{ id: number; code: string; name: string; unit: string; quantity: number; amount: number; sales: number }[]>`
      SELECT p.id, p.code, p.name, p.unit, sum(d.quantity * d."unitFactor")::float8 AS quantity, sum(d.subtotal)::float8 AS amount,
        count(DISTINCT d."ventaId")::int AS sales
      FROM detalle_ventas d JOIN ventas v ON v.id = d."ventaId" JOIN productos p ON p.id = d."productoId"
      WHERE ${inRange} GROUP BY p.id ORDER BY amount DESC LIMIT ${TOP_PRODUCTS}`,
    client.$queryRaw<ProductMovement[]>`
      SELECT p.id, p.code, p.name, p.unit, ${stockColumn} AS stock, p.price::float8 AS price, COALESCE(sold.quantity, 0)::float8 AS sold
      FROM productos p
      LEFT JOIN (
        SELECT d."productoId", sum(d.quantity * d."unitFactor") AS quantity
        FROM detalle_ventas d JOIN ventas v ON v.id = d."ventaId" WHERE ${inRange} GROUP BY d."productoId"
      ) sold ON sold."productoId" = p.id
      WHERE p.active`,
  ]);

  const summary = summaryRows[0]!;
  const { lowCoverage, noMovement } = rotation(products, period.days);
  return {
    range: { from: period.from, to: period.to, days: period.days },
    branchId,
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
    daily: dailySeries(period, daily),
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
