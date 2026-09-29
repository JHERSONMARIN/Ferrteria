// Registrar un cliente o editar sus datos (el crédito y la lista de precios se cambian aparte).
import { useState } from 'react';
import type { Customer, CustomerRequest, PriceList } from '@ferresys/contracts/customers';
import { api } from '../../../api/client.ts';
import FieldError from '../../../shared/ui/FieldError.tsx';
import { borderClass } from '../../../shared/utils/validators.ts';
import { useToast, Modal, Button } from '../../../shared/ui/index.ts';

type Field = 'doc' | 'name' | 'phone' | 'email' | 'maxCredit';

interface Props {
  /** El cliente a editar; null = uno nuevo. */
  editing: Customer | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function CustomerFormModal({ editing, onClose, onSaved }: Props) {
  const aviso = useToast();
  const [cliType, setCliType] = useState<CustomerRequest['type']>(editing?.type === 'EMPRESA' ? 'Empresa' : 'Natural');
  const [cliDoc, setCliDoc] = useState(editing?.doc || '');
  const [cliName, setCliName] = useState(editing?.name || '');
  const [cliPhone, setCliPhone] = useState(editing?.phone || '');
  const [cliEmail, setCliEmail] = useState(editing?.email || '');
  const [cliAddress, setCliAddress] = useState(editing?.address || '');
  const [maxCredit, setMaxCredit] = useState('1000');
  const [priceList, setPriceList] = useState<PriceList>('RETAIL');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);

  const clearError = (field: Field) => setErrors(prev => ({ ...prev, [field]: '' }));
  const close = () => { if (!saving) onClose(); };

  const validateClient = () => {
    const e: Partial<Record<Field, string>> = {};
    const doc = cliDoc.trim();
    if (!doc) {
      e.doc = 'El documento es obligatorio.';
    } else if (cliType === 'Empresa' && !/^\d{11}$/.test(doc)) {
      e.doc = 'El RUC debe tener exactamente 11 dígitos.';
    } else if (cliType === 'Natural' && !/^\d{8}$/.test(doc)) {
      e.doc = 'El DNI debe tener exactamente 8 dígitos.';
    }

    if (!cliName.trim()) e.name = 'El nombre / razón social es obligatorio.';
    else if (cliName.trim().length < 3) e.name = 'Debe tener al menos 3 caracteres.';

    if (cliPhone.trim() && !/^\+?\d[\d\s-]{5,14}$/.test(cliPhone.trim()))
      e.phone = 'Teléfono inválido (6 a 15 dígitos).';

    if (cliEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliEmail.trim()))
      e.email = 'Correo electrónico inválido.';

    // Al editar, el crédito se cambia desde su propio botón.
    if (!editing) {
      const mc = parseFloat(maxCredit);
      if (maxCredit === '' || Number.isNaN(mc)) e.maxCredit = 'Ingrese un monto válido.';
      else if (mc < 0) e.maxCredit = 'El límite no puede ser negativo.';
      else if (mc > 1000000) e.maxCredit = 'El límite es demasiado alto.';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSaveClient = async () => {
    if (!validateClient()) return;

    const datos: CustomerRequest = {
      type: cliType,
      doc: cliDoc.trim(),
      name: cliName.trim(),
      phone: cliPhone.trim(),
      email: cliEmail.trim(),
      address: cliAddress.trim(),
    };
    try {
      setSaving(true);
      if (editing) await api.put(`/clientes/${editing.id}`, datos);
      else await api.post('/clientes', { ...datos, maxCredit: parseFloat(maxCredit) || 1000.0, priceList } satisfies CustomerRequest);
      onSaved(editing ? 'Datos del cliente actualizados.' : 'Cliente guardado con éxito.');
    } catch (err) {
      aviso.error(`Error al guardar cliente: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title={editing ? 'Editar cliente' : 'Registrar cliente'}
      icon={editing ? 'fa-user-pen' : 'fa-user-plus'}
      footer={(
        <>
          <Button onClick={close} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={handleSaveClient} loading={saving}>
            {editing ? 'Guardar cambios' : 'Guardar cliente'}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Tipo Cliente</label>
            <select
              value={cliType}
              onChange={e => { setCliType(e.target.value as CustomerRequest['type']); clearError('doc'); }}
              className="w-full border border-line p-2 rounded outline-none focus:border-brand bg-surface text-sm"
            >
              <option value="Natural">Persona Natural</option>
              <option value="Empresa">Empresa (RUC)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">DNI / RUC</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={11}
              value={cliDoc}
              onChange={e => { setCliDoc(e.target.value.replace(/\D/g, '')); clearError('doc'); }}
              className={`w-full border p-2 rounded outline-none text-sm font-medium ${borderClass(errors.doc)}`}
            />
            <FieldError msg={errors.doc} />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-muted mb-1 block">Nombre / Razón Social</label>
          <input
            type="text"
            maxLength={120}
            value={cliName}
            onChange={e => { setCliName(e.target.value); clearError('name'); }}
            className={`w-full border p-2 rounded outline-none text-sm ${borderClass(errors.name)}`}
          />
          <FieldError msg={errors.name} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Teléfono</label>
            <input
              type="text"
              inputMode="tel"
              maxLength={15}
              value={cliPhone}
              onChange={e => { setCliPhone(e.target.value); clearError('phone'); }}
              className={`w-full border p-2 rounded outline-none text-sm ${borderClass(errors.phone)}`}
            />
            <FieldError msg={errors.phone} />
          </div>
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Correo</label>
            <input
              type="email"
              maxLength={120}
              value={cliEmail}
              onChange={e => { setCliEmail(e.target.value); clearError('email'); }}
              className={`w-full border p-2 rounded outline-none text-sm ${borderClass(errors.email)}`}
            />
            <FieldError msg={errors.email} />
          </div>
          {!editing && (
            <>
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Límite de Crédito (S/)</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={maxCredit}
                  onChange={e => { setMaxCredit(e.target.value); clearError('maxCredit'); }}
                  className={`w-full border p-2 rounded outline-none text-sm font-bold ${borderClass(errors.maxCredit)}`}
                />
                <FieldError msg={errors.maxCredit} />
              </div>
              <div>
                <label className="text-xs font-bold text-muted mb-1 block">Lista de precios</label>
                <select
                  value={priceList}
                  onChange={e => setPriceList(e.target.value as PriceList)}
                  className="w-full border border-line p-2 rounded outline-none text-sm bg-surface"
                >
                  <option value="RETAIL">Minorista</option>
                  <option value="WHOLESALE">Mayorista</option>
                </select>
              </div>
            </>
          )}
        </div>
        <div>
          <label className="text-xs font-bold text-muted mb-1 block">Dirección</label>
          <input
            type="text"
            maxLength={200}
            value={cliAddress}
            onChange={e => setCliAddress(e.target.value)}
            className="w-full border border-line p-2 rounded outline-none focus:border-brand text-sm"
          />
        </div>
        {editing && (
          <p className="text-[11px] text-muted">
            El límite de crédito y la lista de precios se cambian desde los botones de la tabla.
          </p>
        )}
      </div>
    </Modal>
  );
}
