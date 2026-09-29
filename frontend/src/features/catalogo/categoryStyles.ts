// Colores e íconos que se pueden elegir para una categoría.

export interface CategoryColor {
  bg: string;
  text: string;
  border: string;
  badge: string;
}

// Paleta de colores temáticos para categorías
export const COLOR_CLASSES: Record<string, CategoryColor> = {
  orange: { bg: 'bg-brand-soft', text: 'text-brand', border: 'border-brand/30', badge: 'bg-brand-soft text-brand-text' },
  blue: { bg: 'bg-info-soft', text: 'text-info', border: 'border-info/30', badge: 'bg-info-soft text-info' },
  emerald: { bg: 'bg-success-soft', text: 'text-success', border: 'border-success/30', badge: 'bg-success-soft text-success' },
  cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700' },
  purple: { bg: 'bg-info-soft', text: 'text-info', border: 'border-info/30', badge: 'bg-info-soft text-info' },
  amber: { bg: 'bg-warning-soft', text: 'text-warning', border: 'border-warning/30', badge: 'bg-warning-soft text-warning' },
  red: { bg: 'bg-danger-soft', text: 'text-danger', border: 'border-danger/30', badge: 'bg-danger-soft text-danger' },
  indigo: { bg: 'bg-info-soft', text: 'text-info', border: 'border-info/30', badge: 'bg-info-soft text-info' },
  slate: { bg: 'bg-surface-muted', text: 'text-ink-soft', border: 'border-line', badge: 'bg-surface-muted text-ink' },
  yellow: { bg: 'bg-warning-soft', text: 'text-warning', border: 'border-warning/30', badge: 'bg-warning-soft text-warning' },
  gray: { bg: 'bg-surface-muted', text: 'text-ink-soft', border: 'border-line', badge: 'bg-surface-muted text-ink' },
};

export const AVAILABLE_ICONS = [
  'fa-hammer', 'fa-wrench', 'fa-screwdriver', 'fa-bolt', 'fa-faucet-drip',
  'fa-paint-roller', 'fa-bottle-droplet', 'fa-key', 'fa-shield-halved',
  'fa-seedling', 'fa-boxes-packing', 'fa-tag', 'fa-layer-group', 'fa-toolbox',
  'fa-ruler-combined', 'fa-hard-hat'
];

export const AVAILABLE_COLORS = [
  'orange', 'blue', 'emerald', 'cyan', 'purple', 'amber', 'red', 'indigo', 'slate', 'yellow'
];

export const colorOf = (color: string | null | undefined): CategoryColor => COLOR_CLASSES[color ?? ''] ?? COLOR_CLASSES.orange!;
