def generar_clave_acceso(
    fecha: str,        # ddMMyyyy  ej: "23122024"
    tipo_comp: str,    # 01=factura
    ruc: str,          # 13 dígitos
    ambiente: str,     # 1=pruebas, 2=produccion
    estab: str,        # 001
    pto_emision: str,  # 001
    secuencial: str,   # 000000001
    tipo_emision: str  # 1=normal
) -> str:

    clave_sin_verificador = (
        fecha + tipo_comp + ruc + ambiente +
        estab + pto_emision + secuencial + tipo_emision
    )

    # Algoritmo módulo 11
    def modulo11(clave: str) -> int:
        factores = [2, 3, 4, 5, 6, 7]
        total = 0
        for i, digito in enumerate(reversed(clave)):
            total += int(digito) * factores[i % len(factores)]
        residuo = total % 11
        if residuo == 0:
            return 0
        elif residuo == 1:
            return 1
        return 11 - residuo

    verificador = modulo11(clave_sin_verificador)
    return clave_sin_verificador + str(verificador)

# Uso

from datetime import datetime

hoy = datetime.now()
hoyFormato = hoy.strftime("%d%m20%y")
print(hoyFormato)

clave = generar_clave_acceso(
    fecha        = hoyFormato,
    tipo_comp    = "01",
    ruc          = "0916985096001",
    ambiente     = "1",
    estab        = "001",
    pto_emision  = "002",
    secuencial   = "000000017",
    tipo_emision = "1"
)
print(f"Clave de acceso: {clave}")
print(f"Longitud: {len(clave)} dígitos")