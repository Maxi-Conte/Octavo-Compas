/* =====================================================
   ADMIN - CATEGORÍAS, PRODUCTOS Y VARIANTES
   Todas las rutas requieren sesión de administrador
   (se protege en server.js con requiereAdmin).
===================================================== */

const express = require("express");
const db = require("../../db/database");
const { asyncRuta, ErrorHttp } = require("../../utils/http");
const v = require("../../utils/validar");
const { compararTalles } = require("../../utils/talles");

const router = express.Router();

/* Genera un slug que no exista: "remera", "remera-2", "remera-3"... */
async function slugUnico(tabla, base, excluirId = 0, cliente = db) {
  const raiz = v.slugify(base) || `item-${Date.now()}`;
  let slug = raiz;

  for (let n = 2; n < 200; n++) {
    const { rows } = await cliente.query(
      `SELECT 1 FROM ${tabla} WHERE slug = $1 AND id <> $2`,
      [slug, excluirId]
    );
    if (rows.length === 0) return slug;
    slug = `${raiz}-${n}`;
  }

  return `${raiz}-${Date.now()}`;
}

/* =====================================================
   CATEGORÍAS
===================================================== */

router.get(
  "/categorias",
  asyncRuta(async (req, res) => {
    const { rows } = await db.query(
      `SELECT c.id, c.nombre, c.slug, c.padre_id, c.orden, c.activo,
              (SELECT COUNT(*)::int FROM productos p WHERE p.categoria_id = c.id) AS productos
       FROM categorias c
       ORDER BY c.orden, c.nombre`
    );
    res.json(rows);
  })
);

function datosCategoria(body) {
  const nombre = v.texto(body.nombre, 80);
  if (nombre.length < 2) throw new ErrorHttp(400, "El nombre de la categoría es obligatorio.");

  return {
    nombre,
    padre_id: body.padre_id ? v.idValido(body.padre_id, "categoría padre") : null,
    orden: body.orden === undefined || body.orden === "" ? 0 : v.enteroNoNegativo(body.orden, "El orden"),
    activo: body.activo !== false
  };
}

router.post(
  "/categorias",
  asyncRuta(async (req, res) => {
    const datos = datosCategoria(req.body);
    const slug = await slugUnico("categorias", req.body.slug || datos.nombre);

    const { rows } = await db.query(
      `INSERT INTO categorias (nombre, slug, padre_id, orden, activo)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [datos.nombre, slug, datos.padre_id, datos.orden, datos.activo]
    );

    res.status(201).json(rows[0]);
  })
);

router.put(
  "/categorias/:id",
  asyncRuta(async (req, res) => {
    const id = v.idValido(req.params.id, "categoría");
    const datos = datosCategoria(req.body);

    if (datos.padre_id === id) throw new ErrorHttp(400, "Una categoría no puede ser su propia madre.");

    const slug = await slugUnico("categorias", req.body.slug || datos.nombre, id);

    const { rows } = await db.query(
      `UPDATE categorias SET nombre = $1, slug = $2, padre_id = $3, orden = $4, activo = $5
       WHERE id = $6 RETURNING *`,
      [datos.nombre, slug, datos.padre_id, datos.orden, datos.activo, id]
    );

    if (!rows[0]) throw new ErrorHttp(404, "Categoría no encontrada.");
    res.json(rows[0]);
  })
);

router.delete(
  "/categorias/:id",
  asyncRuta(async (req, res) => {
    const id = v.idValido(req.params.id, "categoría");

    const { rows } = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM productos WHERE categoria_id = $1) AS productos,
         (SELECT COUNT(*)::int FROM categorias WHERE padre_id = $1) AS hijas`,
      [id]
    );
    if (rows[0].productos > 0) {
      throw new ErrorHttp(409, "La categoría tiene productos. Movelos a otra categoría antes de borrarla.");
    }
    if (rows[0].hijas > 0) {
      throw new ErrorHttp(409, "La categoría tiene subcategorías. Borralas o movelas primero.");
    }

    await db.query("DELETE FROM categorias WHERE id = $1", [id]);
    res.json({ ok: true });
  })
);

/* =====================================================
   PRODUCTOS
===================================================== */

