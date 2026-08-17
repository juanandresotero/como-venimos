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

export function pct(n) {
  if (!hayValor(n)) return "—";
  return `${(n * 100).toFixed(1).replace(".", ",")}%`;
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
