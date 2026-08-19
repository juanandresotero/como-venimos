"""Los padrones de Montevideo, para poder averiguarlos desde la direccion.

La Intendencia publica "Direcciones oficiales de Montevideo": 377.583 puntos con calle,
numero de puerta y PADRON. No hay ningun servicio al que preguntarle de a uno — hay que
bajarse la tabla entera y armarse el indice. Eso es lo que hace este modulo.

Verificado contra un caso real: Pantaleon Perez 4782 -> padron 62295, que es el que el
usuario habia escrito a mano en una carta oferta de verdad.

SOLO MONTEVIDEO. Los otros departamentos no publican nada equivalente; Canelones tiene un
visor para consultar de a uno y nada descargable. Cuando la direccion es de otro lado, la
app lo dice y ofrece abrir el visor oficial.

El indice se parte en 48 pedazos parejos: el telefono baja solo el que necesita (unos
80 KB) en vez de un archivo de 3,9 MB. Se reparte con una cuenta y no por letra inicial
porque por letra queda desparejo — muchas calles empiezan con "AV" o "CNO" y esos dos
archivos se llevaban la quinta parte del total.
"""

from __future__ import annotations

import json
import pathlib
import re
import struct
import unicodedata
import urllib.request
import zipfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "datos" / "padrones"

# El generador arma el zip del lado del servidor y despues redirige a el. Son dos pedidos:
# el primero lo construye, el segundo lo baja.
GENERAR = ("https://intgis.montevideo.gub.uy/sit/php/common/datos/"
           "generar_zip2.php?nom_tab=v_mdg_accesos&tipo=gis")
BAJAR = "https://intgis.montevideo.gub.uy/sit/tmp/v_mdg_accesos.zip"


def sin_tildes(texto: str) -> str:
    """Para comparar. 'MAROÑAS' y 'MARONAS' tienen que encontrarse igual."""
    plano = unicodedata.normalize("NFD", texto.upper())
    return "".join(c for c in plano if unicodedata.category(c) != "Mn")


def normalizar(calle: str) -> str:
    """La forma con la que se busca: sin tildes, sin puntos y sin espacios de mas."""
    return re.sub(r"\s+", " ", sin_tildes(calle).replace(".", " ")).strip()


GRUPOS = 48

def grupo_de(calle: str) -> str:
    """En que archivo cae. La cuenta esta escrita igual en lib/padrones.js: si las dos no
    dan el mismo numero, la app busca en el archivo equivocado y no encuentra nada."""
    h = 0
    for letra in normalizar(calle):
        h = (h * 31 + ord(letra)) % 1000003
    return f"{h % GRUPOS:02d}"


def leer_dbf(ruta: pathlib.Path) -> list[dict]:
    """Lee un .dbf con la biblioteca estandar. Es un formato viejo y simple: una cabecera
    que dice cuantos registros hay y de que largo, y despues los datos de corrido."""
    with ruta.open("rb") as f:
        cabecera = f.read(32)
        registros, largo_cabecera, largo_registro = struct.unpack("<I H H", cabecera[4:12])
        campos = []
        while True:
            c = f.read(32)
            if c[0:1] in (b"\r", b""):
                break
            campos.append((c[:11].split(b"\x00")[0].decode("latin1"), c[16]))
        f.seek(largo_cabecera)
        crudo = f.read(registros * largo_registro)

    posiciones, pos = {}, 1   # el byte 0 de cada registro es la marca de borrado
    for nombre, largo in campos:
        posiciones[nombre] = (pos, largo)
        pos += largo

    filas = []
    for i in range(registros):
        base = i * largo_registro
        if crudo[base:base + 1] == b"*":      # registro borrado
            continue
        fila = {}
        for nombre, (desde, largo) in posiciones.items():
            fila[nombre] = crudo[base + desde:base + desde + largo].decode("utf-8", "replace").strip()
        filas.append(fila)
    return filas


def bajar(destino: pathlib.Path) -> pathlib.Path:
    urllib.request.urlopen(GENERAR, timeout=300).read()      # lo arma del otro lado
    with urllib.request.urlopen(BAJAR, timeout=600) as r:
        destino.write_bytes(r.read())
    return destino


def construir(filas: list[dict]) -> dict[str, dict[str, dict[str, str]]]:
    """De la tabla cruda al indice: por grupo, por calle, numero -> padron."""
    por_grupo: dict[str, dict[str, dict[str, str]]] = {}
    for fila in filas:
        calle = fila.get("NOM_CALLE", "").strip()
        numero = fila.get("NUM_PUERTA", "").strip()
        padron = fila.get("PADRON", "").strip()
        if not (calle and numero and padron):
            continue
        grupo = por_grupo.setdefault(grupo_de(calle), {})
        grupo.setdefault(normalizar(calle), {})[numero] = padron
    return por_grupo


def escribir(por_grupo, nombres_reales: dict[str, str], destino: pathlib.Path = DESTINO) -> dict:
    destino.mkdir(parents=True, exist_ok=True)
    for viejo in destino.glob("*.json"):
        viejo.unlink()

    calles = []
    for grupo, contenido in sorted(por_grupo.items()):
        compacto = {
            calle: ";".join(f"{n}:{p}" for n, p in sorted(puertas.items(), key=lambda x: int(x[0])))
            for calle, puertas in contenido.items()
        }
        (destino / f"{grupo}.json").write_text(
            json.dumps(compacto, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        for calle in contenido:
            calles.append(nombres_reales.get(calle, calle))

    calles.sort()
    (destino / "calles.json").write_text(
        json.dumps(calles, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    pesos = {p.name: p.stat().st_size for p in destino.glob("*.json")}
    return {
        "calles": len(calles),
        "direcciones": sum(len(v) for g in por_grupo.values() for v in g.values()),
        "archivos": len(pesos),
        "peso_total_kb": round(sum(pesos.values()) / 1024),
        "archivo_mas_grande_kb": round(max(pesos.values()) / 1024),
    }


def actualizar(zip_local: pathlib.Path | None = None) -> dict:
    """Baja (o usa uno ya bajado), arma el indice y lo escribe en datos/padrones/."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        carpeta = pathlib.Path(tmp)
        z = zip_local or bajar(carpeta / "accesos.zip")
        with zipfile.ZipFile(z) as zf:
            zf.extractall(carpeta)
        dbf = next(p for p in carpeta.iterdir() if p.suffix.lower() == ".dbf")
        filas = leer_dbf(dbf)

    nombres_reales = {}
    for fila in filas:
        calle = fila.get("NOM_CALLE", "").strip()
        if calle:
            nombres_reales.setdefault(normalizar(calle), calle)

    return escribir(construir(filas), nombres_reales)


if __name__ == "__main__":
    import sys
    local = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
    resumen = actualizar(local)
    for clave, valor in resumen.items():
        print(f"{clave}: {valor}")
