"""Los indices para reajustar alquileres: el IPC y el coeficiente legal.

Un alquiler se reajusta UNA VEZ AL ANO, el mes en que el contrato cumple ano. Hay dos
formas y la ley decide cual:

  - Permiso de construccion ANTERIOR al 2/6/1968 -> Ley 14.219, coeficiente obligatorio.
  - Desde esa fecha -> libre contratacion: manda lo que diga el contrato (casi siempre IPC).

El coeficiente NO es un numero suelto: el articulo 15 de la 14.219 dice que es la MENOR
entre la variacion del IPC y la de la URA en doce meses, mirando el mes previo contra el
mismo mes del ano anterior. Por eso el coeficiente de agosto sale del IPC de julio.

De ahi salen las dos reglas que este modulo hace cumplir:

  1. El coeficiente NUNCA puede ser mayor que la variacion del IPC. Es el menor de dos
     numeros y el IPC es uno de ellos. Si alguna vez sale mayor, hay un error en la fuente
     y no se puede usar ese numero para cobrarle a nadie.
  2. Los dos numeros tienen que venir del mismo mes.

Esto no es paranoia de programador. La planilla oficial del MEF tiene, a agosto de 2026,
las filas corridas un mes desde marzo: publica 1,0425 donde va 1,0377. Sobre un alquiler
de $40.000 son casi $2.300 de mas en el ano, por contrato, sin que nadie se entere. Por eso
aca no se copia un numero: se cruza contra otra fuente antes de darlo por bueno.
"""
from __future__ import annotations

import io
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
]

# El INE escribe "Setiembre"; en otros lados aparece "Septiembre". Se prueban las dos.
OTRO_NOMBRE = {"setiembre": "septiembre"}

INE_IPC = "https://www5.ine.gub.uy/documents/Estad%C3%ADsticasecon%C3%B3micas/HTML/IPC/{anio}/IPC%20{mes}%20{anio}.html"
CAJA = "https://www.cajanotarial.org.uy/innovaportal/v/3481/1/innova.front/indice-de-reajuste-de-alquileres.html"
MEF = "https://www.gub.uy/ministerio-economia-finanzas/datos-y-estadisticas/datos/indicadores"

CABECERAS = {"User-Agent": "Mozilla/5.0 (como-venimos-robot)", "Accept": "*/*"}


def clave(anio: int, mes: int) -> str:
    return f"{anio:04d}-{mes:02d}"


def _numero(texto: str):
    """Con coma, la coma es el decimal y los puntos son miles. Sin coma, el punto decide.

    La planilla del MEF mezcla los dos estilos en la misma columna: "1.502,25" al lado de
    "1502.25". Convertir a lo bruto reemplazando comas por puntos deja "1.502.25", que no
    es un numero.
    """
    texto = (texto or "").strip()
    if not texto:
        return None
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    try:
        return float(texto)
    except ValueError:
        return None


