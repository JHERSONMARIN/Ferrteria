import React, { useState, useMemo, useEffect } from 'react';
import FieldError from './FieldError.jsx';
import CustomerSelector from './CustomerSelector.jsx';
import { borderClass } from '../utils/validators.js';
import { formatSoles } from '../utils/currency.js';
import { findCustomerByInput } from '../utils/customers.js';

const DOCUMENT_TYPES = [
  { id: 'Nota de Venta', icon: 'fa-receipt', hint: 'Sin datos' },
  { id: 'Boleta', icon: 'fa-file-lines', hint: 'Con DNI' },
  { id: 'Factura', icon: 'fa-file-invoice-dollar', hint: 'Con RUC' },
];

const PAYMENT_METHODS = [
  { id: 'Efectivo', label: 'Efectivo', icon: 'fa-money-bill-wave' },
  { id: 'Tarjeta', label: 'Tarjeta', icon: 'fa-credit-card' },
  { id: 'Yape/Plin', label: 'Yape / Plin', icon: 'fa-mobile-screen' },
  { id: 'Transferencia', label: 'Transferencia', icon: 'fa-building-columns' },
  { id: 'Pago Mixto', label: 'Mixto', icon: 'fa-shuffle' },
  { id: 'Fiado', label: 'Fiado', icon: 'fa-book' },
];

function Section({ title, children }) {
  return (
    <section>
      <h4 className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">{title}</h4>
      {children}
    </section>
  );
}

