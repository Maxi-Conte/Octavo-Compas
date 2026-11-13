/* =====================================================
   LA TIENDA COMPLETA, COMO LA VE INTERNET
   Seguridad del panel, catálogo público, carrito,
   botón de arrepentimiento y cabeceras.
===================================================== */

const entorno = require("./ayuda/entorno");
const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { crearApp } = require("../backend/app");
const { db, levantar, cookieDe, crearVariante, crearOrden, stockDe } = entorno;

let tienda;

before(async () => {
  await entorno.prepararBase();
  tienda = await levantar(crearApp());
});

beforeEach(entorno.limpiar);

after(async () => {
  await tienda.cerrar();
  await entorno.cerrar();
});

const ADMIN = { usuario: "admin", password: "password-de-prueba" };

async function entrarAlPanel(servidor = tienda) {
  const respuesta = await servidor.pedir("POST", "/api/admin/login", { cuerpo: ADMIN });
  assert.equal(respuesta.status, 200);
  return cookieDe(respuesta, "admin_sesion");
}

/* ---------- Panel: nadie entra sin sesión ---------- */

const RUTAS_DEL_PANEL = [
  ["GET", "/api/admin/categorias"],
  ["POST", "/api/admin/categorias"],
  ["PUT", "/api/admin/categorias/1"],
  ["DELETE", "/api/admin/categorias/1"],
  ["GET", "/api/admin/productos"],
  ["GET", "/api/admin/productos/1"],
  ["POST", "/api/admin/productos"],
  ["PUT", "/api/admin/productos/1"],
  ["DELETE", "/api/admin/productos/1"],
  ["POST", "/api/admin/productos/1/variantes"],
  ["PUT", "/api/admin/variantes/1"],
  ["DELETE", "/api/admin/variantes/1"],
  ["GET", "/api/admin/pedidos"],
  ["GET", "/api/admin/pedidos/1"],
  ["PATCH", "/api/admin/pedidos/1/estado"],
  ["PATCH", "/api/admin/pedidos/1/revisado"],
  ["GET", "/api/admin/arrepentimientos"],
  ["PATCH", "/api/admin/arrepentimientos/1/estado"]
];

test("panel: todas las rutas responden 401 sin sesión y no tocan nada", async () => {
  const malla = await crearVariante({ stock: 5 });

  for (const [metodo, ruta] of RUTAS_DEL_PANEL) {
    const respuesta = await tienda.pedir(metodo, ruta, { cuerpo: metodo === "GET" ? undefined : {} });
    assert.equal(respuesta.status, 401, `${metodo} ${ruta}`);
  }

  assert.equal((await db.query("SELECT 1 FROM productos")).rowCount, 1, "el producto sigue ahí");
  assert.equal(await stockDe(malla), 5);
});

test("panel: una sesión inventada, vencida o firmada con otra clave no sirve", async () => {
  const firmar = (contenido, secreto) =>
    `${contenido}:${crypto.createHmac("sha256", secreto).update(contenido).digest("hex")}`;

  const secretoReal = process.env.ADMIN_SESSION_SECRET;
  const enUnaHora = Date.now() + 3600000;

  const intentos = {
    inventada: "admin:9999999999999:abcdef",
    "otra clave": firmar(`admin:${enUnaHora}`, "y".repeat(40)),
    vencida: firmar(`admin:${Date.now() - 1000}`, secretoReal),
    "fecha cambiada": firmar(`admin:${enUnaHora}`, secretoReal).replace(String(enUnaHora), String(enUnaHora + 1))
  };

  for (const [caso, token] of Object.entries(intentos)) {
    const respuesta = await tienda.pedir("GET", "/api/admin/pedidos", { cookie: `admin_sesion=${token}` });
    assert.equal(respuesta.status, 401, caso);
  }

  /* Control: una bien firmada sí entra */
  const buena = firmar(`admin:${enUnaHora}`, secretoReal);
  const respuesta = await tienda.pedir("GET", "/api/admin/pedidos", { cookie: `admin_sesion=${buena}` });
  assert.equal(respuesta.status, 200);
});

test("panel: login, uso y cierre de sesión", async () => {
  const mal = await tienda.pedir("POST", "/api/admin/login", { cuerpo: { ...ADMIN, password: "otra" } });
  assert.equal(mal.status, 401);
  assert.equal(cookieDe(mal, "admin_sesion"), null);

  const sesion = await entrarAlPanel();
  assert.match(sesion.atributos, /HttpOnly/i, "el JavaScript de la página no puede leerla");
  assert.match(sesion.atributos, /SameSite=Strict/i, "otro sitio no puede usarla");

  const pedidos = await tienda.pedir("GET", "/api/admin/pedidos", { cookie: sesion.valor });
  assert.equal(pedidos.status, 200);

  const salir = await tienda.pedir("POST", "/api/admin/logout", { cookie: sesion.valor });
  assert.match(cookieDe(salir, "admin_sesion").atributos, /Expires=Thu, 01 Jan 1970/);
});

