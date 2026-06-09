import json
import xml.etree.ElementTree as ET
import logging
from datetime import datetime
from lxml import etree

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def construir_factura(datos: dict) -> str:
    """
    Construye el XML de factura según el esquema del SRI Ecuador v2.1.0
    """
    root = etree.Element("factura", attrib={"id": "comprobante", "version": "2.1.0"})

    # -- infoTributaria --
    info_tributaria = etree.SubElement(root, "infoTributaria")
    _texto(info_tributaria, "ambiente",         datos["ambiente"])          # 1=pruebas, 2=produccion
    _texto(info_tributaria, "tipoEmision",      "1")                        # 1=normal
    _texto(info_tributaria, "razonSocial",      datos["razon_social"])
    _texto(info_tributaria, "nombreComercial",  datos["nombre_comercial"])
    _texto(info_tributaria, "ruc",              datos["ruc"])
    _texto(info_tributaria, "claveAcceso",      datos["clave_acceso"])
    _texto(info_tributaria, "codDoc",           "01")                       # 01=factura
    _texto(info_tributaria, "estab",            datos["establecimiento"])
    _texto(info_tributaria, "ptoEmi",           datos["punto_emision"])
    _texto(info_tributaria, "secuencial",       datos["secuencial"])
    _texto(info_tributaria, "dirMatriz",        datos["dir_matriz"])

    # -- infoFactura --
    info_factura = etree.SubElement(root, "infoFactura")
    _texto(info_factura, "fechaEmision",          datos["fecha_emision"])   # dd/MM/yyyy
    _texto(info_factura, "dirEstablecimiento",    datos["dir_establecimiento"])
    _texto(info_factura, "tipoIdentificacionComprador", datos["tipo_id_comprador"])
    _texto(info_factura, "razonSocialComprador",  datos["razon_comprador"])
    _texto(info_factura, "identificacionComprador", datos["id_comprador"])
    _texto(info_factura, "totalSinImpuestos",     f'{datos["total_sin_impuestos"]:.2f}')
    _texto(info_factura, "totalDescuento",        f'{datos["total_descuento"]:.2f}')

    # logger.info("Impuestos Totales")

    # Impuestos totales
    # -- totalConImpuestos --
    total_impuestos = etree.SubElement(info_factura, "totalConImpuestos")
    for impuesto in datos["impuestos"]:
        ti = etree.SubElement(total_impuestos, "totalImpuesto")
        _texto(ti, "codigo",       impuesto["codigo"])       # 2=IVA        

        # logger.info(f"impuesto[tarifa]  1: {impuesto["tarifa"]}")

        _texto(ti, "codigoPorcentaje", _codigo_porcentaje(impuesto["tarifa"]))  # ← función
        _texto(ti, "baseImponible", f'{impuesto["base"]:.2f}')
        _texto(ti, "valor",         f'{impuesto["valor"]:.2f}')
    
    # logger.info("Impuestos Totales fin")
    _texto(info_factura, "importeTotal",  f'{datos["importe_total"]:.2f}')
    _texto(info_factura, "moneda",        "DOLAR")

    # -- detalles --
    detalles = etree.SubElement(root, "detalles")
    for item in datos["items"]:
        detalle = etree.SubElement(detalles, "detalle")
        _texto(detalle, "codigoPrincipal",  item["codigo"])
        _texto(detalle, "descripcion",      item["descripcion"])
        _texto(detalle, "cantidad",         f'{item["cantidad"]:.6f}')
        _texto(detalle, "precioUnitario",   f'{item["precio_unitario"]:.6f}')
        _texto(detalle, "descuento",        f'{item["descuento"]:.2f}')
        _texto(detalle, "precioTotalSinImpuesto", f'{item["precio_total"]:.2f}')

        # logger.info("Detalle")
        impuestos = etree.SubElement(detalle, "impuestos")
        for imp in item["impuestos"]:
            impuesto = etree.SubElement(impuestos, "impuesto")
            _texto(impuesto, "codigo",           imp["codigo"])              # 2 = IVA
            # logger.info(print(ET.tostring(impuestos, encoding='unicode')))
            # logger.info(f"impuesto[tarifa]  2.1: {str(imp["tarifa"])}")
            # logger.info(print(imp))

            # logger.info(f"impuestos 2: {json.dumps(imp, ensure_ascii=False)}")

            _texto(impuesto, "codigoPorcentaje", _codigo_porcentaje(imp["tarifa"]))  # ← función
            # logger.info("antes porcentaje")
            _texto(impuesto, "tarifa",           str(imp["porcentaje"]))          # 15
            # logger.info("despues porcentaje")
            _texto(impuesto, "baseImponible",    f'{imp["base"]:.2f}')
            _texto(impuesto, "valor",            f'{imp["valor"]:.2f}')

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8").decode()

def _texto(parent, tag: str, texto: str):
    el = etree.SubElement(parent, tag)
    el.text = texto

def _codigo_porcentaje(tarifa) -> str:
    """
    Convierte el código de tarifa al codigoPorcentaje correcto del SRI.
    Independiente de lo que envíe el frontend.
    """
    TABLA = {
        "0":  "0",   # IVA 0%
        "2":  "4",   # IVA 15% (el frontend puede enviar "2" por legado)
        "4":  "4",   # IVA 15% correcto
        "8":  "8",   # IVA 8% reducido
        "6":  "6",   # No objeto de IVA
        "7":  "7",   # Exento de IVA
    }
    codigo = str(tarifa)
    resultado = TABLA.get(codigo, "4")  # default 4 = IVA 15%
    if codigo != resultado:
        import logging
        logging.getLogger(__name__).warning(
            f"codigoPorcentaje corregido: {codigo} → {resultado}"
        )
    return resultado    