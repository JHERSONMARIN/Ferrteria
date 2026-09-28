from concurrent.futures import ThreadPoolExecutor

from lib import *  # noqa: F401,F403


def nuevo_repartidor(admin, user):
    admin.api("POST", "/personal", {"name": user.title(), "user": user, "pass": "Temporal123", "role": "REPARTIDOR", "modules": ["deliveries"]})
    nav = Navegador(user, "Temporal123")
    nav.api("POST", "/auth/change-password", {"currentPassword": "Temporal123", "newPassword": f"{user}Clave2026"})
    return nav


def modo(admin, flow):
    return modo_en_sucursal(admin, flow)


def buscar(nav, ref, finalizadas=False, mias=False):
    q = f"/entregas?estado={'finalizadas' if finalizadas else 'activas'}" + ("&mias=1" if mias else "")
    return next((d for d in nav.api("GET", q)[1] if d["ref"] == ref), None)


admin = Navegador("admin", "AdminRegresion2026")
vendedor = Navegador("vendedor", "vendedorClave2026")
cajero = Navegador("cajero", "cajeroClave2026")
almacen = Navegador("almacen", "almacenClave2026")
rep = nuevo_repartidor(admin, "repartidor")
rep2 = nuevo_repartidor(admin, "repartidor2")
P3 = int(sql("select id from productos where code = 'P3'"))
ENVIO = {"type": "DELIVERY", "address": "Jr. Lima 456, Cajamarca", "contactPhone": "976 111 222", "notes": "Portón verde"}

print("=== Permisos ===")
verificar("El vendedor (sin módulo Entregas) no ve entregas → 403", vendedor.api("GET", "/entregas")[0] == 403)
verificar("El cajero tampoco → 403", cajero.api("GET", "/entregas")[0] == 403)
verificar("El repartidor sí", rep.api("GET", "/entregas")[0] == 200)

print("\n=== Envío en modo POR ETAPAS ===")
modo(admin, "STAGED")
st, r = vendedor.api("POST", "/pedidos", {"cart": [{"id": P3, "qty": 2}], "totalEsperado": 2})
pid = r["pedido"]["id"]
st, r = cajero.api("POST", f"/pedidos/{pid}/cobrar", {"docType": "Nota de Venta", "payMethod": "Efectivo", "delivery": {**ENVIO, "address": "abc"}})
verificar("Dirección demasiado corta → 400", st == 400 and "dirección" in r.get("error", ""), (st, r))
verificar("…y el pedido sigue sin cobrar (nada quedó a medias)", sql(f"select status from ventas where id = {pid}") == "PENDING_PAYMENT")
stock_antes = stock("P3")
st, r = cajero.api("POST", f"/pedidos/{pid}/cobrar", {"docType": "Nota de Venta", "payMethod": "Efectivo", "delivery": ENVIO})
ref = r.get("pedido", {}).get("delivery", {}) and r["pedido"]["delivery"]["ref"]
verificar("Cobro con envío: la entrega se crea con el número del comprobante", st == 200 and ref == f"ENT-{r['pedido']['numDoc']}", (st, r))
d = buscar(rep, ref)
verificar("Todos los repartidores la ven mientras espera despacho (sin asignar)",
          d is not None and d["courier"] is None and buscar(rep2, ref) is not None, d)
