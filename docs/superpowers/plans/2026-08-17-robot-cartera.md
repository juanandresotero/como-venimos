# Robot de cartera — Plan de implementación (Fase 1 de 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un robot que corre solo una vez por día, baja la cartera publicada de RE/MAX y deja anotado en archivos JSON qué pasó con cada propiedad: altas, cambios de precio, pasos a negociación o reserva, y bajas con su desenlace propuesto.

**Architecture:** Cinco módulos Python chicos, cada uno con un solo trabajo. `api.py` es el único que toca la red; `modelo.py` y `procesar.py` son funciones puras (entra un diccionario, sale otro) y por eso se prueban solas sin internet; `almacen.py` es el único que toca el disco; `main.py` los pega. GitHub Actions lo despierta cada día y commitea los datos nuevos.

**Tech Stack:** Python 3.13, **solo librería estándar** (`urllib`, `json`, `datetime`, `unittest`). Sin instalar nada, igual que el proyecto *Parecidas*. GitHub Actions + repositorio Git.

**Spec de referencia:** [`docs/superpowers/specs/2026-08-17-como-venimos-design.md`](../specs/2026-08-17-como-venimos-design.md) — este plan implementa §3, §4.1 y §6.

> **Nota de entorno.** El equipo es Windows. Todos los comandos de este plan están escritos
> en sintaxis POSIX (`DRY_RUN=1 python ...`, `printf`, `mkdir -p`) y hay que correrlos con la
> herramienta **Bash** (Git Bash), no con PowerShell. En PowerShell las variables de entorno
> en línea no existen: sería `$env:DRY_RUN=1; python -m robot.main`.

---

## Alcance de esta fase

**Entra:** el robot, sus tests, la corrida diaria automática y los tres archivos de datos.

**No entra** (van en las fases 2, 3 y 4): la interfaz web, el import del Excel, la pantalla de Salud del Negocio, la de Cartera y la calculadora de renta. Al terminar esta fase **no hay nada para mirar en el celular todavía** — hay un robot grabando historia todos los días, que es lo único que no se puede recuperar si se posterga.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `robot/api.py` | Hablar con RE/MAX. Lo único que toca la red. |
| `robot/modelo.py` | Traducir una propiedad cruda de la API a nuestro formato. Función pura. |
| `robot/procesar.py` | Comparar lo de hoy contra lo de ayer y producir la cartera nueva + las novedades. Función pura. |
| `robot/almacen.py` | Leer y escribir los JSON. Lo único que toca el disco. |
| `robot/main.py` | Orquestar: bajar → traducir → comparar → guardar. |
| `datos/cartera.json` | Estado acumulado de cada propiedad. |
| `datos/eventos.json` | Bitácora de novedades, se agrega al final, nunca se borra. |
| `datos/estado_robot.json` | Si la última corrida salió bien y cuándo fue. |

---

## Task 1: Esqueleto del proyecto y fixture real de la API

**Files:**
- Create: `robot/__init__.py`
- Create: `tests/__init__.py`
- Create: `herramientas/grabar_fixture.py`
- Create: `tests/fixtures/respuesta_api.json` (generado)

- [ ] **Step 1: Crear las carpetas y los archivos vacíos de paquete**

```bash
cd "c:/Users/es_bi/OneDrive/Desktop/claude/Como venimos"
mkdir -p robot tests/fixtures herramientas datos
printf '' > robot/__init__.py
printf '' > tests/__init__.py
```

- [ ] **Step 2: Escribir la herramienta que graba la respuesta real de la API**

Crear `herramientas/grabar_fixture.py`:

```python
"""Graba la respuesta real de la API de RE/MAX en tests/fixtures/respuesta_api.json.

Se corre a mano cuando queremos refrescar el ejemplo con el que se prueban los modulos.
Los tests NO llaman a la red: usan este archivo grabado.

Uso:  python herramientas/grabar_fixture.py
"""
from __future__ import annotations

import json
import pathlib

from robot import api

DESTINO = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "respuesta_api.json"


def main():
    crudo = api.bajar()
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    with open(DESTINO, "w", encoding="utf-8") as f:
        json.dump(crudo, f, ensure_ascii=False, indent=1)
        f.write("\n")
    cantidad = len(((crudo or {}).get("data") or {}).get("data") or [])
    print(f"Grabadas {cantidad} propiedades en {DESTINO}")


if __name__ == "__main__":
    raise SystemExit(main())
```

*(Todavía no se puede correr: `robot/api.py` se escribe en la Task 10. Se corre al final de esa tarea.)*

- [ ] **Step 3: Commit**

```bash
git add robot/__init__.py tests/__init__.py herramientas/grabar_fixture.py
git commit -m "chore: esqueleto del robot y herramienta para grabar el fixture"
```

---

## Task 2: `modelo.normalizar()` — traducir una propiedad de la API

La API habla inglés y mete los valores adentro de sub-objetos (`{"id": 1, "value": "sale"}`). Acá se traduce todo a nuestro formato, en castellano y plano.

**Files:**
- Create: `robot/modelo.py`
- Test: `tests/test_modelo.py`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/test_modelo.py`:

```python
import unittest

from robot import modelo

# Recorte real de la API (propiedad 31193, bajada el 2026-08-17).
LISTING = {
    "id": 31193,
    "entityId": "a355f1fe-efc5-4a5a-87a5-c6d33f82bd4f",
    "internalId": "940041154-217",
    "title": "Venta 2 casas en Maroñas con cochera y gran salón",
    "slug": "venta-2-casas-en-maronas-con-cochera-y-gran-salon",
    "operation": {"id": 1, "value": "sale"},
    "type": {"id": 9, "value": "casa"},
    "currency": {"id": 1, "value": "USD"},
    "expensesCurrency": {"id": 3, "value": "UYU"},
    "expensesPrice": None,
    "listingStatus": {"id": 1, "value": "active"},
    "price": 240000.0,
    "displayAddress": "Gobernador Vigodet 2700",
    "geoLabel": None,
    "location": {"type": "Point", "coordinates": [-56.1320319, -34.8604102]},
    "dimensionLand": 565,
    "dimensionTotalBuilt": 565,
    "dimensionCovered": 227,
    "bedrooms": 4,
    "bathrooms": 2,
    "totalRooms": 7,
    "photos": [{"rawValue": "listings/a355f1fe/03e41346"}],
}


