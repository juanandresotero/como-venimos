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

    # Los datos frescos de la API pisan a los viejos. Como `prop` solo trae los campos
    # que produce robot.modelo, los campos del usuario quedan intactos por construccion.
    fila.update(prop)
    fila["visto_ultima_vez"] = hoy
    fila["activa"] = True

    if precio_previo is not None and prop["precio"] != precio_previo:
        fila["historial_precio"].append(
            {"fecha": hoy, "precio": prop["precio"], "moneda": prop["moneda"]}
        )
        eventos.append(_evento("cambio_precio", prop, hoy, {
            "antes": precio_previo,
            "ahora": prop["precio"],
            "moneda": prop["moneda"],
        }))

    return eventos


def procesar(cartera_previa: dict, propiedades_hoy: list, hoy: str):
    """Devuelve (cartera_nueva, eventos_nuevos). No modifica cartera_previa."""
    cartera = {clave: dict(fila) for clave, fila in cartera_previa.items()}
    eventos = []
    primera_corrida = not cartera_previa

    for prop in propiedades_hoy:
        entity_id = prop["entity_id"]
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

    return cartera, eventos
