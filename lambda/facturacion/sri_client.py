import os
import time
import logging
from zeep import Client
from zeep.transports import Transport
from requests import Session

logger = logging.getLogger(__name__)

class SRIClient:
    """
    Cliente SOAP para los servicios del SRI Ecuador.
    Maneja recepción y autorización de comprobantes.
    """

    def __init__(self):
        session = Session()
        session.verify = True
        transport = Transport(session=session, timeout=60)

        self.client_recepcion    = Client(os.environ["SRI_URL_RECEPCION"],    transport=transport)
        self.client_autorizacion = Client(os.environ["SRI_URL_AUTORIZACION"], transport=transport)

    def enviar_comprobante(self, xml_firmado: str) -> dict:
        """
        Paso 1: Envía el XML firmado al SRI.
        Respuesta esperada: RECIBIDA o DEVUELTA
        """
        try:
            xml_bytes = xml_firmado.encode("utf-8")
            respuesta = self.client_recepcion.service.validarComprobante(xml_bytes)

            estado = respuesta.estado
            logger.info(f"SRI recepción estado: {estado}")

            if estado == "DEVUELTA":
                mensajes = [
                    f"{m.identificador}: {m.mensaje} - {m.informacionAdicional}"
                    for m in respuesta.comprobantes.comprobante[0].mensajes.mensaje
                ]
                return {"estado": "DEVUELTA", "errores": mensajes}

            return {"estado": "RECIBIDA"}

        except Exception as e:
            logger.error(f"Error al enviar al SRI: {str(e)}")
            raise

    def autorizar_comprobante(self, clave_acceso: str, reintentos: int = 5) -> dict:
        """
        Paso 2: Consulta la autorización del comprobante.
        El SRI puede tardar varios segundos en autorizar.
        """
        for intento in range(reintentos):
            try:
                respuesta = self.client_autorizacion.service.autorizacionComprobante(clave_acceso)
                autorizaciones = respuesta.autorizaciones.autorizacion

                if not autorizaciones:
                    logger.warning(f"Intento {intento + 1}: sin respuesta aún, reintentando...")
                    time.sleep(3)
                    continue

                autorizacion = autorizaciones[0]
                estado = autorizacion.estado
                logger.info(f"SRI autorización estado: {estado}")

                if estado == "AUTORIZADO":
                    return {
                        "estado":          "AUTORIZADO",
                        "numero_autorizacion": autorizacion.numeroAutorizacion,
                        "fecha_autorizacion":  str(autorizacion.fechaAutorizacion),
                        "xml_autorizado":      autorizacion.comprobante,
                    }

                if estado == "NO AUTORIZADO":
                    mensajes = [
                        f"{m.identificador}: {m.mensaje}"
                        for m in autorizacion.mensajes.mensaje
                    ]
                    return {"estado": "NO_AUTORIZADO", "errores": mensajes}

            except Exception as e:
                logger.error(f"Error al autorizar (intento {intento + 1}): {str(e)}")
                time.sleep(3)

        return {"estado": "TIMEOUT", "errores": ["El SRI no respondió en el tiempo esperado"]}