import { test } from "node:test";
import assert from "node:assert/strict";
import { esNavegadorDeOtraApp, esCelular, comoSalirDeAca } from "../lib/navegador.js";

/* Los de verdad. El de WhatsApp en Android es el que dejó a Juan trabado: no dice
   "WhatsApp" en ningún lado, la única marca es el `; wv)` de WebView. */
const ADENTRO_DE_OTRA_APP = [
  ["WhatsApp Android",
    "Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 "
    + "(KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36"],
  ["WhatsApp iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    + "(KHTML, like Gecko) Mobile/21F79"],
  ["Facebook",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    + "(KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/468.0.0.42.107]"],
  ["Instagram",
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) "
    + "Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 320.0.0.42.101"],
];

/* Navegadores de verdad: acá NO tiene que saltar el aviso, sería ruido inútil. */
const NAVEGADORES = [
  ["Chrome Android",
    "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) "
    + "Chrome/126.0.6478.71 Mobile Safari/537.36"],
  ["Safari iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    + "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"],
  ["Chrome en iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    + "(KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1"],
  ["Chrome de escritorio",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    + "Chrome/126.0.0.0 Safari/537.36"],
  ["Firefox de escritorio",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0"],
];

test("reconoce cuando la página se abrió adentro de otra aplicación", () => {
  for (const [donde, ua] of ADENTRO_DE_OTRA_APP) {
    assert.equal(esNavegadorDeOtraApp(ua), true, donde);
  }
});

test("no molesta con el aviso en un navegador de verdad", () => {
  for (const [donde, ua] of NAVEGADORES) {
    assert.equal(esNavegadorDeOtraApp(ua), false, donde);
  }
});

test("sin dato de navegador no se inventa nada", () => {
  assert.equal(esNavegadorDeOtraApp(""), false);
  assert.equal(esNavegadorDeOtraApp(undefined), false);
});

test("distingue celular de computadora", () => {
  assert.equal(esCelular(NAVEGADORES[0][1]), true);
  assert.equal(esCelular(NAVEGADORES[1][1]), true);
  assert.equal(esCelular(NAVEGADORES[3][1]), false);
});

/* Los pasos tienen que ser los del teléfono que el usuario tiene en la mano: en iPhone no
   hay tres puntitos arriba, hay botón de compartir abajo. */
test("los pasos para salir son los de cada teléfono", () => {
  assert.match(comoSalirDeAca(ADENTRO_DE_OTRA_APP[1][1]), /Safari/);
  assert.match(comoSalirDeAca(ADENTRO_DE_OTRA_APP[0][1]), /puntitos/);
});