class TestNormalizar(unittest.TestCase):
    def test_identidad_y_link(self):
        p = modelo.normalizar(LISTING)
        self.assertEqual(p["entity_id"], "a355f1fe-efc5-4a5a-87a5-c6d33f82bd4f")
        self.assertEqual(p["internal_id"], "940041154-217")
        self.assertEqual(p["listing_id"], 31193)
        self.assertEqual(
            p["link"],
            "https://www.remax.com.uy/listings/venta-2-casas-en-maronas-con-cochera-y-gran-salon",
        )

    def test_traduce_operacion_y_estado_al_castellano(self):
        p = modelo.normalizar(LISTING)
        self.assertEqual(p["operacion"], "venta")
        self.assertEqual(p["estado"], "publicada")

    def test_traduce_los_otros_estados(self):
        for api_dice, esperado in (
            ("negotiation", "en_negociacion"),
            ("reserved", "reservada"),
        ):
            crudo = dict(LISTING, listingStatus={"id": 9, "value": api_dice})
            self.assertEqual(modelo.normalizar(crudo)["estado"], esperado)

    def test_traduce_alquiler(self):
        crudo = dict(LISTING, operation={"id": 2, "value": "rent"})
        self.assertEqual(modelo.normalizar(crudo)["operacion"], "alquiler")

    def test_precio_moneda_y_medidas(self):
        p = modelo.normalizar(LISTING)
        self.assertEqual(p["precio"], 240000.0)
        self.assertEqual(p["moneda"], "USD")
        self.assertEqual(p["m2_terreno"], 565)
        self.assertEqual(p["m2_cubierto"], 227)
        self.assertEqual(p["dormitorios"], 4)
        self.assertEqual(p["banos"], 2)

    def test_coordenadas_vienen_al_reves(self):
        # La API usa GeoJSON: [longitud, latitud]. Nosotros guardamos lat y lon aparte.
        p = modelo.normalizar(LISTING)
        self.assertAlmostEqual(p["lat"], -34.8604102)
        self.assertAlmostEqual(p["lon"], -56.1320319)

    def test_barrio_sale_del_primer_segmento_del_geolabel(self):
        crudo = dict(LISTING, geoLabel="Malvin norte, Malvin norte, Montevideo")
        self.assertEqual(modelo.normalizar(crudo)["barrio"], "Malvin norte")

    def test_barrio_vacio_cuando_no_hay_geolabel(self):
        self.assertEqual(modelo.normalizar(LISTING)["barrio"], "")

    def test_foto_de_portada(self):
        self.assertEqual(modelo.normalizar(LISTING)["foto_portada"], "listings/a355f1fe/03e41346")

    def test_sin_fotos_no_revienta(self):
        crudo = dict(LISTING, photos=[])
        self.assertIsNone(modelo.normalizar(crudo)["foto_portada"])

    def test_sin_coordenadas_no_revienta(self):
        crudo = dict(LISTING, location=None)
        p = modelo.normalizar(crudo)
        self.assertIsNone(p["lat"])
        self.assertIsNone(p["lon"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_modelo -v`
Expected: FAIL con `ImportError: cannot import name 'modelo' from 'robot'`

- [ ] **Step 3: Escribir la implementación**

Crear `robot/modelo.py`:

```python
"""Traduce una propiedad como la devuelve la API de RE/MAX a nuestro formato.

Es una traduccion pura: entra un diccionario crudo, sale un diccionario nuestro.
No toca ni la red ni el disco, asi que se puede probar sola y sin internet.
"""
from __future__ import annotations

BASE_WEB = "https://www.remax.com.uy/listings/"

# La API habla ingles; nosotros guardamos todo en castellano.
OPERACIONES = {"sale": "venta", "rent": "alquiler"}
ESTADOS = {"active": "publicada", "negotiation": "en_negociacion", "reserved": "reservada"}


def _valor(campo):
    """Varios campos vienen como {'id': 1, 'value': 'sale'}. Nos quedamos con el 'value'."""
    if isinstance(campo, dict):
        return campo.get("value")
    return None


def _barrio(geo_label):
    """geoLabel viene como 'Malvin norte, Malvin norte, Montevideo'. Sirve el primer pedazo."""
    if not geo_label:
        return ""
    return geo_label.split(",")[0].strip()


def _coordenadas(location):
    """OJO: la API usa GeoJSON, que pone [longitud, latitud]. Viene al reves de lo habitual."""
    coordenadas = (location or {}).get("coordinates") or []
    if len(coordenadas) < 2:
        return (None, None)
    return (coordenadas[1], coordenadas[0])


def _foto_portada(photos):
    if not photos:
        return None
    return photos[0].get("rawValue")


def normalizar(listing: dict) -> dict:
    lat, lon = _coordenadas(listing.get("location"))
    slug = listing.get("slug") or ""
    operacion = _valor(listing.get("operation"))
    estado = _valor(listing.get("listingStatus"))
    return {
        "entity_id": listing.get("entityId"),
        "internal_id": listing.get("internalId"),
        "listing_id": listing.get("id"),
        "titulo": listing.get("title"),
        "slug": slug,
        # El link se arma con el slug. OJO: si el aviso se edita, RE/MAX le cambia el slug,
        # por eso la identidad de una propiedad es el entity_id, nunca el link.
        "link": BASE_WEB + slug if slug else None,
        "operacion": OPERACIONES.get(operacion, operacion),
        "tipo": _valor(listing.get("type")),
        "precio": listing.get("price"),
        "moneda": _valor(listing.get("currency")),
        "gastos_comunes": listing.get("expensesPrice"),
        "moneda_gastos": _valor(listing.get("expensesCurrency")),
        "direccion": listing.get("displayAddress"),
        "barrio": _barrio(listing.get("geoLabel")),
        "lat": lat,
        "lon": lon,
        "m2_terreno": listing.get("dimensionLand"),
        "m2_total": listing.get("dimensionTotalBuilt"),
        "m2_cubierto": listing.get("dimensionCovered"),
        "dormitorios": listing.get("bedrooms"),
        "banos": listing.get("bathrooms"),
        "ambientes": listing.get("totalRooms"),
        "estado": ESTADOS.get(estado, estado),
        "foto_portada": _foto_portada(listing.get("photos")),
    }
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_modelo -v`
Expected: PASS — 11 tests OK

- [ ] **Step 5: Commit**

```bash
git add robot/modelo.py tests/test_modelo.py
git commit -m "feat: traducir una propiedad de la API de RE/MAX a nuestro formato"
```

---

## Task 3: `almacen` — leer y escribir los JSON

**Files:**
- Create: `robot/almacen.py`
- Test: `tests/test_almacen.py`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/test_almacen.py`:

```python
import json
import pathlib
import tempfile
import unittest

from robot import almacen


class TestAlmacen(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.carpeta = pathlib.Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_leer_devuelve_el_default_si_no_existe(self):
        self.assertEqual(almacen.leer_json("nada.json", {}, self.carpeta), {})
        self.assertEqual(almacen.leer_json("nada.json", [], self.carpeta), [])

    def test_escribir_y_volver_a_leer(self):
        datos = {"a": 1, "b": [1, 2, 3]}
        almacen.escribir_json("prueba.json", datos, self.carpeta)
        self.assertEqual(almacen.leer_json("prueba.json", None, self.carpeta), datos)

    def test_guarda_los_acentos_legibles(self):
        almacen.escribir_json("acentos.json", {"barrio": "Maroñas"}, self.carpeta)
        texto = (self.carpeta / "acentos.json").read_text(encoding="utf-8")
        self.assertIn("Maroñas", texto)

    def test_no_deja_archivos_temporales(self):
        almacen.escribir_json("prueba.json", {"a": 1}, self.carpeta)
        sobrantes = [p.name for p in self.carpeta.iterdir() if p.name.endswith(".tmp")]
        self.assertEqual(sobrantes, [])

    def test_crea_la_carpeta_si_no_existe(self):
        destino = self.carpeta / "nueva" / "subcarpeta"
        almacen.escribir_json("x.json", {"ok": True}, destino)
        self.assertTrue((destino / "x.json").exists())

    def test_escribe_ordenado_para_que_el_diff_de_git_sea_limpio(self):
        almacen.escribir_json("orden.json", {"z": 1, "a": 2}, self.carpeta)
        texto = (self.carpeta / "orden.json").read_text(encoding="utf-8")
        self.assertLess(texto.index('"a"'), texto.index('"z"'))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_almacen -v`
Expected: FAIL con `ImportError: cannot import name 'almacen' from 'robot'`

- [ ] **Step 3: Escribir la implementación**

Crear `robot/almacen.py`:

```python
"""Leer y escribir los archivos de datos. Lo unico que toca el disco.

La escritura es atomica: primero se escribe un .tmp y despues se renombra. Si se corta
la luz a mitad de camino, el archivo bueno queda intacto en vez de quedar cortado.

Se guarda ordenado por clave para que el diff de Git muestre solo lo que cambio de verdad
y no todo el archivo revuelto.
"""
from __future__ import annotations

import json
import os
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DATOS = RAIZ / "datos"


def leer_json(nombre: str, por_defecto, carpeta=None):
    carpeta = pathlib.Path(carpeta) if carpeta else DATOS
    ruta = carpeta / nombre
    if not ruta.exists():
        return por_defecto
    with open(ruta, encoding="utf-8") as archivo:
        return json.load(archivo)


def escribir_json(nombre: str, datos, carpeta=None) -> None:
    carpeta = pathlib.Path(carpeta) if carpeta else DATOS
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta = carpeta / nombre
    temporal = ruta.with_name(ruta.name + ".tmp")
    with open(temporal, "w", encoding="utf-8") as archivo:
        json.dump(datos, archivo, ensure_ascii=False, indent=1, sort_keys=True)
        archivo.write("\n")
    os.replace(temporal, ruta)
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_almacen -v`
Expected: PASS — 6 tests OK

- [ ] **Step 5: Commit**

```bash
git add robot/almacen.py tests/test_almacen.py
git commit -m "feat: leer y escribir los archivos de datos de forma atomica"
```

---

## Task 4: `procesar` — dar de alta propiedades nuevas

**Files:**
- Create: `robot/procesar.py`
- Test: `tests/test_procesar.py`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/test_procesar.py`:

```python
import unittest

from robot import procesar

HOY = "2026-08-18"
AYER = "2026-08-17"


def propiedad(entity_id="e1", precio=100000.0, estado="publicada", direccion="Calle Falsa 100"):
    """Una propiedad ya normalizada, como la deja robot.modelo."""
    return {
        "entity_id": entity_id,
        "internal_id": "940041154-1",
        "listing_id": 1,
        "titulo": "Casa linda",
        "slug": "casa-linda",
        "link": "https://www.remax.com.uy/listings/casa-linda",
        "operacion": "venta",
        "tipo": "casa",
        "precio": precio,
        "moneda": "USD",
        "gastos_comunes": None,
        "moneda_gastos": "UYU",
        "direccion": direccion,
        "barrio": "Cerrito",
        "lat": -34.8,
        "lon": -56.1,
        "m2_terreno": 300,
        "m2_total": 300,
        "m2_cubierto": 120,
        "dormitorios": 3,
        "banos": 1,
        "ambientes": 5,
        "estado": estado,
        "foto_portada": None,
    }


def tipos(eventos):
    return [e["tipo"] for e in eventos]


class TestAltas(unittest.TestCase):
    def test_la_primera_corrida_marca_carga_inicial_y_no_altas(self):
        # La primera vez todas las propiedades son "nuevas" para el robot, pero no son
        # nuevas para el usuario: las tiene publicadas hace meses. Se avisan distinto.
        cartera, eventos = procesar.procesar({}, [propiedad("e1"), propiedad("e2")], HOY)
        self.assertEqual(len(cartera), 2)
        self.assertEqual(tipos(eventos), ["carga_inicial", "carga_inicial"])

    def test_una_propiedad_nueva_sobre_cartera_existente_es_un_alta(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1")], AYER)
        cartera, eventos = procesar.procesar(cartera, [propiedad("e1"), propiedad("e2")], HOY)
        self.assertEqual(tipos(eventos), ["alta"])
        self.assertEqual(eventos[0]["entity_id"], "e2")

    def test_el_alta_guarda_las_fechas_y_el_historial_de_precio(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=240000.0)], HOY)
        fila = cartera["e1"]
        self.assertEqual(fila["visto_primera_vez"], HOY)
        self.assertEqual(fila["visto_ultima_vez"], HOY)
        self.assertTrue(fila["activa"])
        self.assertEqual(
            fila["historial_precio"],
            [{"fecha": HOY, "precio": 240000.0, "moneda": "USD"}],
        )

    def test_el_alta_deja_los_campos_del_usuario_vacios_y_listos_para_llenar(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1")], HOY)
        fila = cartera["e1"]
        self.assertIsNone(fila["origen_captacion"])
        self.assertIsNone(fila["desenlace_confirmado"])
        self.assertEqual(fila["notas"], "")
        self.assertTrue(fila["usar_en_proyeccion"])

    def test_la_fecha_de_captacion_arranca_igual_a_la_primera_vez_vista(self):
        # Es una estimacion: el usuario la corrige a mano si la tenia publicada de antes.
        cartera, _ = procesar.procesar({}, [propiedad("e1")], HOY)
        self.assertEqual(cartera["e1"]["fecha_captacion_real"], HOY)
        self.assertTrue(cartera["e1"]["fecha_captacion_estimada"])

    def test_si_nace_en_negociacion_o_reservada_se_anota_la_fecha(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="en_negociacion")], HOY)
        self.assertEqual(cartera["e1"]["fecha_negociacion"], HOY)
        cartera, _ = procesar.procesar({}, [propiedad("e2", estado="reservada")], HOY)
        self.assertEqual(cartera["e2"]["fecha_reservada"], HOY)

    def test_no_modifica_la_cartera_que_recibe(self):
        original = {}
        procesar.procesar(original, [propiedad("e1")], HOY)
        self.assertEqual(original, {})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_procesar -v`
Expected: FAIL con `ImportError: cannot import name 'procesar' from 'robot'`

- [ ] **Step 3: Escribir la implementación mínima**

Crear `robot/procesar.py`:

```python
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


