"""Lee negocios.xlsx y normaliza los tipos. Lo unico de esta fase que toca un archivo.

El Excel real tiene 80 celdas guardadas como TEXTO en columnas que deberian ser numeros
("150.40%", "2772.96"). Excel las suma igual casi siempre, pero cualquier formula nueva
las puede saltear en silencio. Aca se pasan todas a numero de una vez.
"""
from __future__ import annotations

import datetime
import pathlib

import openpyxl

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ARCHIVO = RAIZ / "negocios.xlsx"

# Las 14 columnas del Excel, en orden.
COLUMNAS = (
    "operacion",
    "barrio",
    "direccion",
    "agente_vende",
    "agente_compra",
    "origen",
    "precio",
    "pct_comision",
    "facturado",
    "pct_agente",
    "importe",
    "fecha_inicio",
    "fecha_boleto",
    "fecha_fin",
)

NUMERICAS = ("precio", "pct_comision", "facturado", "pct_agente", "importe")
FECHAS = ("fecha_inicio", "fecha_boleto", "fecha_fin")
TEXTOS = ("operacion", "barrio", "direccion", "agente_vende", "agente_compra", "origen")


def a_numero(valor):
    """Pasa a numero lo que venga. Entiende '150.40%' y '2772.96'. Devuelve None si no puede."""
    if valor is None or isinstance(valor, (int, float)):
        return valor
    texto = str(valor).strip().replace(",", "").replace(" ", "")
    if not texto:
        return None
    porcentaje = texto.endswith("%")
    if porcentaje:
        texto = texto[:-1]
    try:
        numero = float(texto)
    except ValueError:
        return None
    return numero / 100 if porcentaje else numero


def a_fecha(valor):
    """Pasa una fecha de Excel a texto ISO (2022-08-10). Devuelve None si esta vacia."""
    if isinstance(valor, datetime.datetime):
        return valor.date().isoformat()
    if isinstance(valor, datetime.date):
        return valor.isoformat()
    return None


def leer(archivo=None) -> list:
    """Devuelve una lista de diccionarios, uno por negocio, con los tipos ya normalizados."""
    ruta = pathlib.Path(archivo) if archivo else ARCHIVO
    hoja = openpyxl.load_workbook(ruta, data_only=True).worksheets[0]
    filas = []
    for numero_fila, valores in enumerate(hoja.iter_rows(min_row=2, values_only=True), start=2):
        if not any(v is not None for v in valores):
            continue    # renglon vacio al final de la hoja
        fila = dict(zip(COLUMNAS, valores))
        fila["fila_excel"] = numero_fila
        for campo in NUMERICAS:
            fila[campo] = a_numero(fila[campo])
        for campo in FECHAS:
            fila[campo] = a_fecha(fila[campo])
        for campo in TEXTOS:
            if isinstance(fila[campo], str):
                fila[campo] = fila[campo].strip()
        filas.append(fila)
    return filas
