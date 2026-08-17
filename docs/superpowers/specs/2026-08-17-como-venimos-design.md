# ¿Cómo venimos? — Diseño

- **Fecha:** 2026-08-17
- **Usuario:** Juan Andrés Otero — Agente inmobiliario, RE/MAX Único (Montevideo)
- **Estado:** Diseño aprobado. Listo para plan de implementación.

---

## 1. Qué es y para qué

Una web app que se abre en el celular como si fuera una app (PWA), que **reemplaza el
Excel** con el que hoy se lleva el control económico del negocio inmobiliario.

Hace tres cosas:

1. **Vigila sola** la cartera publicada en RE/MAX y anota todos los movimientos (altas,
   cambios de precio, negociación, reserva, bajas).
2. **Guarda los negocios** cerrados con su plata (facturación y ganancia), incluyendo los
   que el robot no puede ver.
3. **Muestra la salud del negocio**: qué se facturó, qué se ganó, qué se proyecta, dónde
   se vende, en cuánto tiempo, y cuánto falta para los objetivos.

**No reemplaza** a *App Busquedas* (clientes compradores) ni al *Monitor Propiedades Team*
(propiedades de colegas para Marketplace). Son proyectos distintos.

## 2. Principios

| Principio | Qué significa en la práctica |
|---|---|
| **Ágil antes que completa** | Cero librerías pesadas. Carga instantánea. Funciona sin señal. |
| **La app supone, el humano confirma** | Nunca un formulario en blanco. Siempre calcula el escenario óptimo y deja el número editable. |
| **Nada se pierde** | Todo dato es editable siempre, incluso después de dar un negocio por completo. |
| **Lo pendiente salta primero** | Si algo se cerró o falta un dato, es lo primero que se ve al abrir. |
| **Honestidad en los números** | Si un dato es una suposición, se marca como tal. Nunca se presenta una estimación como si fuera un hecho. |

---

## 3. Arquitectura

Mismo patrón que el proyecto *Parecidas*, que ya está probado y en uso.

| Pieza | Función |
|---|---|
| **Robot** (Python, sin dependencias externas) | Corre 1 vez por día. Consulta la API pública de RE/MAX y registra el estado de la cartera. |
| **GitHub Actions** | Cron diario a las 09:00 UTC (≈06:00 Uruguay). Gratis. Ejecutable a mano. |
| **GitHub Pages** | Sirve la app estática. Se agrega a la pantalla de inicio del celular. |
| **Datos** | Archivos JSON versionados en el repo. La app los lee; las ediciones del usuario se guardan y se commitean. |

### 3.1 Fuente de datos del robot

```
GET https://api-ar.redremax.com/remaxweb-uy/api/listings/findAllWithEntrepreneurships
    ?page=0&pageSize=100
    &eq=associateId:385bebaf-55e1-4fcb-85e6-10f6619d635e
    &eq=entrepreneurship:false
```

Verificado el 2026-08-17: devuelve 12 propiedades (6 `active`, 5 `negotiation`,
1 `reserved`). Es una API JSON, no scraping de HTML — mucho más estable.

Campos aprovechables: `entityId`, `id`, `internalId`, `title`, `slug`, `operation`,
`type`, `price`, `currency`, `expensesPrice`, `expensesCurrency`, `displayAddress`,
`geoLabel`, `location` (lat/lon), `dimensionLand`, `dimensionTotalBuilt`,
`dimensionCovered`, `bedrooms`, `bathrooms`, `totalRooms`, `listingStatus`, `photos`.

**Clave de identidad: `entityId` (UUID).** No usar `slug` ni el link: cuando se edita un
aviso, RE/MAX le cambia la URL. (Problema ya sufrido en el proyecto *Monitor Propiedades
Team*.) `internalId` (`940041154-217`) se guarda como clave secundaria legible.

### 3.2 Salud del robot

La app muestra siempre arriba: **"Actualizado hoy 6:04"**. Si pasan más de 48 h sin una
corrida exitosa, se muestra una alerta roja. Motivo: en *Parecidas* el robot estuvo caído
semanas sin que nadie se enterara.

---

## 4. Modelo de datos

Cuatro colecciones. Se guardan como JSON en el repo.

### 4.1 `cartera` — propiedades publicadas

**Escribe el robot (diario, automático):**

| Campo | Origen |
|---|---|
| `entity_id`, `internal_id`, `listing_id` | API |
| `titulo`, `slug`, `link` | API |
| `operacion` (venta / alquiler) | API |
| `tipo` (casa / apartamento / local / terreno / …) | API |
| `precio`, `moneda` | API |
| `direccion`, `barrio`, `lat`, `lon` | API (`displayAddress`, `geoLabel`, `location`) |
| `m2_terreno`, `m2_total`, `m2_cubierto` | API |
| `dormitorios`, `banos`, `ambientes` | API |
| `estado` (publicada / en negociación / reservada) | API (`listingStatus`) |
| `foto_portada` | API |

**Deriva y acumula el robot:**

| Campo | Qué es |
|---|---|
| `visto_primera_vez` | Primer día que el robot la vio |
| `visto_ultima_vez` | Último día que la vio |
| `historial_precio[]` | `{fecha, precio, moneda}` — una entrada por cada cambio |
| `fecha_negociacion` | Primer día en estado `negotiation` |
| `fecha_reservada` | Primer día en estado `reserved` |
| `fecha_desaparicion` | Primer día que dejó de aparecer |
| `estado_al_desaparecer` | El último estado conocido antes de irse |
| `desenlace_propuesto` | `vendida` \| `caida` \| `null` (ver §6) |
| `posible_duplicado_de` | `entity_id` de otra propiedad con misma dirección y precio |

**Completa el usuario:**

