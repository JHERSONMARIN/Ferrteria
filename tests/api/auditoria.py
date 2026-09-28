
from lib import *  # noqa: F401,F403


def ultimo(accion=None):
    q = f"/auditoria?action={accion}" if accion else "/auditoria"
    items = admin.api("GET", q)[1]["items"]
    return items[0] if items else None


def cuenta(accion):
    return admin.api("GET", f"/auditoria?action={accion}")[1]["total"]


admin = entrar("admin", "AdminFase5_2026")
vendedor = entrar("vendedor", "vendedorClave2026")
cajero = entrar("cajero", "cajeroClave2026")
ID = {c: int(sql(f"select id from productos where code = '{c}'")) for c in ("CAB", "CEM", "CLA")}
MIN = int(sql("select id from clientes where doc = '41112222'"))
VEND_ID = int(sql("select id from usuarios where \"user\" = 'vendedor'"))

# Estado inicial conocido, por si una corrida anterior se cortó a la mitad.
for o in cajero.api("GET", "/pedidos?status=PENDING_PAYMENT")[1]:
    cajero.api("POST", f"/pedidos/{o['id']}/anular", {})
configurar(admin, saleFlowMode="DIRECT", maxDiscountPercent=10)
for nav in (admin, vendedor, cajero):
    nav.api("POST", "/caja/apertura", {"montoInicial": 50})

print("=== Acceso ===")
verificar("Vendedor no puede ver la auditoría → 403", vendedor.api("GET", "/auditoria")[0] == 403)
verificar("Cajero tampoco → 403", cajero.api("GET", "/auditoria")[0] == 403)
st, r = admin.api("GET", "/auditoria")
verificar("El administrador sí, con el catálogo de acciones", st == 200 and "PRICE_CHANGED" in r["actions"], (st, r))

print("\n=== Cambios de precio ===")
cem = next(p for p in admin.api("GET", "/productos")[1] if p["code"] == "CEM")
base = {k: cem[k] for k in ("code", "name", "unit", "category")}
st, r = admin.api("PUT", f"/productos/{ID['CEM']}", {**base, "price": 32, "wholesalePrice": 27})
e = ultimo("PRICE_CHANGED")
verificar("Subir el precio 30 → 32 queda registrado con antes/después",
          st == 200 and e and e["details"] == {"price": {"before": 30, "after": 32}} and e["userName"] == "Administrador", (st, e))
antes = cuenta("PRICE_CHANGED")
admin.api("PUT", f"/productos/{ID['CEM']}", {**base, "price": 32, "wholesalePrice": 27, "name": "Cemento Sol"})
verificar("Cambiar solo el nombre no genera registro de precio", cuenta("PRICE_CHANGED") == antes)
admin.api("PUT", f"/productos/{ID['CEM']}", {**base, "price": 30, "wholesalePrice": None})
e = ultimo("PRICE_CHANGED")
verificar("Quitar el precio mayorista también se registra", e["details"].get("wholesalePrice") == {"before": 27, "after": None}, e)
admin.api("PUT", f"/productos/{ID['CEM']}", {**base, "price": 30, "wholesalePrice": 27})
print("\n=== Descuentos ===")
configurar(admin, maxDiscountPercent=10)
antes = cuenta("DISCOUNT_APPLIED")
st, r = venta(vendedor, [(ID["CLA"], 10)], 90, discount={"type": "PERCENT", "value": 10})
e = ultimo("DISCOUNT_APPLIED")
verificar("El descuento del vendedor queda registrado a su nombre",
          st == 201 and e["userName"] == "Vendedor" and e["details"]["discount"] == 10 and r["venta"]["numDoc"] in e["summary"], (st, e))
venta(vendedor, [(ID["CLA"], 10)], 80, discount={"type": "PERCENT", "value": 20})
verificar("Un descuento rechazado (sobre el tope) no deja registro", cuenta("DISCOUNT_APPLIED") == antes + 1)
venta(vendedor, [(ID["CLA"], 1)], 10)
verificar("Una venta sin descuento no deja registro", cuenta("DISCOUNT_APPLIED") == antes + 1)

