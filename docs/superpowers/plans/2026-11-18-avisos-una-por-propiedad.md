# Avisos: una tarjeta por propiedad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la bandeja de Hoy muestre UNA tarjeta por propiedad (líneas rojas = te toca marcar, grises = informativas), que un negocio cerrado nunca se enganche a una publicación nueva, y que la app pregunte "¿qué pasó con el negocio anterior?" dentro de esa misma tarjeta.

**Architecture:** `derivar()` (un pendiente por problema, agrupado por tipo) **no cambia**. Se reemplaza `juntarRepetidos()` por `tarjetas()`, que re-agrupa los mismos pendientes por propiedad (un negocio enganchado hereda la propiedad de su `entity_id_cartera`). `bandeja()` devuelve tarjetas y `cuantosPendientes()` cuenta tarjetas. Tres reglas nuevas viven en `lib/cruce.js` y `lib/motor.js`. `vistas/hoy.js` dibuja tarjetas; `vistas/propiedad.js` muestra el campo de la pregunta.

**Tech Stack:** JavaScript sin librerías (módulos ES, `node:test`), HTML por plantillas de texto, CSS plano. Spec: `docs/superpowers/specs/2026-11-18-avisos-una-por-propiedad-design.md`.

**Reglas del proyecto que NO se pueden romper:**
- Correr los tests JS así: `node --test tests-js/*.test.mjs` (NO `node --test tests-js/`).
- Los tests **nuevos** no leen `datos/` (usan fixtures dentro del test). Los de datos vivos frenan el guardado del robot.
- `tests-js/estilos.test.mjs` falla si una pantalla usa una clase CSS o una variable de color que `app.css` no define.
- Cada vez que se tocan módulos que carga el teléfono, subir `CACHE` en `sw.js`; si no, el celular sigue con la pantalla vieja.
- Al commitear: terminar el mensaje con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Antes de empezar: `git pull --rebase -q origin main` (Juan guarda desde la app y eso genera commits).

**Línea base antes de empezar:** `node --test tests-js/*.test.mjs` → 1161 pass, 0 fail. `SIN_DATOS_VIVOS=1 python -m unittest discover -s tests -t .` → 272 OK (skipped=22).

---

## Estructura de archivos

| Archivo | Qué cambia |
|---|---|
| `lib/cruce.js` | `sugerencias()` ignora cerrados/caídos. Nueva `negocioAnteriorSinContestar()`. |
| `lib/catalogos.js` | Nueva lista `QUE_PASO_DESPUES` (los motivos del selector). |
| `lib/motor.js` | `firma_inventada` sólo si la propiedad se captó antes de la firma. |
| `lib/pendientes.js` | Nuevo grupo `que_paso_antes`; `derivar` lo genera; `tarjetas()` reemplaza a `juntarRepetidos()`; `bandeja` y `cuantosPendientes` pasan a tarjetas. |
| `vistas/hoy.js` | `dibujarTarjeta()` reemplaza a `dibujarGrupo()`; el manejador de botones se extrae a `botonDeAccion()`. |
| `vistas/propiedad.js` | Campo "¿Qué pasó?" marcado en rojo mientras falta. |
| `app.css` | Clases nuevas `aviso-*`. |
| `sw.js` | `CACHE` v172 → v173. |
| `tests-js/cruce.test.mjs`, `motor.test.mjs`, `pendientes.test.mjs`, `catalogos.test.mjs` | Pruebas nuevas; las de `juntarRepetidos` se reemplazan. |

---

### Task 1: Un negocio cerrado o caído nunca se ofrece para enganchar

**Files:**
- Modify: `lib/cruce.js:95-97` (`sugerencias`)
- Test: `tests-js/cruce.test.mjs` (agregar al final)

- [ ] **Step 1: Escribir la prueba que falla**

Agregar al final de `tests-js/cruce.test.mjs`:

```js
/* PASTOR 1200 (2026-11-18). Una propiedad que se vuelve a publicar casi nunca es el mismo
   negocio: es otro inquilino u otro comprador. Ofrecer enganchar uno ya cobrado terminó con
   un negocio de 2023 reabierto y su plata cambiada. */
test("un negocio cerrado o caido nunca se sugiere para una propiedad", () => {
  const cartera = { a: { entity_id: "a", direccion: "Pastor 1200" } };
  for (const estado of ["cerrado", "caido"]) {
    assert.deepEqual(sugerencias({ direccion: "Pastor 1221", estado }, cartera), [], estado);
  }
});

test("un negocio abierto de esa misma direccion SI se sigue sugiriendo", () => {
  const cartera = { a: { entity_id: "a", direccion: "Pastor 1200" } };
  const s = sugerencias({ direccion: "Pastor 1221", estado: "en_curso" }, cartera);
  assert.equal(s.length, 1);
  assert.equal(s[0].propiedad.entity_id, "a");
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `node --test tests-js/cruce.test.mjs`
Expected: FAIL en "un negocio cerrado o caido nunca se sugiere" (devuelve 1 sugerencia en vez de `[]`).

- [ ] **Step 3: Implementación mínima**

En `lib/cruce.js`, dentro de `sugerencias`, justo después del `if (negocio.entity_id_cartera || negocio.sin_propiedad_en_cartera) return [];` agregar:

```js
  /* Un negocio ya cobrado o caido NO se engancha a una publicacion: una propiedad que
     vuelve a publicarse es otro negocio (otro inquilino, otro comprador). */
  if (negocio.estado === "cerrado" || negocio.estado === "caido") return [];
```

- [ ] **Step 4: Correr todo `cruce` y `motor`**

Run: `node --test tests-js/cruce.test.mjs tests-js/motor.test.mjs`
Expected: PASS. (Si algún test viejo de `motor` esperaba `posible_cruce` para un negocio cerrado, falla acá: cambiar el fixture a `estado: "en_curso"`. El test de `cruce.test.mjs` sobre datos reales sigue pasando: sólo exige reglas.)

- [ ] **Step 5: Commit**

```bash
git add lib/cruce.js tests-js/cruce.test.mjs tests-js/motor.test.mjs
git commit -m "feat: un negocio cerrado o caido nunca se ofrece para enganchar a una propiedad

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: "Cobrado con la propiedad viva" sólo si la propiedad se captó antes de la firma

**Files:**
- Modify: `lib/motor.js` (bloque "DADO POR COBRADO, CON LA PROPIEDAD TODAVIA EN EL PORTAL", la condición `if (n.estado === "cerrado" && propiedad && propiedad.activa && !n.firma_confirmada)`)
- Test: `tests-js/motor.test.mjs` (agregar a continuación del test "si la propiedad ya se fue del portal, no hay nada que preguntar")

- [ ] **Step 1: Escribir las pruebas que fallan**

