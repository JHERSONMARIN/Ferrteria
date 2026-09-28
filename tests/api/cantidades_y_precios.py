
from lib import *  # noqa: F401,F403


# ---------- Preparación ----------
admin = Navegador()
admin.api("POST", "/auth/login", {"user": "admin", "pass": CLAVE_TEMPORAL})
admin.api("POST", "/auth/change-password", {"currentPassword": CLAVE_TEMPORAL, "newPassword": "AdminFase5_2026"})
vendedor = usuario(admin, "vendedor", ["pos", "caja"], "VENDEDOR")
cajero = usuario(admin, "cajero", ["caja"], "CAJERO")
# Desde la Fase 6 las cajas son físicas: cada uno abre la suya para que su arqueo quede separado.
for nav, nombre in ((admin, "Caja Principal"), (vendedor, "Caja Vendedor"), (cajero, "Caja Cajero")):
    if nombre != "Caja Principal":
        admin.api("POST", "/caja/registros", {"name": nombre})
    caja_id = int(sql(f"select id from cash_registers where name = '{nombre}'"))
    nav.api("POST", "/caja/apertura", {"cashRegisterId": caja_id, "montoInicial": 50})

print("=== Productos fraccionados ===")
st, r = admin.api("POST", "/productos", {"code": "CAB", "name": "Cable 14 AWG", "unit": "Metro", "stock": 100.5, "price": 2.5,
                                         "category": "General", "allowsFractions": True, "wholesalePrice": 2})
verificar("Se crea un producto por metro con stock fraccionado", st in (200, 201), (st, r))
st, r = admin.api("POST", "/productos", {"code": "CEM", "name": "Cemento", "unit": "Unidad", "stock": 10.5, "price": 30, "category": "General"})
verificar("Un producto por unidades no admite stock con decimales → 400", st == 400, (st, r))
admin.api("POST", "/productos", {"code": "CEM", "name": "Cemento", "unit": "Unidad", "stock": 40, "price": 30,
                                 "category": "General", "wholesalePrice": 27})
admin.api("POST", "/productos", {"code": "CLA", "name": "Clavos 2\"", "unit": "Unidad", "stock": 200, "price": 10, "category": "General"})
ID = {c: int(sql(f"select id from productos where code = '{c}'")) for c in ("CAB", "CEM", "CLA")}

st, r = venta(admin, [(ID["CAB"], 2.75)], 6.88)
verificar("Venta de 2.75 m de cable (2.75 × 2.50 = 6.88)", st == 201 and r["venta"]["total"] == 6.88, (st, r))
verificar("…y descuenta 2.75 m exactos del stock", stock("CAB") == (97.75, 0), stock("CAB"))
st, r = venta(admin, [(ID["CEM"], 1.5)], 45)
verificar("Media bolsa de cemento (producto entero) → 400", st == 400 and "unidades enteras" in r.get("error", ""), (st, r))
st, r = venta(admin, [(ID["CAB"], 1.2345)], 3.09)
verificar("Más de 3 decimales → 400", st == 400, (st, r))
st, r = venta(admin, [(ID["CAB"], 0.5), (ID["CAB"], 0.25)], 1.88)
verificar("Líneas repetidas se suman (0.5 + 0.25 = 0.75 m)", st == 201 and r["venta"]["items"][0]["qty"] == 0.75, (st, r))
st, r = admin.api("PUT", f"/productos/{ID['CAB']}", {"allowsFractions": False})
verificar("No se quita la venta fraccionada si el stock tiene decimales → 400", st == 400, (st, r))

print("\n=== Lista mayorista por cliente ===")
admin.api("POST", "/clientes", {"type": "NATURAL", "doc": "41112222", "name": "Juan Minorista"})
st, r = admin.api("POST", "/clientes", {"type": "EMPRESA", "doc": "20611112222", "name": "Constructora Mayor SAC", "priceList": "WHOLESALE"})
verificar("Se crea un cliente con lista mayorista", st in (200, 201), (st, r))
MIN = int(sql("select id from clientes where doc = '41112222'"))
MAY = int(sql("select id from clientes where doc = '20611112222'"))
clientes = {c["id"]: c for c in vendedor.api("GET", "/clientes")[1]}
verificar("La API de clientes informa la lista", clientes[MAY]["priceList"] == "WHOLESALE" and clientes[MIN]["priceList"] == "RETAIL")
prod = next(p for p in vendedor.api("GET", "/productos")[1] if p["code"] == "CEM")
verificar("La API de productos informa el precio mayorista", prod["wholesalePrice"] == 27, prod)

