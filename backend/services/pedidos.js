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
  Devuelve la lista de items que no tenían stock suficiente.
*/
async function descontarStock(ordenId, cliente) {
  const items = (
    await cliente.query(
      `SELECT id, variante_id, nombre_producto, talle, color, cantidad
       FROM orden_items
       WHERE orden_id = $1 AND variante_id IS NOT NULL AND NOT stock_descontado`,
      [ordenId]
    )
  ).rows;

  const faltantes = [];

  for (const item of items) {
    const resultado = await cliente.query(
      `UPDATE variantes SET stock = stock - $1
       WHERE id = $2 AND stock >= $1
       RETURNING id`,
      [item.cantidad, item.variante_id]
    );

    if (resultado.rowCount === 0) {
      faltantes.push(`${item.nombre_producto} (${item.color} / ${item.talle}) x${item.cantidad}`);
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

async function marcarRevision(ordenId, motivo, cliente = db) {
  await cliente.query(
    `UPDATE ordenes
     SET requiere_revision = TRUE,
         nota_revision = TRIM(BOTH ' ' FROM COALESCE(nota_revision || ' | ', '') || $2),
         actualizado_en = NOW()
     WHERE id = $1`,
    [ordenId, motivo]
  );
}

/* =====================================================
   PROCESAR UNA NOTIFICACIÓN DE PAGO
   "pago" es la respuesta REAL de la API de Mercado Pago
   (nunca el contenido del webhook).

   Es idempotente: si Mercado Pago avisa dos veces el mismo
   pago, la segunda vez no hace nada.
===================================================== */

async function procesarPago(pago) {
  const ordenId = Number(pago.external_reference);

  if (!Number.isInteger(ordenId) || ordenId <= 0) {
    return { resultado: "ignorado", motivo: "sin orden" };
  }

  const orden = await obtenerOrden(ordenId);
  if (!orden) return { resultado: "ignorado", motivo: "orden inexistente" };

  const pagoId = String(pago.id);

  /* ---------- Devolución o contracargo ---------- */
  if (pago.status === "refunded" || pago.status === "charged_back") {
    const cancelada = await db.transaccion(async (cliente) => {
      const r = await cliente.query(
        `UPDATE ordenes SET estado = 'cancelado', actualizado_en = NOW()
         WHERE id = $1 AND estado = ANY($2::text[])
         RETURNING id`,
        [ordenId, CON_STOCK_DESCONTADO]
      );
      if (r.rowCount === 0) return false;
      await devolverStock(ordenId, cliente);
      return true;
    });

    if (cancelada) {
      const actualizada = await obtenerOrden(ordenId);
      enviarSinEsperar(mailCambioEstado(actualizada), `cancelación #${ordenId}`);
    }

    return { resultado: cancelada ? "cancelado" : "sin cambios" };
  }

  /* ---------- Pago aprobado ---------- */
  if (pago.status === "approved") {
    const problemas = [];

    /* El monto y la moneda tienen que coincidir con la orden */
    if (pago.currency_id && pago.currency_id !== "ARS") {
      problemas.push(`Moneda inesperada: ${pago.currency_id}.`);
    }

    if (Number(pago.transaction_amount) + 0.01 < orden.total) {
      problemas.push(
        `Monto pagado ($${pago.transaction_amount}) menor al total del pedido ($${orden.total}).`
      );
    }

    /* Pago aprobado de un pedido que ya estaba cancelado: hay que devolver la plata */
    if (orden.estado === "cancelado") {
      await marcarRevision(ordenId, `Pago ${pagoId} aprobado sobre un pedido cancelado: revisar y reintegrar.`);
      enviarSinEsperar(
        mailAlertaRevision(orden, "Llegó un pago aprobado de un pedido cancelado."),
        `alerta #${ordenId}`
      );
      return { resultado: "revision" };
    }

    const pagado = await db.transaccion(async (cliente) => {
      const r = await cliente.query(
        `UPDATE ordenes SET estado = 'pagado', mp_payment_id = $1, actualizado_en = NOW()
         WHERE id = $2 AND estado IN ('pendiente', 'rechazado')
         RETURNING carrito_id`,
        [pagoId, ordenId]
      );

      /* Ya estaba procesado (notificación repetida) */
      if (r.rowCount === 0) return false;

      const faltantes = await descontarStock(ordenId, cliente);
      if (faltantes.length > 0) {
        problemas.push(`Sin stock suficiente: ${faltantes.join(", ")}.`);
      }

      if (problemas.length > 0) {
        await marcarRevision(ordenId, problemas.join(" "), cliente);
      }

      /* Sacamos del carrito lo que se compró */
      const carritoId = r.rows[0].carrito_id;
      if (carritoId) {
        await cliente.query(
          `DELETE FROM carrito_items
           WHERE carrito_id = $1
             AND variante_id IN (SELECT variante_id FROM orden_items WHERE orden_id = $2)`,
          [carritoId, ordenId]
        );
      }

      return true;
    });

    if (pagado) {
      const completa = await obtenerOrden(ordenId);
      enviarSinEsperar(mailConfirmacionCompra(completa), `confirmación #${ordenId}`);
      enviarSinEsperar(mailNuevaVenta(completa), `aviso venta #${ordenId}`);

      if (problemas.length > 0) {
        enviarSinEsperar(mailAlertaRevision(completa, problemas.join(" ")), `alerta #${ordenId}`);
      }
    }

    return { resultado: pagado ? "pagado" : "sin cambios", problemas };
  }

  /* ---------- Rechazado / cancelado por MP ---------- */
  if (pago.status === "rejected" || pago.status === "cancelled") {
    await db.query(
      `UPDATE ordenes SET estado = 'rechazado', mp_payment_id = $1, actualizado_en = NOW()
       WHERE id = $2 AND estado = 'pendiente'`,
      [pagoId, ordenId]
    );
    return { resultado: "rechazado" };
  }

  /* ---------- Pendiente / en proceso ---------- */
  await db.query(
    `UPDATE ordenes SET mp_payment_id = $1, actualizado_en = NOW()
     WHERE id = $2 AND estado = 'pendiente'`,
    [pagoId, ordenId]
  );

  return { resultado: "pendiente" };
}

module.exports = {
  ESTADOS,
  CON_STOCK_DESCONTADO,
  obtenerOrden,
  descontarStock,
  devolverStock,
  procesarPago
};
