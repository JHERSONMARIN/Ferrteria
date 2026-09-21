// Estilo de cada empresa: color principal y color del menú lateral. Se guardan en su configuración
// (settings.primaryColor y settings.navColor) y se aplican al entrar y al guardarlos.
// Sin estilo propio se usa el de src/styles/theme.css.
//
// Los estilos predeterminados salen del servidor (backend/src/config/themes.json), que es la misma
// lista que usa la consola de VALETEC.
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

const NEGRO = [15, 23, 42];
const BLANCO = [255, 255, 255];

const VARIABLES_MARCA = ['--brand', '--brand-strong', '--brand-soft', '--brand-contrast', '--brand-text'];
const VARIABLES_MENU = ['--nav', '--nav-strong', '--nav-ink', '--nav-muted', '--nav-line'];

const poner = (raiz, nombre, rgb) => raiz.style.setProperty(nombre, rgb.join(' '));

export function applyTheme(primaryColor, navColor) {
  const raiz = document.documentElement;

  // Color principal: botones, selección y lo que el sistema resalta.
  if (primaryColor && HEX.test(primaryColor)) {
    const base = toRgb(primaryColor);
    poner(raiz, '--brand', base);
    poner(raiz, '--brand-strong', mezclar(base, [0, 0, 0], 0.18)); // al pasar el mouse o presionar
    poner(raiz, '--brand-soft', mezclar(base, BLANCO, 0.88));      // fondos suaves, selección
    poner(raiz, '--brand-contrast', claro(base) ? NEGRO : BLANCO); // texto sobre el color
    poner(raiz, '--brand-text', mezclar(base, [0, 0, 0], 0.35));   // el color escrito sobre fondo claro
  } else {
    VARIABLES_MARCA.forEach(v => raiz.style.removeProperty(v));
  }

  // Menú lateral: puede ser oscuro o claro; el texto se ajusta solo al fondo elegido.
  if (navColor && HEX.test(navColor)) {
    const base = toRgb(navColor);
    const esClaro = claro(base);
    poner(raiz, '--nav', base);
    poner(raiz, '--nav-strong', esClaro ? mezclar(base, [0, 0, 0], 0.06) : mezclar(base, [0, 0, 0], 0.35));
    poner(raiz, '--nav-ink', esClaro ? NEGRO : mezclar(base, BLANCO, 0.9));
    poner(raiz, '--nav-muted', esClaro ? mezclar(base, NEGRO, 0.55) : mezclar(base, BLANCO, 0.6));
    poner(raiz, '--nav-line', esClaro ? NEGRO : BLANCO);
  } else {
    VARIABLES_MENU.forEach(v => raiz.style.removeProperty(v));
  }
}
