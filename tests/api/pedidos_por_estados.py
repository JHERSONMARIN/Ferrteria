from concurrent.futures import ThreadPoolExecutor

from lib import *  # noqa: F401,F403


def modo(admin, flow, modulos=None):
    return modo_en_sucursal(admin, flow, modulos)


pedido = lambda nav, items, total: nav.api("POST", "/pedidos", {"cart": [{"id": i, "qty": q} for i, q in items], "totalEsperado": total})
cobrar = lambda nav, pid, **extra: nav.api("POST", f"/pedidos/{pid}/cobrar", {"docType": "Boleta", "payMethod": "Efectivo", **extra})

# ---------- Preparación ----------
admin = Navegador()
admin.api("POST", "/auth/login", {"user": "admin", "pass": CLAVE_TEMPORAL})
admin.api("POST", "/auth/change-password", {"currentPassword": CLAVE_TEMPORAL, "newPassword": "AdminRegresion2026"})
for code, name, stk, price in [("P1", "Cemento", 20, 10), ("P2", "Fierro", 5, 20), ("P3", "Clavos", 50, 1)]:
    admin.api("POST", "/productos", {"code": code, "name": name, "unit": "Unidad", "stock": stk, "price": price, "category": "General"})
ID = {c: int(sql(f"select id from productos where code = '{c}'")) for c in ("P1", "P2", "P3")}
vendedor = usuario(admin, "vendedor", ["pos"], "VENDEDOR")
cajero = usuario(admin, "cajero", ["caja"], "CAJERO")
almacen = usuario(admin, "almacen", ["despacho"], "VENDEDOR")
# Desde la Fase 6 las cajas son físicas y compartidas: el cajero tiene su propia caja para que su
# arqueo quede separado del del administrador, como antes.
caja_cajero = admin.api("POST", "/caja/registros", {"name": "Caja Cajero"})[1]["id"]
caja_principal = int(sql("select id from cash_registers where name = 'Caja Principal'"))
admin.api("POST", "/caja/apertura", {"cashRegisterId": caja_principal, "montoInicial": 100})
cajero.api("POST", "/caja/apertura", {"cashRegisterId": caja_cajero, "montoInicial": 50})

print("=== Modo DIRECTO (por defecto) ===")
st, r = pedido(vendedor, [(ID["P1"], 1)], 10)
verificar("No se pueden crear pedidos en modo directo → 409", st == 409 and r.get("codigo") == "MODO_DIRECTO", (st, r))
st, r = admin.api("POST", "/ventas", {"docType": "Nota de Venta", "payMethod": "Efectivo", "cart": [{"id": ID["P1"], "qty": 1}], "totalEsperado": 10})
verificar("Venta directa sigue funcionando y queda DESPACHADA", st == 201 and r["venta"]["status"] == "DISPATCHED", (st, r))
verificar("…y descuenta el stock", stock("P1") == (19, 0), stock("P1"))

print("\n=== Cambio de modo ===")
modulos_sin_despacho = [m for m in admin.api("GET", "/settings")[1]["settings"]["enabledModules"] if m != "despacho"]
st, r = modo(admin, "STAGED", modulos_sin_despacho)
verificar("Por etapas sin módulo Despacho activo → 400", st == 400 and "Despacho" in r.get("error", ""), (st, r))
st, r = modo(admin, "STAGED")
verificar("Cambio a modo POR ETAPAS", st == 200 and r["settings"]["saleFlowMode"] == "STAGED", (st, r))
st, r = admin.api("POST", "/ventas", {"docType": "Nota de Venta", "payMethod": "Efectivo", "cart": [{"id": ID["P1"], "qty": 1}], "totalEsperado": 10})
verificar("La venta directa se bloquea en modo pedidos → 409", st == 409 and r.get("codigo") == "MODO_PEDIDOS", (st, r))

