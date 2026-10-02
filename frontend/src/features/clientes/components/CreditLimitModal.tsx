// Cambiar el límite de crédito (fiado) de un cliente.
import { useState } from 'react';
import type { CreditLimitRequest, Customer } from '@ferresys/contracts/customers';
import { api } from '../../../api/client.ts';
import { Modal, Button, Field, Input } from '../../../shared/ui/index.ts';

interface Props {
  creditTarget: Customer;
  onClose: () => void;
  onSaved: () => void;
}

export default function CreditLimitModal({ creditTarget, onClose, onSaved }: Props) {
  const [creditValue, setCreditValue] = useState(String(creditTarget.maxCredit));
  const [creditError, setCreditError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSaveCredit = async () => {
    const parsed = parseFloat(creditValue);
    if (creditValue === '' || Number.isNaN(parsed) || parsed < 0) {
      setCreditError('Ingrese un monto válido.');
      return;
    }
    if (parsed > 1000000) {
      setCreditError('El límite es demasiado alto.');
      return;
    }
    try {
      setSaving(true);
      await api.put(`/clientes/${creditTarget.id}/max-credit`, { maxCredit: parsed } satisfies CreditLimitRequest);
      onSaved();
    } catch (err) {
      setCreditError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => { if (!saving) onClose(); }}
      title="Límite de crédito"
      description={creditTarget.name}
      icon="fa-hand-holding-dollar"
      size="sm"
      footer={(
        <>
          <Button onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={handleSaveCredit} loading={saving}>Guardar</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-surface-muted rounded-lg p-2.5">
            <p className="text-muted">Deuda actual</p>
            <p className="font-bold text-danger text-sm">S/ {creditTarget.currentDebt.toFixed(2)}</p>
          </div>
          <div className="bg-surface-muted rounded-lg p-2.5">
            <p className="text-muted">Límite actual</p>
            <p className="font-bold text-ink text-sm">S/ {creditTarget.maxCredit.toFixed(2)}</p>
          </div>
        </div>
        <Field label="Nuevo límite (S/)" error={creditError}>
          <Input
            type="number"
            min="0"
            step="10"
            autoFocus
            value={creditValue}
            error={creditError}
            onChange={e => { setCreditValue(e.target.value); setCreditError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveCredit(); }}
            className="font-bold"
          />
        </Field>
      </div>
    </Modal>
  );
}