// Ventana de cobro: comprobante, cliente y medio de pago. Valida los datos y entrega el pago a
// onConfirm; si onConfirm lanza un error, su mensaje se muestra aquí para corregir y reintentar.
export default function CheckoutModal({ title, total, units, clients, customerInput, onCustomerInputChange, onClose, onConfirm, allowDelivery = false }) {
  const [docType, setDocType] = useState('Nota de Venta');
  const [payMethod, setPayMethod] = useState('Efectivo');
  const [payCode, setPayCode] = useState('');
  const [mixCash, setMixCash] = useState('');
  const [mixDigital, setMixDigital] = useState('');
  const [receivedCash, setReceivedCash] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerDni, setCustomerDni] = useState('');
  const [customerRuc, setCustomerRuc] = useState('');
  const [deliveryType, setDeliveryType] = useState('PICKUP');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [deliveryRecipient, setDeliveryRecipient] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [processing, setProcessing] = useState(false);

  const customer = findCustomerByInput(clients, customerInput);
  const received = parseFloat(receivedCash);
  const change = !isNaN(received) ? received - total : null;
  const digitalRemainder = total - (parseFloat(mixCash) || 0);

  const quickAmounts = useMemo(() => {
    if (total <= 0) return [];
    const roundUpTo = (step) => Math.ceil(total / step) * step;
    const candidates = [roundUpTo(5), roundUpTo(10), roundUpTo(50), roundUpTo(100), 200];
    return [...new Set(candidates.map(n => Math.round(n * 100) / 100))]
      .filter(n => n > total + 0.001)
      .sort((a, b) => a - b)
      .slice(0, 4);
  }, [total]);

  const clearError = (field) => setErrors(prev => ({ ...prev, [field]: '' }));

  const close = () => { if (!processing) onClose(); };

  // Al elegir envío se proponen los datos del cliente registrado (se pueden corregir).
  const chooseDelivery = (type) => {
    setDeliveryType(type);
    if (type === 'DELIVERY') {
      if (!deliveryAddress && customer?.address) setDeliveryAddress(customer.address);
      if (!deliveryPhone && customer?.phone) setDeliveryPhone(customer.phone);
      if (!deliveryRecipient) setDeliveryRecipient(customer?.name || customerName.trim());
    }
    clearError('deliveryAddress');
    clearError('deliveryPhone');
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const validate = () => {
    const e = {};
    if (customerInput.trim() && !customer) {
      e.customer = 'Cliente no registrado. Selecciónelo de la lista o borre el campo.';
    } else if (payMethod === 'Fiado' && !customer) {
      e.customer = 'Para vender al fiado debe seleccionar un cliente registrado.';
    }
    if (!customer && docType !== 'Nota de Venta') {
      if (!customerName.trim()) e.customerName = 'Ingrese el nombre del cliente.';
      if (docType === 'Boleta' && !/^\d{8}$/.test(customerDni.trim())) e.customerDoc = 'El DNI debe tener 8 dígitos.';
      if (docType === 'Factura' && !/^\d{11}$/.test(customerRuc.trim())) e.customerDoc = 'El RUC debe tener 11 dígitos.';
    }
    if (payMethod === 'Efectivo' && receivedCash !== '') {
      if (isNaN(received) || received < 0) e.receivedCash = 'Monto recibido inválido.';
      else if (received + 0.001 < total) e.receivedCash = `El monto recibido es menor al total (${formatSoles(total)}).`;
    }
    if (payMethod === 'Yape/Plin' && !payCode.trim()) e.payCode = 'Ingrese el N° de operación de Yape/Plin.';
    if (deliveryType === 'DELIVERY') {
      if (deliveryAddress.trim().length < 5) e.deliveryAddress = 'Ingrese la dirección de entrega.';
      if (deliveryPhone.trim() && !/^[0-9+\s()-]{6,30}$/.test(deliveryPhone.trim())) e.deliveryPhone = 'Teléfono no válido.';
    }
    if (payMethod === 'Pago Mixto') {
      const cash = parseFloat(mixCash);
      const digital = parseFloat(mixDigital);
      if (mixCash === '' || isNaN(cash) || cash < 0) e.mixCash = 'Monto en efectivo inválido.';
      if (mixDigital === '' || isNaN(digital) || digital < 0) e.mixDigital = 'Monto digital inválido.';
      if (!e.mixCash && !e.mixDigital && Math.abs(cash + digital - total) > 0.01) {
        e.mixDigital = `La suma de ambos montos debe ser ${formatSoles(total)}.`;
      }
    }
    setErrors(e);
    return !Object.values(e).some(Boolean);
  };

  const handleConfirm = async () => {
    if (processing) return;
    setServerError('');
    if (!validate()) return;
    try {
      setProcessing(true);
      await onConfirm({
        docType,
        payMethod,
        payCode,
        mixCash: parseFloat(mixCash) || 0,
        mixDigital: parseFloat(mixDigital) || 0,
        receivedCash: payMethod === 'Efectivo' && !isNaN(received) ? received : null,
        customer,
        customerName,
        customerDni,
        customerRuc,
        delivery: deliveryType === 'DELIVERY'
          ? {
            type: 'DELIVERY',
            address: deliveryAddress.trim(),
            contactName: deliveryRecipient.trim() || (customer ? customer.name : customerName.trim()) || null,
            contactPhone: deliveryPhone.trim() || null,
            notes: deliveryNotes.trim() || null,
          }
          : null,
      });
    } catch (err) {
      setServerError(err.message || 'No se pudo completar el cobro.');
    } finally {
      setProcessing(false);
    }
  };

  const tile = (active) => `rounded-lg border text-center transition-colors ${
    active ? 'border-brand bg-brand-soft text-brand-text ring-1 ring-brand' : 'border-line text-ink-soft hover:bg-surface-muted'
  }`;

  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-end sm:items-center justify-center backdrop-blur-sm sm:p-4">
      <div className="bg-surface sm:rounded-xl rounded-t-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        <div className="px-5 py-4 bg-panel text-white flex justify-between items-center shrink-0">
          <div>
            <p className="text-xs text-muted font-semibold">{title || 'Total a cobrar'} · {units} {units === 1 ? 'producto' : 'productos'}</p>
            <p className="text-3xl font-black text-brand tabular-nums">{formatSoles(total)}</p>
          </div>
          <button onClick={close} className="text-muted hover:text-white p-1" title="Cerrar (Esc)">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {serverError && (
            <div className="bg-danger-soft border border-danger/30 text-danger text-sm rounded-lg p-3 flex gap-2">
              <i className="fa-solid fa-circle-exclamation mt-0.5"></i>
              <span>{serverError}</span>
            </div>
          )}

          <Section title="1. Comprobante">
            <div className="grid grid-cols-3 gap-2">
              {DOCUMENT_TYPES.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => { setDocType(d.id); clearError('customerName'); clearError('customerDoc'); }}
                  className={`${tile(docType === d.id)} p-2.5`}
                >
                  <i className={`fa-solid ${d.icon} text-base`}></i>
                  <p className="text-xs font-bold mt-1">{d.id}</p>
                  <p className="text-[10px] opacity-70">{d.hint}</p>
                </button>
              ))}
            </div>
          </Section>

          <Section title="2. Cliente">
            <CustomerSelector
              clients={clients}
              value={customerInput}
              onChange={v => { onCustomerInputChange(v); clearError('customer'); }}
              customer={customer}
              error={errors.customer}
            />
            {!customer && docType !== 'Nota de Venta' && (
              <div className="mt-3 p-3 rounded-lg bg-surface-muted border border-line">
                <p className="text-xs text-muted mb-2">
                  Cliente no registrado: ingrese sus datos para la {docType.toLowerCase()}.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  <input
                    type="text"
                    maxLength={120}
                    value={customerName}
                    onChange={e => { setCustomerName(e.target.value); clearError('customerName'); }}
                    placeholder={docType === 'Factura' ? 'Razón social' : 'Nombres y apellidos'}
                    className={`sm:col-span-3 w-full px-3 py-2 border rounded-lg outline-none text-sm ${borderClass(errors.customerName)}`}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={docType === 'Boleta' ? 8 : 11}
                    value={docType === 'Boleta' ? customerDni : customerRuc}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '');
                      if (docType === 'Boleta') setCustomerDni(digits); else setCustomerRuc(digits);
                      clearError('customerDoc');
                    }}
                    placeholder={docType === 'Boleta' ? 'DNI (8)' : 'RUC (11)'}
                    className={`sm:col-span-2 w-full px-3 py-2 border rounded-lg outline-none text-sm font-mono ${borderClass(errors.customerDoc)}`}
                  />
                </div>
                <FieldError msg={errors.customerName || errors.customerDoc} />
              </div>
            )}
          </Section>

          <Section title="3. Método de pago">
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setPayMethod(m.id); setErrors(prev => ({ customer: prev.customer, customerName: prev.customerName, customerDoc: prev.customerDoc })); }}
                  className={`${tile(payMethod === m.id)} py-2.5 px-1`}
                >
                  <i className={`fa-solid ${m.icon} text-base`}></i>
                  <p className="text-xs font-bold mt-1">{m.label}</p>
                </button>
              ))}
            </div>

            {payMethod === 'Efectivo' && (
              <div className="mt-3 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted mb-1 block">Recibido (opcional)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.10"
                      value={receivedCash}
                      onChange={e => { setReceivedCash(e.target.value); clearError('receivedCash'); }}
                      onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                      placeholder="0.00"
                      className={`w-full px-3 py-2.5 border rounded-lg outline-none text-lg font-bold ${borderClass(errors.receivedCash)}`}
                    />
                  </div>
                  <div className={`rounded-lg border px-3 py-2 flex flex-col justify-center ${
                    change === null
                      ? 'bg-surface-muted border-line text-muted'
                      : change < 0 ? 'bg-danger-soft border-danger/30 text-danger' : 'bg-success-soft border-success/30 text-success'
                  }`}>
                    <span className="text-xs font-semibold">{change !== null && change < 0 ? 'Falta' : 'Vuelto'}</span>
                    <span className="text-2xl font-black tabular-nums">{change === null ? '—' : formatSoles(Math.abs(change))}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[{ label: 'Exacto', value: total }, ...quickAmounts.map(v => ({ label: formatSoles(v), value: v }))].map(q => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => { setReceivedCash(q.value.toFixed(2)); clearError('receivedCash'); }}
                      className="px-3 py-1.5 rounded-full text-xs font-bold border border-line bg-surface hover:bg-surface-muted text-ink-soft"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <FieldError msg={errors.receivedCash} />
              </div>
            )}

            {payMethod === 'Yape/Plin' && (
              <div className="mt-3">
                <label className="text-xs text-muted mb-1 block">N° de operación</label>
                <input
                  type="text"
                  maxLength={40}
                  value={payCode}
                  onChange={e => { setPayCode(e.target.value); clearError('payCode'); }}
                  placeholder="Ej. 12345678"
                  className={`w-full px-3 py-2.5 border rounded-lg outline-none text-sm font-mono ${borderClass(errors.payCode)}`}
                />
                <FieldError msg={errors.payCode} />
              </div>
            )}

            {payMethod === 'Pago Mixto' && (
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Efectivo', value: mixCash, set: setMixCash, error: errors.mixCash },
                    { label: 'Digital', value: mixDigital, set: setMixDigital, error: errors.mixDigital },
                  ].map(field => (
                    <div key={field.label}>
                      <label className="text-xs text-muted mb-1 block">{field.label}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.10"
                        value={field.value}
                        onChange={e => { field.set(e.target.value); clearError('mixCash'); clearError('mixDigital'); }}
                        placeholder="0.00"
                        className={`w-full px-3 py-2.5 border rounded-lg outline-none text-sm font-bold ${borderClass(field.error)}`}
                      />
                    </div>
                  ))}
                </div>
                {mixCash !== '' && digitalRemainder >= 0 && Math.abs((parseFloat(mixDigital) || 0) - digitalRemainder) > 0.001 && (
                  <button
                    type="button"
                    onClick={() => { setMixDigital(digitalRemainder.toFixed(2)); clearError('mixDigital'); }}
                    className="mt-2 text-xs font-bold text-brand hover:underline"
                  >
                    Completar digital con {formatSoles(digitalRemainder)}
                  </button>
                )}
                <FieldError msg={errors.mixCash || errors.mixDigital} />
              </div>
            )}

            {payMethod === 'Fiado' && (
              <p className="mt-3 text-xs text-ink-soft bg-warning-soft border border-warning/30 rounded-lg p-3">
                <i className="fa-solid fa-circle-info text-warning mr-1"></i>
                Se cargará a la cuenta del cliente. Requiere un cliente registrado con crédito disponible.
              </p>
            )}
          </Section>

          {allowDelivery && (
            <Section title="4. Entrega">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'PICKUP', label: 'Se lleva ahora', icon: 'fa-bag-shopping' },
                  { id: 'DELIVERY', label: 'Envío a domicilio', icon: 'fa-truck-fast' },
                ].map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseDelivery(option.id)}
                    className={`${tile(deliveryType === option.id)} py-2.5 px-2 flex items-center justify-center gap-2`}
                  >
                    <i className={`fa-solid ${option.icon}`}></i>
                    <span className="text-xs font-bold">{option.label}</span>
                  </button>
                ))}
              </div>

              {deliveryType === 'DELIVERY' && (
                <div className="mt-3 flex flex-col gap-2">
                  <div>
                    <label className="text-xs text-muted mb-1 block">Dirección de entrega</label>
                    <input
                      type="text"
                      maxLength={250}
                      value={deliveryAddress}
                      onChange={e => { setDeliveryAddress(e.target.value); clearError('deliveryAddress'); }}
                      placeholder="Calle, número, referencia"
                      className={`w-full px-3 py-2 border rounded-lg outline-none text-sm ${borderClass(errors.deliveryAddress)}`}
                    />
                    <FieldError msg={errors.deliveryAddress} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted mb-1 block">Recibe</label>
                      <input
                        type="text"
                        maxLength={120}
                        value={deliveryRecipient}
                        onChange={e => setDeliveryRecipient(e.target.value)}
                        placeholder="Nombre de quien recibe"
                        className="w-full px-3 py-2 border border-line rounded-lg outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted mb-1 block">Teléfono de contacto</label>
                      <input
                        type="tel"
                        maxLength={30}
                        value={deliveryPhone}
                        onChange={e => { setDeliveryPhone(e.target.value); clearError('deliveryPhone'); }}
                        placeholder="Opcional"
                        className={`w-full px-3 py-2 border rounded-lg outline-none text-sm ${borderClass(errors.deliveryPhone)}`}
                      />
                      <FieldError msg={errors.deliveryPhone} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-muted mb-1 block">Indicaciones</label>
                      <input
                        type="text"
                        maxLength={300}
                        value={deliveryNotes}
                        onChange={e => setDeliveryNotes(e.target.value)}
                        placeholder="Ej. dejar en portería"
                        className="w-full px-3 py-2 border border-line rounded-lg outline-none text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
            </Section>
          )}
        </div>

        <div className="p-4 border-t border-line bg-surface-muted flex gap-2 shrink-0">
          <button
            onClick={close}
            disabled={processing}
            className="px-4 py-3 font-bold text-ink-soft bg-surface-muted hover:bg-line rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={processing}
            className="flex-1 py-3 font-bold text-white bg-success hover:brightness-95 rounded-lg text-base shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {processing
              ? <><i className="fa-solid fa-spinner fa-spin"></i> Procesando…</>
              : <><i className="fa-solid fa-check"></i> Confirmar cobro · {formatSoles(total)}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
