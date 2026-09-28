import base64
import json

from lib import *  # noqa: F401,F403


print("=== Sin sesión ===")
anonimo = Navegador()
for ruta in ["/productos", "/settings", "/ventas", "/personal"]:
    st, r = anonimo.api("GET", ruta)
    verificar(f"GET {ruta} sin sesión → 401", st == 401, st)
verificar("GET /app-info es público", anonimo.api("GET", "/app-info")[0] == 200)
verificar("GET /health es público", anonimo.api("GET", "/health")[0] == 200)
verificar("Ruta inexistente → 401 (no revela qué existe)", anonimo.api("GET", "/no-existe")[0] == 401)

print("\n=== Clave temporal del administrador ===")
admin = Navegador()
st, r = admin.api("POST", "/auth/login", {"user": "admin", "pass": CLAVE_TEMPORAL})
verificar("Login con clave temporal", st == 200 and r["user"]["mustChangePassword"] is True, (st, r))
sc = admin.ultima_set_cookie or ""
verificar("Cookie de sesión HttpOnly y SameSite=Strict", "HttpOnly" in sc and "SameSite=Strict" in sc, sc)
verificar("La respuesta de login no incluye la contraseña", "pass" not in r["user"])
st, r = admin.api("GET", "/productos")
verificar("Con clave temporal, el resto de la API → 403", st == 403 and r.get("codigo") == "CAMBIO_CLAVE_REQUERIDO", (st, r))
verificar("…pero /auth/me sí responde", admin.api("GET", "/auth/me")[0] == 200)

st, r = admin.api("POST", "/auth/change-password", {"currentPassword": "incorrecta", "newPassword": "NuevaClave2026"})
verificar("Cambio con clave actual incorrecta → 400", st == 400, (st, r))
st, r = admin.api("POST", "/auth/change-password", {"currentPassword": CLAVE_TEMPORAL, "newPassword": "corta"})
verificar("Nueva clave de menos de 8 caracteres → 400", st == 400, (st, r))
st, r = admin.api("POST", "/auth/change-password", {"currentPassword": CLAVE_TEMPORAL, "newPassword": CLAVE_TEMPORAL})
verificar("Nueva clave igual a la actual → 400", st == 400, (st, r))

cookie_vieja = admin.cookie()
st, r = admin.api("POST", "/auth/change-password", {"currentPassword": CLAVE_TEMPORAL, "newPassword": "AdminCentro2026"})
verificar("Cambio de clave válido", st == 200 and r["user"]["mustChangePassword"] is False, (st, r))
verificar("Ya puede usar la API", admin.api("GET", "/productos")[0] == 200)
robado = Navegador()
robado.api("GET", "/health")
robado.cookies.set_cookie(http.cookiejar.Cookie(0, "ferresys_session", cookie_vieja, None, False, "127.0.0.1", False, False,
                                                "/api", True, False, None, False, None, None, {}))
verificar("La sesión anterior al cambio de clave queda inválida", robado.api("GET", "/productos")[0] == 401)
verificar("Contraseña guardada con hash", sql("select left(pass, 7) from usuarios where \"user\"='admin'") == "scrypt$")

print("\n=== Token manipulado ===")
falsificado = Navegador()
falsificado.api("GET", "/health")
cabecera, contenido, firma = admin.cookie().split(".")
otro = base64.urlsafe_b64encode(json.dumps({"sub": 1, "pwf": "x", "exp": 9999999999}).encode()).decode().rstrip("=")
falsificado.cookies.set_cookie(http.cookiejar.Cookie(0, "ferresys_session", f"{cabecera}.{otro}.{firma}", None, False, "127.0.0.1",
                                                     False, False, "/api", True, False, None, False, None, None, {}))
verificar("Token con contenido alterado → 401", falsificado.api("GET", "/productos")[0] == 401)

print("\n=== Empleado con permisos limitados (POS + Caja) ===")
st, r = admin.api("POST", "/personal", {"name": "Ana Cajera", "user": "ana", "pass": "1234", "role": "CAJERO", "modules": ["pos", "caja"]})
verificar("Clave débil al crear empleado → 400", st == 400, (st, r))
st, r = admin.api("POST", "/personal", {"name": "Ana Cajera", "user": "ana", "pass": "Temporal123", "role": "CAJERO", "modules": ["pos", "caja"]})
verificar("Empleado creado", st == 201, (st, r))

ana = Navegador()
st, r = ana.api("POST", "/auth/login", {"user": "ana", "pass": "Temporal123"})
verificar("La clave que asignó el admin es temporal", st == 200 and r["user"]["mustChangePassword"] is True, (st, r))
ana.api("POST", "/auth/change-password", {"currentPassword": "Temporal123", "newPassword": "AnaCaja2026"})

for metodo, ruta, esperado, desc in [
    ("GET", "/productos", 200, "Lee productos (lo necesita el POS)"),
    ("GET", "/personal", 200, "Lee el personal (vendedores del POS)"),
    ("GET", "/settings", 200, "Lee la configuración"),
    ("POST", "/productos", 403, "No puede crear productos"),
    ("POST", "/personal", 403, "No puede crear usuarios"),
    ("PUT", "/settings", 403, "No puede cambiar la configuración"),
    ("GET", "/dashboard/stats", 403, "No ve reportes financieros"),
    ("GET", "/creditos", 403, "No ve créditos"),
]:
    st, r = ana.api(metodo, ruta, {} if metodo != "GET" else None)
    verificar(f"{desc} → {esperado}", st == esperado, (st, r))

