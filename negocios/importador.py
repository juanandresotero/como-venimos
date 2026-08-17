"""Convierte las filas del Excel en negocios completos, con sus avisos.

Reglas importantes (§9 de la especificacion):
- Antes de 2026 los numeros del Excel se respetan tal cual: RE/MAX cambio las reglas de
  comision varias veces y no tiene sentido recalcular con las de hoy.
- Desde enero de 2026 se recalcula con el motor nuevo, y si no coincide, se avisa.
- El importador NUNCA corrige solo, salvo un caso: cuando la diferencia es una coma decimal
  perdida (un factor exacto de 10, 100 o 1000). Todo lo demas se detecta y se avisa.
"""
from __future__ import annotations

from negocios import cruce, motor

YO = "Juan Andrés Otero"

# 'Origen' en el Excel mezcla dos cosas: de donde salio el cliente (marketing) y quien
# lo refirio (que determina la plata). Aca se separan.
ORIGENES = {
    "Bdr": ("captacion_mia", "BDR"),
    "Ref. Bdr": ("captacion_mia", "Referido - BDR"),
    "Redes Pago": ("captacion_mia", "Redes pagas"),
    "Cliente antiguo": ("captacion_mia", "Cliente antiguo"),
    "Ref. Martin": ("ref_martin", "Referido - Martín"),
    "Ref. Remax": ("ref_otro_colega", "Referido - RE/MAX"),
    "Ref. Team": ("ref_otro_colega", "Referido - Team"),
    "Ref. Clientes": ("ref_otro_colega", "Referido - cliente"),
}

TIPOS = {"Venta": "venta", "Alquiler": "alquiler"}

# Desde esta fecha se recalcula con las reglas de hoy; antes se respeta el Excel.
CORTE = "2026-01-01"

# Cuanto puede diferir una cuenta antes de considerarla un error y no un redondeo.
TOLERANCIA = 0.02

# Un porcentaje de comision por encima de esto no existe en la vida real: es un error
# de carga (un 2,625% escrito como 26,25 con formato de porcentaje se ve como 2625%).
COMISION_MAXIMA = {"venta": 0.20, "alquiler": 3.0, "renovacion_alquiler": 3.0, "suplencia": 0.20}

# Un facturado que difiere del esperado por un factor exacto de 10, 100 o 1000 no es un
# descuento: es una coma decimal que se perdio al cargar la celda.
FACTORES_DE_COMA = (10, 100, 1000)

# Los alquileres solo entran en contradiccion si la propiedad sigue publicada EN ALQUILER.
# Alquilar una propiedad y despues ponerla en venta es de lo mas normal.
FAMILIA_ALQUILER = ("alquiler", "renovacion_alquiler")


def _aviso(tipo: str, detalle: str) -> dict:
    return {"tipo": tipo, "detalle": detalle}


def _contar_puntas(fila: dict, avisos: list) -> int:
    vende, compra = fila.get("agente_vende"), fila.get("agente_compra")
    if not vende and not compra:
        avisos.append(_aviso("faltan_agentes", "No dice quien vendio ni quien compro"))
        return 0
    return int(vende == YO) + int(compra == YO)


def _clasificar_origen(fila: dict, puntas: int, avisos: list):
    origen = fila.get("origen")
    if origen not in ORIGENES:
        avisos.append(_aviso(
            "origen_sin_clasificar",
            f"El origen {origen!r} no esta en la tabla; hay que decidir como computa",
        ))
        return ("captacion_mia", origen or "Sin origen")

    regimen, etiqueta = ORIGENES[origen]
    # Si ninguna punta es mia pero el cliente salio de mi lado, el negocio se lo pase a un colega.
    if puntas == 0 and regimen == "captacion_mia":
        regimen = "yo_referi"
    return (regimen, etiqueta)


