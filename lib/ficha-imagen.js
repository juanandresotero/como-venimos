/* La ficha de renta como imagen, para mandarle al cliente por WhatsApp (§10.5).

   Un texto se copia mal y se lee peor en un chat. Una imagen se ve entera de un golpe y
   lleva el nombre y el telefono del agente adentro.

   Se dibuja en un canvas a mano: sin librerias, y por lo tanto sin nada que bajar. */

const ANCHO = 1080;
const ALTO = 1350;

const monto = (n) => (n === null || n === undefined ? "—" : Math.round(n).toLocaleString("es-UY"));
const porcentaje = (n) => (n === null || n === undefined ? "—" : `${(n * 100).toFixed(1).replace(".", ",")}%`);

/* Las lineas de la ficha, calculadas aparte del dibujo para poder probarlas. */
export function contenido(entradas, resultados, agente = {}) {
  const filas = [
    ["Precio", `USD ${monto(entradas.precio)}`],
    ["Alquiler por mes", `${entradas.moneda_alquiler === "UYU" ? "$" : "USD"} ${monto(entradas.alquiler_mensual)}`],
    ["Meses alquilados por año", String(entradas.meses_alquilados ?? 11)],
    ["Impuestos (IRPF)", porcentaje(entradas.irpf_pct)],
    ["Gastos de compra", porcentaje(entradas.gastos_compra_pct)],
    ["Capital realmente invertido", `USD ${monto(resultados.capital_invertido)}`],
  ];
  return {
    titulo: entradas.titulo || "Cálculo de renta",
    heroe: porcentaje(resultados.renta_real_pct),
    heroePie: `renta real · la bruta es ${porcentaje(resultados.renta_bruta_pct)}`,
    filas,
    remate: [
      ["Al bolsillo por mes", `USD ${monto(resultados.bolsillo_por_mes)}`],
      ["Se paga sola en", resultados.anios_para_recuperar
        ? `${resultados.anios_para_recuperar.toFixed(1).replace(".", ",")} años`
        : "—"],
    ],
    nota: "La renta real descuenta impuestos, comisión, refacción y los gastos de compra. "
      + "No es la renta bruta que se dice en la calle.",
    agente: agente.nombre || "Juan Andrés Otero",
    oficina: agente.oficina || "RE/MAX Único",
    telefono: agente.telefono || "",
  };
}

/* Corta un texto largo en renglones que entren en el ancho dado. */
function renglones(ctx, texto, ancho) {
  const palabras = texto.split(" ");
  const salida = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > ancho && actual) {
      salida.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) salida.push(actual);
  return salida;
}

export function dibujar(canvas, entradas, resultados, agente) {
  const d = contenido(entradas, resultados, agente);
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext("2d");
  const fuente = (peso, tam) => `${peso} ${tam}px ui-sans-serif, system-ui, sans-serif`;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // Banda superior: el numero que importa, en azul, ocupando lo que tiene que ocupar.
  ctx.fillStyle = "#0043ff";
  ctx.fillRect(0, 0, ANCHO, 470);

  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.font = fuente(700, 30);
  ctx.fillText("¿CUÁNTO RENTA?", 70, 100);

  ctx.fillStyle = "#ffffff";
  ctx.font = fuente(700, 46);
  for (const [i, linea] of renglones(ctx, d.titulo, ANCHO - 140).slice(0, 2).entries()) {
    ctx.fillText(linea, 70, 170 + i * 56);
  }

  ctx.font = fuente(800, 170);
  ctx.fillText(d.heroe, 70, 390);
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.font = fuente(400, 30);
  ctx.fillText(d.heroePie, 70, 435);

  // Las cuentas.
  let y = 560;
  ctx.font = fuente(400, 32);
  for (const [nombre, valor] of d.filas) {
    ctx.fillStyle = "#5d6880";
    ctx.textAlign = "left";
    ctx.fillText(nombre, 70, y);
    ctx.fillStyle = "#0b0f1a";
    ctx.font = fuente(700, 32);
    ctx.textAlign = "right";
    ctx.fillText(valor, ANCHO - 70, y);
    ctx.textAlign = "left";
    ctx.font = fuente(400, 32);
    ctx.fillStyle = "#e3e8f2";
    ctx.fillRect(70, y + 18, ANCHO - 140, 1);
    y += 66;
  }

  // El remate, en una caja.
  y += 14;
  ctx.fillStyle = "#eef3ff";
  ctx.fillRect(70, y, ANCHO - 140, 170);
  y += 62;
  for (const [nombre, valor] of d.remate) {
    ctx.fillStyle = "#5d6880";
    ctx.font = fuente(400, 32);
    ctx.fillText(nombre, 100, y);
    ctx.fillStyle = "#0043ff";
    ctx.font = fuente(800, 36);
    ctx.textAlign = "right";
    ctx.fillText(valor, ANCHO - 100, y);
    ctx.textAlign = "left";
    y += 62;
  }

  // La aclaracion, que es lo que separa esta ficha de cualquier otra.
  y += 60;
  ctx.fillStyle = "#5d6880";
  ctx.font = fuente(400, 27);
  for (const linea of renglones(ctx, d.nota, ANCHO - 140)) {
    ctx.fillText(linea, 70, y);
    y += 38;
  }

  // Pie: quien la manda.
  ctx.fillStyle = "#ff1200";
  ctx.fillRect(0, ALTO - 130, ANCHO, 6);
  ctx.fillStyle = "#0b0f1a";
  ctx.font = fuente(700, 36);
  ctx.fillText(d.agente, 70, ALTO - 66);
  ctx.fillStyle = "#5d6880";
  ctx.font = fuente(400, 28);
  ctx.fillText([d.oficina, d.telefono].filter(Boolean).join(" · "), 70, ALTO - 28);

  return canvas;
}

export const nombreImagen = (titulo) =>
  `renta-${(titulo || "calculo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.png`;
