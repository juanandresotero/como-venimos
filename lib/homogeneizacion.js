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

   EL PATIO SE CALCULA SOLO, pero se puede escribir. Por defecto es lo que queda del padrón
   después de sacarle todo lo construido, así no hay que medirlo ni puede quedar mal sumado.
   Pero en una casa de dos plantas eso no sirve —se construyen más metros de los que se
   pisan— y ahí conviene borrar el padrón y poner el patio a mano. El que se escribe manda. */

export const POR_DEFECTO = { semi: 0.4, otras: 0.15, patio: 0.25 };

const numero = (x) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const fraccion = (x, siNo) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : siNo;
};

/* Si el campo tiene algo escrito. Un cero escrito NO es lo mismo que un campo vacío: "no
   tiene patio" es un dato, y "no lo cargué" es otra cosa. */
const dado = (x) => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x));

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
  const patioCalculado = Math.max(0, padron - ocupado);
  const patioAMano = dado(medidas.patio);
  const patio = patioAMano ? numero(medidas.patio) : patioCalculado;

  const partes = [
    { clave: "construido", nombre: "Construido", m2: construido, peso: 1 },
    { clave: "semi", nombre: "Semiconstruido", m2: semi, peso: pctSemi },
    { clave: "otras", nombre: "Otras construcciones", m2: otras, peso: pctOtras },
    { clave: "patio", nombre: "Patio", m2: patio, peso: pctPatio },
  ].map((p) => ({ ...p, computa: p.m2 * p.peso }));

  const total = partes.reduce((n, p) => n + p.computa, 0);
  const valorM2 = numero(medidas.valor_m2);

  return {
    total,
    patio,
    patioCalculado,
    patioAMano,
    /* Si hay padrón cargado, el patio se puede deducir y conviene mostrarlo de guía. */
    padronParaElPatio: padron > 0,
    partes: partes.filter((p) => p.m2 > 0),
    /* Lo construido no entra en el padrón: o hay más de una planta, o algún número está mal.
       Sólo molesta cuando el patio sale del padrón; si se escribió a mano, el padrón ya no
       se usa para nada y no hay nada que avisar. */
    seExcede: !patioAMano && padron > 0 && ocupado > padron,
    /* Lo que vale la propiedad: los metros homogeneizados por el precio del metro. */
    valorM2,
    valor: total * valorM2,
    hayDatos: padron > 0 || ocupado > 0 || patio > 0,
  };
}