test("panel: después de 10 contraseñas incorrectas, bloquea los intentos", async () => {
  const otra = await levantar(crearApp()); // contadores propios
  try {
    for (let i = 0; i < 10; i++) {
      const r = await otra.pedir("POST", "/api/admin/login", { cuerpo: { usuario: "admin", password: `mal-${i}` } });
      assert.equal(r.status, 401);
    }

    const bloqueado = await otra.pedir("POST", "/api/admin/login", { cuerpo: ADMIN });
    assert.equal(bloqueado.status, 429, "ni con la contraseña correcta");
  } finally {
    await otra.cerrar();
  }
});

/* ---------- Panel: cargar el catálogo ---------- */

test("panel: crear un producto con talles y colores, y verlo en la tienda", async () => {
  const { valor: cookie } = await entrarAlPanel();

  const creado = await tienda.pedir("POST", "/api/admin/productos", {
    cookie,
    cuerpo: {
      nombre: "Pollera de Folklore",
      precio: 45000,
      precio_oferta: 39900,
      imagenes: [{ url: "https://res.cloudinary.com/demo/pollera.jpg", color: "Rojo" }]
    }
  });
  const producto = await creado.json();
  assert.equal(creado.status, 201);
  assert.equal(producto.slug, "pollera-de-folklore");

  const variantes = await tienda.pedir("POST", `/api/admin/productos/${producto.id}/variantes`, {
    cookie,
    cuerpo: { talles: ["s", "M"], colores: [{ nombre: "Rojo", hex: "#B00020" }], stock: 4 }
  });
  assert.equal((await variantes.json()).creadas, 2);

  const publico = await (await tienda.pedir("GET", "/api/productos/pollera-de-folklore")).json();
  assert.equal(publico.precio_oferta, 39900);
  assert.deepEqual(publico.variantes.map((v) => v.talle), ["S", "M"]);
  assert.equal(publico.variantes[0].stock, undefined, "el stock exacto no se publica");
  assert.equal(publico.variantes[0].disponible, true);
});

test("panel: rechaza datos inválidos con un mensaje claro (nunca un error 500)", async () => {
  const { valor: cookie } = await entrarAlPanel();
  const malla = await crearVariante();
  const base = { nombre: "Malla", precio: 10000 };

  const casos = [
    ["POST", "/api/admin/productos", { ...base, precio: -5 }],
    ["POST", "/api/admin/productos", { ...base, precio: "gratis" }],
    ["POST", "/api/admin/productos", { ...base, precio_oferta: 10000 }],
    ["POST", "/api/admin/productos", { ...base, imagenes: [{ url: "javascript:alert(1)" }] }],
    ["POST", "/api/admin/productos", { ...base, imagenes: [null] }],
    ["POST", "/api/admin/productos", { ...base, categoria_id: 999 }],
    ["POST", "/api/admin/productos", { precio: 10000 }],
    ["POST", `/api/admin/productos/${malla.productoId}/variantes`, { talles: ["M"], colores: [null] }],
    ["PUT", `/api/admin/variantes/${malla.id}`, { stock: -1 }],
    ["PUT", `/api/admin/variantes/${malla.id}`, { stock: 1.5 }],
    ["PUT", "/api/admin/variantes/abc", { stock: 1 }],
    ["POST", "/api/admin/categorias", { nombre: "" }]
  ];

  for (const [metodo, ruta, cuerpo] of casos) {
    const respuesta = await tienda.pedir(metodo, ruta, { cookie, cuerpo });
    assert.equal(respuesta.status, 400, `${metodo} ${ruta} ${JSON.stringify(cuerpo)}`);
    assert.ok((await respuesta.json()).error);
  }
});

/* ---------- Catálogo público ---------- */

test("catálogo: solo muestra productos activos y filtra por talle, color, precio y búsqueda", async () => {
  const negra = await crearVariante({ precio: 10000, talle: "M", color: "Negro" });
  const rosa = await crearVariante({ precio: 30000, talle: "S", color: "Rosa" });
  const pausada = await crearVariante({ precio: 20000 });
  await db.query("UPDATE productos SET activo = FALSE WHERE id = $1", [pausada.productoId]);

  const ver = async (consulta) =>
    (await (await tienda.pedir("GET", `/api/productos?${consulta}`)).json()).productos.map((p) => p.id);

  assert.deepEqual((await ver("orden=precio_asc")), [negra.productoId, rosa.productoId]);
  assert.deepEqual(await ver("talle=S"), [rosa.productoId]);
  assert.deepEqual(await ver("color=Negro"), [negra.productoId]);
  assert.deepEqual(await ver("min=20000"), [rosa.productoId]);
  assert.deepEqual(await ver("max=20000"), [negra.productoId]);
  assert.deepEqual(await ver(`buscar=${encodeURIComponent(negra.nombre)}`), [negra.productoId]);
  assert.deepEqual(await ver("buscar=%25"), [], "el % se busca como texto, no como comodín");

  const detalle = await tienda.pedir("GET", `/api/productos/${pausada.slug}`);
  assert.equal(detalle.status, 404, "un producto pausado tampoco se ve por link directo");
});

