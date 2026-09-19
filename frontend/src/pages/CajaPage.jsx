import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';
import ContadorEfectivo, { calcularTotalConteo } from '../components/ContadorEfectivo.jsx';

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
              ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
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
      <p className="text-sm text-slate-500 text-center bg-white border border-gray-200 rounded-xl p-6">
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
            className={`bg-white rounded-xl border p-4 flex flex-col gap-2 ${selected ? 'border-orange-500 ring-2 ring-orange-200' : 'border-gray-200'}`}
          >
            <div className="flex justify-between items-center gap-2">
              <h4 className="font-bold text-slate-800"><i className="fa-solid fa-cash-register mr-2 text-slate-400"></i>{r.name}</h4>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.session ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {r.session ? 'Turno abierto' : 'Cerrada'}
              </span>
            </div>
            {r.session ? (
              <>
                <p className="text-xs text-slate-500">
                  Abierta por <strong className="text-slate-700">{r.session.openedBy}</strong> a las {formatTime(r.session.openedAt)}
                  {r.session.members.length > 0 && <> · Cajeros: {r.session.members.join(', ')}</>}
                </p>
                <button
                  type="button"
                  onClick={() => onJoin(r)}
                  disabled={loading}
                  className="mt-auto w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  <i className="fa-solid fa-user-plus mr-1.5"></i> Unirme a este turno
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className={`mt-auto w-full font-bold py-2 rounded-lg text-sm border ${selected ? 'bg-orange-50 text-orange-700 border-orange-300' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
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

      alert(`¡${registerToOpen.name} abierta con S/ ${m.toFixed(2)}!`);
      setMontoInicial('');
      setConteoApertura({});
      await loadEstadoCaja();
    } catch (err) {
      alert('Error al abrir caja: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnirse = async (register) => {
    if (!window.confirm(`¿Unirse al turno de ${register.name}? Lo que cobre quedará registrado a su nombre en ese turno.`)) return;
    try {
      setLoading(true);
      await api.post(`/caja/turnos/${register.session.id}/unirse`, {});
      await loadEstadoCaja();
    } catch (err) {
      alert('No se pudo unir al turno: ' + err.message);
      await loadEstadoCaja();
    } finally {
      setLoading(false);
    }
  };

  const handleSalir = async () => {
    if (!window.confirm('¿Salir del turno sin cerrarlo? Lo que cobró queda en el turno y lo cierran los demás cajeros.')) return;
    try {
      setLoading(true);
      await api.post(`/caja/turnos/${estadoCaja.caja.id}/salir`, {});
      await loadEstadoCaja();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCerrarCaja = async () => {
    if (modoCierre === 'MANUAL' && !validateMonto(montoConteo, 'montoConteo')) return;
    const conteo = totalCierre;

    const otros = estadoCaja.caja.members.filter(m => m.id !== currentUser.id).length;
    const aviso = otros > 0 ? `\n\nSe cerrará el turno para los ${otros + 1} cajeros.` : '';
    if (!window.confirm(`¿Confirmar el cierre de caja con un conteo físico de S/ ${conteo.toFixed(2)}?${aviso}`)) return;

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

        alert(msg);
        setMontoConteo('');
        setConteoCierre({});
        await loadEstadoCaja();
      }
    } catch (err) {
      alert('Error al cerrar caja: ' + err.message);
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
            <h3 className="text-lg font-bold text-slate-800">Cajas</h3>
            <p className="text-xs text-slate-500">Abra el turno de una caja cerrada o únase al turno de una caja que ya está abierta.</p>
          </div>

          <RegisterList
            registers={estadoCaja.registers || []}
            selectedId={registerToOpen?.id}
            onSelect={setSelectedRegisterId}
            onJoin={handleUnirse}
            loading={loading}
          />

          {registerToOpen && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 sm:p-8 w-full max-w-2xl mx-auto">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
                  <i className="fa-solid fa-cash-register"></i>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Apertura de {registerToOpen.name}</h3>
                <p className="text-xs text-slate-500 mt-1">Cuente el efectivo con el que inicia el turno.</p>
              </div>

              <div className="flex flex-col gap-4">
                <SelectorModo modo={modoApertura} onChange={setModoApertura} />

                {modoApertura === 'CONTEO' ? (
                  <ContadorEfectivo conteo={conteoApertura} onChange={setConteoApertura} />
                ) : (
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Monto Inicial en Efectivo (S/)</label>
                    <input
                      type="number"
                      step="0.50"
                      min="0"
                      value={montoInicial}
                      onChange={e => { setMontoInicial(e.target.value); setErrors(p => ({ ...p, montoInicial: '' })); }}
                      placeholder="Ej: 100.00"
                      className={`w-full border p-3 rounded-lg outline-none font-bold text-lg text-slate-800 ${borderClass(errors.montoInicial)}`}
                    />
                    <FieldError msg={errors.montoInicial} />
                  </div>
                )}

                <button
                  onClick={handleAbrirCaja}
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-lg shadow-md transition-colors text-base disabled:opacity-50"
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4 pb-3 border-b">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-bold">
                  <i className="fa-solid fa-lock-open mr-1"></i> {estadoCaja.caja.register.name.toUpperCase()} ABIERTA
                </span>
                <span className="text-xs text-slate-400">Abierta por {estadoCaja.caja.openedBy} · {estadoCaja.caja.createdAt}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Cajeros:</span>
                {estadoCaja.caja.members.map(m => (
                  <span key={m.id} className={`text-xs px-2 py-0.5 rounded-full border ${m.id === currentUser.id ? 'bg-orange-50 border-orange-200 text-orange-700 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                    {m.name}{m.id === currentUser.id && ' (usted)'}
                  </span>
                ))}
                {estadoCaja.caja.members.length > 1 && (
                  <button
                    type="button"
                    onClick={handleSalir}
                    disabled={loading}
                    className="text-xs font-semibold text-slate-600 hover:text-red-600 border border-slate-300 rounded-lg px-2.5 py-1 disabled:opacity-50"
                  >
                    <i className="fa-solid fa-right-from-bracket mr-1"></i> Salir del turno
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400 italic mb-3">
              El saldo teórico es la suma del Monto Inicial + Ventas en Efectivo recaudadas en este turno.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <p className="text-xs font-bold text-slate-500 mb-1">Monto Inicial</p>
                <h4 className="text-2xl font-black text-slate-800">S/ {estadoCaja.caja.montoInicial.toFixed(2)}</h4>
              </div>

              <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                <p className="text-xs font-bold text-emerald-600 mb-1">Ventas en Efectivo</p>
                <h4 className="text-2xl font-black text-emerald-800">S/ {estadoCaja.caja.ventasEfectivo.toFixed(2)}</h4>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <p className="text-xs font-bold text-blue-600 mb-1">Ventas Digitales (Yape/Tarjetas)</p>
                <h4 className="text-2xl font-black text-blue-800">S/ {estadoCaja.caja.ventasDigital.toFixed(2)}</h4>
              </div>

              <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                <p className="text-xs font-bold text-purple-600 mb-1">Saldo Teórico en Efectivo</p>
                <h4 className="text-2xl font-black text-purple-900">S/ {estadoCaja.caja.saldoTeoricoEfectivo.toFixed(2)}</h4>
              </div>
            </div>

            {estadoCaja.caja.byCashier.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                      <th className="py-2">Cobrado por</th>
                      <th className="py-2 text-right">Ventas</th>
                      <th className="py-2 text-right">Efectivo</th>
                      <th className="py-2 text-right">Digital</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {estadoCaja.caja.byCashier.map(c => (
                      <tr key={c.userId ?? 'sin'}>
                        <td className="py-2 text-slate-700">{c.name}</td>
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
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="font-bold text-lg text-slate-800 mb-1">Conteo de Efectivo en Gaveta</h3>
              <p className="text-xs text-slate-500 mb-4">
                Registre cuántos billetes y monedas de cada denominación hay físicamente en la caja.
              </p>

              <div className="mb-4">
                <SelectorModo modo={modoCierre} onChange={setModoCierre} />
              </div>

              {modoCierre === 'CONTEO' ? (
                <ContadorEfectivo conteo={conteoCierre} onChange={setConteoCierre} />
              ) : (
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Conteo Físico en Efectivo (S/)</label>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    value={montoConteo}
                    onChange={e => { setMontoConteo(e.target.value); setErrors(p => ({ ...p, montoConteo: '' })); }}
                    placeholder="Ej: 250.00"
                    className={`w-full border p-3 rounded-lg outline-none font-bold text-xl text-slate-800 ${borderClass(errors.montoConteo)}`}
                  />
                  <FieldError msg={errors.montoConteo} />
                </div>
              )}
            </div>

            {/* Resultado del arqueo y cierre */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col">
              <h3 className="font-bold text-lg text-slate-800 mb-1">Arqueo Final</h3>
              <p className="text-xs text-slate-500 mb-4">
                Comparación del dinero contado contra el saldo teórico del turno.
              </p>

              <div className="flex flex-col gap-2 text-sm mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Saldo Teórico</span>
                  <span className="font-bold text-slate-800 tabular-nums">
                    S/ {estadoCaja.caja.saldoTeoricoEfectivo.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Dinero Contado</span>
                  <span className="font-bold text-slate-800 tabular-nums">
                    {isNaN(totalCierre) ? '—' : `S/ ${totalCierre.toFixed(2)}`}
                  </span>
                </div>
              </div>

              <div className={`rounded-lg border p-4 text-center mb-4 ${
                isNaN(totalCierre)
                  ? 'bg-slate-50 border-slate-200'
                  : diferenciaCierre === 0
                  ? 'bg-emerald-50 border-emerald-200'
                  : diferenciaCierre > 0
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Diferencia</p>
                <p className={`text-3xl font-black tabular-nums ${
                  isNaN(totalCierre)
                    ? 'text-slate-300'
                    : diferenciaCierre === 0
                    ? 'text-emerald-600'
                    : diferenciaCierre > 0
                    ? 'text-blue-600'
                    : 'text-red-600'
                }`}>
                  {isNaN(totalCierre) ? '—' : `S/ ${diferenciaCierre.toFixed(2)}`}
                </p>
                {!isNaN(totalCierre) && (
                  <p className="text-xs font-semibold text-slate-500 mt-1">
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
                className="w-full mt-auto bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-lg shadow transition-colors text-sm disabled:opacity-50"
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