Los ayudantes `negocio`, `propiedadEn`, `AJUSTES` y `tipos` ya existen en ese archivo.

```js
/* PASTOR 1200: el negocio de 2023 estaba cobrado y la publicacion de 2026 es OTRA. El aviso
   esta pensado para el retraso de DIAS del portal, no para una publicacion nueva. */
test("si la propiedad se capto DESPUES de la firma, es otra publicacion: no se avisa", () => {
  const n = revisar(negocio({
    estado: "cerrado", fecha_fin: "2023-06-05", entity_id_cartera: "flam",
  }), AJUSTES, "2026-11-18", propiedadEn("publicada", { fecha_captacion_real: "2026-11-18" }));
  assert.ok(!tipos(n).includes("firma_inventada"));
});

test("si la propiedad se capto ANTES de la firma, se sigue avisando", () => {
  const n = revisar(negocio({
    estado: "cerrado", fecha_fin: "2026-09-10", entity_id_cartera: "flam",
  }), AJUSTES, "2026-09-15", propiedadEn("reservada", { fecha_captacion_real: "2026-05-14" }));
  assert.ok(tipos(n).includes("firma_inventada"));
});

test("sin fecha de captacion en la propiedad, se avisa como siempre", () => {
  const n = revisar(negocio({
    estado: "cerrado", fecha_fin: "2026-09-10", entity_id_cartera: "flam",
  }), AJUSTES, "2026-09-15", propiedadEn("reservada", { fecha_captacion_real: null }));
  assert.ok(tipos(n).includes("firma_inventada"));
});
```

- [ ] **Step 2: Correrlas y ver que falla la primera**

Run: `node --test tests-js/motor.test.mjs`
Expected: FAIL sólo en "si la propiedad se capto DESPUES de la firma..." (las otras dos ya pasan).

- [ ] **Step 3: Implementación mínima**

En `lib/motor.js`, reemplazar la condición del bloque `firma_inventada`:

```js
  if (n.estado === "cerrado" && propiedad && propiedad.activa && !n.firma_confirmada) {
```

por:

```js
  /* Salvo que la propiedad se haya captado DESPUES de la firma: entonces es otra publicacion
     (Pastor 1200, 2026-11-18: el negocio era de 2023). Sin fecha de captacion no se puede
     saber y el aviso queda como siempre. */
  const esOtraPublicacion = Boolean(propiedad && propiedad.fecha_captacion_real && n.fecha_fin
    && propiedad.fecha_captacion_real > n.fecha_fin);
  if (n.estado === "cerrado" && propiedad && propiedad.activa && !n.firma_confirmada
      && !esOtraPublicacion) {
```

- [ ] **Step 4: Correr motor completo**

Run: `node --test tests-js/motor.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/motor.js tests-js/motor.test.mjs
git commit -m "fix: 'cobrado con la propiedad viva' no salta si la propiedad se capto despues de la firma

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Detectar el negocio anterior sin contestar + los motivos

**Files:**
- Modify: `lib/catalogos.js` (agregar `QUE_PASO_DESPUES` al final del bloque de listas, después de `ORIGENES`/`EXPLICACION_ORIGEN`)
- Modify: `lib/cruce.js` (agregar `negocioAnteriorSinContestar` al final del archivo)
- Test: `tests-js/cruce.test.mjs`, `tests-js/catalogos.test.mjs`

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `tests-js/cruce.test.mjs` (y agregar `negocioAnteriorSinContestar` al `import` de la línea 5):

```js
/* LA PREGUNTA "¿QUE PASO CON EL NEGOCIO ANTERIOR?" (Juan, 2026-11-18). */
const robot = (extra = {}) => ({
  // La propiedad vieja fija el dia en que el robot empezo a mirar (la carga inicial).
  vieja: { entity_id: "vieja", activa: true, direccion: "Gutenberg 6100", visto_primera_vez: "2026-08-17" },
  nueva: { entity_id: "nueva", activa: true, direccion: "Pastor 1200", visto_primera_vez: "2026-11-18", ...extra },
});
const cerrado = (id, fin, extra = {}) => ({
  id, direccion: "Pastor 1221", estado: "cerrado", fecha_fin: fin, entity_id_cartera: null, ...extra,
});

test("la propiedad nueva pregunta por el negocio cerrado de su misma direccion", () => {
  const anterior = negocioAnteriorSinContestar(
    robot().nueva, [cerrado("n1", "2025-11-14")], robot());
  assert.equal(anterior.id, "n1");
});

test("si hay varios cerrados parecidos, pregunta por el mas reciente", () => {
  const anterior = negocioAnteriorSinContestar(robot().nueva, [
    cerrado("n1", "2023-06-05"), cerrado("n2", "2025-11-20"), cerrado("n3", "2025-11-14"),
  ], robot());
  assert.equal(anterior.id, "n2");
});

test("tambien pregunta por uno caido", () => {
  const anterior = negocioAnteriorSinContestar(
    robot().nueva, [cerrado("n1", "2025-11-14", { estado: "caido" })], robot());
  assert.equal(anterior.id, "n1");
});

test("contestada una vez, no vuelve a preguntar por esa propiedad (ni por los otros parecidos)", () => {
  const contestado = cerrado("n2", "2025-11-20", {
    que_paso_despues: { motivo: "no_tiene_que_ver", propiedad: "nueva", fecha: "2026-11-18" },
  });
  assert.equal(negocioAnteriorSinContestar(
    robot().nueva, [cerrado("n1", "2025-11-14"), contestado], robot()), null);
});

test("no pregunta por un negocio posterior a la publicacion", () => {
  assert.equal(negocioAnteriorSinContestar(
    robot().nueva, [cerrado("n1", "2026-12-01")], robot()), null);
});

test("no pregunta por los negocios enganchados a la propia propiedad", () => {
  assert.equal(negocioAnteriorSinContestar(
    robot().nueva, [cerrado("n1", "2025-11-14", { entity_id_cartera: "nueva" })], robot()), null);
});

test("no pregunta por los abiertos", () => {
  assert.equal(negocioAnteriorSinContestar(
    robot().nueva, [cerrado("n1", "2025-11-14", { estado: "en_curso" })], robot()), null);
});

test("no pregunta por propiedades que ya estaban el primer dia del robot", () => {
  const cartera = robot({ visto_primera_vez: "2026-08-17" });
  assert.equal(negocioAnteriorSinContestar(
    cartera.nueva, [cerrado("n1", "2025-11-14")], cartera), null);
});

test("no pregunta por una propiedad que ya no esta activa", () => {
  const cartera = robot({ activa: false });
  assert.equal(negocioAnteriorSinContestar(
    cartera.nueva, [cerrado("n1", "2025-11-14")], cartera), null);
});

