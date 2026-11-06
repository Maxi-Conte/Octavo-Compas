/*
  Catálogo de EJEMPLO de Octavo Compás (danza, fiesta y gala).
  Sirve para ver el sitio armado mientras se cargan los productos reales.

  npm run db:seed:danza
  npm run db:seed:danza -- --ocultar-demo   (además desactiva las categorías
                                             y productos genéricos del seed original)

  - No borra nada: crea lo que falta y saltea lo que ya existe (por slug).
  - "--ocultar-demo" solo marca como inactivos (activo = FALSE) los productos
    de marca "Tu Marca" y las categorías mujer / hombre / accesorios.
    Se pueden volver a activar desde el panel.
*/

const { pool, transaccion } = require("./database");

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

function stockAzar() {
  return Math.random() < 0.15 ? 0 : Math.floor(Math.random() * 6) + 1;
}

function slugify(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function seedDanza() {
  const ocultarDemo = process.argv.includes("--ocultar-demo");
  let creados = 0;

  try {
    await transaccion(async (cliente) => {
      const ids = {};

      for (const [i, cat] of CATEGORIAS.entries()) {
        const padre = await cliente.query(
          `INSERT INTO categorias (nombre, slug, orden) VALUES ($1, $2, $3)
           ON CONFLICT (slug) DO UPDATE SET activo = TRUE RETURNING id`,
          [cat.nombre, cat.slug, i]
        );
        ids[cat.slug] = padre.rows[0].id;

        for (const [j, [nombre, slug]] of cat.hijas.entries()) {
          const hija = await cliente.query(
            `INSERT INTO categorias (nombre, slug, padre_id, orden) VALUES ($1, $2, $3, $4)
             ON CONFLICT (slug) DO UPDATE SET activo = TRUE RETURNING id`,
            [nombre, slug, ids[cat.slug], j]
          );
          ids[slug] = hija.rows[0].id;
        }
      }

      for (const [nombre, slug, cat, precio, oferta, colores, talles, destacado, descripcion] of PRODUCTOS) {
        const existe = await cliente.query("SELECT 1 FROM productos WHERE slug = $1", [slug]);
        if (existe.rowCount) continue;

        const { rows } = await cliente.query(
          `INSERT INTO productos (nombre, slug, descripcion, categoria_id, marca, precio, precio_oferta, destacado)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [nombre, slug, descripcion, ids[cat], MARCA, precio, oferta, destacado]
        );
        const productoId = rows[0].id;
        let orden = 0;

        for (const color of colores) {
          const base = `/img/productos-demo/${slug}-${slugify(color)}`;
          await cliente.query(
            `INSERT INTO producto_imagenes (producto_id, url, color, orden) VALUES ($1, $2, $3, $4)`,
            [productoId, `${base}.svg`, color, orden++]
          );
          await cliente.query(
            `INSERT INTO producto_imagenes (producto_id, url, color, orden) VALUES ($1, $2, $3, $4)`,
            [productoId, `${base}-detalle.svg`, color, orden++]
          );

          for (const talle of talles) {
            await cliente.query(
              `INSERT INTO variantes (producto_id, talle, color, color_hex, stock)
               VALUES ($1, $2, $3, $4, $5)`,
              [productoId, talle, color, COLORES[color], stockAzar()]
            );
          }
        }
        creados++;
      }

      if (ocultarDemo) {
        await cliente.query(`UPDATE productos SET activo = FALSE WHERE marca = 'Tu Marca'`);
        await cliente.query(
          `UPDATE categorias SET activo = FALSE
           WHERE slug IN ('mujer', 'hombre', 'accesorios')
              OR padre_id IN (SELECT id FROM categorias WHERE slug IN ('mujer', 'hombre'))`
        );
      }
    });

    console.log(`✅ Catálogo de danza: ${creados} productos nuevos.`);
    if (ocultarDemo) console.log("   Se ocultaron los productos y categorías genéricos del seed original.");
  } catch (error) {
    console.error("❌ Error cargando el catálogo de danza:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) seedDanza();

module.exports = { PRODUCTOS, COLORES, slugify };
