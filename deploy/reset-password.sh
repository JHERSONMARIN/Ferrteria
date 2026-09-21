#!/usr/bin/env bash
# Asigna una contraseña temporal a un usuario de una empresa (se le pedirá cambiarla al ingresar).
# Sirve, por ejemplo, cuando el administrador de una empresa olvidó su clave.
#
#   Uso: deploy/reset-password.sh <identificador-empresa> <usuario>
#   Ej.: deploy/reset-password.sh ferreteriax admin
set -euo pipefail

fail() { echo "❌ $*" >&2; exit 1; }

[ $# -eq 2 ] || fail "Uso: $0 <identificador-empresa> <usuario>"
SLUG="$1"
USERNAME="$2"
CONTAINER="ferresys-$SLUG-backend-1"

docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || fail "La instancia de '$SLUG' no está corriendo (contenedor $CONTAINER)."

TEMP_PASSWORD="$(openssl rand -hex 6)"

# Se ejecuta dentro del backend de la empresa para usar el mismo hash que la aplicación.
docker exec -e TARGET_USER="$USERNAME" -e TEMP_PASSWORD="$TEMP_PASSWORD" "$CONTAINER" \
  node --input-type=module -e "
    import { prisma } from '/app/src/db.js';
    import { hashPassword } from '/app/src/services/passwords.js';
    const user = await prisma.usuario.findUnique({ where: { user: process.env.TARGET_USER } });
    if (!user) { console.error('El usuario no existe en esta empresa.'); process.exit(2); }
    await prisma.usuario.update({
      where: { id: user.id },
      data: { pass: await hashPassword(process.env.TEMP_PASSWORD), mustChangePassword: true },
    });
    await prisma.\$disconnect();
  " || fail "No se pudo restablecer la contraseña de '$USERNAME'."

cat <<INFO
✅ Contraseña restablecida
   Empresa:     $SLUG
   Usuario:     $USERNAME
   Contraseña:  $TEMP_PASSWORD   (temporal: se pedirá cambiarla al ingresar)
   Si el usuario estaba bloqueado por intentos fallidos, espere 15 minutos
   o reinicie la instancia: docker restart $CONTAINER
INFO
