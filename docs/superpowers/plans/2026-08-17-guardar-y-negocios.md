# Guardar y Negocios — Plan de implementación (Fase 2b2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario pueda abrir un negocio, corregirlo y que quede guardado — para empezar a vaciar las 50 pendientes con datos reales.

**Architecture:** El motor de plata se porta a JavaScript (`lib/motor.js`) para poder recalcular al editar, y `lib/salud.js` pasa a usarlo en vez de repetir la cuenta. El guardado va contra la API de GitHub con un token que el usuario pega una vez; `lib/guardado.js` aplica los cambios en memoria al instante y encola la subida, así la app responde aunque no haya señal.

**Tech Stack:** JavaScript con módulos ES nativos, `node --test`. Sin dependencias. API de GitHub Contents.

**Spec de referencia:** [`../specs/2026-08-17-como-venimos-design.md`](../specs/2026-08-17-como-venimos-design.md) — implementa §3.3, §3.4, §5 (en JS) y §7.3.

> **Nota de entorno.** Windows, comandos POSIX con la herramienta **Bash**. Para probar en el
> navegador: `python -m http.server 8765`. Los tests de JS: `node --test tests-js/*.test.mjs`.

---

## Alcance de esta fase

**Entra:** el motor de plata en JavaScript, el guardado contra GitHub con su pantalla guiada para el token, la lista de Negocios con filtros, la ficha editable de cada negocio, y despachar pendientes desde Hoy.

**No entra:** la pantalla de Cartera, el alta manual de negocios nuevos, los contactos con WhatsApp, la calculadora de renta ni el reporte descargable. Los pendientes que salen de la cartera (los 12 `carga_inicial` y el duplicado) se van a poder marcar como atendidos, pero completarlos de verdad es la fase de Cartera.

## Por qué el motor se porta a JavaScript

Hasta ahora la cuenta de la plata vivía solo en Python (`negocios/motor.py`), y estaba bien: el importador corre una vez. Pero **si el usuario corrige el precio de un negocio en el celular, la facturación y la ganancia tienen que recalcularse ahí mismo**, sin pasar por Python.

Además `lib/salud.js` ya repetía esa matemática adentro de `comparativaCategorias`. Con `lib/motor.js` queda una sola implementación en JavaScript, y sigue habiendo dos en total (Python y JS) que se verifican cruzadas: ambas tienen que dar los mismos números sobre los mismos datos.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/motor.js` | BASE, facturación, ganancia y revalidación de avisos. Puro. |
| `lib/github.js` | Hablar con la API de GitHub: leer y escribir archivos del repo. |
| `lib/guardado.js` | Aplicar ediciones en memoria, llevar la cola y sincronizar. |
| `vistas/ajustes.js` | Pantalla guiada para crear y pegar el token. |
| `vistas/negocios.js` | Lista de negocios con filtros. |
| `vistas/ficha.js` | Ficha de un negocio, editable. |

---

## Task 1: `lib/motor.js` — el motor de plata en JavaScript

**Files:**
- Create: `lib/motor.js`
- Test: `tests-js/motor.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests-js/motor.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { base, splitVigente, calcular, pctPorDefecto, REGIMENES } from "../lib/motor.js";

const AJUSTES = {
  categorias: [{ categoria: "RAP", split_pct: 0.45, fee_mensual_usd: 70, desde: "2026-01-01", hasta: null }],
  defaults_comision: { venta: { 1: 0.03, 2: 0.06 }, alquiler: { 1: 1.0, 2: 2.0 } },
  regla_martin: { facturacion: 0.5, ganancia: 0.35 },
  pct_suplencia: 0.125,
  pct_referido_saliente: 0.25,
  pct_referido_entrante_otro: 0.75,
};

test("base: precio por porcentaje", () => {
  assert.equal(base(100000, 0.03), 3000);
  assert.equal(base(333, 2), 666);
});

test("base: sin datos da cero", () => {
  assert.equal(base(null, 0.03), 0);
  assert.equal(base(100000, null), 0);
});

test("pctPorDefecto: los optimos de venta y alquiler", () => {
  assert.equal(pctPorDefecto("venta", 1, AJUSTES), 0.03);
  assert.equal(pctPorDefecto("venta", 2, AJUSTES), 0.06);
  assert.equal(pctPorDefecto("alquiler", 1, AJUSTES), 1);
  assert.equal(pctPorDefecto("alquiler", 2, AJUSTES), 2);
  assert.equal(pctPorDefecto("renovacion_alquiler", 1, AJUSTES), 1);
});

test("splitVigente: la categoria de esa fecha", () => {
  assert.deepEqual(splitVigente("2026-03-15", AJUSTES), ["RAP", 0.45]);
});

test("splitVigente: antes de la historia no hay categoria", () => {
  assert.deepEqual(splitVigente("2023-05-01", AJUSTES), [null, null]);
  assert.deepEqual(splitVigente(null, AJUSTES), [null, null]);
});

// Los mismos siete casos que verifica el motor de Python, sobre el ejemplo del usuario:
// propiedad de 100.000 al 3% -> BASE 3.000 (1 punta) / 6.000 (2 puntas).
test("captacion mia, una punta", () => {
  assert.deepEqual(calcular("captacion_mia", 3000, "2026-03-15", AJUSTES), [3000, 1350]);
});

test("captacion mia, dos puntas", () => {
  assert.deepEqual(calcular("captacion_mia", 6000, "2026-03-15", AJUSTES), [6000, 2700]);
});

test("referida de Martin: mitad de facturacion, 35% del total", () => {
  assert.deepEqual(calcular("ref_martin", 3000, "2026-03-15", AJUSTES), [1500, 1050]);
  assert.deepEqual(calcular("ref_martin", 6000, "2026-03-15", AJUSTES), [3000, 2100]);
});

test("referida de otro colega: paga 25% de referido antes de su tajada", () => {
  assert.deepEqual(calcular("ref_otro_colega", 3000, "2026-03-15", AJUSTES), [3000, 1012.5]);
  assert.deepEqual(calcular("ref_otro_colega", 6000, "2026-03-15", AJUSTES), [6000, 2025]);
});

test("yo referi: solo factura su parte", () => {
  assert.deepEqual(calcular("yo_referi", 3000, "2026-03-15", AJUSTES), [750, 337.5]);
  assert.deepEqual(calcular("yo_referi", 6000, "2026-03-15", AJUSTES), [1500, 675]);
});

test("suplencia: no factura, y el 12,5% va entero al bolsillo", () => {
  assert.deepEqual(calcular("suplencia", 6000, "2026-03-15", AJUSTES), [0, 750]);
});

test("sin categoria vigente no se calcula ganancia", () => {
  assert.deepEqual(calcular("captacion_mia", 3000, "2023-05-01", AJUSTES), [3000, null]);
});

test("la plata se redondea a centavos", () => {
  // 0,45 x 0,75 x 3000 da 1012.5000000000001 en binario.
  const [, ganancia] = calcular("ref_otro_colega", 3000, "2026-03-15", AJUSTES);
  assert.equal(String(ganancia), "1012.5");
});

test("un regimen desconocido avisa", () => {
  assert.throws(() => calcular("cualquier_cosa", 3000, "2026-03-15", AJUSTES), /desconocido/);
});

