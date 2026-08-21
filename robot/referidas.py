"""Seguir las propiedades que Juan le refirio a un colega.

EL PROBLEMA, dicho por el:

    "cuando alguien refiere algo los agentes que recibieron mi referido no me informan de
     como viene la cosa y este sistema que te planteo aca me garantiza enterarme"

Refiere una propiedad, se la pasa a un colega, y despues no sabe mas nada. No sabe si la
publico, si esta en negociacion, si se vendio. La unica forma de enterarse hoy es llamarlo.

COMO SE RESUELVE. Al referir, Juan elige al colega de la guia de agentes: eso deja anotado su
id. Con ese id se le pide su cartera a la misma API publica de RE/MAX que ya usamos para la de
Juan, y se mira todos los dias que paso.

LOS CUATRO MOMENTOS, en el orden que los conto Juan:

  1. Al referir, lo unico que se sabe es la fecha. Eso ya lo pone la app sola.
  2. El colega la publica. Hay DOS caminos:

       - CON EL LINK PEGADO, que es el bueno: Juan pega el link de la publicacion y no hay
         nada que adivinar. Es esa. Lo pidio el: "agregale que pueda directamente poner el
         link de la propiedad para que le haga seguimiento y no tengo que buscar el match".
       - SIN EL LINK: el robot la busca por la DIRECCION y avisa "puede ser esta". Juan le
         pregunta al colega y contesta si o no.
  3. Ya identificada: pasa a negociacion o queda reservada, y se avisa. Puede saltearse la
     negociacion —hay colegas que mandan una venta directo a reservada— asi que se avisa de
     cualquier cambio de estado, no de una secuencia esperada.
  4. Deja de estar publicada: se pregunta si se vendio o se cayo.

ESTE ARCHIVO NO DECIDE NADA. Deja anotado lo que vio en datos/referidas.json y emite avisos.
Quien confirma es Juan desde la app, porque la unica manera de saber si esa es la propiedad es
preguntarle al colega. El robot no escribe negocios.json: es de la app (§3.3).
"""
from __future__ import annotations

from negocios import cruce

# Los mismos nombres que usa el resto de la app para los estados del portal.
ESTADOS = {"active": "publicada", "negotiation": "en_negociacion", "reservada": "reservada"}


def _valor(campo):
    """La API devuelve {'id': 1, 'value': 'sale'} en vez de 'sale'."""
    if isinstance(campo, dict):
        return campo.get("value")
    return campo


def a_quien_seguir(negocios) -> dict:
    """{id del colega: [negocios que le referiste]}.

    Un negocio CERRADO o CAIDO no se sigue: ya sabes como termino. Y sin colega elegido de la
    guia no hay a quien mirarle la cartera — es el caso de las referidas viejas del Excel, que
    tienen el nombre escrito a mano y nada mas.

    LAS QUE TIENEN EL LINK PEGADO NO ENTRAN ACA: esas se piden directo por su slug y no hace
    falta la cartera de nadie. Van en `las_del_link`.
    """
    porColega: dict = {}
    for n in negocios or []:
        if not _se_sigue(n) or n.get("referido_slug"):
            continue
        agente = n.get("referido_a_agente")
        if not agente:
            continue
        porColega.setdefault(agente, []).append(n)
    return porColega


def _se_sigue(n) -> bool:
    return bool(n.get("yo_referi")) and n.get("estado") not in ("cerrado", "caido")


def las_del_link(negocios) -> list:
    """Las referidas con el link pegado. Ahi no hay nada que adivinar: es esa."""
    return [n for n in negocios or [] if _se_sigue(n) and n.get("referido_slug")]


UUID = 36   # largo de "289eef8c-1a9c-4417-b483-8875104847ac"


def _barrio(listing: dict) -> str:
    """El barrio esta en un lado distinto segun de donde venga la propiedad.

    En la lista de un agente viene como `geoLabel` ("La Blanqueada, La Blanqueada, Montevideo")
    y al pedirla sola por su slug viene desarmado adentro de `geo`. Y `location` NO es el
    barrio en ninguno de los dos: son las coordenadas.
    """
    geo = listing.get("geo") or {}
    partes = geo.get("countie") or geo.get("citie") or geo.get("label") or ""
    if partes:
        return str(partes).split(",")[0].strip().title()
    return str(listing.get("geoLabel") or "").split(",")[0].strip()