def procesar(cartera_previa: dict, propiedades_hoy: list, hoy: str):
    """Devuelve (cartera_nueva, eventos_nuevos). No modifica cartera_previa."""
    cartera = {clave: dict(fila) for clave, fila in cartera_previa.items()}
    eventos = []
    primera_corrida = not cartera_previa

    for prop in propiedades_hoy:
        entity_id = prop["entity_id"]
        if entity_id not in cartera:
            cartera[entity_id] = _dar_de_alta(prop, hoy)
            # La primera corrida no son altas de verdad: son las que ya tenia publicadas.
            tipo = "carga_inicial" if primera_corrida else "alta"
            eventos.append(_evento(tipo, prop, hoy, {
                "precio": prop["precio"],
                "moneda": prop["moneda"],
                "estado": prop["estado"],
            }))

    return cartera, eventos
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_procesar -v`
Expected: PASS — 7 tests OK

- [ ] **Step 5: Commit**

```bash
git add robot/procesar.py tests/test_procesar.py
git commit -m "feat: dar de alta propiedades nuevas en la cartera"
```

---

## Task 5: `procesar` — cambios de precio

**Files:**
- Modify: `robot/procesar.py`
- Modify: `tests/test_procesar.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `tests/test_procesar.py`, antes del bloque `if __name__`:

```python
class TestCambioDePrecio(unittest.TestCase):
    def test_baja_de_precio_genera_evento_y_se_suma_al_historial(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=240000.0)], AYER)
        cartera, eventos = procesar.procesar(cartera, [propiedad("e1", precio=225000.0)], HOY)

        self.assertEqual(tipos(eventos), ["cambio_precio"])
        self.assertEqual(eventos[0]["detalle"], {
            "antes": 240000.0, "ahora": 225000.0, "moneda": "USD",
        })
        self.assertEqual(cartera["e1"]["historial_precio"], [
            {"fecha": AYER, "precio": 240000.0, "moneda": "USD"},
            {"fecha": HOY, "precio": 225000.0, "moneda": "USD"},
        ])

    def test_el_precio_actual_queda_actualizado(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=240000.0)], AYER)
        cartera, _ = procesar.procesar(cartera, [propiedad("e1", precio=225000.0)], HOY)
        self.assertEqual(cartera["e1"]["precio"], 225000.0)

    def test_mismo_precio_no_genera_nada(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=240000.0)], AYER)
        cartera, eventos = procesar.procesar(cartera, [propiedad("e1", precio=240000.0)], HOY)
        self.assertEqual(eventos, [])
        self.assertEqual(len(cartera["e1"]["historial_precio"]), 1)

    def test_se_actualiza_la_fecha_de_ultima_vez_vista(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1")], AYER)
        cartera, _ = procesar.procesar(cartera, [propiedad("e1")], HOY)
        self.assertEqual(cartera["e1"]["visto_primera_vez"], AYER)
        self.assertEqual(cartera["e1"]["visto_ultima_vez"], HOY)
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_procesar.TestCambioDePrecio -v`
Expected: FAIL — `AssertionError: [] != ['cambio_precio']`

