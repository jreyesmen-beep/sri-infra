import boto3
import base64
import json
from cryptography.hazmat.primitives.serialization import pkcs12

def diagnosticar():

    # -----------------------------------------------
    # PASO 1: Verificar que el archivo .p12 local abre bien
    # -----------------------------------------------
    print("\n🔍 PASO 1: Verificando .p12 local...")
    ruta_p12  = "ruta/a/tu_certificado.p12"   # cambia esto
    password  = "tu_password"                  # cambia esto

    try:
        with open(ruta_p12, "rb") as f:
            p12_local = f.read()

        private_key, cert, _ = pkcs12.load_key_and_certificates(
            data     = p12_local,
            password = password.encode("utf-8")
        )
        print(f"✅ .p12 local OK — Certificado: {cert.subject}")
        print(f"   Tamaño bytes local: {len(p12_local)}")

    except Exception as e:
        print(f"❌ Error con .p12 local: {e}")
        print("   → El archivo o la contraseña son incorrectos")
        return

    # -----------------------------------------------
    # PASO 2: Verificar lo que está en Secrets Manager
    # -----------------------------------------------
    print("\n🔍 PASO 2: Verificando Secrets Manager...")
    client = boto3.client("secretsmanager", region_name="us-east-1")

    try:
        # Obtener el binario
        response = client.get_secret_value(SecretId="sri/certificacion/certificado-p12")

        if "SecretBinary" in response:
            p12_aws = base64.b64decode(response["SecretBinary"])
            print(f"✅ Secret recuperado como binario")
            print(f"   Tamaño bytes en AWS: {len(p12_aws)}")
        elif "SecretString" in response:
            print("⚠️  El secret está guardado como STRING, no como BINARY")
            print("   → Este es probablemente el problema")
            p12_aws = response["SecretString"].encode()
        else:
            print("❌ No se encontró contenido en el secret")
            return

    except Exception as e:
        print(f"❌ Error al recuperar de Secrets Manager: {e}")
        return

    # -----------------------------------------------
    # PASO 3: Comparar tamaños
    # -----------------------------------------------
    print("\n🔍 PASO 3: Comparando archivos...")
    print(f"   Tamaño local : {len(p12_local)} bytes")
    print(f"   Tamaño en AWS: {len(p12_aws)} bytes")

    if len(p12_local) != len(p12_aws):
        print("❌ Los tamaños son DISTINTOS — el archivo se corrompió al subir")
    else:
        print("✅ Tamaños iguales")

    if p12_local == p12_aws:
        print("✅ Los archivos son IDÉNTICOS")
    else:
        print("❌ Los archivos son DISTINTOS — hay corrupción")

    # -----------------------------------------------
    # PASO 4: Intentar abrir el .p12 de AWS
    # -----------------------------------------------
    print("\n🔍 PASO 4: Intentando abrir .p12 de AWS con cryptography...")
    try:
        private_key2, cert2, _ = pkcs12.load_key_and_certificates(
            data     = p12_aws,
            password = password.encode("utf-8")
        )
        print(f"✅ .p12 de AWS abre correctamente")
        print(f"   Certificado: {cert2.subject}")

    except Exception as e:
        print(f"❌ Error: {e}")

        # Intentar sin password
        print("\n   Intentando sin password...")
        try:
            pkcs12.load_key_and_certificates(data=p12_aws, password=None)
            print("⚠️  Abre SIN password — verifica que la password sea correcta")
        except Exception as e2:
            print(f"   También falla sin password: {e2}")

        # Intentar con password vacío
        print("\n   Intentando con password vacío...")
        try:
            pkcs12.load_key_and_certificates(data=p12_aws, password=b"")
            print("⚠️  Abre con password VACÍO")
        except Exception as e3:
            print(f"   También falla con vacío: {e3}")


if __name__ == "__main__":
    diagnosticar()