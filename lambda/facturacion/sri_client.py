import os
import time
import logging
import requests
from http.client import RemoteDisconnected
from zeep import Client
from zeep.transports import Transport
from zeep.exceptions import TransportError
from requests import Session
from requests.exceptions import (
    ConnectionError,
    Timeout
)

logger = logging.getLogger(__name__)

# Códigos de error propios para identificar la causa
class SRINoDisponible(Exception):
    pass

class SRIRechazo(Exception):
    pass

class SRITimeout(Exception):
    pass

class SRIClient:
    """
    Cliente SOAP para los servicios del SRI Ecuador.
    Maneja recepción y autorización de comprobantes.
    """
    MAX_REINTENTOS = 3
    ESPERA_ENTRE_REINTENTOS = 5  # segundos

    def __init__(self):
        session = Session()
        session.verify = True
        transport = Transport(session=session, timeout=60)

        try:
            self.client_recepcion = Client(
                os.environ["SRI_URL_RECEPCION"],
                transport=transport
            )
            self.client_autorizacion = Client(
                os.environ["SRI_URL_AUTORIZACION"],
                transport=transport
            )
        except Exception as e:
            logger.error(f"No se pudo conectar al SRI: {str(e)}")
            raise SRINoDisponible(
                "No se pudo establecer conexión con el SRI. "
                "El servicio puede estar en mantenimiento."
            )

    def enviar_comprobante(self, xml_firmado: str) -> dict:
        """
        Paso 1: Envía el XML firmado al SRI.
        Respuesta esperada: RECIBIDA o DEVUELTA
        Envía el XML firmado al SRI con reintentos automáticos.
        """
        ultimo_error = None

        for intento in range(1, self.MAX_REINTENTOS + 1):
            try:
                logger.info(f"Enviando al SRI (intento {intento}/{self.MAX_REINTENTOS})...")
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

            except SRIRechazo:
                raise  # No reintentar errores de datos

            except (ConnectionError, RemoteDisconnected, TransportError) as e:
                ultimo_error = e
                logger.warning(
                    f"SRI no disponible (intento {intento}/{self.MAX_REINTENTOS}): {str(e)}"
                )
                if intento < self.MAX_REINTENTOS:
                    logger.info(f"Reintentando en {self.ESPERA_ENTRE_REINTENTOS}s...")
                    time.sleep(self.ESPERA_ENTRE_REINTENTOS)

            except Timeout as e:
                ultimo_error = e
                logger.warning(f"Timeout SRI (intento {intento}): {str(e)}")
                if intento < self.MAX_REINTENTOS:
                    time.sleep(self.ESPERA_ENTRE_REINTENTOS)

            except Exception as e:
                ultimo_error = e
                logger.error(f"Error inesperado SRI (intento {intento}): {str(e)}")
                if intento < self.MAX_REINTENTOS:
                    time.sleep(self.ESPERA_ENTRE_REINTENTOS)

        # Agotó todos los reintentos
        raise SRINoDisponible(
            f"El SRI no está disponible después de {self.MAX_REINTENTOS} intentos. "
            f"Último error: {str(ultimo_error)}"
        )

    def autorizar_comprobante(self, clave_acceso: str, reintentos: int = 5) -> dict:
        """
        Paso 2: Consulta la autorización del comprobante.
        El SRI puede tardar varios segundos en autorizar.
        """
        for intento in range(1, reintentos + 1):
            try:
                logger.info(f"Consultando autorización (intento {intento})...")
                respuesta = self.client_autorizacion.service.autorizacionComprobante(clave_acceso)
                autorizaciones = respuesta.autorizaciones.autorizacion

                if not autorizaciones:
                    logger.warning(f"Intento {intento + 1}: sin respuesta aún, reintentando en 3s...")
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

            except (ConnectionError, RemoteDisconnected, TransportError) as e:
                logger.warning(f"SRI no disponible al autorizar (intento {intento}): {str(e)}")
                time.sleep(3)

            except Exception as e:
                logger.error(f"Error al autorizar (intento {intento}): {str(e)}")
                time.sleep(3)

        raise SRINoDisponible(
            "El SRI no respondió la autorización en el tiempo esperado."
        )