- [ ] **Step 3: Escribir la implementación**

En `robot/procesar.py`, agregar la función `_actualizar` justo antes de `procesar`:

```python
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
```

Y en `procesar`, reemplazar el cuerpo del `for` por:

```python
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
```

- [ ] **Step 4: Correr todos los tests del módulo**

Run: `python -m unittest tests.test_procesar -v`
Expected: PASS — 11 tests OK

- [ ] **Step 5: Commit**

```bash
git add robot/procesar.py tests/test_procesar.py
git commit -m "feat: detectar cambios de precio y guardar el historial"
```

---

## Task 6: `procesar` — cambios de estado y sus fechas

**Files:**
- Modify: `robot/procesar.py`
- Modify: `tests/test_procesar.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `tests/test_procesar.py`:

```python
class TestCambioDeEstado(unittest.TestCase):
    def test_pasar_a_negociacion_avisa_y_anota_la_fecha(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="publicada")], AYER)
        cartera, eventos = procesar.procesar(
            cartera, [propiedad("e1", estado="en_negociacion")], HOY
        )
        self.assertEqual(tipos(eventos), ["cambio_estado"])
        self.assertEqual(eventos[0]["detalle"], {"antes": "publicada", "ahora": "en_negociacion"})
        self.assertEqual(cartera["e1"]["fecha_negociacion"], HOY)

    def test_pasar_a_reservada_anota_su_propia_fecha(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="en_negociacion")], AYER)
        cartera, _ = procesar.procesar(cartera, [propiedad("e1", estado="reservada")], HOY)
        self.assertEqual(cartera["e1"]["fecha_negociacion"], AYER)
        self.assertEqual(cartera["e1"]["fecha_reservada"], HOY)

    def test_la_fecha_de_negociacion_guarda_la_primera_vez_no_la_ultima(self):
        # Si va y vuelve de negociacion, nos interesa cuando entro por primera vez.
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="en_negociacion")], AYER)
        cartera, _ = procesar.procesar(cartera, [propiedad("e1", estado="publicada")], HOY)
        cartera, _ = procesar.procesar(
            cartera, [propiedad("e1", estado="en_negociacion")], "2026-08-19"
        )
        self.assertEqual(cartera["e1"]["fecha_negociacion"], AYER)

    def test_precio_y_estado_cambian_juntos_generan_dos_eventos(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=100000.0)], AYER)
        cartera, eventos = procesar.procesar(
            cartera, [propiedad("e1", precio=90000.0, estado="en_negociacion")], HOY
        )
        self.assertEqual(sorted(tipos(eventos)), ["cambio_estado", "cambio_precio"])
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_procesar.TestCambioDeEstado -v`
Expected: FAIL — `AssertionError: [] != ['cambio_estado']`

- [ ] **Step 3: Escribir la implementación**

En `robot/procesar.py`, dentro de `_actualizar`, guardar el estado previo al principio y agregar el bloque de estado antes del `return`:

```python
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
```

- [ ] **Step 4: Correr todos los tests del módulo**

Run: `python -m unittest tests.test_procesar -v`
Expected: PASS — 15 tests OK

- [ ] **Step 5: Commit**

```bash
git add robot/procesar.py tests/test_procesar.py
git commit -m "feat: detectar cambios de estado y anotar fechas de negociacion y reserva"
```

---

## Task 7: `procesar` — bajas con desenlace propuesto

Cuando una propiedad desaparece de RE/MAX, el robot **propone** qué pasó pero nunca decide: si estaba reservada lo más probable es que se haya vendido; si no, que se cayó. Lo confirma el usuario.

**Files:**
- Modify: `robot/procesar.py`
- Modify: `tests/test_procesar.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `tests/test_procesar.py`:

```python
class TestBajas(unittest.TestCase):
    def test_desaparecer_estando_reservada_propone_vendida(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="reservada")], AYER)
        cartera, eventos = procesar.procesar(cartera, [], HOY)

        self.assertEqual(tipos(eventos), ["baja"])
        self.assertEqual(eventos[0]["detalle"]["desenlace_propuesto"], "vendida")
        self.assertEqual(eventos[0]["detalle"]["estado_al_desaparecer"], "reservada")

    def test_desaparecer_estando_publicada_propone_caida(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="publicada")], AYER)
        cartera, eventos = procesar.procesar(cartera, [], HOY)
        self.assertEqual(eventos[0]["detalle"]["desenlace_propuesto"], "caida")

    def test_desaparecer_estando_en_negociacion_propone_caida(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="en_negociacion")], AYER)
        cartera, eventos = procesar.procesar(cartera, [], HOY)
        self.assertEqual(eventos[0]["detalle"]["desenlace_propuesto"], "caida")

    def test_la_baja_marca_la_fila_y_guarda_la_fecha(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="reservada")], AYER)
        cartera, _ = procesar.procesar(cartera, [], HOY)
        fila = cartera["e1"]
        self.assertFalse(fila["activa"])
        self.assertEqual(fila["fecha_desaparicion"], HOY)
        self.assertEqual(fila["estado_al_desaparecer"], "reservada")
        self.assertEqual(fila["desenlace_propuesto"], "vendida")

    def test_no_avisa_dos_veces_por_la_misma_baja(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1")], AYER)
        cartera, _ = procesar.procesar(cartera, [], HOY)
        cartera, eventos = procesar.procesar(cartera, [], "2026-08-19")
        self.assertEqual(eventos, [])

    def test_la_propiedad_dada_de_baja_no_se_borra(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1")], AYER)
        cartera, _ = procesar.procesar(cartera, [], HOY)
        self.assertIn("e1", cartera)

    def test_si_reaparece_se_limpia_la_baja_y_avisa(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1")], AYER)
        cartera, _ = procesar.procesar(cartera, [], HOY)
        cartera, eventos = procesar.procesar(cartera, [propiedad("e1")], "2026-08-19")

        self.assertIn("reaparecio", tipos(eventos))
        fila = cartera["e1"]
        self.assertTrue(fila["activa"])
        self.assertIsNone(fila["fecha_desaparicion"])
        self.assertIsNone(fila["desenlace_propuesto"])
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_procesar.TestBajas -v`
Expected: FAIL — `AssertionError: [] != ['baja']`

- [ ] **Step 3: Escribir la implementación**

En `robot/procesar.py`, agregar `_marcar_bajas` antes de `procesar`:

```python
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
```

En `_actualizar`, agregar el bloque de reaparición justo después de `fila["activa"] = True`:

```python
    # Si la habiamos dado de baja y volvio a aparecer, se limpia la baja.
    if fila.get("fecha_desaparicion"):
        fila["fecha_desaparicion"] = None
        fila["estado_al_desaparecer"] = None
        fila["desenlace_propuesto"] = None
        eventos.append(_evento("reaparecio", prop, hoy, {"estado": prop["estado"]}))
```

