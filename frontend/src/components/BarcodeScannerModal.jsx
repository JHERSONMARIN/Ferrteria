import React, { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal.jsx';

// La cámara del navegador solo funciona en HTTPS o en este mismo equipo (localhost).
const cameraAllowed = () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

// Escáner de código de barras: usa la cámara del equipo (celular o tablet) y, a la vez, acepta
// lo que escriba un lector USB o el teclado, que es lo único disponible sin cámara o sin HTTPS.
export default function BarcodeScannerModal({ open, onClose, onDetected, title = 'Escanear código de barras' }) {
  const videoRef = useRef(null);
  const inputRef = useRef(null);
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState('starting'); // starting | scanning | unavailable
  const [reason, setReason] = useState('');
  // La cámara lee varias veces por segundo: solo vale la primera lectura de cada apertura.
  const doneRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const finish = (code) => {
    const clean = String(code || '').trim();
    if (!clean || doneRef.current) return;
    doneRef.current = true;
    onDetectedRef.current(clean);
    onClose();
  };

  useEffect(() => {
    if (!open) return undefined;
    doneRef.current = false;
    setTyped('');
    setReason('');

    if (!cameraAllowed()) {
      setStatus('unavailable');
      setReason(window.isSecureContext
        ? 'Este navegador no permite usar la cámara.'
        : 'La cámara solo se puede usar si el sistema se abre con HTTPS.');
      setTimeout(() => inputRef.current?.focus(), 50);
      return undefined;
    }

    let controls = null;
    let cancelled = false;
    setStatus('starting');

    // La librería se carga solo al abrir el escáner, para no pesar en el resto del sistema.
    import('@zxing/browser')
      .then(({ BrowserMultiFormatReader }) => {
        if (cancelled) return null;
        const reader = new BrowserMultiFormatReader();
        return reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          (result) => { if (result && !cancelled) finish(result.getText()); },
        );
      })
      .then((c) => {
        controls = c;
        if (cancelled) c?.stop();
        else if (c) setStatus('scanning');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('unavailable');
        setReason(err?.name === 'NotAllowedError'
          ? 'No se dio permiso para usar la cámara.'
          : 'No se encontró una cámara disponible.');
        inputRef.current?.focus();
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={title} icon="fa-barcode" size="md">
      <div className="flex flex-col gap-3">
        {status !== 'unavailable' ? (
          <div className="relative rounded-xl overflow-hidden bg-panel-strong aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            {/* Guía de lectura */}
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-24 border-2 border-white/80 rounded-lg pointer-events-none" />
            {status === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-sm gap-2">
                <i className="fa-solid fa-spinner fa-spin"></i> Abriendo la cámara…
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
            <i className="fa-solid fa-camera-slash text-2xl mb-2 block"></i>
            {reason} Use el lector de códigos o escriba el código.
          </div>
        )}

        <div>
          <label className="text-xs font-bold text-ink-soft mb-1 block">
            {status === 'scanning' ? 'O pase el lector / escriba el código' : 'Pase el lector o escriba el código'}
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); finish(typed); } }}
              placeholder="Código de barras"
              className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <button
              type="button"
              onClick={() => finish(typed)}
              disabled={!typed.trim()}
              className="px-4 rounded-xl bg-brand text-brand-contrast text-sm font-semibold disabled:opacity-50"
            >
              Usar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
