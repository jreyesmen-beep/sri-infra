import io
import qrcode
import base64
import logging
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle,
    Paragraph, Spacer, Image, HRFlowable
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.graphics.barcode import code128
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from reportlab.platypus import Flowable

logger = logging.getLogger(__name__)

# -------------------------------------------------
# ✅ CONFIGURACIÓN — cambiar aquí para alternar
# -------------------------------------------------
TIPO_CODIGO = "BARRAS"   # "BARRAS" o "QR"
# -------------------------------------------------

VERDE_SRI   = colors.HexColor("#00875A")
GRIS_OSCURO = colors.HexColor("#2D3748")
GRIS_CLARO  = colors.HexColor("#F7F9FC")
NEGRO       = colors.HexColor("#0F1923")
AZUL_TEFUS  = colors.HexColor("#0A2472")

class CodigoBarras(Flowable):
    """
    Flowable personalizado para código de barras Code128.
    Compatible con ReportLab sin necesidad de Drawing.
    """
    def __init__(self, valor, ancho=15*cm, alto=1.5*cm, mostrar_texto=False):
        Flowable.__init__(self)
        self.valor        = valor
        self.ancho        = ancho
        self.alto         = alto
        self.mostrar_texto = mostrar_texto
        self.width        = ancho
        self.height       = alto

    def draw(self):
        # ✅ Calcular barWidth para que el código quepa exactamente en el ancho
        # Code128 genera aproximadamente 11 barras por caracter
        num_chars  = len(self.valor)
        bar_width  = max(0.3, (self.ancho * 0.72) / (num_chars * 11))

        barcode = code128.Code128(
            self.valor,
            barWidth      = bar_width,
            barHeight     = self.alto,
            humanReadable = self.mostrar_texto
        )
        # Centrar el código dentro del espacio disponible
        barcode_width = barcode.width
        offset_x      = max(0, (self.ancho - barcode_width) / 2)
        barcode.drawOn(self.canv, offset_x, 0)


