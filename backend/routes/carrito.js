/* =====================================================
   CARRITO
   GET    /api/carrito
   POST   /api/carrito/items              { variante_id, cantidad }
   PUT    /api/carrito/items/:varianteId  { cantidad }
   DELETE /api/carrito/items/:varianteId
===================================================== */

const express = require("express");
const db = require("../db/database");
const { asyncRuta, ErrorHttp } = require("../utils/http");
const { idValido } = require("../utils/validar");
const { identificarCarrito } = require("../middleware/carrito-cookie");
const { calcularCostoEnvio, configEnvioPublica } = require("../utils/envio");

const router = express.Router();
router.use(identificarCarrito);

const MAX_POR_ITEM = 10;

async function idCarrito(token, { crear = false } = {}) {
  if (crear) {
    const { rows } = await db.query(
      `INSERT INTO carritos (token) VALUES ($1)
       ON CONFLICT (token) DO UPDATE SET actualizado_en = NOW()
       RETURNING id`,
      [token]
    );
    return rows[0].id;
  }

  const { rows } = await db.query("SELECT id FROM carritos WHERE token = $1", [token]);
  return rows[0]?.id || null;
}

/*
  Devuelve el carrito con precios y stock ACTUALES.
  Si algo cambió (sin stock, producto pausado), se avisa.
*/
async function leerCarrito(token) {
  const carritoId = await idCarrito(token);

  if (!carritoId) {
    return { items: [], cantidad: 0, subtotal: 0, envio: configEnvioPublica() };
  }

  const { rows } = await db.query(
    `SELECT ci.variante_id, ci.cantidad,
            v.talle, v.color, v.color_hex, v.stock, v.activo AS variante_activa,
            p.id AS producto_id, p.nombre, p.slug, p.activo AS producto_activo,
            COALESCE(p.precio_oferta, p.precio) AS precio,
            (SELECT url FROM producto_imagenes pi
              WHERE pi.producto_id = p.id
              ORDER BY (pi.color = v.color) DESC NULLS LAST, pi.orden, pi.id
              LIMIT 1) AS imagen
     FROM carrito_items ci
     JOIN variantes v ON v.id = ci.variante_id
     JOIN productos p ON p.id = v.producto_id
     WHERE ci.carrito_id = $1
     ORDER BY ci.id`,
    [carritoId]
  );

  const items = rows.map((fila) => {
    const disponible = fila.variante_activa && fila.producto_activo && fila.stock > 0;

    return {
      variante_id: fila.variante_id,
      producto_id: fila.producto_id,
      nombre: fila.nombre,
      slug: fila.slug,
      talle: fila.talle,
      color: fila.color,
      color_hex: fila.color_hex,
      imagen: fila.imagen,
      precio: Number(fila.precio),
      cantidad: fila.cantidad,
      disponible,
      stock_insuficiente: disponible && fila.cantidad > fila.stock,
      maximo: Math.min(fila.stock, MAX_POR_ITEM)
    };
  });

  const validos = items.filter((i) => i.disponible);
  const subtotal = validos.reduce((suma, i) => suma + i.precio * i.cantidad, 0);

  return {
    items,
    cantidad: validos.reduce((suma, i) => suma + i.cantidad, 0),
    subtotal,
    costo_envio_estimado: validos.length ? calcularCostoEnvio("envio", subtotal) : 0,
    envio: configEnvioPublica()
  };
}

/* Verifica que la variante se pueda comprar y devuelve su stock */
async function stockDisponible(varianteId) {
  const { rows } = await db.query(
    `SELECT v.stock
     FROM variantes v JOIN productos p ON p.id = v.producto_id
     WHERE v.id = $1 AND v.activo AND p.activo`,
    [varianteId]
  );

  if (!rows[0]) throw new ErrorHttp(404, "Ese producto ya no está disponible.");
  if (rows[0].stock <= 0) throw new ErrorHttp(409, "No queda stock de ese talle y color.");

  return rows[0].stock;
}

function cantidadValida(valor) {
  const cantidad = Number(valor ?? 1);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_POR_ITEM) {
    throw new ErrorHttp(400, `La cantidad tiene que ser entre 1 y ${MAX_POR_ITEM}.`);
  }
  return cantidad;
}

/* ---------- Rutas ---------- */

router.get(
  "/",
  asyncRuta(async (req, res) => {
    res.json(await leerCarrito(req.carritoToken));
  })
);

router.post(
  "/items",
  asyncRuta(async (req, res) => {
    const varianteId = idValido(req.body.variante_id, "talle/color");
    const cantidad = cantidadValida(req.body.cantidad);
    const stock = await stockDisponible(varianteId);

    const carritoId = await idCarrito(req.carritoToken, { crear: true });

    /* Si ya estaba en el carrito, suma (sin pasarse del stock ni del máximo) */
    const { rows } = await db.query(
      `INSERT INTO carrito_items (carrito_id, variante_id, cantidad)
       VALUES ($1, $2, LEAST($3::int, $4::int, $5::int))
       ON CONFLICT (carrito_id, variante_id)
       DO UPDATE SET cantidad = LEAST(carrito_items.cantidad + $3::int, $4::int, $5::int)
       RETURNING cantidad`,
      [carritoId, varianteId, cantidad, stock, MAX_POR_ITEM]
    );

    const carrito = await leerCarrito(req.carritoToken);
    const aviso = rows[0].cantidad < cantidad ? "Agregamos el máximo disponible." : null;

    res.status(201).json({ ...carrito, aviso });
  })
);

router.put(
  "/items/:varianteId",
  asyncRuta(async (req, res) => {
    const varianteId = idValido(req.params.varianteId, "producto");
    const cantidad = cantidadValida(req.body.cantidad);
    const stock = await stockDisponible(varianteId);

    if (cantidad > stock) {
      throw new ErrorHttp(409, `Solo quedan ${stock} unidades de ese talle y color.`);
    }

    const carritoId = await idCarrito(req.carritoToken);
    if (!carritoId) throw new ErrorHttp(404, "Tu carrito está vacío.");

    const r = await db.query(
      `UPDATE carrito_items SET cantidad = $1
       WHERE carrito_id = $2 AND variante_id = $3`,
      [cantidad, carritoId, varianteId]
    );

    if (r.rowCount === 0) throw new ErrorHttp(404, "Ese producto no está en tu carrito.");

    res.json(await leerCarrito(req.carritoToken));
  })
);

router.delete(
  "/items/:varianteId",
  asyncRuta(async (req, res) => {
    const varianteId = idValido(req.params.varianteId, "producto");
    const carritoId = await idCarrito(req.carritoToken);

    if (carritoId) {
      await db.query("DELETE FROM carrito_items WHERE carrito_id = $1 AND variante_id = $2", [
        carritoId,
        varianteId
      ]);
    }

    res.json(await leerCarrito(req.carritoToken));
  })
);

module.exports = { router, leerCarrito, idCarrito };
