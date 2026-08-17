# Motor de plata e importador — Plan de implementación (Fase 2a de 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el Excel de 85 negocios en `datos/negocios.json`, con la facturación y la ganancia calculadas correctamente, cada negocio cruzado contra la cartera viva, y cada dato dudoso marcado con un aviso para revisar después.

**Architecture:** Cuatro módulos Python chicos en un paquete nuevo `negocios/`, todos funciones puras salvo el que lee el archivo. `motor.py` sabe de plata y de nada más; `excel.py` lee el `.xlsx` y normaliza tipos; `cruce.py` empareja direcciones contra la cartera; `importador.py` los orquesta y produce el JSON final. Ningún módulo toca la red.

**Tech Stack:** Python 3.13, librería estándar + `openpyxl` (ya instalado, solo para leer el `.xlsx`). Tests con `unittest`.

**Spec de referencia:** [`../specs/2026-08-17-como-venimos-design.md`](../specs/2026-08-17-como-venimos-design.md) — implementa §4.2, §4.3, §5, §6.1 (emparejamiento) y §9.

> **Nota de entorno.** Windows. Comandos en sintaxis POSIX, para correr con la herramienta **Bash** (Git Bash), no PowerShell.

---

## Alcance de esta fase

**Entra:** el motor de comisiones, la lectura del Excel, el emparejamiento contra la cartera, el importador y los archivos `datos/negocios.json` y `datos/ajustes.json`.

**No entra:** ninguna pantalla. Al terminar esta fase todavía no hay app — hay números correctos y verificables, que es lo que la app va a mostrar. La Fase 2b construye la interfaz.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `negocios/motor.py` | BASE, facturación y ganancia según régimen y categoría. Función pura. |
| `negocios/excel.py` | Leer `negocios.xlsx` y normalizar tipos (textos que son números, porcentajes, fechas). |
| `negocios/cruce.py` | Partir direcciones y emparejar un negocio con la cartera viva. Función pura. |
| `negocios/importador.py` | Orquestar: fila del Excel → negocio completo con sus avisos. |
| `herramientas/importar_excel.py` | Script para correr el import a mano. |
| `datos/ajustes.json` | Categoría, reglas de comisión, objetivos, probabilidades. |
| `datos/negocios.json` | El resultado. |

## Forma de un negocio

Todas las tareas producen o consumen este diccionario. Está acá arriba para no repetirlo.

```python
{
  "id": "excel-2",                    # estable: de donde salio
  "entity_id_cartera": None,          # se llena si cruza con la cartera
  "tipo_negocio": "venta",            # venta | alquiler | renovacion_alquiler | suplencia
  "fecha_inicio": "2022-09-17",
  "fecha_boleto": "2022-10-24",
  "fecha_fin": "2023-01-24",
  "fecha_fin_estimada": False,        # True si la firma es inventada (§9.6b del spec)
  "direccion": "Picaflores",
  "barrio": "Solymar norte",
  "tipo_propiedad": None,
  "precio_operacion": 140000.0,
  "moneda": "USD",
  "agente_vende": "Juan Andrés Otero",
  "agente_compra": "Otro REMAX",
  "puntas": 1,
  "origen_captacion": "BDR",
  "regimen_comision": "captacion_mia",
  "pct_comision_total": 0.03,
  "base": 4200.0,
  "facturacion": 4200.0,
  "ganancia": 2100.0,
  "split_aplicado": 0.5,
  "categoria_vigente": None,          # solo para negocios recalculados (2026+)
  "estado": "cerrado",                # cerrado | en_curso | caido
  "recalculado": False,               # True si se calculo con el motor nuevo
  "ficha_completa": False,
  "avisos": [],                       # [{"tipo": "...", "detalle": "..."}]
  "notas": ""
}
```

---

## Task 1: Paquete `negocios/` y ajustes iniciales

**Files:**
- Create: `negocios/__init__.py`
- Create: `datos/ajustes.json`
- Test: `tests/test_ajustes.py`

- [ ] **Step 1: Crear el paquete**

```bash
cd "c:/Users/es_bi/OneDrive/Desktop/claude/Como venimos"
mkdir -p negocios
printf '' > negocios/__init__.py
```

- [ ] **Step 2: Escribir el test que falla**

Crear `tests/test_ajustes.py`:

```python
import unittest

from robot import almacen


class TestAjustes(unittest.TestCase):
    def setUp(self):
        self.a = almacen.leer_json("ajustes.json", None)

    def test_el_archivo_existe(self):
        self.assertIsNotNone(self.a, "falta datos/ajustes.json")

    def test_la_categoria_vigente_es_rap_al_45_con_fee_70(self):
        vigente = [c for c in self.a["categorias"] if c["hasta"] is None]
        self.assertEqual(len(vigente), 1, "tiene que haber exactamente una categoria vigente")
        self.assertEqual(vigente[0]["categoria"], "RAP")
        self.assertEqual(vigente[0]["split_pct"], 0.45)
        self.assertEqual(vigente[0]["fee_mensual_usd"], 70)

    def test_las_comisiones_por_defecto(self):
        d = self.a["defaults_comision"]
        self.assertEqual(d["venta"]["1"], 0.03)
        self.assertEqual(d["venta"]["2"], 0.06)
        self.assertEqual(d["alquiler"]["1"], 1.0)
        self.assertEqual(d["alquiler"]["2"], 2.0)

    def test_la_regla_de_martin_va_aparte_de_la_categoria(self):
        # Martin no escala con RAP/ALTO/PURO: es un arreglo fijo.
        self.assertEqual(self.a["regla_martin"], {"facturacion": 0.50, "ganancia": 0.35})

    def test_los_niveles_remax(self):
        n = self.a["niveles_remax"]
        self.assertEqual(n["Rokie"], 30000)
        self.assertEqual(n["Diamond"], 400000)

    def test_las_probabilidades_de_cierre(self):
        p = self.a["probabilidades_cierre"]
        self.assertEqual(p["reservada"], 0.90)
        self.assertEqual(p["en_negociacion"], 0.60)
        self.assertEqual(p["publicada"], 0.25)

    def test_los_objetivos_personales(self):
        self.assertEqual(self.a["objetivo_personal"]["2026"], 65000)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_ajustes -v`
Expected: FAIL con `AssertionError: falta datos/ajustes.json`

- [ ] **Step 4: Escribir el archivo de ajustes**

Crear `datos/ajustes.json`:

```json
{
 "categorias": [
  {
   "categoria": "RAP",
   "split_pct": 0.45,
   "fee_mensual_usd": 70,
   "desde": "2026-01-01",
   "hasta": null
  }
 ],
 "defaults_comision": {
  "venta": {"1": 0.03, "2": 0.06},
  "alquiler": {"1": 1.0, "2": 2.0}
 },
 "regla_martin": {"facturacion": 0.5, "ganancia": 0.35},
 "pct_suplencia": 0.125,
 "pct_referido_saliente": 0.25,
 "pct_referido_entrante_otro": 0.75,
 "niveles_remax": {
  "Rokie": 30000,
  "Executive": 65000,
  "Club 100%": 100000,
  "Platinum": 150000,
  "Chairman's Club": 225000,
  "Titan": 300000,
  "Diamond": 400000
 },
 "objetivo_personal": {"2025": 65000, "2026": 65000, "2027": 100000},
 "probabilidades_cierre": {
  "reservada": 0.9,
  "en_negociacion": 0.6,
  "publicada": 0.25
 },
 "tipo_cambio": {"usd_uyu": null, "fecha": null}
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_ajustes -v`
Expected: PASS — 7 tests OK

- [ ] **Step 6: Commit**

```bash
git add negocios/__init__.py datos/ajustes.json tests/test_ajustes.py
git commit -m "feat: ajustes iniciales (categoria RAP, comisiones, objetivos)"
```

---

## Task 2: `motor.base()` — la comisión inmobiliaria total

**Files:**
- Create: `negocios/motor.py`
- Test: `tests/test_motor.py`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/test_motor.py`:

```python
import unittest

from negocios import motor

AJUSTES = {
    "categorias": [
        {"categoria": "RAP", "split_pct": 0.45, "fee_mensual_usd": 70,
         "desde": "2026-01-01", "hasta": None},
    ],
    "defaults_comision": {
        "venta": {"1": 0.03, "2": 0.06},
        "alquiler": {"1": 1.0, "2": 2.0},
    },
    "regla_martin": {"facturacion": 0.5, "ganancia": 0.35},
    "pct_suplencia": 0.125,
    "pct_referido_saliente": 0.25,
    "pct_referido_entrante_otro": 0.75,
}


class TestPctPorDefecto(unittest.TestCase):
    def test_venta_una_punta_es_3_por_ciento(self):
        self.assertEqual(motor.pct_por_defecto("venta", 1, AJUSTES), 0.03)

    def test_venta_dos_puntas_es_6_por_ciento(self):
        self.assertEqual(motor.pct_por_defecto("venta", 2, AJUSTES), 0.06)

    def test_alquiler_una_punta_es_un_mes(self):
        self.assertEqual(motor.pct_por_defecto("alquiler", 1, AJUSTES), 1.0)

    def test_alquiler_dos_puntas_son_dos_meses(self):
        self.assertEqual(motor.pct_por_defecto("alquiler", 2, AJUSTES), 2.0)

    def test_la_renovacion_usa_la_tabla_de_alquiler(self):
        self.assertEqual(motor.pct_por_defecto("renovacion_alquiler", 1, AJUSTES), 1.0)

    def test_cero_puntas_usa_la_tabla_de_una_punta(self):
        # Un referido saliente no tiene punta propia, pero la comision del negocio existe.
        self.assertEqual(motor.pct_por_defecto("venta", 0, AJUSTES), 0.03)


