/** @type {import('tailwindcss').Config} */
// Los colores salen de las variables definidas en src/styles/theme.css: cambiándolas ahí cambia todo
// el sistema, y cada empresa puede tener el suyo (utils/theme.js).
const color = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: color('--brand'),
          strong: color('--brand-strong'),
          soft: color('--brand-soft'),
          contrast: color('--brand-contrast'),
          text: color('--brand-text'),
        },
        page: color('--bg'),
        surface: { DEFAULT: color('--surface'), muted: color('--surface-muted') },
        line: color('--line'),
        ink: { DEFAULT: color('--ink'), soft: color('--ink-soft') },
        muted: color('--muted'),
        nav: { DEFAULT: color('--nav'), strong: color('--nav-strong'), ink: color('--nav-ink'), muted: color('--nav-muted') },
        success: { DEFAULT: color('--success'), soft: color('--success-soft') },
        warning: { DEFAULT: color('--warning'), soft: color('--warning-soft') },
        danger: { DEFAULT: color('--danger'), soft: color('--danger-soft') },
        info: { DEFAULT: color('--info'), soft: color('--info-soft') },
      },
      borderRadius: { DEFAULT: 'var(--radius)', xl: 'var(--radius)', '2xl': 'var(--radius-lg)' },
      boxShadow: { card: 'var(--shadow)', float: 'var(--shadow-lg)' },
    },
  },
  plugins: [],
};
