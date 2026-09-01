import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function ClientesPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [cliType, setCliType] = useState('Natural');
  const [cliDoc, setCliDoc] = useState('');
  const [cliName, setCliName] = useState('');
  const [cliPhone, setCliPhone] = useState('');
  const [cliEmail, setCliEmail] = useState('');
  const [cliAddress, setCliAddress] = useState('');
  const [maxCredit, setMaxCredit] = useState('1000');

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      const data = await api.get('/clientes');
      setClients(data);
    } catch (err) {
      alert('Error cargando clientes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClient = async () => {
    if (!cliDoc.trim() || !cliName.trim()) {
      return alert('El Documento y Nombre/Razón Social son obligatorios.');
    }

    try {
      setLoading(true);
      await api.post('/clientes', {
        type: cliType,
        doc: cliDoc.trim(),
        name: cliName.trim(),
        phone: cliPhone.trim(),
        email: cliEmail.trim(),
        address: cliAddress.trim(),
        maxCredit: parseFloat(maxCredit) || 1000.0,
      });

      setShowModal(false);
      setCliDoc('');
      setCliName('');
      setCliPhone('');
      setCliEmail('');
      setCliAddress('');
      setMaxCredit('1000');

      await loadClients();
      alert('Cliente guardado con éxito.');
    } catch (err) {
      alert('Error al guardar cliente: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditMaxCredit = async (client) => {
    const val = prompt(`Ingrese el nuevo Límite de Crédito para ${client.name} (S/):`, client.maxCredit);
    if (val === null) return;
    const parsed = parseFloat(val);
    if (isNaN(parsed) || parsed < 0) return alert('Monto no válido.');

    try {
      setLoading(true);
      await api.put(`/clientes/${client.id}/max-credit`, { maxCredit: parsed });
      await loadClients();
      alert('Límite de crédito actualizado.');
    } catch (err) {
      alert('Error al actualizar límite: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Directorio de Clientes</h3>
            <p className="text-xs text-slate-500">Gestión de clientes y control de asignación de límites de crédito (Fiado).</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg shadow text-sm transition-colors"
          >
            <i className="fa-solid fa-user-plus mr-2"></i>Nuevo Cliente
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 text-slate-500 text-xs uppercase shadow-sm">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">DNI / RUC</th>
                <th className="px-4 py-3">Nombre / Razón Social</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3 text-right">Deuda Actual</th>
                <th className="px-4 py-3 text-right">Límite Crédito</th>
                <th className="px-4 py-3 text-right">Crédito Disponible</th>
                <th className="px-4 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100">
              {clients.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 border-b border-gray-100">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.type === 'EMPRESA' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {c.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold">{c.doc}</td>
                  <td className="px-4 py-3 font-bold text-slate-800">{c.name}</td>
                  <td className="px-4 py-3 text-xs">{c.phone || '-'}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-600">S/ {c.currentDebt.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">S/ {c.maxCredit.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-black text-emerald-600">S/ {c.availableCredit.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleEditMaxCredit(c)}
                      className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2.5 py-1 rounded shadow-sm"
                      title="Editar Límite de Crédito"
                    >
                      <i className="fa-solid fa-pen-to-square mr-1"></i> Crédito
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nuevo Cliente */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg"><i className="fa-solid fa-user-plus mr-2"></i> Registrar Cliente</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-300 hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Tipo Cliente</label>
                  <select
                    value={cliType}
                    onChange={e => setCliType(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 bg-white text-sm"
                  >
                    <option value="Natural">Persona Natural</option>
                    <option value="Empresa">Empresa (RUC)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">DNI / RUC</label>
                  <input
                    type="text"
                    value={cliDoc}
                    onChange={e => setCliDoc(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Nombre / Razón Social</label>
                <input
                  type="text"
                  value={cliName}
                  onChange={e => setCliName(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Teléfono</label>
                  <input
                    type="text"
                    value={cliPhone}
                    onChange={e => setCliPhone(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Límite de Crédito (S/)</label>
                  <input
                    type="number"
                    value={maxCredit}
                    onChange={e => setMaxCredit(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Dirección</label>
                <input
                  type="text"
                  value={cliAddress}
                  onChange={e => setCliAddress(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 font-bold text-slate-600 bg-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSaveClient} disabled={loading} className="px-4 py-2 font-bold text-white bg-orange-600 rounded-lg text-sm">Guardar Cliente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
