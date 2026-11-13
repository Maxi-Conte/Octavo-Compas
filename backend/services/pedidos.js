/* =====================================================
   LÓGICA DE PEDIDOS Y PAGOS
   Separada de las rutas para poder probarla sola.
===================================================== */

const db = require("../db/database");
const {
  mailConfirmacionCompra,
  mailNuevaVenta,
  mailAlertaRevision,
  mailCambioEstado,
  enviarSinEsperar
} = require("../utils/mailer");

const ESTADOS = {
  pendiente: "Pago pendiente",
  rechazado: "Pago rechazado",
  pagado: "Pagado",
  preparando: "Preparando",
  enviado: "Enviado",
  listo_retiro: "Listo para retirar",
  entregado: "Entregado",
  cancelado: "Cancelado"
};

/* Estados en los que el stock ya se descontó */
const CON_STOCK_DESCONTADO = ["pagado", "preparando", "enviado", "listo_retiro", "entregado"];

/* ---------- Leer una orden con sus items ---------- */

async function obtenerOrden(ordenId, cliente = db) {
  const orden = (await cliente.query("SELECT * FROM ordenes WHERE id = $1", [ordenId])).rows[0];
  if (!orden) return null;

  const items = (
    await cliente.query(
      `SELECT variante_id, producto_id, nombre_producto, talle, color,
              precio_unitario, cantidad
       FROM orden_items WHERE orden_id = $1 ORDER BY id`,
      [ordenId]
    )
  ).rows;

  return {
    ...orden,
    subtotal: Number(orden.subtotal),
    costo_envio: Number(orden.costo_envio),
    total: Number(orden.total),
    items: items.map((i) => ({ ...i, precio_unitario: Number(i.precio_unitario) }))
  };
}

/* ---------- Stock ---------- */

/*
  Descuenta el stock de cada item SOLO si alcanza
  (la condición "stock >= cantidad" se evalúa dentro del UPDATE,
  así dos compras simultáneas nunca dejan stock negativo).
  Devuelve la lista de items que no se pudieron descontar.

  Siempre recorre las variantes en el mismo orden: así dos pedidos
  con las mismas prendas no se traban entre sí.
*/
async function descontarStock(ordenId, cliente) {
  const items = (
    await cliente.query(
      `SELECT id, variante_id, nombre_producto, talle, color, cantidad
       FROM orden_items
       WHERE orden_id = $1 AND NOT stock_descontado
       ORDER BY variante_id NULLS LAST, id`,
      [ordenId]
    )
  ).rows;

  const faltantes = [];

  for (const item of items) {
    const detalle = `${item.nombre_producto} (${item.color} / ${item.talle}) x${item.cantidad}`;

    /* La variante se borró del catálogo después del checkout */
    if (item.variante_id === null) {
      faltantes.push(`${detalle} [ya no existe en el catálogo]`);
      continue;
    }

    const resultado = await cliente.query(
      `UPDATE variantes SET stock = stock - $1
       WHERE id = $2 AND stock >= $1
       RETURNING id`,
      [item.cantidad, item.variante_id]
    );

    if (resultado.rowCount === 0) {
      faltantes.push(detalle);
    } else {
      await cliente.query("UPDATE orden_items SET stock_descontado = TRUE WHERE id = $1", [item.id]);
    }
  }

  return faltantes;
}

/* Devuelve solo lo que realmente se había descontado */
async function devolverStock(ordenId, cliente) {
  await cliente.query(
    `UPDATE variantes v SET stock = v.stock + oi.cantidad
     FROM orden_items oi
     WHERE oi.orden_id = $1 AND oi.variante_id = v.id AND oi.stock_descontado`,
    [ordenId]
  );

  await cliente.query(
    "UPDATE orden_items SET stock_descontado = FALSE WHERE orden_id = $1",
    [ordenId]
  );
}

/*
  Marca el pedido para revisión y anota el motivo.
  Devuelve false si ese mismo motivo ya estaba anotado: Mercado Pago
  repite sus avisos, y no queremos repetir la nota ni la alerta.
*/
async function marcarRevision(ordenId, motivo, cliente = db) {
  const r = await cliente.query(
    `UPDATE ordenes
     SET requiere_revision = TRUE,
         nota_revision = CASE
           WHEN COALESCE(nota_revision, '') = '' THEN $2::text
           ELSE nota_revision || ' | ' || $2::text
         END,
         actualizado_en = NOW()
     WHERE id = $1 AND POSITION($2::text IN COALESCE(nota_revision, '')) = 0
     RETURNING id`,
    [ordenId, motivo]
  );

  return r.rowCount > 0;
}

/* =====================================================
   PROCESAR UNA NOTIFICACIÓN DE PAGO
   "pago" es la respuesta REAL de la API de Mercado Pago
   (nunca el contenido del webhook).

   Es idempotente: si Mercado Pago avisa dos veces el mismo
   pago, la segunda vez no hace nada.

   Todo se decide con el pedido bloqueado (FOR UPDATE): si llegan
   dos avisos juntos, o un aviso mientras el panel cancela el
   pedido, se atienden de a uno y cada uno ve el estado real.
===================================================== */

/* Estados en los que la prenda ya salió del local */
const DESPACHADO = ["enviado", "entregado"];

