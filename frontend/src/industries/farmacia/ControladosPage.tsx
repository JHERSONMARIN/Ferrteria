// Libro de controlados: cada venta cobrada de un controlado, con su receta, el médico y el paciente.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ControlledBookEntry } from '@ferresys/contracts/industries';
import { api } from '../../api/client.ts';
import { formatQuantity } from '../../shared/utils/quantities.ts';
import { exportToExcel } from '../../shared/utils/excelExport.ts';
import { EmptyState, SkeletonTable, Table, TBody, Td, Th, THead, Tr } from '../../shared/ui/index.ts';

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const inicioDeMes = () => `${hoy().slice(0, 8)}01`;
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });

export default function ControladosPage() {
  const [from, setFrom] = useState(inicioDeMes);
  const [to, setTo] = useState(hoy);
  const query = useQuery({
    queryKey: ['rubro', 'controlados', from, to],
    queryFn: () => api.get<ControlledBookEntry[]>(`/rubro/controlados?from=${from}&to=${to}`),
    placeholderData: previous => previous,
  });
  const rows = query.data;
  const inputClass = 'border border-line rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:border-brand';

  const exportar = () => rows && exportToExcel(rows.map(r => ({
    Fecha: fechaHora(r.date), Comprobante: r.numDoc ?? '', Sucursal: r.branch, Código: r.code, Producto: r.product,
    Cantidad: r.quantity, Unidad: r.unit, Receta: r.prescriptionNumber ?? '', Médico: r.prescriber ?? '', Paciente: r.patient ?? '',
    Vendedor: r.seller ?? '',
  })), `controlados_${from}_${to}`);

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <section className="bg-surface rounded-xl shadow-sm border border-line">
        <div className="p-4 border-b border-line bg-surface-muted flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold text-ink flex-1">{rows ? `${rows.length} dispensación${rows.length === 1 ? '' : 'es'}` : 'Dispensaciones'}</p>
          <label className="flex items-center gap-2 text-xs text-muted">Desde
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">Hasta
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={inputClass} />
          </label>
          <button type="button" onClick={exportar} disabled={!rows?.length}
            className="px-3 py-2 text-sm font-semibold text-ink-soft border border-line rounded-lg bg-surface hover:bg-surface-muted disabled:opacity-40">
            <i className="fa-solid fa-file-excel mr-1.5"></i> Exportar
          </button>
        </div>
        <div className="p-4">
          {query.error && <p className="text-sm text-danger mb-3">{query.error.message}</p>}
          {!rows && query.isFetching && <SkeletonTable rows={5} columns={6} />}
          {rows && rows.length === 0 && (
            <EmptyState icon="fa-book-medical" title="Sin ventas de controlados" description="No hay ventas cobradas de productos controlados en estas fechas." />
          )}
          {rows && rows.length > 0 && (
            <Table>
              <THead><Th>Fecha</Th><Th>Comprobante</Th><Th>Producto</Th><Th align="right">Cantidad</Th><Th>Receta</Th><Th>Médico</Th><Th>Paciente</Th></THead>
              <TBody>
                {rows.map((r, i) => (
                  <Tr key={`${r.saleId}-${r.code}-${i}`}>
                    <Td className="whitespace-nowrap">{fechaHora(r.date)}</Td>
                    <Td className="font-mono text-xs">{r.numDoc ?? '—'}</Td>
                    <Td><span className="font-semibold text-ink">{r.product}</span> <span className="text-xs text-muted font-mono">{r.code}</span></Td>
                    <Td numeric>{formatQuantity(r.quantity)} {r.unit}</Td>
                    <Td className="font-mono text-xs">{r.prescriptionNumber ?? '—'}</Td>
                    <Td>{r.prescriber ?? '—'}</Td>
                    <Td>{r.patient ?? '—'}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
