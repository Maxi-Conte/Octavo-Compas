/* =====================================================
   ENTORNO DE PRUEBAS
   Tiene que ser lo PRIMERO que requiere cada test: deja
   listas las variables antes de que se cargue el backend.

   - Usa una base aparte (la del .env + "_test"). Nunca la real.
   - Mercado Pago y Resend se reemplazan por dobles: no sale
     nada a internet.
===================================================== */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const raiz = path.join(__dirname, "..", "..");
require("dotenv").config({ path: path.join(raiz, ".env") });

/* ---------- Base de datos de prueba ---------- */

const urlReal = process.env.DATABASE_URL || "";

function urlDePrueba() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!urlReal) throw new Error("Falta DATABASE_URL en el .env (o definí TEST_DATABASE_URL).");

  const url = new URL(urlReal);
  url.pathname = url.pathname.replace(/\/+$/, "") + "_test";
  return url.toString();
}

const urlTest = urlDePrueba();
const nombreBase = decodeURIComponent(new URL(urlTest).pathname.slice(1));

/* Seguro: los tests borran todas las tablas, así que solo corren en una base "_test" */
if (!/^[a-z0-9_]+_test$/i.test(nombreBase)) {
  throw new Error(`La base de pruebas tiene que terminar en "_test" (recibí "${nombreBase}").`);
}

const SECRETO_WEBHOOK = "secreto-de-prueba";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: urlTest,
  FRONTEND_URL: "https://tienda.test",
  ADMIN_USER: "admin",
  ADMIN_PASSWORD: "password-de-prueba",
  ADMIN_SESSION_SECRET: "x".repeat(40),
  MP_ACCESS_TOKEN: "TEST-token-falso",
  MP_WEBHOOK_SECRET: SECRETO_WEBHOOK,
  ENVIO_COSTO: "7000",
  ENVIO_GRATIS_DESDE: "150000",
  RETIRO_DIRECCION: "Calle Falsa 123",
  RESEND_API_KEY: "re_falsa",
  MAIL_FROM: "Tienda <ventas@tienda.test>",
  MAIL_TIENDA: "tienda@tienda.test",
  NEGOCIO_NOMBRE: "Tienda de prueba"
});

/* ---------- Mails: se capturan en vez de enviarse ---------- */

const mails = [];
const fetchReal = globalThis.fetch;

globalThis.fetch = async (url, opciones) => {
  const destino = String(url);

  if (destino.startsWith("https://api.resend.com/")) {
    const cuerpo = JSON.parse(opciones.body);
    mails.push({ para: cuerpo.to[0], asunto: cuerpo.subject, html: cuerpo.html });
    return { ok: true, status: 200, text: async () => "" };
  }

  /* Solo dejamos pasar las llamadas al servidor de prueba local */
  if (destino.startsWith("http://127.0.0.1:")) return fetchReal(url, opciones);

  throw new Error(`Los tests no pueden salir a internet: ${destino}`);
};

/* Los mails salen "sin esperar": damos un momento para que terminen */
async function esperarMails() {
  for (let i = 0; i < 5; i++) await new Promise((listo) => setImmediate(listo));
  return mails;
}

/* ---------- Mercado Pago: dobles ---------- */

const mercadopago = require("mercadopago");

const mp = {
  pagos: new Map(),      // id -> pago que "devuelve" Mercado Pago
  consultas: [],         // ids consultados
  preferencias: [],      // cuerpos de las preferencias creadas
  fallarPreferencia: false
};

mercadopago.Payment.prototype.get = async function ({ id }) {
  mp.consultas.push(String(id));
  const pago = mp.pagos.get(String(id));
  if (!pago) throw new Error("Mercado Pago (doble): pago inexistente");
  return pago;
};

mercadopago.Preference.prototype.create = async function ({ body }) {
  if (mp.fallarPreferencia) throw new Error("Mercado Pago (doble): caído");
  mp.preferencias.push(body);
  return { id: `pref-${mp.preferencias.length}`, init_point: "https://mp.test/pagar" };
};

/* ---------- Preparar y limpiar la base ---------- */

const db = require("../../backend/db/database");