class TestBase(unittest.TestCase):
    def test_venta_de_100000_al_3_por_ciento(self):
        self.assertEqual(motor.base(100000.0, 0.03), 3000.0)

    def test_venta_de_100000_al_6_por_ciento(self):
        self.assertEqual(motor.base(100000.0, 0.06), 6000.0)

    def test_alquiler_de_333_a_dos_meses(self):
        self.assertEqual(motor.base(333.0, 2.0), 666.0)

    def test_sin_precio_da_cero(self):
        self.assertEqual(motor.base(None, 0.03), 0.0)

    def test_sin_porcentaje_da_cero(self):
        self.assertEqual(motor.base(100000.0, None), 0.0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_motor -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'negocios.motor'`

- [ ] **Step 3: Escribir la implementación**

Crear `negocios/motor.py`:

```python
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
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_motor -v`
Expected: PASS — 11 tests OK

- [ ] **Step 5: Commit**

```bash
git add negocios/motor.py tests/test_motor.py
git commit -m "feat: calcular la BASE de comision de un negocio"
```

---

## Task 3: `motor.split_vigente()` — la tajada según la fecha

**Files:**
- Modify: `negocios/motor.py`
- Modify: `tests/test_motor.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `tests/test_motor.py`, antes del bloque `if __name__`:

```python
AJUSTES_CON_HISTORIA = {
    "categorias": [
        {"categoria": "RAP", "split_pct": 0.45, "fee_mensual_usd": 70,
         "desde": "2026-01-01", "hasta": "2026-05-31"},
        {"categoria": "ALTO", "split_pct": 0.60, "fee_mensual_usd": 425,
         "desde": "2026-06-01", "hasta": None},
    ],
}


class TestSplitVigente(unittest.TestCase):
    def test_devuelve_la_categoria_de_esa_fecha(self):
        self.assertEqual(motor.split_vigente("2026-03-15", AJUSTES)[0], "RAP")
        self.assertEqual(motor.split_vigente("2026-03-15", AJUSTES)[1], 0.45)

    def test_con_historia_toma_la_que_corresponde_a_cada_fecha(self):
        # Si cambia de categoria en junio, los negocios de marzo se siguen calculando al 45%.
        # Sin esto, cambiar de categoria deformaria todo el historico de golpe.
        self.assertEqual(motor.split_vigente("2026-03-15", AJUSTES_CON_HISTORIA), ("RAP", 0.45))
        self.assertEqual(motor.split_vigente("2026-08-15", AJUSTES_CON_HISTORIA), ("ALTO", 0.60))

    def test_el_ultimo_dia_del_periodo_todavia_cuenta(self):
        self.assertEqual(motor.split_vigente("2026-05-31", AJUSTES_CON_HISTORIA), ("RAP", 0.45))

    def test_el_primer_dia_del_periodo_nuevo_ya_cuenta(self):
        self.assertEqual(motor.split_vigente("2026-06-01", AJUSTES_CON_HISTORIA), ("ALTO", 0.60))

    def test_una_fecha_anterior_a_toda_la_historia_no_tiene_categoria(self):
        # Los negocios de 2023 se importan con sus numeros tal cual, no se recalculan.
        self.assertEqual(motor.split_vigente("2023-05-01", AJUSTES), (None, None))

    def test_sin_fecha_no_tiene_categoria(self):
        self.assertEqual(motor.split_vigente(None, AJUSTES), (None, None))
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_motor.TestSplitVigente -v`
Expected: FAIL con `AttributeError: module 'negocios.motor' has no attribute 'split_vigente'`

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `negocios/motor.py`:

```python
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
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_motor -v`
Expected: PASS — 17 tests OK

- [ ] **Step 5: Commit**

```bash
git add negocios/motor.py tests/test_motor.py
git commit -m "feat: saber que categoria regia en cada fecha"
```

---

## Task 4: `motor.calcular()` — los cinco regímenes

El corazón del sistema. Se verifica contra el ejemplo real del usuario (propiedad de 100.000 al 3%).

**Files:**
- Modify: `negocios/motor.py`
- Modify: `tests/test_motor.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `tests/test_motor.py`:

```python
class TestCalcular(unittest.TestCase):
    """Verificado contra la tabla que dio el usuario: propiedad de 100.000, comision 3%.

    BASE 1 punta = 3.000 | BASE 2 puntas = 6.000
    """

    def calc(self, regimen, base_valor, fecha="2026-03-15"):
        return motor.calcular(regimen, base_valor, fecha, AJUSTES)

    def test_captacion_mia_una_punta(self):
        self.assertEqual(self.calc("captacion_mia", 3000.0), (3000.0, 1350.0))

    def test_captacion_mia_dos_puntas(self):
        self.assertEqual(self.calc("captacion_mia", 6000.0), (6000.0, 2700.0))

    def test_referida_de_martin_una_punta(self):
        # Martin se lleva la mitad de la facturacion, y a Juan le queda el 35% del total.
        self.assertEqual(self.calc("ref_martin", 3000.0), (1500.0, 1050.0))

    def test_referida_de_martin_dos_puntas(self):
        self.assertEqual(self.calc("ref_martin", 6000.0), (3000.0, 2100.0))

    def test_referida_de_otro_colega_una_punta(self):
        # Factura el total, paga 25% de referido, y sobre lo que queda va su 45%.
        self.assertEqual(self.calc("ref_otro_colega", 3000.0), (3000.0, 1012.5))

    def test_referida_de_otro_colega_dos_puntas(self):
        self.assertEqual(self.calc("ref_otro_colega", 6000.0), (6000.0, 2025.0))

    def test_yo_referi_una_punta(self):
        self.assertEqual(self.calc("yo_referi", 3000.0), (750.0, 337.5))

    def test_yo_referi_dos_puntas(self):
        self.assertEqual(self.calc("yo_referi", 6000.0), (1500.0, 675.0))

    def test_suplencia_no_factura_pero_deja_ganancia(self):
        # Cubrir una visita a un colega no pasa por RE/MAX: es 12,5% directo al bolsillo.
        self.assertEqual(self.calc("suplencia", 6000.0), (0.0, 750.0))

    def test_la_suplencia_no_se_reparte_con_la_oficina(self):
        _, ganancia = self.calc("suplencia", 6000.0)
        self.assertEqual(ganancia, 6000.0 * 0.125)

    def test_martin_no_escala_con_la_categoria(self):
        # Con ALTO (60%) los demas regimenes suben, pero el arreglo con Martin es fijo.
        alto = motor.calcular("ref_martin", 3000.0, "2026-08-15", AJUSTES_CON_HISTORIA)
        self.assertEqual(alto, (1500.0, 1050.0))

    def test_los_demas_regimenes_si_escalan_con_la_categoria(self):
        alto = motor.calcular("captacion_mia", 3000.0, "2026-08-15", AJUSTES_CON_HISTORIA)
        self.assertEqual(alto, (3000.0, 1800.0))    # 60% de 3000

    def test_sin_categoria_vigente_no_calcula_ganancia(self):
        # Un negocio de 2023 no se recalcula: sus numeros vienen del Excel.
        self.assertEqual(motor.calcular("captacion_mia", 3000.0, "2023-05-01", AJUSTES),
                         (3000.0, None))

    def test_un_regimen_desconocido_avisa(self):
        with self.assertRaises(ValueError):
            motor.calcular("cualquier_cosa", 3000.0, "2026-03-15", AJUSTES)
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_motor.TestCalcular -v`
Expected: FAIL con `AttributeError: module 'negocios.motor' has no attribute 'calcular'`

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `negocios/motor.py`:

```python
REGIMENES = (
    "captacion_mia",
    "ref_martin",
    "ref_otro_colega",
    "yo_referi",
    "suplencia",
)


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
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_motor -v`
Expected: PASS — 31 tests OK

- [ ] **Step 5: Commit**

```bash
git add negocios/motor.py tests/test_motor.py
git commit -m "feat: calcular facturacion y ganancia segun el regimen de comision"
```

---

## Task 5: `excel.leer()` — abrir el archivo y normalizar tipos

El Excel tiene **80 celdas guardadas como texto** en columnas numéricas. Si no se normalizan, las cuentas salen mal o revientan.

**Files:**
- Create: `negocios/excel.py`
- Test: `tests/test_excel.py`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/test_excel.py`:

```python
import unittest

from negocios import excel


class TestANumero(unittest.TestCase):
    def test_un_numero_queda_igual(self):
        self.assertEqual(excel.a_numero(140000), 140000)
        self.assertEqual(excel.a_numero(0.03), 0.03)

    def test_un_porcentaje_escrito_como_texto(self):
        # En el Excel hay 37 celdas asi en la columna de % Comision.
        self.assertAlmostEqual(excel.a_numero("150.40%"), 1.504)
        self.assertAlmostEqual(excel.a_numero("4.50%"), 0.045)
        self.assertAlmostEqual(excel.a_numero("50.00%"), 0.5)

    def test_un_numero_escrito_como_texto(self):
        self.assertAlmostEqual(excel.a_numero("2772.96"), 2772.96)
        self.assertAlmostEqual(excel.a_numero("1039.5"), 1039.5)

    def test_texto_con_separador_de_miles(self):
        self.assertAlmostEqual(excel.a_numero("1,200"), 1200.0)

    def test_vacio_o_basura_da_none(self):
        self.assertIsNone(excel.a_numero(None))
        self.assertIsNone(excel.a_numero(""))
        self.assertIsNone(excel.a_numero("   "))
        self.assertIsNone(excel.a_numero("no es un numero"))


class TestAFecha(unittest.TestCase):
    def test_un_datetime_se_vuelve_texto_iso(self):
        import datetime
        self.assertEqual(excel.a_fecha(datetime.datetime(2022, 8, 10)), "2022-08-10")
        self.assertEqual(excel.a_fecha(datetime.date(2022, 8, 10)), "2022-08-10")

    def test_vacio_da_none(self):
        self.assertIsNone(excel.a_fecha(None))
        self.assertIsNone(excel.a_fecha(""))


class TestLeer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.filas = excel.leer()

    def test_trae_las_85_filas(self):
        self.assertEqual(len(self.filas), 85)

    def test_cada_fila_sabe_de_que_renglon_del_excel_salio(self):
        # Para poder decirle al usuario "fila 37" y que la encuentre en su planilla.
        self.assertEqual(self.filas[0]["fila_excel"], 2)
        self.assertEqual(self.filas[-1]["fila_excel"], 86)

    def test_los_porcentajes_quedaron_todos_como_numero(self):
        for f in self.filas:
            for campo in ("pct_comision", "pct_agente"):
                self.assertNotIsInstance(f[campo], str, f"fila {f['fila_excel']}: {campo} quedo texto")

    def test_los_montos_quedaron_todos_como_numero(self):
        for f in self.filas:
            for campo in ("precio", "facturado", "importe"):
                self.assertNotIsInstance(f[campo], str, f"fila {f['fila_excel']}: {campo} quedo texto")

    def test_las_fechas_quedaron_como_texto_iso(self):
        con_fecha = [f for f in self.filas if f["fecha_fin"]]
        self.assertGreater(len(con_fecha), 80)
        for f in con_fecha:
            self.assertRegex(f["fecha_fin"], r"^\d{4}-\d{2}-\d{2}$")

    def test_las_operaciones_son_venta_o_alquiler(self):
        self.assertEqual({f["operacion"] for f in self.filas}, {"Venta", "Alquiler"})

    def test_hay_46_alquileres_y_39_ventas(self):
        ops = [f["operacion"] for f in self.filas]
        self.assertEqual(ops.count("Alquiler"), 46)
        self.assertEqual(ops.count("Venta"), 39)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_excel -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'negocios.excel'`

- [ ] **Step 3: Escribir la implementación**

Crear `negocios/excel.py`:

```python
"""Lee negocios.xlsx y normaliza los tipos. Lo unico de esta fase que toca un archivo.

El Excel real tiene 80 celdas guardadas como TEXTO en columnas que deberian ser numeros
("150.40%", "2772.96"). Excel las suma igual casi siempre, pero cualquier formula nueva
las puede saltear en silencio. Aca se pasan todas a numero de una vez.
"""
from __future__ import annotations

import datetime
import pathlib

import openpyxl

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ARCHIVO = RAIZ / "negocios.xlsx"

# Las 14 columnas del Excel, en orden.
COLUMNAS = (
    "operacion",
    "barrio",
    "direccion",
    "agente_vende",
    "agente_compra",
    "origen",
    "precio",
    "pct_comision",
    "facturado",
    "pct_agente",
    "importe",
    "fecha_inicio",
    "fecha_boleto",
    "fecha_fin",
)

NUMERICAS = ("precio", "pct_comision", "facturado", "pct_agente", "importe")
FECHAS = ("fecha_inicio", "fecha_boleto", "fecha_fin")


def a_numero(valor):
    """Pasa a numero lo que venga. Entiende '150.40%' y '2772.96'. Devuelve None si no puede."""
    if valor is None or isinstance(valor, (int, float)):
        return valor
    texto = str(valor).strip().replace(",", "").replace(" ", "")
    if not texto:
        return None
    porcentaje = texto.endswith("%")
    if porcentaje:
        texto = texto[:-1]
    try:
        numero = float(texto)
    except ValueError:
        return None
    return numero / 100 if porcentaje else numero


def a_fecha(valor):
    """Pasa una fecha de Excel a texto ISO (2022-08-10). Devuelve None si esta vacia."""
    if isinstance(valor, datetime.datetime):
        return valor.date().isoformat()
    if isinstance(valor, datetime.date):
        return valor.isoformat()
    return None


def leer(archivo=None) -> list:
    """Devuelve una lista de diccionarios, uno por negocio, con los tipos ya normalizados."""
    ruta = pathlib.Path(archivo) if archivo else ARCHIVO
    hoja = openpyxl.load_workbook(ruta, data_only=True).worksheets[0]
    filas = []
    for numero_fila, valores in enumerate(hoja.iter_rows(min_row=2, values_only=True), start=2):
        if not any(v is not None for v in valores):
            continue    # renglon vacio al final de la hoja
        fila = dict(zip(COLUMNAS, valores))
        fila["fila_excel"] = numero_fila
        for campo in NUMERICAS:
            fila[campo] = a_numero(fila[campo])
        for campo in FECHAS:
            fila[campo] = a_fecha(fila[campo])
        for campo in ("operacion", "barrio", "direccion", "agente_vende", "agente_compra", "origen"):
            if isinstance(fila[campo], str):
                fila[campo] = fila[campo].strip()
        filas.append(fila)
    return filas
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_excel -v`
Expected: PASS — 14 tests OK

- [ ] **Step 5: Commit**

```bash
git add negocios/excel.py tests/test_excel.py
git commit -m "feat: leer el Excel y normalizar los tipos"
```

---

## Task 6: `cruce.partir_direccion()` — separar calle de número

**Files:**
- Create: `negocios/cruce.py`
- Test: `tests/test_cruce.py`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/test_cruce.py`:

```python
import unittest

from negocios import cruce


class TestPartirDireccion(unittest.TestCase):
    def test_calle_y_numero(self):
        self.assertEqual(cruce.partir_direccion("Gobernador Vigodet 2700"),
                         ("gobernador vigodet", 2700))

    def test_saca_los_acentos(self):
        self.assertEqual(cruce.partir_direccion("Flammarión 5000"), ("flammarion", 5000))

    def test_pasa_a_minusculas_y_saca_espacios_de_mas(self):
        self.assertEqual(cruce.partir_direccion("  GUTENBERG   6100 "), ("gutenberg", 6100))

    def test_ignora_lo_que_viene_despues_del_numero(self):
        self.assertEqual(cruce.partir_direccion("Bartolome mitre 1475 -Garaje"),
                         ("bartolome mitre", 1475))

    def test_sin_numero_devuelve_none(self):
        self.assertEqual(cruce.partir_direccion("Complejo america"), ("complejo america", None))

    def test_vacio_no_revienta(self):
        self.assertEqual(cruce.partir_direccion(None), ("", None))
        self.assertEqual(cruce.partir_direccion(""), ("", None))


class TestBloque(unittest.TestCase):
    def test_redondea_a_la_centena_de_abajo(self):
        # RE/MAX publica la direccion redondeada: el 3959 aparece como 3900.
        self.assertEqual(cruce.bloque(3959), 3900)
        self.assertEqual(cruce.bloque(3900), 3900)
        self.assertEqual(cruce.bloque(1254), 1200)
        self.assertEqual(cruce.bloque(1200), 1200)

    def test_sin_numero_devuelve_none(self):
        self.assertIsNone(cruce.bloque(None))


class TestMismaCalle(unittest.TestCase):
    def test_identicas(self):
        self.assertTrue(cruce.misma_calle("gutenberg", "gutenberg"))

    def test_tolera_errores_de_tipeo(self):
        # Casos reales del Excel del usuario.
        self.assertTrue(cruce.misma_calle("flamarrion", "flammarion"))
        self.assertTrue(cruce.misma_calle("juana de ibarburu", "juana de ibarbourou"))
        self.assertTrue(cruce.misma_calle("ovidio fernandes", "ovidio fernandez rios"))

    def test_calles_distintas_no_matchean(self):
        self.assertFalse(cruce.misma_calle("gutenberg", "minas"))
        self.assertFalse(cruce.misma_calle("picaflores", "gobernador vigodet"))

    def test_no_confunde_barrios_parecidos(self):
        # El error que tuvo el cruce a ojo: "Punta" hacia matchear tres barrios distintos.
        self.assertFalse(cruce.misma_calle("punta del este", "punta carretas"))

    def test_vacias_no_matchean(self):
        self.assertFalse(cruce.misma_calle("", "gutenberg"))
        self.assertFalse(cruce.misma_calle("gutenberg", ""))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_cruce -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'negocios.cruce'`

- [ ] **Step 3: Escribir la implementación**

Crear `negocios/cruce.py`:

```python
"""Empareja un negocio del Excel con una propiedad de la cartera viva.

Por que hace falta: el usuario anoto fechas de firma inventadas en negocios que en realidad
todavia no cobro. Si la propiedad sigue publicada en RE/MAX, la firma no ocurrio.

Por que es delicado: un cruce por barrio probado sobre los datos reales devolvio ~40
coincidencias de las cuales solo 5 eran verdaderas ("Punta" hacia matchear Punta Rieles con
Punta del Este y Punta Carretas). Por eso el nombre de calle es obligatorio.
"""
from __future__ import annotations

import difflib
import re
import unicodedata

# Que tan parecidos tienen que ser dos nombres de calle para considerarlos el mismo.
# 0.85 alcanza para "flamarrion" vs "flammarion" y no junta calles distintas.
PARECIDO_MINIMO = 0.85


def _sin_acentos(texto: str) -> str:
    normalizado = unicodedata.normalize("NFD", texto)
    return "".join(c for c in normalizado if unicodedata.category(c) != "Mn")


def partir_direccion(direccion):
    """'Flammarión 5000' -> ('flammarion', 5000). Sin numero, devuelve (calle, None)."""
    if not direccion:
        return ("", None)
    texto = _sin_acentos(str(direccion)).lower().strip()
    encontrado = re.search(r"\b(\d{2,5})\b", texto)
    if not encontrado:
        calle = re.sub(r"\s+", " ", texto).strip()
        return (calle, None)
    calle = re.sub(r"\s+", " ", texto[: encontrado.start()]).strip(" .,-")
    return (calle, int(encontrado.group(1)))


def bloque(numero):
    """RE/MAX publica la altura redondeada a la centena: el 3959 aparece como 3900."""
    if numero is None:
        return None
    return (numero // 100) * 100


def misma_calle(a: str, b: str) -> bool:
    """Compara nombres de calle tolerando errores de tipeo, que en el Excel abundan."""
    if not a or not b:
        return False
    if a == b:
        return True
    return difflib.SequenceMatcher(None, a, b).ratio() >= PARECIDO_MINIMO
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_cruce -v`
Expected: PASS — 13 tests OK

- [ ] **Step 5: Commit**

```bash
git add negocios/cruce.py tests/test_cruce.py
git commit -m "feat: partir direcciones y comparar calles tolerando errores de tipeo"
```

---

## Task 7: `cruce.emparejar()` — encontrar la propiedad de un negocio

**Files:**
- Modify: `negocios/cruce.py`
- Modify: `tests/test_cruce.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `tests/test_cruce.py`:

```python
CARTERA = {
    "prop-reducto": {
        "entity_id": "prop-reducto",
        "direccion": "San Fructuoso 1200",
        "precio": 89900.0,
        "estado": "reservada",
        "activa": True,
        "operacion": "venta",
    },
    "prop-malvin": {
        "entity_id": "prop-malvin",
        "direccion": "Flammarión 5000",
        "precio": 60000.0,
        "estado": "en_negociacion",
        "activa": True,
        "operacion": "venta",
    },
    "prop-colon": {
        "entity_id": "prop-colon",
        "direccion": "Gutenberg 6100",
        "precio": 490000.0,
        "estado": "publicada",
        "activa": True,
        "operacion": "venta",
    },
    "prop-vieja": {
        "entity_id": "prop-vieja",
        "direccion": "Minas 1600",
        "precio": 165000.0,
        "estado": "publicada",
        "activa": False,          # ya se dio de baja
        "operacion": "venta",
    },
}


class TestEmparejar(unittest.TestCase):
    def test_calle_bloque_y_precio_dan_confianza_alta(self):
        # Caso real: fila 82 del Excel contra la propiedad reservada de Reducto.
        r = cruce.emparejar("San fructuoso 1254", 89900.0, CARTERA)
        self.assertEqual(len(r), 1)
        self.assertEqual(r[0]["entity_id"], "prop-reducto")
        self.assertEqual(r[0]["confianza"], "alta")

    def test_tolera_el_error_de_tipeo_en_la_calle(self):
        # Caso real: fila 66, "flamarrion 5046" contra "Flammarión 5000".
        r = cruce.emparejar("flamarrion 5046", 58500.0, CARTERA)
        self.assertEqual(r[0]["entity_id"], "prop-malvin")
        self.assertEqual(r[0]["confianza"], "alta")

    def test_calle_y_bloque_sin_precio_parecido_dan_confianza_media(self):
        r = cruce.emparejar("Gutenberg 6155", 200000.0, CARTERA)
        self.assertEqual(r[0]["entity_id"], "prop-colon")
        self.assertEqual(r[0]["confianza"], "media")

    def test_calle_distinta_no_empareja_aunque_el_precio_coincida(self):
        # Esto es lo que rompia el cruce a ojo: el precio solo no alcanza.
        self.assertEqual(cruce.emparejar("Otra calle 100", 89900.0, CARTERA), [])

    def test_bloque_distinto_baja_la_confianza_pero_no_descarta(self):
        r = cruce.emparejar("San fructuoso 3400", 89900.0, CARTERA)
        self.assertEqual(r[0]["confianza"], "media")

    def test_no_empareja_contra_propiedades_dadas_de_baja(self):
        self.assertEqual(cruce.emparejar("Minas 1600", 165000.0, CARTERA), [])

    def test_sin_direccion_no_empareja(self):
        self.assertEqual(cruce.emparejar(None, 89900.0, CARTERA), [])
        self.assertEqual(cruce.emparejar("", 89900.0, CARTERA), [])

    def test_devuelve_los_motivos_para_mostrarselos_al_usuario(self):
        r = cruce.emparejar("San fructuoso 1254", 89900.0, CARTERA)
        self.assertIn("misma calle", r[0]["motivos"])
        self.assertIn("misma altura", r[0]["motivos"])
        self.assertIn("precio parecido", r[0]["motivos"])

    def test_ordena_primero_las_de_mayor_confianza(self):
        cartera = dict(CARTERA)
        cartera["otra-fructuoso"] = {
            "entity_id": "otra-fructuoso",
            "direccion": "San Fructuoso 4400",
            "precio": 20000.0,
            "estado": "publicada",
            "activa": True,
            "operacion": "venta",
        }
        r = cruce.emparejar("San fructuoso 1254", 89900.0, cartera)
        self.assertEqual(r[0]["confianza"], "alta")
        self.assertEqual(r[0]["entity_id"], "prop-reducto")
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_cruce.TestEmparejar -v`
Expected: FAIL con `AttributeError: module 'negocios.cruce' has no attribute 'emparejar'`

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `negocios/cruce.py`:

```python
# Cuanto puede diferir el precio para considerarlo "el mismo negocio".
TOLERANCIA_PRECIO = 0.10

ORDEN_CONFIANZA = {"alta": 0, "media": 1}


def emparejar(direccion: str, precio, cartera: dict) -> list:
    """Busca en la cartera viva las propiedades que podrian ser este negocio.

    El nombre de calle es OBLIGATORIO: sin eso, el cruce devuelve basura. Con calle,
    la altura y el precio suben la confianza. Devuelve la lista ordenada, mas confiable
    primero. Nunca decide sola: el usuario confirma.
    """
    calle, numero = partir_direccion(direccion)
    if not calle:
        return []

    resultados = []
    for entity_id, propiedad in cartera.items():
        if not propiedad.get("activa", True):
            continue
        calle_prop, numero_prop = partir_direccion(propiedad.get("direccion"))
        if not misma_calle(calle, calle_prop):
            continue

        motivos = ["misma calle"]
        if numero is not None and numero_prop is not None and bloque(numero) == bloque(numero_prop):
            motivos.append("misma altura")
        precio_prop = propiedad.get("precio")
        if precio and precio_prop:
            if abs(precio - precio_prop) <= precio_prop * TOLERANCIA_PRECIO:
                motivos.append("precio parecido")

        confianza = "alta" if len(motivos) == 3 else "media"
        resultados.append({
            "entity_id": entity_id,
            "confianza": confianza,
            "motivos": motivos,
            "direccion_cartera": propiedad.get("direccion"),
            "precio_cartera": precio_prop,
            "estado_cartera": propiedad.get("estado"),
        })

    resultados.sort(key=lambda r: (ORDEN_CONFIANZA[r["confianza"]], r["entity_id"]))
    return resultados
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_cruce -v`
Expected: PASS — 22 tests OK

- [ ] **Step 5: Commit**

```bash
git add negocios/cruce.py tests/test_cruce.py
git commit -m "feat: emparejar un negocio con la cartera viva por calle, altura y precio"
```

---

## Task 8: `importador` — traducir una fila del Excel a un negocio

**Files:**
- Create: `negocios/importador.py`
- Test: `tests/test_importador.py`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/test_importador.py`:

```python
import unittest

from negocios import importador

AJUSTES = {
    "categorias": [
        {"categoria": "RAP", "split_pct": 0.45, "fee_mensual_usd": 70,
         "desde": "2026-01-01", "hasta": None},
    ],
    "defaults_comision": {
        "venta": {"1": 0.03, "2": 0.06},
        "alquiler": {"1": 1.0, "2": 2.0},
    },
    "regla_martin": {"facturacion": 0.5, "ganancia": 0.35},
    "pct_suplencia": 0.125,
    "pct_referido_saliente": 0.25,
    "pct_referido_entrante_otro": 0.75,
}

YO = "Juan Andrés Otero"


def fila(**cambios):
    base = {
        "fila_excel": 5,
        "operacion": "Venta",
        "barrio": "Solymar norte",
        "direccion": "Picaflores",
        "agente_vende": YO,
        "agente_compra": "Otro REMAX",
        "origen": "Bdr",
        "precio": 140000.0,
        "pct_comision": 0.03,
        "facturado": 4200.0,
        "pct_agente": 0.5,
        "importe": 2100.0,
        "fecha_inicio": "2022-09-17",
        "fecha_boleto": "2022-10-24",
        "fecha_fin": "2023-01-24",
    }
    base.update(cambios)
    return base


class TestPuntas(unittest.TestCase):
    def test_ambos_agentes_soy_yo_son_dos_puntas(self):
        n = importador.traducir(fila(agente_vende=YO, agente_compra=YO), AJUSTES)
        self.assertEqual(n["puntas"], 2)

    def test_solo_vendedor_es_una_punta(self):
        n = importador.traducir(fila(agente_vende=YO, agente_compra="Otro REMAX"), AJUSTES)
        self.assertEqual(n["puntas"], 1)

    def test_solo_comprador_es_una_punta(self):
        n = importador.traducir(fila(agente_vende="Otro REMAX", agente_compra=YO), AJUSTES)
        self.assertEqual(n["puntas"], 1)

    def test_ninguno_soy_yo_son_cero_puntas(self):
        n = importador.traducir(fila(agente_vende="Otro REMAX", agente_compra="Otro REMAX"), AJUSTES)
        self.assertEqual(n["puntas"], 0)

    def test_agentes_vacios_son_cero_puntas_y_avisan(self):
        n = importador.traducir(fila(agente_vende=None, agente_compra=None), AJUSTES)
        self.assertEqual(n["puntas"], 0)
        self.assertIn("faltan_agentes", [a["tipo"] for a in n["avisos"]])


class TestRegimen(unittest.TestCase):
    def caso(self, origen):
        return importador.traducir(fila(origen=origen), AJUSTES)

    def test_bdr_redes_y_cliente_antiguo_son_captacion_propia(self):
        for origen in ("Bdr", "Redes Pago", "Cliente antiguo", "Ref. Bdr"):
            self.assertEqual(self.caso(origen)["regimen_comision"], "captacion_mia", origen)

    def test_ref_martin(self):
        self.assertEqual(self.caso("Ref. Martin")["regimen_comision"], "ref_martin")

    def test_ref_remax_team_y_clientes_son_de_otro_colega(self):
        for origen in ("Ref. Remax", "Ref. Team", "Ref. Clientes"):
            self.assertEqual(self.caso(origen)["regimen_comision"], "ref_otro_colega", origen)

    def test_guarda_el_origen_de_marketing_aparte_del_regimen(self):
        n = self.caso("Ref. Martin")
        self.assertEqual(n["origen_captacion"], "Referido - Martín")
        self.assertEqual(n["regimen_comision"], "ref_martin")

    def test_cero_puntas_con_captacion_propia_es_un_referido_saliente(self):
        # Si el negocio no es de nadie mio pero yo lo traje, se lo pase a un colega.
        n = importador.traducir(
            fila(agente_vende="Otro REMAX", agente_compra="Otro REMAX", origen="Bdr"), AJUSTES)
        self.assertEqual(n["regimen_comision"], "yo_referi")

    def test_origen_desconocido_avisa(self):
        n = self.caso("Otros")
        self.assertIn("origen_sin_clasificar", [a["tipo"] for a in n["avisos"]])

    def test_origen_vacio_avisa(self):
        n = self.caso(None)
        self.assertIn("origen_sin_clasificar", [a["tipo"] for a in n["avisos"]])


class TestCamposBasicos(unittest.TestCase):
    def test_el_id_dice_de_que_fila_del_excel_salio(self):
        self.assertEqual(importador.traducir(fila(fila_excel=37), AJUSTES)["id"], "excel-37")

    def test_traduce_el_tipo_de_negocio(self):
        self.assertEqual(importador.traducir(fila(operacion="Venta"), AJUSTES)["tipo_negocio"], "venta")
        self.assertEqual(importador.traducir(fila(operacion="Alquiler"), AJUSTES)["tipo_negocio"], "alquiler")

    def test_copia_direccion_barrio_precio_y_fechas(self):
        n = importador.traducir(fila(), AJUSTES)
        self.assertEqual(n["direccion"], "Picaflores")
        self.assertEqual(n["barrio"], "Solymar norte")
        self.assertEqual(n["precio_operacion"], 140000.0)
        self.assertEqual(n["fecha_inicio"], "2022-09-17")
        self.assertEqual(n["fecha_fin"], "2023-01-24")

    def test_la_moneda_es_dolares(self):
        # Todo el Excel esta en USD, incluidos los alquileres (un garaje a 90).
        self.assertEqual(importador.traducir(fila(), AJUSTES)["moneda"], "USD")

    def test_los_barrios_se_normalizan_en_mayusculas(self):
        # En el Excel conviven 'Cerrito' y 'cerrito', y eso inflaba la cuenta de barrios.
        a = importador.traducir(fila(barrio="Cerrito"), AJUSTES)["barrio"]
        b = importador.traducir(fila(barrio="cerrito"), AJUSTES)["barrio"]
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_importador -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'negocios.importador'`

- [ ] **Step 3: Escribir la implementación**

Crear `negocios/importador.py`:

```python
"""Convierte las filas del Excel en negocios completos, con sus avisos.

Reglas importantes (§9 de la especificacion):
- Antes de 2026 los numeros del Excel se respetan tal cual: RE/MAX cambio las reglas de
  comision varias veces y no tiene sentido recalcular con las de hoy.
- Desde enero de 2026 se recalcula con el motor nuevo, y si no coincide, se avisa.
- El importador NUNCA corrige solo: detecta, propone y deja un aviso.
"""
from __future__ import annotations

from negocios import motor

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
    """Una fila del Excel -> un negocio. Todavia sin calcular la plata (eso es la Task 9)."""
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
```

> `motor.pct_por_defecto` todavía no se usa acá: el Excel ya trae el porcentaje de cada
> negocio. Lo va a usar la carga manual de negocios nuevos, en la Fase 2b.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_importador -v`
Expected: PASS — 17 tests OK

- [ ] **Step 5: Commit**

```bash
git add negocios/importador.py tests/test_importador.py
git commit -m "feat: traducir una fila del Excel a un negocio"
```

---

## Task 9: `importador` — la regla de corte 2026

**Files:**
- Modify: `negocios/importador.py`
- Modify: `tests/test_importador.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `tests/test_importador.py`:

```python
class TestReglaDeCorte2026(unittest.TestCase):
    def test_antes_de_2026_respeta_los_numeros_del_excel(self):
        # RE/MAX cambio las reglas varias veces; recalcular el pasado lo deformaria.
        n = importador.calcular_plata(
            importador.traducir(fila(fecha_fin="2023-01-24", facturado=4200.0, importe=2100.0), AJUSTES),
            AJUSTES)
        self.assertEqual(n["facturacion"], 4200.0)
        self.assertEqual(n["ganancia"], 2100.0)
        self.assertFalse(n["recalculado"])

    def test_desde_2026_recalcula_con_el_motor_nuevo(self):
        n = importador.calcular_plata(
            importador.traducir(
                fila(fecha_fin="2026-03-15", precio=100000.0, pct_comision=0.03,
                     origen="Ref. Martin", facturado=3000.0, importe=1050.0), AJUSTES),
            AJUSTES)
        self.assertEqual(n["base"], 3000.0)
        self.assertEqual(n["facturacion"], 1500.0)
        self.assertEqual(n["ganancia"], 1050.0)
        self.assertTrue(n["recalculado"])
        self.assertEqual(n["categoria_vigente"], "RAP")

    def test_si_lo_recalculado_no_coincide_con_el_excel_avisa(self):
        n = importador.calcular_plata(
            importador.traducir(
                fila(fecha_fin="2026-03-15", precio=100000.0, pct_comision=0.03,
                     origen="Ref. Martin", facturado=3000.0, importe=1050.0), AJUSTES),
            AJUSTES)
        tipos = [a["tipo"] for a in n["avisos"]]
        self.assertIn("recalculo_distinto", tipos)
        aviso = [a for a in n["avisos"] if a["tipo"] == "recalculo_distinto"][0]
        self.assertIn("3000", aviso["detalle"])
        self.assertIn("1500", aviso["detalle"])

    def test_si_coincide_no_avisa(self):
        n = importador.calcular_plata(
            importador.traducir(
                fila(fecha_fin="2026-02-05", precio=309000.0, pct_comision=0.03,
                     origen="Bdr", agente_vende=YO, agente_compra="Otro REMAX",
                     facturado=9270.0, importe=4171.5), AJUSTES),
            AJUSTES)
        self.assertEqual(n["facturacion"], 9270.0)
        self.assertNotIn("recalculo_distinto", [a["tipo"] for a in n["avisos"]])

    def test_sin_fecha_de_firma_no_se_puede_saber_el_regimen_y_avisa(self):
        n = importador.calcular_plata(
            importador.traducir(fila(fecha_fin=None), AJUSTES), AJUSTES)
        self.assertIn("sin_fecha_fin", [a["tipo"] for a in n["avisos"]])

    def test_la_base_se_calcula_siempre_aunque_no_se_recalcule(self):
        n = importador.calcular_plata(
            importador.traducir(fila(fecha_fin="2023-01-24", precio=140000.0, pct_comision=0.03), AJUSTES),
            AJUSTES)
        self.assertEqual(n["base"], 4200.0)


class TestAvisosDeAritmetica(unittest.TestCase):
    def test_avisa_si_precio_por_porcentaje_no_da_el_facturado(self):
        # Caso real: fila 37, la celda guarda 770048 cuando deberia decir 770,048.
        n = importador.calcular_plata(
            importador.traducir(fila(precio=512, pct_comision=1.504, facturado=770048), AJUSTES),
            AJUSTES)
        tipos = [a["tipo"] for a in n["avisos"]]
        self.assertIn("aritmetica_no_cierra", tipos)

    def test_no_avisa_por_diferencias_de_redondeo(self):
        n = importador.calcular_plata(
            importador.traducir(fila(precio=100000.0, pct_comision=0.03, facturado=3000.4), AJUSTES),
            AJUSTES)
        self.assertNotIn("aritmetica_no_cierra", [a["tipo"] for a in n["avisos"]])

    def test_avisa_si_el_porcentaje_de_comision_es_absurdo(self):
        # Caso real: fila 51, 26.25 con formato de porcentaje se muestra como 2625%.
        n = importador.calcular_plata(
            importador.traducir(fila(pct_comision=26.25), AJUSTES), AJUSTES)
        self.assertIn("comision_absurda", [a["tipo"] for a in n["avisos"]])

    def test_un_alquiler_a_dos_meses_no_es_absurdo(self):
        n = importador.calcular_plata(
            importador.traducir(fila(operacion="Alquiler", precio=333.0, pct_comision=2.0,
                                     facturado=666.0), AJUSTES), AJUSTES)
        self.assertNotIn("comision_absurda", [a["tipo"] for a in n["avisos"]])


class TestSeparadorDecimalPerdido(unittest.TestCase):
    """Caso real fila 37: la celda guarda 770048 y el valor correcto es 770,048.

    Se distingue de un descuento real porque la diferencia es un factor EXACTO de 10, 100
    o 1000 — o sea, una coma que se perdio. Un descuento real difiere un 10 o 15%.
    """

    def test_corrige_solo_cuando_la_diferencia_es_por_mil(self):
        n = importador.calcular_plata(
            importador.traducir(fila(operacion="Alquiler", precio=512, pct_comision=1.504,
                                     facturado=770048, fecha_fin="2024-04-04"), AJUSTES),
            AJUSTES)
        self.assertAlmostEqual(n["facturacion"], 770.048, places=3)
        self.assertIn("separador_decimal", [a["tipo"] for a in n["avisos"]])

    def test_un_descuento_real_no_se_toca(self):
        # Fila 39: 109.000 x 3% = 3.270 pero el usuario cobro 2.772,96. Es un descuento.
        n = importador.calcular_plata(
            importador.traducir(fila(precio=109000.0, pct_comision=0.03,
                                     facturado=2772.96, fecha_fin="2024-05-16"), AJUSTES),
            AJUSTES)
        self.assertEqual(n["facturacion"], 2772.96)
        self.assertIn("aritmetica_no_cierra", [a["tipo"] for a in n["avisos"]])
        self.assertNotIn("separador_decimal", [a["tipo"] for a in n["avisos"]])

    def test_un_cobro_de_mas_tampoco_se_toca(self):
        # Fila 48: cobro 3.010 donde la cuenta daba 2.680. El usuario pidio respetarlo.
        n = importador.calcular_plata(
            importador.traducir(fila(precio=67000.0, pct_comision=0.04,
                                     facturado=3010.0, fecha_fin="2024-10-06"), AJUSTES),
            AJUSTES)
        self.assertEqual(n["facturacion"], 3010.0)

    def test_una_comision_absurda_no_dispara_la_correccion_por_mil(self):
        # Fila 51: la comision real es 2,625% (88.000 x 2,625% = 2.310, que es lo que dice
        # el Excel). Pero la celda guarda 26,25 en vez de 0,02625, asi que la cuenta da
        # 2.310.000 — tambien un factor 1000. El error esta en el %, NO en el facturado:
        # si "corrigieramos" el facturado destruiriamos el unico numero que estaba bien.
        n = importador.calcular_plata(
            importador.traducir(fila(precio=88000.0, pct_comision=26.25,
                                     facturado=2310.0, fecha_fin="2025-02-15"), AJUSTES),
            AJUSTES)
        self.assertEqual(n["facturacion"], 2310.0)
        self.assertIn("comision_absurda", [a["tipo"] for a in n["avisos"]])
        self.assertNotIn("separador_decimal", [a["tipo"] for a in n["avisos"]])
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_importador.TestReglaDeCorte2026 -v`
Expected: FAIL con `AttributeError: module 'negocios.importador' has no attribute 'calcular_plata'`

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `negocios/importador.py`:

```python
# Desde esta fecha se recalcula con las reglas de hoy; antes se respeta el Excel.
CORTE = "2026-01-01"

# Cuanto puede diferir una cuenta antes de considerarla un error y no un redondeo.
TOLERANCIA = 0.02

# Un porcentaje de comision por encima de esto no existe en la vida real: es un error
# de carga (un 2,625% escrito como 26.25 con formato de porcentaje se ve como 2625%).
COMISION_MAXIMA = {"venta": 0.20, "alquiler": 3.0, "renovacion_alquiler": 3.0, "suplencia": 0.20}


# Un facturado que difiere del esperado por un factor exacto de 10, 100 o 1000 no es un
# descuento: es una coma decimal que se perdio al cargar la celda.
FACTORES_DE_COMA = (10, 100, 1000)


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
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_importador -v`
Expected: PASS — 31 tests OK

- [ ] **Step 5: Commit**

```bash
git add negocios/importador.py tests/test_importador.py
git commit -m "feat: regla de corte 2026 y avisos de aritmetica"
```

---

## Task 10: `importador` — la firma inventada y los campos faltantes

**Files:**
- Modify: `negocios/importador.py`
- Modify: `tests/test_importador.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `tests/test_importador.py`:

```python
CARTERA_VIVA = {
    "prop-reducto": {
        "entity_id": "prop-reducto",
        "direccion": "San Fructuoso 1200",
        "precio": 89900.0,
        "estado": "reservada",
        "activa": True,
        "operacion": "venta",
    },
    "prop-cerrito": {
        "entity_id": "prop-cerrito",
        "direccion": "Estanislao Vega 3900",
        "precio": 43000.0,
        "estado": "en_negociacion",
        "activa": True,
        "operacion": "venta",
    },
}


class TestFirmaInventada(unittest.TestCase):
    def negocio(self, **cambios):
        n = importador.calcular_plata(importador.traducir(fila(**cambios), AJUSTES), AJUSTES)
        return importador.cruzar_con_cartera(n, CARTERA_VIVA)

    def test_una_venta_dada_por_cobrada_con_la_propiedad_viva_pasa_a_en_curso(self):
        # Caso real: fila 82, dada por firmada el 20/4/2026 pero la propiedad sigue reservada.
        n = self.negocio(direccion="San fructuoso 1254", precio=89900.0,
                         operacion="Venta", fecha_fin="2026-04-20")
        self.assertEqual(n["estado"], "en_curso")
        self.assertTrue(n["fecha_fin_estimada"])
        self.assertEqual(n["entity_id_cartera"], "prop-reducto")
        self.assertIn("firma_inventada", [a["tipo"] for a in n["avisos"]])

    def test_conserva_la_fecha_del_excel_como_referencia(self):
        n = self.negocio(direccion="San fructuoso 1254", precio=89900.0,
                         operacion="Venta", fecha_fin="2026-04-20")
        self.assertEqual(n["fecha_fin"], "2026-04-20")

    def test_un_alquiler_sobre_una_propiedad_hoy_en_VENTA_es_legitimo(self):
        # Se puede alquilar una propiedad y despues ponerla en venta. No es contradiccion.
        n = self.negocio(direccion="estanislao vega 3959", precio=329.0,
                         operacion="Alquiler", fecha_fin="2026-04-20")
        self.assertEqual(n["estado"], "cerrado")
        self.assertFalse(n["fecha_fin_estimada"])

    def test_una_venta_sin_propiedad_en_la_cartera_queda_cerrada(self):
        n = self.negocio(direccion="Calle que no existe 100", fecha_fin="2026-04-20")
        self.assertEqual(n["estado"], "cerrado")
        self.assertIsNone(n["entity_id_cartera"])

    def test_un_negocio_viejo_no_se_toca_aunque_la_calle_coincida(self):
        # Una venta de 2023 en la misma calle no significa que sea la misma propiedad.
        n = self.negocio(direccion="San fructuoso 1254", precio=89900.0,
                         operacion="Venta", fecha_fin="2023-05-01")
        self.assertEqual(n["estado"], "cerrado")

    def test_un_cruce_de_confianza_media_avisa_pero_no_cambia_el_estado(self):
        n = self.negocio(direccion="San fructuoso 4400", precio=20000.0,
                         operacion="Venta", fecha_fin="2026-04-20")
        self.assertEqual(n["estado"], "cerrado")
        self.assertIn("posible_cruce", [a["tipo"] for a in n["avisos"]])


class TestCamposFaltantes(unittest.TestCase):
    def revisar(self, **cambios):
        n = importador.traducir(fila(**cambios), AJUSTES)
        return [a["tipo"] for a in importador.revisar_faltantes(n)["avisos"]]

    def test_avisa_si_falta_la_fecha_de_inicio(self):
        self.assertIn("falta_fecha_inicio", self.revisar(fecha_inicio=None))

    def test_avisa_si_falta_el_boleto_en_una_venta(self):
        self.assertIn("falta_fecha_boleto", self.revisar(fecha_boleto=None))

    def test_no_pide_boleto_en_un_alquiler(self):
        self.assertNotIn("falta_fecha_boleto",
                         self.revisar(operacion="Alquiler", fecha_boleto=None))

    def test_avisa_si_falta_la_direccion(self):
        self.assertIn("falta_direccion", self.revisar(direccion=None))

    def test_avisa_si_falta_el_barrio(self):
        self.assertIn("falta_barrio", self.revisar(barrio=None))

    def test_una_ficha_completa_no_genera_avisos_de_faltantes(self):
        n = importador.traducir(fila(fecha_inicio=None, fecha_boleto=None), AJUSTES)
        n["ficha_completa"] = True
        self.assertEqual([a["tipo"] for a in importador.revisar_faltantes(n)["avisos"]], [])


class TestFechasRaras(unittest.TestCase):
    def revisar(self, **cambios):
        n = importador.traducir(fila(**cambios), AJUSTES)
        return [a["tipo"] for a in importador.revisar_fechas(n, "2026-08-17")["avisos"]]

    def test_avisa_si_la_firma_esta_en_el_futuro(self):
        # Casos reales: filas 60 y 66, con firma en noviembre y diciembre de 2026.
        self.assertIn("firma_futura", self.revisar(fecha_fin="2026-12-05"))

    def test_avisa_si_la_firma_es_anterior_al_boleto(self):
        # Caso real: fila 82.
        self.assertIn("fechas_al_reves",
                      self.revisar(fecha_boleto="2026-05-05", fecha_fin="2026-04-20"))

    def test_avisa_si_el_boleto_es_anterior_al_inicio(self):
        self.assertIn("fechas_al_reves",
                      self.revisar(fecha_inicio="2026-05-05", fecha_boleto="2026-04-20"))

    def test_fechas_normales_no_avisan(self):
        self.assertEqual(self.revisar(), [])
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_importador.TestFirmaInventada -v`
Expected: FAIL con `AttributeError: module 'negocios.importador' has no attribute 'cruzar_con_cartera'`

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `negocios/importador.py`:

```python
from negocios import cruce  # noqa: E402  (va acá para no cruzar imports al inicio)

# Los alquileres solo entran en contradiccion si la propiedad sigue publicada EN ALQUILER.
# Alquilar una propiedad y despues ponerla en venta es de lo mas normal.
FAMILIA_ALQUILER = ("alquiler", "renovacion_alquiler")


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
    propiedad_en_alquiler = mejor["estado_cartera"] and cartera[mejor["entity_id"]].get("operacion") == "alquiler"
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
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_importador -v`
Expected: PASS — 47 tests OK

- [ ] **Step 5: Commit**

```bash
git add negocios/importador.py tests/test_importador.py
git commit -m "feat: detectar firmas inventadas, campos faltantes y fechas raras"
```

---

## Task 11: `importador.importar()` — juntar todo

**Files:**
- Modify: `negocios/importador.py`
- Modify: `tests/test_importador.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `tests/test_importador.py`:

```python
class TestImportarTodo(unittest.TestCase):
    def test_devuelve_un_negocio_por_fila(self):
        filas = [fila(fila_excel=2), fila(fila_excel=3), fila(fila_excel=4)]
        negocios = importador.importar(filas, AJUSTES, CARTERA_VIVA, "2026-08-17")
        self.assertEqual(len(negocios), 3)
        self.assertEqual([n["id"] for n in negocios], ["excel-2", "excel-3", "excel-4"])

    def test_aplica_toda_la_cadena_de_revisiones(self):
        filas = [fila(fila_excel=60, fecha_inicio=None, fecha_boleto=None,
                      fecha_fin="2026-12-05", direccion="juana de ibarburu")]
        n = importador.importar(filas, AJUSTES, CARTERA_VIVA, "2026-08-17")[0]
        tipos = [a["tipo"] for a in n["avisos"]]
        self.assertIn("falta_fecha_inicio", tipos)
        self.assertIn("falta_fecha_boleto", tipos)
        self.assertIn("firma_futura", tipos)

    def test_todo_lo_que_sale_se_puede_guardar_como_json(self):
        import json
        negocios = importador.importar([fila()], AJUSTES, CARTERA_VIVA, "2026-08-17")
        json.dumps(negocios, ensure_ascii=False)

    def test_los_ids_son_unicos(self):
        filas = [fila(fila_excel=i) for i in range(2, 20)]
        negocios = importador.importar(filas, AJUSTES, CARTERA_VIVA, "2026-08-17")
        ids = [n["id"] for n in negocios]
        self.assertEqual(len(ids), len(set(ids)))
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `python -m unittest tests.test_importador.TestImportarTodo -v`
Expected: FAIL con `AttributeError: module 'negocios.importador' has no attribute 'importar'`

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `negocios/importador.py`:

```python
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
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `python -m unittest tests.test_importador -v`
Expected: PASS — 51 tests OK

- [ ] **Step 5: Correr TODA la batería**

Run: `python -m unittest discover -s tests -t . 2>&1 | grep -E "^(Ran|OK|FAILED)"`
Expected: `OK`, cero fallas — **193 tests** (68 del robot + 7 ajustes + 31 motor + 14 excel + 22 cruce + 51 importador)

- [ ] **Step 6: Commit**

```bash
git add negocios/importador.py tests/test_importador.py
git commit -m "feat: cadena completa de importacion"
```

---

## Task 12: El script de importación

**Files:**
- Create: `herramientas/importar_excel.py`

- [ ] **Step 1: Escribir el script**

Crear `herramientas/importar_excel.py`:

```python
"""Importa negocios.xlsx a datos/negocios.json.

Se corre a mano cuando se quiere volver a importar desde cero. No pisa nada que no sea
datos/negocios.json.

Uso:  python herramientas/importar_excel.py
      DRY_RUN=1 python herramientas/importar_excel.py    (muestra el resumen, no escribe)
"""
from __future__ import annotations

import collections
import datetime
import os
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from robot import almacen                       # noqa: E402
from negocios import excel, importador          # noqa: E402


def main() -> int:
    seco = os.environ.get("DRY_RUN") == "1"
    hoy = os.environ.get("FECHA_HOY") or datetime.date.today().isoformat()

    ajustes = almacen.leer_json("ajustes.json", None)
    if ajustes is None:
        print("ERROR: falta datos/ajustes.json", file=sys.stderr)
        return 1

    cartera = almacen.leer_json("cartera.json", {})
    filas = excel.leer()
    negocios = importador.importar(filas, ajustes, cartera, hoy)

    print(f"Importados {len(negocios)} negocios desde el Excel.\n")

    por_anio = collections.Counter()
    facturacion = collections.defaultdict(float)
    for n in negocios:
        anio = n["fecha_fin"][:4] if n["fecha_fin"] else "sin fecha"
        por_anio[anio] += 1
        if n["estado"] == "cerrado" and n["facturacion"]:
            facturacion[anio] += n["facturacion"]

    print("Por año (solo cuenta lo cerrado en la facturacion):")
    for anio in sorted(por_anio):
        print(f"  {anio}: {por_anio[anio]:3} negocios | facturado {facturacion[anio]:>10,.0f}")

    en_curso = [n for n in negocios if n["estado"] == "en_curso"]
    if en_curso:
        print(f"\n{len(en_curso)} negocios pasaron a EN CURSO (la propiedad sigue viva):")
        for n in en_curso:
            print(f"  {n['id']:10} {n['direccion'][:32]:32} figuraba firmado el {n['fecha_fin']}")

    avisos = collections.Counter(a["tipo"] for n in negocios for a in n["avisos"])
    print(f"\nPendientes por resolver ({sum(avisos.values())} en total):")
    for tipo, cantidad in avisos.most_common():
        print(f"  {cantidad:3}  {tipo}")

    if seco:
        print("\nDRY_RUN: no se escribio nada")
        return 0

    almacen.escribir_json("negocios.json", negocios)
    print(f"\nGuardado en datos/negocios.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Probar en seco**

Run: `DRY_RUN=1 python herramientas/importar_excel.py`
Expected: imprime `Importados 85 negocios desde el Excel.`, el desglose por año, la lista de negocios que pasaron a *en curso*, el recuento de pendientes, y termina con `DRY_RUN: no se escribio nada`. No se crea `datos/negocios.json`.

- [ ] **Step 3: Verificar los números contra lo ya sabido**

El desglose por año tiene que dar, en negocios: **2022: 3 · 2023: 26 · 2024: 21 · 2025: 24 · 2026: 11**.

La facturación de 2022 a 2025 tiene que dar **1.770 · 58.984 · 40.125 · 43.965** (esos años se respetan tal cual del Excel).

La de 2026 tiene que dar **menos que 41.089**, porque los negocios cuya propiedad sigue viva pasan a *en curso* y no cuentan.

Si algún número no da, parar y revisar antes de escribir nada.

- [ ] **Step 4: Correr de verdad**

Run: `python herramientas/importar_excel.py`
Expected: mismo resumen y `Guardado en datos/negocios.json`

- [ ] **Step 5: Commit**

```bash
git add herramientas/importar_excel.py datos/negocios.json
git commit -m "feat: script de importacion del Excel + primera importacion"
```

---

## Task 13: Test de extremo a extremo con los 85 negocios reales

**Files:**
- Create: `tests/test_importacion_real.py`

- [ ] **Step 1: Escribir el test**

Crear `tests/test_importacion_real.py`:

```python
import collections
import unittest

from robot import almacen


class TestImportacionReal(unittest.TestCase):
    """Verifica el resultado guardado en datos/negocios.json contra lo que ya sabemos
    del Excel del usuario (analizado a mano el 2026-08-17)."""

    @classmethod
    def setUpClass(cls):
        cls.negocios = almacen.leer_json("negocios.json", None)

    def test_el_archivo_existe(self):
        self.assertIsNotNone(self.negocios, "falta datos/negocios.json — corre el importador")

    def test_hay_85_negocios(self):
        self.assertEqual(len(self.negocios), 85)

    def test_46_alquileres_y_39_ventas(self):
        tipos = collections.Counter(n["tipo_negocio"] for n in self.negocios)
        self.assertEqual(tipos["alquiler"], 46)
        self.assertEqual(tipos["venta"], 39)

    def test_la_facturacion_de_los_anios_viejos_coincide_con_el_excel(self):
        esperado = {"2022": 1770, "2023": 58984, "2024": 40125, "2025": 43965}
        real = collections.defaultdict(float)
        for n in self.negocios:
            if n["fecha_fin"] and n["facturacion"]:
                real[n["fecha_fin"][:4]] += n["facturacion"]
        for anio, monto in esperado.items():
            self.assertAlmostEqual(real[anio], monto, delta=3, msg=f"año {anio}")

    def test_las_puntas_promedio_dan_1_59(self):
        promedio = sum(n["puntas"] for n in self.negocios) / len(self.negocios)
        self.assertAlmostEqual(promedio, 1.59, places=2)

    def test_los_negocios_de_2026_estan_recalculados(self):
        de_2026 = [n for n in self.negocios if n["fecha_fin"] and n["fecha_fin"] >= "2026-01-01"]
        self.assertEqual(len(de_2026), 11)
        for n in de_2026:
            self.assertTrue(n["recalculado"], f"{n['id']} no se recalculo")
            self.assertEqual(n["categoria_vigente"], "RAP")

    def test_los_negocios_viejos_NO_estan_recalculados(self):
        viejos = [n for n in self.negocios if n["fecha_fin"] and n["fecha_fin"] < "2026-01-01"]
        for n in viejos:
            self.assertFalse(n["recalculado"], f"{n['id']} se recalculo y no debia")

    def test_detecta_la_fila_82_como_firma_inventada(self):
        # San Fructuoso: dada por firmada, pero la propiedad sigue reservada en RE/MAX.
        n = next(x for x in self.negocios if x["id"] == "excel-82")
        self.assertEqual(n["estado"], "en_curso")
        self.assertTrue(n["fecha_fin_estimada"])
        self.assertIsNotNone(n["entity_id_cartera"])

    def test_detecta_la_fila_37_con_la_coma_decimal_perdida(self):
        n = next(x for x in self.negocios if x["id"] == "excel-37")
        self.assertIn("aritmetica_no_cierra", [a["tipo"] for a in n["avisos"]])

    def test_detecta_la_fila_51_con_el_porcentaje_absurdo(self):
        n = next(x for x in self.negocios if x["id"] == "excel-51")
        self.assertIn("comision_absurda", [a["tipo"] for a in n["avisos"]])

    def test_hay_17_negocios_sin_fecha_de_inicio(self):
        sin_inicio = [n for n in self.negocios if not n["fecha_inicio"]]
        self.assertEqual(len(sin_inicio), 17)

    def test_los_barrios_quedaron_normalizados(self):
        barrios = {n["barrio"] for n in self.negocios if n["barrio"]}
        minusculas = {b.lower() for b in barrios}
        self.assertEqual(len(barrios), len(minusculas),
                         "hay barrios que solo difieren en mayusculas")

    def test_todos_tienen_regimen_valido(self):
        from negocios import motor
        for n in self.negocios:
            self.assertIn(n["regimen_comision"], motor.REGIMENES, n["id"])

    def test_ninguno_tiene_ganancia_mayor_que_la_facturacion(self):
        # Salvo las suplencias, que no facturan pero si dejan ganancia.
        for n in self.negocios:
            if n["regimen_comision"] == "suplencia":
                continue
            if n["facturacion"] and n["ganancia"]:
                self.assertLessEqual(n["ganancia"], n["facturacion"] + 0.01, n["id"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr el test**

Run: `python -m unittest tests.test_importacion_real -v`
Expected: PASS — 14 tests OK

> Si `test_hay_17_negocios_sin_fecha_de_inicio` falla, verificar el conteo real con:
> `python -c "import json;n=json.load(open('datos/negocios.json',encoding='utf-8'));print(sum(1 for x in n if not x['fecha_inicio']))"`
> y ajustar el número esperado en el test si el Excel cambió desde el análisis.

- [ ] **Step 3: Correr TODA la batería**

Run: `python -m unittest discover -s tests -t . 2>&1 | grep -E "^(Ran|OK|FAILED)"`
Expected: `OK`, cero fallas

- [ ] **Step 4: Commit y subir**

```bash
git add tests/test_importacion_real.py
git commit -m "test: verificar la importacion real contra los numeros conocidos"
git push origin main
```

---

## Task 14: Los números reales, a la vista

Esta tarea no escribe código: produce el informe que responde *"¿cuánto facturé realmente en 2026?"*.

**Files:**
- Create: `herramientas/resumen.py`

- [ ] **Step 1: Escribir la herramienta**

Crear `herramientas/resumen.py`:

```python
"""Imprime el estado del negocio con los datos ya importados.

Es la version en texto de lo que despues va a mostrar la pantalla de Salud del Negocio.
Sirve para verificar los numeros antes de construir la interfaz.

Uso:  python herramientas/resumen.py
"""
from __future__ import annotations

import collections
import datetime
import pathlib
import statistics as st
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from robot import almacen    # noqa: E402

ANIO = "2026"


def main() -> int:
    negocios = almacen.leer_json("negocios.json", [])
    cartera = almacen.leer_json("cartera.json", {})
    ajustes = almacen.leer_json("ajustes.json", {})
    if not negocios:
        print("No hay negocios importados. Corre: python herramientas/importar_excel.py")
        return 1

    del_anio = [n for n in negocios if n["fecha_fin"] and n["fecha_fin"][:4] == ANIO]
    cerrados = [n for n in del_anio if n["estado"] == "cerrado"]
    en_curso = [n for n in del_anio if n["estado"] == "en_curso"]

    cobrado = sum(n["facturacion"] or 0 for n in cerrados)
    ganado = sum(n["ganancia"] or 0 for n in cerrados)
    casi = sum(n["facturacion"] or 0 for n in en_curso)
    casi_gan = sum(n["ganancia"] or 0 for n in en_curso)

    print("=" * 66)
    print(f"  SALUD DEL NEGOCIO — {ANIO}")
    print("=" * 66)
    print(f"\n  CAPA 1 · COBRADO      {len(cerrados):2} negocios | "
          f"facturado {cobrado:>9,.0f} | ganancia {ganado:>8,.0f}")
    print(f"  CAPA 2 · CASI SEGURO  {len(en_curso):2} negocios | "
          f"facturado {casi:>9,.0f} | ganancia {casi_gan:>8,.0f}")

    # Ratios reales, con mediana para que no los rompan los errores de tipeo.
    def ratios(tipo):
        base = [n for n in negocios if n["tipo_negocio"] == tipo
                and n["precio_operacion"] and n["facturacion"]]
        if not base:
            return (0.0, 0.0)
        return (st.median(n["facturacion"] / n["precio_operacion"] for n in base),
                st.median((n["ganancia"] or 0) / n["precio_operacion"] for n in base))

    r_fact, r_gan = ratios("venta")
    prob = ajustes.get("probabilidades_cierre", {})
    capa3_f = capa3_g = 0.0
    usadas = []
    for propiedad in cartera.values():
        if not propiedad.get("activa") or not propiedad.get("usar_en_proyeccion"):
            continue
        if any(n.get("entity_id_cartera") == propiedad["entity_id"] for n in en_curso):
            continue    # ya contada en la capa 2
        p = prob.get(propiedad["estado"], 0)
        capa3_f += propiedad["precio"] * r_fact * p
        capa3_g += propiedad["precio"] * r_gan * p
        usadas.append((propiedad["direccion"], propiedad["estado"], propiedad["precio"], p))

    print(f"  CAPA 3 · POTENCIAL    {len(usadas):2} propiedades | "
          f"facturado {capa3_f:>9,.0f} | ganancia {capa3_g:>8,.0f}")
    print(f"\n  {'TOTAL SI TODO CIERRA':<22}   | "
          f"facturado {cobrado + casi + capa3_f:>9,.0f}")

    objetivo = ajustes.get("objetivo_personal", {}).get(ANIO)
    if objetivo:
        hoy = datetime.date.today()
        dia = (hoy - datetime.date(int(ANIO), 1, 1)).days + 1
        calendario = dia / 365
        avance = cobrado / objetivo
        estado = "VAS A RITMO" if avance >= calendario else "VAS ATRASADO"
        print(f"\n  Objetivo {ANIO}: {objetivo:,}")
        print(f"  Cobrado: {cobrado:,.0f} = {avance * 100:.1f}%  |  "
              f"calendario: {calendario * 100:.1f}%  ->  {estado}")
        print(f"  Proyeccion a fin de año con lo cobrado: {cobrado / calendario:,.0f}")

    print(f"\n  Ratios reales (mediana): venta factura {r_fact * 100:.2f}% "
          f"y deja {r_gan * 100:.2f}% del precio")

    print("\n  Propiedades usadas en la capa 3:")
    for direccion, estado, precio, p in sorted(usadas, key=lambda x: -x[2]):
        print(f"    {estado:15} USD {precio:>9,.0f}  x{p:.0%}  {direccion}")

    avisos = collections.Counter(a["tipo"] for n in negocios for a in n["avisos"])
    print(f"\n  PENDIENTES: {sum(avisos.values())}")
    for tipo, cantidad in avisos.most_common():
        print(f"    {cantidad:3}  {tipo}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Correr y leer el resultado**

Run: `python herramientas/resumen.py`
Expected: imprime las tres capas, el ritmo contra el calendario, los ratios y la lista de pendientes.

**Lo que hay que verificar a ojo:** la capa 1 de 2026 tiene que dar **entre 25.000 y 28.000**, no 41.089. Si da 41.089, la regla de firma inventada no está funcionando.

- [ ] **Step 3: Commit y subir**

```bash
git add herramientas/resumen.py
git commit -m "feat: resumen en texto de la salud del negocio"
git push origin main
```

---

## Verificación final de la fase

- [ ] `python -m unittest discover -s tests -t .` → **OK, cero fallas**
- [ ] `datos/negocios.json` tiene los 85 negocios
- [ ] Los años 2022-2025 facturan igual que el Excel (1.770 / 58.984 / 40.125 / 43.965)
- [ ] Los 11 negocios de 2026 están recalculados con RAP 45%
- [ ] La fila 82 quedó como `en_curso` con `fecha_fin_estimada`
- [ ] La capa 1 de 2026 da entre 25.000 y 28.000, no 41.089
- [ ] `python herramientas/resumen.py` imprime el tablero completo
- [ ] Todo subido a GitHub

**Al terminar hay números correctos y verificables.** La Fase 2b construye las pantallas que los muestran, la carga manual de negocios nuevos y la bandeja de pendientes para despachar los avisos.