test("no pregunta si la direccion no se parece", () => {
  assert.equal(negocioAnteriorSinContestar(
    robot().nueva, [cerrado("n1", "2025-11-14", { direccion: "Minas 1600" })], robot()), null);
});
```

Agregar al final de `tests-js/catalogos.test.mjs` (y `QUE_PASO_DESPUES` a su import):

```js
test("los motivos de 'que paso con el negocio anterior' incluyen la salida 'no tiene que ver'", () => {
  const claves = QUE_PASO_DESPUES.map(([clave]) => clave);
  assert.deepEqual(claves, [
    "se_fue_el_inquilino", "se_cayo_la_venta", "termino_el_contrato", "otra", "no_tiene_que_ver",
  ]);
});
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `node --test tests-js/cruce.test.mjs tests-js/catalogos.test.mjs`
Expected: FAIL (`negocioAnteriorSinContestar` / `QUE_PASO_DESPUES` no existen).

- [ ] **Step 3: Implementación**

En `lib/catalogos.js`, a continuación de `EXPLICACION_ORIGEN`:

```js
/* Qué pasó con el negocio anterior de una dirección que vuelve a publicarse. Lo contesta
   Juan cuando la app le pregunta (ver `negocioAnteriorSinContestar` en cruce.js). La última
   opción es para cuando la dirección se parece pero NO es la misma propiedad (Pastor 1221 y
   Pastor 1223 son dos apartamentos distintos). */
export const QUE_PASO_DESPUES = [
  ["se_fue_el_inquilino", "Se fue el inquilino"],
  ["se_cayo_la_venta", "Se cayó la venta"],
  ["termino_el_contrato", "Terminó el contrato"],
  ["otra", "Otra cosa"],
  ["no_tiene_que_ver", "No tiene que ver con esa dirección"],
];
```

Al final de `lib/cruce.js`:

```js
/* "¿QUE PASO CON EL NEGOCIO ANTERIOR?"

   Una propiedad que aparece publicada en una direccion donde ya hubo un negocio CERRADO o
   CAIDO es casi siempre un negocio distinto (otro inquilino, otro comprador): algo paso con el
   anterior —se fue el inquilino, se cayo la venta— y la app pregunta que, en vez de suponer.
   Se pregunta UNA vez por propiedad, por el negocio mas reciente que se le parece.

   Solo para propiedades que aparecieron DESPUES de que el robot empezo a mirar: las de la
   carga inicial ya estaban y su historia no se conoce, y preguntar por ellas es ruido. La
   carga inicial es la fecha de `visto_primera_vez` mas vieja de la cartera. */
export function negocioAnteriorSinContestar(propiedad, negocios, cartera) {
  if (!propiedad || !propiedad.activa || !propiedad.visto_primera_vez) return null;

  const cargaInicial = Object.values(cartera || {})
    .map((p) => p.visto_primera_vez).filter(Boolean).sort()[0];
  if (cargaInicial && propiedad.visto_primera_vez <= cargaInicial) return null;

  const parecidos = (negocios || []).filter((n) =>
    (n.estado === "cerrado" || n.estado === "caido")
    && n.fecha_fin
    && n.fecha_fin < propiedad.visto_primera_vez
    && n.entity_id_cartera !== propiedad.entity_id
    && puntaje(n.direccion, propiedad.direccion || propiedad.titulo) >= UMBRAL_SUGERENCIA);
  if (!parecidos.length) return null;

  // Con una sola respuesta (aunque sea "no tiene que ver") la propiedad queda contestada.
  const yaContesto = parecidos.some((n) => (n.que_paso_despues || {}).propiedad === propiedad.entity_id);
  if (yaContesto) return null;

  return [...parecidos].sort((a, b) => b.fecha_fin.localeCompare(a.fecha_fin))[0];
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `node --test tests-js/cruce.test.mjs tests-js/catalogos.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cruce.js lib/catalogos.js tests-js/cruce.test.mjs tests-js/catalogos.test.mjs
git commit -m "feat: detectar el negocio anterior sin contestar y los motivos de la respuesta

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: La pregunta entra a la bandeja como un aviso nuevo

**Files:**
- Modify: `lib/pendientes.js` (import, `GRUPOS`, `derivar`)
- Test: `tests-js/pendientes.test.mjs`

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `tests-js/pendientes.test.mjs`:

```js
/* "¿QUE PASO CON EL NEGOCIO ANTERIOR?" va en rojo: es una pregunta que la app no puede
   contestar sola. */
const carteraConNueva = () => ({
  vieja: { entity_id: "vieja", activa: true, estado: "publicada", direccion: "Gutenberg 6100",
    visto_primera_vez: "2026-08-17", origen_captacion: "B.d.r." },
  nueva: { entity_id: "nueva", activa: true, estado: "publicada", direccion: "Pastor 1200",
    visto_primera_vez: "2026-11-18", origen_captacion: "Ref. Martin" },
});
const cerradoPastor = (extra = {}) => ({
  id: "excel-75", direccion: "Pastor 1221", estado: "cerrado", fecha_fin: "2025-11-14",
  entity_id_cartera: null, avisos: [], ficha_completa: true, ficha_vigente: true, ...extra,
});

test("una propiedad nueva en una direccion con un negocio cerrado pregunta que paso", () => {
  const grupos = derivar([cerradoPastor()], [], "2026-11-18", carteraConNueva());
  const g = grupos.find((x) => x.clave === "que_paso_antes");
  assert.ok(g, "tiene que aparecer");
  assert.equal(g.urgente, true, "es una pregunta que la app no puede contestar sola");
  assert.equal(g.items[0].entity_id, "nueva");
  assert.match(g.items[0].detalle, /Pastor 1221/);
  assert.match(g.items[0].detalle, /2025-11-14/);
});

test("la pregunta lleva a la propiedad", () => {
  const item = derivar([cerradoPastor()], [], "2026-11-18", carteraConNueva())
    .find((x) => x.clave === "que_paso_antes").items[0];
  const abrir = accionesDe(item)[0];
  assert.equal(abrir.tipo, "propiedad");
  assert.equal(abrir.destino, "nueva");
});

test("contestada, la pregunta desaparece", () => {
  const contestado = cerradoPastor({
    que_paso_despues: { motivo: "se_fue_el_inquilino", propiedad: "nueva", fecha: "2026-11-18" },
  });
  const grupos = derivar([contestado], [], "2026-11-18", carteraConNueva());
  assert.equal(grupos.find((x) => x.clave === "que_paso_antes"), undefined);
});
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `node --test tests-js/pendientes.test.mjs`
Expected: FAIL (el grupo `que_paso_antes` no existe).

- [ ] **Step 3: Implementación**

En `lib/pendientes.js`:

(a) Arriba, junto a los imports:

```js
import { negocioAnteriorSinContestar } from "./cruce.js";
```

(b) En `GRUPOS`, justo después de `lo_hice_solo` (orden 2.6):

```js
  /* UNA DIRECCION QUE VUELVE A PUBLICARSE DESPUES DE UN NEGOCIO CERRADO. Es un negocio
     distinto, pero algo paso con el anterior y la app no lo puede saber: se pregunta. Rojo
     porque es una pregunta tuya, no una noticia. (Juan, 2026-11-18, Pastor 1200.) */
  que_paso_antes: { nombre: "¿Qué pasó con el negocio anterior?", orden: 2.7, urgente: true },
