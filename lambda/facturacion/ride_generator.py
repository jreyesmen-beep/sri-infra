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

logger = logging.getLogger(__name__)

# Colores corporativos
VERDE_SRI    = colors.HexColor("#00875A")
GRIS_OSCURO  = colors.HexColor("#2D3748")
GRIS_CLARO   = colors.HexColor("#F7F9FC")
NEGRO        = colors.HexColor("#0F1923")


def generar_ride(datos: dict, numero_autorizacion: str, fecha_autorizacion: str) -> bytes:
    """
    Genera el RIDE (PDF) de la factura electrónica
    según el formato requerido por el SRI Ecuador.
    Retorna los bytes del PDF.
    """
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize    = A4,
        rightMargin = 1.5 * cm,
        leftMargin  = 1.5 * cm,
        topMargin   = 1.5 * cm,
        bottomMargin= 1.5 * cm,
    )

    styles   = getSampleStyleSheet()
    story    = []

    # -----------------------------------------------
    # Estilos personalizados
    # -----------------------------------------------
    estilo_titulo = ParagraphStyle(
        "titulo",
        parent    = styles["Normal"],
        fontSize  = 14,
        textColor = VERDE_SRI,
        fontName  = "Helvetica-Bold",
        alignment = TA_CENTER,
        spaceAfter= 4,
    )
    estilo_subtitulo = ParagraphStyle(
        "subtitulo",
        parent    = styles["Normal"],
        fontSize  = 9,
        textColor = GRIS_OSCURO,
        fontName  = "Helvetica-Bold",
        alignment = TA_CENTER,
    )
    estilo_normal = ParagraphStyle(
        "normal_sri",
        parent    = styles["Normal"],
        fontSize  = 8,
        textColor = NEGRO,
        fontName  = "Helvetica",
    )
    estilo_label = ParagraphStyle(
        "label",
        parent    = styles["Normal"],
        fontSize  = 7,
        textColor = colors.grey,
        fontName  = "Helvetica",
    )
    estilo_valor = ParagraphStyle(
        "valor",
        parent    = styles["Normal"],
        fontSize  = 8,
        textColor = NEGRO,
        fontName  = "Helvetica-Bold",
    )
    estilo_mono = ParagraphStyle(
        "mono",
        parent    = styles["Normal"],
        fontSize  = 7,
        textColor = NEGRO,
        fontName  = "Courier",
        alignment = TA_CENTER,
    )

    # -----------------------------------------------
    # 1. CABECERA — Datos del emisor + QR
    # -----------------------------------------------
    qr_img = _generar_qr(numero_autorizacion)

    cabecera_data = [
        [
            # Columna izquierda: datos del emisor
            Table([
                [Paragraph(datos.get("razon_social", ""), estilo_titulo)],
                [Paragraph(f'RUC: {datos.get("ruc", "")}', estilo_subtitulo)],
                [Paragraph(datos.get("dir_matriz", ""), estilo_normal)],
                [Paragraph(f'Teléf: {datos.get("telefono", "-")}', estilo_normal)],
                [Paragraph(datos.get("email", ""), estilo_normal)],
            ], colWidths=[10 * cm]),

            # Columna derecha: tipo de documento + QR
            Table([
                [Paragraph("FACTURA", estilo_titulo)],
                [Paragraph(
                    f'No. {datos.get("establecimiento","001")}-'
                    f'{datos.get("punto_emision","001")}-'
                    f'{datos.get("secuencial","").zfill(9)}',
                    estilo_subtitulo
                )],
                [Paragraph(
                    f'NÚMERO DE AUTORIZACIÓN',
                    estilo_label
                )],
                [Paragraph(numero_autorizacion, estilo_mono)],
                [Paragraph(
                    f'FECHA Y HORA DE AUTORIZACIÓN: {fecha_autorizacion}',
                    estilo_label
                )],
                [Paragraph(
                    f'AMBIENTE: {"CERTIFICACIÓN" if datos.get("ambiente") == "1" else "PRODUCCIÓN"}',
                    estilo_label
                )],
                [Paragraph('EMISIÓN: NORMAL', estilo_label)],
                [qr_img],
            ], colWidths=[7 * cm]),
        ]
    ]

    cabecera_tabla = Table(
        cabecera_data,
        colWidths = [10 * cm, 7 * cm]
    )
    cabecera_tabla.setStyle(TableStyle([
        ("VALIGN",      (0, 0), (-1, -1), "TOP"),
        ("LINEAFTER",   (0, 0), (0, -1), 0.5, colors.grey),
        ("LEFTPADDING", (1, 0), (1, -1), 10),
    ]))

    story.append(cabecera_tabla)
    story.append(Spacer(1, 0.3 * cm))
    story.append(HRFlowable(width="100%", thickness=1, color=VERDE_SRI))
    story.append(Spacer(1, 0.3 * cm))

    # -----------------------------------------------
    # 2. CLAVE DE ACCESO
    # -----------------------------------------------
    clave_data = [
        [
            Paragraph("CLAVE DE ACCESO", estilo_label),
            Paragraph(datos.get("clave_acceso", ""), estilo_mono)
        ]
    ]
    clave_tabla = Table(clave_data, colWidths=[4 * cm, 13 * cm])
    clave_tabla.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (0, 0), GRIS_CLARO),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("INNERGRID",     (0, 0), (-1, -1), 0.25, colors.grey),
        ("BOX",           (0, 0), (-1, -1), 0.25, colors.grey),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(clave_tabla)
    story.append(Spacer(1, 0.3 * cm))

    # -----------------------------------------------
    # 3. DATOS DEL COMPRADOR
    # -----------------------------------------------
    fecha_emision = datos.get("fecha_emision", "")

    comprador_data = [
        [
            Paragraph("RAZÓN SOCIAL / NOMBRES:", estilo_label),
            Paragraph(datos.get("razon_comprador", ""), estilo_valor),
            Paragraph("IDENTIFICACIÓN:", estilo_label),
            Paragraph(datos.get("id_comprador", ""), estilo_valor),
        ],
        [
            Paragraph("FECHA EMISIÓN:", estilo_label),
            Paragraph(fecha_emision, estilo_valor),
            Paragraph("GUÍA REMISIÓN:", estilo_label),
            Paragraph("-", estilo_valor),
        ],
    ]

    comprador_tabla = Table(
        comprador_data,
        colWidths = [3.5 * cm, 6 * cm, 3 * cm, 5 * cm]
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
        Paragraph("CÓD.", estilo_label),
        Paragraph("DESCRIPCIÓN", estilo_label),
        Paragraph("CANT.", estilo_label),
        Paragraph("P. UNIT.", estilo_label),
        Paragraph("DESC.", estilo_label),
        Paragraph("P. TOTAL", estilo_label),
    ]

    items_data = [items_header]
    for item in datos.get("items", []):
        subtotal = item["cantidad"] * item["precio_unitario"] - item.get("descuento", 0)
        items_data.append([
            Paragraph(str(item.get("codigo", "")),      estilo_normal),
            Paragraph(str(item.get("descripcion", "")), estilo_normal),
            Paragraph(f'{item["cantidad"]:.2f}',         estilo_normal),
            Paragraph(f'${item["precio_unitario"]:.2f}', estilo_normal),
            Paragraph(f'${item.get("descuento",0):.2f}', estilo_normal),
            Paragraph(f'${subtotal:.2f}',                estilo_normal),
        ])

    items_tabla = Table(
        items_data,
        colWidths = [2.5*cm, 7*cm, 1.5*cm, 2*cm, 1.5*cm, 2.5*cm],
        repeatRows = 1
    )
    items_tabla.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), VERDE_SRI),
        ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 7),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, GRIS_CLARO]),
        ("INNERGRID",     (0, 0), (-1, -1), 0.25, colors.grey),
        ("BOX",           (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",         (2, 0), (-1, -1), "RIGHT"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
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
        ["", "", Paragraph("DESCUENTO:", estilo_label),              Paragraph(f'${descuento:.2f}',        estilo_valor)],
        ["", "", Paragraph("IVA 15%:",  estilo_label),               Paragraph(f'${iva:.2f}',              estilo_valor)],
        ["", "", Paragraph("VALOR TOTAL:", estilo_label),            Paragraph(f'${total:.2f}',             estilo_valor)],
    ]

    totales_tabla = Table(
        totales_data,
        colWidths = [5*cm, 5*cm, 4.5*cm, 3*cm]
    )
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

    # -----------------------------------------------
    # Construir PDF
    # -----------------------------------------------
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    logger.info(f"RIDE generado: {len(pdf_bytes)} bytes")
    return pdf_bytes


def _generar_qr(numero_autorizacion: str) -> Image:
    """Genera el código QR con el número de autorización."""
    qr = qrcode.QRCode(
        version        = 1,
        error_correction = qrcode.constants.ERROR_CORRECT_M,
        box_size       = 3,
        border         = 2,
    )
    qr.add_data(numero_autorizacion)
    qr.make(fit=True)

    img     = qr.make_image(fill_color="black", back_color="white")
    buffer  = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    return Image(buffer, width=3*cm, height=3*cm)
