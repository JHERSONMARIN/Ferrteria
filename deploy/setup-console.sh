#!/usr/bin/env bash
# Prepara la consola de VALETEC: base de datos propia, archivo .env y puesta en marcha.
# Es seguro repetirlo: no vuelve a crear la base si ya existe.
#
#   Uso: deploy/setup-console.sh [puerto] [local|red]
#   En Windows se corre desde Git Bash, con Docker Desktop abierto.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
# En Git Bash, "pwd -W" da la ruta con letra de unidad (C:/...), que es la que entiende Docker Desktop.
REPO_DIR="$(cd "$DEPLOY_DIR/.." && { pwd -W 2>/dev/null || pwd; })"
INFRA_ENV="$DEPLOY_DIR/infra/.env"
INFRA_COMPOSE="$DEPLOY_DIR/infra/docker-compose.yml"
PLATFORM_COMPOSE="$DEPLOY_DIR/platform/docker-compose.yml"
PLATFORM_ENV="$DEPLOY_DIR/platform/.env"
DB_CONTAINER="ferresys-infra-db"
DB_NAME="ferresys_control"
PORT="${1:-23000}"
case "${2:-local}" in
  local) BIND=127.0.0.1 ;;
  red)   BIND=0.0.0.0 ;;
  *)     echo "❌ Uso: $0 [puerto] [local|red]" >&2; exit 1 ;;
esac

fail() { echo "❌ $*" >&2; exit 1; }
random_secret() { openssl rand -hex "$1"; }

# PostgreSQL compartido (el mismo de las empresas).
if [ ! -f "$INFRA_ENV" ]; then
  umask 077
  printf 'POSTGRES_ADMIN_USER=ferresys_admin\nPOSTGRES_ADMIN_PASSWORD=%s\n' "$(random_secret 24)" > "$INFRA_ENV"
fi
set -a; . "$INFRA_ENV"; set +a
docker compose -f "$INFRA_COMPOSE" --env-file "$INFRA_ENV" up -d --wait >/dev/null

psql_admin() { docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_ADMIN_USER" -d postgres "$@"; }

if [ ! -f "$PLATFORM_ENV" ]; then
  [ "$(psql_admin -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")" = "1" ] \
    && fail "La base $DB_NAME ya existe pero falta $PLATFORM_ENV. Restaure ese archivo o elimine la base."

  echo "▶ Creando la base de la consola…"
  DB_PASSWORD="$(random_secret 24)"
  psql_admin <<SQL
CREATE ROLE "$DB_NAME" LOGIN PASSWORD '$DB_PASSWORD';
CREATE DATABASE "$DB_NAME" OWNER "$DB_NAME";
REVOKE ALL ON DATABASE "$DB_NAME" FROM PUBLIC;
SQL

  ADMIN_PASSWORD="$(random_secret 6)"
  umask 077
  cat > "$PLATFORM_ENV" <<ENV
REPO_DIR=$REPO_DIR
CONSOLE_PORT=$PORT
CONSOLE_BIND=$BIND
CONSOLE_DATABASE_URL=postgresql://$DB_NAME:$DB_PASSWORD@$DB_CONTAINER:5432/$DB_NAME?schema=public&connection_limit=5
CONSOLE_JWT_SECRET=$(random_secret 32)
CONSOLE_ADMIN_USER=valetec
CONSOLE_ADMIN_PASSWORD=$ADMIN_PASSWORD
COOKIE_SECURE=false
ENV
  chmod 600 "$PLATFORM_ENV"
  NUEVA=1
fi

echo "▶ Levantando la consola (la primera vez construye la imagen)…"
docker compose -f "$PLATFORM_COMPOSE" --env-file "$PLATFORM_ENV" up -d --build >/dev/null

set -a; . "$PLATFORM_ENV"; set +a
echo -n "▶ Esperando que responda"
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$CONSOLE_PORT/api/health" >/dev/null; then READY=1; break; fi
  echo -n "."; sleep 2
done
echo
[ "${READY:-0}" = "1" ] || fail "La consola no respondió. Revise: docker logs ferresys-console"

cat <<INFO

✅ Consola de VALETEC lista
   URL:       http://127.0.0.1:$CONSOLE_PORT
   Usuario:   $CONSOLE_ADMIN_USER
INFO
if [ "${NUEVA:-0}" = "1" ]; then
  echo "   Contraseña: $CONSOLE_ADMIN_PASSWORD   (temporal: se pedirá cambiarla al ingresar)"
  echo "   Config.:    $PLATFORM_ENV"
fi
