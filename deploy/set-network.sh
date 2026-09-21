#!/usr/bin/env bash
# Decide quién puede abrir FerreSys en este equipo.
#
#   deploy/set-network.sh red     → la consola y las empresas quedan visibles en la red local
#                                   (cualquier equipo de la misma red entra con la IP de esta máquina)
#   deploy/set-network.sh local   → solo se abren desde este equipo (127.0.0.1)
#   deploy/set-network.sh estado  → muestra cómo está cada una y con qué direcciones entrar
#
# Además del "binding", hace falta que el cortafuegos deje entrar: el script abre (o cierra) los
# puertos en ufw o firewalld. Eso pide contraseña de administrador; si no la da, se lo indica.
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

# Puertos que usa FerreSys: el de la consola y el de cada empresa.
puertos() {
  leer_var "$PLATFORM_ENV" CONSOLE_PORT | grep . || echo 4000
  for slug in $(empresas); do leer_var "$DEPLOY_DIR/companies/$slug/.env" WEB_PORT; done
}

cortafuegos_activo() { systemctl is-active --quiet "$1" 2>/dev/null; }

# ¿Está abierto el puerto en ufw? (necesita poder consultar el estado).
ufw_abierto() { sudo ufw status 2>/dev/null | grep -qE "^$1(/tcp)?[[:space:]]+ALLOW"; }

# Comandos que hacen falta para abrir (o cerrar) los puertos. Se imprimen para copiar y pegar.
comandos_cortafuegos() { # comandos_cortafuegos <abrir|cerrar>
  for puerto in $(puertos); do
    if cortafuegos_activo ufw; then
      if [ "$1" = "abrir" ]; then
        # Dos reglas por puerto: la entrada al equipo y el paso hacia el contenedor de Docker,
        # que es por donde entra de verdad el tráfico que viene de otros equipos.
        echo "sudo ufw allow $puerto/tcp"
        echo "sudo ufw route allow proto tcp from any to any port $puerto"
      else
        echo "sudo ufw delete allow $puerto/tcp"
        echo "sudo ufw route delete allow proto tcp from any to any port $puerto"
      fi
    else
      [ "$1" = "abrir" ] && echo "sudo firewall-cmd --permanent --add-port=$puerto/tcp" \
                         || echo "sudo firewall-cmd --permanent --remove-port=$puerto/tcp"
    fi
  done
  cortafuegos_activo firewalld && echo "sudo firewall-cmd --reload"
  return 0
}

# Abre o cierra los puertos. Pide la contraseña de administrador; si no puede, deja los comandos
# escritos. Nunca da por hecho que funcionó: lo comprueba.
cortafuegos() { # cortafuegos <abrir|cerrar>
  local accion="$1"
  cortafuegos_activo ufw || cortafuegos_activo firewalld || return 0

  echo "▶ Cortafuegos ($(cortafuegos_activo ufw && echo ufw || echo firewalld))…"
  comandos_cortafuegos "$accion" | while read -r comando; do
    $comando >/dev/null 2>&1 || true
  done

  # Comprobación: solo se da por bueno lo que se puede verificar.
  local pendientes=""
  if cortafuegos_activo ufw; then
    for puerto in $(puertos); do
      ufw_abierto "$puerto" || pendientes="$pendientes $puerto"
    done
  fi
  [ "$accion" = "cerrar" ] && return 0

  if [ -n "$pendientes" ]; then
    cat <<AVISO

⚠ El cortafuegos sigue cerrado para:$pendientes
  Desde otros equipos no va a cargar hasta abrirlo. Copie y pegue esto en una terminal
  (pide su contraseña):

AVISO
    comandos_cortafuegos abrir | sed 's/^/      /'
    echo
  else
    echo "  ✓ puertos abiertos: $(puertos | tr '\n' ' ')"
  fi
}

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
  if cortafuegos_activo ufw; then
    echo -n "Cortafuegos: ufw activo; puertos"
    for puerto in $(puertos); do
      ufw_abierto "$puerto" && echo -n " $puerto:abierto" || echo -n " $puerto:cerrado"
    done
    echo
  elif cortafuegos_activo firewalld; then
    echo "Cortafuegos: firewalld activo ('sudo firewall-cmd --list-ports' para verlo)."
  else
    echo "Cortafuegos: ninguno activo."
  fi
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

cortafuegos "$([ "$MODO" = "red" ] && echo abrir || echo cerrar)"

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
  · Cortafuegos de este equipo: si arriba quedó el aviso de que no se pudo tocar,
    ejecute los comandos que imprimió (piden contraseña de administrador).
  · La IP de este equipo cambia de una red a otra: vuelva a correr
      deploy/set-network.sh estado
    para ver la dirección actual. Para que no cambie, reserve la IP en el router.
NOTA
