#!/usr/bin/env bash
# Define los módulos contratados por una empresa y reinicia su instancia.
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

if grep -q '^LICENSED_MODULES=' "$COMPANY_ENV"; then
  sed -i "s/^LICENSED_MODULES=.*/LICENSED_MODULES=$VALUE/" "$COMPANY_ENV"
else
  echo "LICENSED_MODULES=$VALUE" >> "$COMPANY_ENV"
fi

echo "▶ Aplicando y reiniciando la instancia…"
docker compose -p "ferresys-$SLUG" -f "$COMPANY_COMPOSE" --env-file "$COMPANY_ENV" up -d >/dev/null 2>&1

echo "✅ Módulos contratados de '$SLUG': ${VALUE:-todos} (personal siempre incluido)"