print("\n=== Pedido y reserva de stock ===")
st, r = pedido(vendedor, [(ID["P1"], 3)], 30)
verificar("Vendedor crea pedido", st == 201 and r["pedido"]["status"] == "PENDING_PAYMENT" and r["pedido"]["numDoc"] is None, (st, r))
p1 = r["pedido"]["id"]
verificar("Stock reservado, no descontado (19 en almacén, 3 reservados)", stock("P1") == (19, 3), stock("P1"))
prod = next(p for p in vendedor.api("GET", "/productos")[1] if p["code"] == "P1")
verificar("La API de productos informa lo reservado", prod["reserved"] == 3, prod)
st, r = pedido(vendedor, [(ID["P2"], 6)], 120)
verificar("Pedido por más del disponible → 409", st == 409 and "Disponible: 5" in r.get("error", ""), (st, r))
st, r = pedido(vendedor, [(ID["P2"], 5)], 100)
p2 = r["pedido"]["id"]
st, r = pedido(vendedor, [(ID["P2"], 1)], 20)
verificar("Con todo reservado, otro pedido del mismo producto → 409", st == 409 and "Disponible: 0" in r.get("error", ""), (st, r))
st, r = modo(admin, "DIRECT")
verificar("No se puede cambiar de modo con pedidos abiertos → 409", st == 409 and "pedido" in r.get("error", ""), (st, r))

print("\n=== Caja ===")
st, cola = cajero.api("GET", "/pedidos?status=PENDING_PAYMENT")
verificar("El cajero ve los 2 pedidos en su cola", st == 200 and {o["id"] for o in cola} == {p1, p2}, cola)
verificar("El vendedor no puede cobrar → 403", cobrar(vendedor, p1)[0] == 403)
verificar("Almacén no puede cobrar → 403", cobrar(almacen, p1)[0] == 403)
st, r = cobrar(cajero, p1, docType="Fiado") if False else cobrar(cajero, p1, payMethod="Fiado")
verificar("Fiado sin cliente → 400", st == 400 and "cliente" in r.get("error", ""), (st, r))
caja_antes = float(sql("select \"ventasEfectivo\" from cajas_chicas c join usuarios u on u.id = c.\"usuarioId\" where u.\"user\" = 'cajero' and estado = 'ABIERTA'"))
st, r = cobrar(cajero, p1)
verificar("Cajero cobra: queda PAGADO con boleta", st == 200 and r["pedido"]["status"] == "PAID" and r["pedido"]["numDoc"].startswith("B001-"), (st, r))
caja_despues = float(sql("select \"ventasEfectivo\" from cajas_chicas c join usuarios u on u.id = c.\"usuarioId\" where u.\"user\" = 'cajero' and estado = 'ABIERTA'"))
verificar("El dinero entra en la caja del cajero (+30)", caja_despues - caja_antes == 30, (caja_antes, caja_despues))
verificar("En modo por etapas el stock sigue reservado hasta el despacho", stock("P1") == (19, 3), stock("P1"))
verificar("Cobrar dos veces → 409", cobrar(cajero, p1)[0] == 409)

print("\n=== Despacho ===")
verificar("El cajero no puede despachar → 403", cajero.api("POST", f"/pedidos/{p1}/despachar", {})[0] == 403)
st, r = almacen.api("POST", f"/pedidos/{p2}/despachar", {})
verificar("No se despacha un pedido sin cobrar → 409", st == 409 and "cobrado" in r.get("error", ""), (st, r))
st, r = almacen.api("POST", f"/pedidos/{p1}/despachar", {})
verificar("Almacén despacha el pedido pagado", st == 200 and r["pedido"]["status"] == "DISPATCHED", (st, r))
verificar("Recién ahora sale del almacén (16) y se libera la reserva", stock("P1") == (16, 0), stock("P1"))
kardex = sql(f"select count(*) from movimientos_kardex where \"productoId\" = {ID['P1']} and ref like '%despacho%'")
verificar("Se registró la salida en el kardex", kardex == "1", kardex)
verificar("Despachar dos veces → 409", almacen.api("POST", f"/pedidos/{p1}/despachar", {})[0] == 409)

