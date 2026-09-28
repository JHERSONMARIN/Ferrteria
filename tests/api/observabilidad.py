import subprocess
import time

from lib import *  # noqa: F401,F403


def lineas_de(request_id):
    time.sleep(0.5)  # el registro se escribe al terminar de responder
    return [l for l in registro_backend() if l.get("requestId") == request_id]


admin = entrar("admin", CLAVE_TEMPORAL)
admin.api("POST", "/auth/change-password", {"currentPassword": CLAVE_TEMPORAL, "newPassword": "AdminRegistro2026"})
admin = entrar("admin", "AdminRegistro2026")

print("=== Identificador de petición ===")
st, _ = admin.api("GET", "/productos")
rid = admin.cabeceras.get("x-request-id", "")
verificar("Cada respuesta trae X-Request-Id", st == 200 and len(rid) >= 8, admin.cabeceras)
admin.api("GET", "/productos")
verificar("…distinto en cada petición", admin.cabeceras.get("x-request-id") != rid)
admin.api("GET", "/productos", cabeceras={"X-Request-Id": "soporte-12345"})
verificar("Si llega uno válido (de un proxy) se respeta", admin.cabeceras.get("x-request-id") == "soporte-12345", admin.cabeceras)
admin.api("GET", "/productos", cabeceras={"X-Request-Id": "<script>"})
verificar("…y uno inválido se reemplaza", admin.cabeceras.get("x-request-id") not in ("<script>", None))

print("\n=== Registro estructurado ===")
st, _ = admin.api("GET", "/productos")
rid = admin.cabeceras["x-request-id"]
peticion = next((l for l in lineas_de(rid) if l.get("msg") == "request"), None)
verificar("La petición queda en una línea JSON con su identificador", peticion is not None, rid)
verificar("…con empresa, usuario, módulo, estado y duración",
          peticion and peticion["company"] == "pruebas" and peticion["user"] == "admin" and peticion["userId"] == 1
          and peticion["module"] == "productos" and peticion["status"] == 200 and isinstance(peticion["ms"], int), peticion)
verificar("…sin la cadena de consulta (puede llevar datos del cliente)", peticion and "?" not in peticion["path"], peticion)

st, _ = admin.api("POST", "/productos", {"code": ""})
linea = next((l for l in lineas_de(admin.cabeceras["x-request-id"]) if l.get("msg") == "request"), None)
verificar("Un error del cliente (400) se registra como advertencia", st == 400 and linea and linea["level"] == "warn", (st, linea))

anonimo = Navegador()
anonimo.api("GET", "/ventas")
linea = next((l for l in lineas_de(anonimo.cabeceras["x-request-id"]) if l.get("msg") == "request"), None)
verificar("Sin sesión también se registra, sin usuario", linea and linea["status"] == 401 and "user" not in linea, linea)

admin.api("GET", "/auth/me")
verificar("El latido de sesión no llena el registro (solo en modo debug)",
          not [l for l in lineas_de(admin.cabeceras["x-request-id"]) if l.get("msg") == "request"])

# Las migraciones de Prisma escriben texto al arrancar; desde que el servidor escucha, todo es JSON.
salida = subprocess.run(["docker", "logs", "ferresys-tests-backend"], capture_output=True, text=True)
lineas = (salida.stdout + salida.stderr).splitlines()
inicio = next((i for i, l in enumerate(lineas) if "corriendo en el puerto" in l), None)
no_json = [l for l in lineas[inicio or 0:] if l.strip() and not l.startswith("{")]
verificar("Desde que arranca el servidor, todo lo que escribe sale como JSON", inicio is not None and not no_json, no_json[:3])

resumen()
