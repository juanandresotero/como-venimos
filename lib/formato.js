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