test("catálogo: parámetros raros en la URL nunca rompen el servidor", async () => {
  await crearVariante();

  const consultas = [
    "orden=constructor",
    "orden=__proto__",
    "orden=nuevos;DROP TABLE productos",
    "pagina=1e30",
    "pagina=-4",
    "pagina=abc",
    "pagina=Infinity",
    "por_pagina=1.5",
    "por_pagina=999999",
    "min=1e300&max=1e300",
    "categoria[]=a&categoria[]=b",
    "talle[x]=1&color[y]=2",
    "buscar=" + "a".repeat(5000),
    "categoria=' OR 1=1 --"
  ];

  for (const consulta of consultas) {
    for (const ruta of ["/api/productos", "/api/productos/filtros"]) {
      const respuesta = await tienda.pedir("GET", `${ruta}?${consulta}`);
      assert.equal(respuesta.status, 200, `${ruta}?${consulta.slice(0, 60)}`);
    }
  }

  assert.equal((await db.query("SELECT 1 FROM productos")).rowCount, 1);
});

/* ---------- Carrito ---------- */

test("carrito: cada visitante tiene el suyo y no se puede pedir más que el stock", async () => {
  const malla = await crearVariante({ stock: 2, precio: 10000 });

  const agregado = await tienda.pedir("POST", "/api/carrito/items", {
    cuerpo: { variante_id: malla.id, cantidad: 5 }
  });
  const carrito = await agregado.json();
  const cookie = cookieDe(agregado, "carrito");

  assert.equal(agregado.status, 201);
  assert.match(cookie.atributos, /HttpOnly/i);
  assert.equal(carrito.items[0].cantidad, 2, "se queda con lo que hay");
  assert.equal(carrito.subtotal, 20000);
  assert.ok(carrito.aviso);

  const pasarse = await tienda.pedir("PUT", `/api/carrito/items/${malla.id}`, {
    cookie: cookie.valor,
    cuerpo: { cantidad: 3 }
  });
  assert.equal(pasarse.status, 409);

  const otraVisita = await (await tienda.pedir("GET", "/api/carrito")).json();
  assert.deepEqual(otraVisita.items, [], "otra persona no ve este carrito");

  const mio = await (await tienda.pedir("GET", "/api/carrito", { cookie: cookie.valor })).json();
  assert.equal(mio.cantidad, 2);
});

test("carrito: cantidades y productos inválidos se rechazan", async () => {
  const malla = await crearVariante({ stock: 5 });
  const agotada = await crearVariante({ stock: 0 });

  const casos = [
    [{ variante_id: malla.id, cantidad: 0 }, 400],
    [{ variante_id: malla.id, cantidad: -3 }, 400],
    [{ variante_id: malla.id, cantidad: 2.5 }, 400],
    [{ variante_id: malla.id, cantidad: 11 }, 400],
    [{ variante_id: "abc" }, 400],
    [{ variante_id: 99999 }, 404],
    [{ variante_id: agotada.id }, 409]
  ];

  for (const [cuerpo, esperado] of casos) {
    const respuesta = await tienda.pedir("POST", "/api/carrito/items", { cuerpo });
    assert.equal(respuesta.status, esperado, JSON.stringify(cuerpo));
  }
});

/* ---------- Botón de arrepentimiento ---------- */

