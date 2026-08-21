"""Lo unico que habla con RE/MAX.

La API es publica: no hay claves ni secretos. Se piden las propiedades del asociado
en una sola tanda; si algun dia son mas de las que entran, el codigo revienta a proposito
en vez de grabar una cartera incompleta (ver traer_listings).
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

ASOCIADO = "385bebaf-55e1-4fcb-85e6-10f6619d635e"   # Juan Andres Otero
PAGINA = 200

URL = (
    "https://api-ar.redremax.com/remaxweb-uy/api/listings/findAllWithEntrepreneurships"
    f"?page=0&pageSize={PAGINA}"
    f"&eq=associateId:{ASOCIADO}"
    "&eq=entrepreneurship:false"
)

CABECERAS = {
    "User-Agent": "Mozilla/5.0 (como-venimos-robot)",
    "Accept": "application/json",
}


def bajar(url: str = URL, intentos: int = 3, espera: int = 5):
    """Pide el JSON con reintentos. Un corte de red no puede tumbar la corrida del dia."""
    ultimo_error = None
    for intento in range(1, intentos + 1):
        try:
            pedido = urllib.request.Request(url, headers=CABECERAS)
            with urllib.request.urlopen(pedido, timeout=60) as respuesta:
                return json.loads(respuesta.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            ultimo_error = error
            if intento < intentos:
                time.sleep(espera * intento)
    raise RuntimeError(
        f"No se pudo bajar la cartera despues de {intentos} intentos: {ultimo_error}"
    )


def url_de(asociado: str) -> str:
    """La cartera de CUALQUIER agente, no solo la de Juan.

    Es la misma llamada publica, cambiando el id. Sirve para seguir las propiedades que Juan
    refirio a un colega: el no se entera de como viene la cosa si el otro no le cuenta.
    """
    return (
        "https://api-ar.redremax.com/remaxweb-uy/api/listings/findAllWithEntrepreneurships"
        f"?page=0&pageSize={PAGINA}"
        f"&eq=associateId:{asociado}"
        "&eq=entrepreneurship:false"
    )


POR_SLUG = "https://api-ar.redremax.com/remaxweb-uy/api/listings/findBySlug/"


def traer_por_slug(slug: str, bajar=None):
    """Una propiedad sola, por el slug de su link. Devuelve None si no esta.

    Sirve para seguir una propiedad que Juan le refirio a un colega SIN tener que adivinar
    cual es por la direccion: si el pega el link, es esa y punto.

    OJO: cuando el slug no existe la API contesta 200 con data en null, no 404. Mirar solo el
    codigo de respuesta daria por buena una propiedad que no existe.
    """
    if not slug:
        return None
    crudo = (bajar or bajar_json)(POR_SLUG + slug)
    return (crudo or {}).get("data") or None


def bajar_json(url: str):
    """Como `bajar`, pero un fallo devuelve None en vez de tumbar la corrida. Se usa para
    cosas sueltas —una propiedad de un colega— donde no encontrarla no es un desastre."""
    try:
        return bajar(url)
    except RuntimeError:
        return None


def traer_listings(url: str = URL) -> list:
    crudo = bajar(url)
    datos = (crudo or {}).get("data") or {}
    listings = datos.get("data") or []
    total = datos.get("totalItems")
    if total is not None and len(listings) < total:
        raise RuntimeError(
            f"La API dice que hay {total} propiedades pero devolvio {len(listings)}. "
            f"Hay que subir PAGINA en robot/api.py."
        )
    return listings