En `procesar`, llevar la cuenta de lo visto y llamar a `_marcar_bajas`:

```python
def procesar(cartera_previa: dict, propiedades_hoy: list, hoy: str):
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
    return cartera, eventos
```

- [ ] **Step 4: Correr todos los tests del módulo**

Run: `python -m unittest tests.test_procesar -v`
Expected: PASS — 22 tests OK

- [ ] **Step 5: Commit**

```bash
git add robot/procesar.py tests/test_procesar.py
git commit -m "feat: detectar bajas y proponer si se vendio o se cayo"
```

---

## Task 8: `procesar` — nunca pisar los campos del usuario

Este es el requisito más importante de todo el robot: si un día pisa lo que el usuario cargó a mano, se pierde trabajo que no se recupera. Va con su propio test.

**Files:**
- Modify: `tests/test_procesar.py`

- [ ] **Step 1: Escribir el test**

Agregar a `tests/test_procesar.py`:

```python
class TestCamposDelUsuario(unittest.TestCase):
    def _cartera_con_datos_cargados_a_mano(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=100000.0)], AYER)
        cartera["e1"].update({
            "fecha_captacion_real": "2025-03-01",
            "fecha_captacion_estimada": False,
            "origen_captacion": "BDR",
            "desenlace_confirmado": None,
            "usar_en_proyeccion": False,
            "notas": "El dueño viaja en enero",
        })
        return cartera

    def test_una_corrida_normal_no_pisa_nada_del_usuario(self):
        cartera = self._cartera_con_datos_cargados_a_mano()
        cartera, _ = procesar.procesar(cartera, [propiedad("e1", precio=90000.0)], HOY)
        fila = cartera["e1"]
        self.assertEqual(fila["fecha_captacion_real"], "2025-03-01")
        self.assertFalse(fila["fecha_captacion_estimada"])
        self.assertEqual(fila["origen_captacion"], "BDR")
        self.assertFalse(fila["usar_en_proyeccion"])
        self.assertEqual(fila["notas"], "El dueño viaja en enero")
        # ...y el dato del robot si se actualizo
        self.assertEqual(fila["precio"], 90000.0)

    def test_una_baja_tampoco_pisa_nada_del_usuario(self):
        cartera = self._cartera_con_datos_cargados_a_mano()
        cartera, _ = procesar.procesar(cartera, [], HOY)
        fila = cartera["e1"]
        self.assertEqual(fila["origen_captacion"], "BDR")
        self.assertEqual(fila["notas"], "El dueño viaja en enero")
        self.assertEqual(fila["fecha_captacion_real"], "2025-03-01")

    def test_una_reaparicion_tampoco_pisa_nada_del_usuario(self):
        cartera = self._cartera_con_datos_cargados_a_mano()
        cartera, _ = procesar.procesar(cartera, [], HOY)
        cartera, _ = procesar.procesar(cartera, [propiedad("e1")], "2026-08-19")
        self.assertEqual(cartera["e1"]["origen_captacion"], "BDR")
        self.assertEqual(cartera["e1"]["notas"], "El dueño viaja en enero")

    def test_el_desenlace_confirmado_por_el_usuario_le_gana_al_propuesto(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="publicada")], AYER)
        cartera, _ = procesar.procesar(cartera, [], HOY)
        # El robot propuso "caida"; el usuario dice que en realidad se vendio.
        cartera["e1"]["desenlace_confirmado"] = "vendida"
        cartera, _ = procesar.procesar(cartera, [], "2026-08-19")
        self.assertEqual(cartera["e1"]["desenlace_confirmado"], "vendida")
        self.assertEqual(cartera["e1"]["desenlace_propuesto"], "caida")

    def test_ningun_campo_del_usuario_aparece_en_lo_que_produce_el_modelo(self):
        # Garantia estructural: si robot.modelo devolviera alguno de estos campos,
        # fila.update(prop) lo pisaria. Este test lo impide para siempre.
        campos_del_modelo = set(propiedad().keys())
        for campo in procesar.CAMPOS_DEL_USUARIO:
            self.assertNotIn(campo, campos_del_modelo)
```

- [ ] **Step 2: Correr el test**

Run: `python -m unittest tests.test_procesar.TestCamposDelUsuario -v`
Expected: PASS — 5 tests OK (la implementación ya es correcta por construcción; este test la deja blindada)

- [ ] **Step 3: Verificar que el test detecta el problema si se rompe**

Editar temporalmente `tests/test_procesar.py` y agregar `"notas": "pisado"` adentro del diccionario que devuelve la función `propiedad()`.

Run: `python -m unittest tests.test_procesar.TestCamposDelUsuario -v`
Expected: FAIL en `test_una_corrida_normal_no_pisa_nada_del_usuario` y en `test_ningun_campo_del_usuario_aparece_en_lo_que_produce_el_modelo`

Deshacer ese cambio y volver a correr.
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/test_procesar.py
git commit -m "test: blindar que el robot nunca pise los datos cargados a mano"
```

---

## Task 9: `procesar` — posibles duplicados

Una misma propiedad publicada dos veces (una como casa y otra como local) infla la cartera. Verificado en la cartera real: `Gutenberg 6100` aparece dos veces a 490.000.

**Files:**
- Modify: `robot/procesar.py`
- Modify: `tests/test_procesar.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `tests/test_procesar.py`:

```python
class TestDuplicados(unittest.TestCase):
    def _dos_iguales(self):
        return [
            propiedad("e1", precio=490000.0, direccion="Gutenberg 6100"),
            propiedad("e2", precio=490000.0, direccion="Gutenberg 6100"),
        ]

    def test_misma_direccion_y_mismo_precio_avisa(self):
        cartera, eventos = procesar.procesar({}, self._dos_iguales(), HOY)
        duplicados = [e for e in eventos if e["tipo"] == "posible_duplicado"]
        self.assertEqual(len(duplicados), 1)
        self.assertEqual(duplicados[0]["entity_id"], "e2")
        self.assertEqual(duplicados[0]["detalle"]["duplicado_de"], "e1")

    def test_el_duplicado_queda_fuera_de_la_proyeccion_por_defecto(self):
        cartera, _ = procesar.procesar({}, self._dos_iguales(), HOY)
        self.assertTrue(cartera["e1"]["usar_en_proyeccion"])
        self.assertFalse(cartera["e2"]["usar_en_proyeccion"])
        self.assertEqual(cartera["e2"]["posible_duplicado_de"], "e1")

    def test_no_avisa_de_nuevo_al_dia_siguiente(self):
        cartera, _ = procesar.procesar({}, self._dos_iguales(), AYER)
        cartera, eventos = procesar.procesar(cartera, self._dos_iguales(), HOY)
        self.assertEqual([e for e in eventos if e["tipo"] == "posible_duplicado"], [])

    def test_si_el_usuario_dijo_que_no_es_duplicado_se_respeta(self):
        cartera, _ = procesar.procesar({}, self._dos_iguales(), AYER)
        cartera["e2"]["usar_en_proyeccion"] = True   # el usuario lo volvio a prender
        cartera, _ = procesar.procesar(cartera, self._dos_iguales(), HOY)
        self.assertTrue(cartera["e2"]["usar_en_proyeccion"])

    def test_direcciones_distintas_no_son_duplicado(self):
        propiedades = [
            propiedad("e1", precio=490000.0, direccion="Gutenberg 6100"),
            propiedad("e2", precio=490000.0, direccion="Otra calle 200"),
        ]
        _, eventos = procesar.procesar({}, propiedades, HOY)
        self.assertEqual([e for e in eventos if e["tipo"] == "posible_duplicado"], [])

    def test_mayusculas_y_espacios_no_impiden_detectarlo(self):
        propiedades = [
            propiedad("e1", precio=490000.0, direccion="Gutenberg 6100"),
            propiedad("e2", precio=490000.0, direccion="  GUTENBERG 6100 "),
        ]
        _, eventos = procesar.procesar({}, propiedades, HOY)
        self.assertEqual(len([e for e in eventos if e["tipo"] == "posible_duplicado"]), 1)
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_procesar.TestDuplicados -v`
Expected: FAIL — `AssertionError: 0 != 1`