| Campo | Notas |
|---|---|
| `fecha_captacion_real` | Editable. Por defecto = `visto_primera_vez`, marcada como estimada |
| `origen_captacion` | BDR / redes pagas / cliente antiguo / referido / cartel / otro |
| `desenlace_confirmado` | `vendida` \| `caida` \| `retirada` \| `sigue_activa` |
| `usar_en_proyeccion` | booleano, `true` por defecto (se apaga solo si es duplicado) |
| `notas` | texto libre |

### 4.2 `negocios` — la plata

Un negocio **puede o no** estar vinculado a una propiedad de `cartera`. Los importados del
Excel (2022 en adelante) no van a tener vínculo, y está bien.

| Campo | Notas |
|---|---|
| `id` | interno |
| `entity_id_cartera` | opcional — vínculo con la propiedad |
| `tipo_negocio` | `venta` \| `alquiler` \| `renovacion_alquiler` \| `suplencia` |
| `fecha_inicio` | cuándo se empezó a trabajar |
| `fecha_boleto` | firma del compromiso / contrato |
| `fecha_fin` | cierre y cobro — **es la fecha que cuenta para el período** |
| `direccion`, `barrio`, `tipo_propiedad` | |
| `precio_operacion`, `moneda` | monto de la venta o renta mensual |
| `agente_vende`, `agente_compra` | `yo` \| `otro RE/MAX` \| `otra inmobiliaria` \| nombre |
| `puntas` | derivado: 2 si ambos agentes soy yo, 1 si no |
| `origen_captacion` | de dónde salió el cliente (marketing) |
| `regimen_comision` | `captacion_mia` \| `ref_martin` \| `ref_otro_colega` \| `yo_referi` \| `suplencia` |
| `pct_comision_total` | % aplicado sobre `precio_operacion`. Default óptimo, editable |
| `base` | calculado |
| `facturacion` | calculado |
| `ganancia` | calculado |
| `categoria_vigente` | `RAP` \| `ALTO` \| `PURO` — la vigente a `fecha_fin` |
| `estado` | `en_curso` \| `cerrado` \| `caido` |
| `ficha_completa` | booleano — silencia los avisos de datos faltantes |
| `notas` | |

**Contactos del negocio** (todos con `nombre` + `telefono`, todos opcionales):

| Campo | Cuándo se carga |
|---|---|
| `cliente_vendedor` | si tenés la punta vendedora |
| `cliente_comprador` | si tenés la punta compradora |
| `referidor` | quién te refirió el negocio |
| `referido_a` | a quién se lo referiste |

Se cargan con el **Contact Picker** del celular (§7.6) y cada uno lleva al lado un botón que
abre el chat de WhatsApp. Con el tiempo esto arma solo la lista de gente que ya operó con el
usuario — que es su BDR, el canal que hoy genera el 23 % de su ganancia.

> **Una propiedad genera muchos negocios.** La relación `cartera → negocios` es **1 a
> muchos**. Una misma propiedad puede alquilarse cinco veces en un año (inquilinos distintos
> o renovaciones de contrato, ambas se cobran) y después venderse. Cada línea es un negocio
> independiente. Consecuencias:
>
> - La ficha de una propiedad muestra **todos** los negocios que generó y **cuánta plata dio
>   en total**. Una propiedad de alquiler que rota puede rendir más que una venta.
> - El plazo (inicio → firma) se mide **por negocio**, nunca por propiedad.
> - `renovacion_alquiler` existe como tipo aparte porque suele cobrarse a un porcentaje
>   distinto que un alquiler nuevo. El `pct_comision_total` es editable; el default se fija
>   en Ajustes cuando el usuario lo defina.

> **Nota de modelado importante.** En el Excel actual la columna `Origen` mezcla dos cosas
> distintas: *de dónde salió el cliente* (Bdr, Redes Pago, Cliente antiguo) y *quién me lo
> refirió* (Ref. Martín, Ref. Team, Ref. Remax). Se separan en dos campos porque responden
> preguntas distintas: `origen_captacion` sirve para saber qué canal de marketing funciona,
> y `regimen_comision` determina la fórmula de plata. Al importar se derivan ambos.

### 4.3 `ajustes`

| Campo | Notas |
|---|---|
| `categorias[]` | `{categoria, split_pct, fee_mensual_usd, desde, hasta}`. Estado actual: RAP, 45%, **70 USD/mes** |
| `reglas_comision` | La matriz de §5, editable |
| `defaults_comision` | venta 1 punta 3% / 2 puntas 6%; alquiler 1 punta 100% / 2 puntas 200% |
| `niveles_remax` | Rokie 30.000 · Executive 65.000 · Club 100% 100.000 · Platinum 150.000 · Chairman's Club 225.000 · Titan 300.000 · Diamond 400.000 |
| `objetivo_personal` | monto anual definido por el usuario |
| `probabilidades_cierre` | reservada 90% · negociación 60% · publicada 25% (editables, y recalculables cuando haya historia) |
| `tipo_cambio` | cotización del día + última guardada + override manual |

> **La categoría lleva fechas.** Si se pasa a ALTO en junio, los negocios de enero a mayo
> se siguen calculando con RAP 45%. Sin esto, todo el histórico se deforma al cambiar de
> categoría. Lo mismo con el fee (65 → 70).

### 4.4 `calculos_renta`

Cálculos guardados: `{fecha, nombre_cliente, entradas{}, resultados{}, notas}`.

---

## 5. Motor de plata

### 5.1 La BASE

```
BASE = precio_operacion × pct_comision_total
```

Defaults (editables en cada negocio):

| | 1 punta | 2 puntas |
|---|---|---|
| **Venta** | 3 % | 6 % |
| **Alquiler** | 100 % (1 mes de renta) | 200 % (2 meses) |

