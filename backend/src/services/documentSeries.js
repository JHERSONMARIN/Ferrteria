// Series de comprobante por sucursal. Cada sucursal (establecimiento) emite con sus propias series:
// la primera usa T001/B001/F001 (las originales del sistema) y las siguientes reciben el siguiente
// número libre de cada letra (T002, B002, F002…).
const SERIES_PREFIX = {
  NOTA_VENTA: 'T',
  BOLETA: 'B',
  FACTURA: 'F',
};

export class DocumentSeriesError extends Error {}

const formatDocumentNumber = (series, number) => `${series}-${String(number).padStart(6, '0')}`;

async function findHighestIssuedNumber(db, series) {
  const lastSale = await db.venta.findFirst({
    where: { numDoc: { startsWith: `${series}-` } },
    orderBy: { numDoc: 'desc' },
    select: { numDoc: true },
  });
  return lastSale ? parseInt(lastSale.numDoc.slice(series.length + 1), 10) || 0 : 0;
}

// Primer código libre para la letra: T001, T002…
async function nextFreeSeriesCode(db, prefix) {
  const existing = await db.documentSeries.findMany({ where: { series: { startsWith: prefix } }, select: { series: true } });
  const used = new Set(existing.map(s => s.series));
  for (let n = 1; n <= 999; n += 1) {
    const code = `${prefix}${String(n).padStart(3, '0')}`;
    if (!used.has(code)) return code;
  }
  throw new DocumentSeriesError(`No quedan series libres para la letra ${prefix}.`);
}

// Crea las series que falten para cada sucursal activa, continuando la numeración desde la última venta
// emitida con ese código para no repetir comprobantes en bases con datos previos. Se ejecuta al arrancar
// y al crear o reactivar una sucursal, fuera de cualquier transacción de venta.
export async function initializeDocumentSeries(db) {
  const branches = await db.branch.findMany({ where: { active: true }, orderBy: { id: 'asc' }, select: { id: true, name: true } });
  for (const branch of branches) {
    for (const [documentType, prefix] of Object.entries(SERIES_PREFIX)) {
      const existing = await db.documentSeries.findFirst({ where: { documentType, branchId: branch.id } });
      if (existing) continue;

      const series = await nextFreeSeriesCode(db, prefix);
      const lastNumber = await findHighestIssuedNumber(db, series);
      try {
        await db.documentSeries.create({
          data: { documentType, series, lastNumber, isDefault: true, branchId: branch.id },
        });
        console.log(`[documentSeries] Serie ${series} creada para ${branch.name}, continúa desde ${lastNumber}.`);
      } catch (error) {
        // Otra instancia del servidor la creó al mismo tiempo.
        if (error.code !== 'P2002') throw error;
      }
    }
  }
}

// Debe llamarse dentro de la transacción de la venta: el UPDATE bloquea la fila de la serie
// hasta el commit, así dos ventas simultáneas nunca obtienen el mismo número, y si la venta
// falla el incremento se revierte sin dejar huecos.
export async function nextDocumentNumber(tx, documentType, branchId) {
  const series = await tx.documentSeries.findFirst({
    where: { documentType, branchId, isDefault: true, isActive: true },
    select: { id: true },
  });
  if (!series) {
    throw new DocumentSeriesError('La sucursal no tiene una serie activa para este tipo de comprobante.');
  }

  const updated = await tx.documentSeries.update({
    where: { id: series.id },
    data: { lastNumber: { increment: 1 } },
    select: { series: true, lastNumber: true },
  });
  return formatDocumentNumber(updated.series, updated.lastNumber);
}
