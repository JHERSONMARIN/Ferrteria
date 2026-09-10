import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';

export default function PersonalPage({ currentUser }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [role, setRole] = useState('VENDEDOR');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [modules, setModules] = useState(['pos']);
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState({});

  const clearError = (field) => setErrors(prev => ({ ...prev, [field]: '' }));

  const moduleOptions = [
    { value: 'pos', label: 'Punto de Venta', icon: 'fa-cash-register' },
    { value: 'caja', label: 'Arqueo de Caja', icon: 'fa-vault' },
    { value: 'inventory', label: 'Almacén (Productos)', icon: 'fa-box' },
    { value: 'categories', label: 'Categorías', icon: 'fa-tags' },
    { value: 'kardex', label: 'Kardex / Movimientos', icon: 'fa-receipt' },
    { value: 'compras', label: 'Compras', icon: 'fa-cart-flatbed' },
    { value: 'deliveries', label: 'Entregas', icon: 'fa-truck-fast' },
    { value: 'client-dir', label: 'Dir. Clientes', icon: 'fa-users' },
    { value: 'customers', label: 'Créditos / Fiados', icon: 'fa-book-journal-whills' },
    { value: 'personal', label: 'Módulo Personal', icon: 'fa-id-badge' },
    { value: 'dashboard', label: 'Finanzas / Reportes', icon: 'fa-chart-pie' },
  ];

  const roleBadgeStyles = {
    ADMINISTRADOR: 'bg-purple-100 text-purple-700 border-purple-200',
    VENDEDOR: 'bg-orange-100 text-orange-700 border-orange-200',
    CAJERO: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    REPARTIDOR: 'bg-blue-100 text-blue-700 border-blue-200',
  };

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

  const handleOpenCreate = () => {
    setEditingId(null);
    setName('');
    setUser('');
    setPass('');
    setRole('VENDEDOR');
    setModules(['pos']);
    setActive(true);
    setErrors({});
    setShowModal(true);
  };

  const handleOpenEdit = (s) => {
    setEditingId(s.id);
    setName(s.name || '');
    setUser(s.user || '');
    setPass(''); // Vacío para conservar contraseña actual
    setRole(s.role || 'VENDEDOR');
    setModules(Array.isArray(s.modules) ? s.modules : []);
    setActive(s.active !== undefined ? s.active : true);
    setErrors({});
    setShowModal(true);
  };

  const handleToggleModule = (val) => {
    setModules(prev =>
      prev.includes(val) ? prev.filter(m => m !== val) : [...prev, val]
    );
    clearError('modules');
  };

  const handleSelectAllModules = () => {
    setModules(moduleOptions.map(m => m.value));
    clearError('modules');
  };

  const handleClearAllModules = () => {
    setModules([]);
  };

  const handleRoleChangeWithPreset = (newRole) => {
    setRole(newRole);
    if (newRole === 'VENDEDOR') {
      setModules(['pos']);
    } else if (newRole === 'CAJERO') {
      setModules(['pos', 'caja', 'customers']);
    } else if (newRole === 'REPARTIDOR') {
      setModules(['deliveries']);
    } else if (newRole === 'ADMINISTRADOR') {
      setModules(moduleOptions.map(m => m.value));
    }
    clearError('modules');
  };

  const validateStaff = () => {
    const e = {};
    if (!name.trim()) e.name = 'El nombre es obligatorio.';
    else if (name.trim().length < 3) e.name = 'Debe tener al menos 3 caracteres.';

    if (!user.trim()) e.user = 'El usuario es obligatorio.';
    else if (!/^[a-zA-Z0-9._-]{3,20}$/.test(user.trim()))
      e.user = 'Entre 3 y 20 caracteres: letras, números, punto, guion o guion bajo.';

    if (!editingId) {
      if (!pass.trim()) e.pass = 'La contraseña es obligatoria.';
      else if (pass.length < 4) e.pass = 'La contraseña debe tener al menos 4 caracteres.';
    } else {
      if (pass.trim() && pass.length < 4) {
        e.pass = 'La nueva contraseña debe tener al menos 4 caracteres.';
      }
    }

    if (modules.length === 0) e.modules = 'Seleccione al menos un módulo de acceso.';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSaveStaff = async () => {
    if (!validateStaff()) return;

    try {
      setLoading(true);
      if (editingId) {
        const payload = {
          name: name.trim(),
          user: user.trim(),
          role,
          modules,
          active,
        };
        if (pass.trim()) {
          payload.pass = pass.trim();
        }

        await api.put(`/personal/${editingId}`, payload);
        alert('Personal modificado exitosamente.');
      } else {
        await api.post('/personal', {
          name: name.trim(),
          user: user.trim(),
          pass: pass.trim(),
          role,
          modules,
          active: true,
        });
        alert('Personal registrado exitosamente.');
      }

      setShowModal(false);
      setEditingId(null);
      await loadStaff();
    } catch (err) {
      alert('Error al guardar personal: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStaff = async (id, userName) => {
    if (id === 1) {
      alert('El Administrador principal no puede ser eliminado.');
      return;
    }
    if (currentUser && currentUser.id === id) {
      alert('No puedes eliminar tu propia cuenta en sesión.');
      return;
    }

    if (window.confirm(`¿Estás seguro de eliminar al usuario "${userName}"? Esta acción no se puede deshacer.`)) {
      try {
        setLoading(true);
        await api.delete(`/personal/${id}`);
        await loadStaff();
        alert('Usuario eliminado correctamente.');
      } catch (err) {
        alert(err.message || 'Error eliminando personal.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto bg-slate-50">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-full">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 justify-between items-center bg-slate-50/80">
          <div>
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <i className="fa-solid fa-id-badge text-orange-500"></i> Módulo de Personal y Permisos
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Administra colaboradores, roles asignados, contraseñas y módulos a los que tienen acceso.
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-md transition-colors flex items-center gap-2"
          >
            <i className="fa-solid fa-user-plus"></i>
            <span>Nuevo Personal</span>
          </button>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 text-slate-500 text-xs uppercase shadow-xs">
              <tr>
                <th className="px-4 py-3">Empleado</th>
                <th className="px-4 py-3">Rol / Cargo</th>
                <th className="px-4 py-3">Módulos Asignados</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100">
              {staff.map(s => {
                const badgeColor = roleBadgeStyles[s.role] || 'bg-gray-100 text-slate-700 border-gray-200';
                const userModules = Array.isArray(s.modules) ? s.modules : [];

                return (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">{s.name}</div>
                      <div className="text-xs text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                        <i className="fa-solid fa-at text-[10px]"></i>
                        {s.user}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold border ${badgeColor}`}>
                        {s.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {userModules.slice(0, 4).map(modId => {
                          const mOpt = moduleOptions.find(m => m.value === modId);
                          return (
                            <span
                              key={modId}
                              className="text-[11px] bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-medium inline-flex items-center gap-1"
                            >
                              <i className={`fa-solid ${mOpt?.icon || 'fa-circle'} text-[9px] text-slate-500`}></i>
                              {mOpt?.label || modId}
                            </span>
                          );
                        })}
                        {userModules.length > 4 && (
                          <span
                            className="text-[11px] bg-orange-50 border border-orange-200 text-orange-700 px-2 py-0.5 rounded-md font-bold cursor-help"
                            title={userModules.map(m => moduleOptions.find(o => o.value === m)?.label || m).join(', ')}
                          >
                            +{userModules.length - 4} más
                          </span>
                        )}
                        {userModules.length === 0 && (
                          <span className="text-xs text-red-500 italic">Sin accesos</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.active ? (
                        <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-0.5 rounded-full text-xs font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-700 px-2.5 py-0.5 rounded-full text-xs font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(s)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                          title="Modificar datos, roles o accesos"
                        >
                          <i className="fa-solid fa-user-pen text-sm"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteStaff(s.id, s.name)}
                          disabled={s.id === 1}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            s.id === 1
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                          }`}
                          title={s.id === 1 ? 'Usuario protegido' : 'Eliminar usuario'}
                        >
                          <i className="fa-solid fa-trash text-sm"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear / Modificar Personal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-all overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 text-white flex justify-between items-center border-b border-orange-500/80">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <i className={`fa-solid ${editingId ? 'fa-user-pen' : 'fa-user-plus'} text-orange-500`}></i>
                  {editingId ? 'Modificar Personal' : 'Registrar Nuevo Personal'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {editingId ? `Editando cuenta de @${user}` : 'Crea un nuevo usuario con credenciales y accesos.'}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
              {/* Nombres y Apellidos */}
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">
                  Nombres y Apellidos <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={name}
                  onChange={e => { setName(e.target.value); clearError('name'); }}
                  placeholder="Ej: Juan Pérez Morales"
                  className={`w-full border p-2 rounded-lg outline-none text-sm font-medium ${borderClass(errors.name)}`}
                />
                <FieldError msg={errors.name} />
              </div>

              {/* Usuario y Contraseña */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">
                    Usuario (Login) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={user}
                    onChange={e => { setUser(e.target.value); clearError('user'); }}
                    placeholder="Ej: jperez"
                    className={`w-full border p-2 rounded-lg outline-none text-sm font-medium ${borderClass(errors.user)}`}
                  />
                  <FieldError msg={errors.user} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 flex items-center justify-between">
                    <span>Contraseña {editingId ? '' : <span className="text-red-500">*</span>}</span>
                    {editingId && (
                      <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={pass}
                    onChange={e => { setPass(e.target.value); clearError('pass'); }}
                    placeholder={editingId ? 'Sin cambios (dejar vacío)' : 'Mínimo 4 caracteres'}
                    className={`w-full border p-2 rounded-lg outline-none text-sm font-medium ${borderClass(errors.pass)}`}
                  />
                  <FieldError msg={errors.pass} />
                </div>
              </div>

              {/* Rol Asignado */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600">
                    Rol / Cargo en el Sistema
                  </label>
                  <span className="text-[10px] text-slate-400 italic">
                    Sugerirá módulos automáticamente
                  </span>
                </div>
                <select
                  value={role}
                  onChange={e => handleRoleChangeWithPreset(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-orange-500 bg-white text-sm font-medium cursor-pointer"
                >
                  <option value="VENDEDOR">Vendedor (Mostrador / Ventas)</option>
                  <option value="CAJERO">Cajero (Cobro y Arqueos)</option>
                  <option value="REPARTIDOR">Repartidor (Despacho / Fletes)</option>
                  <option value="ADMINISTRADOR">Administrador (Control Total)</option>
                </select>
              </div>

              {/* Módulos de Acceso */}
              <div className={`p-3.5 rounded-xl border ${errors.modules ? 'border-red-400 bg-red-50/20' : 'border-slate-200 bg-slate-50/70'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <i className="fa-solid fa-shield-halved text-orange-500 text-xs"></i>
                    Módulos Permitidos ({modules.length}/{moduleOptions.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllModules}
                      className="text-[11px] font-bold text-orange-600 hover:text-orange-700 underline"
                    >
                      Todos
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleClearAllModules}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-700 underline"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  {moduleOptions.map(opt => {
                    const isChecked = modules.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-white border-orange-400 text-slate-800 shadow-xs'
                            : 'bg-white/60 border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleModule(opt.value)}
                          className="accent-orange-600 rounded"
                        />
                        <i className={`fa-solid ${opt.icon} text-xs ${isChecked ? 'text-orange-500' : 'text-slate-400'}`}></i>
                        <span className="truncate">{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
                <FieldError msg={errors.modules} />
              </div>

              {/* Estado de la cuenta (Activo / Inactivo) */}
              {editingId && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">
                      Estado de la Cuenta
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {active
                        ? 'El usuario puede iniciar sesión y operar.'
                        : 'Acceso suspendido: cerrará su sesión de inmediato.'}
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      disabled={editingId === 1}
                      onChange={e => setActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveStaff}
                disabled={loading}
                className="px-5 py-2 font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg text-sm shadow-md transition-colors flex items-center gap-2"
              >
                {loading && <i className="fa-solid fa-spinner fa-spin text-xs"></i>}
                <span>{editingId ? 'Guardar Cambios' : 'Crear Personal'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
