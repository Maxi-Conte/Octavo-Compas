/* =====================================================
   RUTAS: checkout, webhook de Mercado Pago y cancelación
   desde el panel. Se prueban por HTTP contra un servidor
   local, con Mercado Pago reemplazado por un doble.
===================================================== */

const entorno = require("./ayuda/entorno");
const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");

const { manejarErrores } = require("../backend/utils/http");
const {
  db, mp, SECRETO_WEBHOOK,
  crearVariante, crearCarrito, crearOrden, pagoMP, stockDe, leerOrden
} = entorno;

let servidor;
let base;

before(async () => {
  await entorno.prepararBase();

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", require("../backend/routes/pagos"));
  /* En server.js esta ruta va detrás del login de admin; acá probamos solo su lógica */
  app.use("/api/admin/pedidos", require("../backend/routes/admin/pedidos"));
  app.use(manejarErrores);

  await new Promise((listo) => {
    servidor = app.listen(0, "127.0.0.1", listo);
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

beforeEach(entorno.limpiar);

after(async () => {
  await new Promise((listo) => servidor.close(listo));
  await entorno.cerrar();
});

function pedir(metodo, ruta, { cuerpo, cabeceras = {} } = {}) {
  return fetch(base + ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...cabeceras },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
}

/* ---------- Webhook ---------- */

function firmar(pagoId, { secreto = SECRETO_WEBHOOK, requestId = "req-1", ts = "1700000000" } = {}) {
  const manifiesto = `id:${pagoId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secreto).update(manifiesto).digest("hex");
  return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId };
}

function avisar(pagoId, cabeceras) {
  return pedir("POST", `/api/pagos/webhook?data.id=${pagoId}&type=payment`, {
    cuerpo: { type: "payment", data: { id: String(pagoId) } },
    cabeceras
  });
}

test("webhook con firma válida: consulta el pago real y marca el pedido como pagado", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla }]);
  mp.pagos.set("777", pagoMP(orden, { id: 777 }));

  const respuesta = await avisar(777, firmar(777));

  assert.equal(respuesta.status, 200);
  assert.deepEqual(mp.consultas, ["777"]);
  assert.equal((await leerOrden(orden)).estado, "pagado");
  assert.equal(await stockDe(malla), 4);
});

test("webhook con firma falsa o sin firma: 401 y no toca nada", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla }]);
  mp.pagos.set("777", pagoMP(orden, { id: 777 }));

  const falsa = await avisar(777, firmar(777, { secreto: "otro-secreto" }));
  const deOtroPago = await avisar(777, firmar(778));
  const sinFirma = await avisar(777, {});

  assert.equal(falsa.status, 401);
  assert.equal(deOtroPago.status, 401);
  assert.equal(sinFirma.status, 401);
  assert.deepEqual(mp.consultas, [], "ni siquiera consulta a Mercado Pago");
  assert.equal((await leerOrden(orden)).estado, "pendiente");
  assert.equal(await stockDe(malla), 5);
});

test("webhook: el contenido del aviso no importa, solo lo que dice Mercado Pago", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla }]);
  mp.pagos.set("777", pagoMP(orden, { id: 777, status: "rejected" }));

  const respuesta = await pedir("POST", "/api/pagos/webhook?data.id=777&type=payment", {
    cuerpo: { type: "payment", data: { id: "777" }, status: "approved", action: "payment.approved" },
    cabeceras: firmar(777)
  });

  assert.equal(respuesta.status, 200);
  assert.equal((await leerOrden(orden)).estado, "rechazado");
  assert.equal(await stockDe(malla), 5);
});

test("webhook de otro tipo de aviso: responde 200 y lo ignora", async () => {
  const respuesta = await pedir("POST", "/api/pagos/webhook?id=5&topic=merchant_order", { cuerpo: {} });

  assert.equal(respuesta.status, 200);
  assert.deepEqual(mp.consultas, []);
});

test("webhook cuando Mercado Pago no responde: 500 para que reintente", async () => {
  const respuesta = await avisar(999, firmar(999)); // el doble no conoce el pago 999

  assert.equal(respuesta.status, 500);
});

/* ---------- Checkout ---------- */

const COMPRADORA = {
  nombre: "Ana Prueba",
  email: "ana@correo.test",
  telefono: "261 555 0000",
  dni: "30111222",
  metodo_entrega: "envio",
  direccion: "San Martín 100",
  ciudad: "Mendoza",
  provincia: "Mendoza",
  codigo_postal: "5500"
};

function comprar(carrito, extra = {}) {
  return pedir("POST", "/api/checkout", {
    cuerpo: { ...COMPRADORA, ...extra },
    cabeceras: { Cookie: `carrito=${carrito.token}` }
  });
}

test("checkout: los precios salen de la base, no del navegador, y el stock no se descuenta todavía", async () => {
  const malla = await crearVariante({ precio: 20000, precioOferta: 15000, stock: 5 });
  const carrito = await crearCarrito([{ variante: malla, cantidad: 2 }]);

  const respuesta = await comprar(carrito, { total: 1, items: [{ precio: 1 }] });
  const datos = await respuesta.json();

  assert.equal(respuesta.status, 200);
  assert.equal(datos.url_pago, "https://mp.test/pagar");

  const orden = (await db.query("SELECT * FROM ordenes")).rows[0];
  assert.equal(orden.estado, "pendiente");
  assert.equal(Number(orden.subtotal), 30000, "2 × precio de oferta");
  assert.equal(Number(orden.costo_envio), 7000);
  assert.equal(Number(orden.total), 37000);
  assert.equal(orden.token_publico, datos.orden);
  assert.equal(orden.mp_preference_id, "pref-1");
  assert.equal(await stockDe(malla), 5);

  const preferencia = mp.preferencias[0];
  assert.equal(preferencia.external_reference, String(orden.id));
  const cobrado = preferencia.items.reduce((suma, i) => suma + i.unit_price * i.quantity, 0);
  assert.equal(cobrado, 37000, "lo que cobra Mercado Pago coincide con el total del pedido");
  assert.equal(preferencia.notification_url, "https://tienda.test/api/pagos/webhook");
});

test("checkout: envío gratis desde el monto configurado y retiro sin costo", async () => {
  const vestido = await crearVariante({ precio: 160000, stock: 5 });
  const carrito = await crearCarrito([{ variante: vestido }]);

  await comprar(carrito);
  await comprar(carrito, { metodo_entrega: "retiro" });

  const ordenes = (await db.query("SELECT costo_envio, total FROM ordenes ORDER BY id")).rows;
  assert.deepEqual(ordenes.map((o) => Number(o.costo_envio)), [0, 0]);
  assert.deepEqual(ordenes.map((o) => Number(o.total)), [160000, 160000]);
});

test("checkout sin stock suficiente: 409 y no se crea ningún pedido", async () => {
  const malla = await crearVariante({ stock: 1 });
  const carrito = await crearCarrito([{ variante: malla, cantidad: 2 }]);

  const respuesta = await comprar(carrito);

  assert.equal(respuesta.status, 409);
  assert.match((await respuesta.json()).error, /solo quedan 1/);
  assert.equal((await db.query("SELECT 1 FROM ordenes")).rowCount, 0);
  assert.equal(mp.preferencias.length, 0);
});

test("checkout con el producto pausado o el carrito vacío: no deja comprar", async () => {
  const malla = await crearVariante({ stock: 5 });
  const carrito = await crearCarrito([{ variante: malla }]);
  await db.query("UPDATE productos SET activo = FALSE WHERE id = $1", [malla.productoId]);

  const pausado = await comprar(carrito);
  const vacio = await comprar(await crearCarrito([]));

  assert.equal(pausado.status, 409);
  assert.equal(vacio.status, 400);
  assert.equal((await db.query("SELECT 1 FROM ordenes")).rowCount, 0);
});

test("checkout cuando Mercado Pago falla: 502 y no queda un pedido huérfano", async () => {
  const malla = await crearVariante({ stock: 5 });
  const carrito = await crearCarrito([{ variante: malla }]);
  mp.fallarPreferencia = true;

  const respuesta = await comprar(carrito);

  assert.equal(respuesta.status, 502);
  assert.equal((await db.query("SELECT 1 FROM ordenes")).rowCount, 0);
});

test("estado del pedido: solo con el token, y sin datos personales", async () => {
  const malla = await crearVariante();
  const orden = await crearOrden([{ variante: malla }]);

  const porNumero = await pedir("GET", `/api/ordenes/${orden.id}`);
  const porToken = await pedir("GET", `/api/ordenes/${orden.token}`);
  const datos = await porToken.json();

  assert.equal(porNumero.status, 404);
  assert.equal(porToken.status, 200);
  assert.equal(datos.estado, "pendiente");
  for (const privado of ["email", "telefono", "dni", "direccion", "nombre"]) {
    assert.equal(datos[privado], undefined, `no expone ${privado}`);
  }
});

/* ---------- Panel: cambios de estado ---------- */

function cambiarEstado(orden, estado) {
  return pedir("PATCH", `/api/admin/pedidos/${orden.id}/estado`, { cuerpo: { estado } });
}

test("panel: cancelar un pedido pagado devuelve el stock, y no se puede cancelar dos veces", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla, cantidad: 2 }]);
  mp.pagos.set("777", pagoMP(orden, { id: 777 }));
  await avisar(777, firmar(777));
  assert.equal(await stockDe(malla), 3);

  const primera = await cambiarEstado(orden, "cancelado");
  const segunda = await cambiarEstado(orden, "cancelado");

  assert.equal(primera.status, 200);
  assert.equal(segunda.status, 409);
  assert.equal(await stockDe(malla), 5, "vuelve una sola vez");
  assert.equal((await leerOrden(orden)).estado, "cancelado");
});

test("panel: cancelar un pedido sin pagar no suma stock", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla, cantidad: 2 }]);

  const respuesta = await cambiarEstado(orden, "cancelado");

  assert.equal(respuesta.status, 200);
  assert.equal(await stockDe(malla), 5);
});

test("panel: no se puede preparar ni marcar como pagado un pedido sin pago aprobado", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla }]);

  const preparar = await cambiarEstado(orden, "preparando");
  const pagarAMano = await cambiarEstado(orden, "pagado");

  assert.equal(preparar.status, 409);
  assert.equal(pagarAMano.status, 400);
  assert.equal((await leerOrden(orden)).estado, "pendiente");
});

test("pago que llega justo cuando el panel cancela el pedido: nunca pasa desapercibido", async () => {
  for (let intento = 0; intento < 8; intento++) {
    await entorno.limpiar();
    const malla = await crearVariante({ stock: 5 });
    const orden = await crearOrden([{ variante: malla }]);
    mp.pagos.set("777", pagoMP(orden, { id: 777 }));

    await Promise.all([cambiarEstado(orden, "cancelado"), avisar(777, firmar(777))]);

    const guardada = await leerOrden(orden);
    assert.equal(guardada.estado, "cancelado");
    assert.equal(await stockDe(malla), 5, "el stock queda como estaba");
    /* Si el pago entró primero, el panel lo canceló como pagado (avisa del reintegro).
       Si entró después, tiene que quedar marcado para revisión. */
    assert.ok(
      guardada.mp_payment_id === "777" || guardada.requiere_revision,
      "el pago aprobado quedó registrado o marcado para revisión"
    );
  }
});

/* ---------- El SDK de Mercado Pago de verdad ---------- */

test("SDK de Mercado Pago sin dobles: las llamadas salen a la API con el formato correcto", async () => {
  const malla = await crearVariante({ precio: 20000, stock: 5 });
  const carrito = await crearCarrito([{ variante: malla, cantidad: 2 }]);
  const llamadas = [];
  let ordenId = null;

  const json = (cuerpo) =>
    new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });

  const deshacer = entorno.usarSdkReal(async (url, opciones) => {
    const cabeceras = new Headers(opciones.headers);
    llamadas.push({
      url: url.split("?")[0].replace(/\/$/, ""),
      metodo: opciones.method,
      autorizacion: cabeceras.get("authorization"),
      cuerpo: opciones.body ? JSON.parse(opciones.body) : null
    });

    if (url.includes("/checkout/preferences")) {
      return json({ id: "pref-real", init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-real" });
    }
    if (url.includes("/v1/payments/888")) {
      return json({ id: 888, status: "approved", external_reference: String(ordenId), transaction_amount: 47000, currency_id: "ARS" });
    }
    return new Response("{}", { status: 404, headers: { "Content-Type": "application/json" } });
  });

  try {
    const compra = await comprar(carrito);
    const datos = await compra.json();
    assert.equal(compra.status, 200);
    assert.match(datos.url_pago, /^https:\/\/www\.mercadopago\.com\.ar\//);

    const orden = (await db.query("SELECT id, mp_preference_id FROM ordenes")).rows[0];
    ordenId = orden.id;
    assert.equal(orden.mp_preference_id, "pref-real");

    const preferencia = llamadas[0];
    assert.equal(preferencia.url, "https://api.mercadopago.com/checkout/preferences");
    assert.equal(preferencia.metodo, "POST");
    assert.equal(preferencia.autorizacion, "Bearer TEST-token-falso");
    assert.equal(preferencia.cuerpo.external_reference, String(orden.id));
    assert.equal(preferencia.cuerpo.items[0].unit_price, 20000);
    assert.equal(preferencia.cuerpo.items[0].quantity, 2);

    const aviso = await avisar(888, firmar(888));
    assert.equal(aviso.status, 200);

    const consulta = llamadas[1];
    assert.equal(consulta.url, "https://api.mercadopago.com/v1/payments/888");
    assert.equal(consulta.metodo, "GET");
    assert.equal(consulta.autorizacion, "Bearer TEST-token-falso");

    assert.equal((await leerOrden({ id: orden.id })).estado, "pagado");
    assert.equal(await stockDe(malla), 3);
  } finally {
    deshacer();
  }
});
