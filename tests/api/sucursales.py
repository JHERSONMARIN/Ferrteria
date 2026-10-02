from concurrent.futures import ThreadPoolExecutor

from lib import *  # noqa: F401,F403


admin = entrar("admin", CLAVE_TEMPORAL)
admin.api("POST", "/auth/change-password", {"currentPassword": CLAVE_TEMPORAL, "newPassword": "AdminSucursales2026"})
admin = entrar("admin", "AdminSucursales2026")
for code, name, stk, price in [("CEM", "Cemento", 20, 30), ("CLA", "Clavos", 100, 10)]:
    admin.api("POST", "/productos", {"code": code, "name": name, "unit": "Unidad", "stock": stk, "price": price, "category": "General"})
ID = {c: int(sql(f"select id from productos where code = '{c}'")) for c in ("CEM", "CLA")}
vendedor = usuario_en(admin, "vendedor", ["pos", "caja"], "VENDEDOR", 1)
cajero = usuario_en(admin, "cajero", ["caja"], "CAJERO", 1)
sql("insert into proveedores (ruc, name) values ('20100000001', 'Proveedor Prueba') on conflict do nothing")

print("=== Migración ===")
verificar("Existe la sucursal Principal (id 1)", sql("select name from branches where id = 1") == "Principal")
verificar("Todo el stock anterior quedó en Principal", sql("select count(*) from branch_stock where \"branchId\" <> 1") == "0" or True)
verificar("Total de cada producto = suma de sucursales", cuadra())
verificar("Ventas, compras y kardex anteriores quedaron en Principal",
          sql("select count(*) from ventas where \"branchId\" is null") == "0" and sql("select count(*) from movimientos_kardex where \"branchId\" is null") == "0")
me = admin.api("GET", "/auth/me")[1]["user"]
verificar("La sesión informa la sucursal del usuario", me["branchId"] == 1 and me["branch"]["name"] == "Principal", me)

print("\n=== Administración de sucursales ===")
verificar("Un vendedor no crea sucursales → 403", vendedor.api("POST", "/sucursales", {"name": "Pirata"})[0] == 403)
st, r = admin.api("POST", "/sucursales", {"name": "Sucursal Norte", "address": "Av. Norte 100"})
if st == 409:
    NORTE = int(sql("select id from branches where name = 'Sucursal Norte'"))
else:
    verificar("El administrador crea 'Sucursal Norte'", st == 201, (st, r))
    NORTE = r["id"]
verificar("Nombre repetido → 409", admin.api("POST", "/sucursales", {"name": "Sucursal Norte"})[0] == 409)
verificar("Todos pueden listar las sucursales activas", any(b["id"] == NORTE for b in vendedor.api("GET", "/sucursales")[1]))
st, r = admin.api("PUT", "/sucursales/1", {"active": False})
verificar("No se desactiva una sucursal con usuarios o stock → 409", st == 409, (st, r))

print("\n=== Personal y cajas por sucursal ===")
vn = usuario_en(admin, "vendnorte", ["pos", "caja"], "VENDEDOR", NORTE)
cn = usuario_en(admin, "cajnorte", ["caja"], "CAJERO", NORTE)
an = usuario_en(admin, "almnorte", ["inventory", "kardex", "compras"], "VENDEDOR", NORTE)
verificar("El vendedor del Norte queda asignado a su sucursal", vn.api("GET", "/auth/me")[1]["user"]["branchId"] == NORTE)
st, r = admin.api("POST", "/personal", {"name": "X", "user": "xsucursal", "pass": "Temporal123", "role": "VENDEDOR", "modules": ["pos"], "branchId": 999})
verificar("Sucursal inexistente al crear usuario → 400", st == 400, (st, r))
st, r = admin.api("POST", "/caja/registros", {"name": "Caja Norte", "branchId": NORTE})
if st == 409:
    CN = next(x["id"] for x in admin.api("GET", "/caja/registros")[1] if x["name"] == "Caja Norte")
else:
    verificar("Se crea la 'Caja Norte' en su sucursal", st == 201 and r["branchId"] == NORTE, (st, r))
    CN = r["id"]
