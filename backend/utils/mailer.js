/* =====================================================
   MAILS
   Usa la API de Resend por HTTPS (no SMTP), así funciona
   en cualquier hosting. Sin RESEND_API_KEY, los mails se
   muestran en la consola (útil para desarrollo).
===================================================== */

const config = require("../config");

function escaparHTML(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pesos(valor) {
  return "$" + Number(valor || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

async function enviarMail({ para, asunto, html }) {
  if (!para) return;

  if (!config.mail.resendApiKey) {
    console.log(`\n📧 [MAIL - modo consola] Para: ${para} | Asunto: ${asunto}\n`);
    return;
  }

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.mail.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.mail.from,
      to: [para],
      subject: asunto,
      html
    })
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`Resend respondió ${respuesta.status}: ${detalle.slice(0, 200)}`);
  }
}

/* Plantilla simple. "contenido" ya tiene que venir escapado. */
function plantilla(titulo, contenido) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222;">
    <h2 style="font-size:20px;border-bottom:2px solid #111;padding-bottom:8px;">
      ${escaparHTML(config.negocio.nombre)}
    </h2>
    <h3 style="font-size:17px;">${titulo}</h3>
    ${contenido}
    <p style="color:#888;font-size:12px;margin-top:32px;">
      Este es un mail automático, no hace falta responderlo.
    </p>
  </div>`;
}

function tablaItems(orden) {
  const filas = orden.items
    .map(
      (item) => `
      <tr>
        <td style="padding:6px 0;">${item.cantidad} × ${escaparHTML(item.nombre_producto)}
          <span style="color:#777;">(${escaparHTML(item.color)} / ${escaparHTML(item.talle)})</span></td>
        <td style="padding:6px 0;text-align:right;">${pesos(item.precio_unitario * item.cantidad)}</td>
      </tr>`
    )
    .join("");

  return `
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${filas}
    <tr><td style="padding-top:10px;">Envío</td>
        <td style="padding-top:10px;text-align:right;">${pesos(orden.costo_envio)}</td></tr>
    <tr><td><strong>Total</strong></td>
        <td style="text-align:right;"><strong>${pesos(orden.total)}</strong></td></tr>
  </table>`;
}

/* ---------- Mails concretos ---------- */

function mailConfirmacionCompra(orden) {
  const urlPedido = `${config.urlSitio}/pago.html?orden=${orden.token_publico}`;

  return enviarMail({
    para: orden.email,
    asunto: `¡Gracias por tu compra! Pedido #${orden.id}`,
    html: plantilla(
      `Pedido #${orden.id} confirmado`,
      `<p>Hola ${escaparHTML(orden.nombre)}, tu pago fue aprobado y ya estamos preparando tu pedido.</p>
       ${tablaItems(orden)}
       <p><a href="${escaparHTML(urlPedido)}">Ver el estado de tu pedido</a></p>`
    )
  });
}

function mailNuevaVenta(orden) {
  return enviarMail({
    para: config.mail.tienda,
    asunto: `🛍️ Nueva venta: pedido #${orden.id} (${pesos(orden.total)})`,
    html: plantilla(
      `Nueva venta #${orden.id}`,
      `<p>${escaparHTML(orden.nombre)} · ${escaparHTML(orden.email)} · ${escaparHTML(orden.telefono)}</p>
       <p>Entrega: ${orden.metodo_entrega === "retiro" ? "Retiro en local" :
         escaparHTML(`${orden.direccion}, ${orden.ciudad}, ${orden.provincia} (${orden.codigo_postal})`)}</p>
       ${tablaItems(orden)}`
    )
  });
}

function mailAlertaRevision(orden, motivo) {
  return enviarMail({
    para: config.mail.tienda,
    asunto: `⚠️ Revisar pedido #${orden.id}`,
    html: plantilla(
      `El pedido #${orden.id} necesita revisión`,
      `<p><strong>Motivo:</strong> ${escaparHTML(motivo)}</p>
       <p>Contactá al cliente: ${escaparHTML(orden.nombre)} · ${escaparHTML(orden.email)} · ${escaparHTML(orden.telefono)}</p>
       ${tablaItems(orden)}`
    )
  });
}

const TEXTOS_ESTADO = {
  preparando: "Estamos preparando tu pedido.",
  enviado: "¡Tu pedido está en camino!",
  listo_retiro: "Tu pedido está listo para retirar.",
  entregado: "Tu pedido fue entregado. ¡Gracias por elegirnos!",
  cancelado: "Tu pedido fue cancelado. Si tenés dudas, escribinos."
};

function mailCambioEstado(orden) {
  const mensaje = TEXTOS_ESTADO[orden.estado];
  if (!mensaje) return Promise.resolve();

  const seguimiento = orden.codigo_seguimiento
    ? `<p>Código de seguimiento: <strong>${escaparHTML(orden.codigo_seguimiento)}</strong></p>`
    : "";

  return enviarMail({
    para: orden.email,
    asunto: `Pedido #${orden.id}: ${mensaje}`,
    html: plantilla(
      `Novedades de tu pedido #${orden.id}`,
      `<p>Hola ${escaparHTML(orden.nombre)}. ${escaparHTML(mensaje)}</p>${seguimiento}`
    )
  });
}

/*
  Los mails nunca deben frenar ni romper una venta:
  si fallan, se registra el error y listo.
*/
function enviarSinEsperar(promesa, descripcion) {
  Promise.resolve(promesa).catch((error) =>
    console.error(`No se pudo enviar el mail (${descripcion}):`, error.message)
  );
}

module.exports = {
  mailConfirmacionCompra,
  mailNuevaVenta,
  mailAlertaRevision,
  mailCambioEstado,
  enviarSinEsperar
};