verificar("Aparece como esperando despacho", d and d["waitingDispatch"] is True, d)
verificar("Guarda contacto e indicaciones", d and d["contactPhone"] == "976 111 222" and d["notes"] == "Portón verde", d)
eid = d["id"]
st, r = rep.api("POST", f"/entregas/{eid}/salir", {})
verificar("No puede salir a repartir antes del despacho → 409", st == 409 and "almacén" in r.get("error", ""), (st, r))
verificar("Tampoco marcarla entregada → 409", rep.api("POST", f"/entregas/{eid}/entregar", {})[0] == 409)
st, r = almacen.api("POST", f"/pedidos/{pid}/despachar", {})
verificar("Sin repartidor no se despacha un envío → 400", st == 400 and "repartidor" in r.get("error", ""), (st, r))
rep_id = int(sql("select id from usuarios where \"user\" = 'repartidor'"))
st, r = rep.api("PATCH", f"/entregas/{eid}/repartidor", {"repartidorId": rep_id})
verificar("El repartidor solicita el pedido", st == 200 and r["courier"]["name"] == "Repartidor", (st, r))
st, r = rep2.api("PATCH", f"/entregas/{eid}/repartidor", {"repartidorId": rep_id})
verificar("Otro repartidor no puede quitárselo → 409", st == 409, (st, r))
st, r = almacen.api("POST", f"/pedidos/{pid}/despachar", {})
verificar("Almacén despacha al repartidor que lo solicitó", st == 200, (st, r))
verificar("La entrega no descuenta stock aparte: solo el despacho (−2)", stock("P3") == (stock_antes[0] - 2, stock_antes[1] - 2), (stock_antes, stock("P3")))
verificar("Tras el despacho ya está lista para salir", buscar(rep, ref)["waitingDispatch"] is False)
verificar("…y el otro repartidor ya no la ve", buscar(rep2, ref) is None)
st, r = rep.api("POST", f"/entregas/{eid}/salir", {})
verificar("Salir a repartir → EN CAMINO y queda a nombre del repartidor",
          st == 200 and r["status"] == "EN_CAMINO" and r["courier"]["name"] == "Repartidor" and r["departedAt"], (st, r))
verificar("Salir otra vez → 409", rep.api("POST", f"/entregas/{eid}/salir", {})[0] == 409)
st, r = rep.api("POST", f"/entregas/{eid}/entregar", {})
verificar("Entregado, con hora de entrega", st == 200 and r["status"] == "ENTREGADO" and r["deliveredAt"], (st, r))
verificar("Aparece en finalizadas", buscar(rep, ref, finalizadas=True) is not None)
verificar("No se cancela una entrega ya entregada → 409", admin.api("POST", f"/entregas/{eid}/cancelar", {})[0] == 409)

print("\n=== Envío en venta directa ===")
# Lo que dejó cobrado y sin despachar la prueba anterior impide cambiar de modo: se despacha.
for pendiente in sql("select id from ventas where status = 'PAID'").split():
    almacen.api("POST", f"/pedidos/{pendiente}/despachar", {})
st, r = modo(admin, "DIRECT")
verificar("Cambio a modo directo", st == 200, (st, r))
stock_antes = stock("P3")
st, r = admin.api("POST", "/ventas", {"docType": "Nota de Venta", "payMethod": "Efectivo", "cart": [{"id": P3, "qty": 3}], "totalEsperado": 3, "delivery": ENVIO})
verificar("Venta directa con envío", st == 201 and r["venta"]["delivery"]["ref"].startswith("ENT-"), (st, r))
ref2 = r["venta"]["delivery"]["ref"]
verificar("Hasta entregarlo al repartidor, el stock queda reservado (3)", stock("P3") == (stock_antes[0], stock_antes[1] + 3), (stock_antes, stock("P3")))
d2 = buscar(admin, ref2)
verificar("También en modo directo espera el despacho", d2["waitingDispatch"] is True, d2)
st, r = admin.api("POST", f"/entregas/{d2['id']}/cancelar", {"reason": "Cliente recoge mañana"})
verificar("Cancelar envío deja nota con el motivo", st == 200 and r["status"] == "CANCELADO" and "Cliente recoge mañana" in r["notes"], (st, r))
verificar("…y la venta sigue válida, por entregar en tienda", sql(f"select status from ventas where \"numDoc\" = '{ref2[4:]}'") == "PAID")
venta2 = int(sql(f"select id from ventas where \"numDoc\" = '{ref2[4:]}'"))
st, r = admin.api("POST", f"/pedidos/{venta2}/despachar", {})
verificar("Se entrega en tienda sin repartidor y recién ahí sale el stock (−3)",
          st == 200 and stock("P3") == (stock_antes[0] - 3, stock_antes[1]), (st, r, stock("P3")))

