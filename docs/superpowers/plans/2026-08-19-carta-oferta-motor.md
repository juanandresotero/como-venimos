# Carta oferta — Etapa 1: el motor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor de la carta oferta —el documento, las firmas y el enlace— y
medir si el enlace entra en el presupuesto, que es lo único que puede tumbar el diseño.

**Architecture:** Cuatro módulos puros en `lib/`, sin DOM y sin librerías: el documento
como datos con tres estados por casilla, los números en letras, las firmas (dibujadas y
recortadas de foto) y el empaquetado del estado en el fragmento de una URL. Ninguno sabe
de pantallas: los van a usar tanto la app como la página del cliente.

**Tech Stack:** JavaScript ES modules puro, sin build. Tests con `node --test`. Compresión
con `CompressionStream("deflate-raw")`, que existe igual en el navegador y en Node.

**Spec:** `docs/superpowers/specs/2026-08-19-carta-oferta-design.md`

---

## Por qué esta etapa termina donde termina

La §4 del spec fija un presupuesto de **3.000 caracteres** para el enlace y la §9 pone un
freno a propósito: *probar el enlace en el celular, por WhatsApp, de verdad* antes de
construir la pantalla y el PDF.

Si WhatsApp maltrata un enlace de 2 KB, cambia el transporte, y con el transporte cambian
la pantalla del cliente y la forma de encadenar las firmas. Escribir hoy el plan de esas
partes es planificar trabajo que puede tener que rehacerse.

**Las etapas 2 (pantallas) y 3 (PDF) reciben su propio plan cuando la Tarea 8 pase.**

---

## Estructura de archivos

| Archivo | Su único trabajo |
|---|---|
| `lib/numero-a-letras.js` | `134000` → `"ciento treinta y cuatro mil"` |
| `lib/carta-oferta.js` | La plantilla como datos y `armar()` → los párrafos resueltos |
| `lib/firma.js` | Las dos clases de firma: a bytes y de vuelta, y medidas para dibujarlas |
| `lib/firma-foto.js` | Píxeles de una foto → máscara recortada |
| `lib/carta-enlace.js` | Estado de la carta ⇄ fragmento de URL |
| `tests-js/numero-a-letras.test.mjs` | Los casos molestos del castellano |
| `tests-js/carta-oferta.test.mjs` | Los tres estados, sobre todo que quitar deje prosa correcta |
| `tests-js/firma.test.mjs` | Ida y vuelta sin perder el dibujo, y el peso |
| `tests-js/firma-foto.test.mjs` | Separar tinta azul de gris, descartar motas, recortar bien |
| `tests-js/carta-enlace.test.mjs` | Ida y vuelta, y **el presupuesto de 3.000 caracteres** |

Ninguno importa nada de `vistas/`. Ninguno toca `datos/`.

---

## Task 1: Números en letras

**Files:**
- Create: `lib/numero-a-letras.js`
- Test: `tests-js/numero-a-letras.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { enLetras } from "../lib/numero-a-letras.js";

test("los primeros treinta, que son los irregulares", () => {
  assert.equal(enLetras(0), "cero");
  assert.equal(enLetras(1), "uno");
  assert.equal(enLetras(15), "quince");
  assert.equal(enLetras(16), "dieciséis");
  assert.equal(enLetras(21), "veintiuno");
  assert.equal(enLetras(22), "veintidós");
  assert.equal(enLetras(29), "veintinueve");
});

test("de treinta en adelante aparece la 'y'", () => {
  assert.equal(enLetras(30), "treinta");
  assert.equal(enLetras(31), "treinta y uno");
  assert.equal(enLetras(45), "cuarenta y cinco");
  assert.equal(enLetras(99), "noventa y nueve");
});

/* "cien" a secas, pero "ciento uno". Es la trampa clasica. */
test("cien es cien, y ciento cuando lleva algo atras", () => {
  assert.equal(enLetras(100), "cien");
  assert.equal(enLetras(101), "ciento uno");
  assert.equal(enLetras(115), "ciento quince");
  assert.equal(enLetras(134), "ciento treinta y cuatro");
  assert.equal(enLetras(200), "doscientos");
  assert.equal(enLetras(500), "quinientos");
  assert.equal(enLetras(700), "setecientos");
  assert.equal(enLetras(999), "novecientos noventa y nueve");
});

/* Nunca "uno mil": es "mil". Y el uno se apocopa delante de mil. */
test("los miles, con el uno apocopado", () => {
  assert.equal(enLetras(1000), "mil");
  assert.equal(enLetras(1001), "mil uno");
  assert.equal(enLetras(2000), "dos mil");
  assert.equal(enLetras(21000), "veintiún mil");
  assert.equal(enLetras(31000), "treinta y un mil");
  assert.equal(enLetras(134000), "ciento treinta y cuatro mil");
  assert.equal(enLetras(999999), "novecientos noventa y nueve mil novecientos noventa y nueve");
});

test("los millones, en singular y en plural", () => {
  assert.equal(enLetras(1000000), "un millón");
  assert.equal(enLetras(2000000), "dos millones");
  assert.equal(enLetras(2500000), "dos millones quinientos mil");
});

/* Los precios de las cartas reales del usuario. */
test("los montos que aparecen de verdad", () => {
  assert.equal(enLetras(110000), "ciento diez mil");
  assert.equal(enLetras(134000), "ciento treinta y cuatro mil");
  assert.equal(enLetras(56000), "cincuenta y seis mil");
});

test("lo que no es un entero positivo devuelve vacio", () => {
  assert.equal(enLetras(null), "");
  assert.equal(enLetras(undefined), "");
  assert.equal(enLetras(-5), "");
  assert.equal(enLetras(1.5), "");
  assert.equal(enLetras("hola"), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests-js/numero-a-letras.test.mjs`
Expected: FAIL — `Cannot find module '../lib/numero-a-letras.js'`

- [ ] **Step 3: Write the implementation**

Create `lib/numero-a-letras.js`:

```js
/* Numeros a palabras, en castellano rioplatense.

   Existe porque la carta oferta escribe el precio y los plazos DOS veces: en letras y en
   cifras. Es lo que hace el usuario a mano ("ciento treinta y cuatro mil dolares
   estadounidenses (U$S 134.000)") y lo que evita el desacuerdo clasico entre lo que dice
   la letra y lo que dice el numero. */

const HASTA_29 = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho",
  "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
  "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés",
  "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];

const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta",
  "ochenta", "noventa"];

const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
  "seiscientos", "setecientos", "ochocientos", "novecientos"];

/* El uno se acorta cuando va pegado a "mil" o a "millones": veintiun mil, no veintiuno
   mil. Es lo primero que delata un texto armado por una maquina. */
function apocopar(texto) {
  if (texto === "uno") return "un";
  if (texto.endsWith("veintiuno")) return `${texto.slice(0, -9)}veintiún`;
  if (texto.endsWith(" uno")) return `${texto.slice(0, -4)} un`;
  return texto;
}

function hasta999(n) {
  if (n < 30) return HASTA_29[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u ? `${DECENAS[d]} y ${HASTA_29[u]}` : DECENAS[d];
  }
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  return resto ? `${CENTENAS[c]} ${hasta999(resto)}` : CENTENAS[c];
}

export function enLetras(n) {
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return "";
  if (n < 1000) return hasta999(n);

  if (n < 1000000) {
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    const cabeza = miles === 1 ? "mil" : `${apocopar(hasta999(miles))} mil`;
    return resto ? `${cabeza} ${hasta999(resto)}` : cabeza;
  }

  const millones = Math.floor(n / 1000000);
  const resto = n % 1000000;
  const cabeza = millones === 1 ? "un millón" : `${apocopar(enLetras(millones))} millones`;
  return resto ? `${cabeza} ${enLetras(resto)}` : cabeza;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests-js/numero-a-letras.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/numero-a-letras.js tests-js/numero-a-letras.test.mjs
git commit -m "feat: numeros a palabras, para que la carta diga la cifra dos veces"
```

