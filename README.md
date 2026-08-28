# ¿Cómo venimos? 🏠📊

Control de cartera y salud del negocio inmobiliario de Juan Andrés Otero (RE/MAX Único).

Reemplaza el Excel: lleva el día a día de las propiedades publicadas, los negocios cerrados
y la plata (facturación y ganancia).

**App:** https://juanandresotero.github.io/como-venimos/ — se agrega a la pantalla de inicio
del celular y funciona sin señal.

## Estado

Las cuatro fases están construidas.

| Fase | Qué hace |
|---|---|
| ✅ 1 · Robot de cartera | Anota todos los días qué pasa con la cartera |
| ✅ 2 · Import del Excel, Negocios y Salud | Los 85 negocios históricos, con la plata recalculada |
| ✅ 3 · Cartera | Ficha de cada propiedad, línea de tiempo y alta manual de negocios |
| ✅ 4 · Calculadora de renta y reporte | Renta real, ficha para el cliente y reporte descargable |

**413 tests** en verde: 216 de Python y 197 de JavaScript. Sin dependencias — Python 3.13 y
JavaScript de fábrica. (`openpyxl` se usa solo para leer el Excel una vez, y se importa
dentro de la función que lo lee: ni el robot ni la app lo necesitan.)

## Las cinco pantallas

| Pantalla | Para qué |
|---|---|
| 📌 **Hoy** | La bandeja de pendientes, ordenada por lo que puede ser plata |
| 🏠 **Cartera** | Las propiedades publicadas, su línea de tiempo y lo que dio cada una |
| 💵 **Negocios** | Los 85 del Excel más los que cargás a mano, con ficha editable |
| 📊 **Salud** | Las tres capas de plata, el ritmo contra el calendario y qué hacer |
| 🧮 **Renta** | La calculadora, con la ficha en imagen para mandarle al cliente |

El engranaje de arriba a la derecha abre **Ajustes**: la llave de GitHub, el objetivo del
año, la categoría y las comisiones por defecto.

## Cómo funciona el robot

Todos los días a las 6 de la mañana, GitHub le pregunta a la API pública de RE/MAX por las
propiedades del agente y anota los cambios en `datos/`:

| Archivo | Dueño | Qué guarda |
|---|---|---|
| `datos/cartera.json` | Robot | Cada propiedad con su historial de precios y sus fechas |
| `datos/eventos.json` | Robot | La bitácora de novedades. Se agrega al final, nunca se borra |
| `datos/estado_robot.json` | Robot | Si la última corrida salió bien y cuándo fue |
| `datos/agentes_remax.json` | Robot | Las 12 oficinas de RE/MAX Uruguay y sus 373 agentes |
| `datos/referidas.json` | Robot | Lo que vio en la cartera de los colegas a los que referiste |
| `datos/negocios.json` | App | Los negocios: la plata |
| `datos/mis_datos.json` | App | Lo que editás de la cartera y los eventos que ya atendiste |
| `datos/ajustes.json` | App | Categoría, objetivos, comisiones, probabilidades |
| `datos/calculos_renta.json` | App | Los cálculos de renta guardados |

**Cada archivo tiene un único dueño.** El robot escribe desde GitHub Actions y la app desde
el celular; si los dos tocaran el mismo archivo terminarían pisándose. Lo que editás de una
propiedad va a `mis_datos.json` y se superpone al leer, de los dos lados.

Lo que detecta: altas, cambios de precio, pasos a negociación y reserva, bajas (proponiendo
si se vendió o se cayó), reapariciones y propiedades publicadas dos veces.

**Guarda siempre, salga bien o mal.** Si la API de RE/MAX se cae, el robot igual escribe el
error en `estado_robot.json` y lo commitea, para que la app pueda mostrar la alerta roja de
"el robot no corre hace N días". Como ese archivo cambia todos los días (guarda la fecha de
la corrida), el repositorio nunca pasa 60 días sin actividad y GitHub no apaga el cron.

**El robot nunca decide un desenlace.** Propone, y el usuario confirma desde la app.

**El robot nunca pisa lo que cargás a mano.** Fecha de captación, origen, notas y desenlace
confirmado son tuyos. Hay una batería de tests dedicada solo a garantizar esto.

## Cómo guarda la app

Con un token de GitHub (fine-grained, limitado a este repo, permiso de contenido) que se
genera una vez desde Ajustes y queda en el teléfono. Sin conexión la app funciona igual: los
cambios se encolan y suben cuando vuelve la señal.

El token vive en `localStorage`, o sea **por dirección web**: hay que cargarlo una vez en
cada dominio desde el que se use la app.

## Correrlo a mano

```bash
python -m robot.main              # corrida normal
DRY_RUN=1 python -m robot.main    # muestra lo que haría, sin escribir

python -m http.server 8765        # ver la app en http://127.0.0.1:8765
```

En PowerShell la variable va aparte: `$env:DRY_RUN=1; python -m robot.main`

## Tests

```bash
python -m unittest discover -s tests -t .   # 216
node --test tests-js/*.test.mjs             # 197
```

Ojo: `node --test tests-js/` (la carpeta, sin el patrón) **no funciona**.

Para refrescar el ejemplo de datos reales con el que se prueban los módulos:

```bash
python herramientas/grabar_fixture.py
```

## Diseño

- Especificación: [`docs/superpowers/specs/2026-08-17-como-venimos-design.md`](docs/superpowers/specs/2026-08-17-como-venimos-design.md)
- Planes de cada fase: [`docs/superpowers/plans/`](docs/superpowers/plans/)

Datos públicos de RE/MAX. Sin claves ni secretos.
