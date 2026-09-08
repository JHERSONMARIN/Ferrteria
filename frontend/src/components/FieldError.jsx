import React from 'react';

/** Mensaje de error de validación bajo un input. */
export default function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <p className="text-red-500 text-[11px] font-medium mt-1 flex items-center gap-1">
      <i className="fa-solid fa-circle-exclamation"></i> {msg}
    </p>
  );
}
