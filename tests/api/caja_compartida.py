from concurrent.futures import ThreadPoolExecutor

from lib import *  # noqa: F401,F403


def estado(nav):
    return nav.api("GET", "/caja/estado-actual")[1]


def registro(nombre):
    return next((r for r in estado_admin_registros() if r["name"] == nombre), None)


def estado_admin_registros():
    return admin.api("GET", "/caja/registros")[1]


def pedido_cobrado(cajero_nav, qty):
    st, r = vendedor.api("POST", "/pedidos", {"cart": [{"id": ID["CLA"], "qty": qty}], "totalEsperado": qty * 10})
    pid = r["pedido"]["id"]
    return pid, cajero_nav.api("POST", f"/pedidos/{pid}/cobrar", {"docType": "Nota de Venta", "payMethod": "Efectivo"})


admin = entrar("admin", "AdminFase5_2026")
vendedor = entrar("vendedor", "vendedorClave2026")
cajero = entrar("cajero", "cajeroClave2026")
ID = {c: int(sql(f"select id from productos where code = '{c}'")) for c in ("CAB", "CEM", "CLA")}

print("=== Turnos abiertos antes ===")
e = estado(cajero)
verificar("El turno que el cajero tenía abierto sigue abierto", e["abierta"] and e["caja"]["register"]["name"] == "Caja Cajero", e)
verificar("…con él como único cajero", [m["name"] for m in e["caja"]["members"]] == ["Cajero"], e["caja"]["members"])
verificar("Las ventas anteriores quedan cobradas por el dueño de su caja",
          sql("select count(*) from ventas where \"cajaId\" is not null and \"paidById\" is null") == "0")
verificar("Se creó la 'Caja Principal'", registro("Caja Principal") is not None)
verificar("Cada turno anterior tiene su cajero (cerrados con salida)",
          sql("select count(*) from cash_session_members m join cajas_chicas c on c.id = m.\"sessionId\" where (c.estado = 'CERRADA') = (m.\"leftAt\" is null)") == "0")
st, r = cajero.api("POST", "/caja/cierre", {"cajaId": e["caja"]["id"], "montoCierreConteo": e["caja"]["saldoTeoricoEfectivo"]})
verificar("El turno anterior se cierra normalmente", st == 200 and r["diferencia"] == 0, (st, r))
for nav in (admin, vendedor):
    c = estado(nav)
    if c["abierta"]:
        nav.api("POST", "/caja/cierre", {"cajaId": c["caja"]["id"], "montoCierreConteo": c["caja"]["saldoTeoricoEfectivo"]})
verificar("Sin turno, el estado lista las cajas para abrir", not estado(cajero)["abierta"] and len(estado(cajero)["registers"]) >= 1)

print("\n=== Administración de cajas ===")
verificar("Un cajero no administra cajas → 403", cajero.api("POST", "/caja/registros", {"name": "Caja X"})[0] == 403)
st, r = admin.api("POST", "/caja/registros", {"name": "Caja 2"})
verificar("El administrador crea 'Caja 2'", st == 201, (st, r))
verificar("Nombre repetido → 409", admin.api("POST", "/caja/registros", {"name": "Caja 2"})[0] == 409)
verificar("Nombre vacío → 400", admin.api("POST", "/caja/registros", {"name": " "})[0] == 400)
C1, C2 = registro("Caja Principal")["id"], registro("Caja 2")["id"]
st, r = cajero.api("POST", "/caja/apertura", {"montoInicial": 100})
verificar("Con dos cajas activas hay que elegir cuál abrir → 400", st == 400 and "Elija" in r.get("error", ""), (st, r))
verificar("Monto inicial negativo → 400", cajero.api("POST", "/caja/apertura", {"cashRegisterId": C1, "montoInicial": -5})[0] == 400)

print("\n=== Turno compartido ===")
cajero2 = entrar("cajero2", "cajero2Clave2026")
if cajero2.api("GET", "/caja/estado-actual")[0] != 200:
    admin.api("POST", "/personal", {"name": "Cajera Dos", "user": "cajero2", "pass": "Temporal123", "role": "CAJERO", "modules": ["caja"]})
    cajero2 = entrar("cajero2", "Temporal123")
    cajero2.api("POST", "/auth/change-password", {"currentPassword": "Temporal123", "newPassword": "cajero2Clave2026"})