print("\n=== Configuración ===")
st, r = configurar(admin, saleFlowMode="SEPARATE_CASHIER", maxDiscountPercent=15)
# Desde que el modo es de cada sucursal, el cambio de modo se registra aparte, sobre la sucursal.
modo_reg, tope_reg = admin.api("GET", "/auditoria?action=SETTINGS_CHANGED")[1]["items"][:2]
verificar("El cambio de modo y de tope se registra campo por campo",
          st == 200 and modo_reg["entity"] == "Sucursal"
          and modo_reg["details"]["saleFlowMode"] == {"before": "DIRECT", "after": "SEPARATE_CASHIER"}
          and tope_reg["details"]["maxDiscountPercent"] == {"before": 10, "after": 15}, (st, modo_reg, tope_reg))
antes = cuenta("SETTINGS_CHANGED")
configurar(admin)
verificar("Guardar sin cambios no genera registro", cuenta("SETTINGS_CHANGED") == antes)

print("\n=== Anulación de pedidos ===")
st, r = vendedor.api("POST", "/pedidos", {"cart": [{"id": ID["CLA"], "qty": 2}], "totalEsperado": 20})
pid = r["pedido"]["id"]
cajero.api("POST", f"/pedidos/{pid}/anular", {"reason": "Cliente se arrepintió"})
e = ultimo("SALE_CANCELLED")
verificar("La anulación queda con motivo y quién anuló",
          e and e["entityId"] == str(pid) and "Cliente se arrepintió" in e["summary"] and e["userName"] == "Cajero", e)
st, r = vendedor.api("POST", "/pedidos", {"cart": [{"id": ID["CLA"], "qty": 1}], "totalEsperado": 10})
pid2 = r["pedido"]["id"]
sql(f"update ventas set \"expiresAt\" = now() - interval '1 minute' where id = {pid2}")
cajero.api("GET", "/pedidos?status=PENDING_PAYMENT")
e = ultimo("SALE_CANCELLED")
verificar("Un pedido vencido queda anulado a nombre de 'Sistema'", e["entityId"] == str(pid2) and e["userName"] == "Sistema" and e["userId"] is None, e)
st, r = cajero.api("POST", f"/pedidos/{pid}/anular", {})
verificar("Anular de nuevo falla y no duplica el registro",
          st == 409 and sum(1 for i in admin.api("GET", "/auditoria?action=SALE_CANCELLED")[1]["items"] if i["entityId"] == str(pid)) == 1, (st, r))
configurar(admin, saleFlowMode="DIRECT")

print("\n=== Stock, clientes y cotizaciones ===")
sql("update productos set \"allowsFractions\" = true where code = 'CAB'")
admin.api("POST", "/kardex", {"productoId": ID["CAB"], "type": "SALIDA", "qty": 1.5, "ref": "Merma por corte"})
e = ultimo("STOCK_ADJUSTED")
verificar("Ajuste manual de kardex registrado con stock antes/después",
          e and e["details"]["qty"] == 1.5 and e["details"]["stockAfter"] == e["details"]["stockBefore"] - 1.5 and "Merma" in e["summary"], e)
st, r = admin.api("PUT", f"/productos/{ID['CAB']}", {"code": "CAB", "name": "Cable 14 AWG", "unit": "Metro", "category": "General", "price": 2.5, "allowsFractions": False})
verificar("Quitar fracciones con stock decimal → 400 (validación real, no por datos incompletos)",
          st == 400 and "decimales" in r.get("error", ""), (st, r))

admin.api("PUT", f"/clientes/{MIN}/max-credit", {"maxCredit": 2500})
e = ultimo("CREDIT_LIMIT_CHANGED")
verificar("Cambio de límite de crédito registrado", e and e["details"]["maxCredit"]["after"] == 2500, e)
antes = cuenta("CREDIT_LIMIT_CHANGED")
admin.api("PUT", f"/clientes/{MIN}/max-credit", {"maxCredit": 2500})
verificar("Mismo límite: sin registro", cuenta("CREDIT_LIMIT_CHANGED") == antes)
admin.api("PUT", f"/clientes/{MIN}/price-list", {"priceList": "WHOLESALE"})
e = ultimo("PRICE_LIST_CHANGED")
verificar("Cambio a lista mayorista registrado", e and "minorista → mayorista" in e["summary"], e)
admin.api("PUT", f"/clientes/{MIN}/price-list", {"priceList": "RETAIL"})
st, r = vendedor.api("POST", "/cotizaciones", {"clienteId": MIN, "validDays": 7, "cart": [{"id": ID["CLA"], "qty": 3}]})
cot = r["cotizacion"]
verificar("El vendedor no puede anular cotizaciones → 403", vendedor.api("DELETE", f"/cotizaciones/{cot['id']}")[0] == 403)
admin.api("DELETE", f"/cotizaciones/{cot['id']}")
e = ultimo("QUOTE_CANCELLED")
verificar("Anulación de cotización registrada", e and cot["numDoc"] in e["summary"] and e["userName"] == "Administrador", e)

