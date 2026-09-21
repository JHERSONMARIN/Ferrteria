import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';
import { MODULE_OPTIONS as moduleOptions } from '../constants/modules.js';
import { effectiveDispatchRole } from '../constants/dispatch.js';
import { ROLE_OPTIONS, rolesForModules, roleLabel, presetModules, describeDuties } from '../constants/roles.js';
import { useToast, useConfirm } from '../components/ui/index.js';

export default function PersonalPage({ currentUser }) {
  const aviso = useToast();
  const confirmar = useConfirm();
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
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  // Con una sola sucursal no se muestra nada de sucursales.
  const multiBranch = branches.length > 1;
  // Sucursal del formulario: la elegida o, al crear sin elegir, la del administrador.
  const formBranch = branches.find(b => b.id === Number(branchId)) || branches.find(b => b.id === currentUser?.branchId) || null;
  // En la sucursal despacha quien se eligió en Configuración (vendedor, cajero o almacén): el módulo
  // Despacho solo hace falta cuando despacha almacén.
  const dispatchRole = formBranch ? effectiveDispatchRole(formBranch) : 'WAREHOUSE';
  const dispatchUnused = formBranch && dispatchRole !== 'WAREHOUSE';
  // Módulo Entregas de la empresa: sin él no hay envíos a domicilio en ninguna sucursal.
  const [companyDeliveries, setCompanyDeliveries] = useState(true);
  // Módulos que la empresa puede usar: contratados en su plan y activos en su configuración.
  const [availableModules, setAvailableModules] = useState(moduleOptions.map(m => m.value));
  const isAvailable = (moduleId) => availableModules.includes(moduleId);
  // Cargos que tienen sentido con esos módulos (sin envíos no se ofrece Repartidor, por ejemplo).
  const roleOptions = rolesForModules(availableModules);
  const ownBranch = () => branches.find(b => b.id === currentUser?.branchId) || null;
  const [errors, setErrors] = useState({});

  const clearError = (field) => setErrors(prev => ({ ...prev, [field]: '' }));


  useEffect(() => {
    loadStaff();
    api.get('/sucursales').then(setBranches).catch(() => setBranches([]));
    api.get('/settings').then(res => {
      const enabled = res.settings.enabledModules || [];
      const licensed = res.licensedModules || null;
      setAvailableModules(enabled.filter(m => !licensed || licensed.includes(m)));
      setCompanyDeliveries(enabled.includes('deliveries') && (!licensed || licensed.includes('deliveries')));
    }).catch(() => {});
  }, []);

  const loadStaff = async () => {
    try {
      setLoading(true);
      const data = await api.get('/personal');
      setStaff(data);
    } catch (err) {
      aviso.error('Error cargando personal: ' + err.message);
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
    setModules(presetModules('VENDEDOR', ownBranch(), availableModules));
    setActive(true);
    setBranchId('');
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
    setBranchId(s.branchId ? String(s.branchId) : '');
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
    setModules([...availableModules]);
    clearError('modules');
  };

  const handleClearAllModules = () => {
    setModules([]);
  };

  // El rol sugiere los módulos según el modo de la sucursal; después se pueden ajustar a mano.
  const handleRoleChangeWithPreset = (newRole) => {
    setRole(newRole);
    setModules(presetModules(newRole, formBranch, availableModules));
    clearError('modules');
  };

  // Al crear, cambiar de sucursal vuelve a sugerir los módulos del rol para el modo de esa sucursal.
  const handleBranchChange = (value) => {
    setBranchId(value);
    if (!editingId) {
      const branch = branches.find(b => b.id === Number(value)) || ownBranch();
      setModules(presetModules(role, branch, availableModules));
    }
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
      else if (pass.trim().length < 8) e.pass = 'La contraseña debe tener al menos 8 caracteres.';
    } else {
      if (pass.trim() && pass.trim().length < 8) {
        e.pass = 'La nueva contraseña debe tener al menos 8 caracteres.';
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
        if (multiBranch && branchId) payload.branchId = Number(branchId);
        if (pass.trim()) {
          payload.pass = pass.trim();
        }

        await api.put(`/personal/${editingId}`, payload);
        aviso.exito('Personal modificado exitosamente.');
      } else {
        await api.post('/personal', {
          name: name.trim(),
          user: user.trim(),
          pass: pass.trim(),
          role,
          modules,
          active: true,
          ...(multiBranch && branchId ? { branchId: Number(branchId) } : {}),
        });
        aviso.exito('Personal registrado exitosamente.');
      }

      setShowModal(false);
      setEditingId(null);
      await loadStaff();
    } catch (err) {
      aviso.error('Error al guardar personal: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStaff = async (id, userName) => {
    if (id === 1) {
      aviso.error('El Administrador principal no puede ser eliminado.');
      return;
    }
    if (currentUser && currentUser.id === id) {
      aviso.error('No puedes eliminar tu propia cuenta en sesión.');
      return;
    }

    const seguro = await confirmar({
      title: 'Eliminar usuario',
      description: `Se eliminará a "${userName}". Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      tone: 'danger',
    });
    if (seguro) {
      try {
        setLoading(true);
        await api.delete(`/personal/${id}`);
        await loadStaff();
        aviso.exito('Usuario eliminado correctamente.');
      } catch (err) {
        aviso.error(err.message || 'Error eliminando personal.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto bg-surface-muted">
      <div className="bg-surface rounded-xl shadow-sm border border-line flex-1 flex flex-col min-h-full">
        {/* Header */}
        <div className="p-4 border-b border-line flex flex-wrap gap-3 justify-between items-center bg-surface-muted/80">
          <div>
            <p className="text-xs text-muted">
              Quién entra al sistema, con qué rol y a qué pantallas tiene acceso.
            </p>
          </div>
          <button onClick={handleOpenCreate} className="bg-brand hover:bg-brand-strong text-brand-contrast px-4 py-2 rounded-xl text-sm font-semibold shadow-card transition-colors flex items-center gap-2">
            <i className="fa-solid fa-user-plus"></i> Nuevo usuario
          </button>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-muted text-muted text-xs uppercase shadow-xs">
              <tr>
                <th className="px-4 py-3">Empleado</th>
                <th className="px-4 py-3">Rol / Cargo</th>
                <th className="px-4 py-3">Módulos Asignados</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-line">
              {staff.map(s => {
                const badgeColor = ROLE_OPTIONS.find(r => r.value === s.role)?.badge || 'bg-surface-muted text-ink-soft border-line';
                const userModules = Array.isArray(s.modules) ? s.modules : [];

                return (
                  <tr key={s.id} className="hover:bg-surface-muted/80 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-ink">{s.name}</div>
                      <div className="text-xs text-muted font-mono flex items-center gap-1 mt-0.5">
                        <i className="fa-solid fa-at text-[10px]"></i>
                        {s.user}
                      </div>
                      {multiBranch && s.branch && (
                        <div className="text-[11px] text-muted mt-0.5">
                          <i className="fa-solid fa-store text-[10px] mr-1"></i>{s.branch.name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold border ${badgeColor}`}>
                        {roleLabel(s.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {userModules.slice(0, 4).map(modId => {
                          const mOpt = moduleOptions.find(m => m.value === modId);
                          return (
                            <span
                              key={modId}
                              className="text-[11px] bg-surface-muted border border-line text-ink-soft px-2 py-0.5 rounded-md font-medium inline-flex items-center gap-1"
                            >
                              <i className={`fa-solid ${mOpt?.icon || 'fa-circle'} text-[9px] text-muted`}></i>
                              {mOpt?.label || modId}
                            </span>
                          );
                        })}
                        {userModules.length > 4 && (
                          <span
                            className="text-[11px] bg-brand-soft border border-brand/30 text-brand-text px-2 py-0.5 rounded-md font-bold cursor-help"
                            title={userModules.map(m => moduleOptions.find(o => o.value === m)?.label || m).join(', ')}
                          >
                            +{userModules.length - 4} más
                          </span>
                        )}
                        {userModules.length === 0 && (
                          <span className="text-xs text-danger italic">Sin accesos</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.active ? (
                        <span className="inline-flex items-center gap-1.5 bg-success-soft border border-success/30 text-success px-2.5 py-0.5 rounded-full text-xs font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-success-soft0 animate-pulse"></span>
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
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-brand hover:bg-brand-soft transition-colors"
                          title="Modificar datos, roles o accesos"
                        >
                          <i className="fa-solid fa-user-pen text-sm"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteStaff(s.id, s.name)}
                          disabled={s.id === 1}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            s.id === 1
                              ? 'text-muted cursor-not-allowed'
                              : 'text-muted hover:text-danger hover:bg-danger-soft'
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
        <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-all overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto border border-line">
            {/* Modal Header */}
            <div className="p-4 bg-panel-strong text-white flex justify-between items-center border-b border-brand/80">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <i className={`fa-solid ${editingId ? 'fa-user-pen' : 'fa-user-plus'} text-brand`}></i>
                  {editingId ? 'Modificar Personal' : 'Registrar Nuevo Personal'}
                </h3>
                <p className="text-[11px] text-muted">
                  {editingId ? `Editando cuenta de @${user}` : 'Crea un nuevo usuario con credenciales y accesos.'}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-white hover:bg-panel-strong transition-colors"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
              {/* Nombres y Apellidos */}
              <div>
                <label className="text-xs font-bold text-ink-soft mb-1 block">
                  Nombres y Apellidos <span className="text-danger">*</span>
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
                  <label className="text-xs font-bold text-ink-soft mb-1 block">
                    Usuario (Login) <span className="text-danger">*</span>
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
                  <label className="text-xs font-bold text-ink-soft mb-1 flex items-center justify-between">
                    <span>Contraseña {editingId ? '' : <span className="text-danger">*</span>}</span>
                    {editingId && (
                      <span className="text-[10px] text-muted font-normal">Opcional</span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={pass}
                    onChange={e => { setPass(e.target.value); clearError('pass'); }}
                    placeholder={editingId ? 'Sin cambios (dejar vacío)' : 'Mínimo 8 caracteres'}
                    className={`w-full border p-2 rounded-lg outline-none text-sm font-medium ${borderClass(errors.pass)}`}
                  />
                  <FieldError msg={errors.pass} />
                </div>
              </div>

              {/* Rol Asignado */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-ink-soft">
                    Rol / Cargo en el Sistema
                  </label>
                  <span className="text-[10px] text-muted italic">
                    Sugerirá módulos automáticamente
                  </span>
                </div>
                <select
                  value={role}
                  onChange={e => handleRoleChangeWithPreset(e.target.value)}
                  className="w-full border border-line p-2 rounded-lg outline-none focus:border-brand bg-surface text-sm font-medium cursor-pointer"
                >
                  {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label} ({r.hint})</option>)}
                </select>
              </div>

              {multiBranch && (
                <div>
                  <label className="text-xs font-bold text-ink-soft mb-1 block">Sucursal</label>
                  <select
                    value={branchId}
                    onChange={e => handleBranchChange(e.target.value)}
                    className="w-full border border-line p-2 rounded-lg outline-none focus:border-brand bg-surface text-sm font-medium cursor-pointer"
                  >
                    {!editingId && <option value="">La misma que la mía</option>}
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <p className="text-[11px] text-muted mt-1">Sus ventas, cobros y ajustes de stock se hacen en esta sucursal.</p>
                </div>
              )}

              {/* Módulos de Acceso */}
              <div className={`p-3.5 rounded-xl border ${errors.modules ? 'border-danger bg-danger-soft/20' : 'border-line bg-surface-muted/70'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-ink-soft flex items-center gap-1.5">
                    <i className="fa-solid fa-shield-halved text-brand text-xs"></i>
                    Módulos Permitidos ({modules.length}/{availableModules.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllModules}
                      className="text-[11px] font-bold text-brand hover:text-brand-text underline"
                    >
                      Todos
                    </button>
                    <span className="text-muted">|</span>
                    <button
                      type="button"
                      onClick={handleClearAllModules}
                      className="text-[11px] font-bold text-muted hover:text-ink-soft underline"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  {moduleOptions.filter(opt => isAvailable(opt.value) || modules.includes(opt.value)).map(opt => {
                    const isChecked = modules.includes(opt.value);
                    const disponible = isAvailable(opt.value);
                    return (
                      <label
                        key={opt.value}
                        title={disponible ? undefined : 'No incluido en el plan de la empresa'}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all ${disponible ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${
                          isChecked
                            ? 'bg-surface border-brand text-ink shadow-xs'
                            : 'bg-surface/60 border-line text-muted hover:border-line'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!disponible}
                          onChange={() => handleToggleModule(opt.value)}
                          className="accent-orange-600 rounded"
                        />
                        <i className={`fa-solid ${opt.icon} text-xs ${isChecked ? 'text-brand' : 'text-muted'}`}></i>
                        <span className="truncate">{opt.label}</span>
                        {opt.value === 'despacho' && dispatchUnused && (
                          <span className="ml-auto text-[10px] text-muted whitespace-nowrap">no hace falta</span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <FieldError msg={errors.modules} />
                {(() => {
                  // Qué hará la persona en su sucursal con los módulos marcados.
                  const { duties, warnings } = describeDuties({ role, modules, branch: formBranch, deliveriesEnabled: companyDeliveries });
                  if (duties.length === 0 && warnings.length === 0) return null;
                  return (
                    <div className="mt-3 rounded-lg border border-line bg-surface px-3 py-2">
                      <p className="text-[11px] font-bold text-ink-soft mb-1">
                        <i className="fa-solid fa-list-check mr-1 text-brand"></i>
                        En {multiBranch && formBranch ? formBranch.name : 'la empresa'} esta persona:
                      </p>
                      <ul className="text-[11px] text-ink-soft list-disc pl-4 flex flex-col gap-0.5">
                        {duties.map(d => <li key={d}>{d}</li>)}
                      </ul>
                      {warnings.map(w => (
                        <p key={w} className="mt-1.5 text-[11px] text-warning bg-warning-soft border border-warning/30 rounded px-2 py-1">
                          <i className="fa-solid fa-triangle-exclamation mr-1"></i>{w}
                        </p>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Estado de la cuenta (Activo / Inactivo) */}
              {editingId && (
                <div className="p-3 bg-surface-muted border border-line rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-ink-soft block">
                      Estado de la Cuenta
                    </span>
                    <span className="text-[11px] text-muted">
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
                    <div className="w-11 h-6 bg-line peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:border-line after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-success"></div>
                  </label>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-surface-muted border-t border-line flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 font-bold text-ink-soft bg-surface border border-line hover:bg-surface-muted rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveStaff}
                disabled={loading}
                className="px-5 py-2 font-bold text-brand-contrast bg-brand hover:bg-brand-strong rounded-lg text-sm shadow-md transition-colors flex items-center gap-2"
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
