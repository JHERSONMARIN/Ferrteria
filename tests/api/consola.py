import time

from lib import *  # noqa: F401,F403

# Consola de VALETEC recién instalada: usuario "valetec" con la clave temporal. En las pruebas no tiene
# acceso a Docker, así que no crea ni toca empresas: se prueban la sesión, los permisos y los errores.


def consola(user=None, clave=None):
    return Navegador(user, clave, base=CONSOLA_URL)


def lineas_de(request_id):
    time.sleep(0.5)  # el registro se escribe al terminar de responder
    return [l for l in registro_backend(contenedor="ferresys-tests-consola") if l.get("requestId") == request_id]


print("=== Sin sesión ===")
anonimo = consola()
verificar("La consola responde", anonimo.api("GET", "/health")[0] == 200)
st, r = anonimo.api("GET", "/empresas")
verificar("Sin sesión no se listan las empresas → SESION_INVALIDA", st == 401 and r.get("codigo") == "SESION_INVALIDA", (st, r))

print("\n=== Primer ingreso ===")
st, r = consola().api("POST", "/auth/login", {"user": "valetec", "pass": "incorrecta"})
verificar("Clave incorrecta → 401 NO_AUTENTICADO", st == 401 and r.get("codigo") == "NO_AUTENTICADO", (st, r))
admin = consola()
st, r = admin.api("POST", "/auth/login", {"user": "valetec", "pass": CLAVE_TEMPORAL})
verificar("Entra con la clave temporal", st == 200 and r["user"]["mustChangePassword"] is True, (st, r))
sc = admin.ultima_set_cookie or ""
verificar("Cookie de sesión HttpOnly y SameSite=Strict", "HttpOnly" in sc and "SameSite=Strict" in sc, sc)
verificar("La respuesta no incluye la contraseña", "pass" not in r["user"])
st, r = admin.api("GET", "/empresas")
verificar("Con clave temporal no puede operar → CAMBIO_CLAVE_REQUERIDO", st == 403 and r.get("codigo") == "CAMBIO_CLAVE_REQUERIDO", (st, r))
st, r = admin.api("POST", "/auth/change-password", {"currentPassword": CLAVE_TEMPORAL, "newPassword": "corta"})
verificar("Clave nueva débil → 400 CLAVE_DATOS_INVALIDOS", st == 400 and r.get("codigo") == "CLAVE_DATOS_INVALIDOS", (st, r))
vieja = consola()
vieja.api("POST", "/auth/login", {"user": "valetec", "pass": CLAVE_TEMPORAL})
st, r = admin.api("POST", "/auth/change-password", {"currentPassword": CLAVE_TEMPORAL, "newPassword": "ConsolaPruebas2026"})
verificar("Cambia la clave", st == 200 and r["user"]["mustChangePassword"] is False, (st, r))
verificar("La otra sesión abierta con la clave anterior deja de valer", vieja.api("GET", "/auth/me")[0] == 401)

print("\n=== Operación ===")
st, r = admin.api("GET", "/empresas")
verificar("Lista las empresas (ninguna en este entorno)", st == 200 and r == [], (st, r))
st, r = admin.api("GET", "/planes")
verificar("Catálogo de planes", st == 200 and {"basico", "profesional", "empresa"} <= set(r.get("planes", {})), list(r.get("planes", {})))
verificar("Catálogo de módulos y de estilos", admin.api("GET", "/modulos")[0] == 200 and admin.api("GET", "/estilos")[0] == 200)
st, r = admin.api("POST", "/empresas", {"slug": "X no vale", "name": "Prueba", "plan": "basico"})
verificar("Identificador inválido → 400 COMANDO_DATOS_INVALIDOS", st == 400 and r.get("codigo") == "COMANDO_DATOS_INVALIDOS", (st, r))
st, r = admin.api("GET", "/empresas/no-existe")
verificar("Empresa inexistente → 404", st == 404 and r.get("codigo") == "NO_ENCONTRADO", (st, r))
st, r = admin.api("GET", "/no-existe")
verificar("Ruta inexistente → 404 en JSON (no la página de la interfaz)", st == 404 and r.get("codigo") == "NO_ENCONTRADO", (st, r))

print("\n=== Registro ===")
admin.api("GET", "/planes")
rid = admin.cabeceras.get("x-request-id")
linea = next((l for l in lineas_de(rid) if l.get("msg") == "request"), None)
verificar("Cada petición queda en JSON con el servicio, el usuario y su identificador",
          linea and linea["service"] == "consola" and linea["user"] == "valetec" and linea["status"] == 200, linea)

print("\n=== Límite de intentos ===")
atacante = consola()
codigos = [atacante.api("POST", "/auth/login", {"user": "valetec", "pass": f"mala{i}"})[0] for i in range(5)]
verificar("5 intentos fallidos → 401", codigos == [401] * 5, codigos)
st, r = atacante.api("POST", "/auth/login", {"user": "valetec", "pass": "ConsolaPruebas2026"})
verificar("6º intento, incluso con la clave correcta → 429 DEMASIADOS_INTENTOS",
          st == 429 and r.get("codigo") == "DEMASIADOS_INTENTOS", (st, r))
verificar("La sesión ya abierta sigue funcionando", admin.api("GET", "/auth/me")[0] == 200)

resumen()
