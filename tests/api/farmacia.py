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
st, r = admin.api("PUT", f"/productos/{PARA}", {**base, "industryData": {"sanitaryRegistration": "EE-09999", "requiresPrescription": True}})
verificar("Editarlos los reemplaza", st == 200 and r.get("industryData") == {"sanitaryRegistration": "EE-09999", "requiresPrescription": True,
                                                                           "controlled": False}, (st, r))

reiniciar_backend()
resumen()