async function prepararBase() {
  /* Crea la base de pruebas si todavía no existe */
  if (urlReal && !process.env.TEST_DATABASE_URL) {
    const { Client } = require("pg");
    const cliente = new Client({ connectionString: urlReal });
    await cliente.connect();
    try {
      const existe = await cliente.query("SELECT 1 FROM pg_database WHERE datname = $1", [nombreBase]);
      if (existe.rowCount === 0) await cliente.query(`CREATE DATABASE "${nombreBase}"`);
    } finally {
      await cliente.end();
    }
  }

  await db.query(fs.readFileSync(path.join(raiz, "backend", "db", "schema.sql"), "utf8"));
}

async function limpiar() {
  await db.query(
    `TRUNCATE arrepentimientos, orden_items, ordenes, carrito_items, carritos,
              producto_imagenes, variantes, productos, categorias
     RESTART IDENTITY CASCADE`
  );
  mails.length = 0;
  mp.pagos.clear();
  mp.consultas.length = 0;
  mp.preferencias.length = 0;
  mp.fallarPreferencia = false;
}

async function cerrar() {
  await db.pool.end();
}

/* ---------- Datos de ejemplo ---------- */

let contador = 0;

async function crearVariante({ precio = 10000, precioOferta = null, stock = 5, talle = "M", color = "Negro" } = {}) {
  contador += 1;

  const producto = (
    await db.query(
      `INSERT INTO productos (nombre, slug, precio, precio_oferta)
       VALUES ($1, $2, $3, $4) RETURNING id, nombre`,
      [`Malla ${contador}`, `malla-${contador}`, precio, precioOferta]
    )
  ).rows[0];

  const variante = (
    await db.query(
      `INSERT INTO variantes (producto_id, talle, color, stock)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [producto.id, talle, color, stock]
    )
  ).rows[0];

  return {
    id: variante.id,
    productoId: producto.id,
    nombre: producto.nombre,
    talle,
    color,
    precio: Number(precioOferta ?? precio)
  };
}

async function crearCarrito(items) {
  const token = crypto.randomUUID();
  const carritoId = (await db.query("INSERT INTO carritos (token) VALUES ($1) RETURNING id", [token])).rows[0].id;

  for (const { variante, cantidad = 1 } of items) {
    await db.query(
      "INSERT INTO carrito_items (carrito_id, variante_id, cantidad) VALUES ($1, $2, $3)",
      [carritoId, variante.id, cantidad]
    );
  }

  return { id: carritoId, token };
}

/* Crea un pedido como lo deja el checkout: pendiente y sin descontar stock */
async function crearOrden(items, { metodo = "envio", carritoId = null } = {}) {
  const total = items.reduce((suma, { variante, cantidad = 1 }) => suma + variante.precio * cantidad, 0);

  const orden = (
    await db.query(
      `INSERT INTO ordenes (carrito_id, email, nombre, telefono, dni, metodo_entrega, subtotal, total)
       VALUES ($1, 'clienta@correo.test', 'Ana Prueba', '2615550000', '30111222', $2, $3, $3)
       RETURNING id, token_publico`,
      [carritoId, metodo, total]
    )
  ).rows[0];

  for (const { variante, cantidad = 1 } of items) {
    await db.query(
      `INSERT INTO orden_items (orden_id, variante_id, producto_id, nombre_producto,
                                talle, color, precio_unitario, cantidad)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orden.id, variante.id, variante.productoId, variante.nombre,
       variante.talle, variante.color, variante.precio, cantidad]
    );
  }

  return { id: orden.id, token: orden.token_publico, total };
}

/* Un pago como lo devuelve la API de Mercado Pago */
function pagoMP(orden, { id = 1001, status = "approved", monto = orden.total, moneda = "ARS" } = {}) {
  return {
    id,
    status,
    external_reference: String(orden.id),
    transaction_amount: monto,
    currency_id: moneda
  };
}

async function stockDe(variante) {
  return (await db.query("SELECT stock FROM variantes WHERE id = $1", [variante.id])).rows[0].stock;
}

async function leerOrden(orden) {
  return (await db.query("SELECT * FROM ordenes WHERE id = $1", [orden.id])).rows[0];
}

module.exports = {
  db,
  mp,
  mails,
  SECRETO_WEBHOOK,
  prepararBase,
  limpiar,
  cerrar,
  esperarMails,
  crearVariante,
  crearCarrito,
  crearOrden,
  pagoMP,
  stockDe,
  leerOrden
};
