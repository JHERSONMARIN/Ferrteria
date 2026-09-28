"""Utilidades comunes de las pruebas de API.

Cada prueba corre contra el entorno aislado de tests/docker-compose.yml (lo levanta tests/run.py).
Se configura con variables de entorno, así que funciona igual en cualquier equipo:
  FERRESYS_URL       dirección de la web de pruebas            (http://127.0.0.1:23990)
  FERRESYS_DB        contenedor de PostgreSQL de las pruebas     (ferresys-tests-db)
  CLAVE_TEMPORAL     clave inicial del administrador            (ClaveTemporal2026)
"""
import http.cookiejar
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

URL = os.environ.get("FERRESYS_URL", "http://127.0.0.1:23990")
DB_CONTAINER = os.environ.get("FERRESYS_DB", "ferresys-tests-db")
CLAVE_TEMPORAL = os.environ.get("CLAVE_TEMPORAL", "ClaveTemporal2026")
COMPOSE = Path(__file__).resolve().parents[1] / "docker-compose.yml"
resultados = []


def verificar(nombre, condicion, detalle=""):
    condicion = bool(condicion)
    resultados.append(condicion)
    print(f"{'OK   ' if condicion else 'FALLA'} {nombre}" + (f"  → {detalle}" if detalle and not condicion else ""), flush=True)


def resumen():
    """Imprime el total y termina con código 1 si algo falló (así lo lee tests/run.py)."""
    print(f"\nResultado: {sum(resultados)}/{len(resultados)} pruebas OK")
    sys.exit(0 if all(resultados) else 1)


class Navegador:
    """Cliente HTTP con su propio almacén de cookies, como un navegador independiente."""

    def __init__(self, user=None, clave=None):
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
        self.ultima_set_cookie = None
        self.cabeceras = {}  # de la última respuesta, con nombres en minúsculas
        if user:
            self.api("POST", "/auth/login", {"user": user, "pass": clave})

    def api(self, metodo, ruta, cuerpo=None, cabeceras=None):
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        req = urllib.request.Request(f"{URL}/api{ruta}", data=datos, method=metodo,
                                     headers={"Content-Type": "application/json", **(cabeceras or {})})
        try:
            with self.opener.open(req, timeout=30) as r:
                self.ultima_set_cookie = r.headers.get("Set-Cookie")
                self.cabeceras = {k.lower(): v for k, v in r.headers.items()}
                return r.status, json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            self.cabeceras = {k.lower(): v for k, v in e.headers.items()}
            return e.code, json.loads(e.read() or b"{}")

    def cookie(self):
        return next((c.value for c in self.cookies if c.name == "ferresys_session"), None)


def entrar(user, clave):
    return Navegador(user, clave)


def sql(consulta):
    r = subprocess.run(["docker", "exec", DB_CONTAINER, "psql", "-U", "ferresys", "-d", "ferresys", "-tAc", consulta],
                       capture_output=True, text=True)
    if r.stderr.strip():
        raise RuntimeError(r.stderr)
    return r.stdout.strip()


def registro_backend(desde=None):
    """Líneas JSON del registro del backend de pruebas (las que no son JSON se ignoran)."""
    cmd = ["docker", "logs", "ferresys-tests-backend"] + (["--since", desde] if desde else [])
    r = subprocess.run(cmd, capture_output=True, text=True)
    lineas = []
    for linea in (r.stdout + r.stderr).splitlines():
        try:
            lineas.append(json.loads(linea))
        except json.JSONDecodeError:
            pass
    return lineas


def esperar_backend(segundos=90):
    for _ in range(segundos):
        try:
            if Navegador().api("GET", "/health")[0] == 200:
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("El backend de pruebas no respondió")


def reiniciar_backend(**licencia):
    """Recrea el backend con otras variables de licencia (LICENSED_MODULES, MAX_USERS…), como lo haría
    deploy/set-plan.sh en una empresa real. Sin argumentos vuelve a la licencia completa."""
    entorno = {**os.environ, **{k: str(v) for k, v in licencia.items()}}
    subprocess.run(["docker", "compose", "-f", str(COMPOSE), "up", "-d", "--no-build", "--force-recreate", "backend"],
                   env=entorno, capture_output=True, text=True, check=True)
    esperar_backend()


# ---------- Ayudas de negocio que comparten varias pruebas ----------

def stock(code):
    s, r = sql(f"select stock || '|' || reserved from productos where code = '{code}'").split("|")
    return float(s), float(r)


def stock_en(code, branch_id):
    r = sql(f"select coalesce((select b.stock || '|' || b.reserved from branch_stock b join productos p on p.id = b.\"productoId\" "
            f"where p.code = '{code}' and b.\"branchId\" = {branch_id}), '0|0')")
    s, rv = r.split("|")
    return float(s), float(rv)


