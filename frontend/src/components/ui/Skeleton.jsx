import React from 'react';

// Mientras carga se muestra la forma de lo que va a llegar, no la palabra "Cargando".
export function Skeleton({ className = '' }) {
  return <div className={`bg-surface-muted rounded-lg animate-pulse ${className}`} />;
}

// Filas grises con el alto de las filas reales de la tabla.
export function SkeletonTable({ rows = 6, columns = 4 }) {
  return (
    <div className="p-3 flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, fila) => (
        <div key={fila} className="flex gap-3">
          {Array.from({ length: columns }).map((_, col) => (
            <Skeleton key={col} className={`h-9 ${col === 0 ? 'flex-[2]' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 6 }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 p-3">
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className="h-28" />)}
    </div>
  );
}

export default Skeleton;
