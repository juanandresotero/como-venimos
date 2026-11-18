# Avisos: una tarjeta por propiedad, y los negocios cerrados no se enganchan

Fecha: 2026-11-18 · Pedido de Juan · Aprobado por él el mismo día (opción "una tarjeta por propiedad").

## El problema

El 2026-11-18 se publicó Pastor 1200 (alquiler). Juan vio **tres avisos por una sola publicación**:

1. "Propiedades nuevas sin origen" → Pastor 1200 (la nueva).
2. "Puede ser una propiedad de tu cartera" → Pastor 1221 (negocio cerrado en 2025).
3. "Dados por cobrados, pero la propiedad sigue viva" → Pastor 1223 (negocio de 2023).

Y además la app **enganchó el negocio de 2023 a la publicación nueva y lo reabrió**: le borró la firma y su ganancia bajó de 306 USD a 5. Eso ya se restauró a mano (commit `87815bd`); lo que sigue es para que no vuelva a pasar.

Causas:

- **A. Un negocio ya cerrado se puede enganchar a una publicación nueva.** `sugerencias()` (`lib/cruce.js`) ofrece cualquier negocio sin propiedad, esté cerrado o no, y por parecerse la dirección. Una propiedad que vuelve a publicarse casi nunca es el mismo negocio: es otro inquilino u otro comprador.
- **B. `firma_inventada` ("cobrado pero la propiedad sigue viva") se dispara con una propiedad que se publicó años después.** Pensado para el retraso de días del portal, no para una publicación nueva.
- **C. La bandeja junta avisos repetidos de un negocio o de una propiedad, pero no junta una propiedad con su negocio** (`sujeto()` en `lib/pendientes.js` usa `n:<negocio>` o `p:<propiedad>`; son claves distintas). Cuando algo cambia en una propiedad llegan dos o tres tarjetas, cada una en su grupo.

## Lo que pidió Juan (sus palabras)

- "Cuando una propiedad se vuelve a subir y se había cerrado es porque algo sucedió, pero son negocios distintos. Que pregunte" → **que pregunte qué pasó.**
- "Para todo tipo de noticias, **1 notificación por propiedad**: si tiene que preguntar varias cosas, que estén todas dentro de la misma notificación, que toco y edito todo lo que me marque en la edición del negocio."
- "Tendría que aparecer una sola, marcando **en rojo** los cambios que necesita que marque."
- Para qué: "no llenarme de notificaciones ni andar respondiendo cosas más de una vez por propiedad".

## Diseño

### 1. La unidad de la bandeja es la propiedad

Una **tarjeta por propiedad**. Qué la identifica:

- Un aviso del robot (evento) → su `entity_id`.
- Un aviso de un negocio que tiene `entity_id_cartera` → esa misma propiedad. **Esto es lo que hoy falta** (causa C).
- Un negocio sin propiedad en cartera (búsqueda, suplencia, referida, negocio viejo) → una tarjeta por negocio, como hoy.

Los avisos de un negocio **cerrado** que no tenga la propiedad enganchada no se mezclan con ninguna propiedad.

### 2. Adentro de la tarjeta: líneas, rojas o grises

- Cada aviso de los de hoy pasa a ser **una línea** de la tarjeta, con su texto de hoy.
- **Línea roja** = te toca marcar algo (lo que hoy pertenece a un grupo `urgente: true`, más la pregunta nueva de la sección 4). **Línea gris** = informativa o "ya lo hice yo, dale el visto bueno" (lo que hoy no es urgente).
- No se agrega ningún otro color ni estado.
- Si la tarjeta tiene al menos una línea roja, **la tarjeta va en rojo** y sale primero.
- Orden de la bandeja: primero las tarjetas rojas, ordenadas por el aviso más urgente que tengan (el `orden` que ya tienen los grupos de `GRUPOS`); después las grises.
- **Se pierde el agrupado por tipo de problema** ("Propiedades nuevas sin origen", etc.). La bandeja es una lista plana de propiedades. Decisión de Juan.

### 3. Qué se toca

- Un botón principal por tarjeta: **"Abrir y completar"**. Abre la ficha del **negocio abierto** de esa propiedad; si no hay negocio, abre la ficha de la **propiedad**. (Lo que hace hoy `accionesDe`: negocio primero, propiedad si no.)
- En la ficha ya hay campos que se pintan en rojo cuando falta algo (`ficha.js`, `falta.has("falta_…")`). **Cada línea roja tiene que tener su campo pintado en la ficha donde cae el toque.** Esto se audita (ver Pruebas); si una línea roja no tiene su campo, se agrega.
- Los botones que hoy resuelven un aviso puntual **siguen**, pero dentro de su línea y chicos: "Está bien" (visto bueno de lo que hizo la app sola), "Sí / No" (es la que referiste, son dos distintas). "Ya lo resolví" sigue sólo para las líneas que no piden un dato.
- El globito rojo del menú y el "Pendientes N" cuentan **tarjetas**, no líneas. Sigue habiendo una sola puerta (`bandeja()`).

### 4. Los negocios cerrados no se enganchan, y la app pregunta qué pasó

