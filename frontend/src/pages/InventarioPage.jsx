import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { exportToExcel } from '../utils/excelExport.js';

export default function InventarioPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Formulario nuevo producto
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('Unidad');
  const [name, setName] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('10');
  const [price, setPrice] = useState('');
  const [searchingBarcode, setSearchingBarcode] = useState(false);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await api.get('/productos');
      setProducts(data);
    } catch (err) {
      alert('Error cargando inventario: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const exportData = products.map(p => ({
      'Código': p.code,
      'Producto': p.name,
      'Unidad': p.unit,
      'Stock Real': p.stock,
      'Stock Mínimo': p.minStock || 10,
      'Precio (S/)': p.price,
      'Estado Stock': p.stock <= (p.minStock || 10) ? 'STOCK BAJO' : 'OK'
    }));
    exportToExcel(exportData, 'Inventario_Productos');
  };

  const handleSearchBarcode = async () => {
    if (!code.trim()) return;
    try {
      setSearchingBarcode(true);
      const res = await api.get(`/productos/barcode/${code.trim()}`);
      if (res.foundInDb) {
        alert('Este producto ya existe en el inventario.');
        setName(res.product.name);
        setUnit(res.product.unit);
        setPrice(res.product.price);
      } else if (res.name) {
        setName(res.name);
      }
    } catch (err) {
      alert('No se encontró el nombre del producto de forma automática. Ingrese el nombre manualmente.');
    } finally {
      setSearchingBarcode(false);
    }
  };

  const handleSaveProduct = async () => {
    if (!code.trim() || !name.trim() || stock === '' || price === '') {
      return alert('Complete todos los campos obligatorios.');
    }

    try {
      setLoading(true);
      await api.post('/productos', {
        code: code.trim(),
        name: name.trim(),
        unit,
        stock: parseInt(stock),
        minStock: parseInt(minStock) || 10,
        price: parseFloat(price)
      });
      setShowModal(false);
      setCode('');
      setName('');
      setStock('');
      setMinStock('10');
      setPrice('');
      await loadProducts();
      alert('Producto registrado exitosamente.');
    } catch (err) {
      alert('Error guardando producto: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Catálogo de Productos</h3>
            <p className="text-xs text-slate-500">Gestión de inventario con alertas de stock mínimo y exportación a Excel.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition-colors"
            >
              <i className="fa-solid fa-file-excel mr-2"></i>Exportar Excel
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors"
            >
              <i className="fa-solid fa-plus mr-2"></i>Agregar Producto
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 text-slate-500 text-xs uppercase shadow-sm">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Unidad</th>
                <th className="px-4 py-3">Stock Real</th>
                <th className="px-4 py-3 text-center">Estado Alerta</th>
                <th className="px-4 py-3">Precio</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100">
              {products.map(p => {
                const isLowStock = p.stock <= (p.minStock || 10);
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{p.name}</td>
                    <td className="px-4 py-3 text-xs">{p.unit}</td>
                    <td className={`px-4 py-3 font-bold ${isLowStock ? 'text-red-600' : 'text-slate-800'}`}>
                      {p.stock}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isLowStock ? (
                        <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold flex items-center justify-center gap-1 w-max mx-auto">
                          <i className="fa-solid fa-triangle-exclamation"></i> Stock Bajo (Mín: {p.minStock || 10})
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold">
                          Normal
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">S/ {p.price.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nuevo Producto */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg"><i className="fa-solid fa-box-open mr-2"></i> Nuevo Producto</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-300 hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Código (Escanear)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearchBarcode()}
                      placeholder="Escanea aquí..."
                      className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                    />
                    <button
                      onClick={handleSearchBarcode}
                      disabled={searchingBarcode}
                      className="bg-slate-200 text-slate-600 px-3 rounded hover:bg-slate-300 text-xs"
                    >
                      <i className="fa-solid fa-magnifying-glass"></i>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Unidad</label>
                  <select
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 bg-white text-sm"
                  >
                    <option value="Unidad">Unidad</option>
                    <option value="Bolsa">Bolsa</option>
                    <option value="Metro">Metro</option>
                    <option value="Kilo">Kilo</option>
                    <option value="Galón">Galón</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Nombre del Producto</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={searchingBarcode ? "Buscando en internet..." : ""}
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Stock Inicial</label>
                  <input
                    type="number"
                    value={stock}
                    onChange={e => setStock(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Stock Mínimo</label>
                  <input
                    type="number"
                    value={minStock}
                    onChange={e => setMinStock(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Precio (S/)</label>
                  <input
                    type="number"
                    step="0.10"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 font-bold text-slate-600 bg-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSaveProduct} disabled={loading} className="px-4 py-2 font-bold text-white bg-orange-600 rounded-lg text-sm">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
