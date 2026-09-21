#!/usr/bin/env bash
# Aplica un plan a una empresa: módulos, funciones, límites, conexiones y vencimiento.
#
#   Uso: deploy/set-plan.sh <identificador> <basico|profesional|empresa> [--extra sunat,envios] [--vence AAAA-MM-DD]
#   Ej.: deploy/set-plan.sh ferreteriax profesional --vence 2027-03-31
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPANY_COMPOSE="$DEPLOY_DIR/company/docker-compose.yml"
PLANS_FILE="$DEPLOY_DIR/plans.json"

fail() { echo "❌ $*" >&2; exit 1; }
# 0 = sin límite.
limite() { [ "$1" = "0" ] && echo "sin límite" || echo "$1"; }

[ $# -ge 2 ] || fail "Uso: $0 <identificador> <plan> [--extra a,b] [--vence AAAA-MM-DD]"
SLUG="$1"; PLAN="$2"; shift 2
EXTRAS=""; EXPIRES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --extra) EXTRAS="${2:-}"; shift 2 ;;
    --vence) EXPIRES="${2:-}"; shift 2 ;;
    *) fail "Opción desconocida: $1" ;;
  esac
done

COMPANY_ENV="$DEPLOY_DIR/companies/$SLUG/.env"
[ -f "$COMPANY_ENV" ] || fail "No existe la empresa '$SLUG'."
[ -z "$EXPIRES" ] || [[ "$EXPIRES" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail "Fecha inválida: use AAAA-MM-DD."

# El catálogo de planes se lee con node para no duplicarlo en bash.
RESUELTO=$(node -e '
  const fs = require("fs");
  const { planes, adicionales } = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const plan = planes[process.argv[2]];
  if (!plan) { console.error(`Plan desconocido. Disponibles: ${Object.keys(planes).join(", ")}`); process.exit(1); }
  const modules = new Set(plan.modules);
  const features = new Set(plan.features);
  for (const extra of (process.argv[3] || "").split(",").map(e => e.trim()).filter(Boolean)) {
    const add = adicionales[extra];
    if (!add) { console.error(`Adicional desconocido: ${extra}. Disponibles: ${Object.keys(adicionales).join(", ")}`); process.exit(1); }
    (add.modules || []).forEach(m => modules.add(m));
    (add.features || []).forEach(f => features.add(f));
  }
  const l = plan.limits;
  console.log([
    [...modules].join(","), [...features].join(","),
    l.maxUsers, l.maxBranches, l.maxCashRegisters, plan.connectionLimit, plan.nombre,
  ].join("|"));
' "$PLANS_FILE" "$PLAN" "$EXTRAS") || fail "No se pudo resolver el plan."

IFS='|' read -r MODULES FEATURES MAX_USERS MAX_BRANCHES MAX_CAJAS CONNECTIONS PLAN_NOMBRE <<< "$RESUELTO"

set_var() { # set_var CLAVE valor
  if grep -q "^$1=" "$COMPANY_ENV"; then
    sed -i "s|^$1=.*|$1=$2|" "$COMPANY_ENV"
  else
    echo "$1=$2" >> "$COMPANY_ENV"
  fi
}

set_var PLAN "$PLAN"
set_var LICENSED_MODULES "$MODULES"
set_var LICENSED_FEATURES "$FEATURES"
set_var MAX_USERS "$MAX_USERS"
set_var MAX_BRANCHES "$MAX_BRANCHES"
set_var MAX_CASH_REGISTERS "$MAX_CAJAS"
set_var LICENSE_EXPIRES_AT "$EXPIRES"
# Conexiones a la base según el plan (dentro del DATABASE_URL).
sed -i "s|connection_limit=[0-9]*|connection_limit=$CONNECTIONS|" "$COMPANY_ENV"

echo "▶ Aplicando y reiniciando la instancia…"
docker compose -p "ferresys-$SLUG" -f "$COMPANY_COMPOSE" --env-file "$COMPANY_ENV" up -d >/dev/null 2>&1

cat <<INFO
✅ Plan de '$SLUG': $PLAN_NOMBRE${EXTRAS:+ + $EXTRAS}
   Módulos:     $MODULES
   Funciones:   ${FEATURES:-ninguna}
   Límites:     usuarios $(limite "$MAX_USERS") · sucursales $(limite "$MAX_BRANCHES") · cajas $(limite "$MAX_CAJAS")
   Conexiones:  $CONNECTIONS
   Vence:       ${EXPIRES:-sin vencimiento}
INFO
