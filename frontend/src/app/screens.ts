// Las pantallas del sistema: su dirección web, su título (el mismo nombre del menú) y su ícono.
// El id es el del módulo que da acceso a la pantalla. Las de un rubro llevan su industry: solo existen en las
// empresas de ese rubro (quién las ve lo dice industries/index.ts).
import type { Industry } from '@ferresys/contracts/settings';

export interface Screen {
  path: string;
  title: string;
  hint: string;
  icon: string;
  industry?: Industry;
}

export const SCREENS = {
  pos: { path: '/vender', title: 'Vender', hint: 'Arme la venta, cobre e imprima el comprobante.', icon: 'fa-cash-register' },
  cobros: { path: '/por-cobrar', title: 'Por cobrar', hint: 'Pedidos esperando pago en caja.', icon: 'fa-hand-holding-dollar' },
  despacho: { path: '/por-despachar', title: 'Por despachar', hint: 'Pedidos pagados listos para entregar.', icon: 'fa-dolly' },
  caja: { path: '/caja', title: 'Caja', hint: 'Apertura, movimientos y arqueo del turno.', icon: 'fa-vault' },
  cotizaciones: { path: '/cotizaciones', title: 'Cotizaciones', hint: 'Proformas enviadas y su seguimiento.', icon: 'fa-file-invoice' },
  deliveries: { path: '/entregas', title: 'Entregas', hint: 'Pedidos con envío a domicilio.', icon: 'fa-truck-fast' },
  inventory: { path: '/productos', title: 'Productos', hint: 'Stock, precios y datos de cada producto.', icon: 'fa-boxes-stacked' },
  categories: { path: '/categorias', title: 'Categorías', hint: 'Cómo se agrupan los productos en el catálogo.', icon: 'fa-tags' },
  kardex: { path: '/movimientos', title: 'Movimientos', hint: 'Entradas y salidas de almacén, producto por producto.', icon: 'fa-receipt' },
  compras: { path: '/compras', title: 'Compras', hint: 'Órdenes a proveedores e ingreso de mercadería.', icon: 'fa-cart-flatbed' },
  transfers: { path: '/transferencias', title: 'Transferencias', hint: 'Envío de mercadería entre sucursales.', icon: 'fa-right-left' },
  'client-dir': { path: '/clientes', title: 'Clientes', hint: 'Directorio de clientes del negocio.', icon: 'fa-users' },
  customers: { path: '/creditos', title: 'Créditos', hint: 'Deudas, pagos y clientes con fiado.', icon: 'fa-book-journal-whills' },
  personal: { path: '/personal', title: 'Personal', hint: 'Usuarios, accesos y permisos.', icon: 'fa-id-badge' },
  dashboard: { path: '/reportes', title: 'Reportes', hint: 'Ventas, ganancias y estado del negocio.', icon: 'fa-chart-pie' },
  audit: { path: '/auditoria', title: 'Auditoría', hint: 'Quién hizo cada cambio y cuándo.', icon: 'fa-shield-halved' },
  vencimientos: {
    path: '/vencimientos', title: 'Vencimientos', hint: 'Lotes vencidos, por vencer y stock sin lote.', icon: 'fa-calendar-xmark',
    industry: 'farmacia',
  },
  controlados: {
    path: '/controlados', title: 'Libro de controlados', hint: 'Cada venta de un controlado, con su receta.', icon: 'fa-book-medical',
    industry: 'farmacia',
  },
  settings: { path: '/configuracion', title: 'Configuración', hint: 'Datos de la empresa, sucursales, cajas y comprobantes.', icon: 'fa-gear' },
} satisfies Record<string, Screen>;

export type ScreenId = keyof typeof SCREENS;

export const isScreenId = (id: string): id is ScreenId => id in SCREENS;

// Pantalla de una dirección (/productos → inventory), o null si no es de ninguna.
export function screenFromPath(pathname: string): ScreenId | null {
  const entry = Object.entries(SCREENS).find(([, s]) => pathname === s.path || pathname.startsWith(`${s.path}/`));
  return entry ? (entry[0] as ScreenId) : null;
}

// Al entrar se abre Vender, que es el trabajo de todos los días; si el usuario no lo tiene, la primera
// pantalla a la que sí llega.
export const firstScreen = (screens: readonly ScreenId[]): ScreenId | undefined => (screens.includes('pos') ? 'pos' : screens[0]);
