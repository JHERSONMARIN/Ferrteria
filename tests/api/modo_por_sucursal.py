
from lib import *  # noqa: F401,F403


def nuevo(admin, user, modules, role, branch):
    admin.api("POST", "/personal", {"name": user.title(), "user": user, "pass": "Temporal123", "role": role, "modules": modules, "branchId": branch})
    nav = entrar(user, "Temporal123")
    nav.api("POST", "/auth/change-password", {"currentPassword": "Temporal123", "newPassword": f"{user}Clave2026"})
    return entrar(user, f"{user}Clave2026")

admin = entrar("admin", "AdminFase5_2026")
modo_en_sucursal(admin, "DIRECT")
cla = int(sql("select id from productos where code = 'CLA'"))
b2 = admin.api("POST", "/sucursales", {"name": "Modo Caja", "saleFlowMode": "SEPARATE_CASHIER"})[1]["id"]
b3 = admin.api("POST", "/sucursales", {"name": "Modo Etapas", "saleFlowMode": "STAGED"})[1]["id"]
for b in (b2, b3):
    admin.api("POST", "/transferencias", {"fromBranchId": 1, "toBranchId": b, "items": [{"id": cla, "qty": 20}]})
    admin.api("POST", "/caja/registros", {"name": f"Caja {b}", "branchId": b})
v1 = nuevo(admin, "mv1", ["pos", "caja"], "VENDEDOR", 1)
v2 = nuevo(admin, "mv2", ["pos"], "VENDEDOR", b2); c2 = nuevo(admin, "mc2", ["caja"], "CAJERO", b2)
v3 = nuevo(admin, "mv3", ["pos"], "VENDEDOR", b3); c3 = nuevo(admin, "mc3", ["caja"], "CAJERO", b3); d3 = nuevo(admin, "md3", ["despacho"], "VENDEDOR", b3)
for nav in (v1, c2, c3):
    e = nav.api("GET", "/caja/estado-actual")[1]
    reg = e["registers"][0]
    if reg["session"]:
        nav.api("POST", f"/caja/turnos/{reg['session']['id']}/unirse", {})
    else:
        nav.api("POST", "/caja/apertura", {"cashRegisterId": reg["id"], "montoInicial": 0})

print("=== Tres modos en la misma empresa ===")
verificar("La sesión informa el modo de la sucursal", v2.api("GET", "/auth/me")[1]["user"]["branch"]["saleFlowMode"] == "SEPARATE_CASHIER")
verificar("Sucursal directa: venta directa OK", venta(v1, [(cla, 1)], 10)[0] == 201)
verificar("Sucursal directa: no crea pedidos → 409", v1.api("POST", "/pedidos", {"cart": [{"id": cla, "qty": 1}], "totalEsperado": 10})[0] == 409)
st, r = v2.api("POST", "/ventas", {"docType": "Nota de Venta", "payMethod": "Efectivo", "cart": [{"id": cla, "qty": 1}], "totalEsperado": 10})
verificar("Sucursal vendedor y caja: venta directa bloqueada → 409 MODO_PEDIDOS", st == 409 and r.get("codigo") == "MODO_PEDIDOS", (st, r))
p2 = v2.api("POST", "/pedidos", {"cart": [{"id": cla, "qty": 1}], "totalEsperado": 10})[1]["pedido"]["id"]
st, r = c2.api("POST", f"/pedidos/{p2}/cobrar", {"docType": "Nota de Venta", "payMethod": "Efectivo"})
verificar("Vendedor y caja: al cobrar queda entregado", st == 200 and r["pedido"]["status"] == "DISPATCHED", (st, r))
p3 = v3.api("POST", "/pedidos", {"cart": [{"id": cla, "qty": 1}], "totalEsperado": 10})[1]["pedido"]["id"]
st, r = c3.api("POST", f"/pedidos/{p3}/cobrar", {"docType": "Nota de Venta", "payMethod": "Efectivo"})
verificar("Por etapas: al cobrar queda por despachar", st == 200 and r["pedido"]["status"] == "PAID", (st, r))
st, r = admin.api("PUT", f"/sucursales/{b3}", {"saleFlowMode": "DIRECT"})
verificar("No se cambia el modo de una sucursal con pedidos por despachar → 409", st == 409, (st, r))
cfg = admin.api("GET", "/settings")[1]["settings"]
st, r = admin.api("PUT", "/settings", {**cfg, "enabledModules": [m for m in cfg["enabledModules"] if m != "despacho"]})
verificar("No se desactiva Despacho mientras una sucursal trabaja por etapas → 400", st == 400 and "etapas" in r.get("error", ""), (st, r))
st, r = d3.api("POST", f"/pedidos/{p3}/despachar", {})
verificar("Almacén despacha", st == 200 and r["pedido"]["status"] == "DISPATCHED", (st, r))
st, r = admin.api("PUT", f"/sucursales/{b3}", {"saleFlowMode": "SEPARATE_CASHIER"})
verificar("Sin pedidos abiertos sí se cambia el modo", st == 200 and r["saleFlowMode"] == "SEPARATE_CASHIER", (st, r))
aud = admin.api("GET", "/auditoria?action=SETTINGS_CHANGED")[1]["items"][0]
verificar("El cambio de modo queda en la auditoría", "Por etapas → Vendedor y caja" in aud["summary"], aud["summary"])
verificar("Un vendedor no cambia modos → 403", v1.api("PUT", "/sucursales/1", {"saleFlowMode": "STAGED"})[0] == 403)
resumen()
