import { useState } from 'react';

// Logo de la empresa: se guarda con el resto de la configuración y se ve en el inicio y en el menú.
export default function LogoField({ logo, onChange }: { logo: string | null; onChange: (logo: string | null) => void }) {
  const [mensaje, setMensaje] = useState('');

  const elegir = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp|svg\+xml)$/.test(file.type)) {
      setMensaje('Use una imagen PNG, JPG, WEBP o SVG.');
      return;
    }
    if (file.size > 280 * 1024) {
      setMensaje('La imagen no puede superar 280 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setMensaje(''); onChange(typeof reader.result === 'string' ? reader.result : null); };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="w-24 h-24 rounded-xl border border-dashed border-line bg-surface-muted flex items-center justify-center overflow-hidden shrink-0">
        {logo
          ? <img src={logo} alt="Logo de la empresa" className="max-w-full max-h-full object-contain" />
          : <i className="fa-solid fa-image text-2xl text-muted"></i>}
      </div>
      <div className="flex-1 min-w-[12rem]">
        <div className="flex flex-wrap gap-2">
          <label className="px-3 py-2 rounded-lg border border-line text-sm font-semibold text-ink-soft bg-surface hover:bg-surface-muted cursor-pointer">
            <i className="fa-solid fa-upload mr-1.5 text-muted"></i>
            {logo ? 'Cambiar logo' : 'Subir logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
              onChange={e => elegir(e.target.files?.[0])} />
          </label>
          {logo && (
            <button type="button" onClick={() => { setMensaje(''); onChange(null); }}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-muted hover:text-danger">
              Quitar
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted mt-1.5">
          PNG, JPG, WEBP o SVG, hasta 280 KB. Se muestra en el inicio de sesión y en el menú lateral.
        </p>
        {mensaje && <p className="text-[11px] text-danger mt-1">{mensaje}</p>}
      </div>
    </div>
  );
}
