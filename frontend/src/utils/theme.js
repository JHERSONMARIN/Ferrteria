// Color principal por empresa. Se guarda en su configuración (settings.primaryColor) y se aplica al
// entrar y al guardarlo. Sin color propio, se usa el de src/styles/theme.css.
const HEX = /^#([0-9a-fA-F]{6})$/;

const toRgb = (hex) => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
};

const mezclar = ([r, g, b], [r2, g2, b2], peso) => [
  Math.round(r + (r2 - r) * peso),
  Math.round(g + (g2 - g) * peso),
  Math.round(b + (b2 - b) * peso),
];

// Luminancia relativa: decide si el texto sobre el color va en blanco o en negro.
const claro = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) > 150;

export function applyTheme(primaryColor) {
  const raiz = document.documentElement;
  if (!primaryColor || !HEX.test(primaryColor)) {
    ['--brand', '--brand-strong', '--brand-soft', '--brand-contrast', '--brand-text'].forEach(v => raiz.style.removeProperty(v));
    return;
  }
  const base = toRgb(primaryColor);
  const fuerte = mezclar(base, [0, 0, 0], 0.18);   // más oscuro, para hover
  const suave = mezclar(base, [255, 255, 255], 0.88); // muy claro, para fondos
  const texto = mezclar(base, [0, 0, 0], 0.35);      // legible sobre fondo claro
  raiz.style.setProperty('--brand', base.join(' '));
  raiz.style.setProperty('--brand-strong', fuerte.join(' '));
  raiz.style.setProperty('--brand-soft', suave.join(' '));
  raiz.style.setProperty('--brand-contrast', claro(base) ? '15 23 42' : '255 255 255');
  raiz.style.setProperty('--brand-text', texto.join(' '));
}

// Colores sugeridos en Configuración; cualquier otro se puede escribir a mano.
export const BRAND_PRESETS = [
  { hex: '#ea580c', label: 'Naranja' },
  { hex: '#dc2626', label: 'Rojo' },
  { hex: '#2563eb', label: 'Azul' },
  { hex: '#0f766e', label: 'Verde azulado' },
  { hex: '#16a34a', label: 'Verde' },
  { hex: '#7c3aed', label: 'Violeta' },
  { hex: '#0f172a', label: 'Negro' },
];