Casos reales que hay que poder cargar: descuento porcentual a una punta, "un punto menos"
(33,333 %), o un monto fijo acordado. La app **siempre calcula primero el escenario óptimo**
y deja el número editable con un aviso en Pendientes hasta que se confirme.

### 5.2 Facturación y ganancia

Sea `split` = 45 % (RAP) / 60 % (ALTO) / 80 % (PURO), el vigente a `fecha_fin`:

| `regimen_comision` | Facturación RE/MAX | Ganancia (bolsillo) |
|---|---|---|
| `captacion_mia` | `BASE` | `split × BASE` |
| `ref_martin` | `0,50 × BASE` | `0,35 × BASE` |
| `ref_otro_colega` | `BASE` | `split × 0,75 × BASE` |
| `yo_referi` | `0,25 × BASE` | `split × 0,25 × BASE` |
| `suplencia` | `0` | `0,125 × BASE` |

Verificado contra el ejemplo del usuario (propiedad de 100.000, comisión 3 %):

| Caso | Facturación | Ganancia |
|---|---|---|
| Captación mía · 1 punta | 3.000 | 1.350 |
| Captación mía · 2 puntas | 6.000 | 2.700 |
| Ref. Martín · 1 punta | 1.500 | 1.050 |
| Ref. otro colega · 1 punta | 3.000 | 1.012,50 |
| Ref. otro colega · 2 puntas | 6.000 | 2.025 |
| Yo referí · 1 punta | 750 | 337,50 |
| Yo referí · 2 puntas | 1.500 | 675 |

**Dos reglas especiales:**

- `ref_martin` **no usa `split`**: es un arreglo fijo del usuario con esa persona (le deja
  el 70 % de su facturación, muy por encima del 45 %). Si algún día cambia con la categoría,
  se edita en Ajustes.
- `suplencia` (cubrir una visita a un colega) **no genera facturación RE/MAX**, solo
  ganancia. Se carga: monto de la venta, comisión inmobiliaria del negocio (6 % o menos),
  quién vende, quién compra, dirección, barrio. Muchos campos van a quedar vacíos según la
  naturaleza del negocio, y eso es aceptable.

### 5.3 Fee mensual y ganancia neta

```
ganancia_neta_periodo = Σ ganancias del período − (fee_mensual × meses del período)
```

Fees: RAP 70 · ALTO 425 · PURO 975 (USD/mes).

### 5.4 Indicador "cuánto pierdo por no ser ALTO o PURO"

Se recalcula **negocio por negocio** (no sobre el total, porque los referidos tienen
fórmulas distintas) con cada `split`, y se restan los fees del período:

```
neto(cat) = Σ ganancia_i(split_cat) − fee_cat × meses_transcurridos
```

Se muestran las tres cifras y la diferencia contra la categoría actual. Con los fees
actuales el punto de equilibrio aproximado está en ~28.800 (RAP→ALTO) y ~33.000
(ALTO→PURO) de facturación anual — el nivel Rokie de RE/MAX arranca en 30.000, así que la
comparación es relevante ya.

---

## 6. El robot: qué detecta y qué propone

Cada corrida compara el estado de hoy contra el de ayer y genera **pendientes**:

| Situación detectada | La app propone | El usuario |
|---|---|---|
| Estaba **reservada** y desapareció | 🟢 **"Se vendió"** — arma un Negocio en borrador con precio, dirección, barrio, tipo, fecha, y la cuenta óptima (`captacion_mia`, 1 punta, 3 %) | Confirma o corrige |
| Estaba **publicada** o **en negociación** y desapareció | 🔴 **"Se cayó / se dejó de vender"** | Confirma, o marca que se vendió igual |
| Cambió de precio | 🔵 `240.000 → 225.000` | Solo informativo, queda en el historial |
| Apareció una propiedad nueva | ⚪ **"Nueva — falta el origen"** | Carga origen y fecha real de captación |
| Pasó a negociación o a reservada | 🔵 Queda anotada la fecha | Nada |
| Dos propiedades con misma dirección y mismo precio | ⚠️ **"¿Es la misma publicada dos veces?"** | Marca si son una o dos |

**El robot nunca decide un desenlace por sí solo.** Una propiedad desaparece también cuando
vence el contrato, el dueño la retira o pasa a otro agente. Sin confirmación humana, la
estadística de "negocios caídos" sería inventada.

### 6.1 Alarma: negocio cobrado sobre propiedad viva

Detectada como necesaria el 2026-08-17 al cruzar el Excel contra la cartera real. Salta
cuando un negocio marcado como cobrado coincide con una propiedad que **sigue viva** en
REMAX:

| Negocio | Propiedad sigue publicada como | ¿Salta? |
|---|---|---|
| Venta | cualquier estado | **Sí** — no podés haber cobrado una venta que sigue publicada |
| Alquiler o renovación | en alquiler | **Sí** |
| Alquiler o renovación | en venta | **No** — es normal alquilarla y después ponerla en venta |
| Suplencia | — | No aplica (no es tu propiedad) |

**Emparejamiento.** El cruce automático probado sobre los datos reales devolvió ~40
coincidencias de las cuales solo **5 eran verdaderas**: emparejar por barrio es inútil
("Punta" hace matchear Punta Rieles con Punta del Este y Punta Carretas). El algoritmo
definitivo empareja por:

1. **Nombre de calle** normalizado (sin tildes, minúsculas, tolerante a errores de tipeo —
   `flamarrion` ↔ `Flammarión`).
2. **Número de puerta en el mismo bloque de 100** (REMAX redondea: `3959` → `3900`).
3. **Precio dentro de ±10 %.**

Se muestra el nivel de confianza y **siempre confirma el usuario**. Nunca automático.

**Casos reales encontrados** (§9.8).

### 6.2 Duplicados

