import json
import logging
import os
import boto3
from datetime import datetime

from xml_builder  import construir_factura
from firma_xml    import firmar_xml
from sri_client   import SRIClient

logger   = logging.getLogger()
logger.setLevel(logging.INFO)

s3      = boto3.client("s3")
BUCKET  = os.environ["S3_BUCKET_COMPROBANTES"]
AMBIENTE = os.environ["AMBIENTE"]

def lambda_handler(event, context):
    """
    Punto de entrada. Procesa mensajes de SQS.
    Cada mensaje contiene los datos de un comprobante a emitir.
    """
    errores = []

    for record in event["Records"]:
        mensaje_id = record["messageId"]
        try:
            datos = json.loads(record["body"])
            logger.info(f"Procesando comprobante: {datos.get('clave_acceso', mensaje_id)}")

            resultado = procesar_comprobante(datos)
            logger.info(f"Comprobante procesado: {resultado}")

        except Exception as e:
            logger.error(f"Error en mensaje {mensaje_id}: {str(e)}")
            # Retornar error para que SQS reintente (no eliminará el mensaje)
            errores.append({
                "itemIdentifier": mensaje_id
            })

    # Partial batch response: solo reintentar los que fallaron
    return {"batchItemFailures": errores}


def procesar_comprobante(datos: dict) -> dict:
    clave_acceso = datos["clave_acceso"]
    sri = SRIClient()

    # 1. Construir XML
    logger.info("Construyendo XML...")
    xml = construir_factura(datos)

    # 2. Firmar XML
    logger.info("Firmando XML...")
    xml_firmado = firmar_xml(xml)

    # 3. Guardar XML firmado en S3
    guardar_en_s3(clave_acceso, xml_firmado, "xml-firmado")

    # 4. Enviar al SRI
    logger.info("Enviando al SRI...")
    respuesta_recepcion = sri.enviar_comprobante(xml_firmado)

    if respuesta_recepcion["estado"] == "DEVUELTA":
        raise ValueError(f"SRI rechazó el comprobante: {respuesta_recepcion['errores']}")

    # 5. Consultar autorización
    logger.info("Consultando autorización...")
    respuesta_autorizacion = sri.autorizar_comprobante(clave_acceso)

    if respuesta_autorizacion["estado"] != "AUTORIZADO":
        raise ValueError(f"Comprobante no autorizado: {respuesta_autorizacion.get('errores')}")

    # 6. Guardar XML autorizado en S3
    guardar_en_s3(clave_acceso, respuesta_autorizacion["xml_autorizado"], "xml-autorizado")

    return {
        "clave_acceso":         clave_acceso,
        "numero_autorizacion":  respuesta_autorizacion["numero_autorizacion"],
        "fecha_autorizacion":   respuesta_autorizacion["fecha_autorizacion"],
    }


def guardar_en_s3(clave_acceso: str, contenido: str, tipo: str):
    fecha  = datetime.now().strftime("%Y/%m/%d")
    key    = f"{AMBIENTE}/{tipo}/{fecha}/{clave_acceso}.xml"

    s3.put_object(
        Bucket      = BUCKET,
        Key         = key,
        Body        = contenido.encode("utf-8"),
        ContentType = "application/xml",
    )
    logger.info(f"Guardado en S3: s3://{BUCKET}/{key}")