- [ ] **Step 3: Escribir la implementación**

En `robot/procesar.py`, agregar `_detectar_duplicados` antes de `procesar`:

```python
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
```

En `procesar`, agregar la llamada justo antes del `return`:

```python
    eventos += _marcar_bajas(cartera, vistos, hoy)
    eventos += _detectar_duplicados(cartera, vistos, hoy)
    return cartera, eventos
```

- [ ] **Step 4: Correr todos los tests del módulo**

Run: `python -m unittest tests.test_procesar -v`
Expected: PASS — 33 tests OK

- [ ] **Step 5: Commit**

```bash
git add robot/procesar.py tests/test_procesar.py
git commit -m "feat: avisar de propiedades publicadas dos veces"
```

---

## Task 10: `api` — bajar la cartera de RE/MAX

**Files:**
- Create: `robot/api.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/test_api.py`:

```python
import unittest
from unittest import mock

from robot import api


def respuesta(listings, total=None):
    return {"data": {"data": listings, "totalItems": total if total is not None else len(listings)}}


class TestTraerListings(unittest.TestCase):
    def test_devuelve_la_lista_de_propiedades(self):
        with mock.patch.object(api, "bajar", return_value=respuesta([{"id": 1}, {"id": 2}])):
            self.assertEqual(api.traer_listings(), [{"id": 1}, {"id": 2}])

    def test_cartera_vacia_no_revienta(self):
        with mock.patch.object(api, "bajar", return_value=respuesta([])):
            self.assertEqual(api.traer_listings(), [])

    def test_respuesta_rara_devuelve_lista_vacia(self):
        with mock.patch.object(api, "bajar", return_value={}):
            self.assertEqual(api.traer_listings(), [])

    def test_falla_si_la_api_dice_que_hay_mas_de_las_que_mando(self):
        # Proteccion contra paginado silencioso: si algun dia tiene mas de 200 propiedades,
        # preferimos que reviente antes que grabar una cartera incompleta y dar de baja
        # propiedades que en realidad estan vivas.
        with mock.patch.object(api, "bajar", return_value=respuesta([{"id": 1}], total=250)):
            with self.assertRaises(RuntimeError) as caso:
                api.traer_listings()
        self.assertIn("250", str(caso.exception))


def respuesta_http(cuerpo: bytes):
    """Imita lo que devuelve urlopen: un context manager con .read()."""
    contexto = mock.MagicMock()
    contexto.__enter__.return_value.read.return_value = cuerpo
    contexto.__exit__.return_value = False
    return contexto


class TestBajar(unittest.TestCase):
    def test_reintenta_y_termina_bien(self):
        intentos = []

        def falla_la_primera(pedido, timeout=None):
            intentos.append(1)
            if len(intentos) == 1:
                raise TimeoutError("se colgo")
            return respuesta_http(b'{"ok": true}')

        with mock.patch("urllib.request.urlopen", side_effect=falla_la_primera), \
             mock.patch("time.sleep"):
            self.assertEqual(api.bajar(intentos=3, espera=0), {"ok": True})
        self.assertEqual(len(intentos), 2)

    def test_json_roto_tambien_reintenta(self):
        # Un JSON cortado a la mitad tiene que reintentarse igual que un corte de red.
        respuestas = [respuesta_http(b'{"ok": tru'), respuesta_http(b'{"ok": true}')]
        with mock.patch("urllib.request.urlopen", side_effect=respuestas), \
             mock.patch("time.sleep"):
            self.assertEqual(api.bajar(intentos=3, espera=0), {"ok": True})

    def test_si_falla_siempre_avisa_con_un_error_claro(self):
        with mock.patch("urllib.request.urlopen", side_effect=TimeoutError("se colgo")), \
             mock.patch("time.sleep"):
            with self.assertRaises(RuntimeError) as caso:
                api.bajar(intentos=2, espera=0)
        self.assertIn("2 intentos", str(caso.exception))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_api -v`
Expected: FAIL con `ImportError: cannot import name 'api' from 'robot'`

- [ ] **Step 3: Escribir la implementación**

Crear `robot/api.py`:

```python
"""Lo unico que habla con RE/MAX.

La API es publica: no hay claves ni secretos. Se piden las propiedades del asociado
en una sola tanda; si algun dia son mas de las que entran, el codigo revienta a proposito
en vez de grabar una cartera incompleta (ver traer_listings).
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

ASOCIADO = "385bebaf-55e1-4fcb-85e6-10f6619d635e"   # Juan Andres Otero
PAGINA = 200

URL = (
    "https://api-ar.redremax.com/remaxweb-uy/api/listings/findAllWithEntrepreneurships"
    f"?page=0&pageSize={PAGINA}"
    f"&eq=associateId:{ASOCIADO}"
    "&eq=entrepreneurship:false"
)

CABECERAS = {
    "User-Agent": "Mozilla/5.0 (como-venimos-robot)",
    "Accept": "application/json",
}


def bajar(url: str = URL, intentos: int = 3, espera: int = 5):
    """Pide el JSON con reintentos. Un corte de red no puede tumbar la corrida del dia."""
    ultimo_error = None
    for intento in range(1, intentos + 1):
        try:
            pedido = urllib.request.Request(url, headers=CABECERAS)
            with urllib.request.urlopen(pedido, timeout=60) as respuesta:
                return json.loads(respuesta.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            ultimo_error = error
            if intento < intentos:
                time.sleep(espera * intento)
    raise RuntimeError(
        f"No se pudo bajar la cartera despues de {intentos} intentos: {ultimo_error}"
    )


def traer_listings(url: str = URL) -> list:
    crudo = bajar(url)
    datos = (crudo or {}).get("data") or {}
    listings = datos.get("data") or []
    total = datos.get("totalItems")
    if total is not None and len(listings) < total:
        raise RuntimeError(
            f"La API dice que hay {total} propiedades pero devolvio {len(listings)}. "
            f"Hay que subir PAGINA en robot/api.py."
        )
    return listings
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_api -v`
Expected: PASS — 7 tests OK

- [ ] **Step 5: Grabar el fixture real y verificarlo**

Run: `python herramientas/grabar_fixture.py`
Expected: `Grabadas 12 propiedades en .../tests/fixtures/respuesta_api.json`

- [ ] **Step 6: Commit**

```bash
git add robot/api.py tests/test_api.py tests/fixtures/respuesta_api.json
git commit -m "feat: bajar la cartera de RE/MAX con reintentos"
```

---

## Task 11: Test de extremo a extremo con los datos reales

Prueba la cadena completa `modelo → procesar` contra la respuesta real grabada, sin tocar la red.

**Files:**
- Create: `tests/test_extremo_a_extremo.py`

- [ ] **Step 1: Escribir el test**

Crear `tests/test_extremo_a_extremo.py`:

