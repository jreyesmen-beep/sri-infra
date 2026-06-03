import json
import os
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

sqs      = boto3.client("sqs")
COLA_URL = os.environ["SQS_COLA_URL"]

CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type":                 "application/json"
}

def lambda_handler(event, context):
    # Manejar preflight OPTIONS
    if event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers":    CORS_HEADERS,
            "body":       ""
        }

    try:
        body = event.get("body", "{}")
        if isinstance(body, str):
            datos = json.loads(body)
        else:
            datos = body

        # Enviar a SQS
        sqs.send_message(
            QueueUrl    = COLA_URL,
            MessageBody = json.dumps(datos)
        )

        logger.info(f"Mensaje encolado: {datos.get('clave_acceso', 'sin clave')}")

        return {
            "statusCode": 200,
            "headers":    CORS_HEADERS,
            "body": json.dumps({
                "estado":  "EN_PROCESO",
                "mensaje": "Comprobante recibido y en cola de procesamiento"
            })
        }

    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "headers":    CORS_HEADERS,
            "body": json.dumps({
                "estado":  "ERROR",
                "mensaje": "Body inválido, se esperaba JSON"
            })
        }

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers":    CORS_HEADERS,
            "body": json.dumps({
                "estado":  "ERROR",
                "mensaje": "Error interno del servidor"
            })
        }