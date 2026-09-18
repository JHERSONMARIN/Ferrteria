#!/usr/bin/env bash
# Da de baja una empresa: respalda su base de datos, detiene su instancia y elimina la base.
#
#   Uso: deploy/remove-company.sh <identificador>
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_ENV="$DEPLOY_DIR/infra/.env"
COMPANY_COMPOSE="$DEPLOY_DIR/company/docker-compose.yml"
BACKUP_DIR="$DEPLOY_DIR/backups"
DB_CONTAINER="ferresys-infra-db"

fail() { echo "❌ $*" >&2; exit 1; }

[ $# -eq 1 ] || fail "Uso: $0 <identificador>"
SLUG="$1"
COMPANY_DIR="$DEPLOY_DIR/companies/$SLUG"
COMPANY_ENV="$COMPANY_DIR/.env"
PROJECT="ferresys-$SLUG"
DB_NAME="ferresys_${SLUG//-/_}"

[ -f "$COMPANY_ENV" ] || fail "No existe la empresa '$SLUG'."
set -a; . "$INFRA_ENV"; set +a

echo "Se eliminará la empresa '$SLUG' (base de datos $DB_NAME). Antes se hará un respaldo."
read -r -p "Escriba el identificador para confirmar: " CONFIRMATION
[ "$CONFIRMATION" = "$SLUG" ] || fail "Confirmación incorrecta. No se eliminó nada."

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/$SLUG-$(date +%Y%m%d-%H%M%S).sql.gz"
echo "▶ Respaldando en $BACKUP_FILE…"
docker exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_ADMIN_USER" --no-owner "$DB_NAME" | gzip > "$BACKUP_FILE"
[ -s "$BACKUP_FILE" ] || fail "El respaldo quedó vacío; no se eliminó nada."

echo "▶ Deteniendo la instancia…"
docker compose -p "$PROJECT" -f "$COMPANY_COMPOSE" --env-file "$COMPANY_ENV" down >/dev/null

echo "▶ Eliminando base de datos y usuario…"
docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_ADMIN_USER" -d postgres <<SQL
DROP DATABASE IF EXISTS "$DB_NAME" WITH (FORCE);
DROP ROLE IF EXISTS "$DB_NAME";
SQL

rm -rf "$COMPANY_DIR"
echo "✅ Empresa '$SLUG' eliminada. Respaldo: $BACKUP_FILE"
