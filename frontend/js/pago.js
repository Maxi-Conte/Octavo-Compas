/* =====================================================
   RESULTADO DEL PAGO
   Mercado Pago vuelve acá con ?orden=<token>.
   El estado real lo define el webhook, así que si todavía
   figura "pendiente" volvemos a consultar unas veces.
===================================================== */

const MENSAJES = {
  pendiente: { icono: "reloj", titulo: "Estamos esperando la confirmación del pago", texto: "Si pagaste en efectivo o con transferencia, puede tardar un rato. Te avisamos por email." },
  rechazado: { icono: "cerrar", titulo: "El pago no se pudo completar", texto: "No se hizo ningún cobro. Podés volver a intentarlo con otro medio de pago." },
  pagado: { icono: "check", titulo: "¡Gracias por tu compra!", texto: "Tu pago fue aprobado. Te enviamos un email con el detalle." },
  preparando: { icono: "aguja", titulo: "Estamos preparando tu pedido", texto: "" },
  enviado: { icono: "envio", titulo: "Tu pedido está en camino", texto: "" },
  listo_retiro: { icono: "bolsa", titulo: "Tu pedido está listo para retirar", texto: "" },
  entregado: { icono: "check", titulo: "Pedido entregado", texto: "¡Gracias por elegirnos!" },
  cancelado: { icono: "cerrar", titulo: "Pedido cancelado", texto: "Si tenés dudas, escribinos." }
};

const contenedor = document.getElementById("resultado");
let intentos = 0;

function pintar(orden) {
  const m = MENSAJES[orden.estado] || MENSAJES.pendiente;

  const items = orden.items
    .map((i) => `<div class="fila-resumen"><span>${i.cantidad} × ${esc(i.nombre_producto)} (${esc(i.color)} / ${esc(i.talle)})</span><span>${pesos(i.precio_unitario * i.cantidad)}</span></div>`)
    .join("");

  contenedor.innerHTML = `
    <div class="icono-resultado icono-${orden.estado === "rechazado" || orden.estado === "cancelado" ? "error" : "ok"}">${icono(m.icono)}</div>
    <h1>${esc(m.titulo)}</h1>
    <p>${esc(m.texto)}</p>
    <div class="detalle-pedido">
      <p><strong>Pedido #${orden.id}</strong> · ${esc(orden.estado_texto)}</p>
      ${items}
      <div class="fila-resumen"><span>Envío</span><span>${orden.costo_envio ? pesos(orden.costo_envio) : "Gratis"}</span></div>
      <div class="fila-resumen total"><span>Total</span><span>${pesos(orden.total)}</span></div>
      ${orden.codigo_seguimiento ? `<p>Seguimiento: <strong>${esc(orden.codigo_seguimiento)}</strong></p>` : ""}
    </div>
    ${orden.estado === "rechazado"
      ? `<a class="boton" href="/checkout.html">Intentar de nuevo</a>`
      : `<a class="boton boton-secundario" href="/tienda.html">Seguir comprando</a>`}`;
}

async function consultar() {
  const token = parametro("orden");

  if (!token) {
    contenedor.innerHTML = `<p class="vacio">No encontramos el pedido. <a href="/">Volver al inicio</a></p>`;
    return;
  }

  try {
    const orden = await api(`/ordenes/${encodeURIComponent(token)}`);
    pintar(orden);

    /* Mientras siga pendiente, reintentamos (hasta ~1 minuto) */
    if (orden.estado === "pendiente" && intentos++ < 12) {
      setTimeout(consultar, 5000);
    }

    /* Ya pagado: actualizamos el contador del carrito */
    if (orden.estado === "pagado") {
      api("/carrito").then((c) => window.tienda?.actualizarContador(c)).catch(() => {});
    }
  } catch (error) {
    contenedor.innerHTML = `<p class="vacio">${esc(error.message)} <a href="/">Volver al inicio</a></p>`;
  }
}

consultar();