def generar_ride(datos: dict, numero_autorizacion: str, fecha_autorizacion: str) -> bytes:
    """
    Genera el RIDE (PDF) de la factura electrónica
    según el formato requerido por el SRI Ecuador.
    """
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize     = A4,
        rightMargin  = 1.5 * cm,
        leftMargin   = 1.5 * cm,
        topMargin    = 1.5 * cm,
        bottomMargin = 1.5 * cm,
    )

    styles  = getSampleStyleSheet()
    story   = []

    # Estilos
    estilo_titulo = ParagraphStyle(
        "titulo", parent=styles["Normal"],
        fontSize=14, textColor=AZUL_TEFUS,
        fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=4
    )
    estilo_subtitulo = ParagraphStyle(
        "subtitulo", parent=styles["Normal"],
        fontSize=9, textColor=GRIS_OSCURO,
        fontName="Helvetica-Bold", alignment=TA_CENTER
    )
    estilo_normal = ParagraphStyle(
        "normal_sri", parent=styles["Normal"],
        fontSize=8, textColor=NEGRO, fontName="Helvetica"
    )
    estilo_label = ParagraphStyle(
        "label", parent=styles["Normal"],
        fontSize=7, textColor=colors.grey, fontName="Helvetica"
    )
    estilo_valor = ParagraphStyle(
        "valor", parent=styles["Normal"],
        fontSize=8, textColor=NEGRO, fontName="Helvetica-Bold"
    )
    estilo_mono = ParagraphStyle(
        "mono", parent=styles["Normal"],
        fontSize=7, textColor=NEGRO,
        fontName="Courier", alignment=TA_CENTER
    )

    # -----------------------------------------------
    # 1. CABECERA
    # -----------------------------------------------
    # Generar código (barras o QR según configuración)
    # En generar_ride — sección 1. CABECERA
    codigo = _generar_codigo(numero_autorizacion)

    # Columna derecha con el código
    col_derecha_data = [
        [Paragraph("FACTURA", estilo_titulo)],
        [Paragraph(
            f'No. {datos.get("establecimiento","001")}-'
            f'{datos.get("punto_emision","001")}-'
            f'{datos.get("secuencial","").zfill(9)}',
            estilo_subtitulo
        )],
        [Paragraph("NÚMERO DE AUTORIZACIÓN", estilo_label)],
        [Paragraph(numero_autorizacion, estilo_mono)],
        [Paragraph(f'FECHA AUTORIZACIÓN: {fecha_autorizacion}', estilo_label)],
        [Paragraph(
            f'AMBIENTE: {"CERTIFICACIÓN" if datos.get("ambiente") == "1" else "PRODUCCIÓN"}',
            estilo_label
        )],
        [Paragraph('EMISIÓN: NORMAL', estilo_label)],
        [codigo],   # ← CodigoBarras o Image según TIPO_CODIGO
    ]

    col_derecha = Table(col_derecha_data, colWidths=[7*cm])

    cabecera_data = [[
        Table([
            [Paragraph(datos.get("razon_social", ""),         estilo_titulo)],
            [Paragraph(f'RUC: {datos.get("ruc", "")}',        estilo_subtitulo)],
            [Paragraph(datos.get("dir_matriz", ""),            estilo_normal)],
            [Paragraph(f'Teléf: {datos.get("telefono","-")}', estilo_normal)],
            [Paragraph(datos.get("email", ""),                 estilo_normal)],
        ], colWidths=[10*cm]),
        col_derecha
    ]]

    cabecera_tabla = Table(cabecera_data, colWidths=[10*cm, 7*cm])
    cabecera_tabla.setStyle(TableStyle([
        ("VALIGN",      (0, 0), (-1, -1), "TOP"),
        ("LINEAFTER",   (0, 0), (0, -1),  0.5, colors.grey),
        ("LEFTPADDING", (1, 0), (1, -1),  10),
    ]))

    story.append(cabecera_tabla)
    story.append(Spacer(1, 0.3 * cm))
    story.append(HRFlowable(width="100%", thickness=1, color=VERDE_SRI))
    story.append(Spacer(1, 0.3 * cm))

    # -----------------------------------------------
    # 2. CLAVE DE ACCESO + CÓDIGO DE BARRAS COMPLETO
    # -----------------------------------------------
    story.append(_seccion_clave_acceso(
        datos.get("clave_acceso", ""), estilo_label, estilo_mono
    ))
    story.append(Spacer(1, 0.3 * cm))

    # -----------------------------------------------
    # 3. DATOS DEL COMPRADOR
    # -----------------------------------------------
    comprador_data = [
        [
            Paragraph("RAZÓN SOCIAL / NOMBRES:", estilo_label),
            Paragraph(datos.get("razon_comprador", ""), estilo_valor),
            Paragraph("IDENTIFICACIÓN:", estilo_label),
            Paragraph(datos.get("id_comprador", ""), estilo_valor),
        ],
        [
            Paragraph("FECHA EMISIÓN:", estilo_label),
            Paragraph(datos.get("fecha_emision", ""), estilo_valor),
            Paragraph("GUÍA REMISIÓN:", estilo_label),
            Paragraph("-", estilo_valor),
        ],
    ]
    comprador_tabla = Table(
        comprador_data,
        colWidths=[3.5*cm, 6*cm, 3*cm, 5*cm]
    )
    comprador_tabla.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (0, -1), GRIS_CLARO),
        ("BACKGROUND",    (2, 0), (2, -1), GRIS_CLARO),
        ("INNERGRID",     (0, 0), (-1, -1), 0.25, colors.grey),
        ("BOX",           (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(comprador_tabla)
    story.append(Spacer(1, 0.3 * cm))

    # -----------------------------------------------
    # 4. DETALLE DE ITEMS
    # -----------------------------------------------
    items_header = [
        Paragraph("CÓD.",        estilo_label),
        Paragraph("DESCRIPCIÓN", estilo_label),
        Paragraph("CANT.",       estilo_label),
        Paragraph("P. UNIT.",    estilo_label),
        Paragraph("DESC.",       estilo_label),
        Paragraph("P. TOTAL",    estilo_label),
    ]
    items_data = [items_header]

    for item in datos.get("items", []):
        subtotal = item["cantidad"] * item["precio_unitario"] - item.get("descuento", 0)
        items_data.append([
            Paragraph(str(item.get("codigo", "")),       estilo_normal),
            Paragraph(str(item.get("descripcion", "")),  estilo_normal),
            Paragraph(f'{item["cantidad"]:.2f}',          estilo_normal),
            Paragraph(f'${item["precio_unitario"]:.2f}',  estilo_normal),
            Paragraph(f'${item.get("descuento", 0):.2f}', estilo_normal),
            Paragraph(f'${subtotal:.2f}',                 estilo_normal),
        ])

    items_tabla = Table(
        items_data,
        colWidths  = [2.5*cm, 7*cm, 1.5*cm, 2*cm, 1.5*cm, 2.5*cm],
        repeatRows = 1
    )
    items_tabla.setStyle(TableStyle([
        ("BACKGROUND",     (0, 0), (-1, 0),  VERDE_SRI),
        ("TEXTCOLOR",      (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",       (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",       (0, 0), (-1, 0),  7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRIS_CLARO]),
        ("INNERGRID",      (0, 0), (-1, -1), 0.25, colors.grey),
        ("BOX",            (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN",         (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",          (2, 0), (-1, -1), "RIGHT"),
        ("LEFTPADDING",    (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",   (0, 0), (-1, -1), 4),
        ("TOPPADDING",     (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 4),
    ]))
    story.append(items_tabla)
    story.append(Spacer(1, 0.3 * cm))

    # -----------------------------------------------
    # 5. TOTALES
    # -----------------------------------------------
    subtotal_sin_iva = datos.get("total_sin_impuestos", 0)
    descuento        = datos.get("total_descuento", 0)
    iva              = sum(i.get("valor", 0) for i in datos.get("impuestos", []))
    total            = datos.get("importe_total", 0)

    totales_data = [
        ["", "", Paragraph("SUBTOTAL SIN IMPUESTOS:", estilo_label), Paragraph(f'${subtotal_sin_iva:.2f}', estilo_valor)],
        ["", "", Paragraph("DESCUENTO:",              estilo_label), Paragraph(f'${descuento:.2f}',        estilo_valor)],
        ["", "", Paragraph("IVA 15%:",                estilo_label), Paragraph(f'${iva:.2f}',              estilo_valor)],
        ["", "", Paragraph("VALOR TOTAL:",            estilo_label), Paragraph(f'${total:.2f}',             estilo_valor)],
    ]
    totales_tabla = Table(totales_data, colWidths=[5*cm, 5*cm, 4.5*cm, 3*cm])
    totales_tabla.setStyle(TableStyle([
        ("BACKGROUND",    (2, 3), (3, 3), VERDE_SRI),
        ("TEXTCOLOR",     (2, 3), (3, 3), colors.white),
        ("INNERGRID",     (2, 0), (3, -1), 0.25, colors.grey),
        ("BOX",           (2, 0), (3, -1), 0.25, colors.grey),
        ("ALIGN",         (3, 0), (3, -1), "RIGHT"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(totales_tabla)
    story.append(Spacer(1, 0.3 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))

    # -----------------------------------------------
    # 6. PIE DE PÁGINA
    # -----------------------------------------------
    pie = Paragraph(
        "Documento generado electrónicamente — Autorizado por el SRI Ecuador",
        ParagraphStyle("pie", parent=styles["Normal"],
            fontSize=7, textColor=colors.grey, alignment=TA_CENTER)
    )
    story.append(Spacer(1, 0.2 * cm))
    story.append(pie)

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    logger.info(f"RIDE generado ({TIPO_CODIGO}): {len(pdf_bytes)} bytes")
    return pdf_bytes


# =================================================
# FUNCIONES DE CÓDIGO — fácil de alternar
# =================================================

def _generar_codigo(numero_autorizacion: str):
    """
    Retorna el código según TIPO_CODIGO.
    QR  → objeto Image de reportlab
    BARRAS → objeto CodigoBarras (Flowable)
    """
    if TIPO_CODIGO == "QR":
        return _generar_qr(numero_autorizacion)
    else:
        return _generar_barras_cabecera(numero_autorizacion)


def _generar_barras_cabecera(numero_autorizacion: str) -> CodigoBarras:
    """
    Código de barras pequeño para la cabecera del RIDE.
    """
    return CodigoBarras(
        valor         = numero_autorizacion,
        ancho         = 5 * cm,    # ← reducido de 6 a 5
        alto          = 0.8 * cm,  # ← reducido de 1.0 a 0.8
        mostrar_texto = False
    )


def _seccion_clave_acceso(clave_acceso: str, estilo_label, estilo_mono):
    """
    Sección de clave de acceso con código de barras completo.
    """
    from reportlab.platypus import KeepTogether

    # Texto de la clave
    clave_tabla = Table(
        [[
            Paragraph("CLAVE DE ACCESO", estilo_label),
            Paragraph(clave_acceso, estilo_mono)
        ]],
        colWidths = [4*cm, 13*cm]
    )
    clave_tabla.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (0, 0),  colors.HexColor("#F7F9FC")),
        ("INNERGRID",     (0, 0), (-1, -1), 0.25, colors.grey),
        ("BOX",           (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    # Código de barras completo centrado
    barras = CodigoBarras(
        valor         = clave_acceso,
        ancho         = 13 * cm,   # ← reducido de 15 a 13 para dejar margen
        alto          = 1.5 * cm,
        mostrar_texto = False
    )

# Envolver en tabla para centrar y agregar padding
    barras_tabla = Table(
        [[barras]],
        colWidths = [17 * cm]   # ancho total disponible
    )
    barras_tabla.setStyle(TableStyle([
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),   # ← margen izquierdo
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),   # ← margen derecho
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("BOX",           (0, 0), (-1, -1), 0.25, colors.grey),
    ]))

    return KeepTogether([clave_tabla, Spacer(1, 0.2*cm), barras])


def _generar_qr(numero_autorizacion: str) -> Image:
    """
    Genera código QR — listo para usar cuando el SRI lo requiera.
    Para activar: cambiar TIPO_CODIGO = "QR" al inicio del archivo.
    """
    qr = qrcode.QRCode(
        version          = 1,
        error_correction = qrcode.constants.ERROR_CORRECT_M,
        box_size         = 3,
        border           = 2,
    )
    qr.add_data(numero_autorizacion)
    qr.make(fit=True)

    img    = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    return Image(buffer, width=3*cm, height=3*cm)