print("\n=== Programar envío de una venta ya cobrada ===")
st, r = admin.api("POST", "/ventas", {"docType": "Nota de Venta", "payMethod": "Efectivo", "cart": [{"id": P3, "qty": 1}], "totalEsperado": 1})
num = r["venta"]["numDoc"]
st, r = rep.api("GET", f"/entregas/venta/{num.lower()}")
verificar("Vista previa de la venta (acepta minúsculas)", st == 200 and r["numDoc"] == num and r["existingDelivery"] is None, (st, r))
st, r = rep.api("POST", "/entregas", {"numDoc": num, "address": "Av. Perú 100"})
verificar("Envío programado después de la venta", st == 201 and r["entrega"]["ref"] == f"ENT-{num}", (st, r))
eid3 = r["entrega"]["id"]
verificar("Programarlo dos veces → 409", rep.api("POST", "/entregas", {"numDoc": num, "address": "Av. Perú 100"})[0] == 409)
verificar("Comprobante inexistente → 404", rep.api("GET", "/entregas/venta/X999-000001")[0] == 404)

print("\n=== Asignación y 'mis entregas' ===")
vend_id = int(sql("select id from usuarios where \"user\" = 'vendedor'"))
rep2_id = int(sql("select id from usuarios where \"user\" = 'repartidor2'"))
st, r = admin.api("PATCH", f"/entregas/{eid3}/repartidor", {"repartidorId": vend_id})
verificar("No se asigna a quien no reparte (vendedor) → 400", st == 400, (st, r))
st, r = admin.api("PATCH", f"/entregas/{eid3}/repartidor", {"repartidorId": rep2_id})
verificar("Se asigna al repartidor 2", st == 200 and r["courier"]["id"] == rep2_id, (st, r))
verificar("Ya despachada, el repartidor 1 no la ve", buscar(rep, f"ENT-{num}") is None)
verificar("El repartidor 2 sí", buscar(rep2, f"ENT-{num}") is not None)

print("\n=== Concurrencia ===")
admin.api("PATCH", f"/entregas/{eid3}/repartidor", {"repartidorId": None})
with ThreadPoolExecutor(max_workers=2) as ex:
    salidas = list(ex.map(lambda nav: nav.api("POST", f"/entregas/{eid3}/salir", {}), [rep, rep2]))
verificar("Dos repartidores salen con la misma entrega a la vez: solo uno lo logra",
          sorted(s for s, _ in salidas) == [200, 409], [s for s, _ in salidas])

print("\n=== Entregas antiguas (sin venta) ===")
cli = sql("insert into clientes (type, doc, name, \"maxCredit\", \"updatedAt\") values ('NATURAL', '44556677', 'Cliente Antiguo', 1000, now()) on conflict (doc) do update set name = excluded.name returning id").splitlines()[0]
old = sql(f"insert into entregas (ref, address, status, \"updatedAt\", \"clienteId\") values ('ENT-0001', 'Calle Vieja 1', 'PENDIENTE', now(), {cli}) returning id").splitlines()[0]
d_old = buscar(admin, "ENT-0001")
verificar("Se siguen listando y se marcan como antiguas", d_old and d_old["legacy"] is True and d_old["contactName"] == "Cliente Antiguo", d_old)
st, r = admin.api("POST", f"/entregas/{old}/cancelar", {})
verificar("No se cancelan desde aquí (sacaron stock por su cuenta) → 409", st == 409 and "Kardex" in r.get("error", ""), (st, r))
verificar("…pero sí se pueden marcar entregadas", admin.api("POST", f"/entregas/{old}/entregar", {})[1].get("status") == "ENTREGADO")
verificar("Crear entrega sin venta ya no es posible → 404", admin.api("POST", "/entregas", {"address": "Sin venta 123"})[0] == 404)

resumen()
