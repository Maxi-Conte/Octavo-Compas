/*
  Arma una DEMO de la tienda en un solo archivo HTML, sin servidor,
  para compartirla (por ejemplo, como artefacto de Claude).

  node scripts/construir-demo.js   ->   demo/octavo-compas-demo.html

  - Mismo diseño y mismos scripts del frontend, con una api() simulada
    que usa el catálogo de ejemplo (backend/db/datos-danza.js).
  - Carrito guardado en el navegador; pagos desactivados.
  - Las "páginas" se recorren con #nombre (#tienda-ballet, #producto-...).
*/

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const FRONT = path.join(RAIZ, "frontend");
const SALIDA = path.join(RAIZ, "demo", "octavo-compas-demo.html");

const { MARCA, COLORES, CATEGORIAS, PRODUCTOS, slugify } = require("../backend/db/datos-danza");

const leer = (...partes) => fs.readFileSync(path.join(FRONT, ...partes), "utf8");
const svgComoDato = (archivo) =>
  "data:image/svg+xml," + encodeURIComponent(fs.readFileSync(archivo, "utf8").replace(/\s+/g, " ").trim());

/* ---------- Imágenes ---------- */

const LOGOS = {
  "/img/marca/logo.svg": svgComoDato(path.join(FRONT, "img/marca/logo.svg")),
  "/img/marca/logo-claro.svg": svgComoDato(path.join(FRONT, "img/marca/logo-claro.svg")),
  "/img/marca/isotipo.svg": svgComoDato(path.join(FRONT, "img/marca/isotipo.svg"))
};

/* Fotos de secciones: si el archivo existe va incrustado;
   si todavía no existe, queda la caja con su etiqueta */
const TIPOS_FOTO = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function fotoComoDato(ruta) {
  const archivo = path.join(FRONT, ruta);
  const tipo = TIPOS_FOTO[path.extname(archivo).toLowerCase()];
  if (!tipo || !fs.existsSync(archivo)) return "data:,";
  return `data:${tipo};base64,${fs.readFileSync(archivo).toString("base64")}`;
}

function adaptarRutas(texto) {
  for (const [ruta, dato] of Object.entries(LOGOS)) texto = texto.split(ruta).join(dato);
  return texto.replace(/\/img\/(hero|disciplinas|secciones)\/[\w.-]+/g, fotoComoDato);
}

/* ---------- Datos del catálogo ---------- */

let idCategoria = 1;
const categorias = CATEGORIAS.map((c) => {
  const padre = { id: idCategoria++, nombre: c.nombre, slug: c.slug, padre_id: null };
  padre.hijas = c.hijas.map(([nombre, slug]) => ({ id: idCategoria++, nombre, slug, padre_id: padre.id }));
  return padre;
});

const productos = PRODUCTOS.map(([nombre, slug, categoria, precio, oferta, colores, talles, destacado, descripcion]) => ({
  nombre, slug, categoria, precio, precio_oferta: oferta, colores, talles, destacado, descripcion, marca: MARCA,
  imagenes: colores.flatMap((color) => {
    const base = path.join(FRONT, "img/productos-demo", `${slug}-${slugify(color)}`);
    return [
      { url: svgComoDato(`${base}.svg`), color },
      { url: svgComoDato(`${base}-detalle.svg`), color }
    ];
  })
}));

/* ---------- Vistas (el <main> de cada página) ---------- */

const PAGINAS = {
  inicio: "index.html",
  tienda: "tienda.html",
  producto: "producto.html",
  checkout: "checkout.html",
  ayuda: "ayuda.html",
  arrepentimiento: "arrepentimiento.html"
};

