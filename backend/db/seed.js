/*
  Carga categorías y productos de ejemplo para probar la tienda.
  Solo se ejecuta si la tabla de productos está vacía.

  npm run db:seed
*/

const { pool, transaccion } = require("./database");

const COLORES = {
  Negro: "#1f1f1f",
  Blanco: "#f2f2f2",
  Gris: "#9aa0a6",
  Azul: "#2c3e70",
  Verde: "#4f6b4a",
  Beige: "#d8c3a5",
  Rosa: "#e8b4bc",
  Bordo: "#6d1f2c"
};

const CATEGORIAS = [
  { nombre: "Mujer", slug: "mujer", hijas: ["Remeras", "Buzos", "Pantalones", "Vestidos"] },
  { nombre: "Hombre", slug: "hombre", hijas: ["Remeras", "Buzos", "Pantalones", "Camperas"] },
  { nombre: "Accesorios", slug: "accesorios", hijas: [] }
];

const LETRAS = ["XS", "S", "M", "L", "XL"];
const NUMEROS = ["36", "38", "40", "42", "44"];

/* [nombre, categoría, forma, precio, oferta, colores, talles, destacado, descripción] */
const PRODUCTOS = [
  ["Remera Básica Algodón", "mujer-remeras", "remera", 18900, null, ["Negro", "Blanco", "Rosa"], LETRAS, true,
    "Remera de algodón peinado 24/1, corte recto y cuello redondo. Ideal para el día a día."],
  ["Remera Oversize Lisa", "hombre-remeras", "remera", 21900, 17500, ["Negro", "Gris", "Beige"], LETRAS, true,
    "Calce oversize con hombros caídos. Algodón pesado de 200 g."],
  ["Buzo Canguro Frisa", "mujer-buzos", "buzo", 45900, null, ["Gris", "Rosa", "Verde"], LETRAS, true,
    "Buzo con capucha y bolsillo canguro. Frisa invisible, abrigado y suave."],
  ["Buzo Cuello Redondo", "hombre-buzos", "buzo", 42900, 36900, ["Negro", "Azul", "Gris"], LETRAS, false,
    "Buzo de frisa con puños y cintura elastizados."],
  ["Jean Mom Tiro Alto", "mujer-pantalones", "pantalon", 52900, null, ["Azul", "Negro"], NUMEROS, true,
    "Jean rígido de tiro alto y pierna recta. 100% algodón."],
  ["Pantalón Cargo", "hombre-pantalones", "pantalon", 49900, null, ["Verde", "Beige", "Negro"], NUMEROS, false,
    "Pantalón cargo de gabardina con bolsillos laterales."],
  ["Vestido Midi Lino", "mujer-vestidos", "vestido", 58900, 49900, ["Beige", "Negro", "Bordo"], ["S", "M", "L"], true,
    "Vestido midi de lino con breteles regulables. Fresco y liviano."],
  ["Campera Rompevientos", "hombre-camperas", "campera", 69900, null, ["Negro", "Azul", "Verde"], LETRAS, true,
    "Campera rompevientos impermeable con capucha guardable."],
  ["Gorra Bordada", "accesorios", "gorra", 14900, null, ["Negro", "Beige", "Azul"], ["U"], false,
    "Gorra de gabardina con logo bordado y cierre regulable."],
  ["Remera Manga Larga", "mujer-remeras", "remera", 23900, null, ["Blanco", "Bordo", "Verde"], LETRAS, false,
    "Remera de manga larga en jersey de algodón con lycra."]
];

/* Stock al azar entre 0 y 8 (algunos en 0 para ver "sin stock") */
function stockAzar() {
  return Math.random() < 0.15 ? 0 : Math.floor(Math.random() * 8) + 1;
}

function slugify(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function seed() {
  try {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM productos");

    if (rows[0].n > 0) {
      console.log("La base ya tiene productos: no se cargan datos de ejemplo.");
      return;
    }

    await transaccion(async (cliente) => {
      const idsCategoria = {};

      for (const [i, cat] of CATEGORIAS.entries()) {
        const padre = await cliente.query(
          `INSERT INTO categorias (nombre, slug, orden) VALUES ($1, $2, $3)
           ON CONFLICT (slug) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
          [cat.nombre, cat.slug, i]
        );
        idsCategoria[cat.slug] = padre.rows[0].id;

        for (const [j, hija] of cat.hijas.entries()) {
          const slug = `${cat.slug}-${slugify(hija)}`;
          const r = await cliente.query(
            `INSERT INTO categorias (nombre, slug, padre_id, orden) VALUES ($1, $2, $3, $4)
             ON CONFLICT (slug) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
            [hija, slug, padre.rows[0].id, j]
          );
          idsCategoria[slug] = r.rows[0].id;
        }
      }

      for (const [nombre, cat, forma, precio, oferta, colores, talles, destacado, descripcion] of PRODUCTOS) {
        const p = await cliente.query(
          `INSERT INTO productos (nombre, slug, descripcion, categoria_id, marca, precio, precio_oferta, destacado)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [nombre, slugify(nombre), descripcion, idsCategoria[cat], "Tu Marca", precio, oferta, destacado]
        );
        const productoId = p.rows[0].id;

        for (const [orden, color] of colores.entries()) {
          await cliente.query(
            `INSERT INTO producto_imagenes (producto_id, url, color, orden) VALUES ($1, $2, $3, $4)`,
            [productoId, `/img/demo/${forma}-${slugify(color)}.svg`, color, orden]
          );

          for (const talle of talles) {
            await cliente.query(
              `INSERT INTO variantes (producto_id, talle, color, color_hex, stock)
               VALUES ($1, $2, $3, $4, $5)`,
              [productoId, talle, color, COLORES[color], stockAzar()]
            );
          }
        }
      }
    });

    console.log(`✅ Se cargaron ${PRODUCTOS.length} productos de ejemplo.`);
  } catch (error) {
    console.error("❌ Error cargando los datos de ejemplo:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