def cuadra():
    """El stock total de cada producto coincide con la suma de sus sucursales."""
    return sql("select count(*) from productos p left join (select \"productoId\", sum(stock) s, sum(reserved) r from branch_stock group by 1) b "
               "on b.\"productoId\" = p.id where p.stock <> coalesce(b.s, 0) or p.reserved <> coalesce(b.r, 0)") == "0"


def usuario(admin, user, modules, role):
    admin.api("POST", "/personal", {"name": user.title(), "user": user, "pass": "Temporal123", "role": role, "modules": modules})
    nav = Navegador()
    nav.api("POST", "/auth/login", {"user": user, "pass": "Temporal123"})
    nav.api("POST", "/auth/change-password", {"currentPassword": "Temporal123", "newPassword": f"{user}Clave2026"})
    return nav


def usuario_en(admin, user, modules, role, branch_id):
    st, r = admin.api("POST", "/personal", {"name": user.title(), "user": user, "pass": "Temporal123", "role": role,
                                            "modules": modules, "branchId": branch_id})
    nav = entrar(user, "Temporal123")
    if st in (200, 201):
        nav.api("POST", "/auth/change-password", {"currentPassword": "Temporal123", "newPassword": f"{user}Clave2026"})
    return entrar(user, f"{user}Clave2026")


def venta(nav, items, total, **extra):
    return nav.api("POST", "/ventas", {"docType": "Nota de Venta", "payMethod": "Efectivo",
                                       "cart": [{"id": i, "qty": q} for i, q in items], "totalEsperado": total, **extra})


def efectivo_caja(user):
    return float(sql(f"select \"ventasEfectivo\" from cajas_chicas c join usuarios u on u.id = c.\"usuarioId\" "
                     f"where u.\"user\" = '{user}' and estado = 'ABIERTA'"))


def abrir_caja(nav, register_id, monto=0):
    return nav.api("POST", "/caja/apertura", {"cashRegisterId": register_id, "montoInicial": monto})


def en_turno(nav, register_id):
    e = nav.api("GET", "/caja/estado-actual")[1]
    if e["abierta"]:
        return
    reg = next(x for x in e["registers"] if x["id"] == register_id)
    if reg["session"]:
        nav.api("POST", f"/caja/turnos/{reg['session']['id']}/unirse", {})
    else:
        abrir_caja(nav, register_id)


def cerrar_caja(nav):
    c = nav.api("GET", "/caja/estado-actual")[1]
    if c.get("abierta"):
        nav.api("POST", "/caja/cierre", {"cajaId": c["caja"]["id"], "montoCierreConteo": c["caja"]["saldoTeoricoEfectivo"]})


def modo_en_sucursal(admin, flow=None, modulos=None):
    # Desde que el modo es de cada sucursal: cambia el de la sucursal del administrador y, si se piden,
    # los módulos de la empresa. Devuelve la respuesta con la forma de antes (settings.saleFlowMode).
    cfg = admin.api("GET", "/settings")[1]["settings"]
    branch_id = admin.api("GET", "/auth/me")[1]["user"]["branchId"]
    if modulos is not None:
        st, r = admin.api("PUT", "/settings", {**cfg, "enabledModules": modulos})
        if st != 200:
            return st, r
    st, r = (200, {})
    if flow is not None:
        st, r = admin.api("PUT", f"/sucursales/{branch_id}", {"saleFlowMode": flow})
        if st != 200 and modulos is not None:
            admin.api("PUT", "/settings", cfg)  # si el modo no se aceptó, nada queda a medias
    branch = next(b for b in admin.api("GET", "/sucursales")[1] if b["id"] == branch_id)
    settings = admin.api("GET", "/settings")[1]["settings"]
    return st, {**r, "settings": {**settings, "saleFlowMode": branch["saleFlowMode"]}}


def configurar(admin, **cambios):
    """Cambia la configuración de la empresa; saleFlowMode va a la sucursal del administrador."""
    flow = cambios.pop("saleFlowMode", None)
    if cambios:
        cfg = admin.api("GET", "/settings")[1]["settings"]
        st, r = admin.api("PUT", "/settings", {**cfg, **cambios})
        if st != 200 or flow is None:
            if st == 200:
                return modo_en_sucursal(admin)
            return st, r
    return modo_en_sucursal(admin, flow)


def modo_empresa(admin, flow):
    """Pone el mismo modo de trabajo en todas las sucursales (antes el modo era de toda la empresa)."""
    return [admin.api("PUT", f"/sucursales/{b['id']}", {"saleFlowMode": flow})
            for b in admin.api("GET", "/sucursales")[1] if b["saleFlowMode"] != flow]
