import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import Modal from './Modal.tsx';
import Button from './Button.tsx';

// Confirmaciones del sistema, en lugar de confirm() del navegador. Siempre nombran lo que va a pasar.
//
// Uso:  const confirmar = useConfirm();
//       if (await confirmar({ title: 'Eliminar producto', description: `Se eliminará "${p.name}".`,
//                             confirmText: 'Eliminar', tone: 'danger' })) { … }
export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: 'primary' | 'danger';
}
export type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export function ConfirmProvider({ children }: { children?: ReactNode }) {
  const [pregunta, setPregunta] = useState<Required<ConfirmOptions> | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirmar = useCallback<Confirm>((opciones) => new Promise<boolean>(resolve => {
    resolver.current = resolve;
    setPregunta({ description: '', confirmText: 'Confirmar', cancelText: 'Cancelar', tone: 'primary', ...opciones });
  }), []);

  const responder = (valor: boolean) => {
    setPregunta(null);
    if (resolver.current) resolver.current(valor);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      <Modal
        open={Boolean(pregunta)}
        onClose={() => responder(false)}
        title={pregunta?.title}
        icon={pregunta?.tone === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-question'}
        size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => responder(false)}>{pregunta?.cancelText}</Button>
          <Button variant={pregunta?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => responder(true)}>
            {pregunta?.confirmText}
          </Button>
        </>}
      >
        <p className="text-sm text-ink-soft">{pregunta?.description}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

// Fuera del proveedor se cae a la ventana del navegador antes que dejar pasar la acción sin preguntar.
export function useConfirm(): Confirm {
  const desdeContexto = useContext(ConfirmContext);
  return desdeContexto || (({ title, description }: ConfirmOptions) =>
    Promise.resolve(window.confirm([title, description].filter(Boolean).join('\n\n'))));
}
