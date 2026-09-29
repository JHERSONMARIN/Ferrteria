// Series de comprobante en la base.
import type { prisma } from '../../../db.ts';
import {
  DocumentSeriesError, SERIES_PREFIX, formatDocumentNumber, issuedNumber, nextFreeSeriesCode,
} from '../domain/documentNumber.ts';
import type { DocType } from '../domain/sale.ts';

type Db = Pick<typeof prisma, 'branch' | 'documentSeries' | 'venta'>;

// Crea las series que falten para cada sucursal activa, continuando la numeración desde la última venta
// emitida con ese código para no repetir comprobantes en bases con datos previos. Se ejecuta al arrancar
// y al crear o reactivar una sucursal, fuera de cualquier transacción de venta.
export async function initializeDocumentSeries(db: Db): Promise<void> {
  const branches = await db.branch.findMany({ where: { active: true }, orderBy: { id: 'asc' }, select: { id: true, name: true } });
  for (const branch of branches) {
    for (const [documentType, prefix] of Object.entries(SERIES_PREFIX) as [DocType, string][]) {
      const existing = await db.documentSeries.findFirst({ where: { documentType, branchId: branch.id } });
      if (existing) continue;

      const used = await db.documentSeries.findMany({ where: { series: { startsWith: prefix } }, select: { series: true } });
      const series = nextFreeSeriesCode(new Set(used.map(s => s.series)), prefix);
      const lastSale = await db.venta.findFirst({
        where: { numDoc: { startsWith: `${series}-` } }, orderBy: { numDoc: 'desc' }, select: { numDoc: true },
      });
      const lastNumber = issuedNumber(lastSale?.numDoc, series);
      try {
        await db.documentSeries.create({ data: { documentType, series, lastNumber, isDefault: true, branchId: branch.id } });
        console.log(`[documentSeries] Serie ${series} creada para ${branch.name}, continúa desde ${lastNumber}.`);
      } catch (error) {
        // Otra instancia del servidor la creó al mismo tiempo.
        if ((error as { code?: string }).code !== 'P2002') throw error;
      }
    }
  }
}

// Debe llamarse dentro de la transacción de la venta: el UPDATE bloquea la fila de la serie hasta el
// commit, así dos ventas simultáneas nunca obtienen el mismo número, y si la venta falla el incremento
// se revierte sin dejar huecos.
export async function nextDocumentNumber(tx: Pick<Db, 'documentSeries'>, documentType: DocType, branchId: number): Promise<string> {
  const series = await tx.documentSeries.findFirst({
    where: { documentType, branchId, isDefault: true, isActive: true },
    select: { id: true },
  });
  if (!series) throw new DocumentSeriesError('La sucursal no tiene una serie activa para este tipo de comprobante.');
  const updated = await tx.documentSeries.update({
    where: { id: series.id },
    data: { lastNumber: { increment: 1 } },
    select: { series: true, lastNumber: true },
  });
  return formatDocumentNumber(updated.series, updated.lastNumber);
}
