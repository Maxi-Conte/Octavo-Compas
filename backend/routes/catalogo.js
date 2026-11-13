/* =====================================================
   CATÁLOGO PÚBLICO
   GET /api/categorias
   GET /api/productos            (con filtros y paginación)
   GET /api/productos/filtros    (talles, colores y precios disponibles)
   GET /api/productos/:slug      (detalle)
===================================================== */

const express = require("express");
const db = require("../db/database");
const { asyncRuta, ErrorHttp } = require("../utils/http");
const { texto } = require("../utils/validar");
const { compararTalles } = require("../utils/talles");

const router = express.Router();

/* Precio que efectivamente se cobra */
const PRECIO_FINAL = "COALESCE(p.precio_oferta, p.precio)";

/* Órdenes permitidos (nunca se mete texto del usuario en el ORDER BY) */
const ORDENES = {
  nuevos: "p.creado_en DESC, p.id DESC",
  precio_asc: `${PRECIO_FINAL} ASC, p.id`,
  precio_desc: `${PRECIO_FINAL} DESC, p.id`,
  nombre: "p.nombre ASC, p.id"
};

/* Número entero dentro de un rango (lo que llega por la URL puede ser cualquier cosa) */
function enteroEntre(valor, porDefecto, minimo, maximo) {
  const numero = Math.trunc(Number(valor));
  if (!Number.isFinite(numero) || numero === 0) return porDefecto;
  return Math.min(Math.max(numero, minimo), maximo);
}

/* "M,L,XL" -> ["M","L","XL"] */
function lista(valor, maximo = 20) {
  return String(valor || "")
    .split(",")
    .map((v) => v.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, maximo);
}

/* Para usar texto del usuario dentro de ILIKE sin que % y _ actúen de comodín */
function escaparLike(valor) {
  return valor.replace(/[\\%_]/g, "\\$&");
}

/*
  Arma el WHERE de los filtros. Todos los valores van
  como parámetros ($1, $2...), nunca concatenados.
*/
function construirFiltros(query, { incluirTalleColor = true } = {}) {
  const condiciones = ["p.activo = TRUE"];
  const parametros = [];

  const agregar = (valor) => {
    parametros.push(valor);
    return `$${parametros.length}`;
  };

  /* Categoría: incluye sus subcategorías */
  const categoria = texto(query.categoria, 100);
  if (categoria) {
    const p = agregar(categoria);
    condiciones.push(`p.categoria_id IN (
      SELECT c.id FROM categorias c
      WHERE c.activo AND (c.slug = ${p}
        OR c.padre_id = (SELECT id FROM categorias WHERE slug = ${p}))
    )`);
  }

  /* Talle y color: tiene que existir UNA variante con stock que cumpla ambos */
  if (incluirTalleColor) {
    const talles = lista(query.talle);
    const colores = lista(query.color);

    if (talles.length || colores.length) {
      const sub = ["v.producto_id = p.id", "v.activo", "v.stock > 0"];
      if (talles.length) sub.push(`v.talle = ANY(${agregar(talles)}::text[])`);
      if (colores.length) sub.push(`v.color = ANY(${agregar(colores)}::text[])`);
      condiciones.push(`EXISTS (SELECT 1 FROM variantes v WHERE ${sub.join(" AND ")})`);
    }
  }

  /* Tope: precios más grandes no entran en la columna y romperían la consulta */
  const TOPE_PRECIO = 9999999999;

  const minimo = Math.min(Number(query.min), TOPE_PRECIO);
  if (Number.isFinite(minimo) && minimo > 0) {
    condiciones.push(`${PRECIO_FINAL} >= ${agregar(minimo)}`);
  }

  const maximo = Math.min(Number(query.max), TOPE_PRECIO);
  if (Number.isFinite(maximo) && maximo > 0) {
    condiciones.push(`${PRECIO_FINAL} <= ${agregar(maximo)}`);
  }

  const buscar = texto(query.buscar, 80);
  if (buscar) {
    const p = agregar(`%${escaparLike(buscar)}%`);
    condiciones.push(`(p.nombre ILIKE ${p} OR p.marca ILIKE ${p} OR p.descripcion ILIKE ${p})`);
  }

  if (query.destacados === "1") condiciones.push("p.destacado = TRUE");
  if (query.ofertas === "1") condiciones.push("p.precio_oferta IS NOT NULL");

  return { where: condiciones.join(" AND "), parametros, agregar };
}

function formatearTarjeta(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    slug: fila.slug,
    marca: fila.marca,
    precio: Number(fila.precio),
    precio_oferta: fila.precio_oferta === null ? null : Number(fila.precio_oferta),
    imagen: fila.imagen,
    imagen_hover: fila.imagen_hover,
    colores: fila.colores || [],
    agotado: Number(fila.stock_total) === 0
  };
}

/* Columnas comunes para las tarjetas de producto */
const COLUMNAS_TARJETA = `
  p.id, p.nombre, p.slug, p.marca, p.precio, p.precio_oferta,
  (SELECT url FROM producto_imagenes WHERE producto_id = p.id ORDER BY orden, id LIMIT 1) AS imagen,
  (SELECT url FROM producto_imagenes WHERE producto_id = p.id ORDER BY orden, id OFFSET 1 LIMIT 1) AS imagen_hover,
  (SELECT COALESCE(json_agg(DISTINCT jsonb_build_object('nombre', v.color, 'hex', v.color_hex)), '[]')
     FROM variantes v WHERE v.producto_id = p.id AND v.activo) AS colores,
  (SELECT COALESCE(SUM(v.stock), 0) FROM variantes v WHERE v.producto_id = p.id AND v.activo) AS stock_total
`;

