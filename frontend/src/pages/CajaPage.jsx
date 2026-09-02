import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function CajaPage({ currentUser }) {
  const [estadoCaja, setEstadoCaja] = useState({ abierta: false, caja: null });
  const [montoInicial, setMontoInicial] = useState('');
  const [montoConteo, setMontoConteo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    loadEstadoCaja();

    const intervalo = setInterval(loadEstadoCaja, 3000);

    const actualizarCaja = () => loadEstadoCaja();
    window.addEventListener('venta-registrada', actualizarCaja);

    return () => {
      clearInterval(intervalo);
      window.removeEventListener('venta-registrada', actualizarCaja);
    };
  }, [currentUser]);

  const loadEstadoCaja = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/caja/estado-actual?usuarioId=${currentUser.id}`);
      setEstadoCaja(data);
    } catch (err) {
      console.error('Error cargando estado de caja:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAbrirCaja = async () => {
    const m = parseFloat(montoInicial);
    if (isNaN(m) || m < 0) {
      return alert('Ingrese un monto inicial válido.');
    }

    try {
      setLoading(true);
      await api.post('/caja/apertura', {
        usuarioId: currentUser.id,
        montoInicial: m,
      });

      alert('¡Caja abierta exitosamente!');
      setMontoInicial('');
      await loadEstadoCaja();
    } catch (err) {
      alert('Error al abrir caja: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCerrarCaja = async () => {
    const conteo = parseFloat(montoConteo);
    if (isNaN(conteo) || conteo < 0) {
      return alert('Ingrese el monto en efectivo contado.');
    }

    if (!window.confirm('¿Confirmar el cierre de caja y arqueo final?')) return;

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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Control de Caja Chica y Arqueo Diario</h2>
          <p className="text-xs text-slate-500">Gestión de aperturas de turno, cuadre de efectivo vs digital y cierres de caja.</p>
        </div>
      </div>

      {!estadoCaja.abierta ? (
        /* APERTURA DE CAJA */
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-lg mx-auto mt-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
              <i className="fa-solid fa-cash-register"></i>
            </div>
            <h3 className="text-xl font-bold text-slate-800">Apertura de Turno de Caja</h3>
            <p className="text-xs text-slate-500 mt-1">Ingrese el monto en efectivo con el que inicia su turno en caja chica.</p>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">Monto Inicial en Efectivo (S/)</label>
              <input
                type="number"
                step="0.50"
                value={montoInicial}
                onChange={e => setMontoInicial(e.target.value)}
                placeholder="Ej: 100.00"
                className="w-full border border-gray-300 p-3 rounded-lg outline-none focus:border-orange-500 font-bold text-lg text-slate-800"
              />
            </div>
            <button
              onClick={handleAbrirCaja}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-lg shadow-md transition-colors text-base"
            >
              Abrir Caja y Comenzar Turno
            </button>
          </div>
        </div>
      ) : (
        /* ESTADO Y ARQUEO DE CAJA ABIERTA */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Resumen del Turno */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4 pb-3 border-b">
                <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-bold">
                  <i className="fa-solid fa-lock-open mr-1"></i> CAJA ABIERTA
                </span>
                <span className="text-xs text-slate-400">Inicio: {estadoCaja.caja.createdAt}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
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
            </div>

            <p className="text-xs text-slate-400 italic text-center">
              El saldo teórico es la suma del Monto Inicial + Ventas en Efectivo recaudadas en este turno.
            </p>
          </div>

          {/* Formulario de Arqueo y Cierre */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-lg text-slate-800 mb-2">Arqueo Final y Cierre de Turno</h3>
              <p className="text-xs text-slate-500 mb-6">
                Cuente el dinero físico presente en la gaveta/caja chica e ingrese la cifra a continuación para calcular si existe sobrante o faltante.
              </p>

              <div className="mb-6">
                <label className="text-xs font-bold text-slate-500 mb-1 block">Conteo Físico en Efectivo (S/)</label>
                <input
                  type="number"
                  step="0.10"
                  value={montoConteo}
                  onChange={e => setMontoConteo(e.target.value)}
                  placeholder="Ej: 250.00"
                  className="w-full border border-gray-300 p-3 rounded-lg outline-none focus:border-orange-500 font-bold text-xl text-slate-800"
                />
              </div>

              {montoConteo !== '' && !isNaN(parseFloat(montoConteo)) && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 mb-6">
                  <div className="flex justify-between items-center text-sm font-semibold mb-1">
                    <span>Saldo Teórico:</span>
                    <span>S/ {estadoCaja.caja.saldoTeoricoEfectivo.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-semibold mb-2">
                    <span>Dinero Contado:</span>
                    <span>S/ {parseFloat(montoConteo).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-base font-black border-t pt-2">
                    <span>Diferencia:</span>
                    <span className={
                      (parseFloat(montoConteo) - estadoCaja.caja.saldoTeoricoEfectivo) === 0
                        ? 'text-emerald-600'
                        : (parseFloat(montoConteo) - estadoCaja.caja.saldoTeoricoEfectivo) > 0
                        ? 'text-blue-600'
                        : 'text-red-600'
                    }>
                      S/ {(parseFloat(montoConteo) - estadoCaja.caja.saldoTeoricoEfectivo).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleCerrarCaja}
              disabled={loading || montoConteo === ''}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-lg shadow transition-colors text-sm disabled:opacity-50"
            >
              Ejecutar Cierre y Guardar Arqueo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