---

## Task 2: Las casillas y la plantilla

**Files:**
- Create: `lib/carta-oferta.js`
- Test: `tests-js/carta-oferta.test.mjs`

Las quince casillas salen del `.docx` que entregó el usuario. Quién las llena y si se
pueden quitar está en la §2 y la §3 del spec.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMPOS, PLANTILLA } from "../lib/carta-oferta.js";

const porClave = Object.fromEntries(CAMPOS.map((c) => [c.clave, c]));

test("estan las quince casillas del documento", () => {
  assert.deepEqual(CAMPOS.map((c) => c.clave), [
    "nombre", "cedula", "telefono", "correo",
    "padron", "calle", "ciudad",
    "precio", "dias_reserva", "dias_validez", "fecha_oferta",
    "propietario_nombre", "propietario_cedula", "propietario_domicilio", "fecha_aceptacion",
  ]);
});

/* Quitar el precio o un plazo deja una carta que no obliga a nada. */
test("solo se puede quitar lo que la frase sobrevive sin ello", () => {
  const quitables = CAMPOS.filter((c) => c.quitable).map((c) => c.clave);
  assert.deepEqual(quitables, ["telefono", "correo", "padron", "ciudad", "propietario_domicilio"]);
});

test("cada casilla dice quien la llena", () => {
  assert.equal(porClave.nombre.quien, "comprador");
  assert.equal(porClave.precio.quien, "usuario");
  assert.equal(porClave.propietario_nombre.quien, "propietario");
});

test("cada casilla dice de que largo es su rayita", () => {
  for (const campo of CAMPOS) {
    assert.ok(campo.rayita >= 4, `${campo.clave} necesita un largo de rayita`);
  }
});

/* Las palabras que enganchan una casilla con la frase VIAJAN CON ELLA. Es lo que hace
   posible el tercer estado: al quitar la casilla se va tambien su enganche. */
test("toda pieza es texto suelto o una casilla con su enganche", () => {
  const claves = new Set(CAMPOS.map((c) => c.clave));
  for (const bloque of PLANTILLA) {
    for (const pieza of bloque.piezas || []) {
      if (pieza.texto !== undefined) continue;
      assert.ok(claves.has(pieza.campo), `pieza con campo desconocido: ${pieza.campo}`);
      assert.equal(typeof pieza.antes, "string", `${pieza.campo} sin 'antes'`);
    }
  }
});

test("la plantilla nombra cada casilla exactamente una vez", () => {
  const usadas = PLANTILLA.flatMap((b) => (b.piezas || []))
    .filter((p) => p.campo).map((p) => p.campo);
  assert.deepEqual([...usadas].sort(), CAMPOS.map((c) => c.clave).sort());
});