async function procesarPago(pago) {
  const ordenId = Number(pago.external_reference);

  if (!Number.isInteger(ordenId) || ordenId <= 0) {
    return { resultado: "ignorado", motivo: "sin orden" };
  }

  const pagoId = String(pago.id);

  /* Los mails se mandan recién cuando la transacción terminó bien */
  const alerta = (motivo) => (orden) =>
    enviarSinEsperar(mailAlertaRevision(orden, motivo), `alerta #${ordenId}`);

  const { avisos = [], ...salida } = await db.transaccion(async (cliente) => {
    const orden = (
      await cliente.query(
        "SELECT estado, total, mp_payment_id FROM ordenes WHERE id = $1 FOR UPDATE",
        [ordenId]
      )
    ).rows[0];

    if (!orden) return { resultado: "ignorado", motivo: "orden inexistente" };

    const cobrado = CON_STOCK_DESCONTADO.includes(orden.estado);
    const esElPagoDelPedido = orden.mp_payment_id === pagoId;

    /* Anota el motivo y, si es nuevo, avisa a la tienda */
    const aRevision = async (motivo) => {
      const esNuevo = await marcarRevision(ordenId, motivo, cliente);
      return { resultado: "revision", avisos: esNuevo ? [alerta(motivo)] : [] };
    };

    /* ---------- Devolución o contracargo ---------- */
    if (pago.status === "refunded" || pago.status === "charged_back") {
      /*
        Solo importa si se devolvió el pago con el que se cobró el pedido.
        Devolver un pago duplicado no tiene que cancelar la venta.
      */
      if (!cobrado || !esElPagoDelPedido) return { resultado: "sin cambios" };

      /* La prenda ya salió: el stock no vuelve solo, lo decide la tienda */
      if (DESPACHADO.includes(orden.estado)) {
        return aRevision(
          `Mercado Pago devolvió el pago ${pagoId} después de despachar el pedido: ` +
            "si la prenda vuelve, cancelalo desde el panel para reingresar el stock."
        );
      }

      await cliente.query(
        "UPDATE ordenes SET estado = 'cancelado', actualizado_en = NOW() WHERE id = $1",
        [ordenId]
      );
      await devolverStock(ordenId, cliente);

      return {
        resultado: "cancelado",
        avisos: [(o) => enviarSinEsperar(mailCambioEstado(o), `cancelación #${ordenId}`)]
      };
    }

    /* ---------- Pago aprobado ---------- */
    if (pago.status === "approved") {
      /* Pago aprobado de un pedido que ya estaba cancelado: hay que devolver la plata */
      if (orden.estado === "cancelado") {
        return aRevision(`Llegó el pago ${pagoId} aprobado para un pedido cancelado: revisar y reintegrar.`);
      }

      if (cobrado) {
        /* Ya estaba procesado (notificación repetida) */
        if (esElPagoDelPedido) return { resultado: "sin cambios", problemas: [] };

        /* Doble cobro: la clienta pagó dos veces el mismo pedido */
        return aRevision(
          `Segundo pago aprobado (pago ${pagoId}) para un pedido ya cobrado ` +
            `con el pago ${orden.mp_payment_id}: revisar y reintegrar.`
        );
      }

      /* El pedido estaba pendiente o rechazado: lo cobramos */
      const problemas = [];
      const total = Number(orden.total);

      /* El monto y la moneda tienen que coincidir con la orden */
      if (pago.currency_id && pago.currency_id !== "ARS") {
        problemas.push(`Moneda inesperada: ${pago.currency_id}.`);
      }

      if (Number(pago.transaction_amount) + 0.01 < total) {
        problemas.push(
          `Monto pagado ($${pago.transaction_amount}) menor al total del pedido ($${total}).`
        );
      }

      const { rows } = await cliente.query(
        `UPDATE ordenes SET estado = 'pagado', mp_payment_id = $1, actualizado_en = NOW()
         WHERE id = $2
         RETURNING carrito_id`,
        [pagoId, ordenId]
      );

      const faltantes = await descontarStock(ordenId, cliente);
      if (faltantes.length > 0) {
        problemas.push(`Sin stock suficiente: ${faltantes.join(", ")}.`);
      }

      if (problemas.length > 0) {
        await marcarRevision(ordenId, problemas.join(" "), cliente);
      }

      /* Sacamos del carrito lo que se compró */
      const carritoId = rows[0].carrito_id;
      if (carritoId) {
        await cliente.query(
          `DELETE FROM carrito_items
           WHERE carrito_id = $1
             AND variante_id IN (SELECT variante_id FROM orden_items WHERE orden_id = $2)`,
          [carritoId, ordenId]
        );
      }

      const avisosDeVenta = [
        (o) => enviarSinEsperar(mailConfirmacionCompra(o), `confirmación #${ordenId}`),
        (o) => enviarSinEsperar(mailNuevaVenta(o), `aviso venta #${ordenId}`)
      ];
      if (problemas.length > 0) avisosDeVenta.push(alerta(problemas.join(" ")));

      return { resultado: "pagado", problemas, avisos: avisosDeVenta };
    }

    /* ---------- Rechazado / cancelado por MP ---------- */
    if (pago.status === "rejected" || pago.status === "cancelled") {
      if (orden.estado !== "pendiente") return { resultado: "sin cambios" };

      await cliente.query(
        "UPDATE ordenes SET estado = 'rechazado', mp_payment_id = $1, actualizado_en = NOW() WHERE id = $2",
        [pagoId, ordenId]
      );
      return { resultado: "rechazado" };
    }

    /* ---------- Pendiente / en proceso ---------- */
    if (orden.estado === "pendiente") {
      await cliente.query(
        "UPDATE ordenes SET mp_payment_id = $1, actualizado_en = NOW() WHERE id = $2",
        [pagoId, ordenId]
      );
    }

    return { resultado: "pendiente" };
  });

  if (avisos.length > 0) {
    const orden = await obtenerOrden(ordenId);
    for (const avisar of avisos) avisar(orden);
  }

  return salida;
}

module.exports = {
  ESTADOS,
  CON_STOCK_DESCONTADO,
  obtenerOrden,
  descontarStock,
  devolverStock,
  procesarPago
};