print("\n=== Anulación y vencimiento ===")
st, r = vendedor.api("POST", f"/pedidos/{p2}/anular", {})
verificar("El vendedor anula su pedido pendiente", st == 200 and r["pedido"]["status"] == "CANCELLED", (st, r))
verificar("…y el stock reservado vuelve al disponible", stock("P2") == (5, 0), stock("P2"))
verificar("No se anula un pedido ya cobrado → 409", vendedor.api("POST", f"/pedidos/{p1}/anular", {})[0] == 409)
st, r = pedido(vendedor, [(ID["P3"], 10)], 10)
p3 = r["pedido"]["id"]
sql(f"update ventas set \"expiresAt\" = now() - interval '1 minute' where id = {p3}")
cajero.api("GET", "/pedidos?status=PENDING_PAYMENT")
motivo = sql(f"select status || '|' || coalesce(\"cancelReason\", '') from ventas where id = {p3}")
verificar("Un pedido vencido se anula solo al consultar la cola", motivo == "CANCELLED|Vencido al cierre del día", motivo)
verificar("…y libera su stock", stock("P3") == (50, 0), stock("P3"))
verificar("Un pedido vencido no se puede cobrar → 409", cobrar(cajero, p3)[0] == 409)

print("\n=== Concurrencia ===")
with ThreadPoolExecutor(max_workers=8) as ex:
    res = list(ex.map(lambda _: pedido(vendedor, [(ID["P2"], 1)], 20), range(8)))
ok = [r["pedido"]["id"] for s, r in res if s == 201]
verificar("8 pedidos simultáneos por un producto con 5 unidades: solo 5 se aceptan", len(ok) == 5, [s for s, _ in res])
verificar("…con exactamente 5 reservadas", stock("P2") == (5, 5), stock("P2"))
objetivo = ok[0]
with ThreadPoolExecutor(max_workers=2) as ex:
    pagos = list(ex.map(lambda nav: cobrar(nav, objetivo), [admin, cajero]))
verificar("Dos cajeros cobran el mismo pedido a la vez: solo uno lo logra", sorted(s for s, _ in pagos) == [200, 409], [s for s, _ in pagos])
cobros = sql(f"select count(*) from ventas where id = {objetivo} and status = 'PAID'")
verificar("…el pedido quedó cobrado una sola vez", cobros == "1", cobros)
for pid in ok[1:]:
    vendedor.api("POST", f"/pedidos/{pid}/anular", {})
almacen.api("POST", f"/pedidos/{objetivo}/despachar", {})

print("\n=== Cotización en modo pedidos ===")
st, r = vendedor.api("POST", "/cotizaciones", {"cart": [{"id": ID["P3"], "qty": 2}], "validDays": 7})
cot = r["cotizacion"]
st, r = vendedor.api("POST", "/pedidos", {"cart": [{"id": ID["P3"], "qty": 2}], "cotizacionId": cot["id"], "totalEsperado": 2})
pc = r["pedido"]["id"]
verificar("La cotización sigue PENDIENTE mientras el pedido no se cobra", sql(f"select status from cotizaciones where id = {cot['id']}") == "PENDIENTE")
cobrar(cajero, pc)
verificar("Al cobrar el pedido, la cotización pasa a CONVERTIDO", sql(f"select status from cotizaciones where id = {cot['id']}") == "CONVERTIDO")
almacen.api("POST", f"/pedidos/{pc}/despachar", {})

print("\n=== Modo VENDEDOR Y CAJA ===")
st, r = modo(admin, "SEPARATE_CASHIER")
verificar("Cambio a modo vendedor y caja (sin pedidos abiertos)", st == 200, (st, r))
st, r = pedido(vendedor, [(ID["P3"], 4)], 4)
ps = r["pedido"]["id"]
antes = stock("P3")
st, r = cobrar(cajero, ps)
verificar("Al cobrar, el pedido queda entregado en el acto", st == 200 and r["pedido"]["status"] == "DISPATCHED", (st, r))
verificar("…y el stock sale del almacén en ese momento", stock("P3") == (antes[0] - 4, 0), (antes, stock("P3")))

print("\n=== Reportes y regreso a modo directo ===")
pagadas = sql("select count(*) from ventas where status in ('PAID', 'DISPATCHED')")
st, r = admin.api("GET", "/dashboard/stats")
verificar("El dashboard solo cuenta ventas cobradas (no pedidos anulados)", r.get("salesCount") == int(pagadas), (r.get("salesCount"), pagadas))
st, r = modo(admin, "DIRECT")
verificar("Regreso a modo directo", st == 200 and r["settings"]["saleFlowMode"] == "DIRECT", (st, r))

resumen()
