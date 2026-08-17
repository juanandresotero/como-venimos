"""Empareja un negocio del Excel con una propiedad de la cartera viva.

Por que hace falta: el usuario anoto fechas de firma inventadas en negocios que en realidad
todavia no cobro. Si la propiedad sigue publicada en RE/MAX, la firma no ocurrio.

Por que es delicado: un cruce por barrio probado sobre los datos reales devolvio ~40
coincidencias de las cuales solo 5 eran verdaderas ("Punta" hacia matchear Punta Rieles con
Punta del Este y Punta Carretas). Por eso el nombre de calle es obligatorio.
"""
from __future__ import annotations

import difflib
import re
import unicodedata

# Que tan parecidos tienen que ser dos nombres de calle para considerarlos el mismo.
# 0.85 alcanza para "flamarrion" vs "flammarion" y no junta calles distintas.
PARECIDO_MINIMO = 0.85

# Cuanto puede diferir el precio para considerarlo "el mismo negocio".
TOLERANCIA_PRECIO = 0.10

ORDEN_CONFIANZA = {"alta": 0, "media": 1}


def _sin_acentos(texto: str) -> str:
    normalizado = unicodedata.normalize("NFD", texto)
    return "".join(c for c in normalizado if unicodedata.category(c) != "Mn")


def partir_direccion(direccion):
    """'Flammarión 5000' -> ('flammarion', 5000). Sin numero, devuelve (calle, None)."""
    if not direccion:
        return ("", None)
    texto = _sin_acentos(str(direccion)).lower().strip()
    encontrado = re.search(r"\b(\d{2,5})\b", texto)
    if not encontrado:
        calle = re.sub(r"\s+", " ", texto).strip()
        return (calle, None)
    calle = re.sub(r"\s+", " ", texto[: encontrado.start()]).strip(" .,-")
    return (calle, int(encontrado.group(1)))


def bloque(numero):
    """RE/MAX publica la altura redondeada a la centena: el 3959 aparece como 3900."""
    if numero is None:
        return None
    return (numero // 100) * 100


def misma_calle(a: str, b: str) -> bool:
    """Compara nombres de calle tolerando errores de tipeo, que en el Excel abundan."""
    if not a or not b:
        return False
    if a == b:
        return True
    return difflib.SequenceMatcher(None, a, b).ratio() >= PARECIDO_MINIMO


def emparejar(direccion: str, precio, cartera: dict) -> list:
    """Busca en la cartera viva las propiedades que podrian ser este negocio.

    El nombre de calle es OBLIGATORIO: sin eso, el cruce devuelve basura. Con calle,
    la altura y el precio suben la confianza. Devuelve la lista ordenada, mas confiable
    primero. Nunca decide sola: el usuario confirma.
    """
    calle, numero = partir_direccion(direccion)
    if not calle:
        return []

    resultados = []
    for entity_id, propiedad in cartera.items():
        if not propiedad.get("activa", True):
            continue
        calle_prop, numero_prop = partir_direccion(propiedad.get("direccion"))
        if not misma_calle(calle, calle_prop):
            continue

        motivos = ["misma calle"]
        if numero is not None and numero_prop is not None and bloque(numero) == bloque(numero_prop):
            motivos.append("misma altura")
        precio_prop = propiedad.get("precio")
        if precio and precio_prop:
            if abs(precio - precio_prop) <= precio_prop * TOLERANCIA_PRECIO:
                motivos.append("precio parecido")

        confianza = "alta" if len(motivos) == 3 else "media"
        resultados.append({
            "entity_id": entity_id,
            "confianza": confianza,
            "motivos": motivos,
            "direccion_cartera": propiedad.get("direccion"),
            "precio_cartera": precio_prop,
            "estado_cartera": propiedad.get("estado"),
        })

    resultados.sort(key=lambda r: (ORDEN_CONFIANZA[r["confianza"]], r["entity_id"]))
    return resultados
