# Se construye desde la raíz del repositorio (usa packages/shared): ver console/Dockerfile.dockerignore.

# Interfaz de la consola: se compila aquí para no depender de un web/dist hecho a mano.
FROM node:20-alpine AS web
WORKDIR /web
COPY console/web/package*.json ./
RUN npm ci
COPY console/web ./
RUN npm run build

FROM node:20-alpine

WORKDIR /app/console

# docker + compose: la consola ejecuta los scripts de deploy/ para crear y actualizar empresas.
# bash, curl, openssl e iproute2 los usan esos scripts.
RUN apk add --no-cache bash curl openssl iproute2 docker-cli docker-cli-compose

# Piezas comunes con el backend de las empresas: el package.json las enlaza con "file:../packages/shared".
COPY packages/shared /app/packages/shared

COPY console/package*.json ./
COPY console/prisma ./prisma/
RUN npm install --omit=dev && npx prisma generate

COPY console/ .
COPY --from=web /web/dist ./web/dist

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
