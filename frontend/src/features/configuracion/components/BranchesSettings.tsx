import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Branch, CreateBranchRequest, UpdateBranchRequest } from '@ferresys/contracts/branches';
import { api } from '../../../api/client.ts';
import { queryKeys } from '../../../api/queryClient.ts';

type Message = { type: 'success' | 'error'; text: string };

// Sucursales o almacenes. Se guardan al momento. Una sucursal no se borra: se desactiva cuando no
// tiene usuarios, stock ni pedidos abiertos (el servidor lo valida y explica qué falta).
export default function BranchesSettings({ onChanged }: { onChanged?: () => void }) {
  const queryClient = useQueryClient();
  // Con ?todas=1 el administrador ve también las desactivadas.
  const branchesQuery = useQuery({
    queryKey: [...queryKeys.branches, 'todas'],
    queryFn: () => api.get<Branch[]>('/sucursales?todas=1'),
  });
  const branches = branchesQuery.data ?? [];
  const [form, setForm] = useState({ name: '', address: '' });
  const [editing, setEditing] = useState<{ id: number; name: string; address: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Message | null>(null);
  const message: Message | null = result
    ?? (branchesQuery.error ? { type: 'error', text: branchesQuery.error.message || 'No se pudieron cargar las sucursales.' } : null);

  // Cualquier cambio refresca todas las listas de sucursales del sistema.
  const run = async (action: () => Promise<unknown>, successText: string) => {
    try {
      setBusy(true);
      setResult(null);
      await action();
      await queryClient.invalidateQueries({ queryKey: queryKeys.branches });
      if (onChanged) onChanged();
      setResult({ type: 'success', text: successText });
      return true;
    } catch (err) {
      setResult({ type: 'error', text: (err as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    if (await run(() => api.post('/sucursales', { name, address: form.address } satisfies CreateBranchRequest), `${name} creada.`)) {
      setForm({ name: '', address: '' });
    }
  };

  const save = async () => {
    if (!editing) return;
    if (await run(() => api.put(`/sucursales/${editing.id}`, { name: editing.name, address: editing.address } satisfies UpdateBranchRequest), 'Sucursal actualizada.')) {
      setEditing(null);
    }
  };

  const toggle = (b: Branch) => run(
    () => api.put(`/sucursales/${b.id}`, { active: !b.active } satisfies UpdateBranchRequest),
    b.active ? `${b.name} desactivada.` : `${b.name} activada.`
  );

  const inputClass = 'border border-line px-2.5 py-1.5 rounded-lg text-sm focus:outline-none focus:border-brand min-w-0';

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line border border-line rounded-lg">
        {branches.map(b => (
          <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            {editing?.id === b.id ? (
              <>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} maxLength={60}
                  aria-label="Nombre de la sucursal" className={`${inputClass} flex-1`} autoFocus />
                <input value={editing.address} onChange={e => setEditing({ ...editing, address: e.target.value })} maxLength={200}
                  aria-label="Dirección" placeholder="Dirección" className={`${inputClass} flex-[2]`} />
                <button type="button" onClick={save} disabled={busy} className="text-xs font-bold text-brand-contrast bg-brand hover:bg-brand-strong rounded-md px-2.5 py-1.5 disabled:opacity-50">Guardar</button>
                <button type="button" onClick={() => setEditing(null)} className="text-xs font-semibold text-muted px-2 py-1.5">Cancelar</button>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${b.active ? 'text-ink' : 'text-muted line-through'}`}>
                    <i className="fa-solid fa-store mr-2 text-muted"></i>{b.name}
                  </p>
                  <p className="text-[11px] text-muted truncate">
                    {b.address || 'Sin dirección'} · {b.userCount} usuario(s) · {b.cashRegisterCount} caja(s)
                  </p>
                </div>
                {!b.active && <span className="text-[11px] font-bold bg-surface-muted text-muted px-2 py-0.5 rounded-full">Inactiva</span>}
                <button type="button" onClick={() => setEditing({ id: b.id, name: b.name, address: b.address || '' })}
                  className="text-xs font-semibold text-ink-soft hover:text-brand-text px-2 py-1">
                  <i className="fa-solid fa-pen mr-1"></i> Editar
                </button>
                <button type="button" onClick={() => toggle(b)} disabled={busy} className="text-xs font-semibold text-ink-soft hover:text-brand-text px-2 py-1 disabled:opacity-40">
                  {b.active ? 'Desactivar' : 'Activar'}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="flex flex-col sm:flex-row gap-2">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={60}
          placeholder="Nombre (ej. Sucursal Norte, Almacén Central)" className={`${inputClass} flex-1 py-2`} />
        <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} maxLength={200}
          placeholder="Dirección (opcional)" className={`${inputClass} flex-1 py-2`} />
        <button type="submit" disabled={busy || !form.name.trim()} className="px-3 py-2 text-sm font-bold text-white bg-panel hover:bg-panel-strong rounded-lg disabled:opacity-50 shrink-0">
          <i className="fa-solid fa-plus mr-1"></i> Agregar sucursal
        </button>
      </form>

      {message && <p className={`text-xs ${message.type === 'error' ? 'text-danger' : 'text-success'}`}>{message.text}</p>}
    </div>
  );
}
