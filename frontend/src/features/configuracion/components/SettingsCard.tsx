// Piezas de la pantalla de Configuración: una tarjeta por tema y un campo con su error o ayuda.
import type { ReactNode } from 'react';
import FieldError from '../../../shared/ui/FieldError.tsx';

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children?: ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold text-ink-soft mb-1 block">{label}</label>
      {children}
      {error ? <FieldError msg={error} /> : hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

export default function Card({ icon, title, description, children }: { icon: string; title: string; description?: string; children?: ReactNode }) {
  return (
    <section className="bg-surface rounded-2xl border border-line/80">
      <div className="px-6 pt-5 pb-4 flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-surface-muted text-muted flex items-center justify-center shrink-0">
          <i className={`fa-solid ${icon} text-sm`}></i>
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{title}</h3>
          {description && <p className="text-xs text-muted mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>
      <div className="px-6 pb-6">{children}</div>
    </section>
  );
}
