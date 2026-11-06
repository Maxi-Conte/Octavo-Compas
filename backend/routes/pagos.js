/* =====================================================
   CHECKOUT Y PAGOS (Mercado Pago Checkout Pro)
   POST /api/checkout          crea la orden y la preferencia de pago
   POST /api/pagos/webhook     avisos de Mercado Pago
   GET  /api/ordenes/:token    estado de un pedido (para la página de resultado)
===================================================== */

const crypto = require("crypto");
const express = require("express");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");

const config = require("../config");
const db = require("../db/database");
const { asyncRuta, ErrorHttp } = require("../utils/http");
const { validarComprador, calcularCostoEnvio } = require("../utils/envio");
const { identificarCarrito } = require("../middleware/carrito-cookie");
const { idCarrito } = require("./carrito");
const { ESTADOS, obtenerOrden, procesarPago } = require("../services/pedidos");

const router = express.Router();

const mpClient = config.mp.accessToken
  ? new MercadoPagoConfig({ accessToken: config.mp.accessToken })
  : null;

/* Mercado Pago solo acepta URLs de retorno públicas con https */
const urlPublica = config.urlSitio.startsWith("https://") ? config.urlSitio : null;

/* =====================================================
   CREAR ORDEN + PREFERENCIA
===================================================== */