```

(c) En `derivar`, justo antes del `return [...mapa.values()].sort(...)` del final:

```js
  /* Una propiedad nueva en una direccion donde ya hubo un negocio cerrado: se pregunta que
     paso. Una sola vez por propiedad; ver `negocioAnteriorSinContestar`. */
  for (const propiedad of Object.values(cartera || {})) {
    const anterior = negocioAnteriorSinContestar(propiedad, negocios, cartera);
    if (!anterior) continue;
    agregar("que_paso_antes", {
      entity_id: propiedad.entity_id,
      titulo: propiedad.direccion || "Propiedad sin dirección",
      detalle: `Esta dirección ya tuvo un negocio cerrado (${comoSeLlama(anterior)}, `
        + `${anterior.fecha_fin}). ¿Qué pasó?`,
      fecha: propiedad.visto_primera_vez,
    });
  }
```

- [ ] **Step 4: Correr pendientes completo**

Run: `node --test tests-js/pendientes.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pendientes.js tests-js/pendientes.test.mjs
git commit -m "feat: la bandeja pregunta que paso con el negocio anterior de una direccion

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Una tarjeta por propiedad (`tarjetas()` reemplaza a `juntarRepetidos()`)

**Files:**
- Modify: `lib/pendientes.js` (reemplazar `sujeto`, `juntarRepetidos`, `bandeja`, `cuantosPendientes`)
- Modify: `tests-js/pendientes.test.mjs` (import, reemplazar los tests de `juntarRepetidos`, el test "la bandeja junta los repetidos" y ajustar el mensaje del test "ninguna pantalla llama a derivar")

- [ ] **Step 1: Escribir las pruebas nuevas (y quitar las viejas)**

En `tests-js/pendientes.test.mjs`:

1. Cambiar el import de la línea 3-4 a:
```js
import { derivar, GRUPOS, accionesDe, tarjetas, bandeja, cuantosPendientes }
  from "../lib/pendientes.js";
```
2. **Borrar** el bloque que va desde el comentario `/* Juntar los pendientes repetidos de una misma propiedad...` hasta el test `sin grupos devuelve vacio` inclusive (incluye la función auxiliar `grupo(...)` y los 6 tests de `juntarRepetidos`), y borrar el test `la bandeja junta los repetidos, y la cuenta sale de ella`.
3. En el test `ninguna pantalla llama a derivar por su cuenta`, cambiar el mensaje final a `"usar bandeja(), que ademas arma una tarjeta por propiedad"`.
4. Agregar al final del archivo:

```js
/* UNA TARJETA POR PROPIEDAD (Juan, 2026-11-18): "para todo tipo de noticias, 1 notificacion
   por propiedad; si tiene que preguntar varias cosas, todas dentro de la misma". */
const MINAS = {
  p1: { entity_id: "p1", activa: true, estado: "en_negociacion", direccion: "Minas 1600",
    precio: 90000, visto_primera_vez: "2026-08-17" },
};
const negocioDeMinas = (extra = {}) => ({
  id: "n1", direccion: "Minas 1600", entity_id_cartera: "p1", estado: "en_curso",
  avisos: [{ tipo: "revisar_puntas", detalle: "puntas?" }], ...extra,
});
const altaDeMinas = { id: "e1", entity_id: "p1", tipo: "alta", direccion: "Minas 1600",
  fecha: "2026-11-18", detalle: {} };

test("un cambio en una propiedad llega en UNA tarjeta con una linea por aviso", () => {
  // Tres avisos distintos, de tres origenes distintos: un negocio, un evento y la cartera.
  const lista = bandeja([negocioDeMinas()], [altaDeMinas], "2026-11-18", MINAS);
  assert.equal(lista.length, 1, "una sola tarjeta");
  assert.deepEqual(lista[0].lineas.map((l) => l.clave).sort(),
    ["alta", "falta_precio_negociacion", "revisar_puntas"]);
});

test("la tarjeta es roja si alguna linea pide algo, y las rojas van primero", () => {
  const t = bandeja([negocioDeMinas()], [altaDeMinas], "2026-11-18", MINAS)[0];
  assert.equal(t.urgente, true);
  assert.equal(t.lineas[t.lineas.length - 1].clave, "alta", "la gris (informativa) queda al final");
  assert.ok(t.lineas.slice(0, -1).every((l) => l.urgente), "las de arriba son rojas");
});

test("una tarjeta sin lineas rojas es gris y va despues de las rojas", () => {
  const cartera = {
    ...MINAS,
    p2: { entity_id: "p2", activa: true, estado: "publicada", direccion: "Zeta 10",
      visto_primera_vez: "2026-08-17" },
  };
  const solaAlta = { id: "e2", entity_id: "p2", tipo: "alta", direccion: "Zeta 10",
    fecha: "2026-11-18", detalle: {} };
  const lista = bandeja([negocioDeMinas()], [solaAlta], "2026-11-18", cartera);
  assert.deepEqual(lista.map((t) => t.entity_id), ["p1", "p2"]);
  assert.equal(lista[0].urgente, true);
  assert.equal(lista[1].urgente, false);
});

test("el toque abre el negocio abierto de la propiedad; sin negocio, la propiedad", () => {
  const conNegocio = bandeja([negocioDeMinas()], [altaDeMinas], "2026-11-18", MINAS)[0];
  assert.equal(conNegocio.negocio_id, "n1");

  const sinNegocio = bandeja([], [altaDeMinas], "2026-11-18",
    { p1: { ...MINAS.p1, estado: "publicada" } })[0];
  assert.equal(sinNegocio.negocio_id, null);
  assert.equal(sinNegocio.entity_id, "p1");
});

test("un aviso de un negocio CERRADO enganchado se junta con su propiedad", () => {
  const cerrado = negocioDeMinas({
    estado: "cerrado", fecha_fin: "2026-11-10",
    avisos: [{ tipo: "cierre_por_revisar", detalle: "revisalo" }],
  });
  const cartera = { p1: { ...MINAS.p1, estado: "publicada" } };
  const lista = bandeja([cerrado], [altaDeMinas], "2026-11-18", cartera);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].negocio_id, "n1", "sin negocio abierto, abre el cerrado a revisar");
});

test("un negocio sin propiedad en la cartera es su propia tarjeta", () => {
  const busqueda = { id: "b1", direccion: "Calle 6", entity_id_cartera: null, estado: "en_curso",
    avisos: [{ tipo: "busqueda_en_curso", detalle: "abierta" }] };
  const lista = bandeja([busqueda], [], "2026-11-18", {});
  assert.equal(lista.length, 1);
  assert.equal(lista[0].negocio_id, "b1");
  assert.equal(lista[0].entity_id, null);
});

test("una referida sigue siendo del NEGOCIO aunque el aviso traiga la propiedad del colega", () => {
  const evento = { id: "r1", tipo: "referida_avanzo", entity_id: "colega", negocio_id: "n7",
    direccion: "Casa del colega", fecha: "2026-11-18", detalle: "avanzo" };
  const otro = { ...evento, id: "r2", negocio_id: "n8" };
  const lista = bandeja([], [evento, otro], "2026-11-18", {});
  assert.deepEqual(lista.map((t) => t.negocio_id).sort(), ["n7", "n8"], "una por negocio");
});

test("cada linea conserva lo que necesitan sus botones", () => {
  const t = bandeja([negocioDeMinas()], [altaDeMinas], "2026-11-18", MINAS)[0];
  const alta = t.lineas.find((l) => l.clave === "alta");
  assert.deepEqual(alta.eventos, ["e1"]);
  assert.ok(accionesDe(alta).some((a) => a.tipo === "atendido"), "se sigue pudiendo despachar");
});

test("la cuenta del menu cuenta tarjetas, no avisos", () => {
  const lista = bandeja([negocioDeMinas()], [altaDeMinas], "2026-11-18", MINAS);
  assert.equal(derivar([negocioDeMinas()], [altaDeMinas], "2026-11-18", MINAS)
    .reduce((t, g) => t + g.items.length, 0), 3, "tres avisos");
  assert.equal(cuantosPendientes(lista), 1, "una tarjeta");
});

test("la bandeja de PASTOR: tres avisos sueltos pasan a una sola tarjeta", () => {
  // El caso real del 2026-11-18: la propiedad nueva, mas dos negocios viejos parecidos.
  const cartera = {
    ...carteraConNueva(),
    nueva: { ...carteraConNueva().nueva, origen_captacion: null },
  };
  const evento = { id: "e9", entity_id: "nueva", tipo: "alta", direccion: "Pastor 1200",
    fecha: "2026-11-18", detalle: {} };
  const lista = bandeja([cerradoPastor()], [evento], "2026-11-18", cartera);
  assert.equal(lista.length, 1, "una sola tarjeta");
  assert.equal(lista[0].titulo, "Pastor 1200");
  assert.deepEqual(lista[0].lineas.map((l) => l.clave), ["que_paso_antes", "alta"]);
});

test("nada se pierde: la cantidad de lineas es la cantidad de avisos", () => {
  const args = [[negocioDeMinas()], [altaDeMinas], "2026-11-18", MINAS];
  const avisos = derivar(...args).reduce((t, g) => t + g.items.length, 0);
  const lineas = bandeja(...args).reduce((t, x) => t + x.lineas.length, 0);
  assert.equal(lineas, avisos);
});

test("sin avisos, la bandeja esta vacia", () => {
  assert.deepEqual(bandeja([], [], "2026-11-18", {}), []);
  assert.equal(cuantosPendientes([]), 0);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test tests-js/pendientes.test.mjs`
