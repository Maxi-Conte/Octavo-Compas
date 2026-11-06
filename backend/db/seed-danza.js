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

const { MARCA, COLORES, CATEGORIAS, PRODUCTOS, slugify } = require("./datos-danza");

function stockAzar() {
  return Math.random() < 0.15 ? 0 : Math.floor(Math.random() * 6) + 1;
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

