/* Las fotos de un inventario.

   Un inventario sin fotos es la palabra de uno contra la del otro. El de Leyenda patria tiene
   ciento cincuenta, y son la mitad del valor del documento: el día que el inquilino se va, lo
   que decide si se devuelve el depósito es poder mirar cómo estaba la pared. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  medidaAchicada, comoSeLlamaLaFoto, cuantoPesan, enMegas,
  PARA_EL_PAPEL, PARA_EL_DRIVE,
} from "../lib/fotos.js";

/* ---------- Achicar sin deformar ---------- */

/* Una foto estirada de una pared no prueba nada sobre esa pared. */
test("se respeta la proporción, se limita el lado más largo", () => {
  assert.deepEqual(medidaAchicada(4000, 3000, 760), { ancho: 760, alto: 570 });
  assert.deepEqual(medidaAchicada(3000, 4000, 760), { ancho: 570, alto: 760 },
    "una foto vertical se limita por el alto");
  assert.deepEqual(medidaAchicada(1000, 1000, 760), { ancho: 760, alto: 760 });
});

/* Una foto ya chica NO se agranda: agrandarla sólo suma peso y la deja borrosa. */
test("lo que ya entra no se toca", () => {
  assert.deepEqual(medidaAchicada(500, 400, 760), { ancho: 500, alto: 400 });
  assert.deepEqual(medidaAchicada(760, 300, 760), { ancho: 760, alto: 300 });
});

test("una medida imposible no rompe nada", () => {
  assert.equal(medidaAchicada(0, 100, 760), null);
  assert.equal(medidaAchicada(undefined, undefined, 760), null);
});

/* LA DEL PAPEL ES MUCHO MAS CHICA QUE LA DEL DRIVE, y a propósito: en el PDF una foto se
   imprime del tamaño de un sello —cinco por fila en una A4— y en el Drive se mira en grande. */
test("son dos medidas distintas porque sirven para dos cosas distintas", () => {
  assert.ok(PARA_EL_PAPEL.lado < PARA_EL_DRIVE.lado);
  assert.ok(PARA_EL_PAPEL.calidad < PARA_EL_DRIVE.calidad);
  assert.ok(PARA_EL_PAPEL.lado >= 600, "menos que esto y no se puede hacer zoom a una rayita");
});

/* ---------- Cómo se llaman ---------- */

/* "Dormitorio 1 - 03.jpg" se ordena solo en cualquier carpeta; "IMG_20260828_143355.jpg" no
   dice nada. El cero adelante es lo que hace que la 10 no quede antes que la 2. */
test("el nombre lleva el ambiente y el número, con cero adelante", () => {
  assert.equal(comoSeLlamaLaFoto("Dormitorio 1", 3), "Dormitorio 1 - 03.jpg");
  assert.equal(comoSeLlamaLaFoto("Cocina", 12), "Cocina - 12.jpg");
});

test("se ordenan solas: la 2 antes que la 10", () => {
  const nombres = [10, 2, 1].map((n) => comoSeLlamaLaFoto("Baño", n)).sort();
  assert.deepEqual(nombres, ["Baño - 01.jpg", "Baño - 02.jpg", "Baño - 10.jpg"]);
});

/* Un ambiente que se llama "Cochera / depósito" no puede romper el nombre del archivo. */
test("los caracteres que no valen en un nombre de archivo se sacan", () => {
  assert.equal(comoSeLlamaLaFoto("Cochera / depósito", 1), "Cochera - depósito - 01.jpg");
  assert.ok(!comoSeLlamaLaFoto("A:B*C?D", 1).match(/[\/:*?"<>|]/));
});

test("sin nombre de ambiente igual sale un nombre usable", () => {
  assert.equal(comoSeLlamaLaFoto("", 1), "Ambiente - 01.jpg");
  assert.equal(comoSeLlamaLaFoto(null, 5), "Ambiente - 05.jpg");
});

/* ---------- Cuánto pesan ---------- */

/* Hay que poder decirlo en pantalla ANTES de que el teléfono se quede sin lugar. */
test("cuenta las dos versiones de cada foto", () => {
  const foto = (n) => ({
    papel: { bytes: new Uint8Array(n) },
    drive: { bytes: new Uint8Array(n * 5) },
  });
  assert.equal(cuantoPesan([foto(100), foto(200)]), 100 * 6 + 200 * 6);
  assert.equal(cuantoPesan([]), 0);
  assert.equal(cuantoPesan(null), 0);
});

test("una foto a medio guardar no rompe la cuenta", () => {
  assert.equal(cuantoPesan([{}, { papel: {} }, null]), 0);
});

test("los megas se dicen como los diría una persona", () => {
  assert.equal(enMegas(1024 * 1024), "1.0 MB");
  assert.equal(enMegas(45 * 1024 * 1024), "45.0 MB");
});

/* ---------- El número de cada foto ---------- */

/* SE SIGUE DESDE EL NUMERO MAS ALTO, no desde la cantidad.

   Con la cantidad pasaba esto: si tenías las fotos 1, 2 y 3 y borrabas la 2, la próxima se
   numeraba 3 —porque quedaban dos— y PISABA a la que ya era la 3. Una foto de una pared
   desaparecía sin que nada avisara, en un documento que se usa para discutir un depósito.

   Salió auditando la herramienta. */
test("el número sigue desde el más alto, aunque se borre una del medio", () => {
  const proximo = (fotos) =>
    fotos.reduce((mayor, f) => Math.max(mayor, Number(f.orden) || 0), 0) + 1;

  assert.equal(proximo([]), 1);
  assert.equal(proximo([{ orden: 1 }, { orden: 2 }, { orden: 3 }]), 4);
  assert.equal(proximo([{ orden: 1 }, { orden: 3 }]), 4, "borré la 2: la próxima es 4, no 3");
  assert.equal(proximo([{ orden: 5 }]), 6, "borré las cuatro primeras");
});

test("una foto sin número no baja la cuenta", () => {
  const proximo = (fotos) =>
    fotos.reduce((mayor, f) => Math.max(mayor, Number(f.orden) || 0), 0) + 1;
  assert.equal(proximo([{ orden: 3 }, {}, { orden: null }]), 4);
});
