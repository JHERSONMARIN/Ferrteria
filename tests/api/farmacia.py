from lib import *  # noqa: F401,F403

# La empresa de esta cadena es una farmacia: el backend arranca con su rubro.
reiniciar_backend(INDUSTRY="farmacia")
admin = entrar("admin", CLAVE_TEMPORAL)
admin.api("POST", "/auth/change-password", {"currentPassword": CLAVE_TEMPORAL, "newPassword": "AdminFarmacia2026"})
admin = entrar("admin", "AdminFarmacia2026")

print("=== Rubro ===")
st, r = admin.api("GET", "/settings")
verificar("La empresa es farmacia y las pantallas reciben su vocabulario",
          r.get("industry") == "farmacia" and (r.get("vocabulary") or {}).get("business") == "farmacia", (r.get("industry"), r.get("vocabulary")))

print("\n=== Datos de farmacia en los productos ===")
st, r = admin.api("POST", "/productos", {"code": "PARA500", "name": "Paracetamol 500 mg", "unit": "Unidad", "stock": 100, "price": 0.5,
                                         "category": "General", "industryData": {"sanitaryRegistration": " EE-01234 ", "laboratory": " ",
                                                                                 "activeIngredient": "Paracetamol"}})
verificar("Se crea un producto con registro sanitario y principio activo", st in (200, 201), (st, r))
st, r = admin.api("POST", "/productos", {"code": "CLONA", "name": "Clonazepam 2 mg", "unit": "Unidad", "stock": 30, "price": 1.2,
                                         "category": "General", "industryData": {"controlled": True}})
verificar("Se crea un controlado", st in (200, 201), (st, r))
admin.api("POST", "/productos", {"code": "ALGO", "name": "Algodón 50 g", "unit": "Unidad", "stock": 10, "price": 3, "category": "General"})

productos = {p["code"]: p for p in admin.api("GET", "/productos")[1]}
verificar("Los textos se guardan recortados y lo vacío no se guarda",
          productos["PARA500"]["industryData"] == {"sanitaryRegistration": "EE-01234", "activeIngredient": "Paracetamol",
                                                   "requiresPrescription": False, "controlled": False}, productos["PARA500"]["industryData"])
verificar("Un controlado siempre pide receta", productos["CLONA"]["industryData"].get("requiresPrescription") is True, productos["CLONA"]["industryData"])
verificar("Un producto sin datos de farmacia queda sin receta", productos["ALGO"]["industryData"] == {"requiresPrescription": False, "controlled": False},
          productos["ALGO"]["industryData"])

st, r = admin.api("POST", "/productos", {"code": "MALO", "name": "Dato malo", "unit": "Unidad", "stock": 1, "price": 1,
                                         "category": "General", "industryData": {"requiresPrescription": "si"}})
verificar("Un dato de farmacia inválido → 400 con su mensaje, sin crear nada",
          st == 400 and r.get("codigo") == "RUBRO_DATOS_INVALIDOS" and "receta" in r.get("error", "")
          and sql("select count(*) from productos where code = 'MALO'") == "0", (st, r))

PARA = productos["PARA500"]["id"]
base = {"code": "PARA500", "name": "Paracetamol 500 mg", "unit": "Unidad", "price": 0.5, "category": "General"}
st, r = admin.api("PUT", f"/productos/{PARA}", {**base, "price": 0.6})
verificar("Editar sin enviar los datos de farmacia no los borra",
          st == 200 and r.get("industryData", {}).get("sanitaryRegistration") == "EE-01234", (st, r))
st, r = admin.api("PUT", f"/productos/{PARA}", {**base, "industryData": {"sanitaryRegistration": "EE-09999", "laboratory": "Portugal"}})
verificar("Editarlos los reemplaza", st == 200 and r.get("industryData") == {"sanitaryRegistration": "EE-09999", "laboratory": "Portugal",
                                                                           "requiresPrescription": False, "controlled": False}, (st, r))