Expected: FAIL (`tarjetas` no se exporta; `bandeja` aún devuelve grupos).

- [ ] **Step 3: Implementación**

En `lib/pendientes.js`, **reemplazar** desde el comentario `/* Junta los pendientes que son de la misma propiedad.` hasta el final de `cuantosPendientes` (incluye `sujeto`, `juntarRepetidos`, `bandeja`, `cuantosPendientes`) por:

```js
/* UNA TARJETA POR PROPIEDAD.

   `derivar` devuelve un pendiente por problema, agrupado por tipo. Eso es lo que se prueba y no
   cambia. Juan pidio que una propiedad con varias novedades llegue en UNA sola notificacion
   —"si tiene que preguntar varias cosas, todas dentro de la misma"— y que lo que le toca a el
   vaya en rojo. Esto re-agrupa esos mismos pendientes:

   - un aviso con `entity_id` pertenece a esa propiedad;
   - un aviso de un NEGOCIO pertenece a la propiedad a la que esta enganchado (antes eran
     claves distintas, `n:` y `p:`, y por eso una propiedad y su negocio llegaban por separado);
   - una REFERIDA trae a la vez su negocio y la propiedad DEL COLEGA: manda el negocio;
   - un negocio sin propiedad en la cartera (busqueda, suplencia, uno viejo) es su propia tarjeta.

   Es presentacion, no dato: por eso vive aparte y no adentro de `derivar`. */
const estaAbierto = (n) => n.estado !== "cerrado" && n.estado !== "caido";

export function tarjetas(grupos, negocios) {
  const porId = new Map((negocios || []).map((n) => [n.id, n]));
  const abiertoDe = new Map();
  for (const n of negocios || []) {
    if (n.entity_id_cartera && estaAbierto(n) && !abiertoDe.has(n.entity_id_cartera)) {
      abiertoDe.set(n.entity_id_cartera, n.id);
    }
  }

  const mapa = new Map();
  for (const grupo of grupos) {
    for (const item of grupo.items) {
      const negocio = item.negocio_id ? porId.get(item.negocio_id) : null;
      let clave;
      let propiedad = null;
      if (item.negocio_id && item.entity_id) {
        clave = `n:${item.negocio_id}`;
      } else if (item.entity_id) {
        propiedad = item.entity_id;
        clave = `p:${propiedad}`;
      } else if (negocio && negocio.entity_id_cartera) {
        propiedad = negocio.entity_id_cartera;
        clave = `p:${propiedad}`;
      } else {
        clave = `n:${item.negocio_id}`;
      }

      if (!mapa.has(clave)) {
        mapa.set(clave, {
          clave,
          titulo: item.titulo,
          entity_id: propiedad,
          negocio_id: propiedad ? (abiertoDe.get(propiedad) || null) : item.negocio_id,
          orden: grupo.orden,
          urgente: false,
          lineas: [],
        });
      }
      const tarjeta = mapa.get(clave);
      // Sin negocio abierto, el toque abre el negocio cuyo aviso hay que revisar.
      if (!tarjeta.negocio_id && item.negocio_id) tarjeta.negocio_id = item.negocio_id;
      tarjeta.lineas.push({ ...item, grupo: grupo.nombre, urgente: grupo.urgente });
      if (grupo.urgente) tarjeta.urgente = true;
      tarjeta.orden = Math.min(tarjeta.orden, grupo.orden);
    }
  }

  const lista = [...mapa.values()];
  // Adentro: lo rojo primero. `sort` es estable, asi que se conserva el orden de los grupos.
  for (const t of lista) t.lineas.sort((a, b) => Number(b.urgente) - Number(a.urgente));
  // Afuera: las rojas primero; despues, por el aviso mas urgente que traen.
  return lista.sort((a, b) =>
    (Number(b.urgente) - Number(a.urgente)) || (a.orden - b.orden)
    || String(a.titulo).localeCompare(String(b.titulo)));
}

/* La bandeja tal cual se muestra. Es la unica puerta: nadie llama a `derivar` por su
   cuenta.

   Existe porque el globito rojo del menu y el "⚠ Atencion N" del titulo contaban lo
   mismo por caminos separados y se terminaron separando. */
export function bandeja(negocios, eventos, hoy, cartera) {
  return tarjetas(derivar(negocios, eventos, hoy, cartera), negocios);
}

// Se cuentan tarjetas, no avisos: una propiedad con tres novedades es una sola cosa para revisar.
export function cuantosPendientes(lista) {
  return lista.length;
}
```

