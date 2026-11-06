/* =====================================================
   ADMIN - PEDIDOS
   GET   /api/admin/pedidos?estado=pagado&revision=1
   GET   /api/admin/pedidos/:id
   PATCH /api/admin/pedidos/:id/estado   { estado, codigo_seguimiento }
   PATCH /api/admin/pedidos/:id/revisado
===================================================== */

const express = require("express");
const db = require("../../db/database");
const { asyncRuta, ErrorHttp } = require("../../utils/http");
const { idValido, texto } = require("../../utils/validar");
const { mailCambioEstado, enviarSinEsperar } = require("../../utils/mailer");
const {
  ESTADOS,
  CON_STOCK_DESCONTADO,
  obtenerOrden,
  devolverStock
} = require("../../services/pedidos");

const router = express.Router();

/* Estados que el admin puede poner a mano (pendiente/rechazado/pagado los define Mercado Pago) */
const MANUALES = ["preparando", "enviado", "listo_retiro", "entregado", "cancelado"];

router.get(
  "/",
  asyncRuta(async (req, res) => {
    const condiciones = [];
    const parametros = [];
    const estado = String(req.query.estado || "");

    if (estado === "todos") {
      /* sin filtro */
    } else if (ESTADOS[estado]) {
      parametros.push(estado);
      condiciones.push(`o.estado = $${parametros.length}`);
    } else {
      /* Por defecto: lo que hay que gestionar (sin pagos pendientes ni rechazados) */
      condiciones.push("o.estado NOT IN ('pendiente', 'rechazado')");
    }

    if (req.query.revision === "1") condiciones.push("o.requiere_revision");

    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

    const { rows } = await db.query(
      `SELECT o.id, o.estado, o.nombre, o.email, o.telefono, o.metodo_entrega,
              o.ciudad, o.provincia, o.total, o.requiere_revision, o.nota_revision,
              o.codigo_seguimiento, o.creado_en,
              (SELECT COALESCE(SUM(cantidad), 0)::int FROM orden_items WHERE orden_id = o.id) AS unidades
       FROM ordenes o
       ${where}
       ORDER BY o.requiere_revision DESC, o.creado_en DESC
       LIMIT 300`,
      parametros
    );

    res.json(rows.map((o) => ({ ...o, total: Number(o.total), estado_texto: ESTADOS[o.estado] })));
  })
);

router.get(
  "/:id",
  asyncRuta(async (req, res) => {
    const orden = await obtenerOrden(idValido(req.params.id, "pedido"));
    if (!orden) throw new ErrorHttp(404, "Pedido no encontrado.");
    res.json({ ...orden, estado_texto: ESTADOS[orden.estado] });
  })
);

router.patch(
  "/:id/estado",
  asyncRuta(async (req, res) => {
    const id = idValido(req.params.id, "pedido");
    const nuevo = String(req.body.estado || "");
    const seguimiento = texto(req.body.codigo_seguimiento, 120);

    if (!MANUALES.includes(nuevo)) throw new ErrorHttp(400, "El estado elegido no es válido.");

    const resultado = await db.transaccion(async (cliente) => {
      const actual = (
        await cliente.query("SELECT estado, metodo_entrega FROM ordenes WHERE id = $1 FOR UPDATE", [id])
      ).rows[0];

      if (!actual) throw new ErrorHttp(404, "Pedido no encontrado.");
      if (actual.estado === "cancelado") throw new ErrorHttp(409, "El pedido ya está cancelado.");

      const pagado = CON_STOCK_DESCONTADO.includes(actual.estado);

      if (!pagado && nuevo !== "cancelado") {
        throw new ErrorHttp(409, "El pedido todavía no tiene el pago aprobado.");
      }
      if (nuevo === "enviado" && actual.metodo_entrega === "retiro") {
        throw new ErrorHttp(409, 'Es un pedido para retirar: usá "Listo para retirar".');
      }
      if (nuevo === "listo_retiro" && actual.metodo_entrega !== "retiro") {
        throw new ErrorHttp(409, 'Es un pedido con envío: usá "Enviado".');
      }

      await cliente.query(
        `UPDATE ordenes SET
           estado = $1,
           codigo_seguimiento = COALESCE(NULLIF($2, ''), codigo_seguimiento),
           actualizado_en = NOW()
         WHERE id = $3`,
        [nuevo, seguimiento, id]
      );

      /* Si se cancela un pedido pagado, el stock vuelve */
      const stockDevuelto = nuevo === "cancelado" && pagado;
      if (stockDevuelto) await devolverStock(id, cliente);

      return { stockDevuelto, avisar: pagado && nuevo !== actual.estado };
    });

    const orden = await obtenerOrden(id);
    if (resultado.avisar) enviarSinEsperar(mailCambioEstado(orden), `estado #${id}`);

    let mensaje = `Pedido #${id}: ${ESTADOS[nuevo]}.`;
    if (resultado.stockDevuelto) {
      mensaje += " El stock volvió al inventario. Acordate de hacer el reintegro desde Mercado Pago.";
    }

    res.json({ mensaje, pedido: { ...orden, estado_texto: ESTADOS[orden.estado] } });
  })
);

router.patch(
  "/:id/revisado",
  asyncRuta(async (req, res) => {
    const id = idValido(req.params.id, "pedido");
    await db.query(
      "UPDATE ordenes SET requiere_revision = FALSE, actualizado_en = NOW() WHERE id = $1",
      [id]
    );
    res.json({ ok: true });
  })
);

module.exports = router;
