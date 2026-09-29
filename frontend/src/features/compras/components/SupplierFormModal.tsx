// Alta de un proveedor.
import { useState } from 'react';
import type { Supplier, SupplierRequest } from '@ferresys/contracts/purchasing';
import { api } from '../../../api/client.ts';
import FieldError from '../../../shared/ui/FieldError.tsx';
import { useToast } from '../../../shared/ui/index.ts';
import { borderClass } from '../../../shared/utils/validators.ts';

type Errors = { ruc?: string; name?: string; phone?: string };

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function SupplierFormModal({ onClose, onSaved }: Props) {
  const aviso = useToast();
  const [provRuc, setProvRuc] = useState('');
  const [provName, setProvName] = useState('');
  const [provPhone, setProvPhone] = useState('');
  const [provAddress, setProvAddress] = useState('');
  const [provErrors, setProvErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const clearProvError = (f: keyof Errors) => setProvErrors(p => ({ ...p, [f]: '' }));

  const validateProveedor = () => {
    const e: Errors = {};
    if (!provRuc.trim()) e.ruc = 'El RUC es obligatorio.';
    else if (!/^\d{11}$/.test(provRuc.trim())) e.ruc = 'El RUC debe tener exactamente 11 dígitos.';

    if (!provName.trim()) e.name = 'La razón social / nombre es obligatoria.';
    else if (provName.trim().length < 3) e.name = 'Debe tener al menos 3 caracteres.';

    if (provPhone.trim() && !/^\+?\d[\d\s-]{5,14}$/.test(provPhone.trim()))
      e.phone = 'Teléfono inválido (6 a 15 dígitos).';

    setProvErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSaveProveedor = async () => {
    if (!validateProveedor()) return;
    try {
      setSaving(true);
      await api.post<Supplier>('/proveedores', {
        ruc: provRuc.trim(),
        name: provName.trim(),
        phone: provPhone.trim(),
        address: provAddress.trim(),
      } satisfies SupplierRequest);
      onSaved();
    } catch (err) {
      aviso.error(`Error guardando proveedor: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-4 bg-panel text-white flex justify-between items-center">
          <h3 className="font-bold text-lg"><i className="fa-solid fa-truck-field mr-2"></i> Registrar Proveedor</h3>
          <button onClick={onClose} className="text-muted hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">RUC del Proveedor</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={11}
              value={provRuc}
              onChange={e => { setProvRuc(e.target.value.replace(/\D/g, '')); clearProvError('ruc'); }}
              className={`w-full border p-2 rounded outline-none text-sm ${borderClass(provErrors.ruc)}`}
            />
            <FieldError msg={provErrors.ruc} />
          </div>
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Razón Social / Nombre</label>
            <input
              type="text"
              maxLength={120}
              value={provName}
              onChange={e => { setProvName(e.target.value); clearProvError('name'); }}
              className={`w-full border p-2 rounded outline-none text-sm ${borderClass(provErrors.name)}`}
            />
            <FieldError msg={provErrors.name} />
          </div>
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Teléfono</label>
            <input
              type="text"
              inputMode="tel"
              maxLength={15}
              value={provPhone}
              onChange={e => { setProvPhone(e.target.value); clearProvError('phone'); }}
              className={`w-full border p-2 rounded outline-none text-sm ${borderClass(provErrors.phone)}`}
            />
            <FieldError msg={provErrors.phone} />
          </div>
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Dirección</label>
            <input
              type="text"
              maxLength={200}
              value={provAddress}
              onChange={e => setProvAddress(e.target.value)}
              className="w-full border border-line p-2 rounded outline-none focus:border-brand text-sm"
            />
          </div>
        </div>
        <div className="p-4 bg-surface-muted border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 font-bold text-ink-soft bg-surface-muted rounded-lg text-sm">Cancelar</button>
          <button onClick={handleSaveProveedor} disabled={saving} className="px-4 py-2 font-bold text-white bg-info rounded-lg text-sm">Guardar Proveedor</button>
        </div>
      </div>
    </div>
  );
}
