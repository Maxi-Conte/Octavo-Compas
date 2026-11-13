/* =====================================================
   PAGOS Y STOCK: la lógica de services/pedidos.js
   Qué pasa con el pedido y con el stock ante cada aviso
   de Mercado Pago.
===================================================== */

const entorno = require("./ayuda/entorno");
const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const { procesarPago, devolverStock } = require("../backend/services/pedidos");
const {
  db, mails, esperarMails,
  crearVariante, crearCarrito, crearOrden, pagoMP, stockDe, leerOrden
} = entorno;

before(entorno.prepararBase);
beforeEach(entorno.limpiar);
after(entorno.cerrar);

const asuntos = async () => (await esperarMails()).map((m) => m.asunto);

/* ---------- Pago aprobado ---------- */

test("pago aprobado: el pedido queda pagado y se descuenta el stock", async () => {
  const malla = await crearVariante({ stock: 5 });
  const falda = await crearVariante({ stock: 3 });
  const carrito = await crearCarrito([{ variante: malla, cantidad: 2 }, { variante: falda }]);
  const orden = await crearOrden([{ variante: malla, cantidad: 2 }, { variante: falda }], { carritoId: carrito.id });

  const r = await procesarPago(pagoMP(orden));

  assert.equal(r.resultado, "pagado");
  assert.equal(await stockDe(malla), 3);
  assert.equal(await stockDe(falda), 2);

  const guardada = await leerOrden(orden);
  assert.equal(guardada.estado, "pagado");
  assert.equal(guardada.mp_payment_id, "1001");
  assert.equal(guardada.requiere_revision, false);

  const enCarrito = await db.query("SELECT 1 FROM carrito_items WHERE carrito_id = $1", [carrito.id]);
  assert.equal(enCarrito.rowCount, 0, "lo comprado sale del carrito");

  const enviados = await asuntos();
  assert.equal(enviados.length, 2, "confirmación a la clienta + aviso a la tienda");
  assert.ok(mails.some((m) => m.para === "clienta@correo.test"));
  assert.ok(mails.some((m) => m.para === "tienda@tienda.test"));
});

test("aviso repetido del mismo pago: no descuenta ni avisa dos veces", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla, cantidad: 2 }]);

  await procesarPago(pagoMP(orden));
  const segunda = await procesarPago(pagoMP(orden));

  assert.equal(segunda.resultado, "sin cambios");
  assert.equal(await stockDe(malla), 3);
  assert.equal((await asuntos()).length, 2);
  assert.equal((await leerOrden(orden)).requiere_revision, false);
});

test("el mismo aviso llegando 6 veces a la vez descuenta una sola vez", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla, cantidad: 2 }]);

  const resultados = await Promise.all(
    Array.from({ length: 6 }, () => procesarPago(pagoMP(orden)))
  );

  assert.equal(resultados.filter((r) => r.resultado === "pagado").length, 1);
  assert.equal(await stockDe(malla), 3);
  assert.equal((await asuntos()).length, 2);
});

test("dos clientas pagan la última unidad: nunca queda stock negativo y una va a revisión", async () => {
  const tutu = await crearVariante({ stock: 1 });
  const ordenA = await crearOrden([{ variante: tutu }]);
  const ordenB = await crearOrden([{ variante: tutu }]);

  await Promise.all([
    procesarPago(pagoMP(ordenA, { id: 1 })),
    procesarPago(pagoMP(ordenB, { id: 2 }))
  ]);

  assert.equal(await stockDe(tutu), 0);

  const [a, b] = [await leerOrden(ordenA), await leerOrden(ordenB)];
  assert.equal(a.estado, "pagado");
  assert.equal(b.estado, "pagado");
  assert.equal([a, b].filter((o) => o.requiere_revision).length, 1, "solo una necesita revisión");

  const conProblema = a.requiere_revision ? a : b;
  assert.match(conProblema.nota_revision, /Sin stock suficiente/);
  assert.ok((await asuntos()).some((s) => s.includes("Revisar pedido")));
});

test("pedido con una prenda sin stock: descuenta la que hay y al cancelar devuelve solo esa", async () => {
  const malla = await crearVariante({ stock: 5 });
  const tutu = await crearVariante({ stock: 0 });
  const orden = await crearOrden([{ variante: malla, cantidad: 2 }, { variante: tutu }]);

  const r = await procesarPago(pagoMP(orden));

  assert.equal(r.resultado, "pagado");
  assert.equal(await stockDe(malla), 3);
  assert.equal(await stockDe(tutu), 0);
  assert.equal((await leerOrden(orden)).requiere_revision, true);

  await db.transaccion((cliente) => devolverStock(orden.id, cliente));

  assert.equal(await stockDe(malla), 5);
  assert.equal(await stockDe(tutu), 0, "no se devuelve stock que nunca salió");
});

test("monto pagado menor al total: va a revisión", async () => {
  const malla = await crearVariante({ precio: 10000 });
  const orden = await crearOrden([{ variante: malla }]);

  const r = await procesarPago(pagoMP(orden, { monto: 100 }));

  assert.equal(r.resultado, "pagado");
  const guardada = await leerOrden(orden);
  assert.equal(guardada.requiere_revision, true);
  assert.match(guardada.nota_revision, /menor al total/);
});

test("pago en otra moneda: va a revisión", async () => {
  const malla = await crearVariante();
  const orden = await crearOrden([{ variante: malla }]);

  await procesarPago(pagoMP(orden, { moneda: "USD" }));

  assert.match((await leerOrden(orden)).nota_revision, /Moneda inesperada/);
});

