/* Pintar una firma adentro de una caja, sea cual sea la clase.

   La pantalla y la pagina del cliente pintan lo mismo, y el PDF hace la misma cuenta con
   otras herramientas. Por eso el encaje —cuanto agrandar y cuanto correr para que la
   firma entre sin deformarse— vive aca y no en cada pantalla.

   Se le pasa un `ctx` de canvas, pero solo se le piden cuatro cosas (beginPath, moveTo,
   lineTo, stroke, fillRect). Eso lo hace testeable con un ctx de mentira que anota lo que
   le pidieron, que es como se verifica en tests-js/firma-dibujo.test.mjs. */

import { medidas, tinta } from "./firma.js";

/* Cuanto agrandar y cuanto correr para que la firma entre en la caja sin deformarse y
   centrada. Nunca agranda mas alla de la caja: una firma chica se ve chica, no borrosa. */
export function encajar(firma, caja) {
  const m = medidas(firma);
  if (!m) return null;
  const escala = Math.min(caja.ancho / m.ancho, caja.alto / m.alto);
  return {
    escala,
    dx: caja.x + (caja.ancho - m.ancho * escala) / 2,
    dy: caja.y + (caja.alto - m.alto * escala) / 2,
    x0: m.x0 || 0,
    y0: m.y0 || 0,
    ancho: m.ancho * escala,
    alto: m.alto * escala,
  };
}

export function dibujarEn(ctx, firma, caja, { color = "#0b0f1a", grosor = 2 } = {}) {
  const e = encajar(firma, caja);
  if (!e) return null;

  if (firma.clase === "mascara") {
    ctx.fillStyle = color;
    /* Se pintan TIRAS de pixeles seguidos y no pixel por pixel: una firma de 300x123
       tiene miles de pixeles con tinta y pedir miles de rectangulos de 1x1 se nota. */
    const alto = Math.max(1, e.escala);
    for (let y = 0; y < firma.alto; y++) {
      let desde = -1;
      for (let x = 0; x <= firma.ancho; x++) {
        const hay = x < firma.ancho && tinta(firma, x, y);
        if (hay && desde < 0) desde = x;
        if (!hay && desde >= 0) {
          ctx.fillRect(e.dx + desde * e.escala, e.dy + y * e.escala,
            Math.max(1, (x - desde) * e.escala), alto);
          desde = -1;
        }
      }
    }
    return e;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const trazo of firma.trazos) {
    ctx.beginPath();
    trazo.forEach((p, i) => {
      const x = e.dx + (p.x - e.x0) * e.escala;
      const y = e.dy + (p.y - e.y0) * e.escala;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  return e;
}

/* Las tiras de tinta de una mascara, en coordenadas de la propia mascara. El PDF las
   necesita para dibujarla sin canvas, y salen de la misma cuenta que usa dibujarEn. */
export function tirasDeTinta(mascara) {
  const tiras = [];
  for (let y = 0; y < mascara.alto; y++) {
    let desde = -1;
    for (let x = 0; x <= mascara.ancho; x++) {
      const hay = x < mascara.ancho && tinta(mascara, x, y);
      if (hay && desde < 0) desde = x;
      if (!hay && desde >= 0) {
        tiras.push({ x: desde, y, largo: x - desde });
        desde = -1;
      }
    }
  }
  return tiras;
}