const vistas = {};
for (const [nombre, archivo] of Object.entries(PAGINAS)) {
  const html = adaptarRutas(leer(archivo));
  const main = html.match(/<main([^>]*)>([\s\S]*?)<\/main>/);
  const fin = html.indexOf("</main>") + "</main>".length;
  vistas[nombre] = {
    titulo: (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "Octavo Compás Indumentaria",
    claseMain: (main[1].match(/class="([^"]*)"/) || [])[1] || "",
    html: main[2],
    dialogos: html.slice(fin, html.indexOf("<footer")).trim()
  };
}

/* ---------- Scripts ---------- */

/* Reemplazo que tiene que existir: si el código original cambió, avisa */
function reemplazar(texto, buscado, nuevo, archivo) {
  if (!texto.includes(buscado)) throw new Error(`No encontré "${buscado}" en ${archivo}`);
  return texto.split(buscado).join(nuevo);
}

function scriptPagina(archivo) {
  let js = adaptarRutas(leer("js", archivo));
  if (js.includes("location.search")) js = js.split("location.search").join("DEMO.busqueda()");

  if (archivo === "tienda.js") {
    js = reemplazar(js, 'history.pushState(null, "", ', "DEMO.cambiarBusqueda(", archivo);
    js = reemplazar(js, 'window.addEventListener("popstate", cargar);', "", archivo);
  }
  if (archivo === "producto.js" || archivo === "checkout.js") {
    js = reemplazar(js, 'location.href = "/tienda.html";', 'DEMO.ir("/tienda.html");', archivo);
  }
  return js;
}

const SCRIPTS_VISTA = {
  inicio: "inicio.js",
  tienda: "tienda.js",
  producto: "producto.js",
  checkout: "checkout.js",
  arrepentimiento: "arrepentimiento.js"
};

const scriptsVistas = Object.entries(SCRIPTS_VISTA)
  .map(([vista, archivo]) => `  ${JSON.stringify(vista)}: function () {\n${scriptPagina(archivo)}\n  }`)
  .join(",\n");

const comun = adaptarRutas(leer("js", "comun.js")).split("location.search").join("DEMO.busqueda()");
const telon = adaptarRutas(leer("js", "telon.js"));
const runtime = fs.readFileSync(path.join(__dirname, "demo", "runtime.js"), "utf8");
const css = leer("css", "styles.css");

/* Dentro de <script> no puede aparecer "</script" */
const seguro = (texto) => texto.replace(/<\/script/gi, "<\\/script");
const json = (dato) => JSON.stringify(dato).replace(/<\//g, "<\\/");

const CSS_DEMO = `
.demo-aviso {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 80;
  max-width: calc(100vw - 32px);
  padding: 9px 14px;
  background: var(--c-texto);
  color: #fff;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  pointer-events: none;
}

@media (max-width: 600px) {
  .demo-aviso {
    right: 10px;
    bottom: 10px;
    padding: 6px 10px;
    font-size: 0.68rem;
  }

  .demo-aviso span {
    display: none;
  }
}`;

const html = `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Octavo Compás Indumentaria</title>
  <meta name="description" content="Demo de la tienda online de Octavo Compás Indumentaria: ropa de danza, vestuarios a medida y vestidos de gala.">
  <link rel="icon" href="${LOGOS["/img/marca/isotipo.svg"]}" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&display=swap">
  <style>
${css}
${CSS_DEMO}
  </style>
  <script>
${seguro(telon)}
  </script>
</head>
<body>
  <header id="header"></header>
  <main id="contenido"></main>
  <div id="dialogos-vista"></div>
  <footer id="footer"></footer>
  <p class="demo-aviso">Versión de muestra<span> · los pagos están desactivados</span></p>

  <script>
${seguro(comun)}
  </script>
  <script>
const DEMO_DATOS = ${json({ categorias, productos, colores: COLORES })};
const DEMO_VISTAS = ${json(vistas)};
  </script>
  <script>
${seguro(runtime)}
  </script>
  <script>
const DEMO_SCRIPTS = {
${seguro(scriptsVistas)}
};
  </script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, html);
console.log(`✅ Demo armada: ${path.relative(RAIZ, SALIDA)} (${Math.round(html.length / 1024)} KB)`);