st, r = cajero.api("POST", "/caja/apertura", {"cashRegisterId": C1, "montoInicial": 100})
verificar("El cajero abre la Caja Principal con S/ 100", st == 201, (st, r))
SES = r["caja"]["id"]
st, r = cajero2.api("POST", "/caja/apertura", {"cashRegisterId": C1, "montoInicial": 50})
verificar("Otro cajero no puede abrir la misma caja → 409 (debe unirse)", st == 409 and "únase" in r.get("error", ""), (st, r))
reg = next(x for x in estado(cajero2)["registers"] if x["id"] == C1)
verificar("La cajera 2 ve el turno abierto y quién lo abrió", reg["session"]["id"] == SES and reg["session"]["openedBy"] == "Cajero", reg)
st, r = cajero2.api("POST", f"/caja/turnos/{SES}/unirse", {})
verificar("La cajera 2 se une al turno", st == 200, (st, r))
verificar("Unirse dos veces → 409", cajero2.api("POST", f"/caja/turnos/{SES}/unirse", {})[0] == 409)
verificar("Estando en un turno no puede abrir otra caja → 409", cajero2.api("POST", "/caja/apertura", {"cashRegisterId": C2, "montoInicial": 0})[0] == 409)
e = estado(cajero)
verificar("Ambos cajeros aparecen en el turno", sorted(m["name"] for m in e["caja"]["members"]) == ["Cajera Dos", "Cajero"], e["caja"]["members"])

configurar(admin, saleFlowMode="SEPARATE_CASHIER")
p1, (st1, r1) = pedido_cobrado(cajero, 3)
p2, (st2, r2) = pedido_cobrado(cajero2, 5)
verificar("Ambos cobran pedidos en el mismo turno", st1 == 200 and st2 == 200, (r1, r2))
verificar("Cada venta guarda quién la cobró",
          sql(f"select string_agg(u.\"user\", ',' order by v.id) from ventas v join usuarios u on u.id = v.\"paidById\" where v.id in ({p1},{p2})") == "cajero,cajero2")
verificar("Y ambas quedan en el mismo turno", sql(f"select count(distinct \"cajaId\") from ventas where id in ({p1},{p2})") == "1")
e = estado(cajero2)["caja"]
por = {c["name"]: c for c in e["byCashier"]}
verificar("El turno suma lo de ambos (100 + 30 + 50 = 180)", e["saldoTeoricoEfectivo"] == 180, e)
verificar("Desglose por cajero: 30 y 50", por["Cajero"]["cash"] == 30 and por["Cajera Dos"]["cash"] == 50, e["byCashier"])

print("\n=== Salir y cerrar ===")
verificar("El vendedor (no es del turno) no puede cerrarlo → 403",
          vendedor.api("POST", "/caja/cierre", {"cajaId": SES, "montoCierreConteo": 180})[0] == 403)
st, r = cajero2.api("POST", f"/caja/turnos/{SES}/salir", {})
verificar("La cajera 2 sale del turno sin cerrarlo", st == 200, (st, r))
pid, (st, r) = pedido_cobrado(cajero2, 1)
verificar("Fuera del turno ya no puede cobrar → 400", st == 400 and "turno" in r.get("error", ""), (st, r))
cajero.api("POST", f"/pedidos/{pid}/cobrar", {"docType": "Nota de Venta", "payMethod": "Efectivo"})
st, r = cajero.api("POST", f"/caja/turnos/{SES}/salir", {})
verificar("El último cajero no puede salir sin cerrar → 409", st == 409, (st, r))
st, r = cajero2.api("POST", f"/caja/turnos/{SES}/unirse", {})
verificar("Puede volver a unirse", st == 200, (st, r))
st, r = admin.api("PUT", f"/caja/registros/{C1}", {"active": False})
verificar("No se desactiva una caja con turno abierto → 409", st == 409, (st, r))
with ThreadPoolExecutor(max_workers=2) as ex:
    cierres = list(ex.map(lambda nav: nav.api("POST", "/caja/cierre", {"cajaId": SES, "montoCierreConteo": 185}), [cajero, cajero2]))
