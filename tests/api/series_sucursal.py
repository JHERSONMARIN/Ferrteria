from concurrent.futures import ThreadPoolExecutor

from lib import *  # noqa: F401,F403


admin = entrar("admin", "AdminSucursales2026")
vn = entrar("vendnorte", "vendnorteClave2026")
cn = entrar("cajnorte", "cajnorteClave2026")
cajero = entrar("cajero", "cajeroClave2026")
NORTE = int(sql("select id from branches where name = 'Sucursal Norte'"))
CENTRAL = int(sql("select id from branches where name = 'Almacén Central'"))
ID = {c: int(sql(f"select id from productos where code = '{c}'")) for c in ("CEM", "CLA")}
CN = int(sql("select id from cash_registers where name = 'Caja Norte'"))
C1 = int(sql("select id from cash_registers where name = 'Caja Principal'"))
for nav in (vn, cn, cajero, admin):
    cerrar_caja(nav)
modo_empresa(admin, "DIRECT")
admin.api("POST", "/kardex", {"productoId": ID["CLA"], "type": "ENTRADA", "qty": 50, "ref": "Carga prueba series", "branchId": NORTE})
admin.api("POST", "/kardex", {"productoId": ID["CLA"], "type": "ENTRADA", "qty": 50, "ref": "Carga prueba series", "branchId": 1})

print("=== Series por sucursal ===")
series = admin.api("GET", "/settings")[1]["documentSeries"]
por = {(s["branchId"], s["documentType"]): s["series"] for s in series}
verificar("Principal conserva T001/B001/F001", (por[(1, "NOTA_VENTA")], por[(1, "BOLETA")], por[(1, "FACTURA")]) == ("T001", "B001", "F001"), por)
verificar("El Norte tiene sus propias series (T002/B002/F002)", (por[(NORTE, "NOTA_VENTA")], por[(NORTE, "BOLETA")], por[(NORTE, "FACTURA")]) == ("T002", "B002", "F002"), por)
verificar("Configuración informa la sucursal de cada serie", all(s.get("branch") for s in series))
en_turno(vn, CN)
st, r = venta(vn, [(ID["CLA"], 1)], 10)
verificar("Una venta en el Norte usa T002", st == 201 and r["venta"]["numDoc"].startswith("T002-"), (st, r))
st, r = venta(vn, [(ID["CLA"], 1)], 10, docType="Boleta")
verificar("Una boleta en el Norte usa B002", st == 201 and r["venta"]["numDoc"].startswith("B002-"), (st, r))
en_turno(admin, C1)
st, r = venta(admin, [(ID["CLA"], 1)], 10)
verificar("Una venta en Principal sigue con T001", st == 201 and r["venta"]["numDoc"].startswith("T001-"), (st, r))
modo_empresa(admin, "SEPARATE_CASHIER")
st, r = vn.api("POST", "/pedidos", {"cart": [{"id": ID["CLA"], "qty": 2}], "totalEsperado": 20})
pid = r["pedido"]["id"]
en_turno(cn, CN)
st, r = cn.api("POST", f"/pedidos/{pid}/cobrar", {"docType": "Boleta", "payMethod": "Efectivo"})
verificar("Un pedido del Norte cobrado con boleta usa B002", st == 200 and r["pedido"]["numDoc"].startswith("B002-"), (st, r))
modo_empresa(admin, "DIRECT")
st, r = admin.api("POST", "/sucursales", {"name": "Sucursal Sur"})
sur = r.get("id") or int(sql("select id from branches where name = 'Sucursal Sur'"))
nuevas = {s["documentType"]: s["series"] for s in admin.api("GET", "/settings")[1]["documentSeries"] if s["branchId"] == sur}
verificar("Una sucursal nueva recibe series al crearse (T004/B004/F004)", nuevas == {"NOTA_VENTA": "T004", "BOLETA": "B004", "FACTURA": "F004"}, nuevas)

print("\n=== Reportes por sucursal ===")
hoy = sql("select to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD')")
q = f"/dashboard/reportes?from=2026-01-01&to={hoy}"
todo = admin.api("GET", q)[1]["summary"]
suma = 0
for b in (1, NORTE, CENTRAL, sur):
    r = admin.api("GET", f"{q}&branchId={b}")[1]
    db = float(sql(f"select coalesce(sum(total),0) from ventas where status in ('PAID','DISPATCHED') and \"branchId\" = {b}"))
    verificar(f"Ingresos de la sucursal {b} = base de datos", abs(r["summary"]["revenue"] - db) < 0.005, (r["summary"]["revenue"], db))
    suma += r["summary"]["revenue"]
verificar("La suma de las sucursales es el total de la empresa", abs(suma - todo["revenue"]) < 0.01, (suma, todo["revenue"]))
rc = admin.api("GET", f"{q}&branchId={CENTRAL}")[1]
cla_c = next((p for p in rc["rotation"]["noMovement"] if p["code"] == "CLA"), None)
verificar("Rotación del Central: clavos sin ventas allí, con el stock del Central", cla_c and cla_c["stock"] == stock_en("CLA", CENTRAL)[0], (cla_c, stock_en("CLA", CENTRAL)))
verificar("Sucursal no válida → 400", admin.api("GET", f"{q}&branchId=abc")[0] == 400)
verificar("Cuadra al final", cuadra())
for nav in (vn, cn, admin):
    cerrar_caja(nav)

resumen()
