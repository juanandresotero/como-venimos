"""Pide las cosas a RE/MAX a traves de Chrome, como las pediria quien mira la pagina.

Desde 2026-11-14 RE/MAX le contesta 403 a todo lo que no es un navegador: GitHub, urllib y
hasta Chrome sin ventana. Con Chrome COMUN (con ventana) la pagina carga, y los datos se piden
desde adentro de esa pagina, que es lo que hace la propia web de RE/MAX.

Solo se usa si COMO_VENIMOS_NAVEGADOR=1 (ver api.bajar), o sea en la PC de Juan. Se abre UNA
vez por corrida y se cierra solo al terminar. La ventana se abre fuera de la pantalla.
"""
from __future__ import annotations

import atexit
import json

PAGINA_DE_RE_MAX = "https://www.remax.com.uy/"
FUERA_DE_PANTALLA = "--window-position=-32000,-32000"

_abierto: dict = {}

_PEDIR_DESDE_LA_PAGINA = """async (url) => {
  const r = await fetch(url, {headers: {Accept: 'application/json'}});
  return [r.status, await r.text()];
}"""


def _pagina():
    if "pagina" not in _abierto:
        from playwright.sync_api import sync_playwright   # solo hace falta en la PC de Juan
        playwright = sync_playwright().start()
        chrome = playwright.chromium.launch(
            channel="chrome", headless=False, args=[FUERA_DE_PANTALLA])
        pagina = chrome.new_page()
        respuesta = pagina.goto(PAGINA_DE_RE_MAX, wait_until="domcontentloaded", timeout=90000)
        if respuesta.status != 200:
            chrome.close()
            playwright.stop()
            raise ValueError(f"la pagina de RE/MAX contesto HTTP {respuesta.status}")
        _abierto.update(playwright=playwright, chrome=chrome, pagina=pagina)
        atexit.register(cerrar)
    return _abierto["pagina"]


def pedir(url: str):
    """El JSON de la URL. Cualquier problema sale como ValueError, que api.bajar reintenta."""
    estado, cuerpo = _pagina().evaluate(_PEDIR_DESDE_LA_PAGINA, url)
    if estado != 200:
        raise ValueError(f"HTTP {estado}")
    return json.loads(cuerpo)


def cerrar():
    if "pagina" in _abierto:
        try:
            _abierto["chrome"].close()
            _abierto["playwright"].stop()
        finally:
            _abierto.clear()