```python
import json
import pathlib
import unittest

from robot import modelo, procesar

FIXTURE = pathlib.Path(__file__).resolve().parent / "fixtures" / "respuesta_api.json"


class TestConDatosReales(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(FIXTURE, encoding="utf-8") as archivo:
            crudo = json.load(archivo)
        cls.listings = crudo["data"]["data"]

    def normalizadas(self):
        return [modelo.normalizar(x) for x in self.listings]

    def test_todas_las_propiedades_se_traducen_sin_romperse(self):
        propiedades = self.normalizadas()
        self.assertGreater(len(propiedades), 0)
        for p in propiedades:
            self.assertIsNotNone(p["entity_id"], f"sin entity_id: {p['titulo']}")
            self.assertIsNotNone(p["precio"], f"sin precio: {p['titulo']}")
            self.assertIn(p["operacion"], ("venta", "alquiler"))
            self.assertIn(p["estado"], ("publicada", "en_negociacion", "reservada"))

    def test_los_entity_id_son_unicos(self):
        ids = [p["entity_id"] for p in self.normalizadas()]
        self.assertEqual(len(ids), len(set(ids)))

    def test_la_primera_corrida_da_de_alta_todo_como_carga_inicial(self):
        propiedades = self.normalizadas()
        cartera, eventos = procesar.procesar({}, propiedades, "2026-08-18")
        self.assertEqual(len(cartera), len(propiedades))
        iniciales = [e for e in eventos if e["tipo"] == "carga_inicial"]
        self.assertEqual(len(iniciales), len(propiedades))

    def test_correr_dos_veces_el_mismo_dia_no_genera_novedades_nuevas(self):
        propiedades = self.normalizadas()
        cartera, _ = procesar.procesar({}, propiedades, "2026-08-18")
        _, eventos = procesar.procesar(cartera, propiedades, "2026-08-18")
        self.assertEqual(eventos, [])

    def test_detecta_el_duplicado_de_gutenberg(self):
        # Verificado a mano el 2026-08-17: la propiedad de Gutenberg 6100 esta publicada
        # dos veces, una como casa y otra como local, ambas a 490.000.
        propiedades = self.normalizadas()
        _, eventos = procesar.procesar({}, propiedades, "2026-08-18")
        duplicados = [e for e in eventos if e["tipo"] == "posible_duplicado"]
        direcciones = {e["direccion"] for e in duplicados}
        self.assertIn("Gutenberg 6100", direcciones)

    def test_todo_lo_guardado_se_puede_serializar_a_json(self):
        propiedades = self.normalizadas()
        cartera, eventos = procesar.procesar({}, propiedades, "2026-08-18")
        json.dumps(cartera, ensure_ascii=False)
        json.dumps(eventos, ensure_ascii=False)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr el test**

Run: `python -m unittest tests.test_extremo_a_extremo -v`
Expected: PASS — 6 tests OK

- [ ] **Step 3: Correr TODA la batería de tests**

Run: `python -m unittest discover -s tests -t . -v`
Expected: PASS — 63 tests OK, `0 failures`
*(11 de modelo + 6 de almacen + 33 de procesar + 7 de api + 6 de extremo a extremo)*

- [ ] **Step 4: Commit**

```bash
git add tests/test_extremo_a_extremo.py
git commit -m "test: cadena completa contra la respuesta real de la API"
```

---

## Task 12: `main.py` — la corrida diaria

**Files:**
- Create: `robot/main.py`
- Test: `tests/test_main.py`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/test_main.py`:

```python
import json
import pathlib
import tempfile
import unittest
from unittest import mock

from robot import almacen, main

LISTING = {
    "id": 1,
    "entityId": "e1",
    "internalId": "940041154-1",
    "title": "Casa linda",
    "slug": "casa-linda",
    "operation": {"value": "sale"},
    "type": {"value": "casa"},
    "currency": {"value": "USD"},
    "expensesCurrency": {"value": "UYU"},
    "expensesPrice": None,
    "listingStatus": {"value": "active"},
    "price": 100000.0,
    "displayAddress": "Calle Falsa 100",
    "geoLabel": "Cerrito, Cerrito, Montevideo",
    "location": {"coordinates": [-56.1, -34.8]},
    "dimensionLand": 300,
    "dimensionTotalBuilt": 300,
    "dimensionCovered": 120,
    "bedrooms": 3,
    "bathrooms": 1,
    "totalRooms": 5,
    "photos": [],
}


class TestMain(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.carpeta = pathlib.Path(self.tmp.name)
        self.parche_datos = mock.patch.object(almacen, "DATOS", self.carpeta)
        self.parche_datos.start()

    def tearDown(self):
        self.parche_datos.stop()
        self.tmp.cleanup()

    def leer(self, nombre):
        with open(self.carpeta / nombre, encoding="utf-8") as archivo:
            return json.load(archivo)

    def correr(self, listings, fecha="2026-08-18", entorno=None):
        base = {"FECHA_HOY": fecha}
        base.update(entorno or {})
        with mock.patch.object(main.api, "traer_listings", return_value=listings), \
             mock.patch.dict("os.environ", base, clear=False):
            return main.main()

    def test_una_corrida_normal_escribe_los_tres_archivos(self):
        self.assertEqual(self.correr([LISTING]), 0)
        self.assertEqual(len(self.leer("cartera.json")), 1)
        self.assertEqual(len(self.leer("eventos.json")), 1)
        estado = self.leer("estado_robot.json")
        self.assertTrue(estado["ok"])
        self.assertEqual(estado["ultima_corrida"], "2026-08-18")
        self.assertEqual(estado["propiedades"], 1)

    def test_los_eventos_se_acumulan_no_se_pisan(self):
        self.correr([LISTING], fecha="2026-08-18")
        caro = dict(LISTING, price=90000.0)
        self.correr([caro], fecha="2026-08-19")
        eventos = self.leer("eventos.json")
        self.assertEqual([e["tipo"] for e in eventos], ["carga_inicial", "cambio_precio"])

    def test_dry_run_no_escribe_nada(self):
        self.assertEqual(self.correr([LISTING], entorno={"DRY_RUN": "1"}), 0)
        self.assertFalse((self.carpeta / "cartera.json").exists())

    def test_si_la_api_falla_devuelve_error_y_lo_deja_anotado(self):
        with mock.patch.object(main.api, "traer_listings", side_effect=RuntimeError("se cayo")), \
             mock.patch.dict("os.environ", {"FECHA_HOY": "2026-08-18"}, clear=False):
            self.assertEqual(main.main(), 1)
        estado = self.leer("estado_robot.json")
        self.assertFalse(estado["ok"])
        self.assertIn("se cayo", estado["error"])

    def test_si_la_api_falla_no_da_de_baja_toda_la_cartera(self):
        # Lo peor que podria pasar: que un error de red se interprete como que se vendio todo.
        self.correr([LISTING], fecha="2026-08-18")
        with mock.patch.object(main.api, "traer_listings", side_effect=RuntimeError("se cayo")), \
             mock.patch.dict("os.environ", {"FECHA_HOY": "2026-08-19"}, clear=False):
            main.main()
        self.assertTrue(self.leer("cartera.json")["e1"]["activa"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_main -v`
Expected: FAIL con `ImportError: cannot import name 'main' from 'robot'`

- [ ] **Step 3: Escribir la implementación**

Crear `robot/main.py`:

```python
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

from robot import almacen, api, modelo, procesar


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
    cartera, eventos = procesar.procesar(cartera_previa, propiedades, hoy)

    print(f"{hoy}: {len(propiedades)} propiedades, {len(eventos)} novedades")
    for evento in eventos:
        print(f"  - {evento['tipo']}: {evento['titulo']} ({evento['direccion']})")

    if seco:
        print("DRY_RUN: no se escribio nada")
        return 0

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
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_main -v`
Expected: PASS — 5 tests OK

- [ ] **Step 5: Correr toda la batería**

