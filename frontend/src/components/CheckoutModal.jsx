import React, { useState, useEffect } from 'react';
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

// Billetes que el cliente suele entregar; tocar uno varias veces los acumula.
const BILLS = [10, 20, 50, 100, 200];

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
  // Billetes entregados por el cliente: { 50: 2 } = dos billetes de 50. Se suman al tocar.
  const [bills, setBills] = useState({});
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
  const billCount = Object.values(bills).reduce((sum, n) => sum + n, 0);

  // Cada toque suma un billete a lo recibido. Escribir el monto a mano descarta los billetes.
  const addBill = (value) => {
    const next = { ...bills, [value]: (bills[value] || 0) + 1 };
    setBills(next);
    setReceivedCash(Object.entries(next).reduce((sum, [v, n]) => sum + Number(v) * n, 0).toFixed(2));
    clearError('receivedCash');
  };
  const setExact = () => { setBills({}); setReceivedCash(total.toFixed(2)); clearError('receivedCash'); };
  const clearReceived = () => { setBills({}); setReceivedCash(''); clearError('receivedCash'); };

  // Pago mixto: lo que falta del total se completa solo en el otro campo.
  const remainderOf = (value) => {
    const n = parseFloat(value);
    if (value === '' || isNaN(n)) return '';
    return Math.max(0, Math.round((total - n) * 100) / 100).toFixed(2);
  };
  const changeMix = (field, value) => {
    if (field === 'cash') { setMixCash(value); setMixDigital(remainderOf(value)); }
    else { setMixDigital(value); setMixCash(remainderOf(value)); }
    clearError('mixCash');
    clearError('mixDigital');
  };

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
      else if (cash > total + 0.001) e.mixCash = `El efectivo no puede superar el total (${formatSoles(total)}).`;
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

  const chip = (active) => `rounded-lg border text-xs font-bold transition-colors ${
    active ? 'border-brand bg-brand-soft text-brand-text ring-1 ring-brand' : 'border-line text-ink-soft hover:bg-surface-muted'
  }`;
  const inputCls = (error) => `w-full px-3 py-2 border rounded-lg outline-none text-sm bg-surface focus:border-brand ${borderClass(error)}`;

  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-end sm:items-center justify-center backdrop-blur-sm sm:p-4">
      <div className="bg-surface sm:rounded-xl rounded-t-2xl shadow-xl w-full max-w-3xl flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        <div className="px-5 py-3 border-b border-line flex justify-between items-center shrink-0">
          <div>
            <p className="text-xs text-muted font-semibold">{title || 'Total a cobrar'} · {units} {units === 1 ? 'producto' : 'productos'}</p>
            <p className="text-2xl font-black text-ink tabular-nums">{formatSoles(total)}</p>
          </div>
          <button onClick={close} className="text-muted hover:text-ink p-1" title="Cerrar (Esc)">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {serverError && (
            <div className="m-5 mb-0 bg-danger-soft border border-danger/30 text-danger text-sm rounded-lg p-3 flex gap-2">
              <i className="fa-solid fa-circle-exclamation mt-0.5"></i>
              <span>{serverError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-line">
            {/* Izquierda: a quién y con qué comprobante */}
            <div className="p-5 flex flex-col gap-4">
              <Section title="Comprobante">
                <div className="grid grid-cols-3 gap-1.5">
                  {DOCUMENT_TYPES.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      title={d.hint}
                      onClick={() => { setDocType(d.id); clearError('customerName'); clearError('customerDoc'); }}
                      className={`${chip(docType === d.id)} py-2 px-1 flex items-center justify-center gap-1.5`}
                    >
                      <i className={`fa-solid ${d.icon}`}></i> {d.id}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Cliente">
                <CustomerSelector
                  clients={clients}
                  value={customerInput}
                  onChange={v => { onCustomerInputChange(v); clearError('customer'); }}
                  customer={customer}
                  error={errors.customer}
                />
                {!customer && docType !== 'Nota de Venta' && (
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    <input
                      type="text"
                      maxLength={120}
                      value={customerName}
                      onChange={e => { setCustomerName(e.target.value); clearError('customerName'); }}
                      placeholder={docType === 'Factura' ? 'Razón social' : 'Nombres y apellidos'}
                      className={`col-span-3 ${inputCls(errors.customerName)}`}
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
                      placeholder={docType === 'Boleta' ? 'DNI' : 'RUC'}
                      className={`col-span-2 font-mono ${inputCls(errors.customerDoc)}`}
                    />
                    <div className="col-span-5"><FieldError msg={errors.customerName || errors.customerDoc} /></div>
                  </div>
                )}
              </Section>

              {allowDelivery && (
                <Section title="Entrega">
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'PICKUP', label: 'Se lleva ahora', icon: 'fa-bag-shopping' },
                      { id: 'DELIVERY', label: 'Envío a domicilio', icon: 'fa-truck-fast' },
                    ].map(option => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => chooseDelivery(option.id)}
                        className={`${chip(deliveryType === option.id)} py-2 px-2 flex items-center justify-center gap-2`}
                      >
                        <i className={`fa-solid ${option.icon}`}></i> {option.label}
                      </button>
                    ))}
                  </div>

                  {deliveryType === 'DELIVERY' && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <input
                          type="text"
                          maxLength={250}
                          value={deliveryAddress}
                          onChange={e => { setDeliveryAddress(e.target.value); clearError('deliveryAddress'); }}
                          placeholder="Dirección: calle, número, referencia"
                          className={inputCls(errors.deliveryAddress)}
                        />
                        <FieldError msg={errors.deliveryAddress} />
                      </div>
                      <input
                        type="text"
                        maxLength={120}
                        value={deliveryRecipient}
                        onChange={e => setDeliveryRecipient(e.target.value)}
                        placeholder="Quién recibe"
                        className={inputCls()}
                      />
                      <div>
                        <input
                          type="tel"
                          maxLength={30}
                          value={deliveryPhone}
                          onChange={e => { setDeliveryPhone(e.target.value); clearError('deliveryPhone'); }}
                          placeholder="Teléfono (opcional)"
                          className={inputCls(errors.deliveryPhone)}
                        />
                        <FieldError msg={errors.deliveryPhone} />
                      </div>
                      <input
                        type="text"
                        maxLength={300}
                        value={deliveryNotes}
                        onChange={e => setDeliveryNotes(e.target.value)}
                        placeholder="Indicaciones (ej. dejar en portería)"
                        className={`col-span-2 ${inputCls()}`}
                      />
                    </div>
                  )}
                </Section>
              )}
            </div>

            {/* Derecha: cómo paga */}
            <div className="p-5 flex flex-col gap-4 bg-surface-muted/40">
              <Section title="Método de pago">
                <div className="grid grid-cols-3 gap-1.5">
                  {PAYMENT_METHODS.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setPayMethod(m.id); setErrors(prev => ({ customer: prev.customer, customerName: prev.customerName, customerDoc: prev.customerDoc })); }}
                      className={`${chip(payMethod === m.id)} py-2 px-1 flex flex-col items-center gap-0.5`}
                    >
                      <i className={`fa-solid ${m.icon} text-sm`}></i> {m.label}
                    </button>
                  ))}
                </div>
              </Section>

              {payMethod === 'Efectivo' && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted uppercase tracking-wide">Billetes recibidos</span>
                    <button type="button" onClick={setExact} className="text-xs font-bold text-brand hover:underline">
                      Pago exacto
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {BILLS.map(value => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => addBill(value)}
                        className={`relative py-2.5 rounded-lg border text-sm font-black tabular-nums transition-colors ${
                          bills[value] ? 'border-success bg-success-soft text-success' : 'border-line bg-surface text-ink-soft hover:bg-surface-muted'
                        }`}
                      >
                        {value}
                        {bills[value] > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 bg-success text-white text-[10px] rounded-full min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center">
                            ×{bills[value]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted mb-1 flex justify-between">
                        <span>Recibido</span>
                        {receivedCash !== '' && (
                          <button type="button" onClick={clearReceived} className="text-muted hover:text-danger" title="Borrar">
                            <i className="fa-solid fa-eraser"></i>
                          </button>
                        )}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.10"
                        value={receivedCash}
                        onChange={e => { setBills({}); setReceivedCash(e.target.value); clearError('receivedCash'); }}
                        onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                        placeholder="Opcional"
                        className={`w-full px-3 py-2 border rounded-lg outline-none text-lg font-bold bg-surface ${borderClass(errors.receivedCash)}`}
                      />
                      {billCount > 0 && (
                        <p className="text-[11px] text-muted mt-1">
                          {Object.entries(bills).filter(([, n]) => n > 0).map(([v, n]) => `${n} × S/ ${v}`).join(' + ')}
                        </p>
                      )}
                    </div>
                    <div className={`rounded-lg border px-3 py-2 flex flex-col justify-center ${
                      change === null
                        ? 'bg-surface border-line text-muted'
                        : change < 0 ? 'bg-danger-soft border-danger/30 text-danger' : 'bg-success-soft border-success/30 text-success'
                    }`}>
                      <span className="text-xs font-semibold">{change !== null && change < 0 ? 'Falta' : 'Vuelto'}</span>
                      <span className="text-2xl font-black tabular-nums">{change === null ? '—' : formatSoles(Math.abs(change))}</span>
                    </div>
                  </div>
                  <FieldError msg={errors.receivedCash} />
                </div>
              )}

              {payMethod === 'Yape/Plin' && (
                <div>
                  <label className="text-xs text-muted mb-1 block">N° de operación</label>
                  <input
                    type="text"
                    maxLength={40}
                    value={payCode}
                    onChange={e => { setPayCode(e.target.value); clearError('payCode'); }}
                    placeholder="Ej. 12345678"
                    className={`font-mono ${inputCls(errors.payCode)}`}
                  />
                  <FieldError msg={errors.payCode} />
                </div>
              )}

              {payMethod === 'Pago Mixto' && (
                <div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'cash', label: 'Efectivo', value: mixCash, error: errors.mixCash },
                      { id: 'digital', label: 'Digital', value: mixDigital, error: errors.mixDigital },
                    ].map(field => (
                      <div key={field.id}>
                        <label className="text-xs text-muted mb-1 block">{field.label}</label>
                        <input
                          type="number"
                          min="0"
                          max={total}
                          step="0.10"
                          value={field.value}
                          onChange={e => changeMix(field.id, e.target.value)}
                          placeholder="0.00"
                          className={`font-bold ${inputCls(field.error)}`}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted mt-1">Escriba uno de los dos montos: el otro se completa con lo que falta.</p>
                  <FieldError msg={errors.mixCash || errors.mixDigital} />
                </div>
              )}

              {payMethod === 'Fiado' && (
                <p className="text-xs text-ink-soft bg-warning-soft border border-warning/30 rounded-lg p-3">
                  <i className="fa-solid fa-circle-info text-warning mr-1"></i>
                  Se cargará a la cuenta del cliente. Requiere un cliente registrado con crédito disponible.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-line flex gap-2 shrink-0">
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
