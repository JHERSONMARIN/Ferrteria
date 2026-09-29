// Registrar un abono a la deuda de un cliente (o saldarla), con su historial de movimientos.
import { useState } from 'react';
import type { CreditAccount, CreditPaymentRequest, CreditPaymentSaved } from '@ferresys/contracts/customers';
import { api } from '../../../api/client.ts';
import FieldError from '../../../shared/ui/FieldError.tsx';
import { borderClass } from '../../../shared/utils/validators.ts';
import { useToast, useConfirm } from '../../../shared/ui/index.ts';

// El abono nunca supera la deuda: si se escribe más, queda en el total adeudado.
const limitAbono = (value: string, debt: number) => {
  if (value === '') return '';
  const [entero, decimales] = value.split('.');
  const limpio = decimales !== undefined ? `${entero}.${decimales.slice(0, 2)}` : entero ?? '';
  return Number(limpio) > debt ? debt.toFixed(2) : limpio;
};

interface Props {
  account: CreditAccount;
  onClose: () => void;
  onSaved: () => void;
}

export default function CreditPaymentModal({ account, onClose, onSaved }: Props) {
  const aviso = useToast();
  const confirmar = useConfirm();
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoError, setAbonoError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleRegisterAbono = async (amountToPay?: number) => {
    const val = amountToPay || parseFloat(abonoAmount);
    if (Number.isNaN(val) || val <= 0) {
      setAbonoError('Ingrese un monto de abono mayor a 0.');
      return;
    }
    if (val > account.debt + 0.001) {
      setAbonoError(`El abono no puede superar la deuda actual (S/ ${account.debt.toFixed(2)}).`);
      return;
    }
    setAbonoError('');

    try {
      setSaving(true);
      await api.post<CreditPaymentSaved>('/creditos/abono', { clienteId: account.clienteId, amount: val } satisfies CreditPaymentRequest);
      aviso.exito('Abono registrado correctamente.');
      onSaved();
    } catch (err) {
      aviso.error(`Error al registrar abono: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaldarTodo = async () => {
    const seguro = await confirmar({
      title: 'Saldar la deuda',
      description: `Se registrará el pago total de S/ ${account.debt.toFixed(2)}.`,
      confirmText: 'Saldar',
    });
    if (seguro) handleRegisterAbono(account.debt);
  };

  return (
    <div className="fixed inset-0 bg-panel/60 z-50 flex items-center justify-center backdrop-blur-sm transition-all">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 bg-panel text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-lg"><i className="fa-solid fa-handshake-angle mr-2"></i> Estado de Cuenta</h3>
            <p className="text-muted text-sm">Cliente: {account.name} (DNI/RUC: {account.doc})</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div className="p-4 bg-surface-muted border-b border-line grid grid-cols-3 gap-4 shrink-0 text-center">
          <div className="bg-surface p-3 rounded-lg border border-line">
            <p className="text-xs font-bold text-muted mb-1">Límite Autorizado</p>
            <h4 className="text-lg font-black text-ink">S/ {account.maxCredit.toFixed(2)}</h4>
          </div>
          <div className="bg-danger-soft p-3 rounded-lg border border-danger/20">
            <p className="text-xs font-bold text-danger mb-1">Deuda Pendiente</p>
            <h4 className="text-xl font-black text-danger">S/ {account.debt.toFixed(2)}</h4>
          </div>
          <div className="bg-success-soft p-3 rounded-lg border border-success/20">
            <p className="text-xs font-bold text-success mb-1">Disponible para Fiar</p>
            <h4 className="text-lg font-black text-success">S/ {account.availableCredit.toFixed(2)}</h4>
          </div>
        </div>

        <div className="p-4 border-b border-line shrink-0 bg-surface">
          <div className="flex gap-2 items-center">
            <input
              type="number"
              step="0.50"
              min="0"
              max={account.debt}
              value={abonoAmount}
              onChange={e => { setAbonoAmount(limitAbono(e.target.value, account.debt)); setAbonoError(''); }}
              placeholder="Monto de abono en S/..."
              className={`flex-1 px-3 py-2 border rounded outline-none text-sm font-bold ${borderClass(abonoError)}`}
            />
            <button
              onClick={() => handleRegisterAbono()}
              disabled={saving}
              className="bg-success hover:brightness-95 text-white font-bold px-4 py-2 rounded shadow text-sm"
            >
              Registrar Abono
            </button>
            <button
              onClick={handleSaldarTodo}
              disabled={saving}
              className="bg-brand hover:bg-brand-strong text-brand-contrast font-bold px-4 py-2 rounded shadow text-sm"
            >
              Saldar Deuda Total
            </button>
          </div>
          <FieldError msg={abonoError} />
        </div>

        <div className="flex-1 overflow-auto p-4 bg-surface-muted">
          <h4 className="font-bold text-xs uppercase text-muted mb-2">Historial de Cargos y Abonos</h4>
          <table className="w-full text-left border-collapse bg-surface shadow-sm rounded-lg overflow-hidden">
            <thead className="bg-surface-muted text-muted text-xs uppercase">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Doc. Ref</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-line">
              {account.abonos.map(a => (
                <tr key={a.id}>
                  <td className="px-3 py-2 text-muted">{a.date}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded font-bold ${a.type === 'CARGO' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
                      {a.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold">{a.docRef}</td>
                  <td className="px-3 py-2 text-ink-soft">{a.desc || '-'}</td>
                  <td className={`px-3 py-2 text-right font-black ${a.type === 'CARGO' ? 'text-danger' : 'text-success'}`}>
                    {a.type === 'CARGO' ? '+' : '-'}S/ {a.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
