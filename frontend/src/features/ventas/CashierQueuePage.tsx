// Por cobrar: la cola de pedidos que los vendedores enviaron a caja. Se refresca sola cada pocos segundos.
import { useState, useEffect, useRef, useMemo, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SaleFlowMode, SessionUser } from '@ferresys/contracts/identity';
import type { CancelOrderRequest, OrderSaved, PayOrderRequest } from '@ferresys/contracts/sales';
import { api } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';
import { useCashStatus, useCustomers } from '../../api/queries.ts';
import { formatSoles } from '../../shared/utils/currency.ts';
import { customerOptionLabel } from '../../shared/utils/customers.ts';
import { buildSaleTicket, type TicketData } from '../../shared/utils/tickets.ts';
import { useConfirm } from '../../shared/ui/index.ts';
import CheckoutModal, { type CheckoutPayment } from './components/CheckoutModal.tsx';
import SaleSuccessModal, { type SaleSuccess } from './components/SaleSuccessModal.tsx';
import { minutesAgo } from './time.ts';
import { useOrderQueue } from './queries.ts';

interface Props {
  currentUser: SessionUser;
  onTriggerPrint?: (ticket: TicketData) => void;
  saleFlowMode?: SaleFlowMode;
  deliveriesEnabled?: boolean;
}