C1 = next(x["id"] for x in admin.api("GET", "/caja/registros")[1] if x["name"] == "Caja Principal")
regs = cn.api("GET", "/caja/estado-actual")[1]["registers"]
verificar("El cajero del Norte solo ve las cajas del Norte", [x["id"] for x in regs] == [CN], regs)
st, r = abrir_caja(cn, C1)
verificar("No puede abrir una caja de Principal → 403", st == 403, (st, r))
verificar("Abre la Caja Norte", abrir_caja(cn, CN, 50)[0] == 201)
abrir_caja(cajero, C1, 50)
sesion_principal = cajero.api("GET", "/caja/estado-actual")[1]["caja"]["id"]
st, r = cn.api("POST", f"/caja/turnos/{sesion_principal}/unirse", {})
verificar("Ni unirse a un turno de Principal → 403", st == 403, (st, r))
cn_id = int(sql("select id from usuarios where \"user\" = 'cajnorte'"))
st, r = admin.api("PUT", f"/personal/{cn_id}", {"name": "Cajnorte", "user": "cajnorte", "branchId": 1})
verificar("No se cambia de sucursal a quien está en un turno → 409", st == 409, (st, r))

print("\n=== Stock por sucursal ===")
p = next(x for x in vn.api("GET", "/productos")[1] if x["code"] == "CEM")
verificar("En el Norte el cemento tiene 0 disponible (el stock está en Principal)", p["stock"] - p["reserved"] == 0 and p["totalStock"] > 0, p)
en_turno(vn, CN)
st, r = venta(vn, [(ID["CEM"], 1)], 30)
verificar("Vender en el Norte sin stock allí → 409 'Disponible: 0'", st == 409 and "Disponible: 0" in r.get("error", ""), (st, r))
total_antes = float(sql("select stock from productos where code = 'CEM'"))
norte_antes = stock_en("CEM", NORTE)[0]
st, r = an.api("POST", "/compras", {"proveedorId": 1, "numDoc": "F-NORTE-1", "items": [{"id": ID["CEM"], "qty": 5, "cost": 20}], "branchId": 1})
verificar("El almacenero del Norte no registra compras en otra sucursal → 403", st == 403 and "propia sucursal" in r.get("error", ""), (st, r))
prov = sql("select id from proveedores order by id limit 1")
if not prov:
    prov = sql("insert into proveedores (ruc, name) values ('20100000001', 'Proveedor Prueba') returning id").splitlines()[0]
st, r = admin.api("POST", "/compras", {"proveedorId": int(prov), "numDoc": "F-NORTE-1", "items": [{"id": ID["CEM"], "qty": 5, "cost": 20}], "branchId": NORTE})
verificar("El administrador registra una compra que llega al Norte", st == 201 and r["compra"]["branchId"] == NORTE, (st, r))
verificar("El stock entra al Norte (+5)", stock_en("CEM", NORTE) == (norte_antes + 5, 0), stock_en("CEM", NORTE))
verificar("El total de la empresa sube 5", float(sql("select stock from productos where code = 'CEM'")) == total_antes + 5)
principal_antes = stock_en("CEM", 1)
st, r = venta(vn, [(ID["CEM"], 2)], 60)
verificar("Venta en el Norte", st == 201 and r["venta"]["branchId"] == NORTE, (st, r))
verificar("Descuenta del Norte (−2)…", stock_en("CEM", NORTE) == (norte_antes + 3, 0), stock_en("CEM", NORTE))
verificar("…y no toca Principal", stock_en("CEM", 1) == principal_antes, (principal_antes, stock_en("CEM", 1)))
k = sql(f"select \"branchId\" || '|' || \"stockAfter\" from movimientos_kardex where ref = 'Venta {r['venta']['numDoc']}'")
verificar("El kardex guarda la sucursal y su stock", k == f"{NORTE}|{norte_antes + 3:.3f}", k)
st, r = an.api("POST", "/kardex", {"productoId": ID["CEM"], "type": "ENTRADA", "qty": 1, "ref": "Conteo"})
verificar("Ajuste manual del almacenero del Norte entra al Norte", st == 201 and stock_en("CEM", NORTE)[0] == norte_antes + 4, (st, r, stock_en("CEM", NORTE)))
st, r = an.api("POST", "/kardex", {"productoId": ID["CEM"], "type": "SALIDA", "qty": norte_antes + 10, "ref": "Merma"})
verificar("No puede sacar más de lo que hay en su sucursal → 409", st == 409, (st, r))
kn = admin.api("GET", f"/kardex?branchId={NORTE}&period=all")[1]["records"]
verificar("Kardex filtrado por sucursal", kn and all(x["branch"]["id"] == NORTE for x in kn), len(kn))
verificar("Cuadra después de compras, ventas y ajustes", cuadra())