print("\n=== La identidad sale de la sesión, no del navegador ===")
# Desde la Fase 6 las cajas son físicas: Ana tiene la suya para que su turno no sea el del admin.
caja_principal = int(sql("select id from cash_registers where name = 'Caja Principal'"))
caja_de_ana = admin.api("POST", "/caja/registros", {"name": "Caja Ana"})[1]["id"]
admin.api("POST", "/caja/apertura", {"cashRegisterId": caja_principal, "montoInicial": 100})
ana.api("POST", "/caja/apertura", {"cashRegisterId": caja_de_ana, "usuarioId": 1, "montoInicial": 50})
caja_admin = sql("select id from cajas_chicas where \"usuarioId\" = 1 and estado = 'ABIERTA'")
caja_ana = sql("select c.id from cajas_chicas c join usuarios u on u.id = c.\"usuarioId\" where u.\"user\" = 'ana' and estado = 'ABIERTA'")
verificar("Ana abrió SU caja aunque envió usuarioId=1", caja_ana != "" and caja_ana != caja_admin, (caja_ana, caja_admin))
st, r = ana.api("GET", "/caja/estado-actual?usuarioId=1")
verificar("?usuarioId=1 no le muestra la caja del admin", st == 200 and str(r["caja"]["id"]) == caja_ana, r)
st, r = ana.api("POST", "/caja/cierre", {"cajaId": int(caja_admin), "montoCierreConteo": 0})
verificar("Ana no puede cerrar la caja del admin → 403", st == 403, (st, r))

admin.api("POST", "/productos", {"code": "P-001", "name": "Martillo", "unit": "Unidad", "stock": 10, "price": 25, "category": "General"})
prod_id = int(sql("select id from productos where code = 'P-001'"))
st, r = ana.api("POST", "/ventas", {"docType": "Nota de Venta", "payMethod": "Efectivo", "usuarioCajaId": 1,
                                     "cart": [{"id": prod_id, "qty": 1}], "totalEsperado": 25})
verificar("Ana registra una venta", st == 201, (st, r))
caja_venta = sql(f"select \"cajaId\" from ventas where \"numDoc\" = '{r.get('venta', {}).get('numDoc')}'")
verificar("…la venta entra en la caja de Ana, no en la del admin", caja_venta == caja_ana, (caja_venta, caja_ana))

print("\n=== Cambios del administrador con efecto inmediato ===")
ana_id = int(sql("select id from usuarios where \"user\" = 'ana'"))
admin.api("PUT", f"/personal/{ana_id}", {"name": "Ana Cajera", "user": "ana", "role": "CAJERO", "modules": ["pos"], "active": True})
verificar("Al quitarle 'caja', Ana ya no puede abrir caja", ana.api("POST", "/caja/apertura", {"montoInicial": 1})[0] == 403)
admin.api("PUT", f"/personal/{ana_id}", {"name": "Ana Cajera", "user": "ana", "role": "CAJERO", "modules": ["pos", "caja"], "active": False})
verificar("Al desactivarla, su sesión deja de valer → 401", ana.api("GET", "/productos")[0] == 401)
admin.api("PUT", f"/personal/{ana_id}", {"name": "Ana Cajera", "user": "ana", "role": "CAJERO", "modules": ["pos", "caja"], "active": True, "pass": "Reinicio2026"})
st, r = ana.api("POST", "/auth/login", {"user": "ana", "pass": "Reinicio2026"})
verificar("Clave restablecida por el admin vuelve a ser temporal", st == 200 and r["user"]["mustChangePassword"] is True, (st, r))

print("\n=== Módulos contratados (licencia) ===")
# Igual que deploy/set-modules.sh en una empresa real: se reinicia el backend con la nueva licencia.
reiniciar_backend(LICENSED_MODULES="pos,caja,inventory")
admin = Navegador()
admin.api("POST", "/auth/login", {"user": "admin", "pass": "AdminCentro2026"})
st, r = admin.api("GET", "/settings")
verificar("La API informa los módulos contratados", r.get("licensedModules") == ["pos", "caja", "inventory", "personal"], r.get("licensedModules"))
st, r = admin.api("GET", "/creditos")
verificar("Ni el administrador entra a un módulo no contratado → 403", st == 403, (st, r))
cfg = r_settings = admin.api("GET", "/settings")[1]["settings"]
st, r = admin.api("PUT", "/settings", {**cfg, "enabledModules": ["pos", "customers"]})
verificar("No se puede activar un módulo no contratado → 400", st == 400 and "plan" in r.get("error", ""), (st, r))
verificar("Los módulos contratados siguen funcionando", admin.api("GET", "/productos")[0] == 200)
reiniciar_backend()

print("\n=== Límite de intentos de login ===")
atacante = Navegador()
codigos = [atacante.api("POST", "/auth/login", {"user": "admin", "pass": f"mala{i}"})[0] for i in range(5)]
verificar("5 intentos fallidos → 401", codigos == [401] * 5, codigos)
st, r = atacante.api("POST", "/auth/login", {"user": "admin", "pass": "AdminCentro2026"})
verificar("6º intento, incluso con la clave correcta → 429", st == 429 and r.get("codigo") == "DEMASIADOS_INTENTOS", (st, r))
st, _ = Navegador().api("POST", "/auth/login", {"user": "ana", "pass": "Reinicio2026"})
verificar("Otro usuario desde la misma IP puede seguir entrando", st == 200, st)

resumen()