Verificado el 2026-08-17: `29891` y `29889` son **la misma propiedad** (Gutenberg 6100,
490.000 USD, 6.769 m² terreno, 715 m² cubiertos), publicada una vez como *casa* y otra como
*local*. Es una práctica habitual del usuario. Sin detección, inflaría la proyección en
490.000 — casi un tercio de la cartera actual.

La detección es una **sugerencia**, nunca automática: el usuario decide.

---

## 7. Pantallas

Barra inferior de cinco, pensada para el pulgar.

### 7.1 📌 Hoy

Pantalla de entrada. Muestra:

- Fecha de la última corrida del robot (roja si hace más de 48 h).
- **Bandeja de pendientes**, ordenada por importancia: cierres detectados > datos faltantes
  de negocios > propiedades nuevas sin origen > duplicados > cambios de precio.
- Si no hay nada pendiente: resumen corto del mes y acceso directo a Salud.
- Engranaje arriba a la derecha → Ajustes.

### 7.2 🏠 Cartera

Lista de las propiedades activas, con estado por color. Al tocar una:

- Ficha completa con todos los datos del robot.
- **Línea de tiempo**: alta → cambios de precio → negociación → reserva → desenlace.
- Campos editables del usuario (fecha real de captación, origen, notas).
- Botón para calcular su renta (precarga el precio en la calculadora).

Incluye también un archivo de propiedades ya cerradas o caídas.

### 7.3 💵 Negocios

- Lista de negocios con filtros por año, operación, barrio y estado.
- **Alta manual**, con cuatro atajos: venta · alquiler · suplencia · referido saliente.
- **Import del Excel** (ver §9).
- Cada negocio marca en rojo los campos que le faltan.
- Botón **"Ficha completa"**: al tocarlo, la app deja de avisar por los datos faltantes de
  ese negocio. Siempre reversible, y siempre se pueden seguir cargando datos.

> **Sobre el nombre del botón.** Se llama *"Ficha completa"* y no *"Negocio cerrado"* para
> no chocar con el estado comercial del negocio (`cerrado` = se concretó y se cobró). Son
> dos cosas distintas: un negocio puede estar comercialmente cerrado y con la ficha
> incompleta, o al revés.

### 7.4 📊 Salud del negocio

Ver §8.

### 7.5 🧮 Renta

Ver §10.

### 7.6 Contactos y WhatsApp

Ninguna app web puede leer los contactos de WhatsApp: no existe una API para eso y ningún
navegador da ese acceso. La solución que da el mismo resultado:

- **Contact Picker API** (`navigator.contacts.select`) — disponible en Chrome para Android.
  Se toca *"Elegir contacto"*, se abre la agenda nativa del teléfono, se elige la persona y
  la app recibe **nombre y teléfono** ya cargados. Como los contactos de WhatsApp son los de
  la agenda, en la práctica es lo pedido. [PROBABLE — se verifica en el teléfono del usuario
  en la primera iteración]
- **Botón de WhatsApp** al lado de cada contacto: abre `https://wa.me/598…` directo al chat.
- **Fallback:** si el navegador no soporta el picker (iOS, escritorio), carga manual de
  nombre y teléfono. El botón de WhatsApp funciona igual.

---

## 8. Salud del negocio

### 8.1 Las tres capas de plata

El bloque principal, siempre visible arriba:

| Capa | De dónde sale | Cómo se calcula |
|---|---|---|
| **1 · Cerrado** | Negocios con `fecha_fin` en el período | Cifras **reales** del motor de §5 |
| **2 · Casi seguro** | Negocios `en_curso` + propiedades reservadas o en negociación | Ver abajo |
| **3 · Potencial** | Propiedades publicadas | Proyección por ratios (§8.2) |

Debajo: el total sumado y a qué nivel RE/MAX llegaría si todo cerrara.

**Regla anti-doble-conteo de la capa 2.** Una propiedad reservada suele tener también un
negocio `en_curso` cargado a mano. Sumar las dos cosas duplicaría la plata. El orden de
precedencia es:

1. Si existe un negocio `en_curso` **vinculado** a la propiedad (`entity_id_cartera`), manda
   el negocio: sus cifras se calculan **directo con el motor de §5**, sin aplicar
   probabilidad, porque el precio y el régimen de comisión ya son datos reales y no
   estimaciones. La propiedad no se suma aparte.
2. Si la propiedad **no** tiene negocio vinculado, se proyecta por ratios con su
   probabilidad de estado (§8.2).
3. Un negocio `en_curso` **sin** propiedad vinculada (punta compradora, referido) se suma
   siempre, calculado directo.

La lista de detalle muestra cada ítem indicando de dónde salió: *"del negocio cargado"* o
*"estimado de la cartera"*.

### 8.2 Cómo se proyecta

Los ratios salen del **histórico real** del Excel importado, separados por operación:

```
r_fact = mediana( facturacion / precio_operacion )   sobre negocios cerrados
r_gan  = mediana( ganancia    / precio_operacion )   sobre negocios cerrados
```

**Se usa mediana, no promedio.** Con los datos reales el promedio queda destruido por unas
pocas filas con errores de tipeo (§9.4): el promedio de `r_gan` en ventas da 649 %, la
mediana da 2,06 %. La mediana es inmune a esos outliers.

Estos dos ratios ya incorporan el promedio real de puntas, los descuentos aplicados y el mix
de regímenes de comisión, sin necesidad de estimarlos por separado.

**Valores calculados sobre los 79 negocios sanos (2026-08-17):**

| | Venta (n=34) | Alquiler (n=45) |
|---|---|---|
| `r_fact` | **4,50 %** | **200 %** |
| `r_gan` | **2,06 %** | **70,06 %** |
| Ticket mediano | 74.055 | 427 |
| Ganancia mediana por negocio | 1.540 | 308 |

Estos son valores de arranque; la app los recalcula sola con cada negocio nuevo.

