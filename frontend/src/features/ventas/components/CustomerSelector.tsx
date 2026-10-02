import { useId, type Ref } from 'react';
import type { Customer } from '@ferresys/contracts/customers';
import FieldError from '../../../shared/ui/FieldError.tsx';
import { customerOptionLabel } from '../../../shared/utils/customers.ts';

interface Props {
  clients: readonly Customer[];
  /** Lo escrito: "DNI - Nombre" al elegir de la lista. */
  value: string;
  onChange: (value: string) => void;
  /** El cliente que coincide exactamente con lo escrito. */
  customer: Customer | null;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export default function CustomerSelector({ clients, value, onChange, customer, error, inputRef }: Props) {
  const listId = useId();
  const typed = value.trim() !== '';

  return (
    <div>
      <div className="relative">
        <i className="fa-solid fa-user absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs"></i>
        <input
          ref={inputRef}
          list={listId}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Público general · buscar DNI/RUC o nombre"
          className={`w-full pl-8 pr-8 py-2 border rounded-lg outline-none text-sm bg-surface transition-colors focus:border-brand ${
            error ? 'border-danger' : 'border-line'
          }`}
        />
        <datalist id={listId}>
          {clients.map(c => <option key={c.id} value={customerOptionLabel(c)} />)}
        </datalist>
        {typed && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-danger p-1"
            title="Quitar cliente"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>
      {error ? (
        <FieldError msg={error} />
      ) : customer ? (
        <p className="mt-1 text-xs text-success font-semibold truncate">
          <i className="fa-solid fa-circle-check mr-1"></i>
          {customer.name} · {customer.type === 'EMPRESA' ? 'RUC' : 'DNI'} {customer.doc}
        </p>
      ) : typed ? (
        <p className="mt-1 text-xs text-warning">
          <i className="fa-solid fa-circle-info mr-1"></i> Seleccione un cliente de la lista
        </p>
      ) : null}
    </div>
  );
}
