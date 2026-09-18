#!/usr/bin/env bash
# Crea una empresa nueva: base de datos limpia, usuario de BD propio, archivo .env e instancia.
#
#   Uso: deploy/create-company.sh <identificador> "<Razón social>" <puerto_web>
#   Ej.: deploy/create-company.sh ferreteriax "Ferretería X S.A.C." 5301
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_ENV="$DEPLOY_DIR/infra/.env"
INFRA_COMPOSE="$DEPLOY_DIR/infra/docker-compose.yml"
COMPANY_COMPOSE="$DEPLOY_DIR/company/docker-compose.yml"
DB_CONTAINER="ferresys-infra-db"

fail() { echo "❌ $*" >&2; exit 1; }
random_secret() { openssl rand -hex "$1"; }

[ $# -eq 3 ] || fail "Uso: $0 <identificador> \"<Razón social>\" <puerto_web>"
SLUG="$1"
COMPANY_NAME="$2"
WEB_PORT="$3"

[[ "$SLUG" =~ ^[a-z][a-z0-9-]{1,30}$ ]] || fail "Identificador inválido: use minúsculas, números y guiones (2 a 31 caracteres, empieza con letra)."
[[ "$WEB_PORT" =~ ^[0-9]{2,5}$ ]] && [ "$WEB_PORT" -ge 1024 ] && [ "$WEB_PORT" -le 65535 ] || fail "Puerto inválido: use un número entre 1024 y 65535."
[ -n "${COMPANY_NAME// }" ] || fail "La razón social no puede estar vacía."
[[ "$COMPANY_NAME" != *\"* && "$COMPANY_NAME" != *'$'* && "$COMPANY_NAME" != *\\* ]] || fail "La razón social no puede contener comillas dobles, \$ ni barras invertidas."

COMPANY_DIR="$DEPLOY_DIR/companies/$SLUG"
COMPANY_ENV="$COMPANY_DIR/.env"
PROJECT="ferresys-$SLUG"
DB_NAME="ferresys_${SLUG//-/_}"
DB_USER="$DB_NAME"

[ ! -e "$COMPANY_DIR" ] || fail "La empresa '$SLUG' ya existe ($COMPANY_DIR)."
if grep -rqs "^WEB_PORT=$WEB_PORT$" "$DEPLOY_DIR"/companies/*/.env; then
  fail "El puerto $WEB_PORT ya está asignado a otra empresa."
fi
if ss -ltn "sport = :$WEB_PORT" 2>/dev/null | grep -q LISTEN; then
  fail "El puerto $WEB_PORT ya está en uso en este equipo."
fi

# 1. PostgreSQL compartido (se crea la primera vez con una clave de administrador aleatoria).
if [ ! -f "$INFRA_ENV" ]; then
  echo "▶ Primera empresa: preparando el PostgreSQL compartido…"
  umask 077
  printf 'POSTGRES_ADMIN_USER=ferresys_admin\nPOSTGRES_ADMIN_PASSWORD=%s\n' "$(random_secret 24)" > "$INFRA_ENV"
fi
set -a; . "$INFRA_ENV"; set +a
docker compose -f "$INFRA_COMPOSE" --env-file "$INFRA_ENV" up -d --wait >/dev/null

psql_admin() { docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_ADMIN_USER" -d postgres "$@"; }

if [ "$(psql_admin -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")" = "1" ]; then
  fail "La base de datos $DB_NAME ya existe. Elija otro identificador o elimine la anterior."
fi

# 2. Base de datos vacía con un usuario que solo puede entrar a ella.
echo "▶ Creando base de datos $DB_NAME…"
DB_PASSWORD="$(random_secret 24)"
psql_admin <<SQL
CREATE ROLE "$DB_USER" LOGIN PASSWORD '$DB_PASSWORD';
CREATE DATABASE "$DB_NAME" OWNER "$DB_USER";
REVOKE ALL ON DATABASE "$DB_NAME" FROM PUBLIC;
SQL

# 3. Configuración de la empresa (contiene claves: permisos solo para el dueño).
ADMIN_PASSWORD="$(random_secret 6)"
umask 077
mkdir -p "$COMPANY_DIR"
cat > "$COMPANY_ENV" <<ENV
COMPANY_NAME="$COMPANY_NAME"
WEB_PORT=$WEB_PORT
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@$DB_CONTAINER:5432/$DB_NAME?schema=public&connection_limit=5
DEMO_MODE=false
LICENSED_MODULES=
JWT_SECRET=$(random_secret 32)
INITIAL_ADMIN_USER=admin
INITIAL_ADMIN_PASSWORD=$ADMIN_PASSWORD
ENV
chmod 600 "$COMPANY_ENV"

# 4. Instancia: al arrancar aplica migraciones y crea la configuración y el administrador.
echo "▶ Levantando la instancia $PROJECT (la primera vez construye las imágenes)…"
docker compose -p "$PROJECT" -f "$COMPANY_COMPOSE" --env-file "$COMPANY_ENV" up -d --build >/dev/null

echo -n "▶ Esperando que responda"
for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:$WEB_PORT/api/health" >/dev/null; then READY=1; break; fi
  echo -n "."; sleep 2
done
echo
[ "${READY:-0}" = "1" ] || fail "La instancia no respondió. Revise: docker compose -p $PROJECT logs backend"

# La clave inicial ya se usó para crear el administrador: no se deja guardada en disco.
sed -i '/^INITIAL_ADMIN_PASSWORD=/d' "$COMPANY_ENV"

cat <<INFO

✅ Empresa creada: $COMPANY_NAME
   URL:         http://127.0.0.1:$WEB_PORT
   Usuario:     admin
   Contraseña:  $ADMIN_PASSWORD   (anótela: no se vuelve a mostrar)
   Base datos:  $DB_NAME
   Config.:     $COMPANY_ENV
INFO
