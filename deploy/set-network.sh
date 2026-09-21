#!/usr/bin/env bash
# Decide quién puede abrir FerreSys en este equipo.
#
#   deploy/set-network.sh red     → la consola y las empresas quedan visibles en la red local
#                                   (cualquier equipo de la misma red entra con la IP de esta máquina)
#   deploy/set-network.sh local   → solo se abren desde este equipo (127.0.0.1)
#   deploy/set-network.sh estado  → muestra cómo está cada una y con qué direcciones entrar
#
# No hace falta volver a correrlo al cambiar de red (casa, trabajo): al quedar "en red", el sistema
# escucha en todas las direcciones del equipo, sea cual sea la IP que le toque.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPANY_COMPOSE="$DEPLOY_DIR/company/docker-compose.yml"
PLATFORM_COMPOSE="$DEPLOY_DIR/platform/docker-compose.yml"
PLATFORM_ENV="$DEPLOY_DIR/platform/.env"

fail() { echo "❌ $*" >&2; exit 1; }

MODO="${1:-estado}"
case "$MODO" in red|local|estado) ;; *) fail "Uso: $0 <red|local|estado>" ;; esac

# Direcciones del equipo en la red (sin la interna de Docker).
ips() { ip -4 -o addr show scope global 2>/dev/null | awk '{split($4,a,"/"); print a[1]}' | grep -v '^172\.1[7-9]\.\|^172\.2[0-9]\.\|^172\.3[0-1]\.' || true; }

set_var() { # set_var archivo CLAVE valor
  if grep -q "^$2=" "$1"; then
    sed -i "s|^$2=.*|$2=$3|" "$1"
  else
    echo "$2=$3" >> "$1"
  fi
}

leer_var() { grep -m1 "^$2=" "$1" 2>/dev/null | cut -d= -f2- || true; }

empresas() { ls -1 "$DEPLOY_DIR/companies" 2>/dev/null || true; }

if [ "$MODO" = "estado" ]; then
  CONSOLA_BIND="$(leer_var "$PLATFORM_ENV" CONSOLE_BIND)"
  CONSOLA_PUERTO="$(leer_var "$PLATFORM_ENV" CONSOLE_PORT)"
  echo "Consola de VALETEC: ${CONSOLA_BIND:-127.0.0.1}:${CONSOLA_PUERTO:-4000}"
  for slug in $(empresas); do
    ENV_EMPRESA="$DEPLOY_DIR/companies/$slug/.env"
    echo "  $slug: $(leer_var "$ENV_EMPRESA" WEB_BIND | grep . || echo 127.0.0.1):$(leer_var "$ENV_EMPRESA" WEB_PORT)"
  done
  echo
  echo "Direcciones de este equipo: $(ips | tr '\n' ' ')"
  exit 0
fi

BIND=$([ "$MODO" = "red" ] && echo "0.0.0.0" || echo "127.0.0.1")

echo "▶ Consola de VALETEC…"
set_var "$PLATFORM_ENV" CONSOLE_BIND "$BIND"
docker compose -f "$PLATFORM_COMPOSE" --env-file "$PLATFORM_ENV" up -d >/dev/null 2>&1 || fail "No se pudo reiniciar la consola."

for slug in $(empresas); do
  ENV_EMPRESA="$DEPLOY_DIR/companies/$slug/.env"
  [ -f "$ENV_EMPRESA" ] || continue
  echo "▶ Empresa $slug…"
  set_var "$ENV_EMPRESA" WEB_BIND "$BIND"
  docker compose -p "ferresys-$slug" -f "$COMPANY_COMPOSE" --env-file "$ENV_EMPRESA" up -d >/dev/null 2>&1 \
    || echo "  ⚠ no se pudo reiniciar $slug (¿está suspendida?)"
done

echo
if [ "$MODO" = "local" ]; then
  echo "✅ Todo queda solo para este equipo (127.0.0.1)."
  exit 0
fi

CONSOLA_PUERTO="$(leer_var "$PLATFORM_ENV" CONSOLE_PORT)"
echo "✅ Visible en la red. Sus compañeros entran con la IP de este equipo:"
for ip in $(ips); do
  echo
  echo "   Consola de VALETEC:  http://$ip:${CONSOLA_PUERTO:-4000}"
  for slug in $(empresas); do
    PUERTO="$(leer_var "$DEPLOY_DIR/companies/$slug/.env" WEB_PORT)"
    [ -n "$PUERTO" ] && echo "   $slug:  http://$ip:$PUERTO"
  done
done
cat <<'NOTA'

Si desde otro equipo no carga:
  · Compruebe que ambos están en la misma red (y que no es una red de "invitados",
    que suele aislar los equipos entre sí).
  · Cortafuegos de este equipo: con ufw, permita los puertos, por ejemplo
      sudo ufw allow 4000/tcp && sudo ufw allow 5301:5399/tcp
  · La IP de este equipo cambia de una red a otra: vuelva a correr
      deploy/set-network.sh estado
    para ver la dirección actual. Para que no cambie, reserve la IP en el router.
NOTA
