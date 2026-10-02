import { useState } from 'react';
import type { Delivery } from '@ferresys/contracts/deliveries';
import { Modal, Textarea, Field } from '../../../shared/ui/index.ts';

// Cancelar un envío que ya salió: el repartidor regresa los productos a la tienda.
interface Props {
  delivery: Delivery;
  busy: boolean;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
}

export default function CancelDeliveryModal({ delivery, busy, onClose, onConfirm }: Props) {
  const [motivo, setMotivo] = useState('');

  return (
    <Modal
      open
      onClose={onClose}
      title="Cancelar el envío"
      icon="fa-triangle-exclamation"
      size="sm"
      description={`${delivery.ref} · ${delivery.contactName}`}
      footer={<>
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-ink-soft hover:bg-surface-muted">
          Volver
        </button>
        <button
          onClick={() => onConfirm(motivo.trim())}
          disabled={busy}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-danger text-white disabled:opacity-50"
        >
          Cancelar el envío
        </button>
      </>}
    >
      <p className="text-sm text-ink-soft mb-3">
        El pedido deja de ser un envío a domicilio: el cliente lo recoge en la tienda.
        {delivery.status === 'EN_CAMINO' && ' Los productos tienen que volver con el repartidor.'}
      </p>
      <Field label="Motivo (opcional)" hint="Queda guardado en Auditoría junto con su nombre.">
        <Textarea
          rows={2}
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Ej. el cliente pasó a recogerlo"
          maxLength={200}
        />
      </Field>
    </Modal>
  );
}
