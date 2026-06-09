import base64
import hashlib
import random
import copy
import logging
from datetime import datetime, timezone, timedelta
from lxml import etree
from cryptography.hazmat.primitives.serialization import pkcs12, Encoding
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.x509.oid import NameOID
from secrets_manager import obtener_certificado

logger = logging.getLogger(__name__)

NS_DS    = "http://www.w3.org/2000/09/xmldsig#"
NS_XADES = "http://uri.etsi.org/01903/v1.3.2#"
C14N_ALG = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
SHA1_ALG = "http://www.w3.org/2000/09/xmldsig#sha1"
RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1"
XADES_SP = "http://uri.etsi.org/01903#SignedProperties"
ENVLP_TR = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"
NSMAP    = {"ds": NS_DS, "etsi": NS_XADES}


def _uid() -> str:
    return str(random.randint(100000, 999999))


def cargar_pkcs12(p12_bytes: bytes, password: str):
    private_key, certificate, _ = pkcs12.load_key_and_certificates(
        data=p12_bytes, password=password.encode("utf-8")
    )
    # logger.info(f"Certificado cargado: {certificate.subject}")
    return private_key, certificate


def firmar_xml(xml_str: str) -> str:
    """
    Firma XML con XAdES-BES replicando exactamente la estructura
    verificada del XML autorizado por el SRI Ecuador en producción.
    """
    p12_bytes, password      = obtener_certificado()
    private_key, certificate = cargar_pkcs12(p12_bytes, password)

    # Datos del certificado
    cert_der    = certificate.public_bytes(Encoding.DER)
    cert_base64 = base64.b64encode(cert_der).decode("utf-8")
    cert_hash   = base64.b64encode(hashlib.sha1(cert_der).digest()).decode("utf-8")
    issuer      = _get_issuer(certificate)
    serial      = str(certificate.serial_number)

    # Clave pública RSA
    pub_numbers  = certificate.public_key().public_numbers()
    modulus_b64  = base64.b64encode(
        pub_numbers.n.to_bytes((pub_numbers.n.bit_length() + 7) // 8, 'big')
    ).decode("utf-8")
    exponent_b64 = base64.b64encode(
        pub_numbers.e.to_bytes((pub_numbers.e.bit_length() + 7) // 8, 'big')
    ).decode("utf-8")

    # Hora Ecuador UTC-5
    now_ec  = datetime.now(timezone(timedelta(hours=-5)))
    now_str = now_ec.strftime("%Y-%m-%dT%H:%M:%S-05:00")

    # logger.info(f"IssuerName: {issuer}")
    # logger.info(f"Serial    : {serial}")

    # IDs únicos
    sig_id     = f"Signature{_uid()}"
    sig_val_id = f"SignatureValue{_uid()}"
    si_id      = f"Signature-SignedInfo{_uid()}"
    cert_id    = f"Certificate{_uid()}"
    obj_id     = f"{sig_id}-Object{_uid()}"
    sp_id      = f"{sig_id}-SignedProperties{_uid()}"
    ref_sp_id  = f"SignedPropertiesID{_uid()}"
    ref_doc_id = f"Reference-ID-{_uid()}"

    # -----------------------------------------------
    # 1. Parsear documento
    # -----------------------------------------------
    root = etree.fromstring(xml_str.encode("utf-8"))

    # -----------------------------------------------
    # 2. Digest del documento con enveloped transform
    #    URI="#comprobante" → apunta al root element
    #    Enveloped = root sin Signature
    # -----------------------------------------------
    root_copy = copy.deepcopy(root)
    for sig in root_copy.findall(f"{{{NS_DS}}}Signature"):
        root_copy.remove(sig)
    doc_c14n   = etree.tostring(root_copy, method="c14n", with_comments=False)
    doc_digest = base64.b64encode(hashlib.sha1(doc_c14n).digest()).decode("utf-8")
    # logger.info(f"Digest doc: {doc_digest}")

    # -----------------------------------------------
    # 3. Construir SignedProperties con NSMAP completo
    #    para que c14n incluya xmlns:ds y xmlns:etsi
    # -----------------------------------------------
    signed_props = etree.Element(f"{{{NS_XADES}}}SignedProperties", nsmap=NSMAP)
    signed_props.set("Id", sp_id)

    ssp     = etree.SubElement(signed_props, f"{{{NS_XADES}}}SignedSignatureProperties")
    st      = etree.SubElement(ssp, f"{{{NS_XADES}}}SigningTime")
    st.text = now_str

    sc      = etree.SubElement(ssp, f"{{{NS_XADES}}}SigningCertificate")
    cert_el = etree.SubElement(sc,  f"{{{NS_XADES}}}Cert")
    cd      = etree.SubElement(cert_el, f"{{{NS_XADES}}}CertDigest")
    dm      = etree.SubElement(cd,  f"{{{NS_DS}}}DigestMethod")
    dm.set("Algorithm", SHA1_ALG)
    dvc     = etree.SubElement(cd,  f"{{{NS_DS}}}DigestValue")
    dvc.text = cert_hash

    iser       = etree.SubElement(cert_el, f"{{{NS_XADES}}}IssuerSerial")
    xname      = etree.SubElement(iser,    f"{{{NS_DS}}}X509IssuerName")
    xname.text = issuer
    xser       = etree.SubElement(iser,    f"{{{NS_DS}}}X509SerialNumber")
    xser.text  = serial

    sdop = etree.SubElement(signed_props, f"{{{NS_XADES}}}SignedDataObjectProperties")
    dof  = etree.SubElement(sdop, f"{{{NS_XADES}}}DataObjectFormat")
    dof.set("ObjectReference", f"#{ref_doc_id}")
    desc      = etree.SubElement(dof, f"{{{NS_XADES}}}Description")
    desc.text = "contenido comprobante"
    mime      = etree.SubElement(dof, f"{{{NS_XADES}}}MimeType")
    mime.text = "text/xml"

    # Digest SignedProperties standalone (ya tiene NSMAP correcto)
    sp_c14n   = etree.tostring(signed_props, method="c14n", with_comments=False)
    sp_digest = base64.b64encode(hashlib.sha1(sp_c14n).digest()).decode("utf-8")
    # logger.info(f"Digest SP: {sp_digest}")
    # logger.info(f"SP C14N  : {sp_c14n[:150].decode()}")

    # -----------------------------------------------
    # 4. Construir KeyInfo para calcular su digest
    # -----------------------------------------------
    ki = etree.Element(f"{{{NS_DS}}}KeyInfo", nsmap=NSMAP)
    ki.set("Id", cert_id)

    x509d      = etree.SubElement(ki,    f"{{{NS_DS}}}X509Data")
    x509c      = etree.SubElement(x509d, f"{{{NS_DS}}}X509Certificate")
    x509c.text = cert_base64

    kv    = etree.SubElement(ki,  f"{{{NS_DS}}}KeyValue")
    rsaKV = etree.SubElement(kv,  f"{{{NS_DS}}}RSAKeyValue")
    mod   = etree.SubElement(rsaKV, f"{{{NS_DS}}}Modulus")
    mod.text = modulus_b64
    exp   = etree.SubElement(rsaKV, f"{{{NS_DS}}}Exponent")
    exp.text = exponent_b64

    # Digest KeyInfo standalone
    ki_c14n   = etree.tostring(ki, method="c14n", with_comments=False)
    ki_digest = base64.b64encode(hashlib.sha1(ki_c14n).digest()).decode("utf-8")
    # logger.info(f"Digest KI : {ki_digest}")

    # -----------------------------------------------
    # 5. Construir SignedInfo con NSMAP completo
    #    Orden: SP → Certificate → Documento
    # -----------------------------------------------
    signed_info = etree.Element(f"{{{NS_DS}}}SignedInfo", nsmap=NSMAP)
    signed_info.set("Id", si_id)

    c14n_m = etree.SubElement(signed_info, f"{{{NS_DS}}}CanonicalizationMethod")
    c14n_m.set("Algorithm", C14N_ALG)
    sign_m = etree.SubElement(signed_info, f"{{{NS_DS}}}SignatureMethod")
    sign_m.set("Algorithm", RSA_SHA1)

    # Ref 1: SignedProperties
    ref1 = etree.SubElement(signed_info, f"{{{NS_DS}}}Reference")
    ref1.set("Id",   ref_sp_id)
    ref1.set("Type", XADES_SP)
    ref1.set("URI",  f"#{sp_id}")
    etree.SubElement(ref1, f"{{{NS_DS}}}DigestMethod").set("Algorithm", SHA1_ALG)
    etree.SubElement(ref1, f"{{{NS_DS}}}DigestValue").text = sp_digest

    # Ref 2: Certificate
    ref2 = etree.SubElement(signed_info, f"{{{NS_DS}}}Reference")
    ref2.set("URI", f"#{cert_id}")
    etree.SubElement(ref2, f"{{{NS_DS}}}DigestMethod").set("Algorithm", SHA1_ALG)
    etree.SubElement(ref2, f"{{{NS_DS}}}DigestValue").text = ki_digest

    # Ref 3: Documento con enveloped transform
    ref3 = etree.SubElement(signed_info, f"{{{NS_DS}}}Reference")
    ref3.set("Id",  ref_doc_id)
    ref3.set("URI", "#comprobante")   # ← URI apunta al id del elemento raíz
    tr_wrap = etree.SubElement(ref3,     f"{{{NS_DS}}}Transforms")
    tr      = etree.SubElement(tr_wrap,  f"{{{NS_DS}}}Transform")
    tr.set("Algorithm", ENVLP_TR)
    etree.SubElement(ref3, f"{{{NS_DS}}}DigestMethod").set("Algorithm", SHA1_ALG)
    etree.SubElement(ref3, f"{{{NS_DS}}}DigestValue").text = doc_digest

    # -----------------------------------------------
    # 6. Firmar SignedInfo standalone
    # -----------------------------------------------
    si_c14n     = etree.tostring(signed_info, method="c14n", with_comments=False)
    # logger.info(f"SI C14N  : {si_c14n[:150].decode()}")
    firma_bytes = private_key.sign(si_c14n, padding.PKCS1v15(), hashes.SHA1())
    sig_val_b64 = base64.b64encode(firma_bytes).decode("utf-8")

    # -----------------------------------------------
    # 7. Ensamblar Signature completo
    # -----------------------------------------------
    signature = etree.Element(f"{{{NS_DS}}}Signature", nsmap=NSMAP)
    signature.set("Id", sig_id)

    signature.append(signed_info)

    sig_val      = etree.SubElement(signature, f"{{{NS_DS}}}SignatureValue")
    sig_val.set("Id", sig_val_id)
    sig_val.text = sig_val_b64

    signature.append(ki)

    obj        = etree.SubElement(signature, f"{{{NS_DS}}}Object")
    obj.set("Id", obj_id)
    qualifying = etree.SubElement(obj, f"{{{NS_XADES}}}QualifyingProperties")
    qualifying.set("Target", f"#{sig_id}")
    qualifying.append(signed_props)

    # -----------------------------------------------
    # 8. Adjuntar al documento y serializar
    # -----------------------------------------------
    root.append(signature)

    xml_firmado = etree.tostring(
        root,
        xml_declaration = True,
        encoding        = "UTF-8"
    ).decode("utf-8")

    logger.info("✅ XML firmado con XAdES-BES")
    return xml_firmado


def _get_issuer(certificate) -> str:
    oid_map = {
        NameOID.COMMON_NAME:              "CN",
        NameOID.ORGANIZATION_NAME:        "O",
        NameOID.ORGANIZATIONAL_UNIT_NAME: "OU",
        NameOID.COUNTRY_NAME:             "C",
        NameOID.STATE_OR_PROVINCE_NAME:   "ST",
        NameOID.LOCALITY_NAME:            "L",
        NameOID.EMAIL_ADDRESS:            "emailAddress",
        NameOID.SERIAL_NUMBER:            "serialNumber",
    }
    partes = []
    for attr in reversed(list(certificate.issuer)):
        abrev = oid_map.get(attr.oid, attr.oid.dotted_string)
        partes.append(f"{abrev}={attr.value}")
    return ",".join(partes)