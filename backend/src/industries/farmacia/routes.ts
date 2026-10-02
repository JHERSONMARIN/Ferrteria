// Pantallas propias de farmacia: vencimientos (por sucursal) y libro de controlados (por período).
import express, { type Request, type Response } from 'express';
import { z } from '@ferresys/contracts/zod';
import { AppError, errorBody } from '@ferresys/shared/errors';
import type { ControlledBookEntry, ExpiryReport } from '@ferresys/contracts/industries';
import type { Sendable } from '@ferresys/contracts/common';
import { prisma } from '../../db.ts';
import { resolveBranchId } from '../../modules/branches/index.ts';
import { parseRange } from '../../modules/reports/index.ts';
import { roundQuantity } from '../../utils/quantities.ts';
import type { IndustryRoute } from '../hooks.ts';
import { PharmacyError, isExpired, todayInLima } from './lots.ts';

const handle = (what: string, fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof AppError) return res.status(error.status).json(errorBody(error));
    console.error(`[farmacia] Error al ${what}:`, error);
    res.status(500).json({ error: `No se pudo ${what}.` });
  }
};

const toDay = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => toDay(new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000));

const ExpiryQuery = z.object({
  days: z.coerce.number().int().min(1).max(730).default(90).catch(90),
  branchId: z.string().optional(),
});

const expiryRoutes = express.Router();

// GET /api/rubro/vencimientos?days=90&branchId=: lo vencido y lo que vence en los próximos días, más lo sin lote.
expiryRoutes.get('/', handle('listar los vencimientos', async (req, res) => {
  const query = ExpiryQuery.parse(req.query);
  const branchId = await resolveBranchId(prisma, req.user, query.branchId);
  const today = todayInLima();

  const [lots, stocks, lotTotals] = await Promise.all([
    prisma.pharmacyLot.findMany({
      where: { branchId, quantity: { gt: 0 }, expiresAt: { lte: new Date(`${addDays(today, query.days)}T00:00:00Z`) } },
      include: { producto: { select: { code: true, name: true } } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.branchStock.findMany({
      where: { branchId, stock: { gt: 0 }, producto: { active: true } },
      select: { productoId: true, stock: true, producto: { select: { code: true, name: true } } },
    }),
    prisma.pharmacyLot.groupBy({ by: ['productoId'], where: { branchId, quantity: { gt: 0 } }, _sum: { quantity: true } }),
  ]);

  const inLots = new Map(lotTotals.map(t => [t.productoId, Number(t._sum.quantity ?? 0)]));
  const unlotted = stocks
    .map(s => ({ productId: s.productoId, code: s.producto.code, name: s.producto.name, quantity: roundQuantity(Number(s.stock) - (inLots.get(s.productoId) ?? 0)) }))
    .filter(row => row.quantity > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    today,
    days: query.days,
    branchId,
    lots: lots.map(lot => {
      const expiresAt = toDay(lot.expiresAt);
      return {
        productId: lot.productoId, code: lot.producto.code, name: lot.producto.name, lotNumber: lot.lotNumber,
        expiresAt, quantity: Number(lot.quantity), expired: isExpired(expiresAt, today),
      };
    }),
    unlotted,
  } satisfies Sendable<ExpiryReport>);
}));

const controlledRoutes = express.Router();

// GET /api/rubro/controlados?from=&to=: cada venta cobrada de un controlado en el período, con su receta.
controlledRoutes.get('/', handle('obtener el libro de controlados', async (req, res) => {
  let period;
  try {
    period = parseRange(req.query as { from?: string; to?: string });
  } catch (error) {
    throw new PharmacyError((error as Error).message, 400);
  }
  const sales = await prisma.venta.findMany({
    where: {
      status: { in: ['PAID', 'DISPATCHED'] },
      paidAt: { gte: period.start, lt: period.end },
      detalles: { some: { producto: { industryData: { path: ['controlled'], equals: true } } } },
    },
    select: {
      id: true, numDoc: true, paidAt: true, industryData: true,
      branch: { select: { name: true } },
      vendedor: { select: { name: true } },
      detalles: { select: { quantity: true, unitName: true, producto: { select: { code: true, name: true, unit: true, industryData: true } } } },
    },
    orderBy: { paidAt: 'asc' },
  });

  const text = (data: unknown, key: string) => {
    const value = (data as Record<string, unknown> | null)?.[key];
    return typeof value === 'string' ? value : null;
  };
  const entries: ControlledBookEntry[] = sales.flatMap(sale => sale.detalles
    .filter(line => (line.producto.industryData as Record<string, unknown> | null)?.controlled === true)
    .map(line => ({
      saleId: sale.id,
      numDoc: sale.numDoc,
      date: (sale.paidAt ?? new Date(0)).toISOString(),
      branch: sale.branch.name,
      seller: sale.vendedor?.name ?? null,
      code: line.producto.code,
      product: line.producto.name,
      quantity: Number(line.quantity),
      unit: line.unitName ?? line.producto.unit,
      prescriptionNumber: text(sale.industryData, 'prescriptionNumber'),
      prescriber: text(sale.industryData, 'prescriber'),
      patient: text(sale.industryData, 'patient'),
    })));
  res.json(entries satisfies Sendable<ControlledBookEntry[]>);
}));

export const farmaciaRoutes: IndustryRoute[] = [
  { path: 'vencimientos', access: { default: ['inventory', 'kardex'] }, router: expiryRoutes },
  { path: 'controlados', access: { default: 'admin' }, router: controlledRoutes },
];
