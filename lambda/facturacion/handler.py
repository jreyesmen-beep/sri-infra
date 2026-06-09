import json
import logging
import os
import boto3
from datetime import datetime

from xml_builder  import construir_factura
from firma_xml    import firmar_xml
from sri_client   import SRIClient, SRINoDisponible, SRIRechazo, SRITimeout

logger   = logging.getLogger()
logger.setLevel(logging.INFO)

s3      = boto3.client("s3")
sqs     = boto3.client("sqs")
BUCKET  = os.environ["S3_BUCKET_COMPROBANTES"]
AMBIENTE = os.environ["AMBIENTE"]
COLA_URL = os.environ["SQS_COLA_URL"]

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

            procesar_comprobante(datos)
            # logger.info(f"Comprobante procesado: {resultado}")

        except SRINoDisponible as e:
            # SRI caído → reencolar para reintento posterior
            logger.warning(f"SRI no disponible, se reencola: {str(e)}")
            _guardar_estado_error(datos, "SRI_NO_DISPONIBLE", str(e))
            errores.append({"itemIdentifier": mensaje_id})

        except SRIRechazo as e:
            # Error de datos → NO reencolar, guardar para revisión
            logger.error(f"SRI rechazó el comprobante: {str(e)}")
            _guardar_estado_error(datos, "SRI_RECHAZO", str(e))
            # No agregar a errores: no tiene sentido reintentar

        except Exception as e:
            logger.error(f"Error inesperado en {mensaje_id}: {str(e)}")
            _guardar_estado_error(datos, "ERROR_INTERNO", str(e))
            errores.append({"itemIdentifier": mensaje_id})

    # Partial batch response: solo reintentar los que fallaron
    return {"batchItemFailures": errores}


def procesar_comprobante(datos: dict):
    # logger.info(f"PAYLOAD RECIBIDO: {json.dumps(datos, ensure_ascii=False)}")
    clave_acceso = datos["clave_acceso"]
    sri = SRIClient()

    # 1. Construir XML
    logger.info("Construyendo XML...")
    xml = construir_factura(datos)

    # 2. Firmar XML
    logger.info("Firmando XML...")
    xml_firmado = firmar_xml(xml)
    # logger.info(f"XML FIRMADO :\n{xml_firmado}")

    # 3. Guardar XML firmado en S3
    guardar_en_s3(clave_acceso, xml_firmado, "xml-firmado")

    # 4. Enviar al SRI
    logger.info("Enviando al SRI...")
    respuesta_recepcion = sri.enviar_comprobante(xml_firmado)

    if respuesta_recepcion["estado"] == "DEVUELTA":
        raise SRIRechazo(f"SRI rechazó el comprobante: {respuesta_recepcion.get('errores')}")
        # raise ValueError(f"SRI rechazó el comprobante: {respuesta_recepcion['errores']}")

    # 5. Consultar autorización
    logger.info("Consultando autorización...")
    respuesta_autorizacion = sri.autorizar_comprobante(clave_acceso)

    if respuesta_autorizacion["estado"] != "AUTORIZADO":
       raise SRIRechazo(f"Comprobante no autorizado: {respuesta_autorizacion.get('errores')}")
       # raise ValueError(f"Comprobante no autorizado: {respuesta_autorizacion.get('errores')}")

    # 6. Guardar XML autorizado en S3
    guardar_en_s3(clave_acceso, respuesta_autorizacion["xml_autorizado"], "xml-autorizado")

    # Guardar estado final
    _guardar_estado_ok(datos, respuesta_autorizacion)

    logger.info(f"✅ Factura autorizada: {respuesta_autorizacion['numero_autorizacion']}")
    #guardar_en_s3(clave_acceso, "AUTORIZADO", "xml-autorizado")


#    return {
#        "clave_acceso":         clave_acceso,
#        "numero_autorizacion":  respuesta_autorizacion["numero_autorizacion"],
#        "fecha_autorizacion":   respuesta_autorizacion["fecha_autorizacion"],
#    }

#    return {
#        "clave_acceso":         clave_acceso,
#        "numero_autorizacion":  "28052026010916985096001100100200000001118",
#        "fecha_autorizacion":   "2025-05-28T10:30:00-05:00",
#    }


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

def _guardar_estado_ok(datos: dict, respuesta: dict):
    """Guarda el estado final del comprobante en S3 como JSON."""
    clave  = datos["clave_acceso"]
    fecha  = datetime.now().strftime("%Y/%m/%d")
    key    = f"{AMBIENTE}/estados/{fecha}/{clave}.json"
    estado = {
        "clave_acceso":        clave,
        "estado":              "AUTORIZADO",
        "numero_autorizacion": respuesta["numero_autorizacion"],
        "fecha_autorizacion":  respuesta["fecha_autorizacion"],
        "fecha_procesamiento": datetime.now().isoformat()
    }
    s3.put_object(
        Bucket      = BUCKET,
        Key         = key,
        Body        = json.dumps(estado, ensure_ascii=False),
        ContentType = "application/json"
    )

def _guardar_estado_error(datos: dict, tipo_error: str, mensaje: str):
    """Guarda el estado de error en S3 para revisión posterior."""
    try:
        clave = datos.get("clave_acceso", "sin-clave")
        fecha = datetime.now().strftime("%Y/%m/%d")
        key   = f"{AMBIENTE}/errores/{fecha}/{clave}.json"
        estado = {
            "clave_acceso":        clave,
            "estado":              tipo_error,
            "mensaje_error":       mensaje,
            "fecha_error":         datetime.now().isoformat(),
            "datos_originales":    datos
        }
        s3.put_object(
            Bucket      = BUCKET,
            Key         = key,
            Body        = json.dumps(estado, ensure_ascii=False),
            ContentType = "application/json"
        )
    except Exception as e:
        logger.error(f"No se pudo guardar estado de error: {str(e)}")