# Se construye desde la raíz del repositorio (usa packages/contracts): ver frontend/Dockerfile.dockerignore.
FROM node:22-alpine

WORKDIR /app/frontend

# Contratos con el backend (solo tipos): el package.json los enlaza con "file:../packages/contracts".
COPY packages/contracts /app/packages/contracts

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ .

RUN npm run build

EXPOSE 5180

CMD ["npm", "start"]
