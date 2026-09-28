FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate

# Versión de esta imagen: el commit lo pasa quien construye (deploy/version.sh) y la fecha se toma aquí.
ARG APP_COMMIT=""
ENV APP_COMMIT=$APP_COMMIT
RUN date -u +%Y-%m-%dT%H:%M:%SZ > BUILT_AT

EXPOSE 3000

CMD ["sh", "scripts/start.sh"]
