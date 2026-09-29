// Créditos: las deudas de los clientes (fiado) y sus abonos.
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreditAccount } from '@ferresys/contracts/customers';
import { api } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';
import { useToast, Pagination, usePagination } from '../../shared/ui/index.ts';
import CreditPaymentModal from './components/CreditPaymentModal.tsx';

export default function CreditosPage() {
  const aviso = useToast();
  const queryClient = useQueryClient();
  const creditosQuery = useQuery({ queryKey: queryKeys.credits, queryFn: () => api.get<CreditAccount[]>('/creditos') });
  const creditos = creditosQuery.data ?? [];
  const [selectedCredito, setSelectedCredito] = useState<CreditAccount | null>(null);

  useEffect(() => {
    if (creditosQuery.error) aviso.error(`Error cargando créditos: ${creditosQuery.error.message}`);
  }, [creditosQuery.error, aviso]);

  // El abono baja la deuda: también cambia el crédito disponible en Clientes y en Vender.
  const handleSaved = async () => {
    setSelectedCredito(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.credits }),
      queryClient.invalidateQueries({ queryKey: queryKeys.customers }),
    ]);
  };

  // Máximo 10 por página; en pantallas chicas se ve la página completa sin scroll interno.
  const pg = usePagination(creditos);

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-surface rounded-xl shadow-sm border border-line flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-line flex justify-between items-center bg-surface-muted">
          <div>
            <p className="text-xs text-muted">Deudas de clientes, abonos y control del límite de fiado.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-muted text-muted text-xs uppercase shadow-sm">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Último Movimiento</th>
                <th className="px-4 py-3 text-right">Límite Crédito</th>
                <th className="px-4 py-3 text-right">Deuda Pendiente</th>
                <th className="px-4 py-3 text-right">Crédito Disponible</th>
                <th className="px-4 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-line">
              {creditos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    No hay clientes con cuentas por cobrar pendientes.
                  </td>
                </tr>
              ) : (
                pg.pageItems.map(c => (
                  <tr key={c.id} className="hover:bg-surface-muted border-b border-line">
                    <td className="px-4 py-4 font-bold text-ink-soft">{c.name}</td>
                    <td className="px-4 py-4 text-xs text-muted">{c.lastPurchase}</td>
                    <td className="px-4 py-4 text-right font-semibold text-ink-soft">S/ {c.maxCredit.toFixed(2)}</td>
                    <td className="px-4 py-4 text-right font-black text-danger">S/ {c.debt.toFixed(2)}</td>
                    <td className="px-4 py-4 text-right font-black text-success">S/ {c.availableCredit.toFixed(2)}</td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => setSelectedCredito(c)}
                        className="bg-panel hover:bg-panel-strong transition-colors text-white text-xs px-3 py-2 rounded font-bold shadow"
                      >
                        <i className="fa-solid fa-eye mr-1"></i> Ver Detalle / Abono
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...pg} />
      </div>

      {/* Modal Estado de Cuenta */}
      {selectedCredito && (
        <CreditPaymentModal account={selectedCredito} onClose={() => setSelectedCredito(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}
