/* Los niveles de RE/MAX.

   Hay DOS objetivos distintos y la app tiene que tenerlos separados:

     - El personal, el que se carga en Ajustes. Es el que uno se pone.
     - Estos, que no los pone nadie: son escalones de facturación de RE/MAX, y al pisar
       uno te corresponde el nombre. No se negocian y son los mismos para todos.

   Van sobre la FACTURACIÓN del año —lo que factura la oficina, no lo que queda en el
   bolsillo— y sobre lo COBRADO: un negocio en negociación todavía no factura nada.

   Detalle que vale la pena mirar: el objetivo personal de 65.000 cae justo en Executive.
   No es casualidad, y la app lo señala cuando pasa. */

export const NIVELES = [
  { nombre: "Rookie", desde: 30000 },
  { nombre: "Executive", desde: 65000 },
  { nombre: "Club 100%", desde: 100000 },
  { nombre: "Platinum", desde: 150000 },
  { nombre: "Chairman's Club", desde: 225000 },
  { nombre: "Titan", desde: 300000 },
  { nombre: "Diamond", desde: 400000 },
];

/* En qué nivel estás y cuánto falta para el que sigue.

   Debajo del primer escalón todavía no hay nivel: `actual` viene en null y el que sigue
   es Rookie. Arriba del último no hay siguiente y `falta` viene en null — no se inventa
   un escalón que no existe. */
export function nivelDe(facturacion) {
  const total = Number(facturacion) || 0;

  const alcanzados = NIVELES.filter((n) => total >= n.desde);
  const actual = alcanzados.length ? alcanzados[alcanzados.length - 1] : null;
  const siguiente = NIVELES.find((n) => total < n.desde) || null;

  return {
    facturacion: total,
    actual,
    siguiente,
    falta: siguiente ? siguiente.desde - total : null,
    // Cuánto del tramo entre un escalón y el que sigue está cubierto, para la barra.
    avance: tramoCubierto(total, actual, siguiente),
    esElUltimo: !siguiente,
  };
}

/* La barra no va de cero: va del escalón anterior al siguiente.

   Con 145.000 sobre un objetivo de 150.000 una barra desde cero se ve casi llena y no
   dice nada; desde el escalón anterior (100.000) se ve que falta poco de ESE tramo, que
   es la pregunta real. */
function tramoCubierto(total, actual, siguiente) {
  if (!siguiente) return 1;
  const piso = actual ? actual.desde : 0;
  const techo = siguiente.desde;
  if (techo <= piso) return 0;
  return Math.max(0, Math.min(1, (total - piso) / (techo - piso)));
}

/* Si el objetivo personal cae justo en un escalón, decirlo: son la misma meta contada
   de dos maneras y mostrarlas como dos cosas distintas confunde. */
export function nivelDelObjetivo(objetivo) {
  const monto = Number(objetivo) || 0;
  return NIVELES.find((n) => n.desde === monto) || null;
}