Run: `python -m unittest discover -s tests -t . -v`
Expected: PASS — 68 tests OK, `0 failures`

- [ ] **Step 6: Commit**

```bash
git add robot/main.py tests/test_main.py
git commit -m "feat: corrida diaria que baja, compara y guarda"
```

---

## Task 13: Primera corrida real

**Files:**
- Create: `datos/cartera.json`, `datos/eventos.json`, `datos/estado_robot.json` (generados)

- [ ] **Step 1: Probar en seco primero**

Run: `DRY_RUN=1 python -m robot.main`
Expected: imprime `12 propiedades, 13 novedades` — las 12 como `carga_inicial` más 1
`posible_duplicado` (Gutenberg 6100) — y termina con `DRY_RUN: no se escribio nada`. No
aparece ningún archivo en `datos/`.

- [ ] **Step 2: Correr de verdad**

Run: `python -m robot.main`
Expected: mismo listado, y ahora sí se crean los tres archivos.

- [ ] **Step 3: Verificar a mano lo que quedó grabado**

Run:
```bash
python -c "import json;c=json.load(open('datos/cartera.json',encoding='utf-8'));print('propiedades:',len(c));print('estados:',sorted(set(v['estado'] for v in c.values())));print('sin origen:',sum(1 for v in c.values() if v['origen_captacion'] is None))"
```
Expected:
```
propiedades: 12
estados: ['en_negociacion', 'publicada', 'reservada']
sin origen: 12
```

Run:
```bash
python -c "import json;e=json.load(open('datos/eventos.json',encoding='utf-8'));from collections import Counter;print(Counter(x['tipo'] for x in e))"
```
Expected: `Counter({'carga_inicial': 12, 'posible_duplicado': 1})`

- [ ] **Step 4: Correr de nuevo el mismo día y verificar que no duplica**

Run: `python -m robot.main`
Expected: `12 propiedades, 0 novedades`

Run:
```bash
python -c "import json;print(len(json.load(open('datos/eventos.json',encoding='utf-8'))))"
```
Expected: `13` (sigue igual, no se agregó nada)

- [ ] **Step 5: Commit**

```bash
git add datos/
git commit -m "datos: primera foto de la cartera"
```

---

## Task 14: Corrida automática todos los días

**Files:**
- Create: `.github/workflows/robot.yml`
- Create: `README.md`

- [ ] **Step 1: Escribir el workflow**

Crear `.github/workflows/robot.yml`:

```yaml
name: Robot de cartera

# La corrida REAL: 1 vez por dia (y a mano desde la pestaña Actions cuando haga falta).
# La PRUEBA: cada vez que se toca el codigo, para cazar errores antes de la corrida diaria.
on:
  schedule:
    - cron: "0 9 * * *"      # 09:00 UTC = 06:00 en Uruguay
  workflow_dispatch: {}
  push:
    paths:
      - "robot/**"
      - "tests/**"
      - ".github/workflows/robot.yml"

permissions:
  contents: write

jobs:
  pruebas:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
      - name: Correr los tests
        run: python -m unittest discover -s tests -t . -v
      - name: Probar el robot sin escribir nada
        run: DRY_RUN=1 python -m robot.main

  grabar:
    # Solo en la corrida diaria o a mano; en los push alcanza con las pruebas.
    if: github.event_name != 'push'
    needs: pruebas
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
      - name: Bajar la cartera y anotar los cambios
        run: python -m robot.main
      - name: Guardar los datos nuevos
        run: |
          git config user.name "como-venimos-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add datos/
          git commit -m "datos: cartera del $(date -u +%F)" || echo "sin cambios"
          git push
```

- [ ] **Step 2: Escribir el README**

Crear `README.md`:

```markdown
# ¿Cómo venimos? 🏠📊

Control de cartera y salud del negocio inmobiliario de Juan Andrés Otero (RE/MAX Único).

Reemplaza el Excel: lleva el día a día de las propiedades publicadas, los negocios cerrados
y la plata (facturación y ganancia).

## Estado

- ✅ **Fase 1 — Robot de cartera** (esto): anota todos los días qué pasa con la cartera.
- ⬜ Fase 2 — Import del Excel + Negocios + Salud del negocio
- ⬜ Fase 3 — Pantalla de Cartera
- ⬜ Fase 4 — Calculadora de renta

## Cómo funciona el robot

Todos los días a las 6 de la mañana, GitHub le pregunta a la API pública de RE/MAX por las
propiedades del agente y anota los cambios en `datos/`:

| Archivo | Qué guarda |
|---|---|
| `datos/cartera.json` | Cada propiedad con su historial de precios y sus fechas |
| `datos/eventos.json` | La bitácora de novedades. Se agrega al final, nunca se borra |
| `datos/estado_robot.json` | Si la última corrida salió bien y cuándo fue |

Lo que detecta: altas, cambios de precio, pasos a negociación y reserva, bajas (proponiendo
si se vendió o se cayó) y propiedades publicadas dos veces.

**El robot nunca decide un desenlace.** Propone, y el usuario confirma desde la app.

## Correrlo a mano

```bash
python -m robot.main              # corrida normal
DRY_RUN=1 python -m robot.main    # muestra lo que haría, sin escribir
```

## Tests

```bash
python -m unittest discover -s tests -t . -v
```

Solo librería estándar de Python 3.13. No hay nada que instalar.

## Diseño

- Especificación: [`docs/superpowers/specs/2026-08-17-como-venimos-design.md`](docs/superpowers/specs/2026-08-17-como-venimos-design.md)
- Plan de esta fase: [`docs/superpowers/plans/2026-08-17-robot-cartera.md`](docs/superpowers/plans/2026-08-17-robot-cartera.md)

Datos públicos de RE/MAX. Sin claves ni secretos.
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/robot.yml README.md
git commit -m "ci: corrida diaria automatica del robot"
```

- [ ] **Step 4: Crear el repositorio en GitHub y subir**

```bash
gh repo create como-venimos --private --source=. --remote=origin --push
```

Expected: crea `github.com/juanandresotero/como-venimos` y sube todo.

> Si `gh` no está autenticado, correr `gh auth login` primero.
> El repo se crea **privado**. Cuando llegue la Fase 2 con GitHub Pages hay que decidir si
> se pasa a público (Pages gratis) o se paga GitHub Pro. El usuario ya dijo que la
> privacidad de las cifras no le preocupa.

- [ ] **Step 5: Disparar el workflow a mano y verificar que anda**

```bash
gh workflow run "Robot de cartera"
sleep 60
gh run list --workflow="Robot de cartera" --limit 1
```
Expected: `completed  success`

Si falla, ver el detalle con `gh run view --log-failed`.

- [ ] **Step 6: Verificar que el cron quedó agendado**

```bash
gh workflow view "Robot de cartera"
```
Expected: aparece el workflow como `active`.

> **Ojo:** GitHub apaga los cron de los repos sin actividad después de 60 días. Como el
> robot commitea datos casi todos los días, se mantiene despierto solo.

---

## Verificación final de la fase

- [ ] `python -m unittest discover -s tests -t . -v` → **68 tests, 0 failures**
- [ ] `datos/cartera.json` tiene las 12 propiedades con sus estados
- [ ] `datos/eventos.json` tiene los 12 `carga_inicial` + 1 `posible_duplicado`
- [ ] `datos/estado_robot.json` dice `"ok": true`
- [ ] El workflow corrió en verde en GitHub
- [ ] Correr el robot dos veces seguidas no genera novedades repetidas

**A partir de acá el robot graba solo todos los días.** La Fase 2 (import del Excel, Negocios y Salud del negocio) ya puede empezar sin apuro: la historia de la cartera se está acumulando mientras tanto.
