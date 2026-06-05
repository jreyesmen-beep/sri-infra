import xmlsig
import base64
import logging
import hashlib
from datetime import datetime, timezone
from lxml import etree
from cryptography.hazmat.primitives.serialization import pkcs12, Encoding
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.x509 import Certificate
from secrets_manager import obtener_certificado


logger = logging.getLogger(__name__)

# Namespaces requeridos por el SRI
NS_DS    = "http://www.w3.org/2000/09/xmldsig#"
NS_XADES = "http://uri.etsi.org/01903/v1.3.2#"
NS_EC    = "http://www.w3.org/2001/10/xml-exc-c14n#"

def cargar_pkcs12(p12_bytes: bytes, password: str):
    private_key, certificate, ca_certs = pkcs12.load_key_and_certificates(
        data     = p12_bytes,
        password = password.encode("utf-8")
    )
    logger.info(f"Certificado cargado: {certificate.subject}")
    return private_key, certificate, ca_certs

def firmar_xml(xml_str: str) -> str:
    """
    Firma un XML con XAdES-BES según el esquema exacto del SRI Ecuador.
    """
    p12_bytes, password = obtener_certificado()
    private_key, certificate, _ = cargar_pkcs12(p12_bytes, password)

    # Exportar certificado
    cert_der    = certificate.public_bytes(Encoding.DER)
    cert_base64 = base64.b64encode(cert_der).decode("utf-8")

    # Hash del certificado para XAdES
    cert_hash   = base64.b64encode(
        hashlib.sha1(cert_der).digest()
    ).decode("utf-8")

    # Datos del certificado
    issuer  = _get_issuer_name(certificate)
    serial  = str(certificate.serial_number)
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Parsear el XML original
    root = etree.fromstring(xml_str.encode("utf-8"))

    # -----------------------------------------------
    # 1. Canonicalizar el documento completo (c14n)
    # -----------------------------------------------
    doc_c14n       = _canonicalizar(root)
    doc_digest     = base64.b64encode(hashlib.sha1(doc_c14n).digest()).decode("utf-8")

    # -----------------------------------------------
    # 2. Construir SignedProperties (para XAdES)
    # -----------------------------------------------
    signed_props_id = "Signature-SignedProperties"
    signed_props    = _construir_signed_properties(
        signed_props_id, now_str,
        cert_hash, issuer, serial
    )

    # Canonicalizar SignedProperties para el digest
    signed_props_c14n    = _canonicalizar(signed_props)
    signed_props_digest  = base64.b64encode(
        hashlib.sha1(signed_props_c14n).digest()
    ).decode("utf-8")

    # -----------------------------------------------
    # 3. Construir SignedInfo
    # -----------------------------------------------
    signed_info = etree.Element(f"{{{NS_DS}}}SignedInfo")

    c14n_method = etree.SubElement(signed_info, f"{{{NS_DS}}}CanonicalizationMethod")
    c14n_method.set("Algorithm", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315")

    sign_method = etree.SubElement(signed_info, f"{{{NS_DS}}}SignatureMethod")
    sign_method.set("Algorithm", "http://www.w3.org/2000/09/xmldsig#rsa-sha1")

    # Referencia 1: al documento completo
    ref1 = etree.SubElement(signed_info, f"{{{NS_DS}}}Reference")
    ref1.set("Id",  "comprobante")
    ref1.set("URI", "")
    transforms1 = etree.SubElement(ref1, f"{{{NS_DS}}}Transforms")
    transform1  = etree.SubElement(transforms1, f"{{{NS_DS}}}Transform")
    transform1.set("Algorithm", "http://www.w3.org/2000/09/xmldsig#enveloped-signature")
    digest_method1 = etree.SubElement(ref1, f"{{{NS_DS}}}DigestMethod")
    digest_method1.set("Algorithm", "http://www.w3.org/2000/09/xmldsig#sha1")
    digest_value1 = etree.SubElement(ref1, f"{{{NS_DS}}}DigestValue")
    digest_value1.text = doc_digest

    # Referencia 2: a SignedProperties (XAdES)
    ref2 = etree.SubElement(signed_info, f"{{{NS_DS}}}Reference")
    ref2.set("Id",   "SignedPropertiesID")
    ref2.set("URI",  f"#{signed_props_id}")
    ref2.set("Type", "http://uri.etsi.org/01903#SignedProperties")
    transforms2 = etree.SubElement(ref2, f"{{{NS_DS}}}Transforms")
    transform2  = etree.SubElement(transforms2, f"{{{NS_DS}}}Transform")
    transform2.set("Algorithm", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315")
    digest_method2 = etree.SubElement(ref2, f"{{{NS_DS}}}DigestMethod")
    digest_method2.set("Algorithm", "http://www.w3.org/2000/09/xmldsig#sha1")
    digest_value2 = etree.SubElement(ref2, f"{{{NS_DS}}}DigestValue")
    digest_value2.text = signed_props_digest

    # -----------------------------------------------
    # 4. Firmar el SignedInfo
    # -----------------------------------------------
    signed_info_c14n = _canonicalizar(signed_info)
    firma_bytes = private_key.sign(
        signed_info_c14n,
        padding.PKCS1v15(),
        hashes.SHA1()
    )
    firma_b64 = base64.b64encode(firma_bytes).decode("utf-8")

    # -----------------------------------------------
    # 5. Construir el elemento Signature completo
    # -----------------------------------------------
    signature = etree.Element(f"{{{NS_DS}}}Signature")
    signature.set("xmlns:ds",    NS_DS)
    signature.set("xmlns:etsi",  NS_XADES)
    signature.set("Id",          "Signature")

    # SignedInfo
    signature.append(signed_info)

    # SignatureValue
    sig_value = etree.SubElement(signature, f"{{{NS_DS}}}SignatureValue")
    sig_value.set("Id", "SignatureValue")
    sig_value.text = firma_b64

    # KeyInfo
    key_info  = etree.SubElement(signature, f"{{{NS_DS}}}KeyInfo")
    x509_data = etree.SubElement(key_info,  f"{{{NS_DS}}}X509Data")
    x509_cert = etree.SubElement(x509_data, f"{{{NS_DS}}}X509Certificate")
    x509_cert.text = cert_base64

    # Object con QualifyingProperties (XAdES-BES)
    obj = etree.SubElement(signature, f"{{{NS_DS}}}Object")
    obj.set("Id", "etsi-object")

    qualifying = etree.SubElement(obj, f"{{{NS_XADES}}}QualifyingProperties")
    qualifying.set("xmlns:etsi", NS_XADES)
    qualifying.set("Target",     "#Signature")

    qualifying.append(signed_props)

    # -----------------------------------------------
    # 6. Adjuntar firma al XML y serializar
    # -----------------------------------------------
    root.append(signature)

    xml_firmado = etree.tostring(
        root,
        xml_declaration = True,
        encoding        = "UTF-8"
    ).decode("utf-8")

    _verificar_firma(xml_firmado)

    logger.info("✅ XML firmado correctamente con XAdES-BES")
    return xml_firmado


def _construir_signed_properties(sp_id, now_str, cert_hash, issuer, serial):
    """
    Construye el bloque XAdES SignedProperties requerido por el SRI.
    """
    signed_props = etree.Element(f"{{{NS_XADES}}}SignedProperties")
    signed_props.set("Id", sp_id)

    signed_sig_props = etree.SubElement(
        signed_props,
        f"{{{NS_XADES}}}SignedSignatureProperties"
    )

    # Fecha y hora de firma
    signing_time = etree.SubElement(
        signed_sig_props,
        f"{{{NS_XADES}}}SigningTime"
    )
    signing_time.text = now_str

    # Certificado de firma
    signing_cert = etree.SubElement(
        signed_sig_props,
        f"{{{NS_XADES}}}SigningCertificate"
    )
    cert_elem  = etree.SubElement(signing_cert, f"{{{NS_XADES}}}Cert")
    cert_digest = etree.SubElement(cert_elem,   f"{{{NS_XADES}}}CertDigest")

    digest_method = etree.SubElement(
        cert_digest,
        f"{{{NS_DS}}}DigestMethod"
    )
    digest_method.set("Algorithm", "http://www.w3.org/2000/09/xmldsig#sha1")

    digest_value = etree.SubElement(cert_digest, f"{{{NS_DS}}}DigestValue")
    digest_value.text = cert_hash

    issuer_serial  = etree.SubElement(cert_elem, f"{{{NS_XADES}}}IssuerSerial")
    x509_name      = etree.SubElement(issuer_serial, f"{{{NS_DS}}}X509IssuerName")
    x509_name.text = issuer
    x509_serial    = etree.SubElement(issuer_serial, f"{{{NS_DS}}}X509SerialNumber")
    x509_serial.text = serial

    # Política de firma (requerida por SRI)
    sig_policy = etree.SubElement(
        signed_sig_props,
        f"{{{NS_XADES}}}SignaturePolicyIdentifier"
    )
    sig_policy_implied = etree.SubElement(
        sig_policy,
        f"{{{NS_XADES}}}SignaturePolicyImplied"
    )

    return signed_props


def _canonicalizar(elemento) -> bytes:
    """
    Aplica canonicalización C14N al elemento XML.
    """
    output = etree.tostring(elemento, method="c14n", exclusive=False)
    return output


def _get_issuer_name(certificate) -> str:
    """
    Obtiene el nombre del emisor del certificado en formato RFC2253.
    """
    try:
        return certificate.issuer.rfc4514_string()
    except Exception:
        attrs = []
        for attr in certificate.issuer:
            attrs.append(f"{attr.oid.dotted_string}={attr.value}")
        return ",".join(attrs)


def _verificar_firma(xml_str: str):
    """
    Verifica que la firma tenga todos los elementos requeridos por el SRI.
    """
    root = etree.fromstring(xml_str.encode("utf-8"))

    checks = {
        "X509Certificate":     f".//{{{NS_DS}}}X509Certificate",
        "SignatureValue":       f".//{{{NS_DS}}}SignatureValue",
        "SigningTime":          f".//{{{NS_XADES}}}SigningTime",
        "SigningCertificate":   f".//{{{NS_XADES}}}SigningCertificate",
        "QualifyingProperties": f".//{{{NS_XADES}}}QualifyingProperties",
    }

    for nombre, xpath in checks.items():
        elementos = root.findall(xpath)
        if not elementos or not elementos[0].text:
            raise ValueError(f"Firma incompleta: falta {nombre}")
        logger.info(f"  ✓ {nombre} presente")

    logger.info("✅ Verificación de firma XAdES-BES OK")