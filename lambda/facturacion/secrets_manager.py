import boto3
import base64
import json
import os

_cache = {}  # Cache en memoria para no llamar Secrets Manager en cada invocación

def obtener_secret_binario(secret_name: str) -> bytes:
    if secret_name in _cache:
        return _cache[secret_name]

    client = boto3.client("secretsmanager")
    response = client.get_secret_value(SecretId=secret_name)
    # valor = base64.b64decode(response["SecretBinary"])

# ✅ boto3 ya devuelve SecretBinary como bytes decodificados
    if "SecretBinary" in response:
        valor = response["SecretBinary"]
    else:
        raise ValueError(f"El secret {secret_name} no es binario")

    _cache[secret_name] = valor
    return valor

def obtener_secret_string(secret_name: str) -> dict:
    if secret_name in _cache:
        return _cache[secret_name]

    client = boto3.client("secretsmanager")
    response = client.get_secret_value(SecretId=secret_name)
    valor = json.loads(response["SecretString"])
    _cache[secret_name] = valor
    return valor

def obtener_certificado() -> tuple[bytes, str]:
    nombre_p12  = os.environ["SECRET_CERTIFICADO_P12"]
    nombre_pass = os.environ["SECRET_CERTIFICADO_PASS"]

    p12_bytes = obtener_secret_binario(nombre_p12)
    password  = obtener_secret_string(nombre_pass)["password"]

    return p12_bytes, password