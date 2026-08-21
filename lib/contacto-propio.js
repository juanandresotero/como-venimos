/* El teléfono de Juan. VIVE EN EL TELÉFONO, NO EN EL REPO.

   Estaba en `datos/ajustes.json`, que es público. Su teléfono solo no es un secreto —es el
   de trabajo, está en su perfil de RE/MAX— pero **publicado JUNTO A sus cierres, sus
   comisiones y sus fechas** es otra cosa: es el material exacto para una estafa dirigida.
   Alguien que lo llama sabiendo que cerró Flammarion y por cuánto tiene la mitad del trabajo
   hecho.

   Se guarda igual que las cuentas bancarias: en el aparato, y se carga una vez en cada uno.
   Para un dato así, es barato.

   OJO: lo que ya se subió sigue en el historial de GitHub. Sacarlo de acá evita que aparezca
   en el archivo de hoy —que es lo que encuentra cualquiera que mire el repo— pero no reescribe
   el pasado. Reescribir el historial de un repo publicado es peligroso y no vale la pena por
   un teléfono de trabajo. */

const CLAVE = "como-venimos:contacto";

export const VACIO = { telefono: "" };

export function leer(deposito = globalThis.localStorage) {
  try {
    const crudo = deposito && deposito.getItem(CLAVE);
    if (!crudo) return { ...VACIO };
    const leido = JSON.parse(crudo);
    return { ...VACIO, ...(leido && typeof leido === "object" ? leido : {}) };
  } catch {
    return { ...VACIO };
  }
}

export function guardar(datos, deposito = globalThis.localStorage) {
  if (!deposito) return false;
  try {
    deposito.setItem(CLAVE, JSON.stringify({ ...VACIO, ...datos }));
    return true;
  } catch {
    return false;
  }
}

/* El teléfono que va en la ficha del cliente y en la carta oferta.

   Cae al de `ajustes` si todavía no se cargó en este aparato: sin eso, el día del cambio la
   ficha saldría sin teléfono y nadie se enteraría hasta que un cliente no pueda llamar. Ese
   respaldo desaparece solo en cuanto Juan lo carga acá. */
export function telefonoPropio(ajustes, deposito) {
  const guardado = leer(deposito).telefono;
  if (guardado) return guardado;
  return ((ajustes || {}).agente || {}).telefono || "";
}