/* ---------- CATEGORÍAS (árbol) ---------- */

router.get(
  "/categorias",
  asyncRuta(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, nombre, slug, padre_id
       FROM categorias WHERE activo
       ORDER BY orden, nombre`
    );

    const principales = rows.filter((c) => !c.padre_id);
    const arbol = principales.map((c) => ({
      ...c,
      hijas: rows.filter((h) => h.padre_id === c.id)
    }));

    res.json(arbol);
  })
);

/* ---------- LISTADO CON FILTROS ---------- */

router.get(
  "/productos",
  asyncRuta(async (req, res) => {
    const { where, parametros, agregar } = construirFiltros(req.query);

    const orden = Object.hasOwn(ORDENES, String(req.query.orden)) ? ORDENES[req.query.orden] : ORDENES.nuevos;
    const porPagina = enteroEntre(req.query.por_pagina, 24, 1, 60);
    const pagina = enteroEntre(req.query.pagina, 1, 1, 10000);

    const limite = agregar(porPagina);
    const desde = agregar((pagina - 1) * porPagina);

    const { rows } = await db.query(
      `SELECT ${COLUMNAS_TARJETA}, COUNT(*) OVER() AS total_filas
       FROM productos p
       WHERE ${where}
       ORDER BY ${orden}
       LIMIT ${limite} OFFSET ${desde}`,
      parametros
    );

    const total = rows.length ? Number(rows[0].total_filas) : 0;

    res.json({
      productos: rows.map(formatearTarjeta),
      total,
      pagina,
      paginas: Math.max(Math.ceil(total / porPagina), 1)
    });
  })
);

/* ---------- FILTROS DISPONIBLES ---------- */

router.get(
  "/productos/filtros",
  asyncRuta(async (req, res) => {
    /* No filtramos por talle/color acá, así se siguen viendo todas las opciones */
    const { where, parametros } = construirFiltros(req.query, { incluirTalleColor: false });

    const { rows } = await db.query(
      `SELECT
         (SELECT COALESCE(json_agg(DISTINCT v.talle), '[]')
            FROM variantes v JOIN productos p ON p.id = v.producto_id
            WHERE ${where} AND v.activo AND v.stock > 0) AS talles,
         (SELECT COALESCE(json_agg(DISTINCT jsonb_build_object('nombre', v.color, 'hex', v.color_hex)), '[]')
            FROM variantes v JOIN productos p ON p.id = v.producto_id
            WHERE ${where} AND v.activo AND v.stock > 0) AS colores,
         (SELECT MIN(${PRECIO_FINAL}) FROM productos p WHERE ${where}) AS precio_min,
         (SELECT MAX(${PRECIO_FINAL}) FROM productos p WHERE ${where}) AS precio_max`,
      parametros
    );

    const fila = rows[0];

    res.json({
      talles: (fila.talles || []).sort(compararTalles),
      colores: (fila.colores || []).sort((a, b) => a.nombre.localeCompare(b.nombre)),
      precio_min: fila.precio_min === null ? 0 : Number(fila.precio_min),
      precio_max: fila.precio_max === null ? 0 : Number(fila.precio_max)
    });
  })
);

/* ---------- DETALLE ---------- */

router.get(
  "/productos/:slug",
  asyncRuta(async (req, res) => {
    const slug = texto(req.params.slug, 180);

    const producto = (
      await db.query(
        `SELECT p.id, p.nombre, p.slug, p.descripcion, p.marca, p.precio, p.precio_oferta,
                p.categoria_id, c.nombre AS categoria_nombre, c.slug AS categoria_slug
         FROM productos p
         LEFT JOIN categorias c ON c.id = p.categoria_id
         WHERE p.slug = $1 AND p.activo`,
        [slug]
      )
    ).rows[0];

    if (!producto) throw new ErrorHttp(404, "Producto no encontrado.");

    const [imagenes, variantes, relacionados] = await Promise.all([
      db.query(
        `SELECT url, color FROM producto_imagenes WHERE producto_id = $1 ORDER BY orden, id`,
        [producto.id]
      ),
      db.query(
        `SELECT id, talle, color, color_hex, stock
         FROM variantes WHERE producto_id = $1 AND activo`,
        [producto.id]
      ),
      db.query(
        `SELECT ${COLUMNAS_TARJETA}
         FROM productos p
         WHERE p.activo AND p.id <> $1 AND p.categoria_id = $2
         ORDER BY p.destacado DESC, p.creado_en DESC
         LIMIT 4`,
        [producto.id, producto.categoria_id]
      )
    ]);

    res.json({
      ...producto,
      precio: Number(producto.precio),
      precio_oferta: producto.precio_oferta === null ? null : Number(producto.precio_oferta),
      imagenes: imagenes.rows,
      /* No mostramos el stock exacto: solo si hay y si quedan pocas */
      variantes: variantes.rows
        .map((v) => ({
          id: v.id,
          talle: v.talle,
          color: v.color,
          color_hex: v.color_hex,
          disponible: v.stock > 0,
          ultimas: v.stock > 0 && v.stock <= 3
        }))
        .sort((a, b) => compararTalles(a.talle, b.talle)),
      relacionados: relacionados.rows.map(formatearTarjeta)
    });
  })
);

module.exports = router;
