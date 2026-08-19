import { test } from "node:test";
import assert from "node:assert/strict";
import { deTrazos, deMascara, aBytes, deBytes, medidas, tinta, GRILLA } from "../lib/firma.js";

/* Una firma parecida a una de verdad: tres trazos con muchos puntos. */
function firmaDePrueba() {
  const trazos = [];
  for (let t = 0; t < 3; t++) {
    const puntos = [];
    for (let i = 0; i < 70; i++) {
      puntos.push({ x: 40 + i * 12 + t * 30, y: 250 + Math.round(90 * Math.sin(i / 6 + t)) });
    }
    trazos.push(puntos);
  }
  return deTrazos(trazos);
}

test("una firma dibujada va a bytes y vuelve identica", () => {
  const firma = firmaDePrueba();
  const vuelta = deBytes(aBytes(firma));
  assert.equal(vuelta.clase, "trazos");
  assert.deepEqual(vuelta.trazos, firma.trazos);
});

/* El presupuesto del enlace se reparte entre tres firmas. */
test("una firma dibujada normal no pasa de 600 bytes", () => {
  const cuantos = aBytes(firmaDePrueba()).length;
  assert.ok(cuantos < 600, `pesa ${cuantos} bytes`);
});

test("los trazos largos se remuestrean, para que una firma lenta no pese el triple", () => {
  const puntos = Array.from({ length: 900 }, (_, i) => ({ x: 10 + i, y: 300 }));
  const firma = deTrazos([puntos]);
  assert.ok(firma.trazos[0].length <= 60, `quedaron ${firma.trazos[0].length} puntos`);
  assert.equal(firma.trazos[0][0].x, 10, "conserva el arranque");
  assert.equal(firma.trazos[0].at(-1).x, 909, "y el final");
});

/* Al remuestrear un trazo largo, dos puntos seguidos pueden quedar a mas de 127 pixeles.
   Con un delta de un byte fijo eso se corrompia en silencio. */
test("un salto grande entre puntos remuestreados no se corrompe", () => {
  const puntos = Array.from({ length: 900 }, (_, i) => ({ x: Math.min(1023, i), y: 300 }));
  const firma = deTrazos([puntos]);
  assert.deepEqual(deBytes(aBytes(firma)).trazos, firma.trazos);
});

test("los puntos quedan dentro de la grilla", () => {
  const firma = deTrazos([[{ x: -50, y: -50 }, { x: 99999, y: 99999 }]]);
  for (const p of firma.trazos[0]) {
    assert.ok(p.x >= 0 && p.x < GRILLA.ancho, `x fuera de grilla: ${p.x}`);
    assert.ok(p.y >= 0 && p.y < GRILLA.alto, `y fuera de grilla: ${p.y}`);
  }
});

test("una firma vacia no explota", () => {
  assert.deepEqual(deBytes(aBytes(deTrazos([]))).trazos, []);
  assert.deepEqual(deTrazos([[]]).trazos, [], "un trazo sin puntos no cuenta");
  assert.deepEqual(deBytes(aBytes(null)).trazos, []);
});

test("bytes basura no rompen: devuelven null", () => {
  assert.equal(deBytes(new Uint8Array([9, 9, 9])), null);
  assert.equal(deBytes(new Uint8Array([])), null);
  assert.equal(deBytes(null), null);
});

// ------------------------------------------------------------- mascara

function mascaraDePrueba() {
  const ancho = 40;
  const alto = 16;
  const porFila = Math.ceil(ancho / 8);
  const bits = new Uint8Array(porFila * alto);
  for (let x = 4; x < 36; x++) {
    const y = 8 + Math.round(5 * Math.sin(x / 4));
    bits[y * porFila + (x >> 3)] |= 128 >> (x & 7);
  }
  return deMascara({ ancho, alto, bits });
}

test("una mascara va a bytes y vuelve identica", () => {
  const m = mascaraDePrueba();
  const vuelta = deBytes(aBytes(m));
  assert.equal(vuelta.clase, "mascara");
  assert.equal(vuelta.ancho, m.ancho);
  assert.equal(vuelta.alto, m.alto);
  assert.deepEqual([...vuelta.bits], [...m.bits]);
});

test("tinta() dice que pixel esta pintado", () => {
  const m = mascaraDePrueba();
  const pintados = [];
  for (let y = 0; y < m.alto; y++) {
    for (let x = 0; x < m.ancho; x++) if (tinta(m, x, y)) pintados.push([x, y]);
  }
  assert.equal(pintados.length, 32, "un pixel por columna del trazo");
  assert.ok(pintados.every(([x]) => x >= 4 && x < 36));
});

test("medidas encuadra la firma para poder encajarla sin deformarla", () => {
  const trazos = deTrazos([[{ x: 100, y: 200 }, { x: 300, y: 260 }]]);
  assert.deepEqual(medidas(trazos), { x0: 100, y0: 200, ancho: 200, alto: 60 });
  assert.deepEqual(medidas(mascaraDePrueba()), { ancho: 40, alto: 16 });
  assert.equal(medidas(deTrazos([])), null);
  assert.equal(medidas(null), null);
});