def _sin_etiquetas(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


# ---------- El IPC, del informe mensual del INE ----------

_DOCE_MESES = re.compile(r"(?:en\s+los\s+)?[uú]ltimos\s+12\s+meses\s+(?:de\s+)?(\d+[.,]\d+)\s*%", re.I)


def variacion_ipc(html: str):
    """La variacion del IPC en doce meses, como coeficiente: 4,27% -> 1.0427.

    El informe del INE la dice con todas las letras ("en los ultimos 12 meses de 4,27%"),
    asi que no hay que interpretar ninguna tabla.
    """
    hallado = _DOCE_MESES.search(_sin_etiquetas(html))
    if not hallado:
        return None
    pct = _numero(hallado.group(1))
    return None if pct is None else round(1 + pct / 100, 6)


# ---------- El coeficiente publicado, de Caja Notarial ----------

_MES_SOLO = re.compile(
    r"^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)$",
    re.I,
)
_COEF = re.compile(r"^1[.,]\d{3,4}$")


def coeficientes_publicados(html: str) -> dict:
    """Los coeficientes mes a mes de la tabla de Caja Notarial.

    Se leen las celdas en orden: un ano suelto fija el ano en curso, un mes busca el primer
    numero que venga despues. Es fragil a proposito — si la tabla cambia de forma, devuelve
    menos filas y el robot lo nota, en vez de inventar valores.
    """
    celdas = [c.strip().replace("&nbsp;", "").strip() for c in _sin_etiquetas(html).split(" ")]
    celdas = [c for c in celdas if c]

    salida, anio = {}, None
    for i, celda in enumerate(celdas):
        if re.fullmatch(r"(19|20)\d\d", celda):
            anio = int(celda)
        if not _MES_SOLO.match(celda) or anio is None:
            continue
        nombre = celda.lower().replace("septiembre", "setiembre")
        for siguiente in celdas[i + 1:i + 4]:
            if _COEF.match(siguiente):
                salida[clave(anio, MESES.index(nombre) + 1)] = _numero(siguiente)
                break
    return salida


# ---------- Las series crudas, de la planilla del MEF ----------

_T = "urn:oasis:names:tc:opendocument:xmlns:table:1.0"
_O = "urn:oasis:names:tc:opendocument:xmlns:office:1.0"


def enlace_planilla(html: str):
    """El enlace al .ods dentro de la pagina del MEF.

    Cambia todos los meses (".../2026-08/Indices desde 2018 a agosto 2026.ods"), asi que
    guardarlo fijo se rompe solo. Y viene entre comillas simples, no dobles.
    """
    hallado = re.search(r"""href=['"]([^'"]+\.ods)['"]""", html)
    return hallado.group(1) if hallado else None


def series_planilla(ods: bytes) -> dict:
    """IPC, UR y URA mes a mes. Un .ods es un zip con un XML adentro: se abre con la
    biblioteca que ya trae Python, sin instalar nada.

    NO se lee la columna del coeficiente: es justamente la que esta corrida. De aca salen
    los indices crudos, que son los que sirven para controlar.
    """
    contenido = zipfile.ZipFile(io.BytesIO(ods)).read("content.xml")
    raiz = ET.fromstring(contenido)

    filas = []
    for fila in raiz.iter(f"{{{_T}}}table-row"):
        celdas = []
        for celda in fila.findall(f"{{{_T}}}table-cell"):
            repetida = int(celda.get(f"{{{_T}}}number-columns-repeated", 1))
            valor = celda.get(f"{{{_O}}}value")
            if valor is None:
                valor = "".join(celda.itertext()).strip()
            celdas.extend([valor] * min(repetida, 8))
        while celdas and celdas[-1] == "":
            celdas.pop()
        if celdas:
            filas.append(celdas)

    # El ano aparece una sola vez, en la fila de enero; los otros once meses lo heredan.
    salida, anio = {}, None
    for fila in filas[1:]:
        if re.fullmatch(r"(19|20)\d\d", fila[0].strip()):
            anio, resto = int(fila[0]), fila[1:]
        else:
            resto = fila
        if not resto or anio is None:
            continue
        nombre = resto[0].strip().lower().replace("septiembre", "setiembre")
        if nombre not in MESES:
            continue
        campos = (resto + [""] * 4)[1:4]
        salida[clave(anio, MESES.index(nombre) + 1)] = dict(
            zip(["ipc", "ur", "ura"], [_numero(x) for x in campos])
        )
    return salida


def mes_anterior(anio: int, mes: int, cuantos: int = 1):
    total = anio * 12 + (mes - 1) - cuantos
    return total // 12, total % 12 + 1


def variacion(series: dict, anio: int, mes: int, campo: str):
    """Cuanto subio un indice en doce meses, mirando el mes previo contra el ano anterior.

    Devuelve None si falta alguno de los dos extremos: es preferible no tener numero a
    tener uno armado con la mitad de los datos.
    """
    reciente = series.get(clave(*mes_anterior(anio, mes, 1)))
    antiguo = series.get(clave(*mes_anterior(anio, mes, 13)))
    if not reciente or not antiguo:
        return None
    de_ahora, de_antes = reciente.get(campo), antiguo.get(campo)
    if not de_ahora or not de_antes:
        return None
    return round(de_ahora / de_antes, 6)


def recalcular(series: dict, anio: int, mes: int):
    """El coeficiente segun el articulo 15: la MENOR entre la variacion del IPC y la de la
    URA. Es la cuenta que se usa para controlar lo que publican."""
    dos = [variacion(series, anio, mes, campo) for campo in ("ipc", "ura")]
    return None if None in dos else min(dos)


# ---------- El control ----------

# Cuanto se les perdona a dos fuentes que dicen lo mismo.
#
# El coeficiente se publica con cuatro decimales, pero la cuenta se rehace con un IPC que
# viene redondeado a dos (117,69). Ese redondeo solo ya mueve el resultado hasta un punto
# del cuarto decimal: en la planilla de agosto de 2026 hay dos meses que difieren en 0,0001
# y estan los dos bien. Con 0,00015 esos pasan y el error de verdad —el mes corrido, que se
# va 0,0048— queda atrapado con treinta veces de margen.
TOLERANCIA = 0.00015


def revisar(coeficiente, ipc, recalculado=None) -> list:
    """Los avisos de un mes. Lista vacia quiere decir que el numero se puede usar."""
    avisos = []
    if coeficiente is None:
        return ["falta el coeficiente"]

    # La regla de oro: el coeficiente es el MENOR entre el IPC y la URA. No hay forma
    # legitima de que supere al IPC, asi que si lo supera, alguien publico mal.
    if ipc is not None and coeficiente > ipc + TOLERANCIA:
        avisos.append(
            f"el coeficiente ({coeficiente:.4f}) supera la variacion del IPC ({ipc:.4f}), "
            "y por el articulo 15 nunca puede"
        )

    if recalculado is not None and abs(coeficiente - recalculado) > TOLERANCIA:
        avisos.append(
            f"el coeficiente publicado ({coeficiente:.4f}) no coincide con la cuenta del "
            f"articulo 15 ({recalculado:.4f})"
        )
    return avisos


def armar(publicados: dict, ipcs: dict, series: dict, hoy: str) -> dict:
    """Lo que se guarda para la app: un renglon por mes, ya controlado.

    Cada mes lleva los dos numeros que el usuario puede elegir y si pasaron el control. Un
    mes con avisos igual se guarda: la app tiene que poder decir "esto no cierra" en vez de
    quedarse muda.
    """
    meses = {}
    for llave in sorted(set(publicados) | set(ipcs)):
        anio, mes = int(llave[:4]), int(llave[5:])
        coeficiente = publicados.get(llave)
        ipc = ipcs.get(llave)
        recalculado = recalcular(series, anio, mes) if series else None
        avisos = revisar(coeficiente, ipc, recalculado)
        meses[llave] = {
            "coeficiente": coeficiente,
            "ipc": ipc,
            "verificado": not avisos,
            "avisos": avisos,
        }
    return {"actualizado": hoy, "meses": meses}


# ---------- La parte que habla con internet ----------


def bajar(url: str, intentos: int = 3, espera: int = 5, binario: bool = False):
    """Pide una pagina con reintentos. Un corte de red no puede tumbar la corrida."""
    ultimo = None
    for intento in range(1, intentos + 1):
        try:
            pedido = urllib.request.Request(url, headers=CABECERAS)
            with urllib.request.urlopen(pedido, timeout=90) as respuesta:
                crudo = respuesta.read()
                return crudo if binario else crudo.decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            ultimo = error
            if intento < intentos:
                time.sleep(espera * intento)
    raise RuntimeError(f"No se pudo bajar {url} despues de {intentos} intentos: {ultimo}")


def url_informe_ipc(anio: int, mes: int) -> list:
    """Las direcciones a probar para el informe de un mes. Setiembre tiene dos nombres."""
    nombre = MESES[mes - 1]
    nombres = [nombre] + ([OTRO_NOMBRE[nombre]] if nombre in OTRO_NOMBRE else [])
    return [INE_IPC.format(anio=anio, mes=n.capitalize()) for n in nombres]


def traer(hoy: str, previos: dict = None, cuantos_meses: int = 18) -> dict:
    """Junta las tres fuentes y devuelve lo que se guarda para la app.

    Se piden los informes del INE de los ultimos meses de a uno: cada uno es un archivo de
    5 MB con los graficos adentro, asi que no se traen los 108 meses de la historia. Con
    dieciocho alcanza — un contrato ajusta una vez al ano, y si alguien viene con un atraso
    de mas de un ano el problema no es el numero.

    Si una fuente falla, se sigue con las otras. La app tiene los dos numeros por mes y
    puede mostrar el que tenga, diciendo que del otro no hay dato.
    """
    anio, mes = int(hoy[:4]), int(hoy[5:7])

    try:
        publicados = coeficientes_publicados(bajar(CAJA))
    except (RuntimeError, ValueError):
        publicados = {}

    series = {}
    try:
        enlace = enlace_planilla(bajar(MEF))
        if enlace:
            series = series_planilla(bajar(enlace, binario=True))
    except (RuntimeError, ValueError, zipfile.BadZipFile, ET.ParseError):
        series = {}

    # El coeficiente de un mes sale del IPC del mes ANTERIOR, asi que el informe que hay
    # que buscar para el mes M es el de M-1.
    #
    # Cada informe del INE pesa 5 MB porque trae los graficos adentro, y el robot corre
    # todos los dias. Por eso solo se piden los meses que faltan: un mes que ya se bajo no
    # cambia nunca mas.
    sabidos = {m: d.get("ipc") for m, d in (previos or {}).get("meses", {}).items()}
    ipcs = {m: v for m, v in sabidos.items() if v}

    for atras in range(cuantos_meses):
        a, m = mes_anterior(anio, mes, atras)
        if ipcs.get(clave(a, m)):
            continue
        for url in url_informe_ipc(*mes_anterior(a, m, 1)):
            try:
                valor = variacion_ipc(bajar(url, intentos=2))
            except RuntimeError:
                continue
            if valor:
                ipcs[clave(a, m)] = valor
                break
        else:
            # El INE no publico el informe de ese mes —a agosto de 2026 falta el de mayo—.
            # La planilla del MEF trae el IPC crudo, asi que la variacion se saca igual.
            desde_planilla = variacion(series, a, m, "ipc")
            if desde_planilla:
                ipcs[clave(a, m)] = desde_planilla

    return armar(publicados, ipcs, series, hoy)
