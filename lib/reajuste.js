/* El reajuste anual de un alquiler.

   Un alquiler se reajusta UNA VEZ AL AÑO, el mes en que el contrato cumple año. La cuenta
   es una multiplicación; lo que tiene miga es de dónde sale el número por el que se
   multiplica y si ese número existe todavía.

   Dos caminos, y la ley decide cuál:
     - Permiso de construcción ANTERIOR al 2/6/1968 → coeficiente legal, obligatorio.
     - Desde esa fecha → libre contratación: manda lo que diga el contrato, casi siempre IPC.

   Los índices los deja el robot en datos/indices.json, ya cruzados contra tres fuentes.
   Acá solo se elige el mes y se multiplica. */

export const TIPOS = [
  {
    clave: "coeficiente",
    nombre: "Coeficiente",
    cuando: "Obligatorio si el permiso de construcción es anterior al 2/6/1968.",
  },
  {
    clave: "ipc",
    nombre: "IPC",
    cuando: "Para todo lo demás, si el contrato lo dice.",
  },
];

export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

/* "2026-08" a partir de una fecha "2026-08-18". */
export const mesDe = (fecha) => String(fecha || "").slice(0, 7);

/* "agosto 2026" para mostrar. */
export function nombreDelMes(mes) {
  const numero = Number(String(mes || "").slice(5, 7));
  if (!numero || numero < 1 || numero > 12) return "";
  return `${MESES[numero - 1]} ${String(mes).slice(0, 4)}`;
}

/* Los meses que hay, del más nuevo al más viejo. */
export function mesesConDato(indices, tipo) {
  const meses = (indices || {}).meses || {};
  return Object.keys(meses).filter((m) => meses[m] && meses[m][tipo]).sort().reverse();
}

/* El índice que corresponde a un mes, o el último que haya si ese todavía no salió.

   El índice de un mes se publica sobre el arranque de ese mismo mes, así que si alguien
   abre esto el día 2 puede no estar. En vez de dejarlo sin nada se devuelve el último
   publicado, marcado como `alDia: false` — el usuario decide si manda igual, y el texto
   que se le copia lo aclara solo. */
export function buscar(indices, mes, tipo) {
  const meses = (indices || {}).meses || {};
  const pedido = meses[mes];

  if (pedido && pedido[tipo]) {
    return {
      valor: pedido[tipo],
      mes,
      alDia: true,
      verificado: pedido.verificado !== false,
      avisos: pedido.avisos || [],
    };
  }

  // El más reciente ANTERIOR al pedido. Uno posterior no sirve: sería cobrarle de más.
  const previo = mesesConDato(indices, tipo).find((m) => m < mes);
  if (!previo) {
    return { valor: null, mes: null, pedido: mes, alDia: false, verificado: false, avisos: [] };
  }
  return {
    valor: meses[previo][tipo],
    mes: previo,
    pedido: mes,
    alDia: false,
    verificado: meses[previo].verificado !== false,
    avisos: meses[previo].avisos || [],
  };
}

/* La cuenta. El índice viene como 1,0427 y quiere decir "sube 4,27%". */
export function calcular(monto, indice) {
  const actual = Number(monto) || 0;
  const factor = Number(indice) || 0;
  if (!actual || !factor) return null;
  const nuevo = actual * factor;
  return {
    actual,
    nuevo,
    aumento: nuevo - actual,
    pct: factor - 1,
  };
}

/* ---------- Lo que se le manda al inquilino ---------- */

const MONEDAS = { UYU: "$", USD: "USD" };

const plata = (n, moneda) =>
  `${MONEDAS[moneda] || "$"} ${Math.round(n || 0).toLocaleString("es-UY")}`;

const porciento = (n) =>
  `${String(Number(((n || 0) * 100).toFixed(2))).replace(".", ",")}%`;

/* El texto para copiar y mandarle al inquilino.

   Cuando el índice del mes todavía no salió, el texto lo dice y llama al número
   "estimado" en los tres lugares donde aparece. No alcanza con una aclaración al final:
   el que lee ve el monto en negrita y se queda con ese. */
export function textoParaElCliente({ cuenta, moneda, tipo, indice, titulo }) {
  if (!cuenta || !indice || !indice.valor) return "";
  const estimado = !indice.alDia;
  const comoSeLlama = tipo === "ipc" ? "IPC" : "coeficiente de reajuste";

  const lineas = ["*Reajuste de alquiler*"];
  if (titulo) lineas.push(titulo);
  lineas.push("");
  lineas.push(`Alquiler actual: ${plata(cuenta.actual, moneda)}`);
  lineas.push(
    `Ajuste por ${comoSeLlama} de ${nombreDelMes(indice.mes)}: ${porciento(cuenta.pct)}`
  );
  lineas.push("");
  lineas.push(
    estimado
      ? `*Nuevo alquiler estimado: ${plata(cuenta.nuevo, moneda)}*`
      : `*Nuevo alquiler: ${plata(cuenta.nuevo, moneda)}*`
  );

  if (estimado) {
    lineas.push("");
    lineas.push(
      `El índice de ${nombreDelMes(indice.pedido)} todavía no se publicó, así que este `
      + `monto sale del último dato disponible. En unos días sale el definitivo y te `
      + `confirmo el monto exacto.`
    );
  }
  return lineas.join("\n");
}