def _entity_id(listing: dict):
    """Al pedir una propiedad por su slug, `entityId` viene en null y el uuid esta en `id`.
    En la lista de un agente es al reves. Mismo dato, dos nombres."""
    directo = listing.get("entityId")
    if directo:
        return directo
    suelto = listing.get("id")
    return suelto if isinstance(suelto, str) and len(suelto) == UUID else None


def _propiedad(listing: dict) -> dict:
    """Lo que hace falta de una propiedad ajena. Ni fotos ni descripciones: es de otro."""
    return {
        "entity_id": _entity_id(listing),
        "slug": listing.get("slug") or "",
        # EL NUMERO INTERNO NO CAMBIA NUNCA. El slug sale del titulo de la publicacion, asi
        # que si el colega le cambia el titulo, cambia el slug y el link viejo deja de
        # funcionar. Con el numero interno se la puede volver a encontrar en la cartera del
        # colega en vez de darla por desaparecida.
        "internal_id": listing.get("internalId"),
        "direccion": listing.get("displayAddress") or "",
        "barrio": _barrio(listing),
        "precio": listing.get("price"),
        "moneda": _valor(listing.get("currency")) or "USD",
        "operacion": "alquiler" if _valor(listing.get("operation")) == "rent" else "venta",
        "estado": ESTADOS.get(_valor(listing.get("listingStatus")), "publicada"),
        "titulo": listing.get("title") or "",
    }


def _como_cartera(propiedades: list) -> dict:
    """El formato que espera `cruce.emparejar`: un diccionario por entity_id."""
    return {p["entity_id"]: {**p, "activa": True} for p in propiedades if p.get("entity_id")}


def _aviso(tipo, negocio, fecha, texto, extra=None):
    """Con la misma forma que los eventos de la cartera: van todos al mismo eventos.json y la
    app los despacha igual. El `id` lleva la fecha para que el mismo aviso de otro dia sea
    otro aviso, y para poder darlo por atendido sin que vuelva."""
    return {
        "id": f"{fecha}|{negocio.get('id')}|{tipo}",
        "fecha": fecha,
        "tipo": tipo,
        "entity_id": None,
        "internal_id": None,
        "negocio_id": negocio.get("id"),
        "titulo": negocio.get("direccion") or "Propiedad referida",
        "direccion": negocio.get("direccion") or "",
        "detalle": texto,
        "atendido": False,
        **(extra or {}),
    }


def mirar(negocios, previo, hoy, traer, por_slug=lambda _: None) -> tuple:
    """Mira que paso con lo que referiste y devuelve (lo que vio, los avisos).

    `traer(agente_id)` devuelve la lista de propiedades de ese agente y `por_slug(slug)` una
    propiedad sola. Se pasan como parametro para poder probar esto sin internet.
    """
    antes = (previo or {}).get("negocios") or {}
    ahora: dict = {}
    avisos: list = []
    carteras: dict = {}

    """PRIMERO LAS DEL LINK. Una sola llamada por propiedad, sin cartera de nadie de por
    medio y sin nada que confirmar: Juan pego el link, es esa."""
    for n in las_del_link(negocios):
        crudo = por_slug(n["referido_slug"])
        propiedad = _propiedad(crudo) if crudo else None
        visto, nuevos = _seguir(n, propiedad, antes.get(n["id"]) or {}, hoy)
        visto["slug"] = n["referido_slug"]
        ahora[n["id"]] = visto
        avisos.extend(nuevos)

    for agente, suyos in a_quien_seguir(negocios).items():
        if agente not in carteras:
            # Una sola llamada por colega aunque le hayas referido tres propiedades.
            carteras[agente] = [_propiedad(x) for x in (traer(agente) or [])]
        propiedades = carteras[agente]
        for n in suyos:
            visto, nuevos = _mirar_una(n, propiedades, antes.get(n["id"]) or {}, hoy)
            visto["agente_id"] = agente
            ahora[n["id"]] = visto
            avisos.extend(nuevos)

    return {"mirado_el": hoy, "negocios": ahora}, avisos


