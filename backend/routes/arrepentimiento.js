/* =====================================================
   BOTÓN DE ARREPENTIMIENTO
   POST /api/arrepentimiento

   Guarda la solicitud, genera un código de identificación
   y manda la constancia por mail al cliente y un aviso a la tienda.
   La respuesta es la misma coincida o no con un pedido real,
   así nadie puede usarla para averiguar pedidos ajenos.
===================================================== */

const crypto = require("crypto");
const express = require("express");
const db = require("../db/database");
const { asyncRuta, ErrorHttp } = require("../utils/http");
const { texto, textoONull, email } = require("../utils/validar");
const { mailConstanciaArrepentimiento, mailAvisoArrepentimiento, enviarSinEsperar } = require("../utils/mailer");

const router = express.Router();

/* Sin letras que se confunden (0/O, 1/I) */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/* ARR-AAAAMMDD-XXXXXX */
function generarCodigo() {
  const fecha = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const azar = Array.from(crypto.randomBytes(6), (b) => ALFABETO[b % ALFABETO.length]).join("");
  return `ARR-${fecha}-${azar}`;
}

function validar(cuerpo) {
  const datos = {
    nombre: texto(cuerpo.nombre, 150),
    email: email(cuerpo.email),
    numeroPedido: texto(cuerpo.pedido, 40).replace(/^#/, ""),
    motivo: textoONull(cuerpo.motivo, 500)
  };

  if (datos.nombre.length < 3) throw new ErrorHttp(400, "Escribí tu nombre y apellido.");
  if (!datos.email) throw new ErrorHttp(400, "Escribí un email válido.");
  if (!datos.numeroPedido) throw new ErrorHttp(400, "Escribí el número de pedido.");

  return datos;
}

/* Busca la orden solo si número Y email coinciden */
async function buscarOrden(numeroPedido, mail) {
  const id = Number(numeroPedido);
  if (!Number.isInteger(id) || id <= 0) return null;

  const { rows } = await db.query(
    "SELECT id FROM ordenes WHERE id = $1 AND LOWER(email) = $2",
    [id, mail]
  );
  return rows[0]?.id ?? null;
}

router.post(
  "/arrepentimiento",
  asyncRuta(async (req, res) => {
    const datos = validar(req.body || {});
    const ordenId = await buscarOrden(datos.numeroPedido, datos.email);

    /* Si justo se repite un código (muy improbable), se reintenta */
    let solicitud = null;
    for (let intento = 0; intento < 3 && !solicitud; intento++) {
      try {
        const { rows } = await db.query(
          `INSERT INTO arrepentimientos (codigo, nombre, email, numero_pedido, motivo, orden_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, codigo, nombre, email, numero_pedido, motivo, orden_id, creado_en`,
          [generarCodigo(), datos.nombre, datos.email, datos.numeroPedido, datos.motivo, ordenId]
        );
        solicitud = rows[0];
      } catch (error) {
        if (error.code !== "23505") throw error;
      }
    }

    if (!solicitud) throw new ErrorHttp(500, "No pudimos registrar la solicitud. Probá de nuevo.");

    enviarSinEsperar(mailConstanciaArrepentimiento(solicitud), "constancia de arrepentimiento");
    enviarSinEsperar(mailAvisoArrepentimiento(solicitud), "aviso de arrepentimiento");

    res.status(201).json({ codigo: solicitud.codigo, fecha: solicitud.creado_en });
  })
);

module.exports = router;
