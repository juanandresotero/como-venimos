/* Formateo para lectura rapida en un celular, con las convenciones de Uruguay:
   punto para los miles, coma para los decimales. */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun",
               "jul", "ago", "sep", "oct", "nov", "dic"];

const hayValor = (n) => n !== null && n !== undefined && !Number.isNaN(n);

export function plata(n) {
  if (!hayValor(n)) return "—";
  return Math.round(n).toLocaleString("es-UY");
}

export function plataUSD(n) {
  if (!hayValor(n)) return "—";
  return `USD ${plata(n)}`;
}

/* El camino de vuelta: de lo que el usuario escribe al numero.

   Un <input type="number"> no deja poner los puntos de miles, asi que los montos van en
   un campo de texto que se muestra formateado ("100.000") y se lee de vuelta con esto.
   En Uruguay el punto separa los miles y la coma los decimales. */
export function numeroDesde(texto) {
  if (texto === null || texto === undefined) return null;
  const limpio = String(texto).trim().replace(/\./g, "").replace(",", ".").replace(/\s/g, "");
  if (limpio === "") return null;
  const valor = Number(limpio);
  return Number.isFinite(valor) ? valor : null;
}

/* Para las graficas, donde no entra el numero completo. */
export function compacto(n) {
  if (!hayValor(n)) return "—";
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  const miles = n / 1000;
  // Arriba de 100k la decimal no aporta y ocupa lugar.
  const texto = abs >= 100000 ? String(Math.round(miles)) : miles.toFixed(1);
  return `${texto.replace(".", ",")}k`;
}

/* Un decimal alcanza para un avance o un reparto. Para una comision que se le dice a un
   cliente NO: entre 2,3% y 2,31% hay plata, y es el numero que se negocia. */
export function pct(n, decimales = 1) {
  if (!hayValor(n)) return "—";
  return `${(n * 100).toFixed(decimales).replace(".", ",")}%`;
}

export function fechaCorta(iso, anioActual) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-").map(Number);
  const base = `${d} ${MESES[m - 1]}`;
  // El año solo se muestra cuando no es obvio, para no repetirlo en toda la lista.
  return anioActual && a !== anioActual ? `${base} ${String(a).slice(2)}` : base;
}

/* Un <input type="date"> dispara "change" MIENTRAS se tipea. Si el año todavía va por la
   mitad manda cosas como "0001-09-01", que es una fecha perfectamente válida y pasa
   cualquier control ingenuo.

   Ya pasó de verdad: al cargar desde cuándo era la categoría quedó guardado el año 0001.
   Una fecha así puede dejar un negocio fuera de todos los años, o dejar sin categoría
   vigente a todo 2026 y hacer desaparecer la ganancia sin avisar. */
export function fechaRazonable(iso) {
  if (!iso) return true;   // vacío es válido: quiere decir "todavía no sé"
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!partes) return false;
  const anio = Number(partes[1]);
  return anio >= 2000 && anio <= 2100;
}

export function diasEntre(desde, hasta) {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function mes(iso) {
  return Number(iso.split("-")[1]);
}

/* Las direcciones y barrios salen del Excel del usuario. Nada garantiza que no traigan
   un "<" o un "&", asi que se escapan antes de meterlos en el HTML. */
export function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

/* ---------- Separador de miles MIENTRAS se escribe ---------- */

/* Cuantos digitos enteros tiene que haber antes de empezar a separar. Con 3 o menos no
   hace falta: "999" se lee igual que "999". Desde 4 ya cuesta. */
const DIGITOS_PARA_SEPARAR = 4;

/* Formatea lo que hay escrito sin tocar lo que el usuario todavia esta tipeando.

   Solo se mete con la parte entera: si esta escribiendo "1234,5" la coma y lo que sigue
   quedan como estan. Y si el campo esta vacio o arranca con coma, se devuelve igual —
   corregirle la mano a alguien que esta escribiendo es peor que no formatear nada. */
export function separarMiles(texto) {
  const crudo = String(texto ?? "");
  if (!crudo) return crudo;

  const negativo = crudo.trim().startsWith("-");
  const partes = crudo.replace(/^-/, "").split(",");
  const enteros = partes[0].replace(/\D/g, "");
  if (enteros.length < DIGITOS_PARA_SEPARAR) {
    // Igual hay que limpiar puntos viejos: si borro un digito de "1.000" queda "100" y no "1.00".
    const limpio = enteros + (partes.length > 1 ? `,${partes.slice(1).join("")}` : "");
    return (negativo ? "-" : "") + limpio;
  }

  const conPuntos = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimales = partes.length > 1 ? `,${partes.slice(1).join("").replace(/\D/g, "")}` : "";
  return (negativo ? "-" : "") + conPuntos + decimales;
}

/* Deja el cursor donde estaba, contando digitos y no posiciones.

   Reformatear mueve el texto: si en "1234" con el cursor en el medio se inserta un punto,
   el cursor queda una posicion corrida y se escribe todo al reves. Contar cuantos digitos
   hay a la izquierda es lo unico que no se rompe cuando aparecen o desaparecen puntos. */
export function posicionTrasFormatear(textoNuevo, digitosALaIzquierda) {
  let vistos = 0;
  for (let i = 0; i < textoNuevo.length; i += 1) {
    if (/\d/.test(textoNuevo[i])) {
      vistos += 1;
      if (vistos === digitosALaIzquierda) return i + 1;
    }
  }
  return vistos >= digitosALaIzquierda ? textoNuevo.length : textoNuevo.length;
}

export const digitosHasta = (texto, corte) =>
  (String(texto ?? "").slice(0, corte).match(/\d/g) || []).length;

/* Engancha el formateo en vivo a un campo de texto. Se usa en TODA la app: los montos se
   leen con los puntos puestos, no despues de saltar a la celda siguiente. */
export function formatearMientrasEscribe(campo) {
  campo.addEventListener("input", () => {
    const antes = campo.value;
    const digitos = digitosHasta(antes, campo.selectionStart);
    const despues = separarMiles(antes);
    if (despues === antes) return;
    campo.value = despues;
    // Un campo que no esta enfocado no tiene cursor que mover, y tocarlo lo roba.
    if (document.activeElement === campo) {
      const donde = posicionTrasFormatear(despues, digitos);
      campo.setSelectionRange(donde, donde);
    }
  });
  return campo;
}
