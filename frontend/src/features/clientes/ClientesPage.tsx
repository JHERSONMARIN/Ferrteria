// Clientes: el directorio con sus datos, su lista de precios y su límite de crédito.
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Customer, PriceListRequest } from '@ferresys/contracts/customers';
import { api } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';
import { useCustomers } from '../../api/queries.ts';
import { useToast, useConfirm, SearchInput, EmptyState, Pagination, usePagination } from '../../shared/ui/index.ts';
import CustomerFormModal from './components/CustomerFormModal.tsx';
import CreditLimitModal from './components/CreditLimitModal.tsx';

type Editing = { customer: Customer | null } | null;

export default function ClientesPage({ initialSearch = '' }: { initialSearch?: string }) {
  const aviso = useToast();
  const confirmar = useConfirm();
  const queryClient = useQueryClient();
  const clientsQuery = useCustomers();
  const clients = clientsQuery.data ?? [];
  // Búsqueda por nombre o documento: con muchas cuentas es la única forma de encontrar una.
  const [busqueda, setBusqueda] = useState(initialSearch);
  // Formulario abierto: el cliente a editar (null = uno nuevo).
  const [form, setForm] = useState<Editing>(null);
  // Ventana del límite de crédito.
  const [creditTarget, setCreditTarget] = useState<Customer | null>(null);

  useEffect(() => {
    if (clientsQuery.error) aviso.error(`Error cargando clientes: ${clientsQuery.error.message}`);
  }, [clientsQuery.error, aviso]);

  const sinTildes = (texto: string | null | undefined) => (texto || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const clientesFiltrados = clients.filter(c => {
    const q = sinTildes(busqueda).trim();
    if (!q) return true;
    return sinTildes(c.name).includes(q) || sinTildes(c.doc).includes(q) || sinTildes(c.phone).includes(q);
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.customers });

  const handleSaved = async (message: string) => {
    setForm(null);
    await refresh();
    aviso.exito(message);
  };

  const handleCreditSaved = async () => {
    setCreditTarget(null);
    await refresh();
    aviso.exito('Límite de crédito actualizado.');
  };

  const togglePriceList = async (client: Customer) => {
    const next = client.priceList === 'WHOLESALE' ? 'RETAIL' : 'WHOLESALE';
    const label = next === 'WHOLESALE' ? 'mayorista' : 'minorista';
    const seguro = await confirmar({
      title: 'Cambiar la lista de precios',
      description: `${client.name} pasará a la lista ${label}.`,
      confirmText: 'Cambiar',
    });
    if (!seguro) return;
    try {
      await api.put(`/clientes/${client.id}/price-list`, { priceList: next } satisfies PriceListRequest);
      await refresh();
    } catch (err) {
      aviso.error(`Error al cambiar la lista de precios: ${(err as Error).message}`);
    }
  };

  // Máximo 10 por página; en pantallas chicas se ve la página completa sin scroll interno.
  const pg = usePagination(clientesFiltrados);

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-surface rounded-xl shadow-sm border border-line flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-line flex justify-between items-center bg-surface-muted">
          <div>
            <p className="text-sm font-bold text-ink">
              {busqueda ? `${clientesFiltrados.length} de ${clients.length}` : clients.length} cliente{clients.length === 1 ? '' : 's'}
            </p>
            <p className="text-xs text-muted">Datos del cliente y su límite de crédito (fiado).</p>
          </div>
          <button onClick={() => setForm({ customer: null })} className="bg-brand hover:bg-brand-strong text-brand-contrast px-4 py-2 rounded-xl text-sm font-semibold shadow-card transition-colors flex items-center gap-2">
            <i className="fa-solid fa-user-plus"></i> Nuevo cliente
          </button>
        </div>

        <div className="p-4 border-b border-line">
          <SearchInput
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, DNI/RUC o teléfono…"
            className="max-w-md"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-muted text-muted text-xs uppercase shadow-sm">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">DNI / RUC</th>
                <th className="px-4 py-3">Nombre / Razón Social</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3 text-center">Precios</th>
                <th className="px-4 py-3 text-right">Deuda Actual</th>
                <th className="px-4 py-3 text-right">Límite Crédito</th>
                <th className="px-4 py-3 text-right">Crédito Disponible</th>
                <th className="px-4 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-line">
              {pg.pageItems.map(c => (
                <tr key={c.id} className="hover:bg-surface-muted border-b border-line">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.type === 'EMPRESA' ? 'bg-info-soft text-info' : 'bg-info-soft text-info'}`}>
                      {c.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold">{c.doc}</td>
                  <td className="px-4 py-3 font-bold text-ink">{c.name}</td>
                  <td className="px-4 py-3 text-xs">{c.phone || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => togglePriceList(c)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                        c.priceList === 'WHOLESALE'
                          ? 'bg-info-soft text-info border-info/30'
                          : 'bg-surface-muted text-ink-soft border-line'
                      }`}
                      title="Cambiar lista de precios"
                    >
                      {c.priceList === 'WHOLESALE' ? 'Mayorista' : 'Minorista'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-danger">S/ {c.currentDebt.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink-soft">S/ {c.maxCredit.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-black text-success">S/ {c.availableCredit.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1.5">
                      <button
                        onClick={() => setForm({ customer: c })}
                        className="text-xs bg-surface-muted hover:bg-line text-ink-soft font-bold px-2.5 py-1 rounded shadow-sm whitespace-nowrap"
                        title="Editar datos del cliente"
                      >
                        <i className="fa-solid fa-pen mr-1"></i> Editar
                      </button>
                      <button
                        onClick={() => setCreditTarget(c)}
                        className="text-xs bg-surface-muted hover:bg-line text-ink-soft font-bold px-2.5 py-1 rounded shadow-sm whitespace-nowrap"
                        title="Editar límite de crédito"
                      >
                        <i className="fa-solid fa-hand-holding-dollar mr-1"></i> Crédito
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {clientesFiltrados.length === 0 && (
            <EmptyState
              icon="fa-users"
              title={clients.length === 0 ? 'Todavía no hay clientes' : 'Ningún cliente coincide'}
              description={clients.length === 0
                ? 'Registre a sus clientes para llevarles el crédito y su historial de compras.'
                : 'Pruebe con el nombre, el documento o el teléfono.'}
            />
          )}
        </div>
        <Pagination {...pg} />
      </div>

      {form && <CustomerFormModal editing={form.customer} onClose={() => setForm(null)} onSaved={handleSaved} />}

      {creditTarget && (
        <CreditLimitModal creditTarget={creditTarget} onClose={() => setCreditTarget(null)} onSaved={handleCreditSaved} />
      )}
    </div>
  );
}
