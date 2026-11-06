/* =====================================================
   CÓDIGO COMPARTIDO POR TODAS LAS PÁGINAS
   - llamadas a la API
   - header, footer y carrito lateral
   - utilidades (precios, escapar HTML, avisos)
===================================================== */

/* ---------- Fotos con placeholder ----------
   Si una foto todavía no existe (por ejemplo /img/hero/look-1.png),
   se oculta la imagen rota y queda visible la caja con su etiqueta. */

function marcarFotoFaltante(img) {
  if (img.closest(".foto")) img.classList.add("foto-faltante");
}

document.addEventListener(
  "error",
  (e) => e.target.tagName === "IMG" && marcarFotoFaltante(e.target),
  true
);

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".foto > img").forEach((img) => {
    if (img.complete && img.naturalWidth === 0) marcarFotoFaltante(img);
  });
});

/* ---------- Utilidades ---------- */

/* Escapa texto antes de meterlo en innerHTML (evita XSS) */
function esc(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pesos(valor) {
  return "$" + Number(valor || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function parametro(nombre) {
  return new URLSearchParams(location.search).get(nombre);
}

/* Aviso flotante abajo de la pantalla */
function aviso(mensaje, tipo = "ok") {
  let caja = document.querySelector(".aviso");
  if (!caja) {
    caja = document.createElement("div");
    caja.className = "aviso";
    caja.setAttribute("role", "status");
    document.body.appendChild(caja);
  }
  caja.textContent = mensaje;
  caja.dataset.tipo = tipo;
  caja.classList.add("visible");
  clearTimeout(caja._timer);
  caja._timer = setTimeout(() => caja.classList.remove("visible"), 3200);
}

/* ---------- API ---------- */

async function api(ruta, opciones = {}) {
  const config = {
    method: opciones.method || "GET",
    headers: {},
    credentials: "same-origin"
  };

  if (opciones.body !== undefined) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(opciones.body);
  }

  let respuesta;
  try {
    respuesta = await fetch("/api" + ruta, config);
  } catch {
    throw new Error("No hay conexión. Revisá tu internet.");
  }

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    const error = new Error(datos.error || "Ocurrió un error. Probá de nuevo.");
    error.status = respuesta.status;
    throw error;
  }

  return datos;
}

/* Config pública (se pide una sola vez) */
let _config = null;
function obtenerConfig() {
  if (!_config) _config = api("/config").catch(() => ({ negocio: { nombre: "TU MARCA" }, envio: {} }));
  return _config;
}

/* ---------- Tarjeta de producto (catálogo, inicio, relacionados) ---------- */

function tarjetaProducto(p) {
  const conOferta = p.precio_oferta !== null;
  const descuento = conOferta ? Math.round((1 - p.precio_oferta / p.precio) * 100) : 0;

  const colores = p.colores
    .slice(0, 5)
    .map((c) => `<span class="punto-color" style="background:${esc(c.hex)}" title="${esc(c.nombre)}"></span>`)
    .join("");

  return `
    <a class="tarjeta" href="/producto.html?p=${encodeURIComponent(p.slug)}">
      <div class="tarjeta-foto">
        ${p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy">` : ""}
        ${p.imagen_hover ? `<img class="foto-hover" src="${esc(p.imagen_hover)}" alt="" loading="lazy">` : ""}
        ${conOferta ? `<span class="etiqueta etiqueta-oferta">-${descuento}%</span>` : ""}
        ${p.agotado ? `<span class="etiqueta etiqueta-agotado">Sin stock</span>` : ""}
      </div>
      <div class="tarjeta-info">
        <h3>${esc(p.nombre)}</h3>
        <div class="precio">
          ${conOferta
            ? `<span class="precio-actual">${pesos(p.precio_oferta)}</span><s>${pesos(p.precio)}</s>`
            : `<span class="precio-actual">${pesos(p.precio)}</span>`}
        </div>
        <div class="tarjeta-colores">${colores}</div>
      </div>
    </a>`;
}

/* ---------- Header y footer ---------- */

async function armarHeader() {
  const header = document.getElementById("header");
  if (!header) return;

  const [config, categorias] = await Promise.all([
    obtenerConfig(),
    api("/categorias").catch(() => [])
  ]);

  const envio = config.envio || {};
  const barra = envio.gratisDesde
    ? `Envío gratis en compras desde ${pesos(envio.gratisDesde)} · Hasta 12 cuotas con Mercado Pago`
    : "Hasta 12 cuotas con Mercado Pago";

  const menu = categorias
    .map(
      (c) => `
      <li class="${c.hijas.length ? "con-submenu" : ""}">
        <a href="/tienda.html?categoria=${encodeURIComponent(c.slug)}">${esc(c.nombre)}</a>
        ${c.hijas.length
          ? `<ul class="submenu">
              <li><a href="/tienda.html?categoria=${encodeURIComponent(c.slug)}">Ver todo</a></li>
              ${c.hijas.map((h) => `<li><a href="/tienda.html?categoria=${encodeURIComponent(h.slug)}">${esc(h.nombre)}</a></li>`).join("")}
            </ul>`
          : ""}
      </li>`
    )
    .join("");

  header.innerHTML = `
    <div class="barra-anuncio">${esc(barra)}</div>
    <div class="header-principal contenedor">
      <button class="boton-icono boton-menu" aria-label="Abrir menú" aria-expanded="false">☰</button>
      <a class="logo" href="/">${esc(config.negocio?.nombre || "TU MARCA")}</a>
      <nav class="nav" aria-label="Categorías">
        <ul>
          ${menu}
          <li><a href="/tienda.html?ofertas=1" class="link-ofertas">Ofertas</a></li>
        </ul>
      </nav>
      <form class="buscador" action="/tienda.html" role="search">
        <input type="search" name="buscar" placeholder="Buscar..." aria-label="Buscar productos"
               value="${esc(parametro("buscar") || "")}">
      </form>
      <button class="boton-icono boton-carrito" aria-label="Abrir carrito">
        🛍<span class="contador-carrito" hidden>0</span>
      </button>
    </div>`;

  const botonMenu = header.querySelector(".boton-menu");
  botonMenu.addEventListener("click", () => {
    const abierto = header.classList.toggle("menu-abierto");
    botonMenu.setAttribute("aria-expanded", String(abierto));
  });

  header.querySelector(".boton-carrito").addEventListener("click", abrirCarrito);
}

async function armarFooter() {
  const footer = document.getElementById("footer");
  if (!footer) return;

  const config = await obtenerConfig();
  const negocio = config.negocio || {};
  const anio = new Date().getFullYear();

  const whatsapp = negocio.whatsapp
    ? `<a href="https://wa.me/${encodeURIComponent(negocio.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>`
    : "";
  const instagram = negocio.instagram && /^https:\/\//.test(negocio.instagram)
    ? `<a href="${esc(negocio.instagram)}" target="_blank" rel="noopener">Instagram</a>`
    : "";

  footer.innerHTML = `
    <div class="contenedor footer-grid">
      <div>
        <strong class="logo">${esc(negocio.nombre || "TU MARCA")}</strong>
        <p>Ropa pensada para moverte.</p>
      </div>
      <div>
        <h4>Ayuda</h4>
        <a href="/tienda.html">Tienda</a>
        <a href="/tienda.html?ofertas=1">Ofertas</a>
      </div>
      <div>
        <h4>Contacto</h4>
        ${whatsapp}${instagram}
      </div>
    </div>
    <p class="footer-legal">© ${anio} ${esc(negocio.nombre || "")} · Pagos procesados por Mercado Pago</p>`;
}

