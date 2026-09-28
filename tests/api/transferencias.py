from concurrent.futures import ThreadPoolExecutor

from lib import *  # noqa: F401,F403


admin = entrar("admin", "AdminSucursales2026")
an = entrar("almnorte", "almnorteClave2026")
vn = entrar("vendnorte", "vendnorteClave2026")
NORTE = int(sql("select id from branches where name = 'Sucursal Norte'"))
# El Almacén Central lo crea la prueba de interfaz de sucursales; si se corre solo la API, se crea aquí.
if not sql("select id from branches where name = 'Almacén Central'"):
    admin.api("POST", "/sucursales", {"name": "Almacén Central"})
CENTRAL = int(sql("select id from branches where name = 'Almacén Central'"))
ID = {c: int(sql(f"select id from productos where code = '{c}'")) for c in ("CEM", "CLA")}
sql("update productos set \"allowsFractions\" = true where code = 'CLA'")

def tr(nav, to, items, origin=None, **extra):
    body = {"toBranchId": to, "items": [{"id": i, "qty": q} for i, q in items], **extra}
    if origin is not None:
        body["fromBranchId"] = origin
    return nav.api("POST", "/transferencias", body)

print("=== Permisos y validaciones ===")
verificar("El vendedor (sin Inventario ni Kardex) no transfiere → 403", tr(vn, 1, [(ID["CLA"], 1)])[0] == 403)
st, r = tr(an, NORTE, [(ID["CLA"], 1)])
verificar("Origen y destino iguales → 400", st == 400 and "distintas" in r.get("error", ""), (st, r))
st, r = tr(an, 1, [(ID["CLA"], 1)], fromBranchId=1)
verificar("El almacenero no transfiere desde otra sucursal → 403", st == 403, (st, r))
verificar("Sin productos → 400", tr(an, 1, [])[0] == 400)
verificar("Destino inexistente → 404", tr(an, 999, [(ID["CLA"], 1)])[0] == 404)
verificar("Cantidad con más de 3 decimales → 400", tr(an, 1, [(ID["CLA"], 1.0001)])[0] == 400)
verificar("Cemento (entero) con decimales → 400", tr(admin, NORTE, [(ID["CEM"], 1.5)], fromBranchId=1)[0] == 400)

print("\n=== Transferencia ===")
p_antes, n_antes = stock_en("CLA", 1), stock_en("CLA", NORTE)
total_antes = float(sql("select stock from productos where code = 'CLA'"))
st, r = tr(admin, NORTE, [(ID["CLA"], 10), (ID["CLA"], 2.5)], fromBranchId=1, notes="Reposición semanal")
verificar("El administrador transfiere 12.5 clavos de Principal al Norte (líneas repetidas se suman)",
          st == 201 and r["number"].startswith("TRF-") and r["items"][0]["qty"] == 12.5, (st, r))
num = r["number"]
verificar("Sale de Principal", stock_en("CLA", 1)[0] == p_antes[0] - 12.5, (p_antes, stock_en("CLA", 1)))
verificar("Entra al Norte", stock_en("CLA", NORTE)[0] == n_antes[0] + 12.5, (n_antes, stock_en("CLA", NORTE)))
verificar("El total de la empresa no cambia", float(sql("select stock from productos where code = 'CLA'")) == total_antes)
k = sql(f"select string_agg(type || '@' || \"branchId\", ',' order by type) from movimientos_kardex where ref like '{num}%'")
verificar("Kardex: salida en Principal y entrada en el Norte", k == f"ENTRADA@{NORTE},SALIDA@1", k)
aud = admin.api("GET", "/auditoria?action=STOCK_TRANSFERRED")[1]["items"][0]
verificar("Queda en la auditoría con la nota", num in aud["summary"] and "Reposición semanal" in aud["summary"], aud["summary"])
verificar("Cuadra", cuadra())

st, r = tr(an, CENTRAL, [(ID["CLA"], 5)])
verificar("El almacenero del Norte envía 5 al Almacén Central (sucursal sin stock previo)", st == 201 and stock_en("CLA", CENTRAL)[0] >= 5, (st, r))

print("\n=== Reservado y disponible ===")
disp = stock_en("CLA", NORTE)[0] - stock_en("CLA", NORTE)[1]
sql(f"update branch_stock set reserved = reserved + 3 where \"branchId\" = {NORTE} and \"productoId\" = {ID['CLA']}")
sql(f"update productos set reserved = reserved + 3 where id = {ID['CLA']}")
st, r = tr(an, 1, [(ID["CLA"], disp)])
verificar("No se transfiere lo reservado para pedidos → 409", st == 409 and "Disponible" in r.get("error", ""), (st, r))
sql(f"update branch_stock set reserved = reserved - 3 where \"branchId\" = {NORTE} and \"productoId\" = {ID['CLA']}")
sql(f"update productos set reserved = reserved - 3 where id = {ID['CLA']}")
st, r = tr(an, 1, [(ID["CEM"], 1), (ID["CLA"], 99999)])
verificar("Si una línea falla no se transfiere nada (todo o nada)", st == 409 and stock_en("CLA", NORTE)[0] - stock_en("CLA", NORTE)[1] == disp, (st, r))

print("\n=== Concurrencia ===")
disp = stock_en("CLA", NORTE)[0] - stock_en("CLA", NORTE)[1]
an2 = entrar("admin", "AdminSucursales2026")
with ThreadPoolExecutor(max_workers=2) as ex:
    res = list(ex.map(lambda args: tr(*args), [(an, 1, [(ID["CLA"], disp)]), (an2, CENTRAL, [(ID["CLA"], disp)], NORTE)]))
res2 = res
verificar("Dos transferencias por todo el disponible a la vez: solo una pasa", sorted(s for s, _ in res2) == [201, 409], [s for s, _ in res2])
verificar("El Norte queda en 0 disponible, nunca negativo", stock_en("CLA", NORTE)[0] - stock_en("CLA", NORTE)[1] == 0, stock_en("CLA", NORTE))
verificar("Cuadra tras la carrera", cuadra())

print("\n=== Listado ===")
st, lst = an.api("GET", f"/transferencias?branchId={CENTRAL}")
verificar("Filtra por sucursal (salen o llegan al Central)", st == 200 and lst and all(CENTRAL in (t["from"]["id"], t["to"]["id"]) for t in lst), lst[:1])
verificar("Ahora el Central tiene stock: no se puede desactivar → 409", admin.api("PUT", f"/sucursales/{CENTRAL}", {"active": False})[0] == 409)

resumen()