st, r = venta(vendedor, [(ID["CEM"], 10), (ID["CLA"], 1)], 280, clienteId=MAY)
verificar("Cliente mayorista: cemento a 27 y clavos (sin mayorista) a 10 → 280",
          st == 201 and r["venta"]["total"] == 280 and r["venta"]["items"][0]["price"] == 27, (st, r))
st, r = venta(vendedor, [(ID["CEM"], 2)], 54, clienteId=MIN)
verificar("Cliente minorista con total mayorista → 409 con precios de lista",
          st == 409 and r.get("codigo") == "PRECIOS_CAMBIARON" and r["precios"][0]["price"] == 30, (st, r))
st, r = venta(vendedor, [(ID["CEM"], 2)], 54)
verificar("Sin cliente también se cobra a precio de lista → 409", st == 409, (st, r))

st, r = vendedor.api("PUT", f"/clientes/{MIN}/price-list", {"priceList": "WHOLESALE"})
verificar("El vendedor (sin directorio de clientes) no cambia la lista → 403", st == 403, (st, r))
st, r = admin.api("PUT", f"/clientes/{MIN}/price-list", {"priceList": "MAYORISTA"})
verificar("Lista desconocida → 400", st == 400, (st, r))

st, r = vendedor.api("POST", "/cotizaciones", {"clienteId": MAY, "validDays": 7, "cart": [{"id": ID["CEM"], "qty": 4}]})
verificar("La cotización a un mayorista usa su precio (4 × 27 = 108)", st in (200, 201) and r["cotizacion"]["total"] == 108, (st, r))
COT = r["cotizacion"]["id"]
sql(f"update productos set \"wholesalePrice\" = 28 where code = 'CEM'")
st, r = venta(vendedor, [(ID["CEM"], 4)], 108, clienteId=MAY, cotizacionId=COT)
verificar("Una cotización vigente conserva su precio aunque cambie la lista", st == 201 and r["venta"]["total"] == 108, (st, r))
sql(f"update productos set \"wholesalePrice\" = 27 where code = 'CEM'")

print("\n=== Descuentos: tope por rol ===")
verificar("Por defecto el tope es 0 %", admin.api("GET", "/settings")[1]["settings"]["maxDiscountPercent"] == 0)
st, r = venta(vendedor, [(ID["CLA"], 10)], 95, discount={"type": "PERCENT", "value": 5})
verificar("Con tope 0 el vendedor no puede descontar → 403", st == 403 and r.get("codigo") == "DESCUENTO_EXCEDIDO", (st, r))
st, r = vendedor.api("PUT", "/settings", {**admin.api("GET", "/settings")[1]["settings"], "maxDiscountPercent": 50})
verificar("El vendedor no puede subirse el tope → 403", st == 403, (st, r))
st, r = configurar(admin, maxDiscountPercent=150)
verificar("Tope mayor a 100 % → 400", st == 400, (st, r))
st, r = configurar(admin, maxDiscountPercent=10)
verificar("El administrador fija el tope en 10 %", st == 200 and r["settings"]["maxDiscountPercent"] == 10, (st, r))
verificar("…sin tocar el modo de trabajo", r["settings"]["saleFlowMode"] == "DIRECT", r)

caja_antes = efectivo_caja("vendedor")
st, r = venta(vendedor, [(ID["CLA"], 10)], 90, discount={"type": "PERCENT", "value": 10})
verificar("Vendedor aplica 10 % sobre S/ 100 → total 90", st == 201 and r["venta"]["total"] == 90 and r["venta"]["discount"] == 10, (st, r))
verificar("La venta guarda quién aplicó el descuento",
          sql(f"select u.\"user\" from ventas v join usuarios u on u.id = v.\"discountById\" where v.\"numDoc\" = '{r['venta']['numDoc']}'") == "vendedor")
verificar("En la caja entra lo cobrado (90), no el precio de lista", efectivo_caja("vendedor") - caja_antes == 90, efectivo_caja("vendedor") - caja_antes)
verificar("Las líneas conservan el precio de lista (10 c/u)", sql(
    f"select \"unitPrice\" from detalle_ventas d join ventas v on v.id = d.\"ventaId\" where v.\"numDoc\" = '{r['venta']['numDoc']}'") == "10.00")
