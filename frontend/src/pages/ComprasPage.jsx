import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function ComprasPage() {
  const [compras, setCompras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('historial'); // 'historial' | 'costos'

  // Modales
  const [showCompraModal, setShowCompraModal] = useState(false);
  const [showProveedorModal, setShowProveedorModal] = useState(false);

  // Form Proveedor
  const [provRuc, setProvRuc] = useState('');
  const [provName, setProvName] = useState('');
  const [provPhone, setProvPhone] = useState('');
  const [provAddress, setProvAddress] = useState('');

  // Form Compra
  const [selectedProveedorId, setSelectedProveedorId] = useState('');
  const [numDoc, setNumDoc] = useState('');
  const [productInput, setProductInput] = useState('');
  const [productQty, setProductQty] = useState('1');
  const [productCost, setProductCost] = useState('');
  const [compraCart, setCompraCart] = useState([]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [comprasData, provsData, prodsData] = await Promise.all([
        api.get('/compras'),
        api.get('/proveedores'),
        api.get('/productos')
      ]);
      setCompras(comprasData);
      setProveedores(provsData);
      setProductos(prodsData);
    } catch (err) {
      alert('Error cargando datos de compras: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProveedor = async () => {
    if (!provRuc.trim() || !provName.trim()) {
      return alert('RUC y Nombre de proveedor son obligatorios.');
    }

    try {
      setLoading(true);
      await api.post('/proveedores', {
        ruc: provRuc.trim(),
        name: provName.trim(),
        phone: provPhone.trim(),
        address: provAddress.trim(),
      });

      setShowProveedorModal(false);
      setProvRuc('');
      setProvName('');
      setProvPhone('');
      setProvAddress('');
      await loadInitialData();
      alert('Proveedor guardado con éxito.');
    } catch (err) {
      alert('Error guardando proveedor: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCompraModal = () => {
    if (proveedores.length > 0) {
      setSelectedProveedorId(proveedores[0].id.toString());
    }
    setNumDoc('');
    setProductInput('');
    setProductQty('1');
    setProductCost('');
    setCompraCart([]);
    setShowCompraModal(true);
  };

  const handleAddCompraItem = () => {
    if (!productInput.trim()) return alert('Seleccione un producto.');
    const qty = parseInt(productQty);
    const cost = parseFloat(productCost);

    if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) {
      return alert('Cantidad y costo unitario de compra válidos requeridos.');
    }

    const prod = productos.find(p => `${p.code} - ${p.name}` === productInput.trim()) ||
      productos.find(p => p.code === productInput.trim() || p.name.toLowerCase().includes(productInput.trim().toLowerCase()));

    if (!prod) return alert('Producto no encontrado.');

    setCompraCart(prev => {
      const exist = prev.find(item => item.id === prod.id);
      if (exist) {
        return prev.map(item => item.id === prod.id ? { ...item, qty: item.qty + qty, cost } : item);
      }
      return [...prev, { id: prod.id, name: prod.name, code: prod.code, qty, cost }];
    });

    setProductInput('');
    setProductQty('1');
    setProductCost('');
  };

  const handleRemoveCompraItem = (id) => {
    setCompraCart(prev => prev.filter(i => i.id !== id));
  };

  const handleSaveCompra = async () => {
    if (!selectedProveedorId || !numDoc.trim() || compraCart.length === 0) {
      return alert('Seleccione un proveedor, ingrese el número de factura/guía y agregue al menos un producto.');
    }

    try {
      setLoading(true);
      await api.post('/compras', {
        proveedorId: selectedProveedorId,
        numDoc: numDoc.trim(),
        items: compraCart
      });

      setShowCompraModal(false);
      await loadInitialData();
      alert('¡Compra registrada exitosamente! El stock del inventario y el Kardex han sido actualizados.');
    } catch (err) {
      alert('Error registrando compra: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const compraTotal = compraCart.reduce((acc, i) => acc + (i.qty * i.cost), 0);

  // Aplanar detalles de compra para vista de Variación de Costos
  const costHistoryItems = [];
  compras.forEach(c => {
    c.detalles.forEach(d => {
      costHistoryItems.push({
        compraId: c.id,
        numDoc: c.numDoc,
        date: c.date,
        provider: c.provider,
        productCode: d.producto.code,
        productName: d.producto.name,
        quantity: d.quantity,
        unitCost: d.unitPrice,
        subtotal: d.subtotal,
      });
    });
  });

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Módulo de Compras a Proveedores</h2>
          <p className="text-xs text-slate-500">Ingreso de facturas/guías de proveedores, control de stock e histórico de variación de precios de compra.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowProveedorModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow text-sm transition-colors"
          >
            <i className="fa-solid fa-truck-field mr-2"></i>Nuevo Proveedor
          </button>
          <button
            onClick={handleOpenCompraModal}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg shadow text-sm transition-colors"
          >
            <i className="fa-solid fa-cart-flatbed mr-2"></i>Registrar Compra
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-gray-100 bg-slate-50 flex justify-between items-center">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('historial')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'historial' ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-600 border'}`}
            >
              <i className="fa-solid fa-receipt mr-1.5"></i> Historial de Compras
            </button>
            <button
              onClick={() => setViewMode('costos')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'costos' ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-600 border'}`}
            >
              <i className="fa-solid fa-chart-line mr-1.5"></i> Histórico de Variación de Costos
            </button>
          </div>
        </div>

        {viewMode === 'historial' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 text-slate-500 text-xs uppercase shadow-sm">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">N° Doc / Factura</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Items Comprados</th>
                  <th className="px-4 py-3 text-right">Monto Total</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100">
                {compras.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-6 text-center text-slate-400">
                      No hay compras de mercadería registradas.
                    </td>
                  </tr>
                ) : (
                  compras.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 border-b border-gray-100">
                      <td className="px-4 py-3 text-xs text-slate-500">{c.date}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold">{c.numDoc}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">
                        {c.provider} <span className="text-xs text-slate-400 font-normal">({c.providerRuc})</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {c.detalles.map(d => `${d.quantity}x ${d.producto.name}`).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-800">S/ {c.total.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 text-slate-500 text-xs uppercase shadow-sm">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3 font-mono">Factura Ref</th>
                  <th className="px-4 py-3 text-right">Cant.</th>
                  <th className="px-4 py-3 text-right">Costo Unitario (S/)</th>
                  <th className="px-4 py-3 text-right">Subtotal (S/)</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100">
                {costHistoryItems.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-6 text-center text-slate-400">
                      No hay historial de costos registrado.
                    </td>
                  </tr>
                ) : (
                  costHistoryItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 border-b border-gray-100">
                      <td className="px-4 py-3 text-xs text-slate-500">{item.date}</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{item.productCode}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{item.productName}</td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-700">{item.provider}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.numDoc}</td>
                      <td className="px-4 py-3 text-right font-semibold">{item.quantity}</td>
                      <td className="px-4 py-3 text-right font-black text-orange-600">S/ {item.unitCost.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">S/ {item.subtotal.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nuevo Proveedor */}
      {showProveedorModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg"><i className="fa-solid fa-truck-field mr-2"></i> Registrar Proveedor</h3>
              <button onClick={() => setShowProveedorModal(false)} className="text-slate-300 hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">RUC del Proveedor</label>
                <input
                  type="text"
                  value={provRuc}
                  onChange={e => setProvRuc(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Razón Social / Nombre</label>
                <input
                  type="text"
                  value={provName}
                  onChange={e => setProvName(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Teléfono</label>
                <input
                  type="text"
                  value={provPhone}
                  onChange={e => setProvPhone(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Dirección</label>
                <input
                  type="text"
                  value={provAddress}
                  onChange={e => setProvAddress(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
              <button onClick={() => setShowProveedorModal(false)} className="px-4 py-2 font-bold text-slate-600 bg-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSaveProveedor} disabled={loading} className="px-4 py-2 font-bold text-white bg-blue-600 rounded-lg text-sm">Guardar Proveedor</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Registrar Compra */}
      {showCompraModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg"><i className="fa-solid fa-cart-flatbed mr-2"></i> Registrar Entrada de Mercadería</h3>
              <button onClick={() => setShowCompraModal(false)} className="text-slate-300 hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-4 bg-slate-50 border-b border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Proveedor</label>
                <select
                  value={selectedProveedorId}
                  onChange={e => setSelectedProveedorId(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 bg-white text-sm"
                >
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (RUC: {p.ruc})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">N° Factura / Guía de Remisión</label>
                <input
                  type="text"
                  value={numDoc}
                  onChange={e => setNumDoc(e.target.value)}
                  placeholder="Ej: F001-000458"
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm font-medium"
                />
              </div>
            </div>

            <div className="p-4 border-b border-gray-100 flex gap-2 shrink-0 bg-white items-center">
              <div className="flex-1 relative">
                <input
                  list="compra-prod-list"
                  value={productInput}
                  onChange={e => setProductInput(e.target.value)}
                  placeholder="Buscar producto..."
                  className="w-full px-3 py-2 border border-gray-300 rounded outline-none focus:border-orange-500 bg-white text-sm"
                />
                <datalist id="compra-prod-list">
                  {productos.map(p => (
                    <option key={p.id} value={`${p.code} - ${p.name}`} />
                  ))}
                </datalist>
              </div>
              <input
                type="number"
                value={productQty}
                onChange={e => setProductQty(e.target.value)}
                placeholder="Cant."
                className="w-20 border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
              />
              <input
                type="number"
                step="0.10"
                value={productCost}
                onChange={e => setProductCost(e.target.value)}
                placeholder="Costo S/"
                className="w-24 border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
              />
              <button
                onClick={handleAddCompraItem}
                className="bg-slate-800 text-white font-bold px-4 py-2 rounded shadow hover:bg-slate-700 text-sm"
              >
                Agregar
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-gray-50">
              <table className="w-full text-left border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Cant.</th>
                    <th className="px-3 py-2 text-right">Costo U.</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                    <th className="px-3 py-2">Acción</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100">
                  {compraCart.map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                      <td className="px-3 py-2 font-semibold">{item.name}</td>
                      <td className="px-3 py-2 font-bold">{item.qty}</td>
                      <td className="px-3 py-2 text-right">S/ {item.cost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-bold">S/ {(item.qty * item.cost).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => handleRemoveCompraItem(item.id)} className="text-red-500 hover:text-red-700">
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-white border-t flex justify-between items-center shrink-0">
              <div className="text-slate-800 font-bold text-lg">
                TOTAL COMPRA: <span className="text-2xl font-black text-orange-600">S/ {compraTotal.toFixed(2)}</span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCompraModal(false)} className="px-4 py-2 font-bold text-slate-600 bg-slate-200 rounded-lg text-sm">Cancelar</button>
                <button onClick={handleSaveCompra} disabled={loading || compraCart.length === 0} className="px-6 py-2 font-bold text-white bg-orange-600 rounded-lg shadow-md text-sm">
                  Registrar Compra
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
