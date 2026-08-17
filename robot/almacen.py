"""Leer y escribir los archivos de datos. Lo unico que toca el disco.

La escritura es atomica: primero se escribe un .tmp y despues se renombra. Si se corta
la luz a mitad de camino, el archivo bueno queda intacto en vez de quedar cortado.

Se guarda ordenado por clave para que el diff de Git muestre solo lo que cambio de verdad
y no todo el archivo revuelto.
"""
from __future__ import annotations

import json
import os
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DATOS = RAIZ / "datos"


def leer_json(nombre: str, por_defecto, carpeta=None):
    carpeta = pathlib.Path(carpeta) if carpeta else DATOS
    ruta = carpeta / nombre
    if not ruta.exists():
        return por_defecto
    with open(ruta, encoding="utf-8") as archivo:
        return json.load(archivo)


def escribir_json(nombre: str, datos, carpeta=None) -> None:
    carpeta = pathlib.Path(carpeta) if carpeta else DATOS
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta = carpeta / nombre
    temporal = ruta.with_name(ruta.name + ".tmp")
    with open(temporal, "w", encoding="utf-8") as archivo:
        json.dump(datos, archivo, ensure_ascii=False, indent=1, sort_keys=True)
        archivo.write("\n")
    os.replace(temporal, ruta)