test("REGIMENES tiene los cinco", () => {
  assert.equal(REGIMENES.length, 5);
  assert.ok(REGIMENES.includes("suplencia"));
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests-js/motor.test.mjs 2>&1 | tail -5`
Expected: FAIL — `Cannot find module .../lib/motor.js`

- [ ] **Step 3: Escribir la implementación**

Crear `lib/motor.js`:

```js
/* El motor de plata, en JavaScript. Es el gemelo de negocios/motor.py.

   Existe porque cuando el usuario corrige un negocio en el celular, la facturacion y la
   ganancia tienen que recalcularse ahi mismo. Las dos implementaciones se verifican
   cruzadas: sobre los mismos datos tienen que dar los mismos numeros.

   Las reglas estan en §5 de la especificacion. */

export const REGIMENES = [
  "captacion_mia",
  "ref_martin",
  "ref_otro_colega",
  "yo_referi",
  "suplencia",
];

const FAMILIA = {
  venta: "venta",
  alquiler: "alquiler",
  renovacion_alquiler: "alquiler",
  suplencia: "venta",
};

/* Sin esto la plata sale con colas binarias (1012.5000000000001). */
const plata = (n) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);

export function pctPorDefecto(tipoNegocio, puntas, ajustes) {
  const familia = FAMILIA[tipoNegocio] || tipoNegocio;
  const tabla = (ajustes.defaults_comision || {})[familia];
  if (!tabla) return null;
  return tabla[puntas === 2 ? 2 : 1];
}

export function base(precio, pctComision) {
  if (precio === null || precio === undefined) return 0;
  if (pctComision === null || pctComision === undefined) return 0;
  return precio * pctComision;
}

/* Lleva fechas porque si el usuario pasa a ALTO en junio, los negocios de enero a mayo
   tienen que seguir calculandose al 45%. */
export function splitVigente(fecha, ajustes) {
  if (!fecha) return [null, null];
  for (const c of ajustes.categorias || []) {
    if (c.desde && fecha < c.desde) continue;
    if (c.hasta && fecha > c.hasta) continue;
    return [c.categoria, c.split_pct];
  }
  return [null, null];
}

/* Devuelve [facturacion, ganancia]. Si en esa fecha no habia categoria configurada, la
   ganancia vuelve null: significa "no lo recalcules, el numero viene del Excel". */
export function calcular(regimen, baseValor, fechaFin, ajustes) {
  if (!REGIMENES.includes(regimen)) {
    throw new Error(`Régimen de comisión desconocido: ${regimen}`);
  }
  const [, split] = splitVigente(fechaFin, ajustes);

  if (regimen === "suplencia") {
    // Cubrir una visita no pasa por RE/MAX: no factura, y el 12,5% va entero al bolsillo.
    return [0, plata(baseValor * (ajustes.pct_suplencia ?? 0.125))];
  }
  if (regimen === "ref_martin") {
    // Arreglo fijo: no escala con RAP/ALTO/PURO.
    const r = ajustes.regla_martin || { facturacion: 0.5, ganancia: 0.35 };
    return [plata(baseValor * r.facturacion), plata(baseValor * r.ganancia)];
  }
  if (regimen === "captacion_mia") {
    return [plata(baseValor), split === null ? null : plata(split * baseValor)];
  }
  if (regimen === "ref_otro_colega") {
    const resto = ajustes.pct_referido_entrante_otro ?? 0.75;
    return [plata(baseValor), split === null ? null : plata(split * resto * baseValor)];
  }
  const parte = ajustes.pct_referido_saliente ?? 0.25;
  const facturacion = baseValor * parte;
  return [plata(facturacion), split === null ? null : plata(split * facturacion)];
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests-js/motor.test.mjs 2>&1 | tail -5`
Expected: `pass 15`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add lib/motor.js tests-js/motor.test.mjs
git commit -m "feat: motor de plata en JavaScript, gemelo del de Python"
```

---

## Task 2: `lib/motor.js` — revalidar los avisos al editar

Cuando el usuario carga la fecha que faltaba, el aviso tiene que desaparecer solo. Si no, la bandeja de pendientes nunca baja.

**Files:**
- Modify: `lib/motor.js`
- Modify: `tests-js/motor.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Agregar `revisar` al import de arriba (`import { base, splitVigente, calcular, pctPorDefecto, revisar, REGIMENES } from "../lib/motor.js";`) y estos tests al final:

```js
function negocio(x = {}) {
  return {
    id: "excel-5", tipo_negocio: "venta", estado: "cerrado",
    fecha_inicio: "2026-01-10", fecha_boleto: "2026-02-10", fecha_fin: "2026-03-15",
    direccion: "Calle 100", barrio: "Cerrito",
    precio_operacion: 100000, pct_comision_total: 0.03,
    regimen_comision: "captacion_mia", puntas: 1,
    base: 3000, facturacion: 3000, ganancia: 1350,
    ficha_completa: false, avisos: [], ...x,
  };
}

const tipos = (n) => n.avisos.map((a) => a.tipo);

test("revisar: un negocio completo no genera avisos", () => {
  assert.deepEqual(tipos(revisar(negocio(), AJUSTES, "2026-08-17")), []);
});

test("revisar: avisa si falta la fecha de inicio", () => {
  assert.ok(tipos(revisar(negocio({ fecha_inicio: null }), AJUSTES, "2026-08-17")).includes("falta_fecha_inicio"));
});

test("revisar: avisa si falta el boleto en una venta, pero no en un alquiler", () => {
  assert.ok(tipos(revisar(negocio({ fecha_boleto: null }), AJUSTES, "2026-08-17")).includes("falta_fecha_boleto"));
  const alq = revisar(negocio({ tipo_negocio: "alquiler", fecha_boleto: null }), AJUSTES, "2026-08-17");
  assert.ok(!tipos(alq).includes("falta_fecha_boleto"));
});

test("revisar: al completar el dato, el aviso desaparece", () => {
  const antes = revisar(negocio({ fecha_inicio: null }), AJUSTES, "2026-08-17");
  assert.ok(tipos(antes).includes("falta_fecha_inicio"));
  const despues = revisar({ ...antes, fecha_inicio: "2026-01-10" }, AJUSTES, "2026-08-17");
  assert.ok(!tipos(despues).includes("falta_fecha_inicio"));
});

test("revisar: una firma futura no puede estar cobrada", () => {
  const n = revisar(negocio({ fecha_fin: "2026-12-05" }), AJUSTES, "2026-08-17");
  assert.equal(n.estado, "en_curso");
  assert.equal(n.fecha_fin_estimada, true);
  assert.ok(tipos(n).includes("firma_futura"));
});

test("revisar: al corregir la firma futura vuelve a cerrado", () => {
  const futuro = revisar(negocio({ fecha_fin: "2026-12-05" }), AJUSTES, "2026-08-17");
  const corregido = revisar({ ...futuro, fecha_fin: "2026-07-01" }, AJUSTES, "2026-08-17");
  assert.equal(corregido.estado, "cerrado");
  assert.equal(corregido.fecha_fin_estimada, false);
});

test("revisar: avisa si las fechas estan dadas vuelta", () => {
  const n = revisar(negocio({ fecha_boleto: "2026-05-05", fecha_fin: "2026-04-20" }), AJUSTES, "2026-08-17");
  assert.ok(tipos(n).includes("fechas_al_reves"));
});

test("revisar: recalcula la plata con los datos nuevos", () => {
  const n = revisar(negocio({ precio_operacion: 200000 }), AJUSTES, "2026-08-17");
  assert.equal(n.base, 6000);
  assert.equal(n.facturacion, 6000);
  assert.equal(n.ganancia, 2700);
});

test("revisar: no recalcula los negocios anteriores a 2026", () => {
  const n = revisar(negocio({ fecha_fin: "2024-05-01", facturacion: 999, ganancia: 111 }), AJUSTES, "2026-08-17");
  assert.equal(n.facturacion, 999);
  assert.equal(n.ganancia, 111);
});

test("revisar: una ficha dada por completa no genera avisos de faltantes", () => {
  const n = revisar(negocio({ fecha_inicio: null, ficha_completa: true }), AJUSTES, "2026-08-17");
  assert.deepEqual(tipos(n), []);
});

test("revisar: conserva los avisos que solo el importador puede saber", () => {
  // 'separador_decimal' salio de comparar contra la celda del Excel; la app no puede
  // recalcularlo, asi que no se pierde al editar.
  const conAviso = negocio({ avisos: [{ tipo: "separador_decimal", detalle: "x" }] });
  assert.ok(tipos(revisar(conAviso, AJUSTES, "2026-08-17")).includes("separador_decimal"));
});

test("revisar: no modifica el negocio original", () => {
  const original = negocio({ fecha_inicio: null });
  revisar(original, AJUSTES, "2026-08-17");
  assert.deepEqual(original.avisos, []);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests-js/motor.test.mjs 2>&1 | tail -5`
Expected: FAIL — `revisar is not a function`

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `lib/motor.js`:

```js
export const CORTE = "2026-01-01";

/* Avisos que salen de comparar contra el Excel original. La app no tiene con que
   recalcularlos, asi que se conservan tal cual cuando el usuario edita. */
const AVISOS_DEL_IMPORTADOR = new Set([
  "separador_decimal",
  "aritmetica_no_cierra",
  "comision_absurda",
  "recalculo_distinto",
  "firma_inventada",
  "posible_cruce",
  "origen_sin_clasificar",
]);

const aviso = (tipo, detalle) => ({ tipo, detalle });

/* Recalcula la plata y regenera los avisos de un negocio. Devuelve una copia nueva.

   Es lo que hace que la bandeja de pendientes baje sola: cuando el usuario carga la fecha
   que faltaba, el aviso correspondiente ya no se vuelve a generar. */
export function revisar(negocio, ajustes, hoy) {
  const n = { ...negocio, avisos: [] };

  n.base = base(n.precio_operacion, n.pct_comision_total);

  if (n.fecha_fin && n.fecha_fin >= CORTE) {
    const [categoria] = splitVigente(n.fecha_fin, ajustes);
    const [facturacion, ganancia] = calcular(n.regimen_comision, n.base, n.fecha_fin, ajustes);
    n.categoria_vigente = categoria;
    n.recalculado = true;
    n.facturacion = facturacion;
    n.ganancia = ganancia;
  }

  // Una firma con fecha futura no ocurrio: por definicion no esta cobrada.
  if (n.fecha_fin && n.fecha_fin > hoy) {
    n.estado = "en_curso";
    n.fecha_fin_estimada = true;
    n.avisos.push(aviso("firma_futura",
      `La firma dice ${n.fecha_fin}, que todavía no llegó, así que no está cobrado.`));
  } else if (n.fecha_fin_estimada && !negocio.entity_id_cartera) {
    // Se corrigio la fecha y no hay una propiedad viva que lo contradiga.
    n.estado = "cerrado";
    n.fecha_fin_estimada = false;
  }

  if (n.fecha_inicio && n.fecha_boleto && n.fecha_boleto < n.fecha_inicio) {
    n.avisos.push(aviso("fechas_al_reves",
      `El boleto (${n.fecha_boleto}) es anterior al inicio (${n.fecha_inicio})`));
  }
  if (n.fecha_boleto && n.fecha_fin && n.fecha_fin < n.fecha_boleto) {
    n.avisos.push(aviso("fechas_al_reves",
      `La firma (${n.fecha_fin}) es anterior al boleto (${n.fecha_boleto})`));
  }

  if (!n.ficha_completa) {
    if (!n.fecha_fin) n.avisos.push(aviso("sin_fecha_fin", "Sin fecha de firma no se sabe a qué año pertenece"));
    if (!n.fecha_inicio) n.avisos.push(aviso("falta_fecha_inicio", "Sin fecha de inicio no se puede medir el plazo"));
    if (n.tipo_negocio === "venta" && !n.fecha_boleto) n.avisos.push(aviso("falta_fecha_boleto", "Falta la fecha del boleto"));
    if (!n.direccion) n.avisos.push(aviso("falta_direccion", "Falta la dirección"));
    if (!n.barrio) n.avisos.push(aviso("falta_barrio", "Falta el barrio"));
  }

  // Los avisos que vinieron del Excel se conservan: la app no puede recalcularlos.
  for (const viejo of negocio.avisos || []) {
    if (AVISOS_DEL_IMPORTADOR.has(viejo.tipo)) n.avisos.push(viejo);
  }

  return n;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests-js/motor.test.mjs 2>&1 | tail -5`
Expected: `pass 27`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add lib/motor.js tests-js/motor.test.mjs
git commit -m "feat: al editar un negocio se recalcula la plata y se regeneran los avisos"
```

---

## Task 3: `lib/salud.js` usa el motor en vez de repetir la cuenta

**Files:**
- Modify: `lib/salud.js`

- [ ] **Step 1: Reemplazar la cuenta repetida**

En `lib/salud.js`, agregar el import arriba de todo:

```js
import { calcular } from "./motor.js";
```

Y reemplazar la función interna `gananciaCon` dentro de `comparativaCategorias` por esta,
que usa el motor en vez de repetir las cinco reglas:

```js
  // Se arma un juego de ajustes con la tajada que se quiere probar, y se deja que el
  // mismo motor de siempre haga la cuenta. Antes esto repetia las cinco reglas a mano.
  const gananciaCon = (split) => {
    const comoSi = {
      ...ajustes,
      categorias: [{ categoria: "prueba", split_pct: split, desde: "1900-01-01", hasta: null }],
    };
    return cerrados.reduce((total, n) => {
      const [, ganancia] = calcular(n.regimen_comision, n.base || 0, n.fecha_fin, comoSi);
      return total + (ganancia || 0);
    }, 0);
  };
```

- [ ] **Step 2: Correr los tests de salud, que no tienen que cambiar**

Run: `node --test tests-js/salud.test.mjs 2>&1 | tail -5`
Expected: `pass 28`, `fail 0`

> Los tests de `comparativaCategorias` ya existían y siguen igual. Que pasen después del
> cambio es la prueba de que la refactorización no movió ningún número.

- [ ] **Step 3: Verificar que el tablero sigue dando lo mismo**

```bash
cd "c:/Users/es_bi/OneDrive/Desktop/claude/Como venimos"
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const leer = (n) => JSON.parse(readFileSync('datos/' + n + '.json', 'utf8'));
const { capas, comparativaCategorias } = await import('./lib/salud.js');
const negocios = leer('negocios'), cartera = leer('cartera'), ajustes = leer('ajustes');
const c = capas(negocios, cartera, ajustes, '2026');
console.log('capa 1:', Math.round(c.capa1.facturacion), '| capa 2:', Math.round(c.capa2.facturacion), '| capa 3:', Math.round(c.capa3.facturacion));
for (const f of comparativaCategorias(negocios, ajustes, '2026', '2026-08-17'))
  console.log(f.categoria.padEnd(5), 'neto', Math.round(f.neto), 'dif', f.diferencia);
"
```
Expected: `capa 1: 20079 | capa 2: 15924 | capa 3: 21554` — los mismos números de siempre.

- [ ] **Step 4: Commit**

```bash
git add lib/salud.js
git commit -m "refactor: la comparativa de categorias usa el motor en vez de repetir la cuenta"
```

---

## Task 4: `lib/github.js` — las piezas puras

**Files:**
- Create: `lib/github.js`
- Test: `tests-js/github.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests-js/github.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { aBase64, deBase64, urlContenido, REPO } from "../lib/github.js";

test("base64 de ida y vuelta con acentos", () => {
  const texto = '{"barrio":"Maroñas","nota":"él dijo «sí»"}';
  assert.equal(deBase64(aBase64(texto)), texto);
});

test("base64 aguanta emojis", () => {
  const texto = "cerrado ✅ 🏠";
  assert.equal(deBase64(aBase64(texto)), texto);
});

test("base64 de texto vacio", () => {
  assert.equal(deBase64(aBase64("")), "");
});

test("el base64 no lleva saltos de linea", () => {
  const largo = JSON.stringify({ x: "a".repeat(500) });
  assert.ok(!aBase64(largo).includes("\n"));
});

test("la url apunta al repo correcto", () => {
  assert.equal(urlContenido("datos/negocios.json"),
    `https://api.github.com/repos/${REPO}/contents/datos/negocios.json`);
});

test("el repo es el del usuario", () => {
  assert.equal(REPO, "juanandresotero/como-venimos");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests-js/github.test.mjs 2>&1 | tail -5`
Expected: FAIL — `Cannot find module .../lib/github.js`

- [ ] **Step 3: Escribir la implementación**

Crear `lib/github.js`:

```js
/* Hablar con la API de GitHub para guardar los cambios del usuario en el repo.

   Por que hace falta un token: una pagina estatica no puede escribir en un repositorio
   por si sola. El usuario genera un token una sola vez, limitado a ESTE repo, y queda
   guardado en su telefono. Se puede anular desde GitHub en un clic. (§3.4) */

export const REPO = "juanandresotero/como-venimos";
export const RAMA = "main";

const CLAVE_TOKEN = "como-venimos:token";

/* btoa() solo entiende bytes, y nuestros datos tienen acentos y hasta emojis.
   Hay que pasar por UTF-8 a mano o "Maroñas" se rompe. */
export function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

export function deBase64(base64) {
  const binario = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function urlContenido(ruta) {
  return `https://api.github.com/repos/${REPO}/contents/${ruta}`;
}

export function guardarToken(token) {
  localStorage.setItem(CLAVE_TOKEN, token.trim());
}

export function leerToken() {
  return localStorage.getItem(CLAVE_TOKEN) || "";
}

export function borrarToken() {
  localStorage.removeItem(CLAVE_TOKEN);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests-js/github.test.mjs 2>&1 | tail -5`
Expected: `pass 6`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add lib/github.js tests-js/github.test.mjs
git commit -m "feat: piezas base para hablar con la API de GitHub"
```

---

## Task 5: `lib/github.js` — leer y escribir archivos

**Files:**
- Modify: `lib/github.js`
- Modify: `tests-js/github.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Ampliar el import de arriba a
`import { aBase64, deBase64, urlContenido, leerArchivo, escribirArchivo, probarToken, REPO } from "../lib/github.js";`
y agregar al final:

```js
/* Un fetch de mentira: se le dice que responder y despues se revisa como lo llamaron. */
function fingirFetch(respuestas) {
  const llamadas = [];
  globalThis.fetch = async (url, opciones = {}) => {
    llamadas.push({ url, opciones });
    const r = respuestas.shift();
    if (!r) throw new Error("no quedan respuestas preparadas");
    return {
      ok: r.estado >= 200 && r.estado < 300,
      status: r.estado,
      json: async () => r.cuerpo,
    };
  };
  return llamadas;
}

test("leerArchivo devuelve el contenido y el sha", async () => {
  fingirFetch([{ estado: 200, cuerpo: { content: aBase64('{"a":1}'), sha: "abc123" } }]);
  const r = await leerArchivo("datos/negocios.json", "tok");
  assert.deepEqual(r.datos, { a: 1 });
  assert.equal(r.sha, "abc123");
});

test("leerArchivo manda el token", async () => {
  const llamadas = fingirFetch([{ estado: 200, cuerpo: { content: aBase64("{}"), sha: "s" } }]);
  await leerArchivo("datos/x.json", "mi-token");
  assert.equal(llamadas[0].opciones.headers.Authorization, "Bearer mi-token");
});

test("leerArchivo devuelve sha null si el archivo no existe", async () => {
  fingirFetch([{ estado: 404, cuerpo: { message: "Not Found" } }]);
  const r = await leerArchivo("datos/nuevo.json", "tok");
  assert.equal(r.sha, null);
  assert.equal(r.datos, null);
});

test("escribirArchivo manda PUT con el contenido y el sha", async () => {
  const llamadas = fingirFetch([{ estado: 200, cuerpo: { content: { sha: "nuevo" } } }]);
  const r = await escribirArchivo("datos/negocios.json", { a: 1 }, "viejo", "mensaje", "tok");
  const cuerpo = JSON.parse(llamadas[0].opciones.body);
  assert.equal(llamadas[0].opciones.method, "PUT");
  assert.equal(cuerpo.sha, "viejo");
  assert.equal(cuerpo.message, "mensaje");
  assert.deepEqual(JSON.parse(deBase64(cuerpo.content)), { a: 1 });
  assert.equal(r.sha, "nuevo");
});

test("escribirArchivo omite el sha si el archivo es nuevo", async () => {
  const llamadas = fingirFetch([{ estado: 201, cuerpo: { content: { sha: "s" } } }]);
  await escribirArchivo("datos/nuevo.json", {}, null, "crear", "tok");
  assert.ok(!("sha" in JSON.parse(llamadas[0].opciones.body)));
});

test("escribirArchivo avisa claro cuando hay conflicto", async () => {
  fingirFetch([{ estado: 409, cuerpo: { message: "conflict" } }]);
  await assert.rejects(
    () => escribirArchivo("datos/x.json", {}, "viejo", "m", "tok"),
    /conflicto/i
  );
});

test("escribirArchivo avisa claro cuando el token no sirve", async () => {
  fingirFetch([{ estado: 401, cuerpo: { message: "Bad credentials" } }]);
  await assert.rejects(() => escribirArchivo("datos/x.json", {}, null, "m", "tok"), /token/i);
});

test("probarToken dice que si cuando puede escribir", async () => {
  fingirFetch([{ estado: 200, cuerpo: { full_name: REPO, permissions: { push: true } } }]);
  const r = await probarToken("tok");
  assert.equal(r.ok, true);
});

test("probarToken dice que no si el token solo lee", async () => {
  fingirFetch([{ estado: 200, cuerpo: { full_name: REPO, permissions: { push: false } } }]);
  const r = await probarToken("tok");
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /escribir/i);
});

test("probarToken explica si el token esta mal", async () => {
  fingirFetch([{ estado: 401, cuerpo: { message: "Bad credentials" } }]);
  const r = await probarToken("malo");
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /token/i);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests-js/github.test.mjs 2>&1 | tail -5`
Expected: FAIL — `leerArchivo is not a function`

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `lib/github.js`:

```js
const cabeceras = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

function explicar(estado, cuerpo) {
  if (estado === 401 || estado === 403) {
    return "El token no sirve o no tiene permiso. Revisalo en Ajustes.";
  }
  if (estado === 409 || estado === 422) {
    return "Hubo un conflicto: el archivo cambió en GitHub mientras editabas.";
  }
  return `GitHub respondió ${estado}: ${(cuerpo && cuerpo.message) || "error desconocido"}`;
}

export async function leerArchivo(ruta, token) {
  const respuesta = await fetch(`${urlContenido(ruta)}?ref=${RAMA}`, {
    headers: cabeceras(token),
    cache: "no-cache",
  });
  if (respuesta.status === 404) return { datos: null, sha: null };
  const cuerpo = await respuesta.json();
  if (!respuesta.ok) throw new Error(explicar(respuesta.status, cuerpo));
  return { datos: JSON.parse(deBase64(cuerpo.content)), sha: cuerpo.sha };
}

export async function escribirArchivo(ruta, datos, sha, mensaje, token) {
  const cuerpoPedido = {
    message: mensaje,
    content: aBase64(JSON.stringify(datos, null, 1) + "\n"),
    branch: RAMA,
  };
  // Sin sha, GitHub entiende "crear archivo nuevo". Con sha, "actualizar este".
  if (sha) cuerpoPedido.sha = sha;

  const respuesta = await fetch(urlContenido(ruta), {
    method: "PUT",
    headers: { ...cabeceras(token), "Content-Type": "application/json" },
    body: JSON.stringify(cuerpoPedido),
  });
  const cuerpo = await respuesta.json();
  if (!respuesta.ok) throw new Error(explicar(respuesta.status, cuerpo));
  return { sha: cuerpo.content.sha };
}

export async function probarToken(token) {
  try {
    const respuesta = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: cabeceras(token),
    });
    const cuerpo = await respuesta.json();
    if (!respuesta.ok) return { ok: false, mensaje: explicar(respuesta.status, cuerpo) };
    if (!cuerpo.permissions || !cuerpo.permissions.push) {
      return { ok: false, mensaje: "El token entra al repo pero no puede escribir. Al crearlo hay que darle permiso de Contents: Read and write." };
    }
    return { ok: true, mensaje: `Listo, conectado a ${cuerpo.full_name}` };
  } catch (error) {
    return { ok: false, mensaje: `No se pudo conectar: ${error.message}` };
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests-js/github.test.mjs 2>&1 | tail -5`
Expected: `pass 16`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add lib/github.js tests-js/github.test.mjs
git commit -m "feat: leer y escribir archivos del repo desde la app"
```

---

## Task 6: `lib/guardado.js` — editar al instante, subir después

**Files:**
- Create: `lib/guardado.js`
- Test: `tests-js/guardado.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests-js/guardado.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { editarNegocio, marcarAtendido, hayCambios, resumenCambios } from "../lib/guardado.js";

const AJUSTES = {
  categorias: [{ categoria: "RAP", split_pct: 0.45, fee_mensual_usd: 70, desde: "2026-01-01", hasta: null }],
  defaults_comision: { venta: { 1: 0.03, 2: 0.06 }, alquiler: { 1: 1.0, 2: 2.0 } },
  regla_martin: { facturacion: 0.5, ganancia: 0.35 },
  pct_suplencia: 0.125, pct_referido_saliente: 0.25, pct_referido_entrante_otro: 0.75,
};

function estado() {
  return {
    datos: {
      negocios: [
        { id: "excel-5", tipo_negocio: "venta", estado: "cerrado", fecha_inicio: null,
          fecha_boleto: "2026-02-10", fecha_fin: "2026-03-15", direccion: "Calle 100",
          barrio: "Cerrito", precio_operacion: 100000, pct_comision_total: 0.03,
          regimen_comision: "captacion_mia", puntas: 1, base: 3000, facturacion: 3000,
          ganancia: 1350, ficha_completa: false,
          avisos: [{ tipo: "falta_fecha_inicio", detalle: "x" }] },
      ],
      mis_datos: { eventos_atendidos: [] },
      ajustes: AJUSTES,
    },
    hoy: "2026-08-17",
    sucios: new Set(),
  };
}

test("editar cambia el dato y recalcula la plata", () => {
  const e = estado();
  editarNegocio(e, "excel-5", { precio_operacion: 200000 });
  const n = e.datos.negocios[0];
  assert.equal(n.precio_operacion, 200000);
  assert.equal(n.facturacion, 6000);
  assert.equal(n.ganancia, 2700);
});

test("editar hace desaparecer el aviso que se corrigio", () => {
  const e = estado();
  assert.equal(e.datos.negocios[0].avisos.length, 1);
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  assert.equal(e.datos.negocios[0].avisos.length, 0);
});

test("editar marca el archivo como sucio", () => {
  const e = estado();
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  assert.ok(e.sucios.has("datos/negocios.json"));
  assert.equal(hayCambios(e), true);
});

test("sin editar nada no hay cambios", () => {
  assert.equal(hayCambios(estado()), false);
});

test("editar un negocio que no existe no revienta ni ensucia", () => {
  const e = estado();
  editarNegocio(e, "no-existe", { fecha_inicio: "2026-01-10" });
  assert.equal(hayCambios(e), false);
});

test("dar la ficha por completa silencia los faltantes", () => {
  const e = estado();
  editarNegocio(e, "excel-5", { ficha_completa: true });
  assert.deepEqual(e.datos.negocios[0].avisos, []);
});

test("marcar un evento como atendido lo guarda en mis_datos", () => {
  const e = estado();
  marcarAtendido(e, "2026-08-17|abc|baja");
  assert.deepEqual(e.datos.mis_datos.eventos_atendidos, ["2026-08-17|abc|baja"]);
  assert.ok(e.sucios.has("datos/mis_datos.json"));
});

test("marcar dos veces el mismo evento no lo duplica", () => {
  const e = estado();
  marcarAtendido(e, "ev-1");
  marcarAtendido(e, "ev-1");
  assert.equal(e.datos.mis_datos.eventos_atendidos.length, 1);
});

test("el resumen dice en castellano que hay para subir", () => {
  const e = estado();
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  assert.match(resumenCambios(e), /negocios/i);
});

test("el resumen vacio no miente", () => {
  assert.equal(resumenCambios(estado()), "");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests-js/guardado.test.mjs 2>&1 | tail -5`
Expected: FAIL — `Cannot find module .../lib/guardado.js`

- [ ] **Step 3: Escribir la implementación**

Crear `lib/guardado.js`:

```js
/* Aplica los cambios del usuario en memoria al instante y lleva la cuenta de que archivos
   quedaron sucios, para subirlos despues.

   La edicion se ve al toque aunque no haya señal: primero se aplica local, despues se
   sincroniza. Asi la app nunca se queda esperando a la red. */

import { revisar } from "./motor.js";

export const ARCHIVO_NEGOCIOS = "datos/negocios.json";
export const ARCHIVO_MIS_DATOS = "datos/mis_datos.json";

const NOMBRES = {
  [ARCHIVO_NEGOCIOS]: "negocios",
  [ARCHIVO_MIS_DATOS]: "tus anotaciones",
};

export function editarNegocio(estado, id, cambios) {
  const indice = estado.datos.negocios.findIndex((n) => n.id === id);
  if (indice === -1) return null;

  const actualizado = revisar(
    { ...estado.datos.negocios[indice], ...cambios },
    estado.datos.ajustes,
    estado.hoy
  );
  estado.datos.negocios[indice] = actualizado;
  estado.sucios.add(ARCHIVO_NEGOCIOS);
  return actualizado;
}

export function marcarAtendido(estado, eventoId) {
  const mis = estado.datos.mis_datos || (estado.datos.mis_datos = {});
  const lista = mis.eventos_atendidos || (mis.eventos_atendidos = []);
  if (lista.includes(eventoId)) return;
  lista.push(eventoId);
  estado.sucios.add(ARCHIVO_MIS_DATOS);
}

export function hayCambios(estado) {
  return estado.sucios.size > 0;
}

export function resumenCambios(estado) {
  if (!estado.sucios.size) return "";
  const nombres = [...estado.sucios].map((a) => NOMBRES[a] || a);
  return `Cambios sin subir en ${nombres.join(" y ")}`;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests-js/guardado.test.mjs 2>&1 | tail -5`
Expected: `pass 10`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add lib/guardado.js tests-js/guardado.test.mjs
git commit -m "feat: editar en memoria y llevar la cola de cambios"
```

---

## Task 7: `lib/guardado.js` — sincronizar con GitHub

**Files:**
- Modify: `lib/guardado.js`
- Modify: `tests-js/guardado.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Ampliar el import a
`import { editarNegocio, marcarAtendido, hayCambios, resumenCambios, sincronizar, ARCHIVO_NEGOCIOS } from "../lib/guardado.js";`
y agregar al final:

```js
/* Un GitHub de mentira: registra que se le pidio y devuelve lo que se le indique. */
function fingirGitHub({ falla = null, conflictoLaPrimera = false } = {}) {
  const escrituras = [];
  let yaFallo = false;
  return {
    escrituras,
    api: {
      async leerArchivo(ruta) {
        return { datos: { desdeGitHub: true }, sha: "sha-fresco" };
      },
      async escribirArchivo(ruta, datos, sha, mensaje) {
        if (falla) throw new Error(falla);
        if (conflictoLaPrimera && !yaFallo) {
          yaFallo = true;
          throw new Error("Hubo un conflicto: el archivo cambió en GitHub");
        }
        escrituras.push({ ruta, datos, sha, mensaje });
        return { sha: "sha-nuevo" };
      },
    },
  };
}

test("sincronizar sube los archivos sucios y limpia la cola", async () => {
  const e = estado();
  e.shas = { [ARCHIVO_NEGOCIOS]: "sha-viejo" };
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  const g = fingirGitHub();

  const r = await sincronizar(e, g.api, "tok");
  assert.equal(r.ok, true);
  assert.equal(g.escrituras.length, 1);
  assert.equal(g.escrituras[0].ruta, ARCHIVO_NEGOCIOS);
  assert.equal(hayCambios(e), false);
});

test("sincronizar guarda el sha nuevo para la proxima", async () => {
  const e = estado();
  e.shas = { [ARCHIVO_NEGOCIOS]: "sha-viejo" };
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  await sincronizar(e, fingirGitHub().api, "tok");
  assert.equal(e.shas[ARCHIVO_NEGOCIOS], "sha-nuevo");
});

test("sin cambios, sincronizar no llama a GitHub", async () => {
  const g = fingirGitHub();
  const r = await sincronizar(estado(), g.api, "tok");
  assert.equal(r.ok, true);
  assert.equal(g.escrituras.length, 0);
});

test("sin token avisa y no borra los cambios", async () => {
  const e = estado();
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  const r = await sincronizar(e, fingirGitHub().api, "");
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /token/i);
  assert.equal(hayCambios(e), true);
});

test("si falla la subida, los cambios NO se pierden", async () => {
  const e = estado();
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  const r = await sincronizar(e, fingirGitHub({ falla: "sin internet" }).api, "tok");
  assert.equal(r.ok, false);
  assert.equal(hayCambios(e), true, "la cola tiene que quedar intacta para reintentar");
});

test("ante un conflicto, relee el sha y reintenta solo", async () => {
  const e = estado();
  e.shas = { [ARCHIVO_NEGOCIOS]: "sha-viejo" };
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  const g = fingirGitHub({ conflictoLaPrimera: true });

  const r = await sincronizar(e, g.api, "tok");
  assert.equal(r.ok, true, "el reintento tiene que salir bien");
  assert.equal(g.escrituras[0].sha, "sha-fresco", "tiene que usar el sha releido");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests-js/guardado.test.mjs 2>&1 | tail -5`
Expected: FAIL — `sincronizar is not a function`

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `lib/guardado.js`:

```js
const CONTENIDO = {
  [ARCHIVO_NEGOCIOS]: (estado) => estado.datos.negocios,
  [ARCHIVO_MIS_DATOS]: (estado) => estado.datos.mis_datos,
};

const esConflicto = (error) => /conflicto/i.test(error.message);

/* Sube lo que este sucio. Si algo falla, la cola queda intacta para reintentar: es
   preferible reintentar mil veces a perder un dato que el usuario ya cargo. */
export async function sincronizar(estado, api, token) {
  if (!estado.sucios.size) return { ok: true, mensaje: "" };
  if (!token) {
    return { ok: false, mensaje: "Falta el token de GitHub. Cargalo en Ajustes." };
  }

  estado.shas = estado.shas || {};
  const fecha = new Date().toISOString().slice(0, 10);

  for (const ruta of [...estado.sucios]) {
    const datos = CONTENIDO[ruta](estado);
    const mensaje = `datos: cambios desde la app (${fecha})`;
    try {
      let resultado;
      try {
        resultado = await api.escribirArchivo(ruta, datos, estado.shas[ruta] || null, mensaje, token);
      } catch (error) {
        if (!esConflicto(error)) throw error;
        // El robot escribio mientras editabamos. Se relee el sha y se reintenta una vez.
        const fresco = await api.leerArchivo(ruta, token);
        estado.shas[ruta] = fresco.sha;
        resultado = await api.escribirArchivo(ruta, datos, fresco.sha, mensaje, token);
      }
      estado.shas[ruta] = resultado.sha;
      estado.sucios.delete(ruta);
    } catch (error) {
      return { ok: false, mensaje: error.message };
    }
  }
  return { ok: true, mensaje: "Guardado" };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests-js/guardado.test.mjs 2>&1 | tail -5`
Expected: `pass 16`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add lib/guardado.js tests-js/guardado.test.mjs
git commit -m "feat: sincronizar con GitHub, con reintento ante conflicto"
```

---

## Task 8: La pantalla de Ajustes con la guía del token

**Files:**
- Create: `vistas/ajustes.js`
- Modify: `app.css`

- [ ] **Step 1: Escribir la vista**

Crear `vistas/ajustes.js`:

```js
/* Ajustes: la pantalla guiada para crear el token de GitHub.

   El usuario no es tecnico. Aca no alcanza con un campo que diga "token": hay que
   explicarle que es, para que sirve, y darle el link directo con todo preseleccionado. */

import { guardarToken, leerToken, borrarToken, probarToken, REPO } from "../lib/github.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

const LINK_TOKEN =
  "https://github.com/settings/personal-access-tokens/new" +
  "?description=Como%20venimos" +
  "&target_name=juanandresotero";

export function dibujarAjustes(estado) {
  const trozo = document.createDocumentFragment();
  const yaTiene = Boolean(leerToken());

  trozo.append(nodo(html`
    <section style="margin-bottom:16px">
      <p class="etiqueta">Ajustes</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">Permiso para guardar</h1>
    </section>

    <section class="tarjeta">
      <p class="apunte" style="margin-bottom:14px">
        La app necesita una <strong>llave</strong> para poder guardar tus cambios. Se crea
        una sola vez, sirve solo para este proyecto, y la podés anular cuando quieras.
      </p>
      <ol class="pasos">
        <li>Tocá el botón de abajo. Se abre GitHub con casi todo completo.</li>
        <li>En <strong>Expiration</strong> elegí <strong>No expiration</strong>, así no
            tenés que rehacerla nunca.</li>
        <li>En <strong>Repository access</strong> elegí <strong>Only select
            repositories</strong> y marcá <strong>como-venimos</strong>.</li>
        <li>En <strong>Permissions → Repository permissions</strong>, buscá
            <strong>Contents</strong> y ponelo en <strong>Read and write</strong>.</li>
        <li>Abajo de todo, <strong>Generate token</strong>. Copiá el texto que aparece
            (empieza con <code>github_pat_</code>) y pegalo acá.</li>
      </ol>
      <a class="boton boton-primario" href="${LINK_TOKEN}" target="_blank" rel="noopener">
        Abrir GitHub para crear la llave
      </a>
    </section>

    <section class="tarjeta">
      <label class="etiqueta" for="campo-token">Pegá la llave acá</label>
      <input id="campo-token" class="campo" type="password" autocomplete="off"
             spellcheck="false" placeholder="${yaTiene ? "•••••• (ya hay una guardada)" : "github_pat_..."}">
      <div class="botonera">
        <button class="boton boton-primario" id="probar">Probar y guardar</button>
        ${yaTiene ? html`<button class="boton boton-borrar" id="borrar">Borrar la llave</button>` : ""}
      </div>
      <p id="resultado" class="apunte" style="margin-top:12px"></p>
    </section>

    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:8px">Qué puede hacer esta llave</h2>
      <p class="apunte">
        Solo leer y escribir archivos del repositorio <code>${REPO}</code>. No puede tocar
        nada más de tu cuenta. Queda guardada en este teléfono; si lo perdés, entrá a
        GitHub → Settings → Developer settings → Personal access tokens y borrala.
      </p>
    </section>
  `));

  const campo = trozo.getElementById("campo-token");
  const resultado = trozo.getElementById("resultado");

  trozo.getElementById("probar").addEventListener("click", async () => {
    const token = campo.value.trim() || leerToken();
    if (!token) {
      resultado.textContent = "Pegá la llave primero.";
      return;
    }
    resultado.textContent = "Probando…";
    const r = await probarToken(token);
    resultado.textContent = r.mensaje;
    resultado.style.color = r.ok ? "var(--azul)" : "var(--rojo-tinta)";
    if (r.ok) {
      guardarToken(token);
      campo.value = "";
      estado.token = token;
    }
  });

  const botonBorrar = trozo.getElementById("borrar");
  if (botonBorrar) {
    botonBorrar.addEventListener("click", () => {
      borrarToken();
      estado.token = "";
      resultado.textContent = "Llave borrada de este teléfono.";
    });
  }

  return trozo;
}
```

- [ ] **Step 2: Agregar los estilos de formulario**

Agregar al final de `app.css`:

```css
/* ---------- Formularios ---------- */

.pasos { margin: 0 0 16px; padding-left: 20px; font-size: 14px; line-height: 1.65; }
.pasos li { margin-bottom: 7px; }
.pasos code, .apunte code {
  background: var(--lienzo-2); border: 1px solid var(--linea);
  border-radius: 5px; padding: 1px 5px; font-size: 12.5px;
}

.campo {
  width: 100%;
  margin-top: 8px;
  padding: 13px 14px;
  font: inherit;
  color: var(--tinta);
  background: var(--lienzo-2);
  border: 1px solid var(--linea);
  border-radius: 12px;
}
.campo:focus { outline: 2px solid var(--azul); outline-offset: -1px; background: var(--lienzo); }
.campo[readonly] { color: var(--tinta-2); }

.botonera { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }

.boton {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 13px 18px;
  font: inherit; font-weight: 700;
  border: 1px solid var(--linea); border-radius: 12px;
  background: var(--lienzo); color: var(--tinta);
  text-decoration: none; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.boton-primario { background: var(--azul); border-color: var(--azul); color: #fff; }
.boton-borrar { color: var(--rojo-tinta); border-color: var(--rojo); }
.boton:active { transform: translateY(1px); }

.campo-fila { display: grid; gap: 4px; padding: 12px 14px; background: var(--lienzo); }
.campo-fila > label { font-size: 12.5px; color: var(--tinta-2); }
.campo-fila .campo { margin-top: 2px; }
.campo-fila.falta { background: var(--rojo-suave); }
.campo-fila.falta > label { color: var(--rojo-tinta); font-weight: 700; }
```

- [ ] **Step 3: Commit**

```bash
git add vistas/ajustes.js app.css
git commit -m "feat: pantalla guiada para crear el token de GitHub"
```

---

## Task 9: Enchufar el guardado en el armazón

**Files:**
- Modify: `app.js`
- Modify: `index.html`
- Modify: `app.css`

- [ ] **Step 1: Agregar el botón de Ajustes y el indicador**

En `index.html`, reemplazar la línea del `<header>` por:

```html
<header class="barra-estado" id="barra-estado" hidden></header>
<div class="barra-guardado" id="barra-guardado" hidden>
  <span id="texto-guardado"></span>
  <button class="boton-mini" id="boton-guardar">Guardar</button>
</div>
```

- [ ] **Step 2: Agregar los estilos**

Agregar al final de `app.css`:

```css
.barra-guardado {
  position: sticky; top: 0; z-index: 9;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 9px 16px;
  background: var(--azul-suave);
  border-bottom: 1px solid var(--azul-claro);
  font-size: 12.5px; font-weight: 600;
}
.barra-guardado.error { background: var(--rojo-suave); border-color: var(--rojo); color: var(--rojo-tinta); }
.boton-mini {
  padding: 6px 13px; font: inherit; font-weight: 700; font-size: 12px;
  background: var(--azul); color: #fff; border: none; border-radius: 8px; cursor: pointer;
}
.barra-guardado.error .boton-mini { background: var(--rojo); }
```

- [ ] **Step 3: Enchufar todo en `app.js`**

Reemplazar el contenido de `app.js` por:

```js
/* Arranque: baja los datos, arma la navegacion y dibuja la vista activa. */

import { derivar } from "./lib/pendientes.js";
import { leerToken } from "./lib/github.js";
import * as github from "./lib/github.js";
import { hayCambios, resumenCambios, sincronizar } from "./lib/guardado.js";
import { dibujarSalud } from "./vistas/salud.js";
import { dibujarHoy } from "./vistas/hoy.js";
import { dibujarNegocios } from "./vistas/negocios.js";
import { dibujarFicha } from "./vistas/ficha.js";
import { dibujarAjustes } from "./vistas/ajustes.js";

const ARCHIVOS = ["cartera", "negocios", "ajustes", "eventos", "estado_robot", "mis_datos"];
const VACIO_OBJETO = new Set(["cartera", "ajustes", "estado_robot", "mis_datos"]);

const estado = {
  datos: {},
  hoy: new Date().toISOString().slice(0, 10),
  vista: "hoy",
  foco: null,          // id del negocio abierto, cuando la vista es "ficha"
  token: leerToken(),
  sucios: new Set(),
  shas: {},
  redibujar: () => dibujar(),
  // La navegacion viaja en el estado y NO se importa desde las vistas: si cada vista
  // importara app.js habria un ciclo (app.js -> vistas -> app.js).
  irA: (vista, foco) => irA(vista, foco),
};

async function bajarDatos() {
  const pares = await Promise.all(
    ARCHIVOS.map(async (nombre) => {
      try {
        const respuesta = await fetch(`datos/${nombre}.json`, { cache: "no-cache" });
        if (!respuesta.ok) throw new Error(respuesta.status);
        return [nombre, await respuesta.json()];
      } catch {
        // Si falta un archivo la app tiene que abrir igual, no quedarse en blanco.
        return [nombre, VACIO_OBJETO.has(nombre) ? {} : []];
      }
    })
  );
  return Object.fromEntries(pares);
}

function dibujarBarraEstado() {
  const barra = document.getElementById("barra-estado");
  const robot = estado.datos.estado_robot;
  if (!robot || !robot.ultima_corrida) {
    barra.hidden = true;
    return;
  }
  const dias = Math.round(
    (Date.parse(`${estado.hoy}T00:00:00Z`) - Date.parse(`${robot.ultima_corrida}T00:00:00Z`)) / 86400000
  );
  barra.hidden = false;
  if (!robot.ok || dias > 2) {
    barra.className = "barra-estado alerta";
    barra.textContent = robot.ok
      ? `⚠ El robot no corre hace ${dias} días — los datos de tu cartera están viejos`
      : `⚠ La última corrida del robot falló: ${robot.error || "error desconocido"}`;
    return;
  }
  barra.className = "barra-estado";
  const cuando = dias === 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`;
  barra.textContent = `Cartera actualizada ${cuando} · ${robot.propiedades} propiedades`;
}

function dibujarBarraGuardado(mensaje, esError) {
  const barra = document.getElementById("barra-guardado");
  const texto = document.getElementById("texto-guardado");
  if (!hayCambios(estado) && !mensaje) {
    barra.hidden = true;
    return;
  }
  barra.hidden = false;
  barra.className = `barra-guardado${esError ? " error" : ""}`;
  texto.textContent = mensaje || resumenCambios(estado);
}

function dibujarGlobo() {
  const globo = document.getElementById("globo-pendientes");
  const grupos = derivar(estado.datos.negocios, eventosSinAtender(), estado.hoy);
  const total = grupos.reduce((t, g) => t + g.items.length, 0);
  globo.hidden = total === 0;
  globo.textContent = total > 99 ? "99+" : String(total);
}

/* Los eventos que el usuario ya despacho se filtran aca, con lo anotado en mis_datos. */
export function eventosSinAtender() {
  const atendidos = new Set((estado.datos.mis_datos || {}).eventos_atendidos || []);
  return (estado.datos.eventos || []).filter((e) => !atendidos.has(e.id));
}

const VISTAS = {
  hoy: dibujarHoy,
  salud: dibujarSalud,
  negocios: dibujarNegocios,
  ficha: dibujarFicha,
  ajustes: dibujarAjustes,
};

function dibujar() {
  const contenedor = document.getElementById("vista");
  const fabrica = VISTAS[estado.vista];
  contenedor.innerHTML = "";
  if (!fabrica) {
    contenedor.innerHTML = `<p class="pronto">Esta pantalla llega en la próxima etapa.</p>`;
  } else {
    contenedor.append(fabrica(estado));
  }
  window.scrollTo(0, 0);
  for (const boton of document.querySelectorAll(".nav-boton")) {
    const activa = boton.dataset.vista === estado.vista;
    boton.setAttribute("aria-current", activa ? "page" : "false");
  }
  dibujarBarraGuardado();
  dibujarGlobo();
}

function irA(vista, foco = null) {
  estado.vista = vista;
  estado.foco = foco;
  location.hash = foco ? `${vista}/${foco}` : vista;
  dibujar();
}

function leerHash() {
  const [vista, foco] = location.hash.replace("#", "").split("/");
  if (vista) { estado.vista = vista; estado.foco = foco || null; }
}

async function guardar() {
  dibujarBarraGuardado("Guardando…", false);
  const r = await sincronizar(estado, github, estado.token);
  dibujarBarraGuardado(r.ok ? "" : r.mensaje, !r.ok);
  if (r.ok) setTimeout(() => dibujarBarraGuardado(), 100);
}

async function arrancar() {
  estado.datos = await bajarDatos();
  leerHash();

  document.getElementById("navegacion").addEventListener("click", (evento) => {
    const boton = evento.target.closest(".nav-boton");
    if (boton) irA(boton.dataset.vista);
  });
  document.getElementById("boton-guardar").addEventListener("click", guardar);
  window.addEventListener("hashchange", () => { leerHash(); dibujar(); });

  // Si se cierra la app con cambios sin subir, avisar antes de perderlos.
  window.addEventListener("beforeunload", (evento) => {
    if (hayCambios(estado)) evento.preventDefault();
  });

  dibujarBarraEstado();
  dibujar();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

arrancar();
```

- [ ] **Step 4: Commit**

```bash
git add app.js index.html app.css
git commit -m "feat: barra de guardado, navegacion a ficha y pantalla de ajustes"
```

---

## Task 10: La lista de Negocios

**Files:**
- Create: `vistas/negocios.js`
- Modify: `app.css`

- [ ] **Step 1: Escribir la vista**

Crear `vistas/negocios.js`:

```js
/* La lista de los 85 negocios, con filtros. Tocar uno abre su ficha. */

import { plata, fechaCorta, escapar } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

const filtro = { anio: "todos", tipo: "todos", conAvisos: false };

function aplicarFiltros(negocios) {
  return negocios.filter((n) => {
    if (filtro.anio !== "todos" && (n.fecha_fin || "").slice(0, 4) !== filtro.anio) return false;
    if (filtro.tipo !== "todos" && n.tipo_negocio !== filtro.tipo) return false;
    if (filtro.conAvisos && !(n.avisos || []).length) return false;
    return true;
  });
}

export function dibujarNegocios(estado) {
  const todos = estado.datos.negocios || [];
  const anios = [...new Set(todos.map((n) => (n.fecha_fin || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const lista = aplicarFiltros(todos).sort((a, b) => (b.fecha_fin || "").localeCompare(a.fecha_fin || ""));

  const totalFact = lista.reduce((t, n) => t + (n.estado === "cerrado" ? n.facturacion || 0 : 0), 0);
  const totalGan = lista.reduce((t, n) => t + (n.estado === "cerrado" ? n.ganancia || 0 : 0), 0);

  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:14px">
      <p class="etiqueta">Negocios</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">${lista.length} de ${todos.length}</h1>
      <p class="apunte">${plata(totalFact)} facturados · ${plata(totalGan)} de ganancia</p>
    </section>

    <section class="filtros">
      <select class="filtro" id="f-anio" aria-label="Año">
        <option value="todos">Todos los años</option>
        ${anios.map((a) => `<option value="${a}"${filtro.anio === a ? " selected" : ""}>${a}</option>`).join("")}
      </select>
      <select class="filtro" id="f-tipo" aria-label="Tipo">
        <option value="todos">Venta y alquiler</option>
        <option value="venta"${filtro.tipo === "venta" ? " selected" : ""}>Solo venta</option>
        <option value="alquiler"${filtro.tipo === "alquiler" ? " selected" : ""}>Solo alquiler</option>
      </select>
      <button class="filtro ${filtro.conAvisos ? "prendido" : ""}" id="f-avisos">
        ${filtro.conAvisos ? "● " : ""}Con pendientes
      </button>
    </section>
  `));

  const contenedor = document.createElement("div");
  contenedor.className = "lista";
  for (const n of lista) contenedor.append(fila(n, estado));
  if (!lista.length) {
    contenedor.append(nodo(html`<p class="pronto">Ningún negocio con esos filtros.</p>`));
  }
  trozo.append(contenedor);

  trozo.getElementById("f-anio").addEventListener("change", (e) => {
    filtro.anio = e.target.value;
    estado.redibujar();
  });
  trozo.getElementById("f-tipo").addEventListener("change", (e) => {
    filtro.tipo = e.target.value;
    estado.redibujar();
  });
  trozo.getElementById("f-avisos").addEventListener("click", () => {
    filtro.conAvisos = !filtro.conAvisos;
    estado.redibujar();
  });

  return trozo;
}

function fila(n, estado) {
  const anio = Number(estado.hoy.slice(0, 4));
  const avisos = (n.avisos || []).length;
  const trozo = nodo(html`
    <button class="fila" data-id="${n.id}">
      <span class="fila-cuerpo">
        <span class="fila-titulo">${escapar(n.direccion || "Sin dirección")}</span>
        <span class="fila-sub">
          ${escapar(n.barrio || "sin barrio")} · ${n.tipo_negocio} · ${fechaCorta(n.fecha_fin, anio)}
          ${n.estado === "en_curso" ? ' · <span class="chip-curso">en curso</span>' : ""}
        </span>
      </span>
      <span class="fila-derecha">
        <span class="cifra cifra-media">${plata(n.facturacion)}</span>
        ${avisos ? `<span class="chip-avisos">${avisos}</span>` : ""}
      </span>
    </button>
  `);
  trozo.querySelector(".fila").addEventListener("click", () => estado.irA("ficha", n.id));
  return trozo;
}
```

- [ ] **Step 2: Agregar los estilos**

Agregar al final de `app.css`:

```css
/* ---------- Listas y filtros ---------- */

.filtros { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.filtro {
  padding: 9px 13px;
  font: inherit; font-size: 13px; font-weight: 600;
  color: var(--tinta); background: var(--lienzo);
  border: 1px solid var(--linea); border-radius: 10px;
  cursor: pointer;
}
.filtro.prendido { background: var(--azul); border-color: var(--azul); color: #fff; }

.lista { display: grid; gap: 1px; background: var(--linea); border-radius: var(--radio); overflow: hidden; border: 1px solid var(--linea); }
.fila {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; padding: 14px 16px;
  background: var(--lienzo); border: none; font: inherit; color: inherit;
  text-align: left; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.fila:active { background: var(--lienzo-2); }
.fila-cuerpo { min-width: 0; }
.fila-titulo { display: block; font-weight: 600; font-size: 14.5px; }
.fila-sub { display: block; font-size: 12px; color: var(--tinta-2); margin-top: 2px; }
.fila-derecha { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }
.chip-avisos {
  min-width: 21px; height: 21px; padding: 0 6px;
  display: grid; place-items: center;
  background: var(--rojo); color: #fff;
  border-radius: 7px; font-size: 11px; font-weight: 800;
}
.chip-curso {
  background: var(--azul-suave); color: var(--azul);
  padding: 1px 6px; border-radius: 5px; font-weight: 700;
}
```

- [ ] **Step 3: Commit**

```bash
git add vistas/negocios.js app.css
git commit -m "feat: lista de negocios con filtros"
```

---

## Task 11: La ficha editable

**Files:**
- Create: `vistas/ficha.js`

- [ ] **Step 1: Escribir la vista**

Crear `vistas/ficha.js`:

```js
/* La ficha de un negocio, editable.

   Los campos que faltan se pintan en rojo, para que se vea de un golpe que hay que
   completar. Cada cambio se aplica al instante y queda en la cola para subir. */

import { editarNegocio } from "../lib/guardado.js";
import { plata, plataUSD, pct, escapar } from "../lib/formato.js";
import { REGIMENES } from "../lib/motor.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

const NOMBRE_REGIMEN = {
  captacion_mia: "Captación mía",
  ref_martin: "Referida de Martín",
  ref_otro_colega: "Referida de otro colega",
  yo_referi: "Yo se lo referí a un colega",
  suplencia: "Suplencia (cubrí una visita)",
};

const TIPOS = {
  venta: "Venta",
  alquiler: "Alquiler",
  renovacion_alquiler: "Renovación de alquiler",
  suplencia: "Suplencia",
};

export function dibujarFicha(estado) {
  const n = (estado.datos.negocios || []).find((x) => x.id === estado.foco);
  if (!n) {
    const vacio = document.createDocumentFragment();
    vacio.append(nodo(html`<p class="pronto">No se encontró ese negocio.</p>`));
    return vacio;
  }

  const falta = new Set((n.avisos || []).map((a) => a.tipo));
  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:14px">
      <button class="boton" id="volver" style="padding:8px 13px;font-size:13px">‹ Negocios</button>
      <p class="etiqueta" style="margin-top:14px">${escapar(TIPOS[n.tipo_negocio] || n.tipo_negocio)} · ${n.id}</p>
      <h1 class="titulo" style="font-size:24px;margin-top:4px">${escapar(n.direccion || "Sin dirección")}</h1>
      <p class="apunte">${escapar(n.barrio || "sin barrio")}</p>
    </section>

    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">La plata</h2>
        ${n.recalculado ? '<span class="apunte">recalculado</span>' : '<span class="apunte">viene del Excel</span>'}
      </div>
      <div class="datos">
        <div class="dato"><span class="dato-nombre">Comisión total (BASE)</span><span class="dato-valor">${plata(n.base)}</span></div>
        <div class="dato"><span class="dato-nombre">Facturación RE/MAX</span><span class="dato-valor">${plata(n.facturacion)}</span></div>
        <div class="dato"><span class="dato-nombre">A tu bolsillo</span><span class="dato-valor">${plataUSD(n.ganancia)}</span></div>
      </div>
    </section>
  `));

  trozo.append(campos(n, falta, estado));
  trozo.append(avisos(n));
  trozo.append(fichaCompleta(n, estado));

  trozo.getElementById("volver").addEventListener("click", () => estado.irA("negocios"));
  return trozo;
}

function campos(n, falta, estado) {
  const seccion = nodo(html`
    <section class="tarjeta" style="padding:0;overflow:hidden">
      <div class="datos" id="campos"></div>
    </section>
  `);
  const contenedor = seccion.getElementById("campos");

  const agregar = (clave, etiqueta, tipo, valor, opciones) => {
    const faltaEste = falta.has(`falta_${clave}`) || falta.has(`sin_${clave}`);
    const fila = document.createElement("div");
    fila.className = `campo-fila${faltaEste ? " falta" : ""}`;
    const id = `campo-${clave}`;
    fila.innerHTML = html`
      <label for="${id}">${etiqueta}${faltaEste ? " — falta" : ""}</label>
      ${opciones
        ? html`<select class="campo" id="${id}">
             ${opciones.map(([v, t]) => `<option value="${v}"${v === valor ? " selected" : ""}>${t}</option>`).join("")}
           </select>`
        : html`<input class="campo" id="${id}" type="${tipo}" value="${valor ?? ""}"
                 ${tipo === "number" ? 'step="any"' : ""}>`}
    `;
    const control = fila.querySelector(".campo");
    control.addEventListener("change", () => {
      const crudo = control.value;
      const nuevo = tipo === "number" ? (crudo === "" ? null : Number(crudo)) : crudo || null;
      editarNegocio(estado, n.id, { [clave]: nuevo });
      estado.redibujar();
    });
    contenedor.append(fila);
  };

  agregar("fecha_inicio", "Fecha de inicio", "date", n.fecha_inicio);
  agregar("fecha_boleto", "Fecha del boleto o reserva", "date", n.fecha_boleto);
  agregar("fecha_fin", "Fecha de firma (cuando cobraste)", "date", n.fecha_fin);
  agregar("direccion", "Dirección", "text", n.direccion);
  agregar("barrio", "Barrio", "text", n.barrio);
  agregar("precio_operacion", "Precio de la operación (USD)", "number", n.precio_operacion);
  agregar("pct_comision_total", "% de comisión (0,03 = 3%)", "number", n.pct_comision_total);
  agregar("puntas", "Puntas", "number", n.puntas, [[0, "0 — no fue mío"], [1, "1 punta"], [2, "2 puntas"]]);
  agregar("regimen_comision", "Cómo llegó el negocio", "text", n.regimen_comision,
    REGIMENES.map((r) => [r, NOMBRE_REGIMEN[r] || r]));
  agregar("tipo_negocio", "Tipo", "text", n.tipo_negocio,
    Object.entries(TIPOS).map(([v, t]) => [v, t]));
  agregar("notas", "Notas", "text", n.notas);

  return seccion;
}

function avisos(n) {
  const lista = n.avisos || [];
  if (!lista.length) {
    return nodo(html`<p class="apunte" style="text-align:center;padding:8px">Sin pendientes en este negocio ✓</p>`);
  }
  return nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:10px">Qué falta acá</h2>
      ${lista.map((a) => html`<p class="aviso">${escapar(a.detalle)}</p>`).join("")}
    </section>
  `);
}

function fichaCompleta(n, estado) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:6px">
        ${n.ficha_completa ? "Ficha dada por completa" : "¿Ya cargaste todo lo que ibas a cargar?"}
      </h2>
      <p class="apunte" style="margin-bottom:12px">
        ${n.ficha_completa
          ? "Este negocio no vuelve a aparecer en pendientes por datos faltantes. Podés seguir editándolo cuando quieras."
          : "Tocá acá y dejo de avisarte por los datos que falten en este negocio. Se puede deshacer."}
      </p>
      <button class="boton ${n.ficha_completa ? "" : "boton-primario"}" id="completa">
        ${n.ficha_completa ? "Volver a pedirme los datos" : "Ficha completa"}
      </button>
    </section>
  `);
  seccion.getElementById("completa").addEventListener("click", () => {
    editarNegocio(estado, n.id, { ficha_completa: !n.ficha_completa });
    estado.redibujar();
  });
  return seccion;
}
```

- [ ] **Step 2: Verificar que todos los tests siguen pasando**

Run: `node --test tests-js/*.test.mjs 2>&1 | grep -E "ℹ (tests|pass|fail)"`
Expected: `pass 112`, `fail 0`

- [ ] **Step 3: Commit**

```bash
git add vistas/ficha.js
git commit -m "feat: ficha editable de cada negocio"
```

---

## Task 12: Despachar pendientes desde Hoy

**Files:**
- Modify: `vistas/hoy.js`

- [ ] **Step 1: Hacer que cada pendiente lleve a su negocio**

En `vistas/hoy.js`, reemplazar el import de arriba por:

```js
import { derivar } from "../lib/pendientes.js";
import { capas, ritmo } from "../lib/salud.js";
import { marcarAtendido } from "../lib/guardado.js";
import { plataUSD, pct, fechaCorta, escapar } from "../lib/formato.js";
```

Y reemplazar la función `dibujarGrupo` entera por esta, que hace clickeable cada ítem:

```js
function dibujarGrupo(grupo, estado) {
  const anio = Number(estado.hoy.slice(0, 4));
  const marca = nodo(html`
    <details class="grupo ${grupo.urgente ? "urgente" : ""}">
      <summary class="grupo-cabeza">
        <span class="grupo-cuenta">${grupo.items.length}</span>
        <span class="grupo-nombre">${escapar(grupo.nombre)}</span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <ul class="grupo-lista"></ul>
    </details>
  `);

  const lista = marca.querySelector(".grupo-lista");
  for (const item of grupo.items) {
    const li = document.createElement("li");
    li.className = "grupo-item";
    li.innerHTML = html`
      <p class="grupo-item-titulo">${escapar(item.titulo)}${
        item.fecha ? ` <span class="capa-sub">· ${fechaCorta(item.fecha, anio)}</span>` : ""
      }</p>
      <p class="grupo-item-detalle">${escapar(item.detalle)}</p>
      <div class="botonera">
        ${item.negocio_id
          ? `<button class="boton" data-ir="${item.negocio_id}" style="padding:8px 13px;font-size:13px">Abrir y completar</button>`
          : `<button class="boton" data-listo="${item.evento_id}" style="padding:8px 13px;font-size:13px">Ya lo resolví</button>`}
      </div>
    `;
    const abrir = li.querySelector("[data-ir]");
    if (abrir) abrir.addEventListener("click", () => estado.irA("ficha", abrir.dataset.ir));
    const listo = li.querySelector("[data-listo]");
    if (listo) {
      listo.addEventListener("click", () => {
        marcarAtendido(estado, listo.dataset.listo);
        estado.redibujar();
      });
    }
    lista.append(li);
  }
  return marca;
}
```

Y en `dibujarHoy`, cambiar la línea que arma los grupos para que use los eventos ya
filtrados por lo atendido:

```js
export function dibujarHoy(estado) {
  const atendidos = new Set((estado.datos.mis_datos || {}).eventos_atendidos || []);
  const eventos = (estado.datos.eventos || []).filter((e) => !atendidos.has(e.id));
  const grupos = derivar(estado.datos.negocios, eventos, estado.hoy);
  const total = grupos.reduce((t, g) => t + g.items.length, 0);

  const trozo = document.createDocumentFragment();
  trozo.append(encabezado(total));
  if (!total) {
    trozo.append(todoAlDia(estado));
    return trozo;
  }
  for (const grupo of grupos) trozo.append(dibujarGrupo(grupo, estado));
  return trozo;
}
```

- [ ] **Step 2: Correr todos los tests**

Run: `node --test tests-js/*.test.mjs 2>&1 | grep -E "ℹ (tests|pass|fail)"`
Expected: `pass 112`, `fail 0`

Run: `python -m unittest discover -s tests -t . 2>&1 | grep -E "^(Ran|OK|FAILED)"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add vistas/hoy.js
git commit -m "feat: desde cada pendiente se abre el negocio o se marca como resuelto"
```

---

## Task 13: Verificación completa

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Agregar los archivos nuevos al caché sin señal**

En `sw.js`, reemplazar la constante `ARMAZON` por:

```js
const ARMAZON = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./manifest.webmanifest",
  "./tipografia/bricolage.woff2",
  "./lib/formato.js",
  "./lib/salud.js",
  "./lib/motor.js",
  "./lib/pendientes.js",
  "./lib/github.js",
  "./lib/guardado.js",
  "./vistas/salud.js",
  "./vistas/hoy.js",
  "./vistas/negocios.js",
  "./vistas/ficha.js",
  "./vistas/ajustes.js",
];
```

Y subir la versión del caché para que los teléfonos que ya tengan la app vieja la reemplacen:

```js
const CACHE = "como-venimos-v2";
```

- [ ] **Step 2: Verificar que todo se sirve**

```bash
cd "c:/Users/es_bi/OneDrive/Desktop/claude/Como venimos"
python -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &
sleep 2
for a in index.html app.css app.js sw.js \
         lib/formato.js lib/salud.js lib/motor.js lib/pendientes.js lib/github.js lib/guardado.js \
         vistas/salud.js vistas/hoy.js vistas/negocios.js vistas/ficha.js vistas/ajustes.js; do
  printf "%-26s %s\n" "$a" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/$a)"
done
kill %1
```
Expected: los 15 dan `200`.

- [ ] **Step 3: Verificar que los números no se movieron**

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const leer = (n) => JSON.parse(readFileSync('datos/' + n + '.json', 'utf8'));
const { capas } = await import('./lib/salud.js');
const c = capas(leer('negocios'), leer('cartera'), leer('ajustes'), '2026');
console.log(Math.round(c.capa1.facturacion), Math.round(c.capa2.facturacion), Math.round(c.capa3.facturacion));
"
```
Expected: `20079 15924 21554`

- [ ] **Step 4: Correr las dos baterías**

Run: `node --test tests-js/*.test.mjs 2>&1 | grep -E "ℹ (tests|pass|fail)"`
Expected: `pass 112`, `fail 0`

Run: `python -m unittest discover -s tests -t . 2>&1 | grep -E "^(Ran|OK|FAILED)"`
Expected: `OK`

- [ ] **Step 5: Commit y subir**

```bash
git add sw.js
git commit -m "feat: cachear los archivos nuevos para andar sin señal"
git push origin main
```

- [ ] **Step 6: Confirmar que GitHub quedó en verde**

```bash
sleep 60
curl -s "https://api.github.com/repos/juanandresotero/como-venimos/actions/runs?per_page=2" | python -c "
import sys, json
for r in json.load(sys.stdin)['workflow_runs']:
    print(r['name'], r['status'], r['conclusion'])
"
```
Expected: `Robot de cartera completed success`

> Este paso no es opcional. Dos veces en este proyecto los tests estuvieron en verde
> localmente y en rojo en GitHub. Verificar solo en la máquina propia no alcanza.

---

## Verificación final de la fase

- [ ] `node --test tests-js/*.test.mjs` → **112 tests, 0 fallas**
- [ ] `python -m unittest discover -s tests -t .` → **210 tests, 0 fallas**
- [ ] Los números del tablero siguen dando `20079 / 15924 / 21554`
- [ ] La corrida de GitHub quedó en verde
- [ ] En el navegador: se puede abrir un negocio, cambiarle un dato y ver que el aviso desaparece
- [ ] Con el token cargado, "Guardar" sube el cambio y aparece un commit nuevo en GitHub

**Al terminar, el usuario puede vaciar sus 50 pendientes desde el celular.** La fase siguiente agrega la pantalla de Cartera, el alta manual de negocios y los contactos con WhatsApp.
