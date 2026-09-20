import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';

export default function CreditosPage() {
  const [creditos, setCreditos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCredito, setSelectedCredito] = useState(null);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoError, setAbonoError] = useState('');

  useEffect(() => {
    loadCreditos();
  }, []);

  const loadCreditos = async () => {
    try {
      setLoading(true);
      const data = await api.get('/creditos');
      setCreditos(data);
    } catch (err) {
      alert('Error cargando créditos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (cred) => {
    setSelectedCredito(cred);
    setAbonoAmount('');
    setAbonoError('');
  };

  const handleRegisterAbono = async (amountToPay) => {
    const val = amountToPay || parseFloat(abonoAmount);
    if (isNaN(val) || val <= 0) {
      setAbonoError('Ingrese un monto de abono mayor a 0.');
      return;
    }
    if (selectedCredito && val > selectedCredito.debt + 0.001) {
      setAbonoError(`El abono no puede superar la deuda actual (S/ ${selectedCredito.debt.toFixed(2)}).`);
      return;
    }
    setAbonoError('');

    try {
      setLoading(true);
      await api.post('/creditos/abono', {
        clienteId: selectedCredito.clienteId,
        amount: val
      });

      alert('Abono registrado correctamente.');
      setSelectedCredito(null);
      await loadCreditos();
    } catch (err) {
      alert('Error al registrar abono: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaldarTodo = () => {
    if (selectedCredito && window.confirm(`¿Saldar la deuda total de S/ ${selectedCredito.debt.toFixed(2)}?`)) {
      handleRegisterAbono(selectedCredito.debt);
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-surface rounded-xl shadow-sm border border-line flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-line flex justify-between items-center bg-surface-muted">
          <div>
            <h3 className="font-bold text-ink text-lg">Módulo de Créditos (Cuentas por Cobrar)</h3>
            <p className="text-xs text-muted">Control de deudas de clientes con verificación de límite de crédito de fiado.</p>
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
                  <td colSpan="6" className="px-4 py-6 text-center text-muted">
                    No hay clientes con cuentas por cobrar pendientes.
                  </td>
                </tr>
              ) : (
                creditos.map(c => (
                  <tr key={c.id} className="hover:bg-surface-muted border-b border-line">
                    <td className="px-4 py-4 font-bold text-ink-soft">{c.name}</td>
                    <td className="px-4 py-4 text-xs text-muted">{c.lastPurchase}</td>
                    <td className="px-4 py-4 text-right font-semibold text-ink-soft">S/ {c.maxCredit.toFixed(2)}</td>
                    <td className="px-4 py-4 text-right font-black text-danger">S/ {c.debt.toFixed(2)}</td>
                    <td className="px-4 py-4 text-right font-black text-success">S/ {c.availableCredit.toFixed(2)}</td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => handleOpenModal(c)}
                        className="bg-nav hover:bg-nav-strong transition-colors text-white text-xs px-3 py-2 rounded font-bold shadow"
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
      </div>

      {/* Modal Estado de Cuenta */}
      {selectedCredito && (
        <div className="fixed inset-0 bg-nav/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-nav text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg"><i className="fa-solid fa-handshake-angle mr-2"></i> Estado de Cuenta</h3>
                <p className="text-muted text-sm">Cliente: {selectedCredito.name} (DNI/RUC: {selectedCredito.doc})</p>
              </div>
              <button onClick={() => setSelectedCredito(null)} className="text-muted hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="p-4 bg-surface-muted border-b border-line grid grid-cols-3 gap-4 shrink-0 text-center">
              <div className="bg-surface p-3 rounded-lg border border-line">
                <p className="text-xs font-bold text-muted mb-1">Límite Autorizado</p>
                <h4 className="text-lg font-black text-ink">S/ {selectedCredito.maxCredit.toFixed(2)}</h4>
              </div>
              <div className="bg-danger-soft p-3 rounded-lg border border-danger/20">
                <p className="text-xs font-bold text-danger mb-1">Deuda Pendiente</p>
                <h4 className="text-xl font-black text-danger">S/ {selectedCredito.debt.toFixed(2)}</h4>
              </div>
              <div className="bg-success-soft p-3 rounded-lg border border-success/20">
                <p className="text-xs font-bold text-success mb-1">Disponible para Fiar</p>
                <h4 className="text-lg font-black text-success">S/ {selectedCredito.availableCredit.toFixed(2)}</h4>
              </div>
            </div>

            <div className="p-4 border-b border-line shrink-0 bg-surface">
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  max={selectedCredito.debt}
                  value={abonoAmount}
                  onChange={e => { setAbonoAmount(e.target.value); setAbonoError(''); }}
                  placeholder="Monto de abono en S/..."
                  className={`flex-1 px-3 py-2 border rounded outline-none text-sm font-bold ${borderClass(abonoError)}`}
                />
                <button
                  onClick={() => handleRegisterAbono()}
                  disabled={loading}
                  className="bg-success hover:brightness-95 text-white font-bold px-4 py-2 rounded shadow text-sm"
                >
                  Registrar Abono
                </button>
                <button
                  onClick={handleSaldarTodo}
                  disabled={loading}
                  className="bg-brand hover:bg-brand-strong text-brand-contrast font-bold px-4 py-2 rounded shadow text-sm"
                >
                  Saldar Deuda Total
                </button>
              </div>
              <FieldError msg={abonoError} />
            </div>

            <div className="flex-1 overflow-auto p-4 bg-surface-muted">
              <h4 className="font-bold text-xs uppercase text-muted mb-2">Historial de Cargos y Abonos</h4>
              <table className="w-full text-left border-collapse bg-surface shadow-sm rounded-lg overflow-hidden">
                <thead className="bg-surface-muted text-muted text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Doc. Ref</th>
                    <th className="px-3 py-2">Descripción</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-line">
                  {selectedCredito.abonos.map(a => (
                    <tr key={a.id}>
                      <td className="px-3 py-2 text-muted">{a.date}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded font-bold ${a.type === 'CARGO' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
                          {a.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold">{a.docRef}</td>
                      <td className="px-3 py-2 text-ink-soft">{a.desc || '-'}</td>
                      <td className={`px-3 py-2 text-right font-black ${a.type === 'CARGO' ? 'text-danger' : 'text-success'}`}>
                        {a.type === 'CARGO' ? '+' : '-'}S/ {a.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
