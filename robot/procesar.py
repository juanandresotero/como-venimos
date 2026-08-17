"""El diario de la cartera: compara lo que hay hoy contra lo que habia ayer.

Funcion pura: entran la cartera guardada y las propiedades de hoy, salen la cartera
actualizada y la lista de novedades. No toca ni la red ni el disco.

REGLA DE ORO: los campos que carga el usuario a mano (fecha de captacion, origen, notas,
desenlace confirmado) NUNCA se pisan. El robot solo escribe lo suyo.
"""
from __future__ import annotations

# Campos que carga el usuario. El robot los crea vacios una sola vez y no los toca mas.
CAMPOS_DEL_USUARIO = (
    "fecha_captacion_real",
    "fecha_captacion_estimada",
    "origen_captacion",
    "desenlace_confirmado",
    "usar_en_proyeccion",
    "notas",
)


def _evento(tipo: str, fila: dict, fecha: str, detalle: dict) -> dict:
    return {
        "id": f"{fecha}|{fila.get('entity_id')}|{tipo}",
        "fecha": fecha,
        "tipo": tipo,
        "entity_id": fila.get("entity_id"),
        "internal_id": fila.get("internal_id"),
        "titulo": fila.get("titulo"),
        "direccion": fila.get("direccion"),
        "detalle": detalle,
        "atendido": False,
    }


def _dar_de_alta(prop: dict, hoy: str) -> dict:
    fila = dict(prop)
    fila["visto_primera_vez"] = hoy
    fila["visto_ultima_vez"] = hoy
    fila["activa"] = True
    fila["historial_precio"] = [
        {"fecha": hoy, "precio": prop["precio"], "moneda": prop["moneda"]}
    ]
    fila["fecha_negociacion"] = hoy if prop["estado"] == "en_negociacion" else None
    fila["fecha_reservada"] = hoy if prop["estado"] == "reservada" else None
    fila["fecha_desaparicion"] = None
    fila["estado_al_desaparecer"] = None
    fila["desenlace_propuesto"] = None
    fila["posible_duplicado_de"] = None
    # Campos del usuario, vacios y listos para llenar desde la app.
    # La fecha de captacion arranca como estimacion: si la tenia publicada de antes, la corrige.
    fila["fecha_captacion_real"] = hoy
    fila["fecha_captacion_estimada"] = True
    fila["origen_captacion"] = None
    fila["desenlace_confirmado"] = None
    fila["usar_en_proyeccion"] = True
    fila["notas"] = ""
    return fila


def _actualizar(fila: dict, prop: dict, hoy: str) -> list:
    """Refresca una propiedad que ya conociamos y devuelve las novedades que haya."""
    eventos = []
    precio_previo = fila.get("precio")
    estado_previo = fila.get("estado")

    # Los datos frescos de la API pisan a los viejos. Como `prop` solo trae los campos
    # que produce robot.modelo, los campos del usuario quedan intactos por construccion.
    fila.update(prop)
    fila["visto_ultima_vez"] = hoy
    fila["activa"] = True

    # Si la habiamos dado de baja y volvio a aparecer, se limpia la baja.
    if fila.get("fecha_desaparicion"):
        fila["fecha_desaparicion"] = None
        fila["estado_al_desaparecer"] = None
        fila["desenlace_propuesto"] = None
        eventos.append(_evento("reaparecio", prop, hoy, {"estado": prop["estado"]}))

    if precio_previo is not None and prop["precio"] != precio_previo:
        fila["historial_precio"].append(
            {"fecha": hoy, "precio": prop["precio"], "moneda": prop["moneda"]}
        )
        eventos.append(_evento("cambio_precio", prop, hoy, {
            "antes": precio_previo,
            "ahora": prop["precio"],
            "moneda": prop["moneda"],
        }))

    if prop["estado"] != estado_previo:
        eventos.append(_evento("cambio_estado", prop, hoy, {
            "antes": estado_previo,
            "ahora": prop["estado"],
        }))
        # Guardamos la PRIMERA vez que entro a cada estado, no la ultima: si va y vuelve,
        # lo que sirve para medir plazos es cuando arranco.
        if prop["estado"] == "en_negociacion" and not fila.get("fecha_negociacion"):
            fila["fecha_negociacion"] = hoy
        if prop["estado"] == "reservada" and not fila.get("fecha_reservada"):
            fila["fecha_reservada"] = hoy

    return eventos