def traducir(fila: dict, ajustes: dict) -> dict:
    """Una fila del Excel -> un negocio, todavia sin la plata calculada."""
    avisos: list = []
    puntas = _contar_puntas(fila, avisos)
    regimen, origen_captacion = _clasificar_origen(fila, puntas, avisos)
    barrio = (fila.get("barrio") or "").strip()

    return {
        "id": f"excel-{fila['fila_excel']}",
        "entity_id_cartera": None,
        "tipo_negocio": TIPOS.get(fila.get("operacion"), fila.get("operacion")),
        "fecha_inicio": fila.get("fecha_inicio"),
        "fecha_boleto": fila.get("fecha_boleto"),
        "fecha_fin": fila.get("fecha_fin"),
        "fecha_fin_estimada": False,
        "direccion": fila.get("direccion"),
        # Se normaliza la primera letra: en el Excel conviven 'Cerrito' y 'cerrito',
        # y eso hacia contar 45 barrios donde en realidad hay 42.
        "barrio": barrio.capitalize() if barrio else "",
        "tipo_propiedad": None,
        "precio_operacion": fila.get("precio"),
        "moneda": "USD",
        "agente_vende": fila.get("agente_vende"),
        "agente_compra": fila.get("agente_compra"),
        "puntas": puntas,
        "origen_captacion": origen_captacion,
        "regimen_comision": regimen,
        "pct_comision_total": fila.get("pct_comision"),
        "base": None,
        "facturacion": None,
        "ganancia": None,
        "split_aplicado": fila.get("pct_agente"),
        "categoria_vigente": None,
        "estado": "cerrado",
        "recalculado": False,
        "ficha_completa": False,
        # Lo que decia el Excel, guardado aparte para poder comparar y mostrar las dos cifras.
        "excel_facturado": fila.get("facturado"),
        "excel_importe": fila.get("importe"),
        "avisos": avisos,
        "notas": "",
    }


def _es_coma_perdida(facturado: float, esperado: float):
    """Devuelve el valor corregido si la diferencia es una coma perdida, o None."""
    if not facturado or not esperado:
        return None
    for factor in FACTORES_DE_COMA:
        if abs(facturado / factor - esperado) <= max(0.01, abs(esperado) * 0.001):
            return facturado / factor
    return None


def _revisar_aritmetica(negocio: dict) -> None:
    """Compara precio x % contra lo que dice el Excel y decide si corregir o solo avisar."""
    precio = negocio["precio_operacion"]
    pct = negocio["pct_comision_total"]
    facturado = negocio["excel_facturado"]

    maximo = COMISION_MAXIMA.get(negocio["tipo_negocio"], 0.20)
    if pct is not None and pct > maximo:
        # El error esta en el %, no en el facturado. Se avisa y NO se toca nada mas:
        # si siguieramos, la correccion por coma perdida arruinaria el numero bueno.
        negocio["avisos"].append(_aviso(
            "comision_absurda",
            f"El % de comision dice {pct * 100:,.2f}%, imposible para un {negocio['tipo_negocio']}. "
            f"Suele ser una celda con formato de porcentaje mal puesto.",
        ))
        return

    if None in (precio, pct, facturado):
        return

    esperado = precio * pct
    if abs(esperado - facturado) <= max(1.0, abs(facturado) * TOLERANCIA):
        return    # cierra bien

    corregido = _es_coma_perdida(facturado, esperado)
    if corregido is not None:
        negocio["excel_facturado"] = corregido
        negocio["avisos"].append(_aviso(
            "separador_decimal",
            f"La celda dice {facturado:,.0f} pero la cuenta da {esperado:,.3f}: se perdio la "
            f"coma decimal. Se tomo {corregido:,.3f}. Conviene arreglarlo en el Excel.",
        ))
        return

    negocio["avisos"].append(_aviso(
        "aritmetica_no_cierra",
        f"Precio x % da {esperado:,.2f} pero el Excel dice {facturado:,.2f}. "
        f"Puede ser un descuento real o un error de tipeo.",
    ))


def calcular_plata(negocio: dict, ajustes: dict) -> dict:
    """Completa base, facturacion y ganancia segun la regla de corte de 2026 (§9.3)."""
    negocio["base"] = motor.base(negocio["precio_operacion"], negocio["pct_comision_total"])
    _revisar_aritmetica(negocio)

    fecha_fin = negocio["fecha_fin"]
    if not fecha_fin:
        negocio["avisos"].append(_aviso(
            "sin_fecha_fin",
            "Sin fecha de firma no se sabe a que año pertenece ni que reglas aplicarle",
        ))

    if not fecha_fin or fecha_fin < CORTE:
        # Antes de 2026 mandan los numeros del Excel: RE/MAX cambio las reglas de comision
        # varias veces y recalcular el pasado con las de hoy lo deformaria.
        negocio["facturacion"] = negocio["excel_facturado"]
        negocio["ganancia"] = negocio["excel_importe"]
        return negocio

    categoria, _ = motor.split_vigente(fecha_fin, ajustes)
    facturacion, ganancia = motor.calcular(
        negocio["regimen_comision"], negocio["base"], fecha_fin, ajustes
    )
    negocio["categoria_vigente"] = categoria
    negocio["recalculado"] = True
    negocio["facturacion"] = facturacion
    negocio["ganancia"] = ganancia

    viejo_f, viejo_g = negocio["excel_facturado"], negocio["excel_importe"]
    difiere_f = (viejo_f is not None
                 and abs(viejo_f - facturacion) > max(1.0, abs(facturacion) * TOLERANCIA))
    difiere_g = (viejo_g is not None and ganancia is not None
                 and abs(viejo_g - ganancia) > max(1.0, abs(ganancia) * TOLERANCIA))
    if difiere_f or difiere_g:
        negocio["avisos"].append(_aviso(
            "recalculo_distinto",
            f"El Excel dice facturado {viejo_f:,.2f} y ganancia {viejo_g:,.2f}; "
            f"con las reglas de 2026 da {facturacion:,.2f} y {ganancia:,.2f}. "
            f"Decidi cual vale.",
        ))
    return negocio