Para cada propiedad `i` marcada como `usar_en_proyeccion`:

```
facturacion_esperada_i = precio_i × r_fact × p(estado_i)
ganancia_esperada_i    = precio_i × r_gan  × p(estado_i)
```

Con `p` = 90 % reservada · 60 % en negociación · 25 % publicada (editables).

**Lista de propiedades usadas, siempre visible.** Debajo de cada proyección aparece el
detalle de qué propiedades se sumaron, con una casilla por cada una para excluirla. Los
duplicados detectados vienen desmarcados con una advertencia.

**Cuando haya historia real** (≈12 meses de robot), la app calcula las probabilidades
verdaderas y avisa: *"tu tasa real de publicada→venta es 31 %, no 25 % — ¿la actualizo?"*.

### 8.3 Métricas

**Del año en curso:**

- Facturación y ganancia acumuladas · ganancia neta (descontando fees).
- Cantidad de negocios: ventas / alquileres / suplencias / referidos.
- Ticket promedio, separado en venta y alquiler.
- Comisión efectiva promedio (`BASE / precio`).
- Puntas promedio por negocio.
- Negocios caídos y tasa de caída.
- Ganancia por mes (barras) y mejor mes.
- Avance hacia el próximo nivel RE/MAX y hacia el objetivo personal, con cuánto falta.
- **Cuánto se pierde por no ser ALTO o PURO** (§5.4).
- **Ritmo contra calendario** (ver §8.4).

### 8.4 Ritmo contra calendario

La métrica más útil del tablero, porque responde *"¿voy bien o voy mal?"* en un solo número:

```
avance_objetivo = facturacion_ytd / objetivo_anual
avance_calendario = dia_del_anio / 365
proyeccion_fin_de_anio = facturacion_ytd / avance_calendario
```

Si `avance_objetivo ≥ avance_calendario` → verde, vas a ritmo. Si no → rojo, con cuánto
tenés que facturar por mes para recuperar.

**La métrica usa solo la capa 1 (cobrado).** Ese es justamente el error que tenía el Excel:
mezclaba plata cobrada con plata esperada y mostraba un avance que no existía.

Ejemplo real al 2026-08-17: el Excel declara 41.089 y eso daría 63,2 % de avance contra
62,7 % del calendario — *"va a ritmo"*. Pero el cruce contra la cartera viva (§9.7) muestra
que entre 13.500 y 16.000 de esa cifra **todavía no se cobraron**. El avance real es
**39-42 %**: va **atrasado**. La plata existe y está en la cartera, pero es capa 2, no capa 1.

### 8.5 Histórico de facturación anual (base importada)

| Año | Negocios | Facturación |
|---|---|---|
| 2022 | 3 | 1.770 |
| 2023 | 26 | 58.984 |
| 2024 | 21 | 40.125 |
| 2025 | 24 | 43.965 |
| 2026 (a agosto) | 11 | 41.089 |
| **Total carrera** | **85** | **185.933** |

Ganancia total de carrera (corrigiendo las filas rotas de §9.4): **83.368**.
Promedio de puntas por negocio: **1,59**.

**De toda la carrera:**

- Facturación y ganancia por año (barras).
- Barrios donde se vende (ranking por cantidad y por facturación).
- **Barrios donde se capta y no se vende** — requiere datos de cartera, así que se marca
  como *"disponible desde 2027"* hasta que haya historia.
- Origen de las captaciones y facturación que generó cada canal.
- Plazo promedio: inicio → boleto y boleto → fin, separado por venta y alquiler.
- Distribución por tipo de propiedad.
- **Plata total por propiedad** — ranking de las propiedades que más generaron sumando todos
  sus negocios (alquileres, renovaciones y venta). Sale de la relación 1-a-muchos de §4.2.
- **Clientes recurrentes** — gente que aparece en más de un negocio, de los contactos
  cargados.

> **Cuidado con `Origen`.** Los porcentajes del Excel actual están calculados contra el
> objetivo (65.000) en vez de contra el total, y suman **123 %**. Los reales sobre 83.368 de
> ganancia de carrera: Ref. Martín 30 %, BDR 23 %, Ref. RE/MAX 19 %, Redes Pago 14 %,
> Cliente antiguo 5 %, Ref. BDR 4 %, resto 4 %. **Más de la mitad de la plata viene de
> referidos de terceros, no de captación propia.**

**Toda métrica que no tenga datos suficientes se muestra vacía y explicando por qué**, nunca
con un número inventado.

---

### 8.6 Reporte descargable

Un botón en Salud del Negocio que arma un **reporte autocontenido** para guardar o mandar.

**Formato:** un archivo HTML de una sola pieza (sin dependencias externas) que se abre en
cualquier teléfono o computadora, más un botón *Compartir* que usa la Web Share API del
celular para mandarlo por WhatsApp. Al ser una página servida desde GitHub Pages y no un
sandbox, la descarga funciona sin restricciones.

**Qué lleva adentro:**

1. **Encabezado** — nombre, oficina, período del reporte y fecha de generación.
2. **Las tres capas de plata** del período (cobrado · casi seguro · potencial), con el
   detalle de qué propiedades y negocios entran en cada una.
3. **Ritmo contra calendario** (§8.4) y avance hacia el objetivo personal y el nivel RE/MAX.
4. **Los números del período**: cantidad de negocios, ticket promedio, comisión efectiva,
   puntas promedio, plazos, barrios y origen de las captaciones.
5. **Gráficas** de ganancia por mes y de facturación por año, dibujadas en SVG.
6. **Qué hacer para llegar al objetivo** (ver abajo).

#### Qué hacer para llegar al objetivo

No son consejos genéricos: son cuentas hechas con los propios números del usuario. Cada
recomendación se muestra solo si su condición se cumple.

