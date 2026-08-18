/* Dibujo de gráficas, en SVG escrito a mano. Funciones puras: entran números, sale texto.

   Sin librerías a propósito — la app no tiene build step y una librería de gráficas pesa
   más que todo el resto junta. Y siendo texto, se pueden probar sin navegador. */

const ANCHO = 320;
const ALTO = 130;
const MARGEN = { arriba: 10, abajo: 8, lado: 4 };

const TONOS = ["var(--azul)", "var(--azul-medio)", "var(--azul-claro)"];

const numero = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

/* Una o varias curvas sobre la misma escala. Se usa para el mes a mes, y con más de una
   serie para superponer años: la escala tiene que ser común o la comparación miente. */
export function lineas(series, opciones = {}) {
  const campo = opciones.campo || "ganancia";
  const listas = (series || []).filter((s) => s && s.puntos && s.puntos.length);
  if (!listas.length) return "";

  const todos = listas.flatMap((s) => s.puntos.map((p) => p[campo] || 0));
  const tope = Math.max(...todos, 1);
  const cantidad = Math.max(...listas.map((s) => s.puntos.length));
  const util = ALTO - MARGEN.arriba - MARGEN.abajo;
  const paso = cantidad > 1 ? (ANCHO - MARGEN.lado * 2) / (cantidad - 1) : 0;

  const x = (i) => numero(MARGEN.lado + paso * i);
  const y = (v) => numero(MARGEN.arriba + util - (v / tope) * util);

  const cuerpo = listas
    .map((serie, indice) => {
      const color = serie.color || TONOS[indice % TONOS.length];
      const grosor = serie.destacada ? 2.6 : 1.6;
      const puntos = serie.puntos.map((p, i) => `${x(i)},${y(p[campo] || 0)}`).join(" ");
      const relleno = opciones.relleno && listas.length === 1
        ? `<polygon points="${x(0)},${numero(MARGEN.arriba + util)} ${puntos} ${x(serie.puntos.length - 1)},${numero(MARGEN.arriba + util)}"
             fill="${color}" opacity=".12"></polygon>`
        : "";
      const marcas = serie.destacada !== false && listas.length <= 2
        ? serie.puntos
            .map((p, i) => ((p[campo] || 0) > 0
              ? `<circle cx="${x(i)}" cy="${y(p[campo] || 0)}" r="2.4" fill="${color}"></circle>`
              : ""))
            .join("")
        : "";
      return `${relleno}<polyline points="${puntos}" fill="none" stroke="${color}"
        stroke-width="${grosor}" stroke-linejoin="round" stroke-linecap="round"></polyline>${marcas}`;
    })
    .join("");

  const piso = `<line x1="${MARGEN.lado}" y1="${numero(MARGEN.arriba + util)}"
    x2="${ANCHO - MARGEN.lado}" y2="${numero(MARGEN.arriba + util)}"
    stroke="var(--linea)" stroke-width="1"></line>`;

  return `<svg class="grafico-svg" viewBox="0 0 ${ANCHO} ${ALTO}" role="img"
    aria-label="${opciones.titulo || "gráfica"}" preserveAspectRatio="none">${piso}${cuerpo}</svg>`;
}

/* Una dona. Se dibuja con guiones sobre un círculo en vez de con arcos: no hace falta
   trigonometría y no hay forma de que salga un arco torcido por un redondeo. */
export function torta(filas, opciones = {}) {
  const campo = opciones.campo || "ganancia";
  const validas = (filas || []).filter((f) => (f[campo] || 0) > 0);
  const total = validas.reduce((t, f) => t + (f[campo] || 0), 0);
  if (!total) return "";

  const radio = 42;
  const circunferencia = 2 * Math.PI * radio;
  let corrido = 0;

  const anillos = validas
    .map((fila, i) => {
      const parte = (fila[campo] || 0) / total;
      const largo = numero(parte * circunferencia);
      const salto = numero(-corrido * circunferencia);
      corrido += parte;
      return `<circle cx="60" cy="60" r="${radio}" fill="none"
        stroke="${fila.color || TONOS[i % TONOS.length]}" stroke-width="16"
        stroke-dasharray="${largo} ${numero(circunferencia)}"
        stroke-dashoffset="${salto}" transform="rotate(-90 60 60)"></circle>`;
    })
    .join("");

  return `<svg class="grafico-torta" viewBox="0 0 120 120" role="img"
    aria-label="${opciones.titulo || "reparto"}">${anillos}</svg>`;
}

/* Reparte tonos de la paleta entre las filas, dejando la cola en gris: con cuarenta
   barrios, cuarenta colores distintos no se distinguen y no dicen nada. */
export function colorear(filas, cuantas = 5) {
  const paleta = ["var(--azul)", "var(--azul-medio)", "var(--azul-claro)",
    "var(--azul-suave)", "var(--tinta-2)"];
  return (filas || []).map((fila, i) => ({
    ...fila,
    color: i < cuantas ? paleta[i % paleta.length] : "var(--linea)",
  }));
}

/* Junta la cola larga en una fila "otros", para que la torta y la lista sean legibles. */
export function agruparCola(filas, cuantas = 5, campo = "ganancia") {
  const lista = [...(filas || [])].sort((a, b) => (b[campo] || 0) - (a[campo] || 0));
  if (lista.length <= cuantas + 1) return lista;
  const cabeza = lista.slice(0, cuantas);
  const cola = lista.slice(cuantas);
  const sumar = (llave) => cola.reduce((t, f) => t + (f[llave] || 0), 0);
  return [
    ...cabeza,
    {
      nombre: `otros ${cola.length}`,
      negocios: sumar("negocios"),
      propiedades: sumar("propiedades"),
      facturacion: sumar("facturacion"),
      ganancia: sumar("ganancia"),
      esCola: true,
    },
  ];
}
