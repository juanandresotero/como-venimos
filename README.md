# ¿Cómo venimos? 🏠📊

Control de cartera y salud del negocio inmobiliario de Juan Andrés Otero (RE/MAX Único).

Reemplaza el Excel: lleva el día a día de las propiedades publicadas, los negocios cerrados
y la plata (facturación y ganancia).

## Estado

- ✅ **Fase 1 — Robot de cartera** (esto): anota todos los días qué pasa con la cartera.
- ⬜ Fase 2 — Import del Excel + Negocios + Salud del negocio + reporte descargable
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
si se vendió o se cayó), reapariciones y propiedades publicadas dos veces.

**Guarda siempre, salga bien o mal.** Si la API de RE/MAX se cae, el robot igual escribe el
error en `estado_robot.json` y lo commitea, para que la app pueda mostrar la alerta roja de
"el robot no corre hace N días". Como ese archivo cambia todos los días (guarda la fecha de
la corrida), el repositorio nunca pasa 60 días sin actividad y GitHub no apaga el cron.

**El robot nunca decide un desenlace.** Propone, y el usuario confirma desde la app.

**El robot nunca pisa lo que cargás a mano.** Fecha de captación, origen, notas y desenlace
confirmado son tuyos; el robot los crea vacíos una vez y no los vuelve a tocar. Hay una
batería de tests dedicada solo a garantizar esto.

## Correrlo a mano

```bash
python -m robot.main              # corrida normal
DRY_RUN=1 python -m robot.main    # muestra lo que haría, sin escribir
```

En PowerShell la variable va aparte: `$env:DRY_RUN=1; python -m robot.main`

## Tests

```bash
python -m unittest discover -s tests -t . -v
```

68 tests. Solo librería estándar de Python 3.13 — no hay nada que instalar.

Para refrescar el ejemplo de datos reales con el que se prueban los módulos:

```bash
python herramientas/grabar_fixture.py
```

## Diseño

- Especificación: [`docs/superpowers/specs/2026-08-17-como-venimos-design.md`](docs/superpowers/specs/2026-08-17-como-venimos-design.md)
- Plan de esta fase: [`docs/superpowers/plans/2026-08-17-robot-cartera.md`](docs/superpowers/plans/2026-08-17-robot-cartera.md)

Datos públicos de RE/MAX. Sin claves ni secretos.