| Condición | Qué dice el reporte |
|---|---|
| Falta para el objetivo > 0 | *"Te faltan USD F. Con tu ticket mediano de venta (74.055) y tu facturación media del 4,5 %, son **N ventas más**. O M alquileres."* |
| Proyección de cartera < falta para el objetivo | *"Aun cerrando toda tu cartera llegás a X. Te faltan **USD V de volumen nuevo** para captar."* |
| Hay propiedades publicadas hace más que la mediana de días sin pasar a negociación | *"**N propiedades llevan más de D días publicadas** sin moverse. Tu mediana de inicio a boleto es de 96 días."* |
| `neto(ALTO)` o `neto(PURO)` > `neto(categoría actual)` | *"Siendo RAP dejaste de ganar **USD P en lo que va del año**. Con ALTO habrías ganado Q."* |
| Un canal de origen concentra > 25 % de la ganancia | *"El **X %** de tu plata viene de un solo canal. Si se corta, perdés esa porción."* |
| Hay negocios sin `ficha_completa` y con datos faltantes | *"Tenés **N negocios con datos sin cargar**. Sin eso, estas cuentas están incompletas."* |
| Hay eventos sin atender en la bandeja | *"Tenés **N novedades sin revisar** desde el DD/MM."* |

**Fase:** va en la Fase 2, junto con Salud del Negocio. No tiene sentido antes: sin el Excel
importado el reporte saldría vacío.

---

## 9. Import del Excel

Archivo entregado el 2026-08-17: `negocios.xlsx`, una hoja, **85 negocios** (2022-08 a
2026-04), 14 columnas.

### 9.1 Mapeo de columnas

| Columna del Excel | Campo destino |
|---|---|
| Operación | `tipo_negocio` (Venta / Alquiler) |
| Barrio | `barrio` (normalizando mayúsculas) |
| Dirección | `direccion` |
| Agente vendedor | `agente_vende` |
| Agente comprador | `agente_compra` |
| Origen | → se separa en `origen_captacion` + `regimen_comision` |
| Precio cierre | `precio_operacion` |
| % Comisión | `pct_comision_total` |
| Facturado | `facturacion` (ver §9.3) |
| % Comisión Agente | `split_aplicado` |
| Importe Comisión Agente | `ganancia` |
| Fecha inicio negocio | `fecha_inicio` |
| Fecha boleto/reserva | `fecha_boleto` |
| Fecha de firma | `fecha_fin` |

### 9.2 Derivaciones

**Puntas:** 2 si `agente_vende` y `agente_compra` son ambos el usuario; 1 si solo uno lo es;
**0 si ninguno** (7 casos en el histórico — son referidos salientes o suplencias, y el
importador los marca como `yo_referi` para revisión).

Valores encontrados en `Agente vendedor` / `Agente comprador`: *Juan Andrés Otero*, *Otro
REMAX*, *Otro*, *Martin Sedes*, *Wendy Sánchez*, y 2 vacíos.

**Régimen de comisión** a partir de `Origen`:

| Valor en el Excel | n | `regimen_comision` | `origen_captacion` |
|---|---|---|---|
| Bdr | 15 | `captacion_mia` | BDR (base de relaciones) |
| Ref. Martin | 23 | `ref_martin` | Referido — Martín |
| Ref. Remax | 20 | `ref_otro_colega` | Referido — RE/MAX |
| Redes Pago | 10 | `captacion_mia` | Redes pagas |
| Cliente antiguo | 9 | `captacion_mia` | Cliente antiguo |
| Ref. Bdr | 2 | `captacion_mia` | Referido — BDR |
| Ref. Clientes | 2 | `ref_otro_colega` | Referido — cliente |
| Ref. Team | 1 | `ref_otro_colega` | Referido — Team |
| Otros | 1 | queda pendiente | Otro |
| *(vacío)* | 2 | queda pendiente | *(pendiente)* |

**Confirmación del motor:** en 11 negocios de `Ref. Remax` el usuario cargó `34 %` de split,
que es exactamente `45 % × 75 % = 33,75 %` redondeado. La regla `ref_otro_colega` de §5.2 ya
refleja la práctica real.

### 9.3 Regla de corte 2026

Decisión del usuario (2026-08-17): **RE/MAX cambió las reglas de comisión varias veces.**

- **Negocios con `fecha_fin` anterior al 2026-01-01:** se importan **con los números tal
  como están en el Excel**. La facturación y la ganancia se toman de las columnas
  `Facturado` e `Importe Comisión Agente`, no se recalculan. El `split_aplicado` histórico
  se guarda tal cual (aparecen 50 %, 45 %, 35 %, 34 %, y dos casos sueltos de 60 % y 80 %).
- **Negocios con `fecha_fin` desde el 2026-01-01:** se recalculan con el motor de §5. Si el
  resultado difiere de lo que dice el Excel, el negocio va a Pendientes con las dos cifras a
  la vista.

### 9.4 Limpieza de datos detectados

El análisis del 2026-08-17 encontró **6 filas con aritmética rota**. Sumando la columna
`Importe` tal cual, el Excel afirma una ganancia de carrera de **17.560.486 USD**; la real
es **83.368 USD**.

| Fila | Problema | Valor correcto |
|---|---|---|
| 37 — Malvin Norte, manila 2326 | `Facturado` = 770.048 | 770 |
| 53 — Las Acacias, Joaquín Artigas 4422 | `Importe` = 3.940.326 | 398 |
| 61 — Centro, santiago de chile | `Importe` = 13.538.556 | 1.367 |
| 51 — Palermo, durazno 1215 | `% Comisión` = 2625 % | 2,625 % |
| 39 — Brazo Oriental, Felipe Contucci | 109.000 × 3 % = 3.270 ≠ `Facturado` 2.772,96 | a decidir |
| 48 — Las Acacias, Salustio 3948 | 67.000 × 4 % = 2.680 ≠ `Facturado` 3.010 | el % real fue 4,49 % |

