/* =====================================================
   ADMIN - BOTÓN DE ARREPENTIMIENTO
   GET   /api/admin/arrepentimientos?estado=pendientes|todas|recibida|en_proceso|resuelta
   PATCH /api/admin/arrepentimientos/:id/estado   { estado }
===================================================== */

const express = require("express");
const db = require("../../db/database");
const { asyncRuta, ErrorHttp } = require("../../utils/http");
const { idValido } = require("../../utils/validar");

const router = express.Router();

const ESTADOS = {
  recibida: "Recibida",
  en_proceso: "En proceso",
  resuelta: "Resuelta"
};

router.get(
  "/",
  asyncRuta(async (req, res) => {
    const estado = String(req.query.estado || "pendientes");
    const parametros = [];
    let where = "";

    if (ESTADOS[estado]) {
      parametros.push(estado);
      where = "WHERE a.estado = $1";
    } else if (estado !== "todas") {
      where = "WHERE a.estado <> 'resuelta'";
    }

    const [lista, conteo] = await Promise.all([
      db.query(
        `SELECT a.id, a.codigo, a.nombre, a.email, a.numero_pedido, a.motivo,
                a.orden_id, a.estado, a.creado_en
         FROM arrepentimientos a
         ${where}
         ORDER BY (a.estado = 'resuelta'), a.creado_en DESC
         LIMIT 300`,
        parametros
      ),
      db.query("SELECT COUNT(*)::int AS n FROM arrepentimientos WHERE estado = 'recibida'")
    ]);

    res.json({
      sin_atender: conteo.rows[0].n,
      solicitudes: lista.rows.map((s) => ({ ...s, estado_texto: ESTADOS[s.estado] }))
    });
  })
);

router.patch(
  "/:id/estado",
  asyncRuta(async (req, res) => {
    const id = idValido(req.params.id, "solicitud");
    const nuevo = String(req.body.estado || "");

    if (!ESTADOS[nuevo]) throw new ErrorHttp(400, "El estado elegido no es válido.");

    const { rows } = await db.query(
      "UPDATE arrepentimientos SET estado = $1 WHERE id = $2 RETURNING id, estado",
      [nuevo, id]
    );

    if (!rows[0]) throw new ErrorHttp(404, "Solicitud no encontrada.");
    res.json({ ...rows[0], estado_texto: ESTADOS[rows[0].estado] });
  })
);

module.exports = router;
