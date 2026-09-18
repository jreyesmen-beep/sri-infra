import boto3
import base64
import logging
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text       import MIMEText
from email.mime.base       import MIMEBase
from email.mime.application import MIMEApplication
from email                 import encoders
from email.header import Header
from email.utils  import formataddr

logger = logging.getLogger(__name__)

ses           = boto3.client("ses", region_name=os.environ.get("AWS_REGION", "us-east-1"))
EMAIL_EMISOR  = os.environ.get("EMAIL_EMISOR", "")
NOMBRE_EMISOR = os.environ.get("NOMBRE_EMISOR", "Facturación Electrónica")
AMBIENTE      = os.environ.get("AMBIENTE", "certificacion")

# Agregar función para verificar emails en sandbox
def verificar_email_si_sandbox(email: str) -> bool:
    """
    Verifica el email en SES si estamos en sandbox.
    Retorna True si el email ya está verificado.
    """
    try:
        response = ses.get_identity_verification_attributes(
            Identities=[email]
        )
        atributos = response.get("VerificationAttributes", {})
        estado    = atributos.get(email, {}).get("VerificationStatus", "")

        if estado == "Success":
            logger.info(f"Email {email} ya verificado en SES")
            return True

        # Enviar verificación si no está verificado
        ses.verify_email_identity(EmailAddress=email)
        logger.info(f"Email de verificación enviado a {email}")
        return False

    except Exception as e:
        logger.error(f"Error verificando email: {str(e)}")
        return False


def enviar_ride_por_email(
    email_destinatario: str,
    nombre_destinatario: str,
    datos_factura: dict,
    pdf_bytes: bytes,
    numero_autorizacion: str,
    fecha_autorizacion: str
) -> dict:
    """
    Envía el RIDE (PDF) de la factura al cliente por email.
    """
    if not email_destinatario:
        logger.warning("No se proporcionó email del destinatario")
        return {"enviado": False, "razon": "Sin email de destinatario"}

    # if AMBIENTE == "certificacion":
    #     logger.info(f"Ambiente certificación: email simulado a {email_destinatario}")
    #     return {"enviado": True, "simulado": True, "destinatario": email_destinatario}

    try:
        # Verificar si estamos en sandbox
        # account = ses.get_account_sending_enabled()

        # Intentar enviar — si falla por sandbox, verificar y notificar
        try:
            return _enviar_email(
                email_destinatario,
                nombre_destinatario,
                datos_factura,
                pdf_bytes,
                numero_autorizacion,
                fecha_autorizacion
            )

        except Exception as e:
            logger.error(f"Error enviando email: {str(e)}")
            return {"enviado": False, "razon": str(e)}        


    except ses.exceptions.MessageRejected as e:
        if "Email address is not verified" in str(e):
            logger.warning(f"Email no verificado en sandbox: {email_destinatario}")

            # Enviar verificación automáticamente
            verificar_email_si_sandbox(email_destinatario)

            return {
                "enviado": False,
                "razon":   "sandbox",
                "mensaje": f"Se envió un email de verificación a {email_destinatario}. "
                            f"El cliente debe verificar su email para recibir facturas."
            }
        raise


