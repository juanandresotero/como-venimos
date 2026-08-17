"""Graba la respuesta real de la API de RE/MAX en tests/fixtures/respuesta_api.json.

Se corre a mano cuando queremos refrescar el ejemplo con el que se prueban los modulos.
Los tests NO llaman a la red: usan este archivo grabado.

Uso:  python herramientas/grabar_fixture.py
"""
from __future__ import annotations

import json
import pathlib

from robot import api

DESTINO = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "respuesta_api.json"


def main():
    crudo = api.bajar()
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    with open(DESTINO, "w", encoding="utf-8") as f:
        json.dump(crudo, f, ensure_ascii=False, indent=1)
        f.write("\n")
    cantidad = len(((crudo or {}).get("data") or {}).get("data") or [])
    print(f"Grabadas {cantidad} propiedades en {DESTINO}")


if __name__ == "__main__":
    raise SystemExit(main())
