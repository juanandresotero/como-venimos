"""La guia de agentes de RE/MAX Uruguay: las oficinas y quien trabaja en cada una.

PARA QUE. Cuando Juan refiere una propiedad a un colega, hasta ahora escribia el nombre a
mano en un campo de texto. Con eso la app no puede hacer nada mas: un nombre suelto no sirve
para ir a mirar si ese colega publico la propiedad.

Con la guia, elegir al colega deja anotado su ID, y con ese ID se puede pedir su cartera a la
misma API publica que ya usamos para la de Juan. Ahi arranca todo lo demas: enterarse de que
la publico, de que paso a negociacion, de que se vendio. Juan lo dijo asi:

    "cuando alguien refiere algo los agentes que recibieron mi referido no me informan de
     como viene la cosa y este sistema me garantiza enterarme"

DE DONDE SALE. De la misma API publica de RE/MAX, sin claves ni secretos, igual que la
cartera. Son dos pedidos por corrida: uno de oficinas y uno de agentes.

CUANTO PESA. Doce oficinas y unos 370 agentes. Se guarda solo lo que hace falta para
elegirlos y para poder mirar su cartera despues; ni fotos, ni biografias, ni redes.

LOS TELEFONOS Y LOS MAILS NO SE GUARDAN. Son datos de contacto de gente real y este repo es
publico. Para elegir a un colega alcanza con su nombre y su oficina; si Juan necesita
llamarlo, lo tiene en su agenda.
"""
from __future__ import annotations

from robot import api

BASE = "https://api-ar.redremax.com/remaxweb-uy/api"
OFICINAS = BASE + "/offices/findAll?page=0&pageSize=200"
AGENTES = BASE + "/associates/findAll?page=0&pageSize=1000"


def _items(crudo) -> list:
    datos = (crudo or {}).get("data") or {}
    if isinstance(datos, list):
        return datos
    return datos.get("data") or []


def _total(crudo):
    datos = (crudo or {}).get("data") or {}
    return datos.get("totalItems") if isinstance(datos, dict) else None


def _completo(crudo, que: str) -> list:
    """Igual que la cartera: media guia es peor que ninguna, asi que revienta a proposito."""
    items = _items(crudo)
    total = _total(crudo)
    if total is not None and len(items) < total:
        raise RuntimeError(
            f"La API dice que hay {total} {que} pero devolvio {len(items)}. "
            f"Hay que subir el pageSize en robot/agentes.py."
        )
    return items


# CADA CUANTOS DIAS SE VUELVE A BAJAR. Lo pidio Juan asi: "capaz esto lo hace menos
# frecuente, 1 vez cada 2 o 3 dias". Y tiene razon: la cartera cambia todos los dias, pero
# que entre o salga un agente de RE/MAX es cosa de meses. Bajar 373 agentes todas las
# mañanas para que el archivo quede igual es pedirle a la API algo que ya sabemos.
CADA_CUANTOS_DIAS = 3


def _dias(desde: str, hasta: str) -> int:
    import datetime
    try:
        a = datetime.date.fromisoformat(desde)
        b = datetime.date.fromisoformat(hasta)
    except (TypeError, ValueError):
        return 10 ** 6
    return (b - a).days


def toca_bajarla(guia, hoy: str) -> bool:
    """Si hoy corresponde volver a bajar la guia.

    Sin guia todavia, siempre. Con una del futuro —el reloj de la maquina anda mal, o se
    probo con FECHA_HOY— tambien se baja: es preferible una llamada de mas que quedarse
    pegado para siempre con una guia que nunca se va a renovar.
    """
    bajada = (guia or {}).get("bajada_el")
    if not bajada:
        return True
    dias = _dias(bajada, hoy)
    return dias < 0 or dias >= CADA_CUANTOS_DIAS


def traer(bajar=api.bajar, hoy: str = "") -> dict:
    """{oficinas: [...], agentes: [...]} listo para guardar."""
    oficinas = [
        {"id": o.get("id"), "nombre": o.get("name"), "direccion": o.get("address") or ""}
        for o in _completo(bajar(OFICINAS), "oficinas")
        if o.get("id") and o.get("name")
    ]
    conocidas = {o["id"] for o in oficinas}

    agentes = []
    for a in _completo(bajar(AGENTES), "agentes"):
        oficina_id = a.get("officeId") or (a.get("office") or {}).get("id")
        if not a.get("id") or not a.get("name") or oficina_id not in conocidas:
            continue
        agentes.append({
            "id": a.get("id"),
            "nombre": a.get("name"),
            "oficina_id": oficina_id,
            # El slug es la identidad ESTABLE de un agente: no lleva acentos ni depende de
            # como este escrito el nombre. Es lo que permite decir "estos ocho son el team"
            # sin que se rompa porque alguien figura como "Martin" y no "Martín".
            "slug": a.get("slug") or "",
        })

    oficinas.sort(key=lambda o: o["nombre"].lower())
    agentes.sort(key=lambda a: a["nombre"].lower())
    return {"bajada_el": hoy, "oficinas": oficinas, "agentes": agentes}