router.post(
  "/checkout",
  identificarCarrito,
  asyncRuta(async (req, res) => {
    if (!mpClient) {
      throw new ErrorHttp(503, "Los pagos todavía no están configurados en la tienda.");
    }

    const comprador = validarComprador(req.body);

    const carritoId = await idCarrito(req.carritoToken);
    if (!carritoId) throw new ErrorHttp(400, "Tu carrito está vacío.");

    /* Precios y stock se leen de la base: nunca confiamos en el navegador */
    const { rows: items } = await db.query(
      `SELECT ci.variante_id, ci.cantidad,
              v.talle, v.color, v.stock, v.activo AS variante_activa,
              p.id AS producto_id, p.nombre, p.activo AS producto_activo,
              COALESCE(p.precio_oferta, p.precio) AS precio
       FROM carrito_items ci
       JOIN variantes v ON v.id = ci.variante_id
       JOIN productos p ON p.id = v.producto_id
       WHERE ci.carrito_id = $1
       ORDER BY ci.id`,
      [carritoId]
    );

    if (items.length === 0) throw new ErrorHttp(400, "Tu carrito está vacío.");

    for (const item of items) {
      const nombre = `${item.nombre} (${item.color} / ${item.talle})`;

      if (!item.variante_activa || !item.producto_activo) {
        throw new ErrorHttp(409, `${nombre} ya no está disponible. Sacalo del carrito para continuar.`);
      }

      if (item.cantidad > item.stock) {
        throw new ErrorHttp(
          409,
          item.stock === 0
            ? `${nombre} se quedó sin stock. Sacalo del carrito para continuar.`
            : `De ${nombre} solo quedan ${item.stock} unidades.`
        );
      }
    }

    const subtotal = items.reduce((suma, i) => suma + Number(i.precio) * i.cantidad, 0);
    const costoEnvio = calcularCostoEnvio(comprador.metodo_entrega, subtotal);
    const total = subtotal + costoEnvio;

    /* Orden + items en una sola transacción */
    const orden = await db.transaccion(async (cliente) => {
      const { rows } = await cliente.query(
        `INSERT INTO ordenes (
           carrito_id, email, nombre, telefono, dni, metodo_entrega,
           direccion, ciudad, provincia, codigo_postal, notas,
           subtotal, costo_envio, total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id, token_publico`,
        [
          carritoId,
          comprador.email,
          comprador.nombre,
          comprador.telefono,
          comprador.dni,
          comprador.metodo_entrega,
          comprador.direccion || null,
          comprador.ciudad || null,
          comprador.provincia || null,
          comprador.codigo_postal || null,
          comprador.notas || null,
          subtotal,
          costoEnvio,
          total
        ]
      );

      for (const item of items) {
        await cliente.query(
          `INSERT INTO orden_items (
             orden_id, variante_id, producto_id, nombre_producto,
             talle, color, precio_unitario, cantidad
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [rows[0].id, item.variante_id, item.producto_id, item.nombre,
           item.talle, item.color, item.precio, item.cantidad]
        );
      }

      return rows[0];
    });

    /* Preferencia de Mercado Pago */
    const itemsMP = items.map((item) => ({
      id: String(item.variante_id),
      title: `${item.nombre} - ${item.color} - Talle ${item.talle}`.slice(0, 250),
      quantity: item.cantidad,
      unit_price: Number(item.precio),
      currency_id: "ARS"
    }));

    if (costoEnvio > 0) {
      itemsMP.push({
        id: "envio",
        title: "Envío a domicilio",
        quantity: 1,
        unit_price: costoEnvio,
        currency_id: "ARS"
      });
    }

    const retorno = `${urlPublica}/pago.html?orden=${orden.token_publico}`;

    try {
      const preferencia = await new Preference(mpClient).create({
        body: {
          items: itemsMP,
          payer: { name: comprador.nombre, email: comprador.email },
          external_reference: String(orden.id),
          statement_descriptor: config.negocio.nombre.slice(0, 22),
          ...(urlPublica && {
            back_urls: { success: retorno, failure: retorno, pending: retorno },
            auto_return: "approved",
            notification_url: `${urlPublica}/api/pagos/webhook`
          })
        }
      });

      await db.query("UPDATE ordenes SET mp_preference_id = $1 WHERE id = $2", [
        preferencia.id,
        orden.id
      ]);

      res.json({
        orden: orden.token_publico,
        url_pago: preferencia.init_point
      });
    } catch (error) {
      /* Si Mercado Pago falló, la orden no sirve: la borramos */
      await db.query("DELETE FROM ordenes WHERE id = $1", [orden.id]).catch(() => {});
      console.error("Error creando la preferencia de Mercado Pago:", error?.message || error);
      throw new ErrorHttp(502, "No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.");
    }
  })
);

/* =====================================================
   WEBHOOK
   Docs: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
===================================================== */

function firmaValida(req, dataId) {
  /* Sin clave solo se permite en desarrollo (config.js lo exige en producción) */
  if (!config.mp.webhookSecret) return !config.esProduccion;

  const partes = Object.fromEntries(
    String(req.headers["x-signature"] || "")
      .split(",")
      .map((p) => p.split("=").map((v) => v.trim()))
  );

  if (!partes.ts || !partes.v1) return false;

  const manifiesto =
    `id:${String(dataId).toLowerCase()};` +
    `request-id:${req.headers["x-request-id"] || ""};` +
    `ts:${partes.ts};`;

  const esperado = crypto.createHmac("sha256", config.mp.webhookSecret).update(manifiesto).digest("hex");

  const a = Buffer.from(String(partes.v1));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post("/pagos/webhook", async (req, res) => {
  const tipo = req.body?.type || req.query.type || req.query.topic;
  const pagoId = req.query["data.id"] || req.body?.data?.id;

  /* Solo nos interesan los pagos */
  if (tipo !== "payment" || !pagoId) return res.sendStatus(200);

  if (!firmaValida(req, pagoId)) {
    console.warn("Webhook rechazado: firma inválida.");
    return res.sendStatus(401);
  }

  if (!mpClient) return res.sendStatus(503);

  try {
    /* Consultamos el pago REAL a Mercado Pago (no creemos en el aviso) */
    const pago = await new Payment(mpClient).get({ id: pagoId });
    const resultado = await procesarPago(pago);

    console.log(`Webhook pago ${pagoId}:`, resultado.resultado);
    res.sendStatus(200);
  } catch (error) {
    /*
      Respondemos 500 a propósito: así Mercado Pago REINTENTA
      más tarde. Como procesarPago es idempotente, reintentar
      nunca duplica nada.
    */
    console.error(`Error procesando el pago ${pagoId}:`, error?.message || error);
    res.sendStatus(500);
  }
});

/* =====================================================
   ESTADO DE UN PEDIDO (por token público)
===================================================== */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get(
  "/ordenes/:token",
  asyncRuta(async (req, res) => {
    if (!UUID_REGEX.test(req.params.token)) throw new ErrorHttp(404, "Pedido no encontrado.");

    const { rows } = await db.query("SELECT id FROM ordenes WHERE token_publico = $1", [req.params.token]);
    if (!rows[0]) throw new ErrorHttp(404, "Pedido no encontrado.");

    const orden = await obtenerOrden(rows[0].id);

    /* Solo datos del pedido, nada sensible del comprador */
    res.json({
      id: orden.id,
      estado: orden.estado,
      estado_texto: ESTADOS[orden.estado],
      metodo_entrega: orden.metodo_entrega,
      subtotal: orden.subtotal,
      costo_envio: orden.costo_envio,
      total: orden.total,
      codigo_seguimiento: orden.codigo_seguimiento,
      creado_en: orden.creado_en,
      items: orden.items.map(({ nombre_producto, talle, color, precio_unitario, cantidad }) => ({
        nombre_producto, talle, color, precio_unitario, cantidad
      }))
    });
  })
);

module.exports = router;