**El importador no corrige nada solo.** Detecta, propone el valor correcto y lo manda a
Pendientes. Las filas 39 y 48 pueden ser descuentos reales mal anotados, no errores.

Otras anomalías a resolver desde Pendientes:

- **2 fechas de firma en el futuro:** fila 60 (2026-12-05) y fila 66 (2026-11-05).
- **Fila 82:** firma (2026-04-20) anterior al boleto (2026-05-05).
- **5 negocios con la misma fecha de firma** (2026-04-20) — probable relleno rápido.
- **Barrios duplicados por mayúsculas:** `Cerrito`/`cerrito`, `Cerro`/`cerro`,
  `Villa Española`/`Villa española`. Son **42** barrios reales, no 45. Se normalizan al
  importar y se avisa.
- **`Ref. Martin` con 5 splits distintos** (35 %, 45 %, 50 %, 60 %, 80 %). El 50 % es el
  régimen viejo; el **60 % y el 80 % son casos sueltos** que quedan marcados para revisar.

### 9.5 Validación general

Cada fila se verifica en tres ejes: `Precio × % Comisión = Facturado`,
`Facturado × % Agente = Importe`, y coherencia de fechas (`inicio ≤ boleto ≤ firma`,
firma no futura). Toda diferencia mayor al 2 % va a Pendientes con ambas cifras visibles.

### 9.6 Datos faltantes

Huecos confirmados en el archivo entregado: **17 negocios sin fecha de inicio**, **19 sin
fecha de boleto**, y **2 sin agente vendedor, comprador ni origen** (filas 84 y 86). La app:

1. Importa igual, sin bloquear.
2. Marca **cada campo faltante en rojo** en la ficha del negocio.
3. Lo lista en Pendientes, agrupado por tipo de dato faltante (para poder completar de a
   tandas: "12 negocios sin fecha de boleto").
4. Deja de avisar cuando se toca **"Ficha completa"** en ese negocio.

**Campos que se consideran necesarios:**

| Tipo | Necesarios | Deseables |
|---|---|---|
| Venta | `fecha_fin`, `precio_operacion`, `regimen_comision`, `puntas`, `pct_comision_total` | `fecha_inicio`, `fecha_boleto`, `direccion`, `barrio`, `tipo_propiedad` |
| Alquiler | ídem venta | `fecha_inicio`, `direccion`, `barrio` |
| Suplencia | `fecha_fin`, `precio_operacion`, `pct_comision_total` | `agente_vende`, `agente_compra`, `direccion`, `barrio` |

### 9.7 Cruce contra la cartera viva: hallazgos de 2026

Ejecutado el 2026-08-17 contra las 12 propiedades activas. El Excel declara **41.089** de
facturación en 2026, pero varios de esos negocios **siguen vivos en la cartera**, o sea que
todavía no se cobraron. El usuario lo confirmó: *"en el Excel inventé fecha"*.

| Fila | Excel dice | Estado real en REMAX | Facturado | Confianza |
|---|---|---|---|---|
| 82 | `San fructuoso 1254` firmado 20/4/2026 | San Fructuoso 1200, Reducto — **reservada** | 5.394 | **Alta** (mismo precio exacto: 89.900) |
| 60 | `juana de ibarburu` firma 5/12/2026 | Juana de Ibarbourou 200, Barros Blancos — **en negociación** | 4.620 | **Alta** (misma calle) |
| 66 | `flamarrion 5046` firma 5/11/2026 | Flammarión 5000, Malvin Norte — **en negociación** | 3.510 | **Alta** (misma calle) |
| 86 | `estanislao vega 3959` venta 40.000 | Estanislao Vega 3900, Cerrito — **en negociación** a 43.000 | 2.400 | Media |
| 84 | `estanislao vega 3959` alquiler 329 | misma propiedad | 658 | **Descartada** — es un realquiler legítimo (ver fila 79, enero 2026) |

**Facturación 2026 realmente cobrada: entre 25.165 y 27.565**, no 41.089. Eso es 39-42 % del
objetivo de 65.000 contra un 62,7 % del año transcurrido.

Las **11 filas de 2026 se revisan al 100 %** — el usuario confirmó que todas sus fechas son
inventadas. Es la primera tarea de la bandeja de Pendientes al importar.

### 9.8 Moneda

El Excel está todo expresado en **USD**, incluidos los alquileres: el ticket mediano de
alquiler es 427 y el mínimo 90 (un garaje en Ciudad Vieja) — cifras imposibles en pesos. El
importador lo asume así y marca para revisión cualquier fila fuera del rango esperado.

---

## 10. Calculadora de renta

### 10.1 Entradas visibles (siempre)

| Campo | Default |
|---|---|
| Precio de la propiedad | — (o precargado desde Cartera) |
| Alquiler mensual | — · moneda automática (§10.4) |
| Meses alquilados por año | 11 |
| Refacción / mantenimiento anual | 1 mes de alquiler |
| Plazo del contrato | 2 años |
| Impuestos (IRPF arrendamientos) | 10,5 % |

### 10.2 Ajustes finos (plegado, con defaults)

| Campo | Default |
|---|---|
| Gastos de compra (ITP + escritura) | 7 % |
| Comisión de alquiler (se prorratea por plazo) | 1 mes |
| Contribución inmobiliaria (anual) | vacío |
| Impuesto de Primaria (anual) | vacío |
| Administración | 0 % |

### 10.3 Fórmulas

