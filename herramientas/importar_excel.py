"""Importa negocios.xlsx a datos/negocios.json.

Se corre a mano cuando se quiere volver a importar desde cero. No pisa nada que no sea
datos/negocios.json.

Uso:  python herramientas/importar_excel.py
      DRY_RUN=1 python herramientas/importar_excel.py    (muestra el resumen, no escribe)
"""
from __future__ import annotations

import collections
import datetime
import os
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from robot import almacen                       # noqa: E402
from negocios import excel, importador          # noqa: E402


def main() -> int:
    seco = os.environ.get("DRY_RUN") == "1"
    hoy = os.environ.get("FECHA_HOY") or datetime.date.today().isoformat()

    ajustes = almacen.leer_json("ajustes.json", None)
    if ajustes is None:
        print("ERROR: falta datos/ajustes.json", file=sys.stderr)
        return 1

    cartera = almacen.leer_json("cartera.json", {})
    filas = excel.leer()
    negocios = importador.importar(filas, ajustes, cartera, hoy)

    print(f"Importados {len(negocios)} negocios desde el Excel.\n")

    por_anio = collections.Counter()
    facturacion = collections.defaultdict(float)
    for n in negocios:
        anio = n["fecha_fin"][:4] if n["fecha_fin"] else "sin fecha"
        por_anio[anio] += 1
        if n["estado"] == "cerrado" and n["facturacion"]:
            facturacion[anio] += n["facturacion"]

    print("Por año (la facturacion solo cuenta lo cerrado):")
    for anio in sorted(por_anio):
        print(f"  {anio}: {por_anio[anio]:3} negocios | facturado {facturacion[anio]:>10,.0f}")

    en_curso = [n for n in negocios if n["estado"] == "en_curso"]
    if en_curso:
        print(f"\n{len(en_curso)} negocios pasaron a EN CURSO (la propiedad sigue viva):")
        for n in en_curso:
            print(f"  {n['id']:10} {str(n['direccion'])[:32]:32} figuraba firmado el {n['fecha_fin']}")

    avisos = collections.Counter(a["tipo"] for n in negocios for a in n["avisos"])
    print(f"\nPendientes por resolver ({sum(avisos.values())} en total):")
    for tipo, cantidad in avisos.most_common():
        print(f"  {cantidad:3}  {tipo}")

    if seco:
        print("\nDRY_RUN: no se escribio nada")
        return 0

    almacen.escribir_json("negocios.json", negocios)
    print("\nGuardado en datos/negocios.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
