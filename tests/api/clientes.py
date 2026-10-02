from concurrent.futures import ThreadPoolExecutor

from lib import *  # noqa: F401,F403

admin = entrar("admin", CLAVE_TEMPORAL)
admin.api("POST", "/auth/change-password", {"currentPassword": CLAVE_TEMPORAL, "newPassword": "AdminClientes2026"})
admin = entrar("admin", "AdminClientes2026")
admin.api("POST", "/productos", {"code": "CEM", "name": "Cemento", "unit": "Unidad", "stock": 100, "price": 30, "category": "General"})
CEM = int(sql("select id from productos where code = 'CEM'"))
caja = int(sql("select id from cash_registers where name = 'Caja Principal'"))
admin.api("POST", "/caja/apertura", {"cashRegisterId": caja, "montoInicial": 0})

print("=== Registro de clientes ===")
st, r = admin.api("POST", "/clientes", {"type": "Natural", "doc": "41112222", "name": "Ana Torres", "maxCredit": 500})
verificar("Se registra un cliente con su límite de crédito", st == 201 and float(r["maxCredit"]) == 500, (st, r))
ANA = r["id"]
st, r = admin.api("POST", "/clientes", {"type": "Natural", "doc": "41112222", "name": "Otra Ana"})
verificar("Documento repetido → 400", st == 400 and "ya está registrado" in r.get("error", ""), (st, r))
st, r = admin.api("POST", "/clientes", {"doc": "", "name": "Sin documento"})
verificar("Sin documento → 400", st == 400, (st, r))
st, r = admin.api("POST", "/clientes", {"type": "Empresa", "doc": "20611112222", "name": "Constructora Sur"})
EMP = r["id"]
cliente = next(c for c in admin.api("GET", "/clientes")[1] if c["id"] == EMP)
verificar("Sin límite propio, puede fiar hasta S/ 1000", cliente["maxCredit"] == 1000 and cliente["availableCredit"] == 1000, cliente)

print("\n=== Edición ===")
st, r = admin.api("PUT", f"/clientes/{ANA}", {"type": "Natural", "doc": "4111", "name": "Ana Torres"})
verificar("DNI que no tiene 8 dígitos → 400", st == 400 and "8 dígitos" in r.get("error", ""), (st, r))
st, r = admin.api("PUT", f"/clientes/{EMP}", {"type": "EMPRESA", "doc": "2061111", "name": "Constructora Sur"})
verificar("RUC que no tiene 11 dígitos → 400", st == 400 and "11 dígitos" in r.get("error", ""), (st, r))
st, r = admin.api("PUT", f"/clientes/{ANA}", {"type": "Natural", "doc": "41112222", "name": "Ana Torres Ruiz", "phone": "976111222"})
verificar("Se modifican los datos", st == 200 and r["client"]["name"] == "Ana Torres Ruiz", (st, r))
st, r = admin.api("PUT", f"/clientes/{ANA}", {"type": "Natural", "doc": "41112222", "name": "Ana Torres Ruiz", "phone": "976111222"})
verificar("Sin cambios no se guarda ni se audita", st == 200 and "client" not in r, (st, r))
st, r = admin.api("PUT", f"/clientes/{ANA}", {"type": "Natural", "doc": "20611112222", "name": "Ana"})
verificar("No se puede tomar el documento de otro cliente", st == 400, (st, r))
st, r = admin.api("PUT", "/clientes/99999", {"type": "Natural", "doc": "41119999", "name": "Nadie Nadie"})
verificar("Cliente inexistente → 404", st == 404, (st, r))
st, r = admin.api("PUT", f"/clientes/{ANA}/price-list", {"priceList": "MAYORISTA"})
verificar("Lista de precios desconocida → 400", st == 400, (st, r))

print("\n=== Consulta de documento ===")
st, r = admin.api("GET", "/clientes/consulta-doc/41112222")
verificar("Un documento registrado se encuentra en la base", st == 200 and r["foundInDb"] and r["client"]["name"] == "Ana Torres Ruiz", r)
st, r = admin.api("GET", "/clientes/consulta-doc/123")
verificar("Un documento que no es DNI ni RUC → 404", st == 404, (st, r))

print("\n=== Crédito y abonos ===")
st, r = venta(admin, [(CEM, 10)], 300, clienteId=ANA, payMethod="Fiado")
verificar("Venta al fiado de S/ 300", st == 201, (st, r))
st, r = venta(admin, [(CEM, 10)], 300, clienteId=ANA, payMethod="Fiado")
verificar("Otra de S/ 300 supera el límite de 500 → CREDITO_INSUFICIENTE", st == 400 and r.get("codigo") == "CREDITO_INSUFICIENTE", (st, r))
deuda = next(d for d in admin.api("GET", "/creditos")[1] if d["clienteId"] == ANA)
verificar("La cuenta muestra la deuda y lo disponible", deuda["debt"] == 300 and deuda["availableCredit"] == 200, deuda)
st, r = admin.api("POST", "/creditos/abono", {"clienteId": ANA, "amount": 400})
verificar("Abonar más de lo que debe → 400", st == 400 and "superar la deuda" in r.get("error", ""), (st, r))
st, r = admin.api("POST", "/creditos/abono", {"clienteId": ANA, "amount": 0})
verificar("Abono de 0 → 400", st == 400, (st, r))
st, r = admin.api("POST", "/creditos/abono", {"clienteId": ANA, "amount": 100})
verificar("Abono de S/ 100 con su número de recibo", st == 200 and r["docRef"].startswith("REC-"), (st, r))
recibo = r["docRef"]
verificar("…y la deuda baja a S/ 200", float(sql(f"select \"debtTotal\" from creditos_cliente where \"clienteId\" = {ANA}")) == 200)
with ThreadPoolExecutor(max_workers=2) as ex:
    abonos = list(ex.map(lambda _: admin.api("POST", "/creditos/abono", {"clienteId": ANA, "amount": 150}), range(2)))
verificar("Dos abonos de S/ 150 a la vez sobre S/ 200: solo uno pasa", sorted(s for s, _ in abonos) == [200, 400], [s for s, _ in abonos])
verificar("…la deuda nunca queda negativa (S/ 50)", float(sql(f"select \"debtTotal\" from creditos_cliente where \"clienteId\" = {ANA}")) == 50)
recibos = [r["docRef"] for s, r in abonos if s == 200] + [recibo]
verificar("Cada recibo tiene su propio número", len(set(recibos)) == len(recibos), recibos)
st, r = admin.api("POST", "/creditos/abono", {"clienteId": EMP, "amount": 10})
verificar("Un cliente sin deuda no recibe abonos → 400", st == 400 and "no tiene deudas" in r.get("error", ""), (st, r))

resumen()
