/* Numeros a palabras, en castellano.

   Existe porque la carta oferta escribe el precio y los plazos DOS veces: en letras y en
   cifras. Es lo que hace el usuario a mano ("ciento treinta y cuatro mil dolares
   estadounidenses (U$S 134.000)") y lo que evita el desacuerdo clasico entre lo que dice
   la letra y lo que dice el numero — que en un documento que obliga no es un detalle. */

const HASTA_29 = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho",
  "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
  "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés",
  "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];

const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta",
  "ochenta", "noventa"];

const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
  "seiscientos", "setecientos", "ochocientos", "novecientos"];

/* El uno se acorta cuando va pegado a "mil" o a "millones": veintiun mil, no veintiuno
   mil. Es de lo primero que delata un texto armado por una maquina. */
function apocopar(texto) {
  if (texto === "uno") return "un";
  if (texto.endsWith("veintiuno")) return `${texto.slice(0, -9)}veintiún`;
  if (texto.endsWith(" uno")) return `${texto.slice(0, -4)} un`;
  return texto;
}

function hasta999(n) {
  if (n < 30) return HASTA_29[n];
  if (n < 100) {
    const decena = Math.floor(n / 10);
    const unidad = n % 10;
    return unidad ? `${DECENAS[decena]} y ${HASTA_29[unidad]}` : DECENAS[decena];
  }
  if (n === 100) return "cien";
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  return resto ? `${CENTENAS[centena]} ${hasta999(resto)}` : CENTENAS[centena];
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
