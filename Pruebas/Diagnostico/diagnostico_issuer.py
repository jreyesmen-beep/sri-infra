# diagnostico_issuer.py

from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

ruta_p12 = "/home/ubuntu/Facturacion-Cloud/Certificado/JAIRO_nuevo.p12"   # cambia esto
password  = "Kuara25Funci"               # cambia esto

with open(ruta_p12, "rb") as f:
    p12_bytes = f.read()

_, certificate, _ = pkcs12.load_key_and_certificates(
    data=p12_bytes, password=password.encode("utf-8")
)

oid_map = {
    NameOID.COMMON_NAME:              "CN",
    NameOID.ORGANIZATION_NAME:        "O",
    NameOID.ORGANIZATIONAL_UNIT_NAME: "OU",
    NameOID.COUNTRY_NAME:             "C",
}

print("Orden normal (incorrecto para SRI):")
partes_normal = []
for attr in certificate.issuer:
    abrev = oid_map.get(attr.oid, attr.oid.dotted_string)
    partes_normal.append(f"{abrev}={attr.value}")
print(",".join(partes_normal))

print("\nOrden reversed (correcto para SRI):")
partes_reversed = []
for attr in reversed(list(certificate.issuer)):
    abrev = oid_map.get(attr.oid, attr.oid.dotted_string)
    partes_reversed.append(f"{abrev}={attr.value}")
print(",".join(partes_reversed))