/* La segunda hoja del Word. */
test("el documento tiene dos hojas y tres lugares para firmar", () => {
  assert.equal(PLANTILLA.filter((b) => b.tipo === "salto-de-hoja").length, 1);
  const firmas = PLANTILLA.filter((b) => b.tipo === "firmas").flatMap((b) => b.firmas);
  assert.deepEqual(firmas.map((f) => f.clave), ["oferente", "depositario", "propietario"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests-js/carta-oferta.test.mjs`
Expected: FAIL — `Cannot find module '../lib/carta-oferta.js'`

- [ ] **Step 3: Write the implementation**

Create `lib/carta-oferta.js`. El texto es palabra por palabra el del `.docx` que entregó
el usuario el 2026-08-19; lo único que cambia son las dos correcciones de la §3 del spec.

```js
/* La OFERTA DE COMPRA de RE/MAX, como datos.

   El texto sale palabra por palabra del modelo que entrego el usuario. No se mejora ni
   se reescribe: es un documento que obliga, y la redaccion es de su oficina.

   Dos cosas si se corrigen, porque el modelo se contradice solo (§3 del spec):
   - El QUINTO decia "por un plazo de cinco (____) dias habiles", con la palabra "cinco"
     fija y el numero en la rayita: poner 10 daba "cinco (10)". Ahora las dos salen del
     mismo dato.
   - El precio se escribe en letras Y en cifras, como lo hace el usuario a mano.

   LO IMPORTANTE DE ESTE ARCHIVO: las palabras que enganchan una casilla con la frase
   viajan pegadas a la casilla, en `antes` y `despues`. Por eso quitar una casilla se
   lleva tambien su enganche y la frase se cierra sola, sin agujeros ni comas sueltas. */

export const CAMPOS = [
  { clave: "nombre", etiqueta: "Nombre", tipo: "texto", quien: "comprador", quitable: false, rayita: 28 },
  { clave: "cedula", etiqueta: "Documento de identidad", tipo: "texto", quien: "comprador", quitable: false, rayita: 16 },
  { clave: "telefono", etiqueta: "Teléfono", tipo: "texto", quien: "comprador", quitable: true, rayita: 14 },
  { clave: "correo", etiqueta: "Correo electrónico", tipo: "texto", quien: "comprador", quitable: true, rayita: 20 },

  { clave: "padron", etiqueta: "Padrón", tipo: "texto", quien: "usuario", quitable: true, rayita: 10 },
  { clave: "calle", etiqueta: "Calle y número", tipo: "texto", quien: "usuario", quitable: false, rayita: 26 },
  { clave: "ciudad", etiqueta: "Ciudad", tipo: "texto", quien: "usuario", quitable: true, rayita: 16 },

  { clave: "precio", etiqueta: "Precio ofrecido (U$S)", tipo: "monto", quien: "usuario", quitable: false, rayita: 24 },
  { clave: "dias_reserva", etiqueta: "Días hábiles para la reserva", tipo: "entero", quien: "usuario", quitable: false, rayita: 6, porDefecto: 15 },
  { clave: "dias_validez", etiqueta: "Días hábiles que vale la oferta", tipo: "entero", quien: "usuario", quitable: false, rayita: 6, porDefecto: 5 },
  { clave: "fecha_oferta", etiqueta: "Fecha de la oferta", tipo: "fecha", quien: "usuario", quitable: false, rayita: 12 },

  { clave: "propietario_nombre", etiqueta: "Nombre del propietario", tipo: "texto", quien: "propietario", quitable: false, rayita: 30 },
  { clave: "propietario_cedula", etiqueta: "Documento del propietario", tipo: "texto", quien: "propietario", quitable: false, rayita: 22 },
  { clave: "propietario_domicilio", etiqueta: "Domicilio del propietario", tipo: "texto", quien: "propietario", quitable: true, rayita: 20 },
  { clave: "fecha_aceptacion", etiqueta: "Fecha de la aceptación", tipo: "fecha", quien: "propietario", quitable: false, rayita: 12 },
];

const t = (texto) => ({ texto });

export const PLANTILLA = [
  { tipo: "titulo", piezas: [t("OFERTA DE COMPRA")] },

  { tipo: "parrafo", piezas: [
    { campo: "nombre", antes: "Nombre: " },
    { campo: "cedula", antes: " Doc. Identidad " },
    { campo: "telefono", antes: " Teléfono " },
    { campo: "correo", antes: " Correo electrónico " },
    t(" en su carácter de OFERENTE, expresa que:"),
  ] },

  { tipo: "parrafo", piezas: [
    t("PRIMERO: OBJETO. La parte OFERENTE ofrece comprar para sí o para el tercero que "
      + "indique, libre de ocupantes, hipotecas, embargos y demás gravámenes y con todos "
      + "los impuestos, tasas, servicios y demás obligaciones correspondientes al inmueble "
      + "de referencia totalmente pagos al día de la firma del otorgamiento proyectará, "
      + "reservando en este acto la adquisición de la propiedad y posesión al PROPIETARIO "
      + "del inmueble empadronado"),
    { campo: "padron", antes: " con el número " },
    { campo: "calle", antes: " ubicado en la calle " },
    { campo: "ciudad", antes: " de la ciudad de " },
    t(", República Oriental del Uruguay. De acuerdo a las siguientes condiciones y "
      + "declarando que los fondos con los adquirirá el inmueble de referencia son de "
      + "origen lícito manifestando no estar comprendido en las previsiones de la ley "
      + "19.574, sus decretos reglamentarios y demás normativa vigente:"),
  ] },

  { tipo: "parrafo", piezas: [
    t("SEGUNDO: PRECIO. El precio ofrecido por la compraventa proyectada asciende a la "
      + "suma de"),
    { campo: "precio", antes: " " },
    t(" dólares estadounidenses que se pagará con el otorgamiento de la compraventa "
      + "proyectada y entrega del Inmueble."),
  ] },

  { tipo: "parrafo", piezas: [
    t("TERCERO: RESERVA. Una vez aceptada la presente oferta por el PROPIETARIO, las "
      + "partes otorgarán un contrato preliminar (en adelante, la “Reserva”), con las "
      + "cláusulas de estilo para este tipo de operaciones, dentro de los"),
    { campo: "dias_reserva", antes: " " },
    t(" días hábiles siguientes a contar de la aceptación por parte del primero."),
  ] },

  { tipo: "parrafo", piezas: [
    t("CUARTO: INTERMEDIACIÓN. La parte OFERENTE y el PROPIETARIO asumen, cada uno por su "
      + "parte, el pago a los agentes asociado de “RE/MAX” la suma pactada previamente "
      + "sobre el precio de venta por concepto de honorarios de intermediación, la que "
      + "deberá ser abonada al momento de la firma de la compraventa proyectada."),
  ] },

  { tipo: "parrafo", piezas: [
    t("QUINTO: ACEPTACIÓN. La presente OFERTA se mantendrá válida y vigente por un plazo de"),
    { campo: "dias_validez", antes: " " },
    t(" días hábiles a contar de hoy. De no recibir la parte OFERENTE la confirmación de "
      + "su aceptación por el PROPIETARIO dentro de dicho plazo, la presente oferta "
      + "caducará automáticamente y de pleno derecho."),
  ] },

  { tipo: "parrafo", piezas: [
    t("SEXTO: Para todos los efectos legales las partes constituyen domicilios especiales "
      + "en: a) el AUTORIZANTE en el enunciado la comparecencia, y b) los agentes asociado "
      + "RE/MAX, acordando la validez del telegrama colacionado para todas las "
      + "comunicaciones, y firmando las partes el presente con su firma habitual en dos "
      + "ejemplares de igual tenor en Montevideo el"),
    { campo: "fecha_oferta", antes: " " },
    t("."),
  ] },

  { tipo: "firmas", firmas: [
    { clave: "oferente", pie: "OFERENTE" },
    { clave: "depositario", pie: "DEPOSITARIO" },
  ] },

  { tipo: "salto-de-hoja" },

  { tipo: "titulo", piezas: [t("ACEPTACIÓN")] },

  { tipo: "parrafo", piezas: [
    t("El/los suscrito/os"),
    { campo: "propietario_nombre", antes: " " },
    t(", titular/es del/de los Documentos de identidad número/s"),
    { campo: "propietario_cedula", antes: " " },
    { campo: "propietario_domicilio", antes: " con domicilio a estos efectos en " },
    t(" en calidad de PROPIETARIO/S del “Inmueble” mencionado con anterioridad, "
      + "acepto/amos la OFERTA de contratar que antecede, obligándome/nos en los términos "
      + "y condiciones de la misma y suscribiendo el presente en Montevideo el"),
    { campo: "fecha_aceptacion", antes: " " },
    t("."),
  ] },

  { tipo: "firmas", firmas: [
    { clave: "propietario", pie: "PROPIETARIO/S" },
  ] },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests-js/carta-oferta.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/carta-oferta.js tests-js/carta-oferta.test.mjs
git commit -m "feat: la OFERTA DE COMPRA como datos, con el enganche pegado a cada casilla"
```

---

## Task 3: Las tres puertas de cada casilla

**Files:**
- Modify: `lib/carta-oferta.js` (agregar `armar` al final)
- Modify: `tests-js/carta-oferta.test.mjs` (agregar tests al final)

Es el corazón del pedido del usuario y donde viven los bugs. Los tests van caso por caso.

- [ ] **Step 1: Write the failing test**

Agregar al final de `tests-js/carta-oferta.test.mjs`:

```js
import { armar } from "../lib/carta-oferta.js";

const BASE = {
  nombre: "Juan Pérez", cedula: "1.234.567-8", telefono: "099123456",
  correo: "juan@mail.com", padron: "62295", calle: "Pantaleón Pérez 4782",
  ciudad: "Montevideo", precio: 134000, dias_reserva: 15, dias_validez: 5,
  fecha_oferta: "2026-08-19",
};

/* Junta todo el texto de un parrafo que contenga un pedazo dado. Es como se lee de
   verdad el resultado: lo que importa es la frase entera, no las piezas. */
function frase(bloques, pedazo) {
  const p = bloques.filter((b) => b.tipo === "parrafo")
    .find((b) => b.partes.map((x) => x.texto).join("").includes(pedazo));
  return p ? p.partes.map((x) => x.texto).join("") : "";
}

test("una casilla llena sale escrita adentro de la frase", () => {
  const doc = armar(BASE, []);
  assert.match(frase(doc, "empadronado"), /empadronado con el número 62295 ubicado/);
});

test("una casilla vacia deja la rayita para completar a mano", () => {
  const doc = armar({ ...BASE, padron: null }, []);
  assert.match(frase(doc, "empadronado"), /empadronado con el número _+ ubicado/);
});

/* El tercer estado, que es el que pidio el usuario y el que puede romper la prosa. */
test("una casilla quitada se lleva su enganche y la frase se cierra sola", () => {
  const doc = armar(BASE, ["ciudad"]);
  const texto = frase(doc, "empadronado");
  assert.match(texto, /ubicado en la calle Pantaleón Pérez 4782, República Oriental/);
  assert.doesNotMatch(texto, /ciudad/, "no puede quedar 'de la ciudad de' colgado");
});

test("quitar no deja espacios dobles, comas huerfanas ni puntos sueltos", () => {
  for (const quitadas of [[], ["ciudad"], ["padron"], ["telefono"], ["correo"],
    ["padron", "ciudad"], ["telefono", "correo"], ["ciudad", "telefono", "correo", "padron"]]) {
    for (const bloque of armar(BASE, quitadas)) {
      if (bloque.tipo !== "parrafo") continue;
      const texto = bloque.partes.map((p) => p.texto).join("");
      assert.doesNotMatch(texto, /  /, `espacio doble con ${quitadas}: ${texto.slice(0, 90)}`);
      assert.doesNotMatch(texto, / [,.]/, `coma o punto sueltos con ${quitadas}`);
      assert.doesNotMatch(texto, /^\s|\s$/, `sobra espacio en los bordes con ${quitadas}`);
    }
  }
});

test("quitar el telefono deja el encabezado corrido, sin agujero", () => {
  const texto = frase(armar(BASE, ["telefono"]), "OFERENTE, expresa");
  assert.match(texto, /Nombre: Juan Pérez Doc\. Identidad 1\.234\.567-8 Correo electrónico/);
  assert.doesNotMatch(texto, /Teléfono/);
});

/* La correccion del QUINTO: la palabra y el numero salen del MISMO dato. */
test("los plazos se escriben en letra y en numero, siempre iguales", () => {
  const doc = armar({ ...BASE, dias_reserva: 15, dias_validez: 10 }, []);
  assert.match(frase(doc, "TERCERO"), /dentro de los quince \(15\) días hábiles/);
  assert.match(frase(doc, "QUINTO"), /por un plazo de diez \(10\) días hábiles/);
  assert.doesNotMatch(frase(doc, "QUINTO"), /cinco \(10\)/, "era el error del modelo");
});

test("el precio va en letras y en cifras", () => {
  assert.match(frase(armar(BASE, []), "SEGUNDO"),
    /suma de ciento treinta y cuatro mil \(U\$S 134\.000\) dólares estadounidenses/);
});

test("la fecha se escribe como la escribe una persona", () => {
  assert.match(frase(armar(BASE, []), "SEXTO"), /en Montevideo el día 19 de agosto de 2026\./);
});

test("cada parte dice si es texto, valor escrito o rayita", () => {
  const doc = armar({ ...BASE, padron: null }, []);
  const clases = new Set(doc.filter((b) => b.tipo === "parrafo")
    .flatMap((b) => b.partes).map((p) => p.clase));
  assert.deepEqual([...clases].sort(), ["rayita", "texto", "valor"]);
});

test("las firmas dicen si ya estan hechas", () => {
  const doc = armar(BASE, [], { firmadas: ["oferente"] });
  const firmas = doc.filter((b) => b.tipo === "firmas").flatMap((b) => b.firmas);
  assert.equal(firmas.find((f) => f.clave === "oferente").firmada, true);
  assert.equal(firmas.find((f) => f.clave === "propietario").firmada, false);
});

test("sin ningun valor sale la carta entera en rayitas, sin romperse", () => {
  const doc = armar({}, []);
  assert.ok(doc.length > 5);
  assert.match(frase(doc, "SEGUNDO"), /suma de _+ dólares estadounidenses/);
  assert.match(frase(doc, "TERCERO"), /dentro de los _+ días hábiles/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests-js/carta-oferta.test.mjs`
Expected: FAIL — `armar is not a function` / `The requested module does not provide an export named 'armar'`

- [ ] **Step 3: Write the implementation**

Agregar al final de `lib/carta-oferta.js`:

```js
import { enLetras } from "./numero-a-letras.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];

const POR_CLAVE = Object.fromEntries(CAMPOS.map((c) => [c.clave, c]));

const miles = (n) => Math.round(n).toLocaleString("es-UY");

/* Como se escribe el valor de cada casilla adentro de la frase. Los montos y los plazos
   salen en letra Y en numero desde el mismo dato: es lo que evita que la carta se
   contradiga a si misma. */
function comoSeEscribe(clave, valor) {
  const campo = POR_CLAVE[clave];
  if (campo.tipo === "monto") {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) return "";
    return `${enLetras(Math.round(n))} (U$S ${miles(n)})`;
  }
  if (campo.tipo === "entero") {
    const n = Number(valor);
    if (!Number.isInteger(n) || n <= 0) return "";
    return `${enLetras(n)} (${n})`;
  }
  if (campo.tipo === "fecha") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor));
    if (!m) return "";
    return `día ${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
  }
  const texto = String(valor ?? "").trim();
  return texto;
}

/* Deja la frase como la escribiria una persona.

   Al quitar una casilla se van sus palabras de enganche, y en las costuras quedan
   espacios de mas o una coma que arranca el renglon. Se limpia sobre las PARTES y no
   sobre el texto entero, porque cada parte tiene que seguir sabiendo si es texto, valor
   o rayita: de eso depende como se pinta despues. */
function limpiar(partes) {
  const salida = [];
  for (const parte of partes) {
    let texto = parte.texto.replace(/\s{2,}/g, " ");
    const anterior = salida[salida.length - 1];
    if (anterior) {
      if (/\s$/.test(anterior.texto) && /^\s/.test(texto)) texto = texto.replace(/^\s+/, "");
      if (/^\s*[,.;:]/.test(texto)) anterior.texto = anterior.texto.replace(/\s+$/, "");
    }
    if (texto) salida.push({ ...parte, texto });
  }
  if (salida.length) {
    salida[0].texto = salida[0].texto.replace(/^\s+/, "");
    const ultima = salida[salida.length - 1];
    ultima.texto = ultima.texto.replace(/\s+$/, "");
  }
  return salida.filter((p) => p.texto);
}

/* Resuelve la plantilla contra los valores cargados.

   `quitadas` son las casillas que el usuario decidio que no aparezcan. Lo que NO esta
   quitado y no tiene valor sale como rayita, para completar a mano o en la pantalla. */
export function armar(valores, quitadas = [], opciones = {}) {
  const fuera = new Set(quitadas);
  const firmadas = new Set(opciones.firmadas || []);

  return PLANTILLA.map((bloque) => {
    if (bloque.tipo === "firmas") {
      return { ...bloque, firmas: bloque.firmas.map((f) => ({ ...f, firmada: firmadas.has(f.clave) })) };
    }
    if (bloque.tipo === "salto-de-hoja") return { ...bloque };

    const partes = [];
    for (const pieza of bloque.piezas) {
      if (pieza.texto !== undefined) {
        partes.push({ texto: pieza.texto, clase: "texto" });
        continue;
      }
      if (fuera.has(pieza.campo)) continue;

      const escrito = comoSeEscribe(pieza.campo, valores[pieza.campo]);
      if (pieza.antes) partes.push({ texto: pieza.antes, clase: "texto" });
      partes.push(escrito
        ? { texto: escrito, clase: "valor", campo: pieza.campo }
        : { texto: "_".repeat(POR_CLAVE[pieza.campo].rayita), clase: "rayita", campo: pieza.campo });
      if (pieza.despues) partes.push({ texto: pieza.despues, clase: "texto" });
    }
    return { tipo: bloque.tipo, partes: limpiar(partes) };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests-js/carta-oferta.test.mjs`
Expected: PASS, 18 tests.

- [ ] **Step 5: Run the whole suite — nada de lo viejo se puede romper**

Run: `node --test tests-js/*.test.mjs`
Expected: PASS, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add lib/carta-oferta.js tests-js/carta-oferta.test.mjs
git commit -m "feat: las tres puertas de cada casilla — llena, vacia o quitada"
```

---

## Task 4: La firma dibujada con el dedo

**Files:**
- Create: `lib/firma.js`
- Test: `tests-js/firma.test.mjs`

Trazos de puntos, no imagen: pesa una fracción, se dibuja nítido a cualquier tamaño y en
el PDF entra como trazo vectorial de verdad.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deTrazos, aBytes, deBytes, GRILLA } from "../lib/firma.js";

/* Una firma parecida a una de verdad: tres trazos con muchos puntos. */
function firmaDePrueba() {
  const trazos = [];
  for (let t = 0; t < 3; t++) {
    const puntos = [];
    for (let i = 0; i < 70; i++) {
      puntos.push({
        x: 40 + i * 12 + t * 30,
        y: 250 + Math.round(90 * Math.sin(i / 6 + t)),
      });
    }
    trazos.push(puntos);
  }
  return deTrazos(trazos);
}

test("una firma dibujada va a bytes y vuelve igual", () => {
  const firma = firmaDePrueba();
  const vuelta = deBytes(aBytes(firma));
  assert.equal(vuelta.clase, "trazos");
  assert.equal(vuelta.trazos.length, firma.trazos.length);
  for (let t = 0; t < firma.trazos.length; t++) {
    assert.equal(vuelta.trazos[t].length, firma.trazos[t].length);
    for (let i = 0; i < firma.trazos[t].length; i++) {
      assert.equal(vuelta.trazos[t][i].x, firma.trazos[t][i].x);
      assert.equal(vuelta.trazos[t][i].y, firma.trazos[t][i].y);
    }
  }
});

/* El presupuesto del enlace (§4 del spec) se reparte entre tres firmas. */
test("una firma dibujada normal no pasa de 600 bytes", () => {
  assert.ok(aBytes(firmaDePrueba()).length < 600,
    `pesa ${aBytes(firmaDePrueba()).length} bytes`);
});

test("los trazos largos se remuestrean, para que una firma lenta no pese el triple", () => {
  const puntos = Array.from({ length: 900 }, (_, i) => ({ x: 10 + i, y: 300 }));
  const firma = deTrazos([puntos]);
  assert.ok(firma.trazos[0].length <= 60, `quedaron ${firma.trazos[0].length} puntos`);
  assert.equal(firma.trazos[0][0].x, 10, "conserva el arranque");
  assert.equal(firma.trazos[0].at(-1).x, 909, "y el final");
});

test("los puntos quedan dentro de la grilla", () => {
  const firma = deTrazos([[{ x: -50, y: -50 }, { x: 99999, y: 99999 }]]);
  for (const p of firma.trazos[0]) {
    assert.ok(p.x >= 0 && p.x < GRILLA.ancho, `x fuera de grilla: ${p.x}`);
    assert.ok(p.y >= 0 && p.y < GRILLA.alto, `y fuera de grilla: ${p.y}`);
  }
});

test("una firma vacia no explota", () => {
  const firma = deTrazos([]);
  assert.deepEqual(deBytes(aBytes(firma)).trazos, []);
  assert.deepEqual(deTrazos([[]]).trazos, [], "un trazo sin puntos no cuenta");
});

test("bytes basura no rompen: devuelven null", () => {
  assert.equal(deBytes(new Uint8Array([9, 9, 9])), null);
  assert.equal(deBytes(new Uint8Array([])), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests-js/firma.test.mjs`
Expected: FAIL — `Cannot find module '../lib/firma.js'`

- [ ] **Step 3: Write the implementation**

Create `lib/firma.js`:

```js
/* Las firmas de la carta oferta, en el formato mas chico que se pueda leer despues.

   Hay DOS clases, porque hay dos situaciones:

   - `trazos`: la que dibujan las partes con el dedo. Se guarda como puntos y no como
     imagen — pesa una fraccion, se dibuja nitida a cualquier tamano, y en el PDF entra
     como trazo vectorial de verdad.
   - `mascara`: la del usuario, recortada de una foto de su firma real (ver firma-foto.js).
     Su firma no se dibuja con el dedo: es la de puno y letra, escaneada una vez.

   Este archivo NO comprime: de eso se encarga carta-enlace.js, que deflacta todo el
   paquete de una sola vez. Asi las funciones de aca quedan sincronicas y simples. */

export const GRILLA = { ancho: 1024, alto: 512 };
const MAX_PUNTOS = 60;

const TRAZOS = 1;
const MASCARA = 2;

const acotar = (n, tope) => Math.max(0, Math.min(tope - 1, Math.round(n)));

/* Una firma hecha a mano puede traer cientos de puntos si la persona escribe despacio.
   Sesenta alcanzan y sobran para que se vea igual, y el resto es peso al pedo. */
function remuestrear(puntos) {
  if (puntos.length <= MAX_PUNTOS) return puntos;
  const salida = [];
  for (let i = 0; i < MAX_PUNTOS; i++) {
    salida.push(puntos[Math.round((i * (puntos.length - 1)) / (MAX_PUNTOS - 1))]);
  }
  return salida;
}

export function deTrazos(trazos) {
  return {
    clase: "trazos",
    trazos: (trazos || [])
      .filter((t) => t && t.length)
      .map((t) => remuestrear(t).map((p) => ({
        x: acotar(p.x, GRILLA.ancho),
        y: acotar(p.y, GRILLA.alto),
      }))),
  };
}

export function deMascara({ ancho, alto, bits }) {
  return { clase: "mascara", ancho, alto, bits };
}

/* Formato de bytes.

   Trazos:  [1][cantidad de trazos][por trazo: cantidad de puntos, x0 hi, x0 lo, y0 hi,
            y0 lo, y despues dx,dy como enteros con signo de un byte. Un salto que no
            entra en un byte se parte en varios pasos, cosa que casi nunca pasa porque
            los puntos vienen seguidos.]
   Mascara: [2][ancho hi, ancho lo][alto hi, alto lo][los bits, uno por pixel]. */
export function aBytes(firma) {
  if (!firma) return new Uint8Array([TRAZOS, 0]);

  if (firma.clase === "mascara") {
    const cabeza = [MASCARA, firma.ancho >> 8, firma.ancho & 255, firma.alto >> 8, firma.alto & 255];
    const salida = new Uint8Array(cabeza.length + firma.bits.length);
    salida.set(cabeza);
    salida.set(firma.bits, cabeza.length);
    return salida;
  }

  const bytes = [TRAZOS, firma.trazos.length];
  for (const trazo of firma.trazos) {
    bytes.push(trazo.length, trazo[0].x >> 8, trazo[0].x & 255, trazo[0].y >> 8, trazo[0].y & 255);
    for (let i = 1; i < trazo.length; i++) {
      let dx = trazo[i].x - trazo[i - 1].x;
      let dy = trazo[i].y - trazo[i - 1].y;
      bytes.push(dx & 255, dy & 255);
    }
  }
  return new Uint8Array(bytes);
}

const conSigno = (b) => (b > 127 ? b - 256 : b);

export function deBytes(bytes) {
  if (!bytes || bytes.length < 2) return null;

  if (bytes[0] === MASCARA) {
    if (bytes.length < 5) return null;
    return {
      clase: "mascara",
      ancho: (bytes[1] << 8) | bytes[2],
      alto: (bytes[3] << 8) | bytes[4],
      bits: bytes.slice(5),
    };
  }
  if (bytes[0] !== TRAZOS) return null;

  const trazos = [];
  let i = 2;
  for (let t = 0; t < bytes[1]; t++) {
    if (i + 5 > bytes.length) return null;
    const cuantos = bytes[i];
    let x = (bytes[i + 1] << 8) | bytes[i + 2];
    let y = (bytes[i + 3] << 8) | bytes[i + 4];
    i += 5;
    const puntos = [{ x, y }];
    for (let p = 1; p < cuantos; p++) {
      if (i + 2 > bytes.length) return null;
      x += conSigno(bytes[i]);
      y += conSigno(bytes[i + 1]);
      i += 2;
      puntos.push({ x, y });
    }
    trazos.push(puntos);
  }
  return { clase: "trazos", trazos };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests-js/firma.test.mjs`
Expected: PASS, 6 tests.

Nota: si el test de remuestreo falla porque un salto entre puntos no entra en un byte con
signo (más de 127 de diferencia), es real: pasa cuando se remuestrea un trazo muy largo.
La corrección es partir el salto en pasos. Verificarlo con este test extra antes de seguir:

```js
test("un salto grande entre puntos remuestreados no se corrompe", () => {
  const puntos = Array.from({ length: 900 }, (_, i) => ({ x: acotarPrueba(i), y: 300 }));
  function acotarPrueba(i) { return Math.min(1023, i); }
  const firma = deTrazos([puntos]);
  const vuelta = deBytes(aBytes(firma));
  assert.deepEqual(vuelta.trazos[0].map((p) => p.x), firma.trazos[0].map((p) => p.x));
});
```

Si ese test falla, reemplazar el bucle de escritura de deltas en `aBytes` por este, que
parte los saltos grandes en pasos de a 127:

```js
    for (let i = 1; i < trazo.length; i++) {
      let dx = trazo[i].x - trazo[i - 1].x;
      let dy = trazo[i].y - trazo[i - 1].y;
      while (Math.abs(dx) > 127 || Math.abs(dy) > 127) {
        const px = Math.max(-127, Math.min(127, dx));
        const py = Math.max(-127, Math.min(127, dy));
        bytes.push(px & 255, py & 255);
        dx -= px; dy -= py;
        trazo.splice(i, 0, { x: trazo[i - 1].x + px, y: trazo[i - 1].y + py });
        i++;
      }
      bytes.push(dx & 255, dy & 255);
    }
```

y ajustar `bytes.push(trazo.length, ...)` para que se escriba **después** de recorrer el
trazo, con la cantidad final de puntos.

- [ ] **Step 5: Commit**

```bash
git add lib/firma.js tests-js/firma.test.mjs
git commit -m "feat: la firma dibujada, como trazos de puntos y no como imagen"
```

---

## Task 5: Recortar la firma de una foto

**Files:**
- Create: `lib/firma-foto.js`
- Test: `tests-js/firma-foto.test.mjs`

Medido sobre la foto real del usuario (§5 del spec): el fondo gris da `B − R ≈ 8` y la
tinta azul llega a 94. Umbralar por **color** sobrevive a la sombra despareja; umbralar
por brillo, no.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { recortar, ANCHO_GUARDADO } from "../lib/firma-foto.js";

/* Arma pixeles RGBA como los que devuelve un canvas. `pintar` decide cada pixel. */
function foto(ancho, alto, pintar) {
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const [r, g, b] = pintar(x, y);
      const i = (y * ancho + x) * 4;
      datos[i] = r; datos[i + 1] = g; datos[i + 2] = b; datos[i + 3] = 255;
    }
  }
  return { data: datos, width: ancho, height: alto };
}

const GRIS = [150, 152, 158];   // fondo: B - R = 8, como la foto real
const AZUL = [70, 90, 164];     // tinta:  B - R = 94, como la foto real

/* La sombra despareja de una foto de celular: el brillo cambia, el color no. */
const conSombra = (c, x, ancho) => c.map((v) => Math.max(0, Math.min(255, v - 60 + (120 * x) / ancho)));

test("separa la tinta azul del fondo gris aunque la luz sea despareja", () => {
  const trazo = (x, y) => x >= 40 && x < 160 && y >= 30 && y < 70;
  const r = recortar(foto(200, 100, (x, y) => conSombra(trazo(x, y) ? AZUL : GRIS, x, 200)));
  assert.ok(r, "tiene que encontrar tinta");
  assert.equal(r.clase, "mascara");
});

test("recorta al rectangulo de la firma y tira el fondo", () => {
  const trazo = (x, y) => x >= 40 && x < 160 && y >= 30 && y < 70;
  const r = recortar(foto(200, 100, (x, y) => (trazo(x, y) ? AZUL : GRIS)));
  // 120 de ancho por 40 de alto: la proporcion se conserva al achicar.
  assert.equal(r.ancho, ANCHO_GUARDADO);
  assert.equal(r.alto, Math.round((ANCHO_GUARDADO * 40) / 120));
});

/* Una mota de polvo en la mesa agranda el recorte y descentra la firma. */
test("una motita suelta no agranda el recorte", () => {
  const trazo = (x, y) => x >= 80 && x < 120 && y >= 40 && y < 60;
  const mota = (x, y) => x >= 3 && x < 6 && y >= 3 && y < 6;   // 9 pixeles
  const sinMota = recortar(foto(200, 100, (x, y) => (trazo(x, y) ? AZUL : GRIS)));
  const conMota = recortar(foto(200, 100, (x, y) => (trazo(x, y) || mota(x, y) ? AZUL : GRIS)));
  assert.equal(conMota.alto, sinMota.alto, "la mota no tiene que cambiar la proporcion");
});

test("sin tinta azul devuelve null en vez de inventar una firma", () => {
  assert.equal(recortar(foto(50, 50, () => GRIS)), null);
});

test("los bits alcanzan justo para la mascara, uno por pixel", () => {
  const trazo = (x, y) => x >= 40 && x < 160 && y >= 30 && y < 70;
  const r = recortar(foto(200, 100, (x, y) => (trazo(x, y) ? AZUL : GRIS)));
  assert.equal(r.bits.length, Math.ceil(r.ancho / 8) * r.alto);
});

/* La red de seguridad de la §5: si la separacion por azul es debil, avisar. */
test("con lapicera negra avisa que cayo al metodo de respaldo", () => {
  const NEGRO = [40, 40, 44];
  const trazo = (x, y) => x >= 40 && x < 160 && y >= 30 && y < 70;
  const r = recortar(foto(200, 100, (x, y) => (trazo(x, y) ? NEGRO : GRIS)));
  assert.ok(r, "igual tiene que poder recortarla");
  assert.equal(r.porBrillo, true, "para poder avisarle que revise el recorte");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests-js/firma-foto.test.mjs`
Expected: FAIL — `Cannot find module '../lib/firma-foto.js'`

- [ ] **Step 3: Write the implementation**

Create `lib/firma-foto.js`:

```js
/* La firma del usuario, recortada de una foto de su firma de puno y letra.

   Se recorta POR COLOR y no por brillo, y esa es toda la gracia. La foto sale de un
   celular: tiene sombra despareja, y umbralar por oscuridad se come medio trazo de un
   lado y medio fondo del otro. Pero la tinta es azul y el fondo es gris neutro:

       fondo gris  ->  B - R  ~ 8
       tinta azul  ->  B - R  hasta 94

   Esa diferencia no depende de cuanta luz haya, asi que la sombra deja de importar.
   Medido sobre la foto real que entrego el usuario: recorto de 2016x1134 a 1427x584 sin
   arrastrar una sola mota del fondo.

   Se guarda la MASCARA, nunca la foto: mas liviana y menos expuesta. */

export const ANCHO_GUARDADO = 300;
const UMBRAL_AZUL = 35;
const MINIMO_PIXELES = 20;

/* Con lapicera negra la separacion por color no existe. Se cae a oscuridad y se avisa,
   porque el resultado es peor y el usuario tiene que mirarlo antes de guardarlo. */
function marcarTinta({ data, width, height }) {
  const azul = new Uint8Array(width * height);
  let cuantos = 0;
  for (let i = 0, p = 0; p < azul.length; p++, i += 4) {
    if (data[i + 2] - data[i] > UMBRAL_AZUL) { azul[p] = 1; cuantos++; }
  }
  if (cuantos >= MINIMO_PIXELES) return { tinta: azul, porBrillo: false };

  /* Respaldo: mas oscuro que el promedio de la imagen, con buen margen. */
  let suma = 0;
  for (let i = 0; i < data.length; i += 4) suma += (data[i] + data[i + 1] + data[i + 2]) / 3;
  const promedio = suma / (width * height);
  const oscuro = new Uint8Array(width * height);
  cuantos = 0;
  for (let i = 0, p = 0; p < oscuro.length; p++, i += 4) {
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 < promedio - 30) { oscuro[p] = 1; cuantos++; }
  }
  return cuantos >= MINIMO_PIXELES ? { tinta: oscuro, porBrillo: true } : null;
}

/* Tira las manchitas sueltas antes de medir el rectangulo: una mota de polvo en la mesa
   agranda el recorte y descentra la firma. */
function sinMotas(tinta, ancho, alto) {
  const limpia = new Uint8Array(tinta.length);
  const visto = new Uint8Array(tinta.length);
  const pila = [];
  for (let inicio = 0; inicio < tinta.length; inicio++) {
    if (!tinta[inicio] || visto[inicio]) continue;
    const grupo = [];
    pila.push(inicio);
    visto[inicio] = 1;
    while (pila.length) {
      const p = pila.pop();
      grupo.push(p);
      const x = p % ancho;
      const y = (p - x) / ancho;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
        const q = ny * ancho + nx;
        if (tinta[q] && !visto[q]) { visto[q] = 1; pila.push(q); }
      }
    }
    if (grupo.length >= MINIMO_PIXELES) for (const p of grupo) limpia[p] = 1;
  }
  return limpia;
}

export function recortar(imagen) {
  const marcado = marcarTinta(imagen);
  if (!marcado) return null;

  const { width: ancho, height: alto } = imagen;
  const tinta = sinMotas(marcado.tinta, ancho, alto);

  let x0 = ancho, y0 = alto, x1 = -1, y1 = -1;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (!tinta[y * ancho + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;

  const anchoRecorte = x1 - x0 + 1;
  const altoRecorte = y1 - y0 + 1;
  const anchoFinal = ANCHO_GUARDADO;
  const altoFinal = Math.max(1, Math.round((anchoFinal * altoRecorte) / anchoRecorte));

  /* Se achica por muestreo de area: cada pixel de salida se prende si en el pedazo que
     le toca hay algo de tinta. Los trazos finos se mantienen; un promedio los borraria. */
  const porFila = Math.ceil(anchoFinal / 8);
  const bits = new Uint8Array(porFila * altoFinal);
  for (let y = 0; y < altoFinal; y++) {
    for (let x = 0; x < anchoFinal; x++) {
      const desdeX = x0 + Math.floor((x * anchoRecorte) / anchoFinal);
      const hastaX = x0 + Math.max(desdeX + 1 - x0, Math.floor(((x + 1) * anchoRecorte) / anchoFinal));
      const desdeY = y0 + Math.floor((y * altoRecorte) / altoFinal);
      const hastaY = y0 + Math.max(desdeY + 1 - y0, Math.floor(((y + 1) * altoRecorte) / altoFinal));
      let hay = false;
      for (let py = desdeY; py < hastaY && !hay; py++) {
        for (let px = desdeX; px < hastaX; px++) {
          if (tinta[py * ancho + px]) { hay = true; break; }
        }
      }
      if (hay) bits[y * porFila + (x >> 3)] |= 128 >> (x & 7);
    }
  }

  return { clase: "mascara", ancho: anchoFinal, alto: altoFinal, bits, porBrillo: marcado.porBrillo };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests-js/firma-foto.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/firma-foto.js tests-js/firma-foto.test.mjs
git commit -m "feat: la firma del usuario se recorta de la foto por color, no por brillo"
```

---

## Task 6: El enlace

**Files:**
- Create: `lib/carta-enlace.js`
- Test: `tests-js/carta-enlace.test.mjs`

Los datos viajan en el **fragmento** de la URL (después del `#`), que no se manda al
servidor: GitHub Pages nunca ve el contenido de la carta.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { aEnlace, deEnlace, PRESUPUESTO } from "../lib/carta-enlace.js";
import { deTrazos, aBytes } from "../lib/firma.js";
import { recortar } from "../lib/firma-foto.js";

const ESTADO = {
  valores: {
    nombre: "Juan Pérez", cedula: "1.234.567-8", telefono: "099123456",
    correo: "juan@mail.com", padron: "62295", calle: "Pantaleón Pérez 4782",
    ciudad: "Montevideo", precio: 134000, dias_reserva: 15, dias_validez: 5,
    fecha_oferta: "2026-08-19",
  },
  quitadas: ["correo"],
  turno: "propietario",
  telefono_agente: "59899123456",
  firmas: {},
};

const BASE = "https://juanandresotero.github.io/como-venimos/firmar.html";

test("el estado va al enlace y vuelve entero", async () => {
  const enlace = await aEnlace(BASE, ESTADO);
  const vuelta = await deEnlace(enlace);
  assert.deepEqual(vuelta.valores, ESTADO.valores);
  assert.deepEqual(vuelta.quitadas, ESTADO.quitadas);
  assert.equal(vuelta.turno, "propietario");
  assert.equal(vuelta.telefono_agente, "59899123456");
});

/* Los datos NO pueden ir en la parte que el servidor ve. */
test("todo viaja despues del numeral, que nunca llega al servidor", async () => {
  const enlace = await aEnlace(BASE, ESTADO);
  const [antes, despues] = enlace.split("#");
  assert.equal(antes, BASE);
  assert.ok(despues.length > 20);
  assert.doesNotMatch(antes, /Pérez|134000|62295/);
});

test("el fragmento usa solo caracteres que sobreviven a WhatsApp", async () => {
  const fragmento = (await aEnlace(BASE, ESTADO)).split("#")[1];
  assert.match(fragmento, /^[A-Za-z0-9_-]+$/, "nada de +, / ni = que haya que escapar");
});

test("las firmas viajan y vuelven identicas", async () => {
  const dibujada = deTrazos([[{ x: 10, y: 20 }, { x: 44, y: 61 }, { x: 90, y: 33 }]]);
  const enlace = await aEnlace(BASE, { ...ESTADO, firmas: { oferente: aBytes(dibujada) } });
  const vuelta = await deEnlace(enlace);
  assert.deepEqual([...vuelta.firmas.oferente], [...aBytes(dibujada)]);
  assert.equal(vuelta.firmas.depositario, undefined);
});

/* EL TEST QUE DECIDE SI EL DISENO SE SOSTIENE (§4 del spec).

   El tramo mas pesado es el ultimo: la carta llena, la firma dibujada del comprador y
   la firma del usuario recortada de su foto. */
test("una carta llena con las dos firmas entra en el presupuesto del enlace", async () => {
  const dibujada = deTrazos([
    Array.from({ length: 70 }, (_, i) => ({ x: 40 + i * 12, y: 250 + Math.round(90 * Math.sin(i / 6)) })),
    Array.from({ length: 55 }, (_, i) => ({ x: 90 + i * 9, y: 300 + Math.round(60 * Math.cos(i / 5)) })),
  ]);

  // Una firma parecida a la del usuario: 2,3% de tinta en trazos, no ruido al azar.
  const ancho = 900, alto = 370;
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const enTrazo = Math.abs(y - (185 + 120 * Math.sin(x / 90))) < 4
        || Math.abs(y - (200 + 90 * Math.cos(x / 60))) < 3;
      const i = (y * ancho + x) * 4;
      datos[i] = enTrazo ? 70 : 150;
      datos[i + 1] = enTrazo ? 90 : 152;
      datos[i + 2] = enTrazo ? 164 : 158;
      datos[i + 3] = 255;
    }
  }
  const delUsuario = recortar({ data: datos, width: ancho, height: alto });

  const enlace = await aEnlace(BASE, {
    ...ESTADO,
    firmas: { oferente: aBytes(dibujada), depositario: aBytes(delUsuario) },
  });

  console.log(`  enlace completo: ${enlace.length} caracteres `
    + `(fragmento ${enlace.split("#")[1].length}, presupuesto ${PRESUPUESTO})`);
  assert.ok(enlace.split("#")[1].length <= PRESUPUESTO,
    `el fragmento mide ${enlace.split("#")[1].length} y el presupuesto es ${PRESUPUESTO}`);
});

test("un enlace roto devuelve null en vez de romper la pagina del cliente", async () => {
  assert.equal(await deEnlace(`${BASE}#no-es-esto`), null);
  assert.equal(await deEnlace(BASE), null);
  assert.equal(await deEnlace(""), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests-js/carta-enlace.test.mjs`
Expected: FAIL — `Cannot find module '../lib/carta-enlace.js'`

- [ ] **Step 3: Write the implementation**

Create `lib/carta-enlace.js`:

```js
/* El estado de la carta, empaquetado adentro de una URL.

   Todo viaja en el FRAGMENTO —lo que va despues del `#`— y eso no es un detalle: el
   fragmento no se manda al servidor. GitHub Pages nunca ve el contenido de la carta, no
   queda en ningun registro, y el dato va de un celular al otro adentro del mensaje de
   WhatsApp.

   El paquete es: un JSON con las casillas, y atras las firmas en crudo. Todo junto se
   deflacta de una sola vez —los nombres de las casillas se repiten y comprimen muy
   bien— y se escribe en base64url, que no tiene ningun caracter que WhatsApp o un
   navegador tengan que escapar.

   El presupuesto de 3.000 esta medido: ver el ultimo test de carta-enlace.test.mjs. */

export const PRESUPUESTO = 3000;
const VERSION = 1;
const ORDEN_FIRMAS = ["oferente", "depositario", "propietario"];

const aBase64Url = (bytes) => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function deBase64Url(texto) {
  const normal = texto.replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(normal + "=".repeat((4 - (normal.length % 4)) % 4));
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
}

async function pasarPor(bytes, transformador) {
  const stream = new Blob([bytes]).stream().pipeThrough(transformador);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const comprimir = (b) => pasarPor(b, new CompressionStream("deflate-raw"));
const descomprimir = (b) => pasarPor(b, new DecompressionStream("deflate-raw"));

export async function aEnlace(base, estado) {
  const cabeza = new TextEncoder().encode(JSON.stringify({
    v: VERSION,
    valores: estado.valores || {},
    quitadas: estado.quitadas || [],
    turno: estado.turno || "comprador",
    tel: estado.telefono_agente || "",
  }));

  const trozos = [new Uint8Array([cabeza.length >> 8, cabeza.length & 255]), cabeza];
  for (const clave of ORDEN_FIRMAS) {
    const firma = (estado.firmas || {})[clave];
    if (!firma || !firma.length) continue;
    trozos.push(new Uint8Array([
      ORDEN_FIRMAS.indexOf(clave), firma.length >> 8, firma.length & 255,
    ]), firma);
  }

  const total = trozos.reduce((n, t) => n + t.length, 0);
  const paquete = new Uint8Array(total);
  let i = 0;
  for (const trozo of trozos) { paquete.set(trozo, i); i += trozo.length; }

  return `${base}#${aBase64Url(await comprimir(paquete))}`;
}

export async function deEnlace(url) {
  const fragmento = String(url || "").split("#")[1];
  if (!fragmento || !/^[A-Za-z0-9_-]+$/.test(fragmento)) return null;

  let paquete;
  try {
    paquete = await descomprimir(deBase64Url(fragmento));
  } catch {
    return null;
  }
  if (paquete.length < 2) return null;

  try {
    const largo = (paquete[0] << 8) | paquete[1];
    const cabeza = JSON.parse(new TextDecoder().decode(paquete.slice(2, 2 + largo)));
    if (cabeza.v !== VERSION) return null;

    const firmas = {};
    let i = 2 + largo;
    while (i + 3 <= paquete.length) {
      const clave = ORDEN_FIRMAS[paquete[i]];
      const cuantos = (paquete[i + 1] << 8) | paquete[i + 2];
      firmas[clave] = paquete.slice(i + 3, i + 3 + cuantos);
      i += 3 + cuantos;
    }

    return {
      valores: cabeza.valores,
      quitadas: cabeza.quitadas,
      turno: cabeza.turno,
      telefono_agente: cabeza.tel,
      firmas,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests-js/carta-enlace.test.mjs`
Expected: PASS, 6 tests. El test del presupuesto imprime el tamaño real — **anotarlo**.

- [ ] **Step 5: Si el presupuesto NO entra, parar acá**

No seguir con la Tarea 7. Volver a la §4 del spec: la salida prevista es no mandar la
firma del usuario en el último tramo y componerla sólo en el PDF. Eso ahorra ~1.220
caracteres y hay que decidirlo con el usuario, no solo.

- [ ] **Step 6: Commit**

```bash
git add lib/carta-enlace.js tests-js/carta-enlace.test.mjs
git commit -m "feat: el estado de la carta viaja en el fragmento, que no llega al servidor"
```

---

## Task 7: Que todo junto siga andando

**Files:**
- Modify: `sw.js:16` (subir el número de caché)

- [ ] **Step 1: Correr la suite entera**

Run: `node --test tests-js/*.test.mjs`
Expected: PASS, 0 fail. Deben sumar los tests nuevos a los 541 que ya había.

- [ ] **Step 2: Correr los tests de Python, que no se tocaron pero se verifican igual**

Run: `python -m unittest discover -s tests -t .`
Expected: OK, 237 tests.

- [ ] **Step 3: Subir el número de caché**

En `sw.js`, línea 16, subir `const CACHE = "como-venimos-vNN"` al número siguiente. Los
archivos nuevos de `lib/` todavía no los carga ninguna pantalla, así que no hace falta
agregarlos a la lista de precarga en esta etapa.

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "chore: cache nueva, con el motor de la carta oferta adentro"
```

---

## Task 8: EL FRENO — probar el enlace en el celular del usuario

**Files:** ninguno. Es una prueba manual y es a propósito.

Todo lo que viene después —la pantalla, la página del cliente y el PDF, que es lo más
caro— depende de que WhatsApp no maltrate un enlace de dos mil y pico de caracteres. Eso
no se puede saber desde acá.

- [ ] **Step 1: Generar un enlace de verdad**

Crear `generar-enlace-temporal.mjs` en la raíz del proyecto:

```js
import { aEnlace } from "./lib/carta-enlace.js";
import { deTrazos, aBytes } from "./lib/firma.js";

const dibujada = deTrazos([
  Array.from({ length: 70 }, (_, i) => ({ x: 40 + i * 12, y: 250 + Math.round(90 * Math.sin(i / 6)) })),
  Array.from({ length: 55 }, (_, i) => ({ x: 90 + i * 9, y: 300 + Math.round(60 * Math.cos(i / 5)) })),
]);

const enlace = await aEnlace("https://juanandresotero.github.io/como-venimos/firmar.html", {
  valores: {
    nombre: "Juan Pérez", cedula: "1.234.567-8", telefono: "099123456",
    correo: "juan@mail.com", padron: "62295", calle: "Pantaleón Pérez 4782",
    ciudad: "Montevideo", precio: 134000, dias_reserva: 15, dias_validez: 5,
    fecha_oferta: "2026-08-19",
  },
  quitadas: [],
  turno: "propietario",
  telefono_agente: "59899123456",
  firmas: { oferente: aBytes(dibujada) },
});

console.log(`\n${enlace.length} caracteres\n`);
console.log(enlace);
```

Run: `node generar-enlace-temporal.mjs`
Después: `rm generar-enlace-temporal.mjs` (no se versiona).

- [ ] **Step 2: Pedirle al usuario que lo pruebe**

Pasarle el enlace y pedirle que:
1. Se lo mande a sí mismo por WhatsApp.
2. Mire si llega **entero** (que no lo corte).
3. Mire si WhatsApp lo deja **tocable** (que lo reconozca como enlace).
4. Lo toque y confirme que abre el navegador con la dirección completa.

`firmar.html` todavía no existe, así que va a dar 404. **Eso está bien**: lo que se está
probando es el transporte, no la página. Avisárselo antes para que el 404 no lo asuste.

- [ ] **Step 3: Anotar el resultado en el spec**

Agregar el resultado real —tamaño y qué hizo WhatsApp— a la §4 del spec, en "Lo que hay
que probar antes que nada". Con fecha.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-19-carta-oferta-design.md
git commit -m "docs: que hizo WhatsApp con el enlace en el celular de verdad"
```

- [ ] **Step 5: Recién ahora, escribir el plan de la Etapa 2**

Con el resultado en la mano, invocar `superpowers:writing-plans` para las pantallas
(`vistas/carta-oferta.js`, `firmar.html`, el panel de firma y la parada nueva en
Herramientas), y después el de la Etapa 3 (`lib/pdf.js`).

---

## Lo que esta etapa NO construye

Queda todo para las etapas 2 y 3, que reciben su plan cuando la Tarea 8 pase:

- La pantalla de la app (`vistas/carta-oferta.js`), con las tres puertas de cada casilla.
- El panel de firma con el dedo (`<canvas>` y eventos `pointer`).
- La pantalla para guardar la firma del usuario desde una foto.
- La página del cliente (`firmar.html`).
- La parada nueva en Herramientas, con el dibujo de la hoja con firma ya elegido.
- El generador de PDF (`lib/pdf.js`), que es la pieza más laboriosa.