def cruzar_con_cartera(negocio: dict, cartera: dict) -> dict:
    """Si la propiedad del negocio sigue viva en la cartera, la firma no ocurrio.

    El usuario lo confirmo: anoto fechas de cobro futuras como si ya hubieran pasado.
    Aca eso se detecta solo y el negocio pasa a "en curso", que es lo que realmente es.
    """
    if not negocio["fecha_fin"] or negocio["fecha_fin"] < CORTE:
        return negocio    # el pasado ya se cobro; no tiene sentido cruzarlo

    candidatos = cruce.emparejar(negocio["direccion"], negocio["precio_operacion"], cartera)
    if not candidatos:
        return negocio

    mejor = candidatos[0]
    if mejor["confianza"] != "alta":
        negocio["avisos"].append(_aviso(
            "posible_cruce",
            f"Puede ser la propiedad {mejor['direccion_cartera']} ({mejor['estado_cartera']}), "
            f"por {' y '.join(mejor['motivos'])}. Confirmalo.",
        ))
        return negocio

    # Un alquiler cobrado sobre una propiedad que hoy esta en venta no es contradiccion.
    es_alquiler = negocio["tipo_negocio"] in FAMILIA_ALQUILER
    propiedad_en_alquiler = cartera[mejor["entity_id"]].get("operacion") == "alquiler"
    if es_alquiler and not propiedad_en_alquiler:
        negocio["entity_id_cartera"] = mejor["entity_id"]
        return negocio

    negocio["entity_id_cartera"] = mejor["entity_id"]
    negocio["estado"] = "en_curso"
    negocio["fecha_fin_estimada"] = True
    negocio["avisos"].append(_aviso(
        "firma_inventada",
        f"Figura firmado el {negocio['fecha_fin']}, pero {mejor['direccion_cartera']} sigue "
        f"'{mejor['estado_cartera']}' en RE/MAX. No esta cobrado: pone la fecha real cuando cobres.",
    ))
    return negocio


def revisar_faltantes(negocio: dict) -> dict:
    """Marca los datos que faltan. Si la ficha esta dada por completa, no molesta mas."""
    if negocio.get("ficha_completa"):
        return negocio

    if not negocio["fecha_inicio"]:
        negocio["avisos"].append(_aviso("falta_fecha_inicio", "Sin fecha de inicio no se puede medir el plazo"))
    if negocio["tipo_negocio"] == "venta" and not negocio["fecha_boleto"]:
        negocio["avisos"].append(_aviso("falta_fecha_boleto", "Falta la fecha del boleto"))
    if not negocio["direccion"]:
        negocio["avisos"].append(_aviso("falta_direccion", "Falta la direccion"))
    if not negocio["barrio"]:
        negocio["avisos"].append(_aviso("falta_barrio", "Falta el barrio"))
    return negocio


def revisar_fechas(negocio: dict, hoy: str) -> dict:
    """Firmas en el futuro y fechas dadas vuelta."""
    inicio, boleto, fin = negocio["fecha_inicio"], negocio["fecha_boleto"], negocio["fecha_fin"]

    if fin and fin > hoy:
        negocio["avisos"].append(_aviso(
            "firma_futura",
            f"La firma dice {fin}, que todavia no llego. Seguramente es una fecha estimada.",
        ))
    if inicio and boleto and boleto < inicio:
        negocio["avisos"].append(_aviso(
            "fechas_al_reves", f"El boleto ({boleto}) es anterior al inicio ({inicio})"))
    if boleto and fin and fin < boleto:
        negocio["avisos"].append(_aviso(
            "fechas_al_reves", f"La firma ({fin}) es anterior al boleto ({boleto})"))
    return negocio


def importar(filas: list, ajustes: dict, cartera: dict, hoy: str) -> list:
    """La cadena completa: fila del Excel -> negocio revisado, listo para guardar."""
    negocios = []
    for fila_excel in filas:
        negocio = traducir(fila_excel, ajustes)
        negocio = calcular_plata(negocio, ajustes)
        negocio = cruzar_con_cartera(negocio, cartera)
        negocio = revisar_fechas(negocio, hoy)
        negocio = revisar_faltantes(negocio)
        negocios.append(negocio)
    return negocios