router.get(
  "/productos",
  asyncRuta(async (req, res) => {
    const buscar = v.texto(req.query.buscar, 80);
    const parametros = [];
    let where = "";

    if (buscar) {
      parametros.push(`%${buscar.replace(/[\\%_]/g, "\\$&")}%`);
      where = "WHERE p.nombre ILIKE $1 OR p.marca ILIKE $1";
    }

    const { rows } = await db.query(
      `SELECT p.id, p.nombre, p.slug, p.marca, p.precio, p.precio_oferta,
              p.activo, p.destacado, c.nombre AS categoria,
              (SELECT url FROM producto_imagenes WHERE producto_id = p.id ORDER BY orden, id LIMIT 1) AS imagen,
              (SELECT COALESCE(SUM(stock), 0)::int FROM variantes WHERE producto_id = p.id AND activo) AS stock_total,
              (SELECT COUNT(*)::int FROM variantes WHERE producto_id = p.id) AS variantes
       FROM productos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       ${where}
       ORDER BY p.creado_en DESC
       LIMIT 500`,
      parametros
    );

    res.json(
      rows.map((p) => ({
        ...p,
        precio: Number(p.precio),
        precio_oferta: p.precio_oferta === null ? null : Number(p.precio_oferta)
      }))
    );
  })
);

async function productoCompleto(id) {
  const producto = (await db.query("SELECT * FROM productos WHERE id = $1", [id])).rows[0];
  if (!producto) throw new ErrorHttp(404, "Producto no encontrado.");

  const [imagenes, variantes] = await Promise.all([
    db.query("SELECT id, url, color, orden FROM producto_imagenes WHERE producto_id = $1 ORDER BY orden, id", [id]),
    db.query("SELECT * FROM variantes WHERE producto_id = $1 ORDER BY color, id", [id])
  ]);

  return {
    ...producto,
    precio: Number(producto.precio),
    precio_oferta: producto.precio_oferta === null ? null : Number(producto.precio_oferta),
    imagenes: imagenes.rows,
    variantes: variantes.rows.sort(
      (a, b) => a.color.localeCompare(b.color) || compararTalles(a.talle, b.talle)
    )
  };
}

router.get(
  "/productos/:id",
  asyncRuta(async (req, res) => {
    res.json(await productoCompleto(v.idValido(req.params.id, "producto")));
  })
);

function datosProducto(body) {
  const nombre = v.texto(body.nombre, 150);
  if (nombre.length < 2) throw new ErrorHttp(400, "El nombre del producto es obligatorio.");

  const precio = v.precio(body.precio);
  const precioOferta = v.precioONull(body.precio_oferta, "El precio de oferta");

  if (precioOferta !== null && precioOferta >= precio) {
    throw new ErrorHttp(400, "El precio de oferta tiene que ser menor al precio normal.");
  }

  const imagenes = Array.isArray(body.imagenes)
    ? body.imagenes.slice(0, 20).map((img, indice) => ({
        url: v.urlImagen(img.url),
        color: v.textoONull(img.color, 40),
        orden: indice
      }))
    : null;

  return {
    nombre,
    descripcion: v.textoONull(body.descripcion, 5000),
    categoria_id: body.categoria_id ? v.idValido(body.categoria_id, "categoría") : null,
    marca: v.textoONull(body.marca, 80),
    precio,
    precio_oferta: precioOferta,
    destacado: body.destacado === true,
    activo: body.activo !== false,
    imagenes
  };
}

async function guardarImagenes(cliente, productoId, imagenes) {
  if (imagenes === null) return; // no vinieron: no se tocan

  await cliente.query("DELETE FROM producto_imagenes WHERE producto_id = $1", [productoId]);

  for (const img of imagenes) {
    await cliente.query(
      "INSERT INTO producto_imagenes (producto_id, url, color, orden) VALUES ($1, $2, $3, $4)",
      [productoId, img.url, img.color, img.orden]
    );
  }
}