**Regla 1 — nunca se ofrece enganchar un negocio cerrado o caído** a una propiedad. `sugerencias()` devuelve vacío para negocios con `estado` `cerrado` o `caido`. (Los abiertos siguen igual.) Desaparece "Puede ser una propiedad de tu cartera" para negocios ya cobrados.

**Regla 2 — `firma_inventada` sólo vale si la propiedad ya estaba en la cartera cuando se cerró el negocio.** Se compara `propiedad.visto_primera_vez` contra `negocio.fecha_fin` (condición en `lib/motor.js`, bloque "DADO POR COBRADO, CON LA PROPIEDAD TODAVIA EN EL PORTAL"): si la propiedad se vio por primera vez **después** de la firma, es otra publicación y el aviso no se genera.

*Excepción:* las propiedades vistas el **primer día que el robot miró** (la carga inicial, la fecha más vieja de `visto_primera_vez` en la cartera) no tienen fecha real de aparición — puede que estuvieran desde antes. Para esas se mantiene el aviso como hoy, para no callar un cobro que sí está esperando que el portal baje la propiedad.

**Regla 3 — la pregunta "¿qué pasó?"**. Cuando aparece una propiedad nueva (evento `alta`) y su dirección se parece (mismo umbral que hoy, `UMBRAL_SUGERENCIA`) a la de un negocio **cerrado o caído** cuya `fecha_fin` es anterior a `visto_primera_vez`:

- Se agrega a la tarjeta de la propiedad nueva **una línea roja**: *"Esta dirección ya tuvo un negocio cerrado (Pastor 1223, 20/11/2025). ¿Qué pasó?"*
- Se pregunta **sólo por el más reciente** de los que se parecen (no una por cada uno).
- Se contesta en la ficha de la propiedad, con un selector: **se fue el inquilino · se cayó la venta · terminó el contrato · otra · "no tiene que ver con esa dirección"** (para cuando la dirección se parece pero es otra propiedad: Pastor 1221 vs 1223).
- La respuesta se guarda **en el negocio viejo**: `que_paso_despues: { motivo, propiedad: <entity_id>, fecha }`. Con respuesta (o con "no tiene que ver") la línea desaparece y no vuelve a preguntar por ese par.
- **El negocio nuevo nace aparte**, como hoy (un alquiler nace al quedar reservado, una venta al pasar a negociación). El viejo no se toca: ni se engancha, ni se reabre, ni cambia su plata.

### 5. Lo que no cambia

El robot, las cuentas, las proyecciones, `salud`, `capas`, `completarConNegocios`, los nombres de los avisos de cada negocio y los datos guardados (sólo se agrega el campo `que_paso_despues`). Tampoco se toca la ficha de negocios, salvo lo que haga falta para la auditoría de la sección 3.

## Pruebas

En `tests-js/pendientes.test.mjs`, `cruce.test.mjs` y `motor.test.mjs`:

1. **Una propiedad, un cambio, tres tipos de aviso → una tarjeta** con tres líneas. Con negocio enganchado y sin negocio.
2. **Rojo y gris**: una línea roja pone la tarjeta en rojo y primera; sin rojas, va gris y después.
3. **Cerrados no se sugieren**: `sugerencias` devuelve `[]` para un cerrado y para un caído, y sigue sugiriendo abiertos.
4. **`firma_inventada`**: se genera si la propiedad ya estaba antes de la firma; **no** si se vio por primera vez después.
5. **La pregunta "¿qué pasó?"**: sale una vez, por el más reciente; respondida o descartada ("no tiene que ver"), no vuelve; no sale si el negocio cerrado es posterior a la propiedad.
6. **Caso Pastor**, con las fotos reales de `datos/` de `7f59dad`: antes eran 2 avisos sueltos más el alta; después, una tarjeta "Pastor 1200" con la línea de la pregunta, y el negocio de 2023 sin tocar.
7. **Nada se pierde**: con los datos reales de hoy, la unión de todas las líneas de las tarjetas nuevas tiene los mismos avisos que las tarjetas de la bandeja vieja (se compara antes y después).
8. **Auditoría de la ficha**: un test recorre cada tipo de línea roja que puede salir y verifica que la ficha a la que lleva el toque la marca en rojo.

Verificación a mano al final (no se puede probar el teléfono desde acá): abrir Hoy en Chrome con los datos reales, mirar una tarjeta con rojo y una gris, y tocar "Abrir y completar".

## Riesgos

- **Cambia la forma de Hoy** (sin títulos por tipo). Es lo que pidió, pero es la pantalla de todos los días.
- **Línea roja sin campo en la ficha** = botón que no hace nada. Por eso la auditoría de la prueba 8.
- **Caso raro**: una propiedad que sale del portal y vuelve con el mismo `entity_id` mientras su negocio está abierto sigue el camino de hoy (`volvioAlMercado`). Esto no lo toca.

## Fuera de alcance

El botón "Mirar mi cartera ahora" (corre el robot de GitHub, que ya no anda); deshacer a mano cualquier cosa que la app haya hecho antes de este cambio; agrupar por tipo de aviso dentro de una tarjeta.
