import xmlsig
from lxml import etree
from cryptography.hazmat.primitives.serialization import pkcs12, Encoding
from cryptography.hazmat.primitives import serialization
from secrets_manager import obtener_certificado
import base64
import logging

logger = logging.getLogger(__name__)

def cargar_pkcs12(p12_bytes: bytes, password: str):
    private_key, certificate, ca_certs = pkcs12.load_key_and_certificates(
        data     = p12_bytes,
        password = password.encode("utf-8")
    )
    logger.info(f"Certificado cargado: {certificate.subject}")
    return private_key, certificate, ca_certs


def firmar_xml(xml_str: str) -> str:
    """
    Firma un XML con XAdES-BES según el esquema del SRI Ecuador.
    Incluye el certificado X509 completo en la firma.
    """
    # 1. Obtener certificado desde Secrets Manager
    p12_bytes, password = obtener_certificado()

    # 2. Cargar el .p12
    private_key, certificate, _ = cargar_pkcs12(p12_bytes, password)

    # 3. Exportar clave privada a PEM
    key_pem = private_key.private_bytes(
        encoding             = Encoding.PEM,
        format               = serialization.PrivateFormat.PKCS8,
        encryption_algorithm = serialization.NoEncryption()
    )

    # 4. Exportar certificado a DER y luego a base64
    cert_der    = certificate.public_bytes(Encoding.DER)
    cert_base64 = base64.b64encode(cert_der).decode("utf-8")

    # 5. Parsear el XML
    root = etree.fromstring(xml_str.encode("utf-8"))

    # 6. Crear template de firma
    signature = xmlsig.template.create(
        c14n_method = xmlsig.constants.TransformInclC14N,
        sign_method = xmlsig.constants.TransformRsaSha1,
        name        = "Signature"
    )

    # 7. Referencia al documento completo
    ref = xmlsig.template.add_reference(
        signature,
        xmlsig.constants.TransformSha1,
        name = "comprobante",
        uri  = ""
    )
    xmlsig.template.add_transform(ref, xmlsig.constants.TransformEnveloped)

    # 8. Construir KeyInfo → X509Data → X509Certificate manualmente
    #    para garantizar que el SRI reciba el certificado completo
    NS_DS = "http://www.w3.org/2000/09/xmldsig#"

    key_info = etree.SubElement(
        signature,
        f"{{{NS_DS}}}KeyInfo"
    )
    x509_data = etree.SubElement(
        key_info,
        f"{{{NS_DS}}}X509Data"
    )
    x509_cert = etree.SubElement(
        x509_data,
        f"{{{NS_DS}}}X509Certificate"
    )
    x509_cert.text = cert_base64

    # 9. Adjuntar firma al XML
    root.append(signature)

    # 10. Crear contexto y cargar claves
    ctx = xmlsig.SignatureContext()

    # Cargar clave privada en PEM
    # ctx.load_pkcs12(p12_bytes, password.encode("utf-8"))
    # ctx.load_pkcs12(p12_bytes)   # ← solo recibe los bytes del .p12 sin password

    # Si lo anterior falla por la password, usar esta alternativa:
    ctx.private_key = serialization.load_pem_private_key(
        key_pem,
        password = None
    )
    ctx.x509 = certificate

    # 11. Firmar
    ctx.sign(signature)

    logger.info("XML firmado correctamente con certificado X509 incluido")

    # 12. Serializar resultado
    xml_firmado = etree.tostring(
        root,
        xml_declaration = True,
        encoding        = "UTF-8"
    ).decode("utf-8")

    # 13. Verificar que X509Certificate no quedó vacío
    _verificar_firma(xml_firmado)

    return xml_firmado


def _verificar_firma(xml_str: str):
    """
    Verificación rápida antes de enviar al SRI.
    Lanza excepción si la firma está incompleta.
    """
    root    = etree.fromstring(xml_str.encode("utf-8"))
    NS_DS   = "http://www.w3.org/2000/09/xmldsig#"

    # Verificar que existe X509Certificate con contenido
    certs = root.findall(
        f".//{{{NS_DS}}}X509Certificate"
    )
    if not certs:
        raise ValueError("X509Certificate no encontrado en la firma")

    for cert in certs:
        if not cert.text or len(cert.text.strip()) < 100:
            raise ValueError("X509Certificate está vacío o incompleto")

    # Verificar que SignatureValue tiene contenido
    sig_values = root.findall(f".//{{{NS_DS}}}SignatureValue")
    if not sig_values or not sig_values[0].text:
        raise ValueError("SignatureValue está vacío")

    logger.info("✅ Verificación de firma OK")
    logger.info(f"   X509Certificate: {cert.text[:50]}...")