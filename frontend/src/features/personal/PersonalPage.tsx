// Personal: quién entra al sistema, con qué cargo, en qué sucursal y a qué pantallas.
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionUser, StaffMember } from '@ferresys/contracts/identity';
import { api } from '../../api/client.ts';
import { queryKeys } from '../../api/queryClient.ts';
import { useBranches, useSettings, useStaff } from '../../api/queries.ts';
import { MODULE_OPTIONS as moduleOptions } from '../../shared/constants/modules.ts';
import { ROLE_OPTIONS, roleLabel } from '../../shared/constants/roles.ts';
import { useToast, useConfirm, Pagination, usePagination } from '../../shared/ui/index.ts';
import StaffFormModal from './components/StaffFormModal.tsx';

// El administrador principal (id 1) no se puede eliminar.
const MAIN_ADMIN_ID = 1;

export default function PersonalPage({ currentUser }: { currentUser: SessionUser }) {
  const aviso = useToast();
  const confirmar = useConfirm();
  const queryClient = useQueryClient();
  const staffQuery = useStaff();
  const staff = staffQuery.data ?? [];
  const branches = useBranches().data ?? [];
  // Con una sola sucursal no se muestra nada de sucursales.
  const multiBranch = branches.length > 1;
  const settingsData = useSettings().data;
  // Módulos que la empresa puede usar: contratados en su plan y activos en su configuración.
  const enabled = settingsData?.settings.enabledModules ?? moduleOptions.map(m => m.value);
  const licensed = settingsData?.licensedModules ?? null;
  const availableModules = enabled.filter(m => !licensed || licensed.includes(m));
  // Módulo Entregas de la empresa: sin él no hay envíos a domicilio en ninguna sucursal.
  const companyDeliveries = settingsData ? enabled.includes('deliveries') && (!licensed || licensed.includes('deliveries')) : true;
  // Formulario abierto: la persona a editar (null = nueva).
  const [form, setForm] = useState<{ staff: StaffMember | null } | null>(null);

  useEffect(() => {
    if (staffQuery.error) aviso.error(`Error cargando personal: ${staffQuery.error.message}`);
  }, [staffQuery.error, aviso]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.staff });

  const handleSaved = async (message: string) => {
    aviso.exito(message);
    setForm(null);
    await refresh();
  };

  const handleDeleteStaff = async (id: number, userName: string) => {
    if (id === MAIN_ADMIN_ID) {
      aviso.error('El Administrador principal no puede ser eliminado.');
      return;
    }
    if (currentUser.id === id) {
      aviso.error('No puedes eliminar tu propia cuenta en sesión.');
      return;
    }

    const seguro = await confirmar({
      title: 'Eliminar usuario',
      description: `Se eliminará a "${userName}". Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      tone: 'danger',
    });
    if (!seguro) return;
    try {
      await api.delete(`/personal/${id}`);
      await refresh();
      aviso.exito('Usuario eliminado correctamente.');
    } catch (err) {
      aviso.error((err as Error).message || 'Error eliminando personal.');
    }
  };

  // Máximo 10 por página; en pantallas chicas se ve la página completa sin scroll interno.
  const pg = usePagination(staff);

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
          <button onClick={() => setForm({ staff: null })} className="bg-brand hover:bg-brand-strong text-brand-contrast px-4 py-2 rounded-xl text-sm font-semibold shadow-card transition-colors flex items-center gap-2">
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
              {pg.pageItems.map(s => {
                const badgeColor = ROLE_OPTIONS.find(r => r.value === s.role)?.badge || 'bg-surface-muted text-ink-soft border-line';
                const userModules = s.modules;

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
                          onClick={() => setForm({ staff: s })}
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
        <Pagination {...pg} />
      </div>

      {form && (
        <StaffFormModal
          editing={form.staff}
          currentUser={currentUser}
          branches={branches}
          availableModules={availableModules}
          companyDeliveries={companyDeliveries}
          onClose={() => setForm(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
