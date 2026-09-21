import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';
import ContadorEfectivo, { calcularTotalConteo } from '../components/ContadorEfectivo.jsx';
import { useToast, useConfirm } from '../components/ui/index.js';

function SelectorModo({ modo, onChange }) {
  const opciones = [
    { id: 'CONTEO', label: 'Contar billetes', icon: 'fa-money-bill-wave' },
    { id: 'MANUAL', label: 'Monto directo', icon: 'fa-keyboard' },
  ];

  return (
    <div className="flex gap-2">
      {opciones.map(op => (
        <button
          key={op.id}
          type="button"
          onClick={() => onChange(op.id)}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-2 ${
            modo === op.id
              ? 'bg-brand text-brand-contrast border-brand shadow-sm'
              : 'bg-surface text-ink-soft border-line hover:bg-surface-muted'
          }`}
        >
          <i className={`fa-solid ${op.icon}`}></i> {op.label}
        </button>
      ))}
    </div>
  );
}

const formatTime = (value) => new Date(value).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

// Cajas activas: las cerradas se eligen para abrir un turno; a las abiertas uno se suma.
function RegisterList({ registers, selectedId, onSelect, onJoin, loading }) {
  if (registers.length === 0) {
    return (
      <p className="text-sm text-muted text-center bg-surface border border-line rounded-xl p-6">
        No hay cajas activas. Pida al administrador que active una en Configuración.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {registers.map(r => {
        const selected = selectedId === r.id;
        return (
          <div
            key={r.id}
            className={`bg-surface rounded-xl border p-4 flex flex-col gap-2 ${selected ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`}
          >
            <div className="flex justify-between items-center gap-2">
              <h4 className="font-bold text-ink"><i className="fa-solid fa-cash-register mr-2 text-muted"></i>{r.name}</h4>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.session ? 'bg-success-soft text-success' : 'bg-surface-muted text-muted'}`}>
                {r.session ? 'Turno abierto' : 'Cerrada'}
              </span>
            </div>
            {r.session ? (
              <>
                <p className="text-xs text-muted">
                  Abierta por <strong className="text-ink-soft">{r.session.openedBy}</strong> a las {formatTime(r.session.openedAt)}
                  {r.session.members.length > 0 && <> · Cajeros: {r.session.members.join(', ')}</>}
                </p>
                <button
                  type="button"
                  onClick={() => onJoin(r)}
                  disabled={loading}
                  className="mt-auto w-full bg-panel hover:bg-panel-strong text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  <i className="fa-solid fa-user-plus mr-1.5"></i> Unirme a este turno
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className={`mt-auto w-full font-bold py-2 rounded-lg text-sm border ${selected ? 'bg-brand-soft text-brand-text border-brand/40' : 'bg-surface text-ink-soft border-line hover:bg-surface-muted'}`}
              >
                {selected ? <><i className="fa-solid fa-check mr-1.5"></i> Seleccionada</> : 'Abrir esta caja'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CajaPage({ currentUser }) {
  const aviso = useToast();
  const confirmar = useConfirm();
  const [estadoCaja, setEstadoCaja] = useState({ abierta: false, caja: null, registers: [] });
  const [selectedRegisterId, setSelectedRegisterId] = useState(null);
  const [montoInicial, setMontoInicial] = useState('');
  const [montoConteo, setMontoConteo] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Contador de billetes y monedas
  const [modoApertura, setModoApertura] = useState('CONTEO');
  const [conteoApertura, setConteoApertura] = useState({});
  const [modoCierre, setModoCierre] = useState('CONTEO');
  const [conteoCierre, setConteoCierre] = useState({});

  const totalApertura = modoApertura === 'CONTEO'
    ? calcularTotalConteo(conteoApertura)
    : parseFloat(montoInicial);

  const totalCierre = modoCierre === 'CONTEO'
    ? calcularTotalConteo(conteoCierre)
    : parseFloat(montoConteo);

  const saldoTeorico = estadoCaja.caja ? estadoCaja.caja.saldoTeoricoEfectivo : 0;
  const diferenciaCierre = Math.round((totalCierre - saldoTeorico) * 100) / 100;

  // Caja a abrir: la elegida si sigue cerrada; si no, la primera cerrada.
  const closedRegisters = (estadoCaja.registers || []).filter(r => !r.session);
  const registerToOpen = closedRegisters.find(r => r.id === selectedRegisterId) || closedRegisters[0] || null;

  const validateMonto = (value, field) => {
    const n = parseFloat(value);
    let msg = '';
    if (value === '' || isNaN(n)) msg = 'Ingrese un monto válido.';
    else if (n < 0) msg = 'El monto no puede ser negativo.';
    else if (n > 1000000) msg = 'El monto es demasiado alto.';
    setErrors(prev => ({ ...prev, [field]: msg }));
    return msg === '';
  };

  useEffect(() => {
    if (!currentUser) return;

    loadEstadoCaja();

    const intervalo = setInterval(() => loadEstadoCaja({ silencioso: true }), 3000);

    const actualizarCaja = () => loadEstadoCaja({ silencioso: true });
    window.addEventListener('venta-registrada', actualizarCaja);

    return () => {
      clearInterval(intervalo);
      window.removeEventListener('venta-registrada', actualizarCaja);
    };
  }, [currentUser]);

  // El refresco automático es silencioso para no deshabilitar los botones cada 3s.
  const loadEstadoCaja = async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) setLoading(true);
      const data = await api.get(`/caja/estado-actual`);
      setEstadoCaja(data);
    } catch (err) {
      console.error('Error cargando estado de caja:', err);
    } finally {
      if (!silencioso) setLoading(false);
    }
  };

  const handleAbrirCaja = async () => {
    if (modoApertura === 'MANUAL' && !validateMonto(montoInicial, 'montoInicial')) return;
    const m = totalApertura;

    try {
      setLoading(true);
      await api.post('/caja/apertura', {
        cashRegisterId: registerToOpen.id,
        montoInicial: m,
      });

      aviso.exito(`¡${registerToOpen.name} abierta con S/ ${m.toFixed(2)}!`);
      setMontoInicial('');
      setConteoApertura({});
      await loadEstadoCaja();
    } catch (err) {
      aviso.error('Error al abrir caja: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnirse = async (register) => {
    const seguro = await confirmar({
      title: `Unirse al turno de ${register.name}`,
      description: 'Lo que cobre quedará registrado a su nombre en ese turno.',
      confirmText: 'Unirme',
    });
    if (!seguro) return;
    try {
      setLoading(true);
      await api.post(`/caja/turnos/${register.session.id}/unirse`, {});
      await loadEstadoCaja();
    } catch (err) {
      aviso.error('No se pudo unir al turno: ' + err.message);
      await loadEstadoCaja();
    } finally {
      setLoading(false);
    }
  };

  const handleSalir = async () => {
    const seguro = await confirmar({
      title: 'Salir del turno sin cerrarlo',
      description: 'Lo que cobró queda en el turno y lo cierran los demás cajeros.',
      confirmText: 'Salir del turno',
    });
    if (!seguro) return;
    try {
      setLoading(true);
      await api.post(`/caja/turnos/${estadoCaja.caja.id}/salir`, {});
      await loadEstadoCaja();
    } catch (err) {
      aviso.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCerrarCaja = async () => {
    if (modoCierre === 'MANUAL' && !validateMonto(montoConteo, 'montoConteo')) return;
    const conteo = totalCierre;

    const otros = estadoCaja.caja.members.filter(m => m.id !== currentUser.id).length;
    const seguro = await confirmar({
      title: 'Cerrar la caja',
      description: `Se cierra con un conteo físico de S/ ${conteo.toFixed(2)}.`
        + (otros > 0 ? ` El turno se cierra para los ${otros + 1} cajeros.` : ''),
      confirmText: 'Cerrar caja',
    });
    if (!seguro) return;

    try {
      setLoading(true);
      const res = await api.post('/caja/cierre', {
        cajaId: estadoCaja.caja.id,
        montoCierreConteo: conteo,
      });

      if (res.success) {
        const dif = res.diferencia;
        const msg = dif === 0 
          ? '¡Caja cuadrada perfectamente (S/ 0.00 de diferencia)!'
          : dif > 0 
          ? `Cierre registrado. Sobrante en caja: +S/ ${dif.toFixed(2)}`
          : `Cierre registrado. Faltante en caja: -S/ ${Math.abs(dif).toFixed(2)}`;

        aviso.exito(msg);
        setMontoConteo('');
        setConteoCierre({});
        await loadEstadoCaja();
      }
    } catch (err) {
      aviso.error('Error al cerrar caja: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      {!estadoCaja.abierta ? (
        /* SIN TURNO: ELEGIR CAJA PARA ABRIR O UNIRSE */
        <div className="max-w-5xl mx-auto flex flex-col gap-5">
          <div>
            <h3 className="text-lg font-bold text-ink">Cajas</h3>
            <p className="text-xs text-muted">Abra el turno de una caja cerrada o únase al turno de una caja que ya está abierta.</p>
          </div>

          <RegisterList
            registers={estadoCaja.registers || []}
            selectedId={registerToOpen?.id}
            onSelect={setSelectedRegisterId}
            onJoin={handleUnirse}
            loading={loading}
          />

          {registerToOpen && (
            <div className="bg-surface rounded-xl shadow-sm border border-line p-5 sm:p-8 w-full max-w-2xl mx-auto">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-brand-soft text-brand rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
                  <i className="fa-solid fa-cash-register"></i>
                </div>
                <h3 className="text-xl font-bold text-ink">Apertura de {registerToOpen.name}</h3>
                <p className="text-xs text-muted mt-1">Cuente el efectivo con el que inicia el turno.</p>
              </div>

              <div className="flex flex-col gap-4">
                <SelectorModo modo={modoApertura} onChange={setModoApertura} />

                {modoApertura === 'CONTEO' ? (
                  <ContadorEfectivo conteo={conteoApertura} onChange={setConteoApertura} />
                ) : (
                  <div>
                    <label className="text-xs font-bold text-muted mb-1 block">Monto Inicial en Efectivo (S/)</label>
                    <input
                      type="number"
                      step="0.50"
                      min="0"
                      value={montoInicial}
                      onChange={e => { setMontoInicial(e.target.value); setErrors(p => ({ ...p, montoInicial: '' })); }}
                      placeholder="Ej: 100.00"
                      className={`w-full border p-3 rounded-lg outline-none font-bold text-lg text-ink ${borderClass(errors.montoInicial)}`}
                    />
                    <FieldError msg={errors.montoInicial} />
                  </div>
                )}

                <button
                  onClick={handleAbrirCaja}
                  disabled={loading}
                  className="w-full bg-success hover:brightness-95 text-white font-bold py-3.5 rounded-lg shadow-md transition-colors text-base disabled:opacity-50"
                >
                  Abrir {registerToOpen.name} y comenzar turno
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ESTADO Y ARQUEO DE CAJA ABIERTA */
        <div className="flex flex-col gap-5">
          {/* Fila superior: resumen del turno */}
          <div className="bg-surface rounded-xl shadow-sm border border-line p-5">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4 pb-3 border-b">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs bg-success-soft text-success px-3 py-1 rounded-full font-bold">
                  <i className="fa-solid fa-lock-open mr-1"></i> {estadoCaja.caja.register.name.toUpperCase()} ABIERTA
                </span>
                <span className="text-xs text-muted">Abierta por {estadoCaja.caja.openedBy} · {estadoCaja.caja.createdAt}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Cajeros:</span>
                {estadoCaja.caja.members.map(m => (
                  <span key={m.id} className={`text-xs px-2 py-0.5 rounded-full border ${m.id === currentUser.id ? 'bg-brand-soft border-brand/30 text-brand-text font-bold' : 'bg-surface-muted border-line text-ink-soft'}`}>
                    {m.name}{m.id === currentUser.id && ' (usted)'}
                  </span>
                ))}
                {estadoCaja.caja.members.length > 1 && (
                  <button
                    type="button"
                    onClick={handleSalir}
                    disabled={loading}
                    className="text-xs font-semibold text-ink-soft hover:text-danger border border-line rounded-lg px-2.5 py-1 disabled:opacity-50"
                  >
                    <i className="fa-solid fa-right-from-bracket mr-1"></i> Salir del turno
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted italic mb-3">
              El saldo teórico es la suma del Monto Inicial + Ventas en Efectivo recaudadas en este turno.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-surface-muted p-4 rounded-lg border border-line">
                <p className="text-xs font-bold text-muted mb-1">Monto Inicial</p>
                <h4 className="text-2xl font-black text-ink">S/ {estadoCaja.caja.montoInicial.toFixed(2)}</h4>
              </div>

              <div className="bg-success-soft p-4 rounded-lg border border-success/20">
                <p className="text-xs font-bold text-success mb-1">Ventas en Efectivo</p>
                <h4 className="text-2xl font-black text-success">S/ {estadoCaja.caja.ventasEfectivo.toFixed(2)}</h4>
              </div>

              <div className="bg-info-soft p-4 rounded-lg border border-info/20">
                <p className="text-xs font-bold text-info mb-1">Ventas Digitales (Yape/Tarjetas)</p>
                <h4 className="text-2xl font-black text-info">S/ {estadoCaja.caja.ventasDigital.toFixed(2)}</h4>
              </div>

              <div className="bg-info-soft p-4 rounded-lg border border-info/20">
                <p className="text-xs font-bold text-info mb-1">Saldo Teórico en Efectivo</p>
                <h4 className="text-2xl font-black text-info">S/ {estadoCaja.caja.saldoTeoricoEfectivo.toFixed(2)}</h4>
              </div>
            </div>

            {estadoCaja.caja.byCashier.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-line">
                      <th className="py-2">Cobrado por</th>
                      <th className="py-2 text-right">Ventas</th>
                      <th className="py-2 text-right">Efectivo</th>
                      <th className="py-2 text-right">Digital</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {estadoCaja.caja.byCashier.map(c => (
                      <tr key={c.userId ?? 'sin'}>
                        <td className="py-2 text-ink-soft">{c.name}</td>
                        <td className="py-2 text-right tabular-nums">{c.sales}</td>
                        <td className="py-2 text-right tabular-nums font-semibold">S/ {c.cash.toFixed(2)}</td>
                        <td className="py-2 text-right tabular-nums">S/ {c.digital.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>

          {/* Fila inferior: contador (izquierda) y cierre (derecha) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            {/* Conteo de efectivo */}
            <div className="lg:col-span-2 bg-surface rounded-xl shadow-sm border border-line p-5">
              <h3 className="font-bold text-lg text-ink mb-1">Conteo de Efectivo en Gaveta</h3>
              <p className="text-xs text-muted mb-4">
                Registre cuántos billetes y monedas de cada denominación hay físicamente en la caja.
              </p>

              <div className="mb-4">
                <SelectorModo modo={modoCierre} onChange={setModoCierre} />
              </div>

              {modoCierre === 'CONTEO' ? (
                <ContadorEfectivo conteo={conteoCierre} onChange={setConteoCierre} />
              ) : (
                <div>
                  <label className="text-xs font-bold text-muted mb-1 block">Conteo Físico en Efectivo (S/)</label>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={montoConteo}
                    onChange={e => { setMontoConteo(e.target.value); setErrors(p => ({ ...p, montoConteo: '' })); }}
                    placeholder="Ej: 250.00"
                    className={`w-full border p-3 rounded-lg outline-none font-bold text-xl text-ink ${borderClass(errors.montoConteo)}`}
                  />
                  <FieldError msg={errors.montoConteo} />
                </div>
              )}
            </div>

            {/* Resultado del arqueo y cierre */}
            <div className="bg-surface rounded-xl shadow-sm border border-line p-5 flex flex-col">
              <h3 className="font-bold text-lg text-ink mb-1">Arqueo Final</h3>
              <p className="text-xs text-muted mb-4">
                Comparación del dinero contado contra el saldo teórico del turno.
              </p>

              <div className="flex flex-col gap-2 text-sm mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted">Saldo Teórico</span>
                  <span className="font-bold text-ink tabular-nums">
                    S/ {estadoCaja.caja.saldoTeoricoEfectivo.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted">Dinero Contado</span>
                  <span className="font-bold text-ink tabular-nums">
                    {isNaN(totalCierre) ? '—' : `S/ ${totalCierre.toFixed(2)}`}
                  </span>
                </div>
              </div>

              <div className={`rounded-lg border p-4 text-center mb-4 ${
                isNaN(totalCierre)
                  ? 'bg-surface-muted border-line'
                  : diferenciaCierre === 0
                  ? 'bg-success-soft border-success/30'
                  : diferenciaCierre > 0
                  ? 'bg-info-soft border-info/30'
                  : 'bg-danger-soft border-danger/30'
              }`}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-1">Diferencia</p>
                <p className={`text-3xl font-black tabular-nums ${
                  isNaN(totalCierre)
                    ? 'text-muted'
                    : diferenciaCierre === 0
                    ? 'text-success'
                    : diferenciaCierre > 0
                    ? 'text-info'
                    : 'text-danger'
                }`}>
                  {isNaN(totalCierre) ? '—' : `S/ ${diferenciaCierre.toFixed(2)}`}
                </p>
                {!isNaN(totalCierre) && (
                  <p className="text-xs font-semibold text-muted mt-1">
                    {diferenciaCierre === 0
                      ? 'Caja cuadrada'
                      : diferenciaCierre > 0
                      ? 'Sobrante en caja'
                      : 'Faltante en caja'}
                  </p>
                )}
              </div>

              <button
                onClick={handleCerrarCaja}
                disabled={loading || isNaN(totalCierre)}
                className="w-full mt-auto bg-panel hover:bg-panel-strong text-white font-bold py-3.5 rounded-lg shadow transition-colors text-sm disabled:opacity-50"
              >
                Ejecutar Cierre y Guardar Arqueo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