def _marcar_bajas(cartera: dict, vistos: set, hoy: str) -> list:
    """Las que estaban y hoy no aparecen se dan de baja, con una propuesta de que paso.

    Es SOLO una propuesta. Una propiedad tambien desaparece si vencio el contrato, si el
    dueño la retiro o si paso a otro agente. El desenlace lo confirma el usuario.
    """
    eventos = []
    for entity_id, fila in cartera.items():
        if entity_id in vistos or not fila.get("activa", True):
            continue
        estado = fila.get("estado")
        fila["activa"] = False
        fila["fecha_desaparicion"] = hoy
        fila["estado_al_desaparecer"] = estado
        fila["desenlace_propuesto"] = "vendida" if estado == "reservada" else "caida"
        eventos.append(_evento("baja", fila, hoy, {
            "estado_al_desaparecer": estado,
            "desenlace_propuesto": fila["desenlace_propuesto"],
            "precio": fila.get("precio"),
            "moneda": fila.get("moneda"),
        }))
    return eventos


def _detectar_duplicados(cartera: dict, vistos: set, hoy: str) -> list:
    """Misma direccion y mismo precio = probablemente la misma propiedad publicada dos veces
    (por ejemplo una como casa y otra como local). Pasa de verdad y, si no se detecta,
    infla la proyeccion de la cartera.

    Es una sugerencia: se avisa una sola vez y el usuario decide.
    """
    eventos = []
    por_clave: dict = {}
    for entity_id in sorted(vistos):
        fila = cartera[entity_id]
        clave = ((fila.get("direccion") or "").strip().lower(), fila.get("precio"))
        por_clave.setdefault(clave, []).append(entity_id)

    for ids in por_clave.values():
        if len(ids) < 2:
            continue
        principal, resto = ids[0], ids[1:]
        for otro in resto:
            if cartera[otro].get("posible_duplicado_de"):
                continue    # ya se aviso otro dia
            cartera[otro]["posible_duplicado_de"] = principal
            cartera[otro]["usar_en_proyeccion"] = False
            eventos.append(_evento("posible_duplicado", cartera[otro], hoy, {
                "duplicado_de": principal,
                "direccion": cartera[otro].get("direccion"),
                "precio": cartera[otro].get("precio"),
            }))
    return eventos


def _aplicar_overlay(cartera: dict, mis_datos: dict) -> None:
    """Superpone lo que el usuario edito desde la app (§3.3).

    La app NO escribe cartera.json: anota sus cambios en mis_datos.json, que es solo suyo.
    El robot los lee y los respeta, pero nunca los escribe. Asi los dos pueden trabajar el
    mismo dia sin pisarse.

    Se aplica al final, despues de detectar duplicados, para que la decision del usuario
    (por ejemplo volver a incluir en la proyeccion algo marcado como duplicado) sea la
    ultima palabra.
    """
    anotaciones = (mis_datos or {}).get("cartera") or {}
    for entity_id, campos in anotaciones.items():
        fila = cartera.get(entity_id)
        if not fila:
            continue    # anotacion de una propiedad que ya no existe
        for campo, valor in campos.items():
            if campo in CAMPOS_DEL_USUARIO:
                fila[campo] = valor


def procesar(cartera_previa: dict, propiedades_hoy: list, hoy: str, mis_datos: dict = None):
    """Devuelve (cartera_nueva, eventos_nuevos). No modifica cartera_previa."""
    cartera = {clave: dict(fila) for clave, fila in cartera_previa.items()}
    eventos = []
    primera_corrida = not cartera_previa
    vistos = set()

    for prop in propiedades_hoy:
        entity_id = prop["entity_id"]
        vistos.add(entity_id)
        if entity_id in cartera:
            eventos += _actualizar(cartera[entity_id], prop, hoy)
        else:
            cartera[entity_id] = _dar_de_alta(prop, hoy)
            # La primera corrida no son altas de verdad: son las que ya tenia publicadas.
            tipo = "carga_inicial" if primera_corrida else "alta"
            eventos.append(_evento(tipo, prop, hoy, {
                "precio": prop["precio"],
                "moneda": prop["moneda"],
                "estado": prop["estado"],
            }))

    eventos += _marcar_bajas(cartera, vistos, hoy)
    eventos += _detectar_duplicados(cartera, vistos, hoy)
    _aplicar_overlay(cartera, mis_datos)
    return cartera, eventos