/* ---------- Carrito lateral ---------- */

let carritoActual = null;

function actualizarContador(carrito) {
  const contador = document.querySelector(".contador-carrito");
  if (!contador) return;
  contador.textContent = carrito.cantidad;
  contador.hidden = carrito.cantidad === 0;
}

function crearPanelCarrito() {
  if (document.querySelector(".panel-carrito")) return;

  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="fondo-oscuro" hidden></div>
     <aside class="panel-carrito" aria-label="Carrito" aria-hidden="true">
       <div class="panel-cabecera">
         <h2>Tu carrito</h2>
         <button class="boton-icono cerrar-carrito" aria-label="Cerrar">✕</button>
       </div>
       <div class="panel-cuerpo"></div>
       <div class="panel-pie"></div>
     </aside>`
  );

  document.querySelector(".cerrar-carrito").addEventListener("click", cerrarCarrito);
  document.querySelector(".fondo-oscuro").addEventListener("click", cerrarCarrito);
  document.addEventListener("keydown", (e) => e.key === "Escape" && cerrarCarrito());

  /* Delegación de eventos: sumar, restar y quitar */
  document.querySelector(".panel-cuerpo").addEventListener("click", async (e) => {
    const boton = e.target.closest("[data-accion]");
    if (!boton) return;

    const id = boton.dataset.id;
    const item = carritoActual.items.find((i) => String(i.variante_id) === id);
    if (!item) return;

    boton.disabled = true;

    try {
      if (boton.dataset.accion === "quitar") {
        pintarCarrito(await api(`/carrito/items/${id}`, { method: "DELETE" }));
      } else {
        const nueva = item.cantidad + (boton.dataset.accion === "sumar" ? 1 : -1);
        if (nueva < 1) {
          pintarCarrito(await api(`/carrito/items/${id}`, { method: "DELETE" }));
        } else {
          pintarCarrito(await api(`/carrito/items/${id}`, { method: "PUT", body: { cantidad: nueva } }));
        }
      }
    } catch (error) {
      aviso(error.message, "error");
      boton.disabled = false;
    }
  });
}

function pintarCarrito(carrito) {
  carritoActual = carrito;
  actualizarContador(carrito);

  const cuerpo = document.querySelector(".panel-cuerpo");
  const pie = document.querySelector(".panel-pie");
  if (!cuerpo) return;

  if (carrito.items.length === 0) {
    cuerpo.innerHTML = `<p class="vacio">Tu carrito está vacío.</p>`;
    pie.innerHTML = `<a class="boton boton-secundario" href="/tienda.html">Ver productos</a>`;
    return;
  }

  cuerpo.innerHTML = carrito.items
    .map(
      (i) => `
      <div class="item-carrito ${i.disponible ? "" : "no-disponible"}">
        <img src="${esc(i.imagen || "")}" alt="">
        <div>
          <a href="/producto.html?p=${encodeURIComponent(i.slug)}" class="item-nombre">${esc(i.nombre)}</a>
          <p class="item-detalle">${esc(i.color)} · Talle ${esc(i.talle)}</p>
          ${!i.disponible ? `<p class="texto-error">Sin stock</p>` : ""}
          ${i.stock_insuficiente ? `<p class="texto-error">Solo quedan ${i.maximo}</p>` : ""}
          <div class="item-acciones">
            <div class="cantidad">
              <button data-accion="restar" data-id="${i.variante_id}" aria-label="Restar">−</button>
              <span>${i.cantidad}</span>
              <button data-accion="sumar" data-id="${i.variante_id}" aria-label="Sumar"
                ${i.cantidad >= i.maximo ? "disabled" : ""}>+</button>
            </div>
            <button class="link-quitar" data-accion="quitar" data-id="${i.variante_id}">Quitar</button>
          </div>
        </div>
        <strong>${pesos(i.precio * i.cantidad)}</strong>
      </div>`
    )
    .join("");

  const faltaEnvioGratis = carrito.envio.gratisDesde > 0 && carrito.subtotal < carrito.envio.gratisDesde
    ? `<p class="envio-gratis">Te faltan ${pesos(carrito.envio.gratisDesde - carrito.subtotal)} para el envío gratis</p>`
    : carrito.envio.gratisDesde > 0
      ? `<p class="envio-gratis ok">¡Tenés envío gratis!</p>`
      : "";

  const hayProblemas = carrito.items.some((i) => !i.disponible || i.stock_insuficiente);

  pie.innerHTML = `
    ${faltaEnvioGratis}
    <div class="fila-total"><span>Subtotal</span><strong>${pesos(carrito.subtotal)}</strong></div>
    ${hayProblemas ? `<p class="texto-error">Quitá o ajustá los productos sin stock para continuar.</p>` : ""}
    <a class="boton ${hayProblemas ? "deshabilitado" : ""}" href="/checkout.html">Finalizar compra</a>`;
}

async function abrirCarrito() {
  crearPanelCarrito();
  document.querySelector(".fondo-oscuro").hidden = false;
  const panel = document.querySelector(".panel-carrito");
  panel.classList.add("abierto");
  panel.setAttribute("aria-hidden", "false");
  document.body.classList.add("sin-scroll");

  try {
    pintarCarrito(await api("/carrito"));
  } catch (error) {
    aviso(error.message, "error");
  }
}

function cerrarCarrito() {
  const panel = document.querySelector(".panel-carrito");
  if (!panel) return;
  panel.classList.remove("abierto");
  panel.setAttribute("aria-hidden", "true");
  document.querySelector(".fondo-oscuro").hidden = true;
  document.body.classList.remove("sin-scroll");
}

/* Para que otras páginas (producto) actualicen el carrito */
window.tienda = { abrirCarrito, pintarCarrito, actualizarContador };

/* ---------- Arranque ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([armarHeader(), armarFooter()]);
  crearPanelCarrito();
  api("/carrito").then(pintarCarrito).catch(() => {});
});