st, r = venta(vendedor, [(ID["CLA"], 10)], 89, discount={"type": "AMOUNT", "value": 11})
verificar("S/ 11 sobre S/ 100 supera el 10 % → 403", st == 403 and "10 %" in r.get("error", ""), (st, r))
st, r = venta(vendedor, [(ID["CLA"], 3)], 27.5, discount={"type": "AMOUNT", "value": 2.5})
verificar("S/ 2.50 sobre S/ 30 (8.3 %) está dentro del tope", st == 201 and r["venta"]["total"] == 27.5, (st, r))
st, r = venta(vendedor, [(ID["CLA"], 10)], 100, discount={"type": "PERCENT", "value": 10})
verificar("Si el total esperado no considera el descuento → 409", st == 409 and r.get("codigo") == "PRECIOS_CAMBIARON", (st, r))
st, r = venta(vendedor, [(ID["CLA"], 1)], 10, discount={"type": "PERCENT", "value": 0})
verificar("Descuento 0 equivale a no descontar (no guarda quién)", st == 201 and r["venta"]["discount"] == 0 and r["venta"]["discountById"] is None, (st, r))
for cuerpo, nombre in [({"type": "PERCENT", "value": -5}, "negativo"), ({"type": "PERCENT", "value": 120}, "mayor a 100 %"),
                       ({"type": "REGALO", "value": 5}, "de tipo desconocido"), ({"type": "AMOUNT", "value": "abc"}, "no numérico")]:
    st, r = venta(admin, [(ID["CLA"], 1)], 10, discount=cuerpo)
    verificar(f"Descuento {nombre} → 400", st == 400, (st, r))

st, r = venta(admin, [(ID["CLA"], 10)], 60, discount={"type": "PERCENT", "value": 40})
verificar("El administrador no tiene tope (40 %)", st == 201 and r["venta"]["total"] == 60, (st, r))
st, r = venta(admin, [(ID["CLA"], 1)], 0, discount={"type": "AMOUNT", "value": 10})
verificar("Ni el administrador puede dejar la venta en 0 → 400", st == 400, (st, r))
st, r = venta(vendedor, [(ID["CEM"], 10)], 243, clienteId=MAY, discount={"type": "PERCENT", "value": 10})
verificar("Mayorista + descuento: 270 − 10 % = 243", st == 201 and r["venta"]["total"] == 243, (st, r))

print("\n=== Descuento al fiado ===")
st, r = venta(vendedor, [(ID["CLA"], 10)], 95, clienteId=MIN, payMethod="Fiado", discount={"type": "PERCENT", "value": 5})
verificar("Venta al fiado con descuento", st == 201, (st, r))
verificar("La deuda del cliente es lo cobrado (95), no el precio de lista",
          sql(f"select \"debtTotal\" from creditos_cliente where \"clienteId\" = {MIN}") == "95.00",
          sql(f"select \"debtTotal\" from creditos_cliente where \"clienteId\" = {MIN}"))

print("\n=== Descuento en pedidos (vendedor y caja) ===")
st, r = configurar(admin, saleFlowMode="SEPARATE_CASHIER")
verificar("Cambio a modo vendedor y caja", st == 200, (st, r))
st, r = vendedor.api("POST", "/pedidos", {"cart": [{"id": ID["CAB"], "qty": 10}], "totalEsperado": 22.5,
                                           "discount": {"type": "PERCENT", "value": 10}})
verificar("El vendedor arma el pedido con 10 % (25 → 22.50)", st == 201 and r["pedido"]["total"] == 22.5 and r["pedido"]["discount"] == 2.5
          and r["pedido"]["subtotal"] == 25, (st, r))
PED = r["pedido"]["id"]
st, r = vendedor.api("POST", "/pedidos", {"cart": [{"id": ID["CAB"], "qty": 10}], "totalEsperado": 20,
                                           "discount": {"type": "PERCENT", "value": 20}})
verificar("En el pedido también rige el tope → 403", st == 403, (st, r))
cola = cajero.api("GET", "/pedidos?status=PENDING_PAYMENT")[1]
verificar("El cajero ve el descuento en su cola", any(o["id"] == PED and o["discount"] == 2.5 for o in cola), cola)
caja_antes = efectivo_caja("cajero")
st, r = cajero.api("POST", f"/pedidos/{PED}/cobrar", {"docType": "Boleta", "payMethod": "Efectivo"})
verificar("El cajero cobra el total con descuento", st == 200 and r["pedido"]["total"] == 22.5, (st, r))
verificar("En su caja entra 22.50", efectivo_caja("cajero") - caja_antes == 22.5, efectivo_caja("cajero") - caja_antes)
verificar("El descuento queda a nombre del vendedor, no del cajero",
          sql(f"select u.\"user\" from ventas v join usuarios u on u.id = v.\"discountById\" where v.id = {PED}") == "vendedor")
st, r = cajero.api("POST", f"/pedidos/{PED}/cobrar", {"docType": "Boleta", "payMethod": "Efectivo"})
verificar("Cobrar dos veces sigue bloqueado → 409", st == 409, (st, r))

print("\n=== Historial ===")
hist = admin.api("GET", "/ventas")[1]
verificar("El historial de ventas incluye el descuento", any(v["discount"] == 10 for v in hist), [v["discount"] for v in hist])

resumen()
