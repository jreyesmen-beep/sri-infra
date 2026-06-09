# verificar_firma.py
# Ejecutar con: python3 verificar_firma.py factura_firmada.xml

import sys
import base64
import hashlib
from lxml import etree
from cryptography.hazmat.primitives.serialization import pkcs12, Encoding
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes

NS_DS    = "http://www.w3.org/2000/09/xmldsig#"
NS_XADES = "http://uri.etsi.org/01903/v1.3.2#"

def verificar(xml_path: str, p12_path: str, password: str):
    with open(xml_path, "rb") as f:
        xml_bytes = f.read()
    with open(p12_path, "rb") as f:
        p12_bytes = f.read()

    _, certificate, _ = pkcs12.load_key_and_certificates(
        data=p12_bytes, password=password.encode("utf-8")
    )

    root      = etree.fromstring(xml_bytes)
    signature = root.find(f"{{{NS_DS}}}Signature")

    # -----------------------------------------------
    # 1. Verificar digest del documento
    # -----------------------------------------------
    print("\n===== 1. DIGEST DEL DOCUMENTO =====")
    dv_doc = signature.find(
        f".//{{{NS_DS}}}Reference[@URI='']/{{{NS_DS}}}DigestValue"
    )
    digest_xml = dv_doc.text.strip()

    # Reconstruir documento sin Signature
    import copy
    root_copy = copy.deepcopy(root)
    for sig in root_copy.findall(f"{{{NS_DS}}}Signature"):
        root_copy.remove(sig)

    doc_c14n   = etree.tostring(root_copy, method="c14n", with_comments=False)
    doc_digest = base64.b64encode(hashlib.sha1(doc_c14n).digest()).decode("utf-8")

    print(f"  En XML   : {digest_xml}")
    print(f"  Calculado: {doc_digest}")
    print(f"  ✅ OK" if digest_xml == doc_digest else "  ❌ MISMATCH")

    # -----------------------------------------------
    # 2. Verificar digest de SignedProperties
    # -----------------------------------------------
    print("\n===== 2. DIGEST DE SIGNEDPROPERTIES =====")
    sp_id  = f"Signature-SignedProperties"
    dv_sp  = signature.find(
        f".//{{{NS_DS}}}Reference[@URI='#{sp_id}']/{{{NS_DS}}}DigestValue"
    )
    digest_sp_xml = dv_sp.text.strip()

    signed_props = signature.find(
        f".//{{{NS_XADES}}}SignedProperties[@Id='{sp_id}']"
    )
    sp_c14n   = etree.tostring(signed_props, method="c14n", with_comments=False)
    sp_digest = base64.b64encode(hashlib.sha1(sp_c14n).digest()).decode("utf-8")

    print(f"  En XML   : {digest_sp_xml}")
    print(f"  Calculado: {sp_digest}")
    print(f"  ✅ OK" if digest_sp_xml == sp_digest else "  ❌ MISMATCH")

    # Mostrar c14n de SignedProperties para inspección
    print(f"\n  C14N SignedProperties (primeros 300 chars):")
    print(f"  {sp_c14n[:300]}")

    # -----------------------------------------------
    # 3. Verificar firma sobre SignedInfo
    # -----------------------------------------------
    print("\n===== 3. FIRMA SOBRE SIGNEDINF =====")
    signed_info = signature.find(f"{{{NS_DS}}}SignedInfo")
    sig_value   = signature.find(f"{{{NS_DS}}}SignatureValue")

    si_c14n   = etree.tostring(signed_info, method="c14n", with_comments=False)
    sig_bytes = base64.b64decode(sig_value.text.strip())

    print(f"  C14N SignedInfo (primeros 300 chars):")
    print(f"  {si_c14n[:300]}")

    try:
        public_key = certificate.public_key()
        public_key.verify(sig_bytes, si_c14n, padding.PKCS1v15(), hashes.SHA1())
        print(f"  ✅ Firma RSA-SHA1 válida")
    except Exception as e:
        print(f"  ❌ Firma RSA-SHA1 INVÁLIDA: {e}")

if __name__ == "__main__":
    verificar(
        xml_path = "factura_firmada.xml",   # ← cambia esto
        p12_path = "/home/ubuntu/Facturacion-Cloud/Certificado/JAIRO_nuevo.p12",    # ← cambia esto
        password = "Kuara25Funci"            # ← cambia esto
    )