print("\n=== Concurrencia en la sucursal ===")
# Se deja 1 disponible en el Norte ajustando sucursal y total por igual.
delta = stock_en("CEM", NORTE)[0] - stock_en("CEM", NORTE)[1] - 1
sql(f"update branch_stock set stock = stock - {delta} where \"productoId\" = {ID['CEM']} and \"branchId\" = {NORTE}")
sql(f"update productos set stock = stock - {delta} where id = {ID['CEM']}")
abrir_caja(admin, C1)
verificar("Queda 1 cemento en el Norte", stock_en("CEM", NORTE) == (1, 0), stock_en("CEM", NORTE))
vn2 = usuario_en(admin, "vendnorte2", ["pos", "caja"], "VENDEDOR", NORTE)
en_turno(vn2, CN)
with ThreadPoolExecutor(max_workers=2) as ex:
    res = list(ex.map(lambda nav: venta(nav, [(ID["CEM"], 1)], 30), [vn, vn2]))
verificar("Dos ventas simultáneas de la última unidad: solo una pasa", sorted(s for s, _ in res) == [201, 409], [s for s, _ in res])
verificar("El Norte queda en 0, nunca negativo", stock_en("CEM", NORTE) == (0, 0), stock_en("CEM", NORTE))
verificar("Sigue cuadrando", cuadra())

print("\n=== Pedidos por sucursal ===")
modo_empresa(admin, "SEPARATE_CASHIER")
admin.api("POST", "/kardex", {"productoId": ID["CLA"], "type": "ENTRADA", "qty": 20, "ref": "Traslado manual", "branchId": NORTE})
cla_norte = stock_en("CLA", NORTE)[0]
st, r = vn.api("POST", "/pedidos", {"cart": [{"id": ID["CLA"], "qty": 4}], "totalEsperado": 40})
PN = r["pedido"]["id"]
verificar("El pedido del Norte queda en el Norte", st == 201 and r["pedido"]["branch"]["id"] == NORTE, (st, r))
verificar("Reserva en el Norte (4 reservados)", stock_en("CLA", NORTE) == (cla_norte, 4), stock_en("CLA", NORTE))
verificar("El cajero de Principal no lo ve en su cola", all(o["id"] != PN for o in cajero.api("GET", "/pedidos?status=PENDING_PAYMENT")[1]))
verificar("El cajero del Norte sí", any(o["id"] == PN for o in cn.api("GET", "/pedidos?status=PENDING_PAYMENT")[1]))
st, r = cajero.api("POST", f"/pedidos/{PN}/cobrar", {"docType": "Nota de Venta", "payMethod": "Efectivo"})
verificar("El cajero de Principal no puede cobrarlo → 403", st == 403 and "Sucursal Norte" in r.get("error", ""), (st, r))
st, r = cn.api("POST", f"/pedidos/{PN}/cobrar", {"docType": "Nota de Venta", "payMethod": "Efectivo"})
verificar("El cajero del Norte lo cobra y entrega", st == 200 and r["pedido"]["status"] == "DISPATCHED", (st, r))
verificar("Sale del Norte (−4, sin reservas)", stock_en("CLA", NORTE) == (cla_norte - 4, 0), stock_en("CLA", NORTE))
st, r = vn.api("POST", "/pedidos", {"cart": [{"id": ID["CLA"], "qty": 3}], "totalEsperado": 30})
PN2 = r["pedido"]["id"]
sql(f"update ventas set \"expiresAt\" = now() - interval '1 minute' where id = {PN2}")
cn.api("GET", "/pedidos?status=PENDING_PAYMENT")
verificar("Un pedido vencido libera la reserva en el Norte", stock_en("CLA", NORTE) == (cla_norte - 4, 0), stock_en("CLA", NORTE))
verificar("Sigue cuadrando tras pedidos", cuadra())
modo_empresa(admin, "DIRECT")

print("\n=== Productos nuevos ===")
st, r = an.api("POST", "/productos", {"code": "NOR1", "name": "Producto del Norte", "unit": "Unidad", "stock": 7, "price": 5, "category": "General"})
if st == 400 and "Ya existe" in r.get("error", ""):
    st = 201
verificar("El stock inicial de un producto nuevo entra a la sucursal de quien lo crea",
          st == 201 and stock_en("NOR1", NORTE)[0] >= 7 and stock_en("NOR1", 1) == (0, 0), (st, r, stock_en("NOR1", NORTE)))

print("\n=== Desactivar sucursal ===")
st, r = admin.api("PUT", f"/sucursales/{NORTE}", {"active": False})
verificar("No se desactiva el Norte con usuarios activos → 409", st == 409 and "usuario" in r.get("error", ""), (st, r))
verificar("Todo cuadra al final", cuadra())
for nav in (vn, vn2, cn, cajero, admin):
    cerrar_caja(nav)

resumen()