test("la variante se borró entre el checkout y el pago: va a revisión", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla }]);
  await db.query("DELETE FROM variantes WHERE id = $1", [malla.id]);

  const r = await procesarPago(pagoMP(orden));

  assert.equal(r.resultado, "pagado");
  const guardada = await leerOrden(orden);
  assert.equal(guardada.requiere_revision, true, "se cobró algo que ya no está en el catálogo");
});

/* ---------- Pagos que no deberían pasar desapercibidos ---------- */

test("segundo pago aprobado del mismo pedido (doble cobro): va a revisión una sola vez", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla }]);

  await procesarPago(pagoMP(orden, { id: 1 }));
  const duplicado = await procesarPago(pagoMP(orden, { id: 2 }));
  await procesarPago(pagoMP(orden, { id: 2 }));

  assert.equal(duplicado.resultado, "revision");
  assert.equal(await stockDe(malla), 4, "el stock se descuenta una sola vez");

  const guardada = await leerOrden(orden);
  assert.equal(guardada.estado, "pagado");
  assert.equal(guardada.mp_payment_id, "1", "el pedido sigue asociado al primer pago");
  assert.equal(guardada.requiere_revision, true);
  assert.equal(guardada.nota_revision.split("pago 2").length - 1, 1, "la nota no se repite");

  const alertas = (await asuntos()).filter((s) => s.includes("Revisar pedido"));
  assert.equal(alertas.length, 1);
});

test("pago aprobado sobre un pedido cancelado: va a revisión una sola vez", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla }]);
  await db.query("UPDATE ordenes SET estado = 'cancelado' WHERE id = $1", [orden.id]);

  const r = await procesarPago(pagoMP(orden));
  await procesarPago(pagoMP(orden));

  assert.equal(r.resultado, "revision");
  assert.equal(await stockDe(malla), 5);

  const guardada = await leerOrden(orden);
  assert.equal(guardada.estado, "cancelado");
  assert.equal(guardada.requiere_revision, true);
  assert.equal(guardada.nota_revision.split("pago 1001").length - 1, 1, "la nota no se repite");
  assert.equal((await asuntos()).length, 1, "una sola alerta a la tienda");
});

/* ---------- Devoluciones ---------- */

test("devolución del pago: el pedido se cancela y el stock vuelve una sola vez", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla, cantidad: 2 }]);
  await procesarPago(pagoMP(orden));

  const r = await procesarPago(pagoMP(orden, { status: "refunded" }));
  await procesarPago(pagoMP(orden, { status: "refunded" }));

  assert.equal(r.resultado, "cancelado");
  assert.equal(await stockDe(malla), 5);
  assert.equal((await leerOrden(orden)).estado, "cancelado");
});

test("devolver el pago duplicado NO cancela el pedido que sí está pagado", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla }]);
  await procesarPago(pagoMP(orden, { id: 1 }));
  await procesarPago(pagoMP(orden, { id: 2 }));

  const r = await procesarPago(pagoMP(orden, { id: 2, status: "refunded" }));

  assert.equal(r.resultado, "sin cambios");
  assert.equal((await leerOrden(orden)).estado, "pagado");
  assert.equal(await stockDe(malla), 4, "la prenda sigue vendida");
});

test("devolución de un pedido ya enviado: no reingresa stock solo, va a revisión", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla }]);
  await procesarPago(pagoMP(orden));
  await db.query("UPDATE ordenes SET estado = 'enviado' WHERE id = $1", [orden.id]);

  const r = await procesarPago(pagoMP(orden, { status: "refunded" }));
  await procesarPago(pagoMP(orden, { status: "refunded" }));

  assert.equal(r.resultado, "revision");
  assert.equal(await stockDe(malla), 4, "la prenda está en viaje: no vuelve al stock sola");

  const guardada = await leerOrden(orden);
  assert.equal(guardada.estado, "enviado");
  assert.equal(guardada.requiere_revision, true);
  assert.equal(guardada.nota_revision.split("pago 1001").length - 1, 1);
});

/* ---------- Rechazos y pendientes ---------- */

test("pago rechazado y después otro aprobado: el pedido termina pagado", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla }]);

  const rechazo = await procesarPago(pagoMP(orden, { id: 1, status: "rejected" }));
  assert.equal(rechazo.resultado, "rechazado");
  assert.equal((await leerOrden(orden)).estado, "rechazado");
  assert.equal(await stockDe(malla), 5);

  await procesarPago(pagoMP(orden, { id: 2 }));

  const guardada = await leerOrden(orden);
  assert.equal(guardada.estado, "pagado");
  assert.equal(guardada.mp_payment_id, "2");
  assert.equal(await stockDe(malla), 4);
});

test("un rechazo que llega tarde no pisa un pedido pagado", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla }]);
  await procesarPago(pagoMP(orden, { id: 2 }));

  await procesarPago(pagoMP(orden, { id: 1, status: "rejected" }));

  const guardada = await leerOrden(orden);
  assert.equal(guardada.estado, "pagado");
  assert.equal(guardada.mp_payment_id, "2");
});

test("pago pendiente: el pedido sigue pendiente y no toca el stock", async () => {
  const malla = await crearVariante({ stock: 5 });
  const orden = await crearOrden([{ variante: malla }]);

  const r = await procesarPago(pagoMP(orden, { status: "in_process" }));

  assert.equal(r.resultado, "pendiente");
  assert.equal((await leerOrden(orden)).estado, "pendiente");
  assert.equal(await stockDe(malla), 5);
  assert.equal((await asuntos()).length, 0);
});

test("pago sin pedido o de un pedido inexistente: se ignora", async () => {
  assert.equal((await procesarPago({ id: 1, status: "approved", external_reference: "abc" })).resultado, "ignorado");
  assert.equal((await procesarPago({ id: 1, status: "approved", external_reference: "999" })).resultado, "ignorado");
  assert.equal((await procesarPago({ id: 1, status: "approved" })).resultado, "ignorado");
});
