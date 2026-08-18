/* Las cuentas bancarias para cobrar.

   VIVEN EN EL TELÉFONO, NO EN EL REPO. El repositorio de esta app es público: cualquiera
   puede leer los archivos. Un objetivo de facturación publicado no le sirve a nadie, pero
   un número de cuenta sí — es la pieza que falta para hacerse pasar por el agente y
   mandarle a un cliente "cambió mi cuenta, transferí acá". Por eso se guardan como las
   preferencias de pantalla y nunca se suben.

   El costo es cargarlas una vez en cada aparato. Para un dato bancario, es barato. */

const CLAVE = "como-venimos:cuentas";

export const VACIA = { titular: "", banco: "", pesos: "", dolares: "", nota: "" };

/* Dos juegos: el propio y el de la oficina. Se elige cuál mandar en cada operación. */
export const POR_DEFECTO = {
  mia: { ...VACIA },
  remax: { ...VACIA },
};

export const CUALES = [
  { clave: "ninguna", nombre: "Sin cuenta" },
  { clave: "mia", nombre: "La mía" },
  { clave: "remax", nombre: "La de RE/MAX" },
];

const deposito = () => (typeof localStorage !== "undefined" ? localStorage : null);

const saneada = (c) => ({
  titular: String((c || {}).titular || "").trim(),
  banco: String((c || {}).banco || "").trim(),
  pesos: String((c || {}).pesos || "").trim(),
  dolares: String((c || {}).dolares || "").trim(),
  nota: String((c || {}).nota || "").trim(),
});

export function sanear(crudo) {
  const dato = crudo && typeof crudo === "object" ? crudo : {};
  return { mia: saneada(dato.mia), remax: saneada(dato.remax) };
}

export function leer(almacen) {
  const caja = almacen === undefined ? deposito() : almacen;
  if (!caja) return sanear(null);
  try {
    return sanear(JSON.parse(caja.getItem(CLAVE) || "{}"));
  } catch {
    return sanear(null);
  }
}

export function guardar(cuentas, almacen) {
  const caja = almacen === undefined ? deposito() : almacen;
  const limpio = sanear(cuentas);
  if (caja) {
    try {
      caja.setItem(CLAVE, JSON.stringify(limpio));
    } catch {
      // Sin lugar para guardar, la app tiene que seguir andando igual.
    }
  }
  return limpio;
}

/* Si tiene algo cargado. Una cuenta vacía no se ofrece: mandar un renglón que dice
   "Banco:" sin banco es peor que no mandar nada. */
export const tieneDatos = (c) =>
  Boolean(c && (c.titular || c.banco || c.pesos || c.dolares));

/* Los renglones para pegar abajo del texto que se le manda al cliente. */
export function comoTexto(cuenta) {
  const c = saneada(cuenta);
  if (!tieneDatos(c)) return [];
  const lineas = ["Para transferir:"];
  if (c.titular) lineas.push(c.titular);
  if (c.banco) lineas.push(c.banco);
  if (c.pesos) lineas.push(`Cuenta en pesos: ${c.pesos}`);
  if (c.dolares) lineas.push(`Cuenta en dólares: ${c.dolares}`);
  if (c.nota) lineas.push(c.nota);
  return lineas;
}
