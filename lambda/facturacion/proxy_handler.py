import json
import os
import boto3
import logging

logger   = logging.getLogger()
logger.setLevel(logging.INFO)

sqs      = boto3.client("sqs")
lambda_  = boto3.client("lambda")

COLA_URL         = os.environ["SQS_COLA_URL"]
LAMBDA_FACT_NAME = os.environ["LAMBDA_FACT_NAME"]
AMBIENTE         = os.environ["AMBIENTE"]

CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type":                 "application/json"
}

def lambda_handler(event, context):
    http_method = event.get("httpMethod", "")
    path        = event.get("path", "")

    logger.info(f"Request: {http_method} {path}")

    # OPTIONS — preflight CORS
    if http_method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    # POST /facturas — encolar comprobante
    if http_method == "POST" and path.endswith("/facturas"):
        return encolar_comprobante(event)

    # GET /configuracion — leer datos del emisor
    if http_method == "GET" and path.endswith("/configuracion"):
        return invocar_lambda_fact(event, context)

    # PUT /configuracion — guardar datos del emisor
    if http_method == "PUT" and path.endswith("/configuracion"):
        return invocar_lambda_fact(event, context)

    # GET /facturas/{claveAcceso}/ride — descargar PDF
    if http_method == "GET" and path.endswith("/ride"):
        return invocar_lambda_fact(event, context)

    # GET /facturas/{claveAcceso} — consultar estado
    if http_method == "GET" and "/facturas/" in path:
        return invocar_lambda_fact(event, context)

    # # GET /facturas/{claveAcceso} — consultar estado
    # if http_method == "GET" and not path.endswith("/ride"):
    #     return invocar_lambda_fact(event, context)
    logger.warning(f"Ruta no encontrada: {http_method} {path}")
    return {
        "statusCode": 404,
        "headers":    CORS_HEADERS,
        "body":       json.dumps({"mensaje": f"Ruta no encontrada: {http_method} {path}"})
    }


def encolar_comprobante(event) -> dict:
    """Encola el comprobante en SQS."""
    try:
        body = event.get("body", "{}")
        if isinstance(body, str):
            datos = json.loads(body)
        else:
            datos = body

        logger.info(f"Encolando: {datos.get('clave_acceso', 'sin clave')}")

        sqs.send_message(
            QueueUrl    = COLA_URL,
            MessageBody = json.dumps(datos)
        )

        return {
            "statusCode": 200,
            "headers":    CORS_HEADERS,
            "body": json.dumps({
                "estado":       "EN_PROCESO",
                "mensaje":      "Comprobante recibido y en cola de procesamiento",
                "clave_acceso": datos.get("clave_acceso", "")
            })
        }

    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "headers":    CORS_HEADERS,
            "body":       json.dumps({"estado": "ERROR", "mensaje": "Body inválido"})
        }
    except Exception as e:
        logger.error(f"Error encolando: {str(e)}")
        return {
            "statusCode": 500,
            "headers":    CORS_HEADERS,
            "body":       json.dumps({"estado": "ERROR", "mensaje": str(e)})
        }


def invocar_lambda_fact(event, context) -> dict:
    """
    Invoca el Lambda de facturación para consultas y RIDE.
    El proxy delega al fact_sri sin duplicar lógica.
    """
    try:
        response = lambda_.invoke(
            FunctionName   = LAMBDA_FACT_NAME,
            InvocationType = "RequestResponse",
            Payload        = json.dumps(event)
        )

        payload = json.loads(response["Payload"].read().decode("utf-8"))
        logger.info(f"Respuesta de fact_sri: statusCode={payload.get('statusCode')}")
        return payload

    except Exception as e:
        logger.error(f"Error invocando fact_sri: {str(e)}")
        return {
            "statusCode": 500,
            "headers":    CORS_HEADERS,
            "body":       json.dumps({"mensaje": f"Error interno: {str(e)}"})
        }