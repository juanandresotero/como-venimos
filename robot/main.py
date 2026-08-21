"""Corre una vez por dia. Baja la cartera de RE/MAX, la compara con la de ayer,
guarda los cambios y deja anotado si la corrida salio bien.

Si la API falla, NO se toca la cartera: se anota el error y listo. Lo peor que podria
pasar es que un corte de red se interprete como que se vendieron todas las propiedades.

Uso:  python -m robot.main
      DRY_RUN=1 python -m robot.main     (muestra lo que haria, sin escribir)
      FECHA_HOY=2026-08-18 python -m robot.main   (para probar)
"""
from __future__ import annotations

import datetime
import os
import sys

from robot import agentes, almacen, api, indices, modelo, procesar, referidas


def main() -> int:
    seco = os.environ.get("DRY_RUN") == "1"
    hoy = os.environ.get("FECHA_HOY") or datetime.date.today().isoformat()

    try:
        listings = api.traer_listings()
    except RuntimeError as error:
        almacen.escribir_json("estado_robot.json", {
            "ultima_corrida": hoy,
            "ok": False,
            "error": str(error),
            "propiedades": None,
            "novedades": None,
        })
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    propiedades = [modelo.normalizar(x) for x in listings]
    cartera_previa = almacen.leer_json("cartera.json", {})
    eventos_previos = almacen.leer_json("eventos.json", [])
    # Se lee, nunca se escribe: mis_datos.json es de la app (§3.3).
    mis_datos = almacen.leer_json("mis_datos.json", {})
    cartera, eventos = procesar.procesar(cartera_previa, propiedades, hoy, mis_datos)

    print(f"{hoy}: {len(propiedades)} propiedades, {len(eventos)} novedades")
    for evento in eventos:
        print(f"  - {evento['tipo']}: {evento['titulo']} ({evento['direccion']})")

    if seco:
        print("DRY_RUN: no se escribio nada")
        return 0

    # Los indices para reajustar alquileres. Van aparte a proposito: si el INE o el MEF
    # estan caidos, la cartera del dia se guarda igual. Lo peor que pasa es que la
    # calculadora de reajuste quede con los numeros de ayer, y ella misma lo avisa.
    try:
        previos = almacen.leer_json("indices.json", {})
        almacen.escribir_json("indices.json", indices.traer(hoy, previos))
    except Exception as error:   # noqa: BLE001 - ninguna falla de afuera puede tumbar la corrida
        print(f"AVISO: no se pudieron actualizar los indices: {error}", file=sys.stderr)

    # La guia de agentes de RE/MAX: quien trabaja en cada oficina. Sirve para elegir a quien
    # le referiste una propiedad y despues poder mirar su cartera. Se refresca cada tres dias,
    # no todos: la cartera cambia a diario, pero que entre o salga alguien de RE/MAX es cosa
    # de meses. Va aparte y sin tumbar nada, igual que los indices.
    guia = almacen.leer_json("agentes_remax.json", {})
    if agentes.toca_bajarla(guia, hoy):
        try:
            almacen.escribir_json("agentes_remax.json", agentes.traer(hoy=hoy))
            print("guia de agentes: actualizada")
        except Exception as error:   # noqa: BLE001 - nada de afuera puede tumbar la corrida
            print(f"AVISO: no se pudo actualizar la guia de agentes: {error}", file=sys.stderr)
    else:
        print(f"guia de agentes: al dia (bajada el {guia.get('bajada_el')})")

    # LAS PROPIEDADES QUE JUAN REFIRIO A UN COLEGA. Se le mira la cartera al colega, porque
    # el no le cuenta como viene la cosa. Tambien aparte: si un colega no se puede consultar,
    # la corrida del dia se guarda igual.
    try:
        negocios = almacen.leer_json("negocios.json", [])   # de la app: se lee, nunca se escribe
        visto, avisos_referidas = referidas.mirar(
            negocios, almacen.leer_json("referidas.json", {}), hoy,
            lambda agente: api.traer_listings(api.url_de(agente)),
            api.traer_por_slug)
        almacen.escribir_json("referidas.json", visto)
        eventos.extend(avisos_referidas)
        for a in avisos_referidas:
            print(f"  - {a['tipo']}: {a['titulo']}")
    except Exception as error:   # noqa: BLE001 - nada de afuera puede tumbar la corrida
        print(f"AVISO: no se pudieron mirar las referidas: {error}", file=sys.stderr)

    almacen.escribir_json("cartera.json", cartera)
    almacen.escribir_json("eventos.json", eventos_previos + eventos)
    almacen.escribir_json("estado_robot.json", {
        "ultima_corrida": hoy,
        "ok": True,
        "error": None,
        "propiedades": len(propiedades),
        "novedades": len(eventos),
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
