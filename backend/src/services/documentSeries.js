// Series con las que se instaló el sistema originalmente.
const DEFAULT_SERIES = {
  NOTA_VENTA: 'T001',
  BOLETA: 'B001',
  FACTURA: 'F001',
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

// Crea la serie por defecto de cada tipo que aún no tenga una, continuando la numeración
// desde la última venta emitida para no repetir comprobantes en bases con datos previos.
// Se ejecuta al arrancar, fuera de cualquier transacción de venta.
export async function initializeDocumentSeries(db) {
  for (const [documentType, series] of Object.entries(DEFAULT_SERIES)) {
    const existing = await db.documentSeries.findFirst({ where: { documentType } });
    if (existing) continue;

    const lastNumber = await findHighestIssuedNumber(db, series);
    try {
      await db.documentSeries.create({
        data: { documentType, series, lastNumber, isDefault: true },
      });
      console.log(`[documentSeries] Serie ${series} creada, continúa desde ${lastNumber}.`);
    } catch (error) {
      // Otra instancia del servidor la creó al mismo tiempo.
      if (error.code !== 'P2002') throw error;
    }
  }
}

// Debe llamarse dentro de la transacción de la venta: el UPDATE bloquea la fila de la serie
// hasta el commit, así dos ventas simultáneas nunca obtienen el mismo número, y si la venta
// falla el incremento se revierte sin dejar huecos.
export async function nextDocumentNumber(tx, documentType) {
  const series = await tx.documentSeries.findFirst({
    where: { documentType, isDefault: true, isActive: true },
    select: { id: true },
  });
  if (!series) {
    throw new DocumentSeriesError('No hay una serie activa configurada para este tipo de comprobante.');
  }

  const updated = await tx.documentSeries.update({
    where: { id: series.id },
    data: { lastNumber: { increment: 1 } },
    select: { series: true, lastNumber: true },
  });
  return formatDocumentNumber(updated.series, updated.lastNumber);
}
