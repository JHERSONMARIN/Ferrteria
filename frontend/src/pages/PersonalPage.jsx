import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function PersonalPage() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [role, setRole] = useState('VENDEDOR');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [modules, setModules] = useState(['pos']);

  const moduleOptions = [
    { value: 'pos', label: 'Punto de Venta' },
    { value: 'inventory', label: 'Almacén' },
    { value: 'kardex', label: 'Kardex' },
    { value: 'deliveries', label: 'Entregas' },
    { value: 'client-dir', label: 'Dir. Clientes' },
    { value: 'customers', label: 'Créditos' },
    { value: 'personal', label: 'Personal' },
    { value: 'dashboard', label: 'Reportes' },
  ];

  useEffect(() => {
    loadStaff();
  }, []);

  const loadStaff = async () => {
    try {
      setLoading(true);
      const data = await api.get('/personal');
      setStaff(data);
    } catch (err) {
      alert('Error cargando personal: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleModule = (val) => {
    setModules(prev =>
      prev.includes(val) ? prev.filter(m => m !== val) : [...prev, val]
    );
  };

  const handleSaveStaff = async () => {
    if (!name.trim() || !user.trim() || !pass.trim()) {
      return alert('Ingrese el nombre, usuario y contraseña del personal.');
    }
    if (modules.length === 0) {
      return alert('Debe seleccionar al menos un módulo para que el usuario pueda ingresar.');
    }

    try {
      setLoading(true);
      await api.post('/personal', {
        name: name.trim(),
        user: user.trim(),
        pass: pass.trim(),
        role,
        modules
      });

      setShowModal(false);
      setName('');
      setUser('');
      setPass('');
      setModules(['pos']);

      await loadStaff();
      alert('Personal registrado exitosamente.');
    } catch (err) {
      alert('Error guardando personal: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStaff = async (id) => {
    if (window.confirm('¿Eliminar este miembro del personal?')) {
      try {
        setLoading(true);
        await api.delete(`/personal/${id}`);
        await loadStaff();
      } catch (err) {
        alert('Error eliminando personal: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 text-lg">Módulo de Personal (Empleados y Roles)</h3>
          <button
            onClick={() => setShowModal(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors"
          >
            <i className="fa-solid fa-user-plus mr-2"></i>Agregar Personal
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 text-slate-500 text-xs uppercase shadow-sm">
              <tr>
                <th className="px-4 py-3">Nombre y Apellidos</th>
                <th className="px-4 py-3">Usuario (Login)</th>
                <th className="px-4 py-3">Rol / Cargo</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100">
              {staff.map(s => {
                let badgeColor = 'bg-gray-200 text-slate-700';
                if (s.role === 'ADMINISTRADOR') badgeColor = 'bg-purple-100 text-purple-700';
                if (s.role === 'VENDEDOR') badgeColor = 'bg-orange-100 text-orange-700';
                if (s.role === 'CAJERO') badgeColor = 'bg-emerald-100 text-emerald-700';
                if (s.role === 'REPARTIDOR') badgeColor = 'bg-blue-100 text-blue-700';

                return (
                  <tr key={s.id} className="hover:bg-slate-50 border-b border-gray-100">
                    <td className="px-4 py-3 font-bold text-slate-700">{s.name}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-sm">{s.user}</td>
                    <td className="px-4 py-3">
                      <span className={`${badgeColor} px-2.5 py-1 rounded-full text-xs font-bold`}>
                        {s.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeleteStaff(s.id)}
                        className="text-red-400 hover:text-red-600"
                        title="Eliminar"
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Registrar Personal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg"><i className="fa-solid fa-user-tie mr-2"></i> Registrar Personal</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-300 hover:text-white">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Nombres y Apellidos</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Usuario (Login)</label>
                  <input
                    type="text"
                    value={user}
                    onChange={e => setUser(e.target.value)}
                    placeholder="Ej: jperez"
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Contraseña</label>
                  <input
                    type="password"
                    value={pass}
                    onChange={e => setPass(e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Rol Asignado</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded outline-none focus:border-orange-500 bg-white text-sm"
                >
                  <option value="VENDEDOR">Vendedor</option>
                  <option value="CAJERO">Cajero</option>
                  <option value="REPARTIDOR">Repartidor</option>
                  <option value="ADMINISTRADOR">Administrador</option>
                </select>
              </div>

              <div className="bg-slate-50 p-3 rounded border border-gray-200">
                <label className="text-xs font-bold text-slate-700 mb-2 block">Módulos Permitidos (Accesos)</label>
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                  {moduleOptions.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={modules.includes(opt.value)}
                        onChange={() => handleToggleModule(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 font-bold text-slate-600 bg-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={handleSaveStaff} disabled={loading} className="px-4 py-2 font-bold text-white bg-orange-600 rounded-lg text-sm">Guardar Personal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
