"""Imprime el estado del negocio con los datos ya importados.

Es la version en texto de lo que despues va a mostrar la pantalla de Salud del Negocio.
Sirve para verificar los numeros antes de construir la interfaz.

Uso:  python herramientas/resumen.py
"""
from __future__ import annotations

import collections
import datetime
import pathlib
import statistics as st
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from robot import almacen    # noqa: E402

ANIO = "2026"


def main() -> int:
    negocios = almacen.leer_json("negocios.json", [])
    cartera = almacen.leer_json("cartera.json", {})
    ajustes = almacen.leer_json("ajustes.json", {})
    if not negocios:
        print("No hay negocios importados. Corre: python herramientas/importar_excel.py")
        return 1

    del_anio = [n for n in negocios if n["fecha_fin"] and n["fecha_fin"][:4] == ANIO]
    cerrados = [n for n in del_anio if n["estado"] == "cerrado"]
    en_curso = [n for n in del_anio if n["estado"] == "en_curso"]

    cobrado = sum(n.get("facturacion") or 0 for n in cerrados)
    ganado = sum(n.get("ganancia") or 0 for n in cerrados)
    casi = sum(n.get("facturacion") or 0 for n in en_curso)
    casi_gan = sum(n.get("ganancia") or 0 for n in en_curso)

    print("=" * 68)
    print(f"  SALUD DEL NEGOCIO — {ANIO}")
    print("=" * 68)
    print(f"\n  CAPA 1 · COBRADO      {len(cerrados):2} negocios | "
          f"facturado {cobrado:>9,.0f} | ganancia {ganado:>8,.0f}")
    print(f"  CAPA 2 · CASI SEGURO  {len(en_curso):2} negocios | "
          f"facturado {casi:>9,.0f} | ganancia {casi_gan:>8,.0f}")

    # Ratios reales, con mediana para que no los rompan los errores de tipeo.
    def ratios(tipo):
        base = [n for n in negocios if n["tipo_negocio"] == tipo
                and n.get("precio_operacion") and n.get("facturacion")]
        if not base:
            return (0.0, 0.0)
        return (st.median(n["facturacion"] / n["precio_operacion"] for n in base),
                st.median((n.get("ganancia") or 0) / n["precio_operacion"] for n in base))

    r_fact, r_gan = ratios("venta")
    prob = ajustes.get("probabilidades_cierre", {})
    capa3_f = capa3_g = 0.0
    usadas = []
    ya_contadas = {n.get("entity_id_cartera") for n in en_curso}
    for propiedad in cartera.values():
        if not propiedad.get("activa") or not propiedad.get("usar_en_proyeccion"):
            continue
        if propiedad["entity_id"] in ya_contadas:
            continue    # ya contada en la capa 2
        p = prob.get(propiedad["estado"], 0)
        capa3_f += propiedad["precio"] * r_fact * p
        capa3_g += propiedad["precio"] * r_gan * p
        usadas.append((propiedad["direccion"], propiedad["estado"], propiedad["precio"], p))

    print(f"  CAPA 3 · POTENCIAL    {len(usadas):2} propiedades | "
          f"facturado {capa3_f:>9,.0f} | ganancia {capa3_g:>8,.0f}")
    print(f"\n  {'TOTAL SI TODO CIERRA':<22}   | "
          f"facturado {cobrado + casi + capa3_f:>9,.0f} | ganancia {ganado + casi_gan + capa3_g:>8,.0f}")

    objetivo = ajustes.get("objetivo_personal", {}).get(ANIO)
    if objetivo:
        hoy = datetime.date.today()
        dia = (hoy - datetime.date(int(ANIO), 1, 1)).days + 1
        calendario = dia / 365
        avance = cobrado / objetivo
        estado = "VAS A RITMO" if avance >= calendario else "VAS ATRASADO"
        print(f"\n  Objetivo {ANIO}: {objetivo:,}")
        print(f"  Cobrado {cobrado:,.0f} = {avance * 100:.1f}%  |  "
              f"calendario {calendario * 100:.1f}%  ->  {estado}")
        print(f"  Proyeccion a fin de año con lo cobrado: {cobrado / calendario:,.0f}")
        print(f"  Sumando capa 2 y capa 3:                {cobrado + casi + capa3_f:,.0f}")

    print(f"\n  Ratios reales (mediana): una venta factura {r_fact * 100:.2f}% "
          f"y deja {r_gan * 100:.2f}% del precio")

    print("\n  Propiedades usadas en la capa 3:")
    for direccion, estado, precio, p in sorted(usadas, key=lambda x: -x[2]):
        print(f"    {estado:15} USD {precio:>9,.0f}  x{p:.0%}  {direccion}")

    avisos = collections.Counter(a["tipo"] for n in negocios for a in n["avisos"])
    print(f"\n  PENDIENTES: {sum(avisos.values())}")
    for tipo, cantidad in avisos.most_common():
        print(f"    {cantidad:3}  {tipo}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