def _mirar_una(negocio, propiedades, antes, hoy) -> tuple:
    """Que pasa con UNA referida sin link: buscarla, o seguirla si ya se sabe cual es."""
    elegida = negocio.get("referido_entity_id")
    if elegida:
        return _seguir(
            negocio, next((p for p in propiedades if p["entity_id"] == elegida), None),
            antes, hoy)

    # ---------------------------------------------------------------- todavia hay que ubicarla
    descartadas = set(negocio.get("referido_descartadas") or [])
    candidatas = [
        c for c in cruce.emparejar(
            negocio.get("direccion"), negocio.get("precio_operacion"),
            _como_cartera(propiedades))
        if c["entity_id"] not in descartadas
    ]
    if not candidatas:
        return ({"propiedad": None, "candidatas": []}, [])

    # SOLO SE AVISA DE LAS QUE NO SE HABIAN VISTO. Sin esto, la misma candidata volveria a
    # aparecer todos los dias hasta que Juan la conteste, y eso convierte la bandeja en ruido.
    vistas = {c["entity_id"] for c in (antes.get("candidatas") or [])}
    frescas = [c for c in candidatas if c["entity_id"] not in vistas]
    avisos = []
    if frescas:
        cual = frescas[0]
        avisos.append(_aviso(
            "referida_candidata", negocio, hoy,
            f"Tu colega publicó «{cual['direccion_cartera']}»"
            f"{' por ' + _plata(cual['precio_cartera']) if cual.get('precio_cartera') else ''}"
            f". ¿Es la que le referiste? Preguntale y contestá acá.",
            {"entity_id": cual["entity_id"]}))

    return ({"propiedad": None, "candidatas": candidatas}, avisos)


def _seguir(negocio, actual, antes, hoy) -> tuple:
    """Que le paso a una propiedad que YA sabemos cual es.

    Da igual como se supo —por el link pegado o porque Juan confirmo una candidata—: de aca
    en adelante es lo mismo. Se avisa de todo lo que cambio y, cuando deja de estar, se
    pregunta como termino.
    """
    antesProp = antes.get("propiedad") or {}
    avisos = []

    if actual is None:
        # SE FUE DEL PORTAL. Si ya la habiamos visto, hay que preguntar como termino. Si nunca
        # la vimos, no hay nada que decir: el colega todavia no la publico.
        if antesProp and antesProp.get("activa") is not False:
            avisos.append(_aviso(
                "referida_se_fue", negocio, hoy,
                f"Ya no está publicada en la cartera de tu colega. "
                f"Estaba {NOMBRES[antesProp.get('estado', 'publicada')]}. "
                f"¿Se vendió o se cayó?"))
        sigue = {**antesProp, "activa": False,
                 "visto_ultima_vez": antesProp.get("visto_ultima_vez") or hoy}
        return ({"propiedad": sigue if antesProp else None, "candidatas": []}, avisos)

    guardada = {
        **actual,
        "activa": True,
        "visto_primera_vez": antesProp.get("visto_primera_vez") or hoy,
        "visto_ultima_vez": hoy,
    }

    # LA PRIMERA VEZ QUE APARECE TAMBIEN SE AVISA. Con el link pegado, Juan lo pega el dia que
    # se la refiere y el colega la publica dias despues: ese "ya la publico" es la primera
    # noticia que tiene, y hasta ahora dependia de que el colega se acordara de contarsela.
    if not antesProp:
        avisos.append(_aviso(
            "referida_avanzo", negocio, hoy,
            f"Tu colega ya la publicó: «{actual['direccion']}»"
            f" por {_plata(actual['precio'])} {actual['moneda']}."))

    # CUALQUIER CAMBIO DE ESTADO SE AVISA, no una secuencia esperada. Juan: "capaz que el
    # colega nunca puso negociacion una venta y la mando directo a reservado porque es nuevo
    # y no sabe como funciona el sistema".
    estadoAntes = antesProp.get("estado")
    if estadoAntes and estadoAntes != actual["estado"]:
        avisos.append(_aviso(
            "referida_avanzo", negocio, hoy,
            f"La que le referiste pasó de {NOMBRES[estadoAntes]} a "
            f"{NOMBRES[actual['estado']]}."))

    precioAntes = antesProp.get("precio")
    if precioAntes and actual["precio"] and precioAntes != actual["precio"]:
        avisos.append(_aviso(
            "referida_cambio_precio", negocio, hoy,
            f"Tu colega le cambió el precio: {_plata(precioAntes)} → "
            f"{_plata(actual['precio'])} {actual['moneda']}."))

    return ({"propiedad": guardada, "candidatas": []}, avisos)


NOMBRES = {
    "publicada": "publicada",
    "en_negociacion": "en negociación",
    "reservada": "reservada",
}


def _plata(n):
    try:
        return f"{round(float(n)):,}".replace(",", ".")
    except (TypeError, ValueError):
        return "?"
