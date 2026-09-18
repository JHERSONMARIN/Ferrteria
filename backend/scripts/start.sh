#!/bin/sh
# Arranque del contenedor: migraciones, datos de demo (opcional), preparación inicial y servidor.
set -e

node scripts/migrate.js

# El seed va antes que el bootstrap: si crea los usuarios demo, el bootstrap no crea otro admin.
if [ "$DEMO_MODE" = "true" ]; then
  node prisma/seed.js
fi

node scripts/bootstrap.js
node scripts/hash-legacy-passwords.js

exec node server.js