print("\n=== Lotes ===")
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
hoy = datetime.now(ZoneInfo("America/Lima")).date()
dia = lambda dias: (hoy + timedelta(days=dias)).isoformat()


def lotes(code, branch_id=1):
    filas = sql(f"select l.\"lotNumber\" || ':' || l.quantity::float from farmacia_lotes l join productos p on p.id = l.\"productoId\" "
                f"where p.code = '{code}' and l.\"branchId\" = {branch_id} and l.quantity > 0 order by l.\"expiresAt\"")
    return [f for f in filas.split("\n") if f]


PROV = admin.api("POST", "/proveedores", {"ruc": "20100000009", "name": "Droguería Lima"})[1]["id"]
st, r = admin.api("POST", "/compras", {"proveedorId": PROV, "numDoc": "F001-1", "items": [
    {"id": PARA, "qty": 20, "cost": 0.2, "industryData": {"lotNumber": "A", "expiresAt": dia(60)}},
    {"id": PARA, "qty": 10, "cost": 0.2, "industryData": {"lotNumber": "B", "expiresAt": dia(300)}},
]})
verificar("Una compra registra cada línea en su lote", st == 201 and lotes("PARA500") == ["A:20", "B:10"], (st, r, lotes("PARA500")))
st, r = admin.api("POST", "/compras", {"proveedorId": PROV, "numDoc": "F001-2", "items": [
    {"id": PARA, "qty": 5, "cost": 0.2, "industryData": {"lotNumber": "C"}}]})
verificar("Lote sin vencimiento → 400 sin registrar la compra",
          st == 400 and "vencimiento" in r.get("error", "") and sql("select count(*) from compras where \"numDoc\" = 'F001-2'") == "0", (st, r))
st, r = admin.api("POST", "/kardex", {"productoId": PARA, "type": "ENTRADA", "qty": 4, "ref": "Devolución de Cliente",
                                      "industryData": {"lotNumber": "V", "expiresAt": dia(-1)}})
verificar("Un ingreso manual también entra a su lote (aunque ya esté vencido)", st == 201 and lotes("PARA500")[0] == "V:4", (st, r, lotes("PARA500")))
verificar("El stock sin lote es el resto: 100 iniciales", stock("PARA500") == (134, 0), stock("PARA500"))

caja = int(sql("select id from cash_registers order by id limit 1"))
abrir_caja(admin, caja)
st, r = venta(admin, [(PARA, 25)], 12.5)
verificar("Una venta sale de lo que vence antes y no toca lo vencido", st == 201 and lotes("PARA500") == ["V:4", "B:5"], (st, r, lotes("PARA500")))
st, r = venta(admin, [(PARA, 103)], 51.5)
verificar("…y después, de lo que no tiene lote", st == 201 and lotes("PARA500") == ["V:4"] and stock("PARA500") == (6, 0),
          (st, r, lotes("PARA500"), stock("PARA500")))
st, r = venta(admin, [(PARA, 3)], 1.5)
verificar("Si para completarla haría falta lo vencido → 409 sin vender",
          st == 409 and r.get("codigo") == "FARMACIA_STOCK_VENCIDO" and stock("PARA500") == (6, 0), (st, r, stock("PARA500")))
st, r = admin.api("POST", "/kardex", {"productoId": PARA, "type": "SALIDA", "qty": 4, "ref": "Producto Vencido / No Apto"})
verificar("Una salida manual retira primero lo vencido", st == 201 and lotes("PARA500") == [] and stock("PARA500") == (2, 0),
          (st, r, lotes("PARA500"), stock("PARA500")))

admin.api("POST", "/compras", {"proveedorId": PROV, "numDoc": "F001-3", "items": [
    {"id": PARA, "qty": 3, "cost": 0.2, "industryData": {"lotNumber": "D", "expiresAt": dia(90)}}]})
