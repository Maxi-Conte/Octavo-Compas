/* =====================================================
   PARA LOS BUSCADORES
   GET /robots.txt     qué pueden recorrer
   GET /sitemap.xml    lista de páginas, categorías y productos
                       (se arma sola con lo que está activo)
===================================================== */

const express = require("express");
const config = require("../config");
const db = require("../db/database");
const { asyncRuta } = require("../utils/http");

const router = express.Router();

/* Páginas fijas que tienen que aparecer en Google */
const PAGINAS = ["/", "/tienda.html", "/ayuda.html", "/arrepentimiento.html"];

function escaparXML(valor) {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

router.get("/robots.txt", (req, res) => {
  /*
    El panel, el checkout y el resultado del pago no se bloquean acá:
    llevan "noindex", y Google necesita poder leerlos para verlo.
  */
  res.type("text/plain").send(
    ["User-agent: *", "Disallow: /api/", "", `Sitemap: ${config.urlSitio}/sitemap.xml`, ""].join("\n")
  );
});

router.get(
  "/sitemap.xml",
  asyncRuta(async (req, res) => {
    const [categorias, productos] = await Promise.all([
      db.query("SELECT slug FROM categorias WHERE activo ORDER BY orden, nombre"),
      db.query("SELECT slug, actualizado_en FROM productos WHERE activo ORDER BY id")
    ]);

    const entradas = [
      ...PAGINAS.map((ruta) => ({ ruta })),
      ...categorias.rows.map((c) => ({ ruta: `/tienda.html?categoria=${encodeURIComponent(c.slug)}` })),
      ...productos.rows.map((p) => ({
        ruta: `/producto.html?p=${encodeURIComponent(p.slug)}`,
        fecha: p.actualizado_en.toISOString().slice(0, 10)
      }))
    ];

    const urls = entradas
      .map(({ ruta, fecha }) => {
        const lastmod = fecha ? `<lastmod>${fecha}</lastmod>` : "";
        return `  <url><loc>${escaparXML(config.urlSitio + ruta)}</loc>${lastmod}</url>`;
      })
      .join("\n");

    res
      .type("application/xml")
      .set("Cache-Control", "public, max-age=3600")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
      );
  })
);

module.exports = router;
