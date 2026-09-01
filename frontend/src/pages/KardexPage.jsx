import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { exportToExcel } from '../utils/excelExport.js';

export default function KardexPage() {
  const [kardexRecords, setKardexRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [filterCode, setFilterCode] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Modal Form
  const [selectedProdId, setSelectedProdId] = useState('');
  const [type, setType] = useState('ENTRADA');
  const [qty, setQty] = useState('1');
  const [ref, setRef] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProducts();
    loadKardex();
  }, [filterCode]);

  const loadProducts = async () => {
    try {
      const data = await api.get('/productos');
      setProducts(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadKardex = async () => {
    try {
      setLoading(true);
      const url = filterCode ? `/kardex?productCode=${filterCode}` : '/kardex';
      const data = await api.get(url);
      setKardexRecords(data);
    } catch (err) {
      alert('Error cargando Kardex: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const exportData = kardexRecords.map(k => ({
      'Fecha / Hora': k.date,
      'Código': k.code,
      'Producto': k.name,
      'Tipo Movimiento': k.type,
      'Cantidad': k.type === 'ENTRADA' ? `+${k.qty}` : `-${k.qty}`,
      'Stock Resultante': k.stockAfter,
      'Detalle / Referencia': k.ref,
    }));
    exportToExcel(exportData, 'Kardex_Movimientos');
  };

  const handleOpenManualModal = () => {
    if (products.length > 0) {
      setSelectedProdId(products[0].id.toString());
    }
    setQty('1');
    setRef('');
    setShowModal(true);
  };

  const handleSaveMovement = async () => {
    if (!selectedProdId || !qty || parseInt(qty) <= 0) {
      return alert('Ingrese un producto y cantidad válida.');
    }

    try {
      setLoading(true);
      await api.post('/kardex', {
        productoId: selectedProdId,
        type,
        qty: parseInt(qty),
        ref: ref.trim() || 'Movimiento Manual'
      });
      setShowModal(false);
      await loadKardex();
      await loadProducts();
      alert('Movimiento registrado correctamente.');
    } catch (err) {
      alert('Error al registrar movimiento: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-gray-100 flex flex-wrap justify-between items-center bg-slate-50 gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Kardex de Inventario</h3>
            <p className="text-xs text-slate-500">Historial completo de entradas, salidas y existencias resultantes.</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={filterCode}
              onChange={e => setFilterCode(e.target.value)}
              className="border border-gray-300 p-2 rounded outline-none focus:border-orange-500 bg-white text-xs font-semibold"
            >
              <option value="">-- Todos los Productos --</option>
              {products.map(p => (
                <option key={p.id} value={p.code}>{p.name} ({p.code})</option>
              ))}
            </select>

            <button
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition-colors"
            >
              <i className="fa-solid fa-file-excel mr-2"></i>Exportar Excel
            </button>

            <button
              onClick={handleOpenManualModal}
              className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors"
            >
              <i className="fa-solid fa-plus mr-2"></i>Registrar Movimiento
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 text-slate-500 text-xs uppercase shadow-sm">
              <tr>
                <th className="px-4 py-3">Fecha / Hora</th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-center">Tipo</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Stock Final</th>
                <th className="px-4 py-3">Detalle / Referencia</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100">
              {kardexRecords.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-6 text-center text-slate-400">
                    No hay movimientos registrados.
                  </td>
                </tr>
              ) : (
                kardexRecords.map(k => {
                  const isEntrada = k.type === 'ENTRADA';
                  return (
                    <tr key={k.id} className="hover:bg-slate-50 border-b border-gray-100">
                      <td className="px-4 py-3 text-xs text-slate-500 font-medium">{k.date}</td>
                      <td className="px-4 py-3 font-mono text-xs">{k.code}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{k.name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`${isEntrada ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} px-2.5 py-1 rounded-full text-[10px] font-bold`}>
                          {k.type}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${isEntrada ? 'text-emerald-600' : 'text-red-600'}`}>
                        {isEntrada ? '+' : '-'}{k.qty}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-800">{k.stockAfter}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{k.ref}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ajuste Kardex */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg"><i className="fa-solid fa-boxes-packing mr-2"></i> Nuevo Movimiento de Kardex</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-300 hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Producto</label>
                <select
                  value={selectedProdId}
                  onChange={e => setSelectedProdId(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 bg-white text-sm"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Tipo de Movimiento</label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 bg-white text-sm"
                  >
                    <option value="ENTRADA">Entrada (Ingreso)</option>
                    <option value="SALIDA">Salida (Ajuste / Merma)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Motivo / Documento Ref.</label>
                <input
                  type="text"
                  value={ref}
                  onChange={e => setRef(e.target.value)}
                  placeholder="Ej: Compra a Proveedor / Merma por rotura"
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 font-bold text-slate-600 bg-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSaveMovement} disabled={loading} className="px-4 py-2 font-bold text-white bg-orange-600 rounded-lg text-sm">Registrar Movimiento</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
