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
PUERTO_CONSOLA = os.environ.get("TEST_CONSOLE_PORT", "23991")
ENTORNO = {
    **os.environ,
    "TEST_WEB_PORT": PUERTO,
    "FERRESYS_URL": f"http://127.0.0.1:{PUERTO}",
    "TEST_CONSOLE_PORT": PUERTO_CONSOLA,
    "CONSOLA_URL": f"http://127.0.0.1:{PUERTO_CONSOLA}",
    "FERRESYS_DB": "ferresys-tests-db",
    "CLAVE_TEMPORAL": os.environ.get("CLAVE_TEMPORAL", "ClaveTemporal2026"),
    "PYTHONPATH": str(RAIZ / "api"),
    "PYTHONUNBUFFERED": "1",
    # La imagen de pruebas queda marcada con el commit, como la de una empresa.
    "FERRESYS_COMMIT": subprocess.run(["bash", str(RAIZ.parent / "deploy" / "version.sh")],
                                      capture_output=True, text=True).stdout.strip(),
}

# Cada cadena empieza con la base vacía. El orden dentro de la cadena importa.
CADENAS = [
    ["api/seguridad.py", "ui/seguridad.mjs"],
    ["api/observabilidad.py"],
    ["api/consola.py"],
    ["api/farmacia.py"],
    ["api/clientes.py"],
    ["api/compras.py"],
    ["api/personal.py"],
    ["api/pedidos_por_estados.py", "api/envios.py", "ui/pedidos_por_estados.mjs", "ui/envios.mjs"],
    ["api/cantidades_y_precios.py", "api/modo_por_sucursal.py"],
    ["api/cantidades_y_precios.py", "ui/cantidades_y_precios.mjs", "ui/una_sucursal.mjs", "api/auditoria.py",
     "api/caja_compartida.py", "api/reportes.py", "ui/caja_compartida.mjs", "ui/auditoria.mjs", "ui/reportes.mjs"],
    ["api/sucursales.py", "ui/sucursales.mjs", "api/transferencias.py", "api/series_sucursal.py",
     "ui/transferencias.mjs", "ui/series_sucursal.mjs"],
]


def sh(*cmd, **kw):
    return subprocess.run(cmd, env=ENTORNO, text=True, capture_output=True, **kw)


def compose(*args):
    r = sh("docker", "compose", "-f", str(COMPOSE), *args)
    if r.returncode != 0:
        sys.exit(f"docker compose {' '.join(args)} falló:\n{r.stderr}")
    return r


def esperar(url, *servicios):
    for _ in range(120):
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return
        except Exception:
            pass
        time.sleep(1)
    registro = sh("docker", "compose", "-f", str(COMPOSE), "logs", "--tail", "30", *servicios).stdout
    sys.exit(f"{' y '.join(servicios)} no respondió. Últimas líneas del registro:\n{registro}")


def reiniciar(servicio, base):
    """Borra y vuelve a crear la base del servicio y lo recrea: al arrancar aplica las migraciones y
    crea su usuario inicial con la clave temporal."""
    compose("stop", servicio)  # que nadie esté conectado mientras se borra la base
    for q in (f"DROP DATABASE IF EXISTS {base} WITH (FORCE)", f"CREATE DATABASE {base}"):
        r = sh("docker", "exec", "ferresys-tests-db", "psql", "-U", "ferresys", "-d", "postgres", "-qc", q)
        if r.returncode != 0:
            sys.exit(f"No se pudo reiniciar la base {base}:\n{r.stderr}")
    compose("up", "-d", "--no-build", "--force-recreate", servicio)


def base_vacia():
    """Empresa recién creada."""
    reiniciar("backend", "ferresys")
    esperar(f"{ENTORNO['FERRESYS_URL']}/api/health", "backend", "web")


def consola_vacia():
    """Consola de VALETEC recién instalada."""
    reiniciar("consola", "consola")
    esperar(f"{ENTORNO['CONSOLA_URL']}/api/health", "consola")


def en_imagen(nombre, imagen, *cmd):
    """Corre un chequeo dentro de una imagen de pruebas (backend o web: tienen TypeScript y las
    dependencias), así no depende de lo que haya instalado en este equipo."""
    inicio = time.time()
    r = sh("docker", "run", "--rm", imagen, *cmd)
    salida = r.stdout + r.stderr
    (SALIDA / f"{nombre}.log").write_text(salida)
    return r.returncode == 0, salida, time.time() - inicio


def chequeos_estaticos():
    """Tipos (TypeScript) y pruebas unitarias del dominio: rápidos, van antes que todo lo demás."""
    hubo_error = False
    for parte, imagen in (("backend", "ferresys-backend:tests"), ("frontend", "ferresys-web:tests")):
        ok, salida, seg = en_imagen(f"tipos-{parte}", imagen, "npx", "--no-install", "tsc", "-p", ".")
        errores = [l for l in salida.splitlines() if "error TS" in l]
        print(f"  {'OK   ' if ok else 'FALLA'} {f'tipos del {parte} (TypeScript)':<32} {len(errores):>3} errores {seg:5.1f}s", flush=True)
        for linea in errores[:10]:
            print(f"        {linea}")
        hubo_error |= not ok
    ok, salida, seg = en_imagen("unitarias", "ferresys-backend:tests", "node", "--test", "src/**/*.test.ts")
    # Formato TAP ("# pass 7") fuera de una terminal; "ℹ pass 7" en una.
    n = {k: int(v) for k, v in re.findall(r"^(?:#|ℹ) (pass|fail) (\d+)$", salida, re.M)}
    print(f"  {'OK   ' if ok else 'FALLA'} {'pruebas unitarias':<32} {n.get('pass', 0):>3}/{n.get('pass', 0) + n.get('fail', 0):<3} {seg:5.1f}s", flush=True)
    for linea in [l for l in salida.splitlines() if l.lstrip().startswith(("✖", "not ok"))][:10]:
        print(f"        {linea.strip()}")
    hubo_error |= not ok
    return hubo_error, n.get("pass", 0), n.get("pass", 0) + n.get("fail", 0)


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
    compose("up", "-d", *([] if "--sin-build" in opciones else ["--build"]), "backend", "web", "consola")

    filas, total_ok, total, hubo_error = [], 0, 0, False
    try:
        if not args:  # con un filtro se corren solo las cadenas pedidas
            print("\n▶ Chequeos del código", flush=True)
            hubo_error, total_ok, total = chequeos_estaticos()
        for cadena in cadenas:
            print(f"\n▶ Base vacía → {' → '.join(p.rsplit(".", 1)[0] for p in cadena)}", flush=True)
            base_vacia()
            if any("consola" in p for p in cadena):
                consola_vacia()
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