SUC = admin.api("POST", "/sucursales", {"name": "Farmacia Norte"})[1]["id"]
st, r = admin.api("POST", "/transferencias", {"fromBranchId": 1, "toBranchId": SUC, "items": [{"id": PARA, "qty": 4}]})
verificar("Una transferencia lleva sus lotes a la otra sucursal (y lo sin lote queda sin lote)",
          st == 201 and lotes("PARA500") == [] and lotes("PARA500", SUC) == ["D:3"] and stock_en("PARA500", SUC) == (4, 0),
          (st, r, lotes("PARA500"), lotes("PARA500", SUC)))

print("\n=== Receta ===")
admin.api("POST", "/productos", {"code": "AMOX", "name": "Amoxicilina 500 mg", "unit": "Unidad", "stock": 20, "price": 2,
                                 "category": "General", "industryData": {"requiresPrescription": True}})
AMOX = int(sql("select id from productos where code = 'AMOX'"))
CLONA = int(sql("select id from productos where code = 'CLONA'"))
st, r = venta(admin, [(AMOX, 1)], 2)
verificar("Un producto con receta no se vende sin el número → 400", st == 400 and r.get("codigo") == "FARMACIA_RECETA"
          and "Amoxicilina" in r.get("error", "") and stock("AMOX") == (20, 0), (st, r))
st, r = venta(admin, [(AMOX, 1)], 2, industryData={"prescriptionNumber": " R-001 "})
verificar("…con el número se vende y la receta queda en la venta", st == 201
          and sql(f"select \"industryData\"->>'prescriptionNumber' from ventas where id = {r.get('venta', {}).get('id', 0)}") == "R-001", (st, r))
st, r = venta(admin, [(CLONA, 1), (AMOX, 1)], 3.2, industryData={"prescriptionNumber": "R-002"})
verificar("Un controlado pide también médico y paciente → 400", st == 400 and "médico" in r.get("error", "") and "Clonazepam" in r.get("error", ""), (st, r))
st, r = venta(admin, [(CLONA, 1)], 1.2, industryData={"prescriptionNumber": "R-002", "prescriber": "Dra. Salas CMP 23456", "patient": "Ana Ruiz"})
verificar("…y con todo se vende", st == 201 and stock("CLONA") == (29, 0), (st, r))
st, r = admin.api("POST", "/ventas", {"docType": "Nota de Venta", "payMethod": "Efectivo", "cart": [{"id": AMOX, "qty": 1}], "totalEsperado": 2,
                                      "industryData": {"prescriptionNumber": 123}})
verificar("Un dato de receta con otro tipo → 400 con su mensaje", st == 400 and "receta" in r.get("error", ""), (st, r))

print("\n=== Vencidos ===")
admin.api("POST", "/productos", {"code": "JARABE", "name": "Jarabe para la tos", "unit": "Unidad", "stock": 2, "price": 10, "category": "General"})
JARABE = int(sql("select id from productos where code = 'JARABE'"))
admin.api("POST", "/kardex", {"productoId": JARABE, "type": "ENTRADA", "qty": 5, "ref": "Devolución de Cliente",
                              "industryData": {"lotNumber": "J1", "expiresAt": dia(-10)}})
st, r = venta(admin, [(JARABE, 3)], 30)
verificar("Si no alcanza lo vigente → 409 que dice cuánto hay vigente y cuánto vencido",
          st == 409 and r.get("codigo") == "FARMACIA_STOCK_VENCIDO" and "solo hay 2 vigente" in r.get("error", "") and stock("JARABE") == (7, 0), (st, r))
st, r = venta(admin, [(JARABE, 2)], 20)
verificar("…y lo vigente sí se vende", st == 201 and stock("JARABE") == (5, 0) and lotes("JARABE") == ["J1:5"], (st, r, lotes("JARABE")))

reiniciar_backend()
resumen()
