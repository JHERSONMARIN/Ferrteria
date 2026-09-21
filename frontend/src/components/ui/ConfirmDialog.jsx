import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';

// Confirmaciones del sistema, en lugar de confirm() del navegador. Siempre nombran lo que va a pasar.
//
// Uso:  const confirmar = useConfirm();
//       if (await confirmar({ title: 'Eliminar producto', description: `Se eliminará "${p.name}".`,
//                             confirmText: 'Eliminar', tone: 'danger' })) { … }
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [pregunta, setPregunta] = useState(null);
  const resolver = useRef(null);

  const confirmar = useCallback((opciones) => new Promise(resolve => {
    resolver.current = resolve;
    setPregunta({ confirmText: 'Confirmar', cancelText: 'Cancelar', tone: 'primary', ...opciones });
  }), []);

  const responder = (valor) => {
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
export function useConfirm() {
  const desdeContexto = useContext(ConfirmContext);
  return desdeContexto || (({ title, description }) =>
    Promise.resolve(window.confirm([title, description].filter(Boolean).join('\n\n'))));
}