def _enviar_email(
    email_destinatario,
    nombre_destinatario,
    datos_factura,
    pdf_bytes,
    numero_autorizacion,
    fecha_autorizacion
) -> dict:
    """Lógica real de envío — separada para reutilizar."""
    from email.mime.multipart  import MIMEMultipart
    from email.mime.text       import MIMEText
    from email.mime.application import MIMEApplication
    from email.header           import Header
    from email.utils            import formataddr    

    clave_acceso    = datos_factura.get("clave_acceso", "")
    secuencial      = datos_factura.get("secuencial", "").zfill(9)
    establecimiento = datos_factura.get("establecimiento", "001")
    punto_emision   = datos_factura.get("punto_emision", "001")
    num_factura     = f"{establecimiento}-{punto_emision}-{secuencial}"
    total           = datos_factura.get("importe_total", 0)
    fecha_emision   = datos_factura.get("fecha_emision", "")
    razon_social    = datos_factura.get("razon_social", "")

    # ✅ Codificar nombre emisor correctamente para soportar tildes y ñ
    nombre_emisor_encoded = Header(NOMBRE_EMISOR, 'utf-8').encode()
    from_address          = f"{nombre_emisor_encoded} <{EMAIL_EMISOR}>"

    # ✅ Codificar nombre destinatario también
    nombre_dest_encoded   = Header(nombre_destinatario, 'utf-8').encode()
    to_address            = f"{nombre_dest_encoded} <{email_destinatario}>"

    # ✅ Asunto con tildes también codificado
    asunto_texto = f"Factura Electronica {num_factura} - {razon_social}"
    asunto_encoded = Header(asunto_texto, 'utf-8').encode()

    msg            = MIMEMultipart("mixed")
    msg["Subject"] = asunto_encoded
    msg["From"]    = from_address
    msg["To"]      = to_address

    html_body   = _construir_html(
        nombre_destinatario = nombre_destinatario,
        num_factura         = num_factura,
        fecha_emision       = fecha_emision,
        total               = total,
        numero_autorizacion = numero_autorizacion,
        fecha_autorizacion  = fecha_autorizacion,
        razon_social        = razon_social,
        clave_acceso        = clave_acceso,
    )
    texto_plano = _construir_texto_plano(
        nombre_destinatario = nombre_destinatario,
        num_factura         = num_factura,
        fecha_emision       = fecha_emision,
        total               = total,
        numero_autorizacion = numero_autorizacion,
    )

    parte = MIMEMultipart("alternative")
    parte.attach(MIMEText(texto_plano, "plain", "utf-8"))
    parte.attach(MIMEText(html_body,   "html",  "utf-8"))
    msg.attach(parte)

    adjunto = MIMEApplication(pdf_bytes, _subtype="pdf")
    adjunto.add_header(
        "Content-Disposition", "attachment",
        filename=f"Factura-{num_factura}.pdf"
    )
    msg.attach(adjunto)

    response   = ses.send_raw_email(
        Source       = EMAIL_EMISOR,   # ← solo el email sin nombre para Source
        Destinations = [email_destinatario],
        RawMessage   = {"Data": msg.as_string()}
    )
    message_id = response["MessageId"]
    logger.info(f"✅ Email enviado — MessageId: {message_id}")

    return {
        "enviado":      True,
        "message_id":   message_id,
        "destinatario": email_destinatario,
    }    


