import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function CreditosPage() {
  const [creditos, setCreditos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCredito, setSelectedCredito] = useState(null);
  const [abonoAmount, setAbonoAmount] = useState('');

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
  };

  const handleRegisterAbono = async (amountToPay) => {
    const val = amountToPay || parseFloat(abonoAmount);
    if (isNaN(val) || val <= 0) {
      return alert('Ingresa un monto válido.');
    }
    if (selectedCredito && val > selectedCredito.debt) {
      return alert('El abono no puede ser mayor a la deuda actual.');
    }

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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Módulo de Créditos (Cuentas por Cobrar)</h3>
            <p className="text-xs text-slate-500">Control de deudas de clientes con verificación de límite de crédito de fiado.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 text-slate-500 text-xs uppercase shadow-sm">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Último Movimiento</th>
                <th className="px-4 py-3 text-right">Límite Crédito</th>
                <th className="px-4 py-3 text-right">Deuda Pendiente</th>
                <th className="px-4 py-3 text-right">Crédito Disponible</th>
                <th className="px-4 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100">
              {creditos.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-6 text-center text-slate-400">
                    No hay clientes con cuentas por cobrar pendientes.
                  </td>
                </tr>
              ) : (
                creditos.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 border-b border-gray-100">
                    <td className="px-4 py-4 font-bold text-slate-700">{c.name}</td>
                    <td className="px-4 py-4 text-xs text-slate-500">{c.lastPurchase}</td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-700">S/ {c.maxCredit.toFixed(2)}</td>
                    <td className="px-4 py-4 text-right font-black text-red-600">S/ {c.debt.toFixed(2)}</td>
                    <td className="px-4 py-4 text-right font-black text-emerald-600">S/ {c.availableCredit.toFixed(2)}</td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => handleOpenModal(c)}
                        className="bg-slate-900 hover:bg-slate-800 transition-colors text-white text-xs px-3 py-2 rounded font-bold shadow"
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
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg"><i className="fa-solid fa-handshake-angle mr-2"></i> Estado de Cuenta</h3>
                <p className="text-slate-300 text-sm">Cliente: {selectedCredito.name} (DNI/RUC: {selectedCredito.doc})</p>
              </div>
              <button onClick={() => setSelectedCredito(null)} className="text-slate-300 hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="p-4 bg-slate-50 border-b border-gray-200 grid grid-cols-3 gap-4 shrink-0 text-center">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <p className="text-xs font-bold text-slate-500 mb-1">Límite Autorizado</p>
                <h4 className="text-lg font-black text-slate-800">S/ {selectedCredito.maxCredit.toFixed(2)}</h4>
              </div>
              <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                <p className="text-xs font-bold text-red-600 mb-1">Deuda Pendiente</p>
                <h4 className="text-xl font-black text-red-700">S/ {selectedCredito.debt.toFixed(2)}</h4>
              </div>
              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                <p className="text-xs font-bold text-emerald-600 mb-1">Disponible para Fiar</p>
                <h4 className="text-lg font-black text-emerald-800">S/ {selectedCredito.availableCredit.toFixed(2)}</h4>
              </div>
            </div>

            <div className="p-4 border-b border-gray-100 flex gap-2 shrink-0 bg-white items-center">
              <input
                type="number"
                step="0.50"
                value={abonoAmount}
                onChange={e => setAbonoAmount(e.target.value)}
                placeholder="Monto de abono en S/..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded outline-none focus:border-orange-500 text-sm font-bold"
              />
              <button
                onClick={() => handleRegisterAbono()}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded shadow text-sm"
              >
                Registrar Abono
              </button>
              <button
                onClick={handleSaldarTodo}
                disabled={loading}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded shadow text-sm"
              >
                Saldar Deuda Total
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-gray-50">
              <h4 className="font-bold text-xs uppercase text-slate-500 mb-2">Historial de Cargos y Abonos</h4>
              <table className="w-full text-left border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Doc. Ref</th>
                    <th className="px-3 py-2">Descripción</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-gray-100">
                  {selectedCredito.abonos.map(a => (
                    <tr key={a.id}>
                      <td className="px-3 py-2 text-slate-500">{a.date}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded font-bold ${a.type === 'CARGO' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {a.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold">{a.docRef}</td>
                      <td className="px-3 py-2 text-slate-700">{a.desc || '-'}</td>
                      <td className={`px-3 py-2 text-right font-black ${a.type === 'CARGO' ? 'text-red-600' : 'text-emerald-600'}`}>
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
