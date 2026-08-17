"""El motor de plata: cuanto factura RE/MAX y cuanto queda en el bolsillo.

Todo sale de una sola cuenta, la BASE (la comision inmobiliaria total del negocio), y de
ahi se reparte segun quien trajo el negocio. Son funciones puras: no leen archivos ni red.

Las reglas estan en §5 de la especificacion.
"""
from __future__ import annotations

# La renovacion de contrato se cobra como un alquiler; el porcentaje se ajusta a mano
# en cada negocio si el acuerdo fue otro.
FAMILIA = {
    "venta": "venta",
    "alquiler": "alquiler",
    "renovacion_alquiler": "alquiler",
    "suplencia": "venta",
}

REGIMENES = (
    "captacion_mia",
    "ref_martin",
    "ref_otro_colega",
    "yo_referi",
    "suplencia",
)


def pct_por_defecto(tipo_negocio: str, puntas: int, ajustes: dict):
    """El porcentaje optimo: 3%/6% en venta, 1/2 meses en alquiler.

    Es solo el punto de partida. En la vida real hay descuentos, montos fijos y
    "un punto menos" (33,33%), asi que en cada negocio el porcentaje es editable.
    """
    familia = FAMILIA.get(tipo_negocio, tipo_negocio)
    tabla = ajustes["defaults_comision"].get(familia)
    if not tabla:
        return None
    # Cero puntas (un referido saliente) igual tiene la comision del negocio detras.
    clave = "2" if puntas == 2 else "1"
    return tabla[clave]


def base(precio_operacion, pct_comision_total) -> float:
    """La comision inmobiliaria total del negocio, antes de repartir."""
    if precio_operacion is None or pct_comision_total is None:
        return 0.0
    return precio_operacion * pct_comision_total


def split_vigente(fecha: str, ajustes: dict):
    """Que categoria y que tajada regian en esa fecha. Devuelve (nombre, split) o (None, None).

    Lleva fechas porque si el usuario pasa a ALTO en junio, los negocios de enero a mayo
    tienen que seguir calculandose al 45%. Sin esto, un cambio de categoria deformaria
    todo el historico de un plumazo.
    """
    if not fecha:
        return (None, None)
    for categoria in ajustes.get("categorias", []):
        desde = categoria.get("desde")
        hasta = categoria.get("hasta")
        if desde and fecha < desde:
            continue
        if hasta and fecha > hasta:
            continue
        return (categoria["categoria"], categoria["split_pct"])
    return (None, None)


def calcular(regimen_comision: str, base_valor: float, fecha_fin: str, ajustes: dict):
    """Devuelve (facturacion, ganancia) para un negocio.

    Si en esa fecha no habia categoria configurada, la ganancia vuelve None: significa
    "no lo recalcules, usa el numero que ya venia del Excel" (§9.3 de la especificacion).
    """
    if regimen_comision not in REGIMENES:
        raise ValueError(
            f"Regimen de comision desconocido: {regimen_comision!r}. "
            f"Los validos son: {', '.join(REGIMENES)}"
        )

    _, split = split_vigente(fecha_fin, ajustes)

    if regimen_comision == "suplencia":
        # Cubrir una visita a un colega no pasa por RE/MAX: no hay facturacion, y el
        # 12,5% va entero al bolsillo sin repartir con la oficina.
        return (0.0, base_valor * ajustes["pct_suplencia"])

    if regimen_comision == "ref_martin":
        # Arreglo fijo con esa persona: no escala con RAP/ALTO/PURO.
        regla = ajustes["regla_martin"]
        return (base_valor * regla["facturacion"], base_valor * regla["ganancia"])

    if regimen_comision == "captacion_mia":
        facturacion = base_valor
        ganancia = None if split is None else split * base_valor
        return (facturacion, ganancia)

    if regimen_comision == "ref_otro_colega":
        # Factura el total y paga el referido de la comision bruta; sobre el resto va su tajada.
        facturacion = base_valor
        resto = ajustes["pct_referido_entrante_otro"]
        ganancia = None if split is None else split * resto * base_valor
        return (facturacion, ganancia)

    # yo_referi: solo factura su parte de referido, y sobre eso va su tajada.
    parte = ajustes["pct_referido_saliente"]
    facturacion = base_valor * parte
    ganancia = None if split is None else split * facturacion
    return (facturacion, ganancia)