export default function CashierQueuePage({ currentUser, onTriggerPrint, saleFlowMode, deliveriesEnabled = false }: Props) {
  const confirmar = useConfirm();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [customerInput, setCustomerInput] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [success, setSuccess] = useState<SaleSuccess | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Mientras se cobra un pedido la cola no se refresca.
  const queue = useOrderQueue('PENDING_PAYMENT', showCheckout);
  const orders = useMemo(() => queue.data ?? [], [queue.data]);
  const loadError = queue.error ? queue.error.message || 'No se pudo cargar la cola de pedidos.' : '';
  const clients = useCustomers().data ?? [];
  const cashStatus = useCashStatus();
  const cajaAbierta = cashStatus.data ? cashStatus.data.abierta : null;

  const selected = orders.find(o => o.id === selectedId) ?? null;
  const refreshQueue = () => queryClient.invalidateQueries({ queryKey: queryKeys.orders });

  // Si el pedido elegido desaparece de la cola (otro cajero lo cobró o venció), se avisa.
  useEffect(() => {
    if (selectedId && !showCheckout && !orders.some(o => o.id === selectedId)) {
      setSelectedId(null);
      setNotice(`El pedido N° ${selectedId} ya no está pendiente (fue cobrado, anulado o venció).`);
    }
  }, [orders]);

  const selectOrder = (order: (typeof orders)[number]) => {
    setSelectedId(order.id);
    setNotice('');
    const customer = clients.find(c => c.id === order.clienteId);
    setCustomerInput(customer ? customerOptionLabel(customer) : '');
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^n°?\s*/, '');
    if (!q) return orders;
    return orders.filter(o => String(o.id) === q || o.customer.toLowerCase().includes(q) || o.seller.toLowerCase().includes(q));
  }, [orders, search]);

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const number = parseInt(search.replace(/\D/g, ''), 10);
    const match = orders.find(o => o.id === number) ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (match) {
      selectOrder(match);
      setSearch('');
    } else {
      setNotice(`No hay un pedido pendiente con el número ${search}.`);
    }
  };

  const confirmPayment = async (payment: CheckoutPayment) => {
    if (!selected) return;
    const res = await api.post<OrderSaved>(`/pedidos/${selected.id}/cobrar`, {
      docType: payment.docType,
      payMethod: payment.payMethod,
      mixCash: payment.mixCash,
      mixDigital: payment.mixDigital,
      payCode: payment.payCode,
      clienteId: payment.customer ? payment.customer.id : null,
      delivery: payment.delivery,
    } satisfies PayOrderRequest);
    const order = res.pedido;
    // La pantalla de Caja (si sigue abierta en otra parte del sistema) se actualiza con la venta.
    window.dispatchEvent(new Event('venta-registrada'));

    if (onTriggerPrint) {
      onTriggerPrint(buildSaleTicket({ ...payment, numDoc: order.numDoc ?? '', items: order.items, total: order.total, discount: order.discount, sellerName: order.seller }));
      setTimeout(() => window.print(), 300);
    }

    const staged = saleFlowMode === 'STAGED';
    const pickupMessage = staged
      ? 'Indique al cliente que recoja sus productos en despacho con este número.'
      : 'Entregue los productos al cliente.';
    setSuccess({
      icon: order.delivery ? 'fa-truck-fast' : staged ? 'fa-dolly' : 'fa-check',
      title: staged ? 'Pedido cobrado' : 'Venta completada',
      highlight: `N° ${order.id}`,
      subtitle: order.delivery
        ? `Se enviará a domicilio (${order.delivery.ref}). ${staged ? 'Almacén lo preparará para el repartidor.' : 'Entregue los productos al repartidor.'}`
        : pickupMessage,
      rows: [{ label: `${order.numDoc} (${payment.payMethod})`, value: formatSoles(order.total) }],
      change: payment.receivedCash !== null ? payment.receivedCash - order.total : null,
      buttonLabel: 'Siguiente pedido',
    });
    setShowCheckout(false);
    setSelectedId(null);
    refreshQueue();
    // Cambian la caja, el stock (si se despachó en el acto) y la deuda del cliente (fiado).
    queryClient.invalidateQueries({ queryKey: queryKeys.cashStatus });
    queryClient.invalidateQueries({ queryKey: queryKeys.products });
    queryClient.invalidateQueries({ queryKey: queryKeys.customers });
  };

  const cancelSelected = async () => {
    if (!selected) return;
    const seguro = await confirmar({
      title: `Anular el pedido N° ${selected.id}`,
      description: 'Sus productos vuelven a estar disponibles para vender.',
      confirmText: 'Anular pedido',
      tone: 'danger',
    });
    if (!seguro) return;
    try {
      setCancelling(true);
      await api.post<OrderSaved>(`/pedidos/${selected.id}/anular`, { reason: `Anulado en caja por ${currentUser.name}` } satisfies CancelOrderRequest);
      setNotice(`Pedido N° ${selected.id} anulado.`);
      setSelectedId(null);
      refreshQueue();
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
    } catch (err) {
      setNotice((err as Error).message || 'No se pudo anular el pedido.');
    } finally {
      setCancelling(false);
    }
  };

  const closeSuccess = () => {
    setSuccess(null);
    searchRef.current?.focus();
  };

  return (
    <div className="tab-content active h-full p-3 sm:p-4 overflow-y-auto lg:overflow-hidden flex flex-col gap-3">
      {cajaAbierta === false && (
        <div className="bg-danger-soft border border-danger/30 text-danger text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <i className="fa-solid fa-lock"></i>
          <span><strong>No está en un turno de caja.</strong> Abra una caja o únase a un turno en "Arqueo de Caja" para cobrar pedidos.</span>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:min-h-0">
        {/* ===== COLA ===== */}
        <div className="lg:w-[400px] flex flex-col bg-surface rounded-xl shadow-sm border border-line lg:overflow-hidden shrink-0">
          <div className="p-4 border-b border-line flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-ink flex items-center gap-2">
                <i className="fa-solid fa-hand-holding-dollar text-brand"></i> Pedidos por cobrar
              </h3>
              <span className="bg-brand-soft text-brand-text text-xs font-bold px-2.5 py-1 rounded-full">{orders.length}</span>
            </div>
            <div className="relative">
              <i className="fa-solid fa-hashtag absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm"></i>
              <input
                ref={searchRef}
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="N° de pedido, cliente o vendedor"
                className="w-full pl-9 pr-3 py-2.5 border border-line rounded-lg outline-none focus:border-brand text-sm"
              />
            </div>
          </div>

          <div className="flex-1 lg:overflow-y-auto p-3 flex flex-col gap-2 min-h-[160px]">
            {loadError ? (
              <p className="text-sm text-danger text-center py-8">{loadError}</p>
            ) : filtered.length === 0 ? (
              <div className="text-center text-muted py-12">
                <i className="fa-solid fa-mug-hot text-3xl mb-2 text-muted"></i>
                <p className="text-sm font-semibold">{orders.length === 0 ? 'No hay pedidos esperando' : 'Ningún pedido coincide'}</p>
              </div>
            ) : filtered.map(order => (
              <button
                key={order.id}
                onClick={() => selectOrder(order)}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  order.id === selectedId ? 'border-brand bg-brand-soft ring-1 ring-brand' : 'border-line hover:border-brand/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black text-ink">N° {order.id}</span>
                  <span className="font-black text-ink tabular-nums">{formatSoles(order.total)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted mt-0.5">
                  <span className="truncate">{order.customer} · {order.items.length} prod.</span>
                  <span className="shrink-0">{minutesAgo(order.createdAt)}</span>
                </div>
                <p className="text-[11px] text-muted">Vendedor: {order.seller}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ===== DETALLE ===== */}
        <div className="flex-1 flex flex-col bg-surface rounded-xl shadow-sm border border-line lg:overflow-hidden min-h-[300px]">
          {notice && (
            <div className="px-4 py-2.5 bg-warning-soft border-b border-warning/30 text-sm text-warning flex justify-between gap-2">
              <span><i className="fa-solid fa-circle-info mr-1.5"></i>{notice}</span>
              <button onClick={() => setNotice('')} className="text-warning hover:text-warning"><i className="fa-solid fa-xmark"></i></button>
            </div>
          )}

          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-muted p-8">
              <i className="fa-solid fa-receipt text-4xl mb-3 text-nav-ink"></i>
              <p className="text-sm font-semibold text-muted">Elija un pedido de la cola</p>
              <p className="text-xs mt-1">o escriba el número que trae el cliente y presione Enter.</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-line flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">Pedido</p>
                  <p className="text-3xl font-black text-ink">N° {selected.id}</p>
                  <p className="text-xs text-muted mt-1">
                    {selected.customer} · Vendedor: {selected.seller} · {minutesAgo(selected.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Total</p>
                  <p className="text-3xl font-black text-ink tabular-nums">{formatSoles(selected.total)}</p>
                </div>
              </div>

              <div className="flex-1 lg:overflow-y-auto px-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-line">
                      <th className="py-2">Producto</th>
                      <th className="py-2 text-right">Cant.</th>
                      <th className="py-2 text-right">P. unit.</th>
                      <th className="py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {selected.items.map(item => (
                      <tr key={`${item.id}:${item.unitId ?? 0}`}>
                        <td className="py-2.5 text-ink">{item.name}{item.unitName && <span className="text-xs text-brand-text font-semibold"> · {item.unitName}</span>}<span className="block text-[10px] font-mono text-muted">{item.code}</span></td>
                        <td className="py-2.5 text-right font-bold">{item.qty}</td>
                        <td className="py-2.5 text-right tabular-nums">{formatSoles(item.price)}</td>
                        <td className="py-2.5 text-right font-bold tabular-nums">{formatSoles(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {selected.discount > 0 && (
                    <tfoot>
                      <tr className="border-t border-line text-muted">
                        <td colSpan={3} className="py-2 text-right">Subtotal</td>
                        <td className="py-2 text-right tabular-nums">{formatSoles(selected.subtotal)}</td>
                      </tr>
                      <tr className="text-success font-semibold">
                        <td colSpan={3} className="pb-2 text-right">Descuento</td>
                        <td className="pb-2 text-right tabular-nums">− {formatSoles(selected.discount)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div className="p-4 border-t border-line bg-surface-muted flex flex-col sm:flex-row gap-2">
                <button
                  onClick={cancelSelected}
                  disabled={cancelling}
                  className="px-4 py-3 font-bold text-danger bg-surface border border-danger/30 hover:bg-danger-soft rounded-lg text-sm disabled:opacity-50"
                >
                  <i className="fa-solid fa-ban mr-1.5"></i> Anular pedido
                </button>
                <button
                  onClick={() => setShowCheckout(true)}
                  disabled={cajaAbierta === false}
                  className="flex-1 py-3 font-bold text-brand-contrast bg-brand hover:bg-brand-strong rounded-lg text-base shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="fa-solid fa-cash-register mr-2"></i> Cobrar {formatSoles(selected.total)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showCheckout && selected && (
        <CheckoutModal
          title={`Pedido N° ${selected.id}`}
          total={selected.total}
          units={selected.items.length}
          clients={clients}
          customerInput={customerInput}
          onCustomerInputChange={setCustomerInput}
          onClose={() => setShowCheckout(false)}
          onConfirm={confirmPayment}
          allowDelivery={deliveriesEnabled}
        />
      )}

      {success && <SaleSuccessModal {...success} onClose={closeSuccess} />}
    </div>
  );
}
