import xmlsig
from lxml import etree
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.x509 import Certificate
from secrets_manager import obtener_certificado
import logging

logger = logging.getLogger(__name__)

def cargar_pkcs12(p12_bytes: bytes, password: str):
    """
    Carga el certificado .p12 usando la librería cryptography.
    Retorna (private_key, certificate, ca_certs)
    """
    try:
        private_key, certificate, ca_certs = pkcs12.load_key_and_certificates(
            data     = p12_bytes,
            password = password.encode("utf-8")
        )
        logger.info(f"Certificado cargado: {certificate.subject}")
        return private_key, certificate, ca_certs

    except Exception as e:
        logger.error(f"Error al cargar el .p12: {str(e)}")
        raise ValueError(f"No se pudo cargar el certificado .p12: {str(e)}")


def certificado_a_pem(certificate: Certificate) -> bytes:
    """
    Convierte el certificado a formato PEM para xmlsig.
    """
    return certificate.public_bytes(serialization.Encoding.PEM)


def clave_a_pem(private_key) -> bytes:
    """
    Convierte la clave privada a formato PEM sin passphrase.
    """
    return private_key.private_bytes(
        encoding             = serialization.Encoding.PEM,
        format               = serialization.PrivateFormat.PKCS8,
        encryption_algorithm = serialization.NoEncryption()
    )


def firmar_xml(xml_str: str) -> str:
    """
    Firma un XML con XAdES-BES según el esquema del SRI Ecuador.
    Retorna el XML firmado como string.
    """
    # 1. Obtener certificado desde Secrets Manager
    p12_bytes, password = obtener_certificado()

    # 2. Cargar el .p12 con cryptography
    private_key, certificate, _ = cargar_pkcs12(p12_bytes, password)

    # 3. Exportar a PEM para xmlsig
    cert_pem = certificado_a_pem(certificate)
    key_pem  = clave_a_pem(private_key)

    # 4. Parsear el XML
    root = etree.fromstring(xml_str.encode("utf-8"))

    # 5. Crear template de firma XAdES-BES
    signature = xmlsig.template.create(
        c14n_method = xmlsig.constants.TransformInclC14N,
        sign_method = xmlsig.constants.TransformRsaSha1,
        name        = "Signature"
    )

    # 6. Referencia al documento completo
    ref = xmlsig.template.add_reference(
        signature,
        xmlsig.constants.TransformSha1,
        name = "comprobante",
        uri  = ""
    )
    xmlsig.template.add_transform(ref, xmlsig.constants.TransformEnveloped)

    # 7. Agregar info del certificado en KeyInfo
    ki = xmlsig.template.ensure_key_info(signature)
    xmlsig.template.add_x509_data(ki)

    # 8. Adjuntar firma al XML
    root.append(signature)

# Reemplaza los pasos 9 y 10 por esto:

    ctx = xmlsig.SignatureContext()

    # Cargar clave privada en PEM
    # ctx.load_pkcs12(p12_bytes, password.encode("utf-8"))

    # Alternativa si lo anterior falla:
    ctx.private_key = private_key
    ctx.x509        = certificate
    # ctx.sign(signature)

    logger.info("XML firmado correctamente")

    return etree.tostring(
        root,
        xml_declaration = True,
        encoding        = "UTF-8"
    ).decode("utf-8")