router.post(
  "/productos",
  asyncRuta(async (req, res) => {
    const datos = datosProducto(req.body);

    const id = await db.transaccion(async (cliente) => {
      const slug = await slugUnico("productos", req.body.slug || datos.nombre, 0, cliente);

      const { rows } = await cliente.query(
        `INSERT INTO productos
           (nombre, slug, descripcion, categoria_id, marca, precio, precio_oferta, destacado, activo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [datos.nombre, slug, datos.descripcion, datos.categoria_id, datos.marca,
         datos.precio, datos.precio_oferta, datos.destacado, datos.activo]
      );

      await guardarImagenes(cliente, rows[0].id, datos.imagenes);
      return rows[0].id;
    });

    res.status(201).json(await productoCompleto(id));
  })
);

router.put(
  "/productos/:id",
  asyncRuta(async (req, res) => {
    const id = v.idValido(req.params.id, "producto");
    const datos = datosProducto(req.body);

    await db.transaccion(async (cliente) => {
      const slug = await slugUnico("productos", req.body.slug || datos.nombre, id, cliente);

      const r = await cliente.query(
        `UPDATE productos SET
           nombre = $1, slug = $2, descripcion = $3, categoria_id = $4, marca = $5,
           precio = $6, precio_oferta = $7, destacado = $8, activo = $9, actualizado_en = NOW()
         WHERE id = $10`,
        [datos.nombre, slug, datos.descripcion, datos.categoria_id, datos.marca,
         datos.precio, datos.precio_oferta, datos.destacado, datos.activo, id]
      );

      if (r.rowCount === 0) throw new ErrorHttp(404, "Producto no encontrado.");
      await guardarImagenes(cliente, id, datos.imagenes);
    });

    res.json(await productoCompleto(id));
  })
);

router.delete(
  "/productos/:id",
  asyncRuta(async (req, res) => {
    const id = v.idValido(req.params.id, "producto");
    /* Los pedidos viejos conservan su copia de nombre, talle, color y precio */
    const r = await db.query("DELETE FROM productos WHERE id = $1", [id]);
    if (r.rowCount === 0) throw new ErrorHttp(404, "Producto no encontrado.");
    res.json({ ok: true });
  })
);

/* =====================================================
   VARIANTES (talle + color + stock)
===================================================== */

/*
  Genera todas las combinaciones talle x color de una vez.
  Body: { talles: ["S","M","L"], colores: [{nombre:"Negro", hex:"#000000"}], stock: 5 }
  Las combinaciones que ya existen se saltean.
*/
router.post(
  "/productos/:id/variantes",
  asyncRuta(async (req, res) => {
    const productoId = v.idValido(req.params.id, "producto");

    const talles = [...new Set(
      (Array.isArray(req.body.talles) ? req.body.talles : [])
        .map((t) => v.texto(t, 20).toUpperCase())
        .filter(Boolean)
    )].slice(0, 30);

    const colores = (Array.isArray(req.body.colores) ? req.body.colores : [])
      .map((c) => ({ nombre: v.texto(c.nombre, 40), hex: v.colorHex(c.hex) }))
      .filter((c) => c.nombre)
      .slice(0, 30);

    const stock = req.body.stock === undefined || req.body.stock === ""
      ? 0
      : v.enteroNoNegativo(req.body.stock, "El stock");

    if (!talles.length || !colores.length) {
      throw new ErrorHttp(400, "Indicá al menos un talle y un color.");
    }

    const existe = await db.query("SELECT 1 FROM productos WHERE id = $1", [productoId]);
    if (!existe.rows[0]) throw new ErrorHttp(404, "Producto no encontrado.");

    let creadas = 0;

    await db.transaccion(async (cliente) => {
      for (const color of colores) {
        for (const talle of talles) {
          const r = await cliente.query(
            `INSERT INTO variantes (producto_id, talle, color, color_hex, stock)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (producto_id, talle, color) DO NOTHING`,
            [productoId, talle, color.nombre, color.hex, stock]
          );
          creadas += r.rowCount;
        }
      }
    });

    res.status(201).json({ creadas, producto: await productoCompleto(productoId) });
  })
);

router.put(
  "/variantes/:id",
  asyncRuta(async (req, res) => {
    const id = v.idValido(req.params.id, "variante");

    const { rows } = await db.query(
      `UPDATE variantes SET
         stock = $1,
         sku = $2,
         activo = $3,
         color_hex = COALESCE($4, color_hex)
       WHERE id = $5
       RETURNING *`,
      [
        v.enteroNoNegativo(req.body.stock, "El stock"),
        v.textoONull(req.body.sku, 60),
        req.body.activo !== false,
        req.body.color_hex ? v.colorHex(req.body.color_hex) : null,
        id
      ]
    );

    if (!rows[0]) throw new ErrorHttp(404, "Variante no encontrada.");
    res.json(rows[0]);
  })
);

router.delete(
  "/variantes/:id",
  asyncRuta(async (req, res) => {
    const id = v.idValido(req.params.id, "variante");
    await db.query("DELETE FROM variantes WHERE id = $1", [id]);
    res.json({ ok: true });
  })
);

module.exports = router;