- [ ] **Step 4: Correr pendientes y todo JS**

Run: `node --test tests-js/pendientes.test.mjs`
Expected: PASS.

Run: `node --test tests-js/*.test.mjs`
Expected: todo en verde salvo, si hay, tests que importen `juntarRepetidos` o usen la forma vieja de `bandeja()`: corregirlos (en este repo sólo `pendientes.test.mjs` lo hacía).

- [ ] **Step 5: Commit**

```bash
git add lib/pendientes.js tests-js/pendientes.test.mjs
git commit -m "feat: la bandeja arma una tarjeta por propiedad, con lineas rojas y grises

Reemplaza juntarRepetidos(): un negocio enganchado hereda la propiedad de su aviso, asi
una propiedad y su negocio llegan juntos.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Estilos de la tarjeta

**Files:**
- Modify: `app.css` (agregar después de la regla `.grupo-item-mas li { margin-top: 2px; }`, ~línea 373)

(No tiene prueba propia: `tests-js/estilos.test.mjs` vigila que cada clase usada en las pantallas exista acá, y se corre en la Task 7.)

- [ ] **Step 1: Agregar las reglas**

```css
/* HOY: una tarjeta por propiedad. Roja si alguna linea pide que marques algo. */
.aviso-propiedad {
  background: var(--lienzo-2);
  border: 1px solid var(--linea);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.aviso-propiedad.urgente { border-color: var(--rojo); background: var(--rojo-suave); }
.aviso-titulo { font-weight: 700; font-size: 15px; margin: 0 0 6px; }
.aviso-lineas { list-style: none; margin: 0; padding: 0; }
.aviso-linea { margin-top: 8px; padding-left: 12px; border-left: 3px solid var(--linea); }
.aviso-linea.pide { border-left-color: var(--rojo); }
.aviso-linea-texto { margin: 0; font-size: 13px; color: var(--tinta-2); }
.aviso-linea.pide .aviso-linea-texto { color: var(--rojo-tinta); }
.aviso-abrir { margin-top: 12px; }
```

- [ ] **Step 2: Verificar que las variables existen**

Run: `grep -c -e "--lienzo-2:" -e "--linea:" -e "--rojo:" -e "--rojo-suave:" -e "--rojo-tinta:" -e "--tinta-2:" app.css`
Expected: un número ≥ 6 (cada variable está definida al menos una vez). Si alguna falta, `estilos.test.mjs` fallará en la Task 7: usar otra variable que sí exista.

- [ ] **Step 3: Commit**

```bash
git add app.css
git commit -m "style: clases de la tarjeta de aviso por propiedad

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Hoy dibuja tarjetas

**Files:**
- Modify: `vistas/hoy.js` (`dibujarHoy` y `dibujarGrupo`)

- [ ] **Step 1: Cambiar `dibujarHoy`**

En `dibujarHoy` (línea ~39-52), cambiar los nombres y la llamada:

```js
  const lista = bandeja(estado.datos.negocios, eventos, estado.hoy, estado.datos.cartera);
  const total = cuantosPendientes(lista);
```
y, donde estaba `for (const grupo of grupos) trozo.append(dibujarGrupo(grupo, estado));`:

```js
  for (const tarjeta of lista) trozo.append(dibujarTarjeta(tarjeta, estado));
```

- [ ] **Step 2: Reemplazar `dibujarGrupo` por `dibujarTarjeta` + `botonDeAccion`**

Reemplazar TODA la función `dibujarGrupo(grupo, estado)` (desde `function dibujarGrupo(` hasta su `}` de cierre, justo antes del comentario `/* Qué tan seguro es cada paso del camino.`) por estas dos funciones. **El cuerpo del manejador de clic se MUEVE sin cambios**: es el bloque que hoy está dentro de `boton.addEventListener("click", async () => { ... });` (ramas `atendido`, `visto-bueno`, `es-la-referida`/`no-es-la-referida`, `cuenta`/`no-cuenta` y el `else { estado.irA(accion.tipo, accion.destino); }`). Cortarlo de ahí y pegarlo donde dice `/* ...CUERPO... */`; dentro usa `accion`, `item` y `estado`, que acá se llaman igual.

```js
/* Un boton de un aviso. Sirve para los de cada linea ("Está bien", "Sí, es esa", "Ya lo
   resolví"…) y para el "Abrir y completar" de la tarjeta. */
function botonDeAccion(accion, item, estado, primario) {
  const boton = document.createElement("button");
  boton.className = `boton boton-chico${primario ? " boton-primario" : ""}`;
  boton.textContent = accion.texto;
  boton.addEventListener("click", async () => {
    /* ...CUERPO: el bloque de clic que estaba en dibujarGrupo, tal cual... */
  });
  return boton;
}

/* UNA TARJETA POR PROPIEDAD. Adentro, una linea por aviso: en rojo las que piden algo,
   en gris las informativas. El boton de abajo abre el negocio (o la propiedad) y ahi quedan
   marcados en rojo los campos que faltan. */
function dibujarTarjeta(tarjeta, estado) {
  const anio = Number(estado.hoy.slice(0, 4));
  const marca = nodo(html`
    <section class="aviso-propiedad ${tarjeta.urgente ? "urgente" : ""}">
      <p class="aviso-titulo">${escapar(tarjeta.titulo)}</p>
      <ul class="aviso-lineas"></ul>
      <div class="botonera aviso-abrir"></div>
    </section>
  `);

  const lista = marca.querySelector(".aviso-lineas");
  for (const linea of tarjeta.lineas) {
    const li = document.createElement("li");
    li.className = `aviso-linea ${linea.urgente ? "pide" : "informa"}`;
    li.innerHTML = html`
      <p class="aviso-linea-texto"><strong>${escapar(linea.grupo)}.</strong>
        ${escapar(linea.detalle)}${
          linea.fecha ? ` <span class="capa-sub">· ${fechaCorta(linea.fecha, anio)}</span>` : ""
        }</p>
      <div class="botonera"></div>
    `;
    /* Los botones de la linea son los que RESUELVEN algo ("Está bien", "Sí / No", "Ya lo
       resolví"). Abrir lo hace la tarjeta entera, una sola vez. */
    const botonera = li.querySelector(".botonera");
    for (const accion of accionesDe(linea).filter((a) => a.tipo !== "ficha" && a.tipo !== "propiedad")) {
      botonera.append(botonDeAccion(accion, linea, estado, false));
    }
    if (!botonera.children.length) botonera.remove();
    lista.append(li);
  }

  const abrir = tarjeta.negocio_id
    ? { tipo: "ficha", destino: tarjeta.negocio_id, texto: "Abrir y completar" }
    : tarjeta.entity_id
      ? { tipo: "propiedad", destino: tarjeta.entity_id, texto: "Ver y editar" }
      : null;
  const zona = marca.querySelector(".aviso-abrir");
  if (abrir) zona.append(botonDeAccion(abrir, tarjeta, estado, true));
  else zona.remove();
  return marca;
}
```

- [ ] **Step 3: Correr las pruebas, incluidas las de estilos**

Run: `node --test tests-js/*.test.mjs`
Expected: PASS (1161 + las nuevas). Si `estilos.test.mjs` falla por una clase, agregarla a `app.css` (Task 6).

- [ ] **Step 4: Verificar que no quedó ninguna referencia vieja**

Run: `grep -n "dibujarGrupo\|juntarRepetidos\|item.mas\|grupo.items" vistas/hoy.js`
Expected: sin resultados.

- [ ] **Step 5: Commit**

```bash
git add vistas/hoy.js
git commit -m "feat: Hoy dibuja una tarjeta por propiedad

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: La pregunta se contesta en la propiedad (y cada aviso rojo tiene su campo)

**Files:**
- Modify: `vistas/propiedad.js` (imports y `campos()`)
- Test: `tests-js/pendientes.test.mjs` (auditoría estática, al final)

- [ ] **Step 1: Escribir la prueba de auditoría que falla**

Agregar al final de `tests-js/pendientes.test.mjs`:

```js
/* UNA LINEA ROJA SIN SU CAMPO ES UN BOTON QUE NO HACE NADA. Cada aviso que lleva a la ficha
   de la PROPIEDAD (no al negocio) tiene que tener su campo marcado ahi. */
test("cada aviso que abre la propiedad tiene su campo marcado en la propiedad", () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const pantalla = readFileSync(join(raiz, "vistas", "propiedad.js"), "utf-8");
  const origen = /"origen_captacion"[\s\S]{0,200}!p\.origen_captacion/;
  const marcan = {
    alta: origen,
    carga_inicial: origen,
    origen_sin_clasificar: origen,
    baja: /"desenlace_confirmado"[\s\S]{0,200}!p\.desenlace_confirmado/,
    falta_precio_negociacion: /"precio_negociacion"[\s\S]{0,200}!p\.precio_negociacion/,
    posible_duplicado: /posible_duplicado_de/,
    que_paso_antes: /que_paso_despues/,
  };
  for (const [clave, regla] of Object.entries(marcan)) {
    assert.ok(GRUPOS[clave], `${clave} no existe en GRUPOS`);
    assert.match(pantalla, regla, `${clave}: la propiedad no marca ese campo`);
  }
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `node --test tests-js/pendientes.test.mjs`
Expected: FAIL sólo en `que_paso_antes: la propiedad no marca ese campo`.

- [ ] **Step 3: Implementación en `vistas/propiedad.js`**

(a) Imports. Cambiar `import { ORIGENES } from "../lib/catalogos.js";` por:
```js
import { ORIGENES, QUE_PASO_DESPUES } from "../lib/catalogos.js";
import { negocioAnteriorSinContestar } from "../lib/cruce.js";
```
y `import { editarPropiedad } from "../lib/guardado.js";` por:
```js
import { editarPropiedad, editarNegocio } from "../lib/guardado.js";
```

(b) En `campos(p, estado)`, justo ANTES de la línea `agregar("notas", "Notas", "text", p.notas);`:

```js
  /* "¿QUE PASO CON EL NEGOCIO ANTERIOR?" Esta direccion ya tuvo un negocio cerrado y la
     publicacion de ahora es otro negocio. Se marca en rojo mientras falte. La respuesta se
     guarda en el negocio VIEJO (`que_paso_despues`); el nuevo nace aparte, como siempre. */
  const sinContestar = negocioAnteriorSinContestar(p, estado.datos.negocios, estado.datos.cartera);
  const contestado = (estado.datos.negocios || [])
    .find((n) => (n.que_paso_despues || {}).propiedad === p.entity_id);
  const deAntes = sinContestar || contestado;
  if (deAntes) {
    const fila = document.createElement("div");
    fila.className = `campo-fila${sinContestar ? " falta" : ""}`;
    fila.innerHTML = html`
      <label for="prop-que-paso">Esta dirección ya tuvo un negocio cerrado
        (${escapar(deAntes.direccion || "sin dirección")}, ${escapar(deAntes.fecha_fin || "")}).
        ¿Qué pasó?${sinContestar ? " — falta" : ""}</label>
      <select class="campo" id="prop-que-paso">
        <option value=""></option>
        ${QUE_PASO_DESPUES.map(([v, t]) => `<option value="${escapar(v)}"${
          v === (deAntes.que_paso_despues || {}).motivo ? " selected" : ""}>${escapar(t)}</option>`).join("")}
      </select>
    `;
    fila.querySelector("select").addEventListener("change", (evento) => {
      if (!evento.target.value) return;
      editarNegocio(estado, deAntes.id, {
        que_paso_despues: { motivo: evento.target.value, propiedad: p.entity_id, fecha: estado.hoy },
      });
      estado.redibujar();
    });
    contenedor.append(fila);
  }

```

- [ ] **Step 4: Correr todo JS**

Run: `node --test tests-js/*.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vistas/propiedad.js tests-js/pendientes.test.mjs
git commit -m "feat: la propiedad pregunta que paso con el negocio anterior, marcado en rojo

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Caché del teléfono, verificación con datos reales y publicación

**Files:**
- Modify: `sw.js:16` (`CACHE`)

- [ ] **Step 1: Subir la versión del caché**

En `sw.js`, cambiar `const CACHE = "como-venimos-v172";` por `const CACHE = "como-venimos-v173";`.

- [ ] **Step 2: Suite completa**

Run: `node --test tests-js/*.test.mjs`
Expected: 0 fail.

Run: `SIN_DATOS_VIVOS=1 python -m unittest discover -s tests -t . 2>&1 | grep -E "^(Ran|OK|FAILED)"`
Expected: `OK (skipped=22)`.

- [ ] **Step 3: Verificar con los datos reales de hoy (script suelto, NO se commitea)**

Guardar en el scratchpad de la sesión (no en el repo) un script `verificar_bandeja.mjs`:

```js
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const [raiz, hoy] = process.argv.slice(2);
const mod = (f) => import(pathToFileURL(join(raiz, f)).href);
const leer = (f) => JSON.parse(readFileSync(join(raiz, "datos", f), "utf8"));
const { fusionar, completarConNegocios } = await mod("lib/cartera.js");
const { revisar } = await mod("lib/motor.js");
const { negociosQueFaltan } = await mod("lib/nacen-solos.js");
const { bandeja, derivar, sinAtender } = await mod("lib/pendientes.js");
const ajustes = leer("ajustes.json"), misDatos = leer("mis_datos.json");
let cartera = fusionar(leer("cartera.json"), misDatos);
let negocios = leer("negocios.json").map((n) => revisar(n, ajustes, hoy, cartera));
negocios.push(...negociosQueFaltan(cartera, negocios, ajustes, hoy));
cartera = completarConNegocios(cartera, negocios);
const eventos = sinAtender(leer("eventos.json"), misDatos, cartera);
const avisos = derivar(negocios, eventos, hoy, cartera).reduce((t, g) => t + g.items.length, 0);
const lista = bandeja(negocios, eventos, hoy, cartera);
for (const t of lista) {
  console.log(`[${t.urgente ? "ROJA" : "gris"}] ${t.titulo}  → abre ${t.negocio_id ? "negocio " + t.negocio_id : "propiedad"}`);
  for (const l of t.lineas) console.log(`     ${l.urgente ? "●" : "○"} ${l.grupo}`);
}
console.log(`\navisos sueltos: ${avisos} | tarjetas: ${lista.length} | lineas: ${lista.reduce((t, x) => t + x.lineas.length, 0)}`);
```

Run: `node <ruta-al-script> "c:/Users/es_bi/OneDrive/Desktop/claude/Como venimos" 2026-11-18`
Expected (con los datos del 2026-11-18, después del arreglo de Pastor): una tarjeta **roja** "Pastor 1200" con las líneas `¿Qué pasó con el negocio anterior?` (●) y `Propiedades nuevas sin origen` (○, sólo si todavía no cargó el origen), y la cuenta `lineas` igual a `avisos sueltos`.

- [ ] **Step 4: Ver la pantalla en Chrome**

Servir con `python -m http.server 8765` desde la raíz del proyecto, abrir `http://localhost:8765/` en un **perfil de Chrome nuevo** (`--user-data-dir` nuevo y `--disk-cache-size=1`: Chrome cachea los módulos entre corridas) con un iframe de 420 px de ancho, y sacar una captura de la pestaña Hoy. Mirar: la tarjeta roja, la línea roja con borde rojo, la gris, el botón "Ver y editar", y que NO aparecen los títulos por tipo. Abrir la propiedad y ver el desplegable "¿Qué pasó?" en rojo. (El clic y el guardado reales no se pueden probar sin el token de GitHub: ese paso lo hace Juan.)

- [ ] **Step 5: Commit, subir y avisar**

```bash
git add sw.js
git commit -m "chore: caché v173 para que el teléfono tome las tarjetas por propiedad

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git pull --rebase -q origin main
git push
```

Después: actualizar la memoria del proyecto (`proyecto-como-venimos-estado.md`: caché v173, "Hoy = una tarjeta por propiedad", la regla de que un negocio cerrado nunca se engancha, y que `juntarRepetidos` ya no existe) y decirle a Juan que **cierre y abra la app dos veces** para que tome la versión nueva.

---

## Self-review (hecha al escribir el plan)

**Cobertura del spec:**
- §1 unidad = propiedad, claves, referidas, negocios sin propiedad → Task 5 (`tarjetas`), con tests para cada caso.
- §2 líneas rojas/grises, tarjeta roja primero, se pierden los títulos por tipo → Task 5 (orden) + Task 7 (dibujo) + Task 6 (estilos).
- §3 botón único "Abrir y completar", botones por línea, auditoría de la ficha, contador por tarjetas → Task 5 (`negocio_id`, `cuantosPendientes`), Task 7 (botones), Task 8 (auditoría estática).
- §4 Regla 1 → Task 1. Regla 2 → Task 2. Regla 3 (la pregunta, selector con "no tiene que ver", respuesta en el negocio viejo, una vez por propiedad, el más reciente) → Tasks 3, 4, 8.
- §5 y "Fuera de alcance" → no se tocan robot, cuentas, ni el botón "Mirar mi cartera ahora".
- Pruebas 1-8 del spec: 1/2 → Task 5; 3 → Task 1; 4 → Task 2; 5 → Tasks 3-4; 6 (caso Pastor) → Task 5 ("la bandeja de PASTOR", con fixtures inline porque los tests nuevos no leen `datos/`); 7 ("nada se pierde") → Task 5 + Task 9 Step 3 con datos reales; 8 → Task 8.

**Decisión que difiere del spec (a propósito):** la Regla 3 del spec decía "propiedad nueva (evento `alta`)". El plan la ata a la **propiedad**, no al evento, porque el evento `alta` se apaga cuando Juan carga el origen y la pregunta se perdería sin contestarse. Además se excluyen las propiedades de la carga inicial del robot (17/08), porque con ellas la pregunta salía también para Flammarión 5000 (un departamento distinto del mismo edificio, cerrado en 2024): comprobado simulando con los datos reales.

**Tipos y nombres consistentes:** `negocioAnteriorSinContestar(propiedad, negocios, cartera)` (Tasks 3, 4, 8); `QUE_PASO_DESPUES` (Tasks 3, 8); `que_paso_despues: { motivo, propiedad, fecha }` (Tasks 3, 8); grupo `que_paso_antes` (Tasks 4, 5, 8); `tarjetas(grupos, negocios)` / tarjeta `{ clave, titulo, entity_id, negocio_id, orden, urgente, lineas }` / línea = item + `{ grupo, urgente }` (Tasks 5, 7).

**Verificado antes de escribir el plan:** contestar la pregunta (editar el negocio viejo con `revisar`) no cambia su plata ni sus fechas y conserva el campo nuevo; la línea base de JS es 1161 pass.
