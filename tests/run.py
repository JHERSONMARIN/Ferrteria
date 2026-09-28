#!/usr/bin/env python3
"""Corre toda la suite de pruebas con un solo comando.

    python3 tests/run.py                  todo (API e interfaz)
    python3 tests/run.py --sin-ui         solo API
    python3 tests/run.py sucursales       solo las cadenas que incluyen un archivo con ese texto
    python3 tests/run.py --sin-build      no reconstruye las imágenes (más rápido si el código no cambió)
    python3 tests/run.py --mantener       deja el entorno levantado al terminar (para mirar la base o la web)

Levanta el entorno aislado de tests/docker-compose.yml, y antes de cada cadena deja la base vacía
(una empresa recién creada). Las pruebas de una misma cadena comparten la base, en orden, porque
cada una parte de lo que dejó la anterior. La salida completa de cada prueba queda en tests/.salida/.
"""
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
COMPOSE = RAIZ / "docker-compose.yml"
SALIDA = RAIZ / ".salida"
PUERTO = os.environ.get("TEST_WEB_PORT", "23990")
ENTORNO = {
    **os.environ,
    "TEST_WEB_PORT": PUERTO,
    "FERRESYS_URL": f"http://127.0.0.1:{PUERTO}",
    "FERRESYS_DB": "ferresys-tests-db",
    "CLAVE_TEMPORAL": os.environ.get("CLAVE_TEMPORAL", "ClaveTemporal2026"),
    "PYTHONPATH": str(RAIZ / "api"),
    "PYTHONUNBUFFERED": "1",
}

# Cada cadena empieza con la base vacía. El orden dentro de la cadena importa.
CADENAS = [
    ["api/seguridad.py"],
    ["api/pedidos_por_estados.py", "api/envios.py"],
    ["api/cantidades_y_precios.py", "api/modo_por_sucursal.py"],
    ["api/cantidades_y_precios.py", "api/auditoria.py", "api/caja_compartida.py", "api/reportes.py"],
    ["api/sucursales.py", "api/transferencias.py", "api/series_sucursal.py"],
]


def sh(*cmd, **kw):
    return subprocess.run(cmd, env=ENTORNO, text=True, capture_output=True, **kw)


def compose(*args):
    r = sh("docker", "compose", "-f", str(COMPOSE), *args)
    if r.returncode != 0:
        sys.exit(f"docker compose {' '.join(args)} falló:\n{r.stderr}")
    return r


def esperar_backend():
    for _ in range(120):
        try:
            with urllib.request.urlopen(f"{ENTORNO['FERRESYS_URL']}/api/health", timeout=2) as r:
                if r.status == 200:
                    return
        except Exception:
            pass
        time.sleep(1)
    registro = sh("docker", "compose", "-f", str(COMPOSE), "logs", "--tail", "30", "backend", "web").stdout
    sys.exit(f"El backend de pruebas no respondió. Últimas líneas del registro:\n{registro}")


def base_vacia():
    """Borra y vuelve a crear la base, y recrea el backend: aplica migraciones y crea el admin inicial."""
    compose("stop", "backend")  # que nadie esté conectado mientras se borra la base
    for q in ("DROP DATABASE IF EXISTS ferresys WITH (FORCE)", "CREATE DATABASE ferresys"):
        r = sh("docker", "exec", "ferresys-tests-db", "psql", "-U", "ferresys", "-d", "postgres", "-qc", q)
        if r.returncode != 0:
            sys.exit(f"No se pudo reiniciar la base:\n{r.stderr}")
    compose("up", "-d", "--no-build", "--force-recreate", "backend")
    esperar_backend()


def correr(prueba):
    ruta = RAIZ / prueba
    cmd = ["python3", str(ruta)] if ruta.suffix == ".py" else ["node", str(ruta)]
    inicio = time.time()
    r = subprocess.run(cmd, env=ENTORNO, text=True, capture_output=True, cwd=ruta.parent)
    salida = r.stdout + (f"\n--- stderr ---\n{r.stderr}" if r.stderr.strip() else "")
    log = SALIDA / (prueba.replace("/", "_") + ".log")
    log.write_text(salida)
    m = re.search(r"Resultado: (\d+)/(\d+)", r.stdout)
    fallas = [l for l in r.stdout.splitlines() if l.startswith("FALLA")]
    ok = sum(1 for l in r.stdout.splitlines() if l.startswith("OK   "))
    total = ok + len(fallas)
    error = None if m else (r.stderr.strip().splitlines() or ["terminó sin resultado"])[-1]
    return ok, total, fallas, error, time.time() - inicio, log


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opciones = {a for a in sys.argv[1:] if a.startswith("--")}
    cadenas = CADENAS
    if "--sin-ui" in opciones:
        cadenas = [[p for p in c if p.endswith(".py")] for c in cadenas]
    if args:
        cadenas = [c for c in cadenas if any(a in p for p in c for a in args)]
    if not cadenas:
        sys.exit("Ninguna prueba coincide con el filtro.")
    SALIDA.mkdir(exist_ok=True)

    print("▶ Levantando el entorno de pruebas…", flush=True)
    compose("up", "-d", "--wait", "db")
    compose("up", "-d", *([] if "--sin-build" in opciones else ["--build"]), "backend", "web")

    filas, total_ok, total, hubo_error = [], 0, 0, False
    try:
        for cadena in cadenas:
            print(f"\n▶ Base vacía → {' → '.join(Path(p).stem for p in cadena)}", flush=True)
            base_vacia()
            for prueba in cadena:
                ok, n, fallas, error, seg, log = correr(prueba)
                total_ok, total = total_ok + ok, total + n
                estado = "OK   " if not fallas and not error else "FALLA"
                hubo_error |= estado != "OK   "
                print(f"  {estado} {prueba:<32} {ok:>3}/{n:<3} {seg:5.1f}s", flush=True)
                for f in fallas:
                    print(f"        {f}")
                if error:
                    print(f"        ERROR: {error}  (ver {log.relative_to(RAIZ.parent)})")
                filas.append((prueba, estado))
    finally:
        if "--mantener" not in opciones:
            compose("down", "-v")
        else:
            print(f"\nEl entorno sigue levantado: {ENTORNO['FERRESYS_URL']} (admin / ver tests/README.md)")

    print(f"\n{'✅' if not hubo_error else '❌'} {total_ok}/{total} casos OK en {len(filas)} pruebas")
    sys.exit(1 if hubo_error else 0)


if __name__ == "__main__":
    main()
