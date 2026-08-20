/* Homogeneizar los metros de una propiedad.

   No todos los metros valen lo mismo. Cien metros de living no son cien metros de patio ni
   cien metros de galpón, y para comparar dos propiedades hay que llevarlas todas a una misma
   moneda: los METROS HOMOGENEIZADOS.

   La cuenta es una suma con pesos:

     construido           cuenta entero, es la referencia
     semiconstruido       cuenta un 40%   (una terraza techada, una barbacoa)
     otras construcciones cuenta un 15%   (un galpón, un depósito)
     patio                cuenta un 25%   (lo que queda del padrón sin construir)

   Los porcentajes son los que usa Juan y se pueden cambiar en la pantalla: cada tasador
   tiene los suyos y cambian con la zona.

   EL PATIO NO SE CARGA: sale de restar. Es lo que queda del padrón después de sacarle todo
   lo que está construido. Se calcula solo para que no haya que medirlo ni pueda quedar mal
   sumado. */

export const POR_DEFECTO = { semi: 0.4, otras: 0.15, patio: 0.25 };

const numero = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const fraccion = (x, siNo) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : siNo;
};

export function homogeneizar(medidas = {}, pesos = {}) {
  const padron = numero(medidas.padron);
  const construido = numero(medidas.construido);
  const semi = numero(medidas.semi);
  const otras = numero(medidas.otras);

  const pctSemi = fraccion(pesos.semi, POR_DEFECTO.semi);
  const pctOtras = fraccion(pesos.otras, POR_DEFECTO.otras);
  const pctPatio = fraccion(pesos.patio, POR_DEFECTO.patio);

  /* Lo que pisa el terreno. El patio es lo que sobra.

     OJO CON DOS PLANTAS: acá se resta lo CONSTRUIDO, que en una casa de dos pisos es más que
     lo que la casa pisa. En ese caso el patio calculado queda corto — y si da negativo, se
     avisa en pantalla en vez de mostrar un número inventado. */
  const ocupado = construido + semi + otras;
  const patio = Math.max(0, padron - ocupado);

  const partes = [
    { clave: "construido", nombre: "Construido", m2: construido, peso: 1 },
    { clave: "semi", nombre: "Semiconstruido", m2: semi, peso: pctSemi },
    { clave: "otras", nombre: "Otras construcciones", m2: otras, peso: pctOtras },
    { clave: "patio", nombre: "Patio", m2: patio, peso: pctPatio },
  ].map((p) => ({ ...p, computa: p.m2 * p.peso }));

  return {
    total: partes.reduce((n, p) => n + p.computa, 0),
    patio,
    partes: partes.filter((p) => p.m2 > 0),
    /* Lo construido no entra en el padrón: o hay más de una planta, o algún número está mal. */
    seExcede: padron > 0 && ocupado > padron,
    hayDatos: padron > 0 || ocupado > 0,
  };
}
