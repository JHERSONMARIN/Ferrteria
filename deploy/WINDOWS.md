# Consola y empresas en Windows

Solo hace falta la consola: las empresas se crean desde ella. Los scripts `.sh` los ejecuta la
propia consola dentro de su contenedor (Linux), así que en Windows solo se corre uno, una vez.

## Requisitos

- **Docker Desktop** (con WSL 2), abierto antes de empezar.
- **Git for Windows**: trae Git Bash, `openssl` y `curl`.

## Pasos

1. Clonar el repositorio (si ya estaba clonado antes de existir `.gitattributes`, volver a clonarlo:
   los `.sh` tienen que quedar con saltos de línea de Linux).
2. Abrir **Git Bash** en la carpeta del repositorio y ejecutar:

   ```bash
   deploy/setup-console.sh          # solo para este equipo
   deploy/setup-console.sh 23000 red   # visible para otros equipos de la red
   ```

   La primera vez construye las imágenes (varios minutos). Al final muestra la URL, el usuario
   y una contraseña temporal.
3. Entrar a `http://127.0.0.1:23000` y crear las empresas desde **Nueva empresa**.

## Puertos

| Qué | Puerto |
|---|---|
| Consola | 23000 |
| Empresas | 23001 en adelante (la consola propone el siguiente libre) |

Las empresas nuevas quedan visibles igual que la consola (`CONSOLE_BIND` de `deploy/platform/.env`).

## Si otro equipo no puede entrar

Docker Desktop suele pedir permiso en el cortafuegos la primera vez. Si no lo hizo, abrir el
rango una sola vez en **PowerShell como administrador**:

```powershell
New-NetFirewallRule -DisplayName "FerreSys" -Direction Inbound -Protocol TCP -LocalPort 23000-23199 -Action Allow
```

`deploy/set-network.sh` es solo para Linux. En Windows, para pasar de local a red (o al revés):
poner `CONSOLE_BIND` en `deploy/platform/.env` y `WEB_BIND` en `deploy/companies/<empresa>/.env`
(`127.0.0.1` = solo este equipo, `0.0.0.0` = red) y recrear cada una desde Git Bash:

```bash
docker compose -f deploy/platform/docker-compose.yml --env-file deploy/platform/.env up -d
docker compose -p ferresys-<empresa> -f deploy/company/docker-compose.yml --env-file deploy/companies/<empresa>/.env up -d
```
