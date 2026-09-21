#!/usr/bin/env bash
# Define los módulos de una empresa y reinicia su instancia.
# Los módulos los administra VALETEC: la empresa ya no los activa ni desactiva desde su Configuración.
# Además de la licencia (.env), deja la configuración de la empresa con esos mismos módulos activos.
#
#   Uso: deploy/set-modules.sh <identificador> <módulos separados por coma | todos>
#   Ej.: deploy/set-modules.sh ferreteriax pos,caja,inventory,categories
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPANY_COMPOSE="$DEPLOY_DIR/company/docker-compose.yml"
MODULES_FILE="$DEPLOY_DIR/../backend/src/config/modules.js"

fail() { echo "❌ $*" >&2; exit 1; }

[ $# -eq 2 ] || fail "Uso: $0 <identificador> <módulos separados por coma | todos>"
SLUG="$1"
REQUESTED="${2// /}"
COMPANY_ENV="$DEPLOY_DIR/companies/$SLUG/.env"
[ -f "$COMPANY_ENV" ] || fail "No existe la empresa '$SLUG'."

# Lista oficial de módulos, tomada del backend para no duplicarla aquí.
AVAILABLE=$(sed -n '/AVAILABLE_MODULES = \[/,/\];/p' "$MODULES_FILE" | grep -o "'[^']*'" | tr -d "'" | tr '\n' ' ')

if [ "$REQUESTED" = "todos" ]; then
  VALUE=""
else
  IFS=',' read -ra ITEMS <<< "$REQUESTED"
  [ ${#ITEMS[@]} -gt 0 ] || fail "Indique al menos un módulo."
  for module in "${ITEMS[@]}"; do
    [[ " $AVAILABLE " == *" $module "* ]] || fail "Módulo desconocido: '$module'. Disponibles: $AVAILABLE"
  done
  VALUE="$REQUESTED"
fi

CONTAINER="ferresys-$SLUG-backend-1"

# Se comprueba en la instancia que está corriendo, ANTES de tocar la licencia: si un módulo no se
# puede quitar (por el modo de trabajo de alguna sucursal), no se cambia nada.
modulos_en_la_empresa() { # modulos_en_la_empresa <verificar|aplicar>
  docker exec -e MODULOS="$VALUE" -e ACCION="$1" "$CONTAINER" node --input-type=module -e "
    import { prisma } from '/app/src/db.js';
    import { AVAILABLE_MODULES, ALWAYS_ENABLED_MODULES } from '/app/src/config/modules.js';
    const pedidos = (process.env.MODULOS || '').split(',').map(m => m.trim()).filter(Boolean);
    const licencia = pedidos.length > 0 ? pedidos : AVAILABLE_MODULES;
    const activos = AVAILABLE_MODULES.filter(m => licencia.includes(m) || ALWAYS_ENABLED_MODULES.includes(m));

    // Una sucursal con pedidos necesita Caja; una por etapas, además Despacho.
    const modos = (await prisma.branch.findMany({ where: { active: true }, select: { saleFlowMode: true } })).map(b => b.saleFlowMode);
    if (!activos.includes('caja') && modos.some(m => m !== 'DIRECT')) {
      console.error('Hay sucursales que trabajan con pedidos: el módulo Arqueo de Caja no se puede quitar.');
      process.exit(2);
    }
    if (!activos.includes('despacho') && modos.includes('STAGED')) {
      console.error('Hay sucursales que trabajan por etapas: el módulo Despacho no se puede quitar.');
      process.exit(2);
    }
    if (process.env.ACCION === 'aplicar') {
      await prisma.businessSettings.updateMany({ where: { id: 1 }, data: { enabledModules: activos } });
    }
    await prisma.\$disconnect();
  "
}

docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || fail "La instancia de '$SLUG' no está corriendo (contenedor $CONTAINER)."
modulos_en_la_empresa verificar || fail "No se cambió nada."

if grep -q '^LICENSED_MODULES=' "$COMPANY_ENV"; then
  sed -i "s/^LICENSED_MODULES=.*/LICENSED_MODULES=$VALUE/" "$COMPANY_ENV"
else
  echo "LICENSED_MODULES=$VALUE" >> "$COMPANY_ENV"
fi

echo "▶ Aplicando y reiniciando la instancia…"
docker compose -p "ferresys-$SLUG" -f "$COMPANY_COMPOSE" --env-file "$COMPANY_ENV" up -d >/dev/null 2>&1

# La empresa ve lo que VALETEC le deja: se activan en su configuración los módulos de la licencia.
echo -n "▶ Esperando la instancia"
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then LISTA=1; break; fi
  echo -n "."; sleep 2
done
echo
[ "${LISTA:-0}" = "1" ] || fail "La instancia no respondió; revise: docker compose -p ferresys-$SLUG logs backend"
modulos_en_la_empresa aplicar || fail "No se pudieron activar los módulos en la configuración de '$SLUG'."

echo "✅ Módulos de '$SLUG': ${VALUE:-todos} (personal siempre incluido)"
