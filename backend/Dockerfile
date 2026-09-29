# Se construye desde la raíz del repositorio (usa packages/shared): ver backend/Dockerfile.dockerignore.
# Node 22: ejecuta TypeScript directamente (sin paso de compilación; ver backend/tsconfig.json).
FROM node:22-alpine

WORKDIR /app/backend

RUN apk add --no-cache openssl

# Piezas comunes con la consola: el package.json las enlaza con "file:../packages/shared".
COPY packages/shared /app/packages/shared

COPY backend/package*.json ./
COPY backend/prisma ./prisma/

RUN npm install

COPY backend/ .

RUN npx prisma generate

# Versión de esta imagen: el commit lo pasa quien construye (deploy/version.sh) y la fecha se toma aquí.
ARG APP_COMMIT=""
ENV APP_COMMIT=$APP_COMMIT
RUN date -u +%Y-%m-%dT%H:%M:%SZ > BUILT_AT

EXPOSE 3000

CMD ["sh", "scripts/start.sh"]