test("arrepentimiento: responde igual exista o no el pedido, y frena el abuso", async () => {
  const otra = await levantar(crearApp()); // contadores propios
  try {
    const malla = await crearVariante();
    const orden = await crearOrden([{ variante: malla }]);
    const pedir = (cuerpo) => otra.pedir("POST", "/api/arrepentimiento", { cuerpo });

    const real = await pedir({ nombre: "Ana Prueba", email: "CLIENTA@correo.test", pedido: `#${orden.id}` });
    const ajeno = await pedir({ nombre: "Ana Prueba", email: "otra@correo.test", pedido: String(orden.id) });
    const [datosReal, datosAjeno] = [await real.json(), await ajeno.json()];

    assert.equal(real.status, 201);
    assert.equal(ajeno.status, 201);
    assert.match(datosReal.codigo, /^ARR-\d{8}-[A-Z2-9]{6}$/);
    assert.deepEqual(Object.keys(datosReal), Object.keys(datosAjeno), "no revela si el pedido existe");

    const guardadas = (await db.query("SELECT orden_id FROM arrepentimientos ORDER BY id")).rows;
    assert.deepEqual(guardadas.map((s) => s.orden_id), [orden.id, null]);

    const mails = await entorno.esperarMails();
    assert.equal(mails.filter((m) => m.para === "tienda@tienda.test").length, 2);

    const incompleta = await pedir({ nombre: "Ana", email: "no-es-un-mail", pedido: "1" });
    assert.equal(incompleta.status, 400);

    /* Van 3 pedidos: el límite es 5 por hora */
    await pedir({ nombre: "Ana Prueba", email: "a@correo.test", pedido: "1" });
    await pedir({ nombre: "Ana Prueba", email: "a@correo.test", pedido: "1" });
    const sexta = await pedir({ nombre: "Ana Prueba", email: "a@correo.test", pedido: "1" });
    assert.equal(sexta.status, 429);
  } finally {
    await otra.cerrar();
  }
});

/* ---------- Servidor ---------- */

test("servidor: cabeceras de seguridad, errores prolijos y páginas privadas fuera de Google", async () => {
  const inicio = await tienda.pedir("GET", "/");
  assert.equal(inicio.status, 200);
  assert.equal(inicio.headers.get("x-powered-by"), null);
  assert.equal(inicio.headers.get("x-content-type-options"), "nosniff");

  const csp = inicio.headers.get("content-security-policy");
  assert.match(csp, /script-src 'self'(;|$)/, "solo scripts propios");
  assert.match(csp, /frame-ancestors 'none'/, "no se puede incrustar en otro sitio");

  const panel = await tienda.pedir("GET", "/admin.html");
  assert.match(panel.headers.get("x-robots-tag"), /noindex/);

  const api = await tienda.pedir("GET", "/api/health");
  assert.deepEqual(await api.json(), { ok: true });
  assert.equal(api.headers.get("cache-control"), "no-store");

  const rutaInexistente = await tienda.pedir("GET", "/api/no-existe");
  assert.equal(rutaInexistente.status, 404);
  assert.ok((await rutaInexistente.json()).error);

  const paginaInexistente = await tienda.pedir("GET", "/no-existe");
  assert.equal(paginaInexistente.status, 404);
  assert.match(paginaInexistente.headers.get("content-type"), /text\/html/);

  const jsonRoto = await tienda.pedir("POST", "/api/carrito/items", { crudo: "{esto no es json" });
  assert.equal(jsonRoto.status, 400);

  const enorme = await tienda.pedir("POST", "/api/carrito/items", { crudo: JSON.stringify({ x: "a".repeat(300000) }) });
  assert.equal(enorme.status, 413);

  for (const secreto of ["/.env", "/../.env", "/backend/config.js", "/package.json"]) {
    const respuesta = await tienda.pedir("GET", secreto);
    assert.equal(respuesta.status, 404, `${secreto} no se sirve`);
  }
});

test("servidor: /api/config no publica ningún secreto", async () => {
  const texto = await (await tienda.pedir("GET", "/api/config")).text();

  for (const secreto of ["TEST-token-falso", "secreto-de-prueba", "password-de-prueba", "re_falsa", "x".repeat(40)]) {
    assert.ok(!texto.includes(secreto), `no aparece ${secreto.slice(0, 8)}...`);
  }
});

/* ---------- Buscadores ---------- */

test("buscadores: el sitemap lista lo que está a la venta y robots.txt apunta a él", async () => {
  const activa = await crearVariante();
  const pausada = await crearVariante();
  await db.query("UPDATE productos SET activo = FALSE WHERE id = $1", [pausada.productoId]);
  await db.query("INSERT INTO categorias (nombre, slug) VALUES ('Ballet', 'ballet'), ('Oculta', 'oculta')");
  await db.query("UPDATE categorias SET activo = FALSE WHERE slug = 'oculta'");

  const sitemap = await tienda.pedir("GET", "/sitemap.xml");
  const xml = await sitemap.text();

  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type"), /xml/);
  assert.ok(xml.includes("<loc>https://tienda.test/</loc>"));
  assert.ok(xml.includes(`<loc>https://tienda.test/producto.html?p=${activa.slug}</loc>`));
  assert.ok(xml.includes("<loc>https://tienda.test/tienda.html?categoria=ballet</loc>"));
  assert.ok(!xml.includes(pausada.slug), "un producto pausado no se publica");
  assert.ok(!xml.includes("oculta"), "una categoría oculta tampoco");
  assert.ok(!xml.includes("admin"), "el panel no figura");

  const robots = await (await tienda.pedir("GET", "/robots.txt")).text();
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Sitemap: https:\/\/tienda\.test\/sitemap\.xml$/m);
});
