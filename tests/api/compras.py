from lib import *  # noqa: F401,F403

admin = entrar("admin", CLAVE_TEMPORAL)
admin.api("POST", "/auth/change-password", {"currentPassword": CLAVE_TEMPORAL, "newPassword": "AdminCompras2026"})
admin = entrar("admin", "AdminCompras2026")
admin.api("POST", "/productos", {"code": "CEM", "name": "Cemento", "unit": "Unidad", "stock": 10, "price": 30, "category": "General"})
admin.api("POST", "/productos", {"code": "CAB", "name": "Cable", "unit": "Metro", "stock": 0, "price": 2.5, "category": "General", "allowsFractions": True})
CEM = int(sql("select id from productos where code = 'CEM'"))
CAB = int(sql("select id from productos where code = 'CAB'"))

print("=== Proveedores ===")
st, r = admin.api("POST", "/proveedores", {"ruc": "20100000001", "name": " Distribuidora Andina ", "phone": "976000111"})
verificar("Se registra un proveedor", st == 201 and r["name"] == "Distribuidora Andina", (st, r))
PROV = r["id"]
st, r = admin.api("POST", "/proveedores", {"ruc": "20100000001", "name": "Otro"})
verificar("RUC repetido → 400", st == 400 and "ya existe" in r.get("error", ""), (st, r))
st, r = admin.api("POST", "/proveedores", {"name": "Sin RUC"})
verificar("Sin RUC → 400", st == 400, (st, r))
verificar("Lista los proveedores", any(p["id"] == PROV for p in admin.api("GET", "/proveedores")[1]))

print("\n=== Compras ===")
st, r = admin.api("POST", "/compras", {"proveedorId": PROV, "numDoc": "F001-123", "items": [
    {"id": CEM, "qty": 20, "cost": 24.333}, {"id": CAB, "qty": 150.5, "cost": 1.2}]})
verificar("Se registra la compra", st == 201 and r["success"], (st, r))
verificar("…con el total redondeado a céntimos (486.66 + 180.60)", float(r["compra"]["total"]) == 667.26, r)
verificar("El stock sube en la sucursal (10 + 20 cementos, 150.5 m de cable)", stock("CEM") == (30, 0) and stock("CAB") == (150.5, 0),
          (stock("CEM"), stock("CAB")))
k = sql("select count(*) from movimientos_kardex where ref = 'Compra a Proveedor (Doc: F001-123)' and type = 'ENTRADA'")
verificar("Cada producto deja su entrada en el kardex", k == "2", k)
verificar("La compra aparece en la lista con su proveedor",
          any(c["numDoc"] == "F001-123" and c["provider"] == "Distribuidora Andina" for c in admin.api("GET", "/compras")[1]))

print("\n=== Validaciones ===")
st, r = admin.api("POST", "/compras", {"proveedorId": PROV, "numDoc": "F001-124", "items": [{"id": CEM, "qty": 1.5, "cost": 20}]})
verificar("Cemento (por unidad) con decimales → 400", st == 400 and "Cemento" in r.get("error", ""), (st, r))
st, r = admin.api("POST", "/compras", {"proveedorId": PROV, "numDoc": "F001-125", "items": [{"id": CEM, "qty": 1, "cost": -5}]})
verificar("Costo negativo → 400", st == 400 and "costo" in r.get("error", ""), (st, r))
st, r = admin.api("POST", "/compras", {"proveedorId": PROV, "numDoc": "F001-126", "items": []})
verificar("Sin productos → 400", st == 400 and "al menos un producto" in r.get("error", ""), (st, r))
st, r = admin.api("POST", "/compras", {"proveedorId": 999, "numDoc": "F001-127", "items": [{"id": CEM, "qty": 1, "cost": 20}]})
verificar("Proveedor inexistente → 404 con un mensaje claro (no el error interno de la base)",
          st == 404 and r.get("error") == "El proveedor no existe.", (st, r))
st, r = admin.api("POST", "/compras", {"proveedorId": PROV, "numDoc": "F001-128", "items": [{"id": CEM, "qty": 1, "cost": 20}, {"id": 999, "qty": 1, "cost": 1}]})
verificar("Un producto inexistente anula toda la compra", st == 400 and stock("CEM") == (30, 0), (st, r, stock("CEM")))

resumen()