```
renta_bruta_anual = alquiler_mensual × meses_alquilados
capital_invertido = precio × (1 + gastos_compra_pct)

costo_comision    = alquiler_mensual × meses_comision / plazo_anios
costo_admin       = renta_bruta_anual × admin_pct
costo_refaccion   = refaccion_anual
costos_fijos      = contribucion_anual + primaria_anual
impuesto          = renta_bruta_anual × irpf_pct

renta_neta_anual  = renta_bruta_anual
                  − costo_comision − costo_admin − costo_refaccion
                  − costos_fijos − impuesto

Renta bruta %   = renta_bruta_anual / precio
Renta real %    = renta_neta_anual  / capital_invertido
Bolsillo por mes = renta_neta_anual / 12
Se paga sola en  = capital_invertido / renta_neta_anual        (años)
```

**Los dos costos que el Excel actual no contempla** y que bajan la renta real de forma
significativa: los gastos de compra (el capital invertido no es el precio, es ~7 % más) y la
comisión de alquiler que se repite cada vez que cambia el inquilino.

### 10.4 Detección de moneda

No se usa la cantidad de dígitos (falla con alquileres de 1.200 USD). Se usa la relación:

| `alquiler_mensual / precio` | Interpretación |
|---|---|
| entre 0,3 % y 1,2 % | Misma moneda |
| ≥ 10 % | Alquiler en UYU, precio en USD |

La moneda detectada se muestra en grande y se cambia con un toque.

**Tipo de cambio:** se toma la cotización del día. Si no hay conexión, usa la última
guardada y lo avisa. Siempre se puede sobrescribir a mano.

> El Excel actual tiene un tipo de cambio de **40** clavado dentro de la fórmula (deducido
> de sus propios números: 172.800 UYU ÷ 4.313 USD = 40,07). Cada uso de esa planilla desde
> entonces devuelve un resultado equivocado sin avisar. Esto por sí solo justifica sacar el
> cálculo del Excel.

### 10.5 Extras aprobados

- **Cálculo inverso:** dado un objetivo de renta (ej. 7 %), calcula el alquiler necesario o
  el precio máximo a pagar.
- **Ficha para el cliente:** genera una imagen prolija con el cálculo, nombre y teléfono del
  agente, lista para WhatsApp.
- **Precarga desde Cartera:** se toca una propiedad y el precio se completa solo.
- **Cálculos guardados:** historial con nombre de cliente.

---

## 11. Diseño visual

**Idea central: el rojo y el azul no decoran, significan.**

La mayoría de las apps inmobiliarias se pintan enteras de rojo RE/MAX y terminan pareciendo
un folleto. Acá el lienzo es blanco, los números son negros y grandes, y el color aparece
solo cuando tiene algo que decir.

| Color | Significado, siempre el mismo |
|---|---|
| 🔴 Rojo `#FF1200` | Requiere acción. Pendiente, negocio caído, atraso contra objetivo, robot sin correr. |
| 🔵 Azul `#0043FF` | Plata y progreso. En tres intensidades: publicada (claro) → en negociación (medio) → reservada (fuerte). **El azul se satura a medida que la propiedad se acerca a venderse.** |
| ⚪ Blanco / grises | Todo lo demás. |

Resultado: de un vistazo se sabe si hay algo que hacer (rojo) o si viene plata (azul oscuro).

**Reglas de forma:**

- El número es el héroe: grandes, gruesos, sin adornos alrededor.
- Esquinas redondeadas generosas (16–20 px).
- Un solo nivel de sombra, suave. Cero degradados.
- Tipografía del sistema (0 KB de descarga, render instantáneo).
- Sin librerías de UI ni de gráficos pesadas: los gráficos se dibujan en SVG a mano.
- Navegación con barra inferior, alcance del pulgar.
- Modo oscuro: invierte el lienzo, mantiene los mismos dos acentos.

---

## 12. Riesgos y límites conocidos

| Riesgo | Mitigación |
|---|---|
| RE/MAX cambia o cierra la API y el robot muere en silencio | Alerta visible de "sin actualizar hace N días". Prueba automática del robot en cada cambio de código. |
| Un aviso editado cambia su URL y se pierde el vínculo | Identidad por `entityId` (UUID), no por slug ni link. |
| Desaparecer ≠ vender | Todo desenlace lo confirma el usuario. |
| Sin tasa de conversión real hasta ~12 meses | Probabilidades por estado, editables, marcadas como suposición. Recalculadas cuando haya historia. |
| Propiedades publicadas dos veces inflan la proyección | Detección de duplicados + lista explícita de qué propiedades se usaron, con casillas para excluir. |
| El repo es público: comisiones y ganancias quedan visibles | **Aceptado explícitamente por el usuario** (2026-08-17). |
| Import del Excel con datos inconsistentes | Recálculo y comparación fila por fila; las diferencias van a Pendientes. |

## 13. Fuera de alcance

Deliberadamente **no** se hace en esta app:

- Clientes compradores y búsquedas de propiedades → ya existe *App Busquedas*.
- Propiedades de colegas para Marketplace → ya existe *Monitor Propiedades Team*.
- Proyección de renta a 5/10 años con inflación, apalancamiento con hipoteca, comparación
  con plazo fijo o bolsa. Suena bien, no se usa, y las suposiciones lo vuelven ficción.
- Multiusuario o versión para el equipo.
- Notificaciones push.
- App nativa Android/iOS.

## 14. Orden de construcción

Decidido con el usuario el 2026-08-17: **robot primero, en paralelo con la plata.**

1. **Robot grabando** — es lo más barato de construir y lo único que se pierde con el tiempo:
   cada día sin correr es historia que no se recupera nunca. Sale primero, aunque todavía no
   haya pantalla que muestre lo que graba.
2. **Import del Excel + Negocios + Salud del negocio** — es lo que reemplaza la planilla
   desde el día uno.
3. **Cartera** — su pantalla llega cuando ya tiene historia adentro.
4. **Calculadora de renta.**
