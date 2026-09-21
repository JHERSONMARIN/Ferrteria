#!/usr/bin/env bash
# Aplica un estilo visual (color principal y color del menú) a una empresa.
# Los estilos son los de backend/src/config/themes.json, los mismos que ve la empresa en su Configuración.
#
#   Uso: deploy/set-theme.sh <identificador-empresa> <estilo>
#   Ej.: deploy/set-theme.sh ferreteriax azul
#   Con "fabrica" como estilo, la empresa vuelve al estilo por defecto del sistema.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
THEMES_FILE="$DEPLOY_DIR/../backend/src/config/themes.json"

fail() { echo "❌ $*" >&2; exit 1; }

[ $# -eq 2 ] || fail "Uso: $0 <identificador-empresa> <estilo>"
SLUG="$1"
ESTILO="$2"
CONTAINER="ferresys-$SLUG-backend-1"

[ -f "$DEPLOY_DIR/companies/$SLUG/.env" ] || fail "No existe la empresa '$SLUG'."
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || fail "La instancia de '$SLUG' no está corriendo (contenedor $CONTAINER)."

# El catálogo se lee con node para no duplicarlo en bash.
RESUELTO=$(node -e '
  const fs = require("fs");
  const { estilos } = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const id = process.argv[2];
  if (id === "fabrica") { console.log("||Estilo de fábrica"); process.exit(0); }
  const estilo = estilos[id];
  if (!estilo) { console.error(`Estilo desconocido. Disponibles: ${Object.keys(estilos).join(", ")}, fabrica`); process.exit(1); }
  console.log([estilo.primaryColor, estilo.navColor, estilo.nombre].join("|"));
' "$THEMES_FILE" "$ESTILO") || fail "No se pudo resolver el estilo."

IFS='|' read -r PRIMARY NAV NOMBRE <<< "$RESUELTO"

# Se guarda en la configuración de la empresa; sus pantallas lo toman en la siguiente carga.
docker exec -e ESTILO_PRIMARY="$PRIMARY" -e ESTILO_NAV="$NAV" "$CONTAINER" \
  node --input-type=module -e "
    import { prisma } from '/app/src/db.js';
    const { count } = await prisma.businessSettings.updateMany({
      where: { id: 1 },
      data: {
        primaryColor: process.env.ESTILO_PRIMARY || null,
        navColor: process.env.ESTILO_NAV || null,
      },
    });
    if (count === 0) { console.error('La empresa todavía no tiene configuración creada.'); process.exit(2); }
    await prisma.\$disconnect();
  " || fail "No se pudo aplicar el estilo a '$SLUG'."

cat <<INFO
✅ Estilo aplicado
   Empresa:  $SLUG
   Estilo:   $NOMBRE
   Colores:  principal ${PRIMARY:-por defecto} · menú ${NAV:-por defecto}
   Quienes tengan la pantalla abierta lo verán al recargar.
INFO
