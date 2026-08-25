import json
import logging
import os
import boto3
import base64

from datetime import datetime
from xml_builder  import construir_factura
from firma_xml    import firmar_xml
from sri_client   import SRIClient, SRINoDisponible, SRIRechazo, SRITimeout
from ride_generator import generar_ride
from ses_sender     import enviar_ride_por_email


logger   = logging.getLogger()
logger.setLevel(logging.INFO)

s3      = boto3.client("s3")
sqs     = boto3.client("sqs")
BUCKET  = os.environ["S3_BUCKET_COMPROBANTES"]
AMBIENTE = os.environ["AMBIENTE"]
COLA_URL = os.environ["SQS_COLA_URL"]

def lambda_handler(event, context):
    # ← Detectar si viene de API Gateway (GET) o de SQS
    if "httpMethod" in event:
        return manejar_api_gateway(event, context)
    else:
        return manejar_sqs(event, context)

def manejar_api_gateway(event, context):
    """Maneja requests GET desde API Gateway."""
    CORS = {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    }

    http_method = event.get("httpMethod", "")
    path        = event.get("path", "")

    # GET /facturas/{claveAcceso} → consultar estado
    if http_method == "GET" and "/facturas/" in path:
        clave_acceso = event.get("pathParameters", {}).get("claveAcceso", "")

        # GET /facturas/{claveAcceso}/ride → descargar PDF
        if path.endswith("/ride"):
            return descargar_ride(clave_acceso, CORS)

        return consultar_estado(clave_acceso, CORS)

    return {
        "statusCode": 404,
        "headers":    CORS,
        "body":       json.dumps({"mensaje": "Ruta no encontrada"})
    }

def descargar_ride(clave_acceso: str, cors: dict) -> dict:
    """Genera y devuelve el RIDE en PDF."""
    from ride_generator import generar_ride

    try:
        # Buscar datos del comprobante en S3
        estado = consultar_estado_s3(clave_acceso)

        if estado.get("estado") != "AUTORIZADO":
            return {
                "statusCode": 400,
                "headers":    cors,
                "body": json.dumps({
                    "mensaje": "Solo se puede generar RIDE de comprobantes autorizados"
                })
            }

        # Buscar datos originales en S3
        datos = _obtener_datos_originales(clave_acceso)

        # Generar PDF
        pdf_bytes = generar_ride(
            datos               = datos,
            numero_autorizacion = estado.get("numero_autorizacion", ""),
            fecha_autorizacion  = estado.get("fecha_autorizacion", "")
        )

        # Guardar en S3
        key = f"{AMBIENTE}/rides/{clave_acceso}.pdf"
        s3.put_object(
            Bucket      = BUCKET,
            Key         = key,
            Body        = pdf_bytes,
            ContentType = "application/pdf"
        )

        # Devolver PDF en base64
        return {
            "statusCode": 200,
            "headers": {
                **cors,
                "Content-Type":        "application/pdf",
                "Content-Disposition": f'attachment; filename="factura-{clave_acceso}.pdf"'
            },
            "body":            base64.b64encode(pdf_bytes).decode("utf-8"),
            "isBase64Encoded": True
        }

    except Exception as e:
        logger.error(f"Error generando RIDE: {str(e)}")
        return {
            "statusCode": 500,
            "headers":    cors,
            "body": json.dumps({"mensaje": f"Error generando RIDE: {str(e)}"})
        }        

def _obtener_datos_originales(clave_acceso: str) -> dict:
    """Recupera los datos originales del comprobante desde S3."""
    try:
        response = s3.list_objects_v2(
            Bucket = BUCKET,
            Prefix = f"{AMBIENTE}/errores/"
        )
        # Buscar en estados
        for prefix in ["estados", "errores"]:
            resp = s3.list_objects_v2(
                Bucket = BUCKET,
                Prefix = f"{AMBIENTE}/{prefix}/"
            )
            for obj in resp.get("Contents", []):
                if clave_acceso in obj["Key"] and obj["Key"].endswith(".json"):
                    data = s3.get_object(Bucket=BUCKET, Key=obj["Key"])
                    estado = json.loads(data["Body"].read().decode("utf-8"))
                    if "datos_originales" in estado:
                        return estado["datos_originales"]
    except Exception as e:
        logger.warning(f"No se encontraron datos originales: {e}")

    return {}


