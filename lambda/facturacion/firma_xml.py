import xmlsig
from lxml import etree
from OpenSSL import crypto
from secrets_manager import obtener_certificado

def firmar_xml(xml_str: str) -> str:
    """
    Firma un XML con XAdES-BES según el esquema del SRI Ecuador.
    Retorna el XML firmado como string.
    """
    p12_bytes, password = obtener_certificado()

    # Cargar el certificado .p12
    p12 = crypto.load_pkcs12(p12_bytes, password.encode())
    private_key  = p12.get_privatekey()
    certificado  = p12.get_certificate()

    # Parsear el XML
    root = etree.fromstring(xml_str.encode())

    # Crear la firma XAdES-BES
    signature = xmlsig.template.create(
        c14n_method=xmlsig.constants.TransformInclC14N,
        sign_method=xmlsig.constants.TransformRsaSha1,
        name="Signature"
    )

    # Agregar referencia al documento completo
    ref = xmlsig.template.add_reference(
        signature,
        xmlsig.constants.TransformSha1,
        name="comprobante",
        uri=""
    )
    xmlsig.template.add_transform(ref, xmlsig.constants.TransformEnveloped)

    # Agregar información del certificado
    ki = xmlsig.template.ensure_key_info(signature)
    xmlsig.template.add_x509_data(ki)

    root.append(signature)

    # Crear contexto y firmar
    ctx = xmlsig.SignatureContext()
    ctx.load_pkcs12(p12_bytes, password.encode())
    ctx.sign(signature)

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8").decode()