import { effectiveDispatchRole, dispatchRoleModule } from './dispatch.js';

// El rol es el cargo de la persona y la plantilla de módulos que se sugiere al elegirlo. Los permisos
// reales son los módulos marcados, que se pueden ajustar a mano (ej. un vendedor que además lleva almacén).
export const ROLE_OPTIONS = [
  { value: 'VENDEDOR', label: 'Vendedor', hint: 'Mostrador / ventas', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'CAJERO', label: 'Cajero', hint: 'Cobro y arqueos', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'ALMACEN', label: 'Almacén', hint: 'Productos, compras, kardex y despacho', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'REPARTIDOR', label: 'Repartidor', hint: 'Envíos a domicilio', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'ADMINISTRADOR', label: 'Administrador', hint: 'Control total', badge: 'bg-purple-100 text-purple-700 border-purple-200' },
];

export const roleLabel = (role) => ROLE_OPTIONS.find(r => r.value === role)?.label ?? role;

// Módulos sugeridos según el rol y el modo de trabajo de la sucursal. En modo directo el vendedor también
// cobra (necesita Arqueo de Caja para abrir su turno); con caja separada, cobra el cajero.
export function presetModules(role, branch, allModules) {
  const direct = !branch || branch.saleFlowMode === 'DIRECT';
  switch (role) {
    case 'VENDEDOR': return direct ? ['pos', 'cotizaciones', 'caja', 'client-dir'] : ['pos', 'cotizaciones', 'client-dir'];
    case 'CAJERO': return ['caja', 'customers', 'client-dir'];
    case 'ALMACEN': return ['inventory', 'categories', 'compras', 'kardex', 'despacho'];
    case 'REPARTIDOR': return ['deliveries'];
    case 'ADMINISTRADOR': return allModules;
    default: return ['pos'];
  }
}

// Lo que hará la persona en su sucursal con los módulos marcados, en palabras simples.
export function describeDuties({ role, modules, branch, deliveriesEnabled }) {
  if (role === 'ADMINISTRADOR') return { duties: ['Acceso total: ve todos los módulos activos, Auditoría y Configuración.'], warnings: [] };
  const mode = branch?.saleFlowMode ?? 'DIRECT';
  const has = (m) => modules.includes(m);
  const duties = [];
  const warnings = [];

  if (has('pos')) {
    duties.push(mode === 'DIRECT' ? 'Vende y cobra en el Punto de Venta.' : 'Arma los pedidos en el Punto de Venta y los envía a caja.');
    if (mode === 'DIRECT' && !has('caja')) warnings.push('Sin "Arqueo de Caja" no podrá abrir su turno ni cobrar en el Punto de Venta.');
  }
  if (has('caja')) {
    duties.push(mode === 'DIRECT' ? 'Abre y cierra su caja (arqueo).' : 'Cobra los pedidos en "Por cobrar" y hace el arqueo de su caja.');
  }
  const dispatchWork = mode === 'STAGED' || (deliveriesEnabled && branch?.deliveriesEnabled !== false);
  if (dispatchWork && (has('despacho') || has(dispatchRoleModule(branch)))) {
    duties.push(mode === 'STAGED'
      ? 'Despacha lo cobrado en "Por despachar" (entrega al cliente o al repartidor).'
      : 'Despacha los envíos a domicilio: prepara los productos y se los entrega al repartidor.');
  }
  if (has('deliveries')) duties.push('Reparte los envíos a domicilio (Entregas).');
  if (has('inventory') || has('categories')) duties.push('Administra productos y categorías.');
  if (has('kardex')) duties.push('Registra entradas y salidas manuales de stock (Kardex).');
  if (has('compras')) duties.push('Registra las compras a proveedores.');
  if (has('cotizaciones')) duties.push('Hace cotizaciones.');
  if (has('client-dir') || has('customers')) duties.push('Atiende clientes y créditos.');
  if (has('dashboard')) duties.push('Ve reportes y finanzas.');
  if (has('personal')) duties.push('Administra al personal.');
  if (has('despacho') && effectiveDispatchRole(branch) !== 'WAREHOUSE' && !dispatchWork) {
    warnings.push('Esta sucursal no tiene envíos a domicilio ni trabaja por etapas: "Por despachar" no aparecerá.');
  }
  return { duties, warnings };
}
