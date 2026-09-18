import React, { useId } from 'react';
import FieldError from './FieldError.jsx';
import { customerOptionLabel } from '../utils/customers.js';

export default function CustomerSelector({ clients, value, onChange, customer, error, inputRef }) {
  const listId = useId();
  const typed = value.trim() !== '';

  return (
    <div>
      <div className="relative">
        <i className="fa-solid fa-user absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input
          ref={inputRef}
          list={listId}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Público general · buscar DNI/RUC o nombre"
          className={`w-full pl-8 pr-8 py-2 border rounded-lg outline-none text-sm bg-white transition-colors focus:border-orange-500 ${
            error ? 'border-red-400' : 'border-gray-300'
          }`}
        />
        <datalist id={listId}>
          {clients.map(c => <option key={c.id} value={customerOptionLabel(c)} />)}
        </datalist>
        {typed && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 p-1"
            title="Quitar cliente"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>
      {error ? (
        <FieldError msg={error} />
      ) : customer ? (
        <p className="mt-1 text-xs text-emerald-700 font-semibold truncate">
          <i className="fa-solid fa-circle-check mr-1"></i>
          {customer.name} · {customer.type === 'EMPRESA' ? 'RUC' : 'DNI'} {customer.doc}
        </p>
      ) : typed ? (
        <p className="mt-1 text-xs text-amber-600">
          <i className="fa-solid fa-circle-info mr-1"></i> Seleccione un cliente de la lista
        </p>
      ) : null}
    </div>
  );
}
