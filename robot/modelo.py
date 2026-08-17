"""Traduce una propiedad como la devuelve la API de RE/MAX a nuestro formato.

Es una traduccion pura: entra un diccionario crudo, sale un diccionario nuestro.
No toca ni la red ni el disco, asi que se puede probar sola y sin internet.
"""
from __future__ import annotations

BASE_WEB = "https://www.remax.com.uy/listings/"

# La API habla ingles; nosotros guardamos todo en castellano.
OPERACIONES = {"sale": "venta", "rent": "alquiler"}
ESTADOS = {"active": "publicada", "negotiation": "en_negociacion", "reserved": "reservada"}


def _valor(campo):
    """Varios campos vienen como {'id': 1, 'value': 'sale'}. Nos quedamos con el 'value'."""
    if isinstance(campo, dict):
        return campo.get("value")
    return None


def _barrio(geo_label):
    """geoLabel viene como 'Malvin norte, Malvin norte, Montevideo'. Sirve el primer pedazo."""
    if not geo_label:
        return ""
    return geo_label.split(",")[0].strip()


def _coordenadas(location):
    """OJO: la API usa GeoJSON, que pone [longitud, latitud]. Viene al reves de lo habitual."""
    coordenadas = (location or {}).get("coordinates") or []
    if len(coordenadas) < 2:
        return (None, None)
    return (coordenadas[1], coordenadas[0])


def _foto_portada(photos):
    if not photos:
        return None
    return photos[0].get("rawValue")


def normalizar(listing: dict) -> dict:
    lat, lon = _coordenadas(listing.get("location"))
    slug = listing.get("slug") or ""
    operacion = _valor(listing.get("operation"))
    estado = _valor(listing.get("listingStatus"))
    return {
        "entity_id": listing.get("entityId"),
        "internal_id": listing.get("internalId"),
        "listing_id": listing.get("id"),
        "titulo": listing.get("title"),
        "slug": slug,
        # El link se arma con el slug. OJO: si el aviso se edita, RE/MAX le cambia el slug,
        # por eso la identidad de una propiedad es el entity_id, nunca el link.
        "link": BASE_WEB + slug if slug else None,
        "operacion": OPERACIONES.get(operacion, operacion),
        "tipo": _valor(listing.get("type")),
        "precio": listing.get("price"),
        "moneda": _valor(listing.get("currency")),
        "gastos_comunes": listing.get("expensesPrice"),
        "moneda_gastos": _valor(listing.get("expensesCurrency")),
        "direccion": listing.get("displayAddress"),
        "barrio": _barrio(listing.get("geoLabel")),
        "lat": lat,
        "lon": lon,
        "m2_terreno": listing.get("dimensionLand"),
        "m2_total": listing.get("dimensionTotalBuilt"),
        "m2_cubierto": listing.get("dimensionCovered"),
        "dormitorios": listing.get("bedrooms"),
        "banos": listing.get("bathrooms"),
        "ambientes": listing.get("totalRooms"),
        "estado": ESTADOS.get(estado, estado),
        "foto_portada": _foto_portada(listing.get("photos")),
    }
