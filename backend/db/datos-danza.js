/*
  Datos del catálogo de EJEMPLO de Octavo Compás.
  Los usan seed-danza.js (base de datos) y scripts/construir-demo.js (artefacto).
*/

const MARCA = "Octavo Compás";

const COLORES = {
  Negro: "#1f1b22",
  Blanco: "#f4f1ee",
  "Rosa ballet": "#e9c6cf",
  Lila: "#b9a3cf",
  Bordó: "#6d1f35",
  Fucsia: "#a3246f",
  Champagne: "#dccaa8",
  "Azul noche": "#232a4a",
  Rojo: "#a3201f",
  Celeste: "#a9c7e3"
};

/* Slugs fijos: el hero de la home los usa (frontend/js/inicio.js) */
const CATEGORIAS = [
  { nombre: "Danza", slug: "danza", hijas: [
    ["Ballet", "ballet"], ["Contemporáneo", "contemporaneo"], ["Folklore", "folklore"], ["Tango", "tango"]
  ] },
  { nombre: "Fiesta y gala", slug: "fiesta-y-gala", hijas: [["Reinas 2026", "reinas-2026"]] }
];

const ADULTO = ["XS", "S", "M", "L", "XL"];
const NENA = ["6", "8", "10", "12", "14"];

/* [nombre, slug, categoría, precio, oferta, colores, talles, destacado, descripción] */
const PRODUCTOS = [
  ["Malla clásica de breteles", "malla-clasica-de-breteles", "ballet", 32900, null,
    ["Negro", "Rosa ballet", "Celeste"], [...NENA, ...ADULTO.slice(0, 4)], true,
    "Malla de lycra suplex con breteles finos y espalda baja. Calce firme para clase y examen."],
  ["Falda de gasa con lazo", "falda-de-gasa-con-lazo", "ballet", 18900, null,
    ["Negro", "Rosa ballet", "Lila"], ["U"], true,
    "Falda corta de gasa liviana que se ata a la cintura. Un talle que se ajusta a todos."],
  ["Tutú plato de ensayo", "tutu-plato-de-ensayo", "ballet", 54900, 47900,
    ["Blanco", "Rosa ballet"], ["S", "M", "L"], false,
    "Tutú plato de tul rígido con aro y bombacha de lycra. Para ensayo y muestras."],
  ["Malla manga larga", "malla-manga-larga", "contemporaneo", 34900, null,
    ["Negro", "Bordó", "Azul noche"], ADULTO, true,
    "Malla de manga larga en lycra mate, escote redondo. Acompaña cada movimiento."],
  ["Pantalón palazzo de modal", "pantalon-palazzo-de-modal", "contemporaneo", 29900, null,
    ["Negro", "Champagne"], ADULTO, false,
    "Palazzo de modal con cintura elástica ancha. Fluido, liviano y cómodo para el piso."],
  ["Top cruzado de lycra", "top-cruzado-de-lycra", "contemporaneo", 21900, null,
    ["Negro", "Lila", "Bordó"], ADULTO, false,
    "Top con frente cruzado y espalda nadadora. Sostén suave para clase."],
  ["Pollera de folklore de tres volados", "pollera-de-folklore-de-tres-volados", "folklore", 69900, 59900,
    ["Rojo", "Azul noche", "Blanco"], ["S", "M", "L"], true,
    "Pollera de vuelo completo con tres volados y puntilla. Se confecciona también en otros colores."],
  ["Camisa paisana con puntilla", "camisa-paisana-con-puntilla", "folklore", 42900, null,
    ["Blanco", "Champagne"], ADULTO, false,
    "Camisa de algodón con cuello alto y puntilla en pechera y puños."],
  ["Chaleco de gaucho bordado", "chaleco-de-gaucho-bordado", "folklore", 46900, null,
    ["Negro", "Bordó"], ADULTO, false,
    "Chaleco de gabardina con bordado al frente. Para cuadros de malambo y zamba."],
  ["Vestido de tango con tajo", "vestido-de-tango-con-tajo", "tango", 89900, null,
    ["Negro", "Rojo"], ["S", "M", "L"], true,
    "Vestido de jersey con tajo lateral y espalda descubierta. Pensado para girar."],
  ["Falda de tango asimétrica", "falda-de-tango-asimetrica", "tango", 52900, null,
    ["Negro", "Bordó"], ["S", "M", "L"], false,
    "Falda de crepe con ruedo asimétrico y forro de lycra."],
  ["Vestido largo de satén", "vestido-largo-de-saten", "fiesta-y-gala", 129900, null,
    ["Lila", "Champagne", "Azul noche"], ["S", "M", "L"], true,
    "Vestido largo de satén con breteles finos y caída al bies."],
  ["Vestido corto con pedrería", "vestido-corto-con-pedreria", "fiesta-y-gala", 99900, 89900,
    ["Negro", "Fucsia"], ["S", "M", "L"], false,
    "Vestido corto de tul con aplicaciones de pedrería en el escote."],
  ["Vestido de gala bordado Reina", "vestido-de-gala-bordado-reina", "reinas-2026", 289900, null,
    ["Champagne", "Blanco"], ["S", "M", "L"], true,
    "Vestido de gala con corset bordado a mano, pedrería y falda de tul. Se confecciona a medida."],
  ["Capa de tul bordada", "capa-de-tul-bordada", "reinas-2026", 119900, null,
    ["Champagne", "Blanco"], ["U"], false,
    "Capa larga de tul con bordado en hombros. Acompaña el vestido de gala."]
];

function slugify(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

module.exports = { MARCA, COLORES, CATEGORIAS, ADULTO, NENA, PRODUCTOS, slugify };
