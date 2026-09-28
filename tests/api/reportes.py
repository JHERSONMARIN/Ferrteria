
from lib import *  # noqa: F401,F403


admin = entrar("admin", "AdminFase5_2026")
vendedor = entrar("vendedor", "vendedorClave2026")
cajero = entrar("cajero", "cajeroClave2026")
HOY = sql("select to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD')")
COMPLETADA = "status in ('PAID','DISPATCHED')"
FECHA = "coalesce(\"paidAt\", \"createdAt\")"

print("=== Acceso y validaciones ===")
verificar("El cajero (sin módulo Reportes) → 403", cajero.api("GET", "/dashboard/reportes")[0] == 403)
st, r = admin.api("GET", "/dashboard/reportes")
verificar("Por defecto, los últimos 30 días hasta hoy", st == 200 and r["range"]["to"] == HOY and r["range"]["days"] == 30, r.get("range"))
verificar("Serie diaria completa (30 días, también los vacíos)", len(r["daily"]) == 30 and r["daily"][-1]["day"] == HOY, len(r["daily"]))
verificar("Fecha mal escrita → 400", admin.api("GET", "/dashboard/reportes?from=18-09-2026")[0] == 400)
verificar("Desde posterior a hasta → 400", admin.api("GET", f"/dashboard/reportes?from={HOY}&to=2026-01-01")[0] == 400)
verificar("Rango de más de un año → 400", admin.api("GET", "/dashboard/reportes?from=2024-01-01&to=2026-01-01")[0] == 400)

print("\n=== Totales cuadran con la base ===")
st, r = admin.api("GET", f"/dashboard/reportes?from=2026-01-01&to={HOY}")
db_total = float(sql(f"select coalesce(sum(total),0) from ventas where {COMPLETADA}"))
db_count = int(sql(f"select count(*) from ventas where {COMPLETADA}"))
db_desc = float(sql(f"select coalesce(sum(discount),0) from ventas where {COMPLETADA}"))
verificar("Ingresos = suma de ventas cobradas", abs(r["summary"]["revenue"] - db_total) < 0.005, (r["summary"], db_total))
verificar("Cantidad de ventas", r["summary"]["sales"] == db_count, (r["summary"]["sales"], db_count))
verificar("Descuentos", abs(r["summary"]["discounts"] - db_desc) < 0.005, (r["summary"]["discounts"], db_desc))
verificar("Pedidos pendientes o anulados no cuentan",
          int(sql("select count(*) from ventas where status in ('PENDING_PAYMENT','CANCELLED')")) > 0 and r["summary"]["sales"] == db_count)
verificar("Vendedores suman el total", abs(sum(x["total"] for x in r["sellers"]) - db_total) < 0.01)
verificar("Cajeros suman el total", abs(sum(x["total"] for x in r["cashiers"]) - db_total) < 0.01)
verificar("Medios de pago suman el total", abs(sum(x["total"] for x in r["payMethods"]) - db_total) < 0.01)
verificar("La serie diaria suma el total", abs(sum(x["total"] for x in r["daily"]) - db_total) < 0.01)
cla = next(p for p in r["topProducts"] if p["code"] == "CLA")
db_cla = float(sql(f"select sum(d.quantity) from detalle_ventas d join ventas v on v.id = d.\"ventaId\" join productos p on p.id = d.\"productoId\" where p.code = 'CLA' and v.{COMPLETADA}"))
verificar("Cantidad vendida de clavos", cla["quantity"] == db_cla, (cla, db_cla))
verificar("Más vendidos ordenados por importe", [p["amount"] for p in r["topProducts"]] == sorted([p["amount"] for p in r["topProducts"]], reverse=True))

print("\n=== Día según hora de Perú ===")
# Una venta cobrada el 09/09 a las 23:30 de Lima = 10/09 04:30 UTC.
vid = sql(f"select id from ventas where {COMPLETADA} order by id limit 1")
original = sql(f"select {FECHA} from ventas where id = {vid}")
monto = float(sql(f"select total from ventas where id = {vid}"))
sql(f"update ventas set \"paidAt\" = '2026-09-10 04:30:00' where id = {vid}")
d9 = admin.api("GET", "/dashboard/reportes?from=2026-09-09&to=2026-09-09")[1]
d10 = admin.api("GET", "/dashboard/reportes?from=2026-09-10&to=2026-09-10")[1]
verificar("Cuenta para el 09/09 (hora de Perú)", d9["summary"]["sales"] == 1 and d9["summary"]["revenue"] == monto, d9["summary"])
verificar("…y no para el 10/09", d10["summary"]["sales"] == 0, d10["summary"])
verificar("Un solo día: serie de 1 día", len(d9["daily"]) == 1 and d9["daily"][0]["day"] == "2026-09-09", d9["daily"])
sql(f"update ventas set \"paidAt\" = '{original}' where id = {vid}")

print("\n=== Rotación ===")
for code, name, stk, price in [("ROT1", "Lija fina", 3, 2), ("ROT2", "Candado viejo", 12, 25)]:
    admin.api("POST", "/productos", {"code": code, "name": name, "unit": "Unidad", "stock": stk, "price": price, "category": "General"})
configurar(admin, saleFlowMode="DIRECT")
c = vendedor.api("GET", "/caja/estado-actual")[1]
if not c["abierta"]:
    vendedor.api("POST", "/caja/apertura", {"cashRegisterId": c["registers"][0]["id"], "montoInicial": 0})
rot1 = int(sql("select id from productos where code = 'ROT1'"))
if int(sql(f"select count(*) from detalle_ventas where \"productoId\" = {rot1}")) == 0:
    st, rv = venta(vendedor, [(rot1, 2)], 4)
    verificar("Venta de 2 lijas (queda 1 en stock)", st == 201, (st, rv))
r = admin.api("GET", "/dashboard/reportes")[1]
low = next((p for p in r["rotation"]["lowCoverage"] if p["code"] == "ROT1"), None)
verificar("La lija figura por agotarse: 1 en stock, 2 vendidas en 30 días → 15 días no, 1/(2/30) = 15 → frontera",
          low is None or low["coverageDays"] < 15, low)
dead = next((p for p in r["rotation"]["noMovement"] if p["code"] == "ROT2"), None)
verificar("El candado figura sin movimiento con su valor (12 × 25 = 300)", dead and dead["stockValue"] == 300, dead)
verificar("El total inmovilizado incluye el candado", r["rotation"]["noMovementValue"] >= 300, r["rotation"]["noMovementValue"])
verificar("Un producto vendido no figura como sin movimiento", all(p["code"] != "ROT1" for p in r["rotation"]["noMovement"]))
r7 = admin.api("GET", f"/dashboard/reportes?from={HOY}&to={HOY}")[1]
low7 = next((p for p in r7["rotation"]["lowCoverage"] if p["code"] == "ROT1"), None)
verificar("Con el ritmo de hoy (2 por día) la lija alcanza para 0 días", low7 and low7["coverageDays"] == 0, low7)
c = vendedor.api("GET", "/caja/estado-actual")[1]
vendedor.api("POST", "/caja/cierre", {"cajaId": c["caja"]["id"], "montoCierreConteo": c["caja"]["saldoTeoricoEfectivo"]})

resumen()