def _construir_html(
    nombre_destinatario, num_factura, fecha_emision,
    total, numero_autorizacion, fecha_autorizacion,
    razon_social, clave_acceso
) -> str:
    return f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Factura Electrónica {num_factura}</title>
    </head>
    <body style="margin:0;padding:0;background:#F7F9FC;font-family:'Segoe UI',Arial,sans-serif;">

      <!-- Contenedor principal -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FC;padding:30px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0"
              style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

              <!-- Header -->
              <tr>
                <td style="background:#00875A;padding:32px 40px;text-align:center;">
                  <div style="display:inline-block;background:rgba(255,255,255,0.15);
                    border-radius:8px;padding:8px 16px;margin-bottom:16px;">
                    <span style="color:#fff;font-family:'Courier New',monospace;
                      font-weight:bold;font-size:14px;">SRI</span>
                  </div>
                  <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">
                    Factura Electrónica
                  </h1>
                  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">
                    {razon_social}
                  </p>
                </td>
              </tr>

              <!-- Saludo -->
              <tr>
                <td style="padding:32px 40px 0;">
                  <p style="color:#2D3748;font-size:15px;margin:0 0 8px;">
                    Estimado/a <strong>{nombre_destinatario}</strong>,
                  </p>
                  <p style="color:#64748B;font-size:14px;margin:0;line-height:1.6;">
                    Adjunto encontrará su factura electrónica autorizada por el
                    Servicio de Rentas Internas del Ecuador.
                  </p>
                </td>
              </tr>

              <!-- Datos de la factura -->
              <tr>
                <td style="padding:24px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#F7F9FC;border-radius:8px;overflow:hidden;
                    border:1px solid #E2E8F0;">
                    <tr style="background:#00875A;">
                      <td colspan="2" style="padding:12px 20px;">
                        <span style="color:#fff;font-weight:700;font-size:13px;
                          text-transform:uppercase;letter-spacing:0.05em;">
                          Datos del Comprobante
                        </span>
                      </td>
                    </tr>
                    {_fila_dato("Número de Factura",     num_factura)}
                    {_fila_dato("Fecha de Emisión",      fecha_emision, alt=True)}
                    {_fila_dato("Valor Total",           f"$ {total:.2f}")}
                    {_fila_dato("Fecha Autorización",    fecha_autorizacion, alt=True)}
                    {_fila_dato("No. Autorización",      numero_autorizacion[:20] + "...", alt=False)}
                  </table>
                </td>
              </tr>

              <!-- Clave de acceso -->
              <tr>
                <td style="padding:0 40px 24px;">
                  <div style="background:#E3F5EE;border-radius:8px;padding:16px;
                    border-left:4px solid #00875A;">
                    <p style="margin:0 0 6px;font-size:11px;color:#005C3D;
                      font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">
                      Clave de Acceso
                    </p>
                    <p style="margin:0;font-family:'Courier New',monospace;
                      font-size:11px;color:#0F1923;word-break:break-all;">
                      {clave_acceso}
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Adjunto -->
              <tr>
                <td style="padding:0 40px 24px;">
                  <div style="background:#EFF6FF;border-radius:8px;padding:16px;
                    display:flex;align-items:center;">
                    <span style="font-size:24px;margin-right:12px;">📎</span>
                    <div>
                      <p style="margin:0;font-weight:600;color:#1D4ED8;font-size:14px;">
                        RIDE adjunto en PDF
                      </p>
                      <p style="margin:4px 0 0;color:#64748B;font-size:12px;">
                        Factura-{num_factura}.pdf
                      </p>
                    </div>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background:#F7F9FC;padding:20px 40px;
                  border-top:1px solid #E2E8F0;text-align:center;">
                  <p style="color:#94A3B8;font-size:11px;margin:0;line-height:1.6;">
                    Este es un mensaje automático, por favor no responda a este correo.<br>
                    Documento autorizado por el SRI Ecuador —
                    <a href="https://www.sri.gob.ec" style="color:#00875A;">www.sri.gob.ec</a>
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>

    </body>
    </html>
    """


def _fila_dato(label: str, valor: str, alt: bool = False) -> str:
    bg = "#ffffff" if not alt else "#F7F9FC"
    return f"""
    <tr style="background:{bg};">
      <td style="padding:10px 20px;font-size:12px;color:#64748B;
        font-weight:600;width:40%;border-bottom:1px solid #E2E8F0;">
        {label}
      </td>
      <td style="padding:10px 20px;font-size:12px;color:#0F1923;
        border-bottom:1px solid #E2E8F0;">
        {valor}
      </td>
    </tr>
    """


def _construir_texto_plano(
    nombre_destinatario, num_factura,
    fecha_emision, total, numero_autorizacion
) -> str:
    return f"""
Estimado/a {nombre_destinatario},

Adjunto encontrará su factura electrónica autorizada por el SRI Ecuador.

DATOS DEL COMPROBANTE
=====================
Número de Factura  : {num_factura}
Fecha de Emisión   : {fecha_emision}
Valor Total        : $ {total:.2f}
No. Autorización   : {numero_autorizacion}

El RIDE (PDF) de la factura se encuentra adjunto a este email.

Este es un mensaje automático, por favor no responda a este correo.
Servicio de Rentas Internas Ecuador — www.sri.gob.ec
    """.strip()