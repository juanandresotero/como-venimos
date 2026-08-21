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


def traer(bajar=api.bajar) -> dict:
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
        })

    oficinas.sort(key=lambda o: o["nombre"].lower())
    agentes.sort(key=lambda a: a["nombre"].lower())
    return {"oficinas": oficinas, "agentes": agentes}
