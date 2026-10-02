import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// Avisos flotantes arriba a la derecha. Reemplazan a alert(): no interrumpen el trabajo y se van solos.
//
// Uso:  const aviso = useToast();
//       aviso.exito('Venta registrada');  aviso.error('No se pudo guardar');
type ToastType = 'success' | 'error' | 'warning' | 'info';
type Show = (text: ReactNode, ms?: number) => void;
export interface Toasts { exito: Show; error: Show; aviso: Show; info: Show }

const ToastContext = createContext<Toasts | null>(null);

const TIPOS: Record<ToastType, { icon: string; clase: string }> = {
  success: { icon: 'fa-circle-check', clase: 'border-success/30 bg-success-soft text-success' },
  error: { icon: 'fa-circle-exclamation', clase: 'border-danger/30 bg-danger-soft text-danger' },
  warning: { icon: 'fa-triangle-exclamation', clase: 'border-warning/30 bg-warning-soft text-warning' },
  info: { icon: 'fa-circle-info', clase: 'border-info/30 bg-info-soft text-info' },
};

export function ToastProvider({ children }: { children?: ReactNode }) {
  const [avisos, setAvisos] = useState<{ id: number; type: ToastType; text: ReactNode }[]>([]);

  const quitar = useCallback((id: number) => setAvisos(prev => prev.filter(a => a.id !== id)), []);

  const mostrar = useCallback((type: ToastType, text: ReactNode, duracion = 4000) => {
    const id = Date.now() + Math.random();
    setAvisos(prev => [...prev, { id, type, text }]);
    setTimeout(() => quitar(id), duracion);
    return id;
  }, [quitar]);

  const api = useMemo<Toasts>(() => ({
    exito: (text, ms) => { mostrar('success', text, ms); },
    error: (text, ms) => { mostrar('error', text, ms ?? 6000); },
    aviso: (text, ms) => { mostrar('warning', text, ms); },
    info: (text, ms) => { mostrar('info', text, ms); },
  }), [mostrar]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))] print:hidden">
        {avisos.map(aviso => {
          const tipo = TIPOS[aviso.type];
          return (
            <div
              key={aviso.id}
              onClick={() => quitar(aviso.id)}
              className={`flex items-start gap-2.5 border rounded-xl shadow-float px-3.5 py-2.5 text-sm
                font-semibold cursor-pointer ${tipo.clase}`}
            >
              <i className={`fa-solid ${tipo.icon} mt-0.5`}></i>
              <span className="flex-1 min-w-0">{aviso.text}</span>
              <i className="fa-solid fa-xmark opacity-50 mt-0.5"></i>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// Fuera del proveedor (o en pruebas) no rompe: los avisos simplemente no se muestran.
const SIN_AVISOS: Toasts = { exito: () => {}, error: () => {}, aviso: () => {}, info: () => {} };

export function useToast(): Toasts {
  return useContext(ToastContext) || SIN_AVISOS;
}
