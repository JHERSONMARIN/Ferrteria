// Vencimientos: lo vencido (hay que retirarlo), lo que vence pronto y lo que no tiene lote (no se sabe cuándo vence).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ExpiryReport } from '@ferresys/contracts/industries';
import { api } from '../../api/client.ts';
import { formatQuantity } from '../../shared/utils/quantities.ts';
import { Badge, EmptyState, SkeletonTable, Table, TBody, Td, Th, THead, Tr } from '../../shared/ui/index.ts';

const PLAZOS = [30, 60, 90, 180];
const fecha = (day: string) => day.split('-').reverse().join('/');

export default function VencimientosPage() {
  const [days, setDays] = useState(90);
  const query = useQuery({
    queryKey: ['rubro', 'vencimientos', days],
    queryFn: () => api.get<ExpiryReport>(`/rubro/vencimientos?days=${days}`),
    placeholderData: previous => previous,
  });
  const data = query.data;
  const vencidos = data?.lots.filter(l => l.expired).length ?? 0;

  return (
    <div className="tab-content active h-full p-4 overflow-auto flex flex-col gap-4">
      <section className="bg-surface rounded-xl shadow-sm border border-line">
        <div className="p-4 border-b border-line bg-surface-muted flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold text-ink flex-1">
            {data ? `${vencidos} lote${vencidos === 1 ? '' : 's'} vencido${vencidos === 1 ? '' : 's'} · ${data.lots.length - vencidos} por vencer` : 'Lotes'}
          </p>
          <label className="flex items-center gap-2 text-xs text-muted">
            Vencen en los próximos
            <select value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Plazo"
              className="border border-line rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:border-brand">
              {PLAZOS.map(d => <option key={d} value={d}>{d} días</option>)}
            </select>
          </label>
        </div>
        <div className="p-4">
          {query.error && <p className="text-sm text-danger mb-3">{query.error.message}</p>}
          {!data && query.isFetching && <SkeletonTable rows={5} columns={5} />}
          {data && data.lots.length === 0 && (
            <EmptyState icon="fa-calendar-check" title="Nada vencido ni por vencer" description={`Ningún lote vence en los próximos ${days} días.`} />
          )}
          {data && data.lots.length > 0 && (
            <Table>
              <THead><Th>Producto</Th><Th>Lote</Th><Th>Vence</Th><Th align="right">Cantidad</Th><Th>Estado</Th></THead>
              <TBody>
                {data.lots.map(lot => (
                  <Tr key={`${lot.productId}-${lot.lotNumber}-${lot.expiresAt}`}>
                    <Td><span className="font-semibold text-ink">{lot.name}</span> <span className="text-xs text-muted font-mono">{lot.code}</span></Td>
                    <Td className="font-mono text-xs">{lot.lotNumber}</Td>
                    <Td>{fecha(lot.expiresAt)}</Td>
                    <Td numeric>{formatQuantity(lot.quantity)}</Td>
                    <Td>
                      {lot.expired
                        ? <Badge tone="danger" icon="fa-ban">Vencido: retírelo</Badge>
                        : <Badge tone="warning" icon="fa-hourglass-half">Por vencer</Badge>}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>

      {data && data.unlotted.length > 0 && (
        <section className="bg-surface rounded-xl shadow-sm border border-line">
          <div className="p-4 border-b border-line bg-surface-muted">
            <p className="text-sm font-bold text-ink">Stock sin lote</p>
            <p className="text-xs text-muted">No se sabe cuándo vence: el stock inicial, lo importado y los ingresos sin lote. Se vende después de los lotes.</p>
          </div>
          <div className="p-4">
            <Table>
              <THead><Th>Producto</Th><Th align="right">Cantidad</Th></THead>
              <TBody>
                {data.unlotted.map(row => (
                  <Tr key={row.productId}>
                    <Td><span className="font-semibold text-ink">{row.name}</span> <span className="text-xs text-muted font-mono">{row.code}</span></Td>
                    <Td numeric>{formatQuantity(row.quantity)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