print("\n=== Envíos ===")
st, r = admin.api("POST", "/ventas", {"docType": "Nota de Venta", "payMethod": "Efectivo", "cart": [{"id": ID["CLA"], "qty": 1}],
                                      "totalEsperado": 10, "delivery": {"type": "DELIVERY", "address": "Jr. Amazonas 123, Cajamarca"}})
if st == 201 and r["venta"].get("delivery"):
    eid = int(sql(f"select id from entregas where ref = '{r['venta']['delivery']['ref']}'"))
    admin.api("POST", f"/entregas/{eid}/cancelar", {"reason": "Recoge en tienda"})
    e = ultimo("DELIVERY_CANCELLED")
    verificar("Cancelación de envío registrada con motivo", e and "Recoge en tienda" in e["summary"], e)
    # Sin envío, la venta queda por despachar en tienda: se despacha para no dejar nada pendiente a la siguiente prueba.
    admin.api("POST", f"/pedidos/{r['venta']['id']}/despachar", {})
else:
    verificar("Venta con envío para probar la cancelación", False, (st, r))

print("\n=== Personal ===")
st, r = admin.api("POST", "/personal", {"name": "Temporal", "user": "temporal", "pass": "Temporal123", "role": "VENDEDOR", "modules": ["pos"]})
tid = r["id"]
e = ultimo("USER_CREATED")
verificar("Alta de usuario registrada", e and "temporal" in e["summary"], e)
admin.api("PUT", f"/personal/{tid}", {"name": "Temporal", "user": "temporal", "role": "CAJERO", "modules": ["pos", "caja"], "pass": "NuevaClave123"})
e = ultimo("USER_UPDATED")
verificar("Cambio de rol, módulos y clave registrado",
          e and e["details"]["role"] == {"before": "VENDEDOR", "after": "CAJERO"} and e["details"]["modules"]["after"] == ["pos", "caja"]
          and e["details"]["password"]["after"] == "restablecida", e)
verificar("La auditoría nunca guarda la contraseña ni su hash",
          sql("select count(*) from audit_logs where details::text ilike '%NuevaClave%' or details::text ilike '%scrypt$%'") == "0")
admin.api("DELETE", f"/personal/{tid}")
e = ultimo("USER_DELETED")
verificar("Baja de usuario registrada", e and "temporal" in e["summary"], e)
e_alta = next(i for i in admin.api("GET", "/auditoria?action=USER_CREATED")[1]["items"] if i["entityId"] == str(tid))
verificar("Los registros del usuario borrado se conservan", e_alta is not None)

print("\n=== Caja ===")
st, r = vendedor.api("GET", "/caja/estado-actual")
caja = r["caja"]
st, r = vendedor.api("POST", "/caja/cierre", {"cajaId": caja["id"], "montoCierreConteo": caja["saldoTeoricoEfectivo"] - 5})
e = ultimo("CASH_CLOSED")
verificar("Cierre de caja registrado con faltante de S/ 5", st == 200 and e and e["details"]["diferencia"] == -5 and e["userName"] == "Vendedor", (st, e))
vendedor.api("POST", "/caja/apertura", {"montoInicial": 50})

print("\n=== Filtros ===")
st, r = admin.api("GET", f"/auditoria?userId={VEND_ID}")
verificar("Filtro por usuario", st == 200 and r["total"] > 0 and all(i["userId"] == VEND_ID for i in r["items"]), r["total"])
hoy = sql("select to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD')")
st, r = admin.api("GET", f"/auditoria?from={hoy}&to={hoy}")
verificar("Filtro por fecha de hoy", st == 200 and r["total"] == admin.api("GET", "/auditoria")[1]["total"], r["total"])
st, r = admin.api("GET", "/auditoria?from=2020-01-01&to=2020-01-31")
verificar("Rango sin registros → 0", st == 200 and r["total"] == 0, r["total"])
verificar("Fecha mal escrita → 400", admin.api("GET", "/auditoria?from=18/09/2026")[0] == 400)
verificar("Acción desconocida → 400", admin.api("GET", "/auditoria?action=HACK")[0] == 400)
st, r = admin.api("GET", "/auditoria?page=999")
verificar("Página fuera de rango → lista vacía", st == 200 and r["items"] == [], r)

resumen()
