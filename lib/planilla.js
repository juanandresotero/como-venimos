/* Bajar todo a una planilla, para el día que haya que mirar los datos fuera de la app.

   Es un CSV, no un .xlsx: un .xlsx obligaría a meter una librería grande de JavaScript
   para escribir un formato comprimido, cuando Excel abre un CSV con doble clic.

   Dos detalles que hacen que abra bien en Excel en español y no en una sola columna:
   el separador es punto y coma, y el archivo arranca con el BOM de UTF-8, sin el cual
   "Maroñas" se ve roto. */

const BOM = "﻿";
const SEPARADOR = ";";

/* Excel decide solo qué es cada celda, y a veces se equivoca feo: una dirección como
   "-Gutenberg 6100" la toma por fórmula. Entrecomillar y neutralizar el arranque lo evita. */
export function celda(valor) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return String(valor).replace(".", ",");
  const texto = typeof valor === "boolean" ? (valor ? "sí" : "no") : String(valor);
  const peligroso = /^[=+\-@\t\r]/.test(texto);
  return `"${(peligroso ? `'${texto}` : texto).replace(/"/g, '""')}"`;
}

export function aCsv(columnas, filas) {
  const cabecera = columnas.map((c) => celda(c.nombre)).join(SEPARADOR);
  const cuerpo = filas.map((fila) =>
    columnas.map((c) => celda(c.valor(fila))).join(SEPARADOR)
  );
  return BOM + [cabecera, ...cuerpo].join("\r\n") + "\r\n";
}

const COLUMNAS_NEGOCIOS = [
  { nombre: "Id", valor: (n) => n.id },
  { nombre: "Tipo", valor: (n) => n.tipo_negocio },
  { nombre: "Estado", valor: (n) => n.estado },
  { nombre: "Dirección", valor: (n) => n.direccion },
  { nombre: "Barrio", valor: (n) => n.barrio },
  { nombre: "Se publicó", valor: (n) => n.fecha_inicio },
  { nombre: "Pasó a negociación", valor: (n) => n.fecha_negociacion },
  { nombre: "Quedó reservada", valor: (n) => n.fecha_boleto },
  { nombre: "Cerró y cobraste", valor: (n) => n.fecha_fin },
  { nombre: "Precio", valor: (n) => n.precio_operacion },
  { nombre: "% comisión", valor: (n) => n.pct_comision_total },
  { nombre: "Puntas", valor: (n) => n.puntas },
  { nombre: "Comisión total", valor: (n) => n.base },
  { nombre: "Facturación RE/MAX", valor: (n) => n.facturacion },
  { nombre: "Ganancia", valor: (n) => n.ganancia },
  { nombre: "Cómo llegó", valor: (n) => n.origen_captacion },
  { nombre: "Regla de comisión", valor: (n) => n.regimen_comision },
  { nombre: "Es suplencia", valor: (n) => Boolean(n.es_suplencia) },
  { nombre: "La referí yo", valor: (n) => Boolean(n.yo_referi) },
  { nombre: "Tenía el aviso", valor: (n) => n.agente_vende },
  { nombre: "Trajo al comprador", valor: (n) => n.agente_compra },
  { nombre: "Me lo refirió", valor: (n) => n.referidor },
  { nombre: "Se lo referí a", valor: (n) => n.referido_a },
  { nombre: "Categoría", valor: (n) => n.categoria_vigente },
  { nombre: "Cliente vendedor", valor: (n) => (n.cliente_vendedor || {}).nombre },
  { nombre: "Teléfono vendedor", valor: (n) => (n.cliente_vendedor || {}).telefono },
  { nombre: "Cliente comprador", valor: (n) => (n.cliente_comprador || {}).nombre },
  { nombre: "Teléfono comprador", valor: (n) => (n.cliente_comprador || {}).telefono },
  { nombre: "Notas", valor: (n) => n.notas },
];

const COLUMNAS_CARTERA = [
  { nombre: "Dirección", valor: (p) => p.direccion },
  { nombre: "Barrio", valor: (p) => p.barrio },
  { nombre: "Operación", valor: (p) => p.operacion },
  { nombre: "Tipo", valor: (p) => p.tipo },
  { nombre: "Precio", valor: (p) => p.precio },
  { nombre: "Estado", valor: (p) => (p.activa ? p.estado : "fuera de cartera") },
  { nombre: "Captada el", valor: (p) => p.fecha_captacion_real },
  { nombre: "Fecha estimada", valor: (p) => Boolean(p.fecha_captacion_estimada) },
  { nombre: "De dónde salió", valor: (p) => p.origen_captacion },
  { nombre: "La vio el robot", valor: (p) => p.visto_primera_vez },
  { nombre: "Pasó a negociación", valor: (p) => p.fecha_negociacion },
  { nombre: "Quedó reservada", valor: (p) => p.fecha_reservada },
  { nombre: "Dejó de publicarse", valor: (p) => p.fecha_desaparicion },
  { nombre: "Desenlace", valor: (p) => p.desenlace_confirmado || p.desenlace_propuesto },
  { nombre: "Entra en la proyección", valor: (p) => p.usar_en_proyeccion !== false },
  { nombre: "Dormitorios", valor: (p) => p.dormitorios },
  { nombre: "Baños", valor: (p) => p.banos },
  { nombre: "m² cubiertos", valor: (p) => p.m2_cubierto },
  { nombre: "Link", valor: (p) => p.link },
  { nombre: "Notas", valor: (p) => p.notas },
];

export const negociosACsv = (negocios) =>
  aCsv(COLUMNAS_NEGOCIOS, [...(negocios || [])]
    .sort((a, b) => (b.fecha_fin || "").localeCompare(a.fecha_fin || "")));

export const carteraACsv = (cartera) =>
  aCsv(COLUMNAS_CARTERA, Object.values(cartera || {})
    .sort((a, b) => (a.direccion || "").localeCompare(b.direccion || "")));

export const nombrePlanilla = (que, hoy) => `como-venimos-${que}-${hoy}.csv`;