verificar("Dos cajeros cierran a la vez: solo uno lo logra", sorted(s for s, _ in cierres) == [200, 400] or sorted(s for s, _ in cierres) == [200, 409],
          [s for s, _ in cierres])
ok = next(r for s, r in cierres if s == 200)
verificar("Arqueo del turno: esperado 190 (100 + 30 + 50 + 10), contado 185 → faltan 5", ok["saldoTeorico"] == 190 and ok["diferencia"] == -5, ok)
verificar("Al cerrar, ambos quedan fuera del turno", not estado(cajero)["abierta"] and not estado(cajero2)["abierta"])
aud = admin.api("GET", "/auditoria?action=CASH_CLOSED")[1]["items"][0]
verificar("La auditoría del cierre detalla lo de cada cajero", aud["entityId"] == str(SES) and len(aud["details"]["cajeros"]) == 2, aud)

print("\n=== Carreras al abrir ===")
st, r = admin.api("POST", "/caja/registros", {"name": "Caja 3"})
C3 = r["id"]
with ThreadPoolExecutor(max_workers=2) as ex:
    aperturas = list(ex.map(lambda nav: nav.api("POST", "/caja/apertura", {"cashRegisterId": C3, "montoInicial": 20}), [cajero, cajero2]))
verificar("Dos cajeros abren la misma caja a la vez: solo uno lo logra", sorted(s for s, _ in aperturas) == [201, 409], [s for s, _ in aperturas])
verificar("La base tiene un solo turno abierto en esa caja", sql(f"select count(*) from cajas_chicas where \"cashRegisterId\" = {C3} and estado = 'ABIERTA'") == "1")
for nav in (cajero, cajero2):
    c = estado(nav)
    if c["abierta"]:
        nav.api("POST", "/caja/cierre", {"cajaId": c["caja"]["id"], "montoCierreConteo": c["caja"]["saldoTeoricoEfectivo"]})

print("\n=== Activar y desactivar ===")
st, r = admin.api("PUT", f"/caja/registros/{C3}", {"active": False})
verificar("Desactivar una caja cerrada", st == 200 and r["active"] is False, (st, r))
verificar("Una caja desactivada no se puede abrir → 404", cajero.api("POST", "/caja/apertura", {"cashRegisterId": C3, "montoInicial": 0})[0] == 404)
verificar("…ni aparece para abrir", all(x["id"] != C3 for x in estado(cajero)["registers"]))
# Deja la Caja Principal como única activa (las pruebas anteriores de la cadena crean otras cajas).
for otra in estado_admin_registros():
    if otra["id"] != C1 and otra["active"]:
        admin.api("PUT", f"/caja/registros/{otra['id']}", {"active": False})
st, r = admin.api("PUT", f"/caja/registros/{C1}", {"active": False})
verificar("No se puede desactivar la última caja activa → 409", st == 409, (st, r))
st, r = admin.api("PUT", f"/caja/registros/{C2}", {"active": True, "name": "Caja Mostrador"})
verificar("Reactivar y renombrar", st == 200 and r["name"] == "Caja Mostrador" and r["active"], (st, r))

print("\n=== Venta directa ===")
configurar(admin, saleFlowMode="DIRECT")
st, r = venta(vendedor, [(ID["CLA"], 1)], 10)
verificar("Sin turno el vendedor no puede cobrar en el POS → 400", st == 400 and "turno" in r.get("error", ""), (st, r))
vendedor.api("POST", "/caja/apertura", {"cashRegisterId": C1, "montoInicial": 0})
st, r = venta(vendedor, [(ID["CLA"], 1)], 10)
verificar("Con turno sí, y queda como cobrador", st == 201 and r["venta"]["paidById"] == int(sql("select id from usuarios where \"user\" = 'vendedor'")), (st, r))
c = estado(vendedor)
vendedor.api("POST", "/caja/cierre", {"cajaId": c["caja"]["id"], "montoCierreConteo": c["caja"]["saldoTeoricoEfectivo"]})

resumen()
