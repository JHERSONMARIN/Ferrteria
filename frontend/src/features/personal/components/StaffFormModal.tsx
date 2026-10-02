// Alta o edición de una persona: datos de acceso, cargo, sucursal y los módulos que puede usar.
import { useState } from 'react';
import type { Branch } from '@ferresys/contracts/branches';
import type { Role, SessionUser, StaffMember, CreateStaffRequest, UpdateStaffRequest } from '@ferresys/contracts/identity';
import { api } from '../../../api/client.ts';
import FieldError from '../../../shared/ui/FieldError.tsx';
import { useToast } from '../../../shared/ui/index.ts';
import { borderClass } from '../../../shared/utils/validators.ts';
import { MODULE_OPTIONS as moduleOptions } from '../../../shared/constants/modules.ts';
import { effectiveDispatchRole } from '../../../shared/constants/dispatch.ts';
import { rolesForModules, presetModules, describeDuties } from '../../../shared/constants/roles.ts';

type Field = 'name' | 'user' | 'pass' | 'modules';

interface Props {
  /** La persona a editar; null = una nueva. */
  editing: StaffMember | null;
  currentUser: SessionUser;
  branches: readonly Branch[];
  /** Módulos que la empresa puede usar: contratados en su plan y activos en su configuración. */
  availableModules: readonly string[];
  /** La empresa tiene envíos a domicilio (módulo Entregas). */
  companyDeliveries: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function StaffFormModal({ editing, currentUser, branches, availableModules, companyDeliveries, onClose, onSaved }: Props) {
  const aviso = useToast();
  const editingId = editing?.id ?? null;
  const ownBranch = () => branches.find(b => b.id === currentUser.branchId) ?? null;
  const [name, setName] = useState(editing?.name || '');
  const [role, setRole] = useState<Role>(editing?.role || 'VENDEDOR');
  const [user, setUser] = useState(editing?.user || '');
  // Vacío al editar: se conserva la contraseña actual.
  const [pass, setPass] = useState('');
  const [modules, setModules] = useState<string[]>(() => (editing ? editing.modules : presetModules('VENDEDOR', ownBranch(), availableModules)));
  const [active, setActive] = useState(editing ? editing.active : true);
  const [branchId, setBranchId] = useState(editing?.branchId ? String(editing.branchId) : '');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);

  // Con una sola sucursal no se muestra nada de sucursales.
  const multiBranch = branches.length > 1;
  // Sucursal del formulario: la elegida o, al crear sin elegir, la del administrador.
  const formBranch = branches.find(b => b.id === Number(branchId)) ?? ownBranch();
  // En la sucursal despacha quien se eligió en Configuración (vendedor, cajero o almacén): el módulo
  // Despacho solo hace falta cuando despacha almacén.
  const dispatchRole = formBranch ? effectiveDispatchRole(formBranch) : 'WAREHOUSE';
  const dispatchUnused = formBranch && dispatchRole !== 'WAREHOUSE';
  const isAvailable = (moduleId: string) => availableModules.includes(moduleId);
  // Cargos que tienen sentido con esos módulos (sin envíos no se ofrece Repartidor, por ejemplo).
  // Con flujo directo (plan básico) el vendedor cobra: no hay cajeros. Se sigue mostrando si se edita
  // a alguien que ya es cajero, para no cambiarle el cargo sin querer.
  const allDirect = branches.length > 0 && branches.every(b => b.saleFlowMode === 'DIRECT');
  const roleOptions = rolesForModules(availableModules)
    .filter(r => r.value !== 'CAJERO' || !allDirect || (editingId && role === 'CAJERO'));

  const clearError = (field: Field) => setErrors(prev => ({ ...prev, [field]: '' }));

  const handleToggleModule = (val: string) => {
    setModules(prev => (prev.includes(val) ? prev.filter(m => m !== val) : [...prev, val]));
    clearError('modules');
  };

  const handleSelectAllModules = () => {
    setModules([...availableModules]);
    clearError('modules');
  };

  const handleClearAllModules = () => setModules([]);

  // El rol sugiere los módulos según el modo de la sucursal; después se pueden ajustar a mano.
  const handleRoleChangeWithPreset = (newRole: Role) => {
    setRole(newRole);
    setModules(presetModules(newRole, formBranch, availableModules));
    clearError('modules');
  };

  // Al crear, cambiar de sucursal vuelve a sugerir los módulos del rol para el modo de esa sucursal.
  const handleBranchChange = (value: string) => {
    setBranchId(value);
    if (!editingId) {
      const branch = branches.find(b => b.id === Number(value)) ?? ownBranch();
      setModules(presetModules(role, branch, availableModules));
    }
  };

  const validateStaff = () => {
    const e: Partial<Record<Field, string>> = {};
    if (!name.trim()) e.name = 'El nombre es obligatorio.';
    else if (name.trim().length < 3) e.name = 'Debe tener al menos 3 caracteres.';

    if (!user.trim()) e.user = 'El usuario es obligatorio.';
    else if (!/^[a-zA-Z0-9._-]{3,20}$/.test(user.trim()))
      e.user = 'Entre 3 y 20 caracteres: letras, números, punto, guion o guion bajo.';

    if (!editingId) {
      if (!pass.trim()) e.pass = 'La contraseña es obligatoria.';
      else if (pass.trim().length < 8) e.pass = 'La contraseña debe tener al menos 8 caracteres.';
    } else if (pass.trim() && pass.trim().length < 8) {
      e.pass = 'La nueva contraseña debe tener al menos 8 caracteres.';
    }

    if (modules.length === 0) e.modules = 'Seleccione al menos un módulo de acceso.';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSaveStaff = async () => {
    if (!validateStaff()) return;

    const payload = {
      name: name.trim(),
      user: user.trim(),
      role,
      modules,
      active: editingId ? active : true,
      ...(multiBranch && branchId ? { branchId: Number(branchId) } : {}),
      ...(pass.trim() ? { pass: pass.trim() } : {}),
    };
    try {
      setSaving(true);
      if (editingId) await api.put(`/personal/${editingId}`, payload satisfies UpdateStaffRequest);
      else await api.post('/personal', payload satisfies CreateStaffRequest);
      onSaved(editingId ? 'Personal modificado exitosamente.' : 'Personal registrado exitosamente.');
    } catch (err) {
      aviso.error(`Error al guardar personal: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-all overflow-y-auto">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-auto border border-line">
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
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-white hover:bg-panel-strong transition-colors"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Modal Body: datos de la cuenta a la izquierda y módulos permitidos a la derecha */}
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[80vh] overflow-y-auto">
          <div className="flex flex-col gap-4">
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
              onChange={e => handleRoleChangeWithPreset(e.target.value as Role)}
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

          {/* Módulos de Acceso */}
          <div className={`p-3.5 rounded-xl border self-start ${errors.modules ? 'border-danger bg-danger-soft/20' : 'border-line bg-surface-muted/70'}`}>
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

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-surface-muted border-t border-line flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 font-bold text-ink-soft bg-surface border border-line hover:bg-surface-muted rounded-lg text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveStaff}
            disabled={saving}
            className="px-5 py-2 font-bold text-brand-contrast bg-brand hover:bg-brand-strong rounded-lg text-sm shadow-md transition-colors flex items-center gap-2"
          >
            {saving && <i className="fa-solid fa-spinner fa-spin text-xs"></i>}
            <span>{editingId ? 'Guardar Cambios' : 'Crear Personal'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