def consultar_estado_s3(clave_acceso: str) -> dict:
    """Busca el archivo de estado en S3."""
    """
    Busca el estado del comprobante en S3.
    Estrategia: buscar en prefijos sin fecha primero,
    luego por fecha si no encuentra.
    """   
    logger.info(f"Buscando en S3 clave: {clave_acceso}")

    # -----------------------------------------------
    # 1. Buscar estado autorizado (sin filtrar por fecha)
    # -----------------------------------------------
    try:
        response = s3.list_objects_v2(
            Bucket = BUCKET,
            Prefix = f"{AMBIENTE}/estados/"
        )
        for obj in response.get("Contents", []):
            if clave_acceso in obj["Key"]:
                logger.info(f"Estado encontrado: {obj['Key']}")
                data = s3.get_object(Bucket=BUCKET, Key=obj["Key"])
                return json.loads(data["Body"].read().decode("utf-8"))
    except Exception as e:
        logger.error(f"Error buscando estado: {str(e)}")

    # -----------------------------------------------
    # 2. Buscar estado de error
    # -----------------------------------------------
    try:
        response = s3.list_objects_v2(
            Bucket = BUCKET,
            Prefix = f"{AMBIENTE}/errores/"
        )
        for obj in response.get("Contents", []):
            if clave_acceso in obj["Key"]:
                logger.info(f"Error encontrado: {obj['Key']}")
                data = s3.get_object(Bucket=BUCKET, Key=obj["Key"])
                return json.loads(data["Body"].read().decode("utf-8"))
    except Exception as e:
        logger.error(f"Error buscando errores: {str(e)}")

    # -----------------------------------------------
    # 3. Verificar si existe el XML autorizado en S3
    # -----------------------------------------------
    try:
        response = s3.list_objects_v2(
            Bucket = BUCKET,
            Prefix = f"{AMBIENTE}/xml-autorizado/"
        )
        for obj in response.get("Contents", []):
            if clave_acceso in obj["Key"]:
                logger.info(f"XML autorizado encontrado: {obj['Key']}")
                return {
                    "clave_acceso": clave_acceso,
                    "estado":       "AUTORIZADO",
                    "mensaje":      "Comprobante autorizado por el SRI"
                }
    except Exception as e:
        logger.error(f"Error buscando XML autorizado: {str(e)}")

    # -----------------------------------------------
    # 4. Verificar si existe el XML firmado (en proceso)
    # -----------------------------------------------
    try:
        response = s3.list_objects_v2(
            Bucket = BUCKET,
            Prefix = f"{AMBIENTE}/xml-firmado/"
        )
        for obj in response.get("Contents", []):
            if clave_acceso in obj["Key"]:
                logger.info(f"XML firmado encontrado: {obj['Key']}")
                return {
                    "clave_acceso": clave_acceso,
                    "estado":       "EN_PROCESO",
                    "mensaje":      "El comprobante fue enviado y está siendo procesado"
                }
    except Exception as e:
        logger.error(f"Error buscando XML firmado: {str(e)}")

    # -----------------------------------------------
    # 5. No existe ningún registro
    # -----------------------------------------------
    logger.info(f"No se encontró ningún registro para: {clave_acceso}")
    return {
        "clave_acceso": clave_acceso,
        "estado":       "NO_ENCONTRADO",
        "mensaje":      "No existe ningún comprobante con esta clave de acceso"
    }

    # from datetime import datetime

    # # Buscar en los últimos 7 días
    # for dias_atras in range(7):
    #     fecha = datetime.now()
    #     from datetime import timedelta
    #     fecha = fecha - timedelta(days=dias_atras)
    #     fecha_str = fecha.strftime("%Y/%m/%d")

    #     # Buscar estado autorizado
    #     key_estado = f"{AMBIENTE}/estados/{fecha_str}/{clave_acceso}.json"
    #     try:
    #         response = s3.get_object(Bucket=BUCKET, Key=key_estado)
    #         return json.loads(response["Body"].read().decode("utf-8"))
    #     except s3.exceptions.NoSuchKey:
    #         pass
    #     except Exception:
    #         pass

    #     # Buscar estado de error
    #     key_error = f"{AMBIENTE}/errores/{fecha_str}/{clave_acceso}.json"
    #     try:
    #         response = s3.get_object(Bucket=BUCKET, Key=key_error)
    #         return json.loads(response["Body"].read().decode("utf-8"))
    #     except s3.exceptions.NoSuchKey:
    #         pass
    #     except Exception:
    #         pass

    # Si no encontró nada, puede estar en proceso
    return {
        "clave_acceso": clave_acceso,
        "estado":       "EN_PROCESO",
        "mensaje":      "El comprobante está siendo procesado"
    }

def manejar_sqs(event, context):
    """Maneja mensajes de la cola SQS — lógica original."""
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

    # 4. Generar RIDE
    logger.info("Generando RIDE...")
    pdf_bytes = generar_ride(
        datos               = datos,
        numero_autorizacion = respuesta_autorizacion["numero_autorizacion"],
        fecha_autorizacion  = respuesta_autorizacion["fecha_autorizacion"]
    )

    # Guardar PDF en S3
    key_pdf = f"{AMBIENTE}/rides/{clave_acceso}.pdf"
    s3.put_object(
        Bucket      = BUCKET,
        Key         = key_pdf,
        Body        = pdf_bytes,
        ContentType = "application/pdf"
    )
    logger.info(f"RIDE guardado en S3: {key_pdf}")

    # 5. Enviar por email si hay destinatario
    email_cliente = datos.get("email_comprador", "")
    if email_cliente:
        logger.info(f"Enviando RIDE por email a: {email_cliente}")
        resultado_email = enviar_ride_por_email(
            email_destinatario  = email_cliente,
            nombre_destinatario = datos.get("razon_comprador", "Cliente"),
            datos_factura       = datos,
            pdf_bytes           = pdf_bytes,
            numero_autorizacion = respuesta_autorizacion["numero_autorizacion"],
            fecha_autorizacion  = respuesta_autorizacion["fecha_autorizacion"]
        )
        logger.info(f"Resultado email: {resultado_email}")
    else:
        logger.info("No se proporcionó email del comprador, se omite envío")


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