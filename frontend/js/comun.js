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

/* Cuando la foto existe, se saca la etiqueta (importa en los PNG sin fondo) */
function marcarFotoCargada(img) {
  if (img.matches(".foto > img:not(.foto-hover)")) img.parentElement.classList.add("foto-ok");
}

document.addEventListener(
  "error",
  (e) => e.target.tagName === "IMG" && marcarFotoFaltante(e.target),
  true
);

document.addEventListener(
  "load",
  (e) => e.target.tagName === "IMG" && marcarFotoCargada(e.target),
  true
);

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".foto > img").forEach((img) => {
    if (!img.complete) return;
    if (img.naturalWidth === 0) marcarFotoFaltante(img);
    else marcarFotoCargada(img);
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

/* Solo aceptamos colores #rgb / #rrggbb dentro de style="" */
function colorSeguro(hex) {
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex || "") ? hex : "#cccccc";
}

/* Tipo de prenda a partir del nombre: "Malla clásica de breteles" -> "Malla" */
function tipoDePrenda(nombre) {
  return String(nombre || "").trim().split(/\s+/)[0] || "";
}

/*
  opciones.etiqueta: texto chico arriba del nombre ("Nuevo", "Ballet"...).
  Si no se pasa, se usa el tipo de prenda.
*/
function tarjetaProducto(p, opciones = {}) {
  const conOferta = p.precio_oferta !== null;
  const descuento = conOferta ? Math.round((1 - p.precio_oferta / p.precio) * 100) : 0;
  const etiqueta = opciones.etiqueta || tipoDePrenda(p.nombre);

  const colores = p.colores.slice(0, 5);
  const puntos = colores
    .map((c) => `<span class="punto-color" style="background:${colorSeguro(c.hex)}"></span>`)
    .join("");
  const extra = p.colores.length > 5 ? `<span class="colores-mas">+${p.colores.length - 5}</span>` : "";
  const nombresColores = p.colores.map((c) => c.nombre).join(", ");

  return `
    <article class="tarjeta">
      <a class="tarjeta-link" href="/producto.html?p=${encodeURIComponent(p.slug)}">
        <div class="tarjeta-foto foto" data-foto="Foto del producto · 4:5">
          ${p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy" width="800" height="1000">` : ""}
          ${p.imagen_hover ? `<img class="foto-hover" src="${esc(p.imagen_hover)}" alt="" loading="lazy" width="800" height="1000">` : ""}
          ${conOferta ? `<span class="etiqueta etiqueta-oferta">-${descuento}%</span>` : ""}
          ${p.agotado ? `<span class="etiqueta etiqueta-agotado">Sin stock</span>` : ""}
        </div>
        <div class="tarjeta-info">
          ${etiqueta ? `<span class="tarjeta-etiqueta">${esc(etiqueta)}</span>` : ""}
          <h3 class="tarjeta-nombre">${esc(p.nombre)}</h3>
          <p class="precio">
            ${conOferta
              ? `<span class="precio-actual">${pesos(p.precio_oferta)}</span><s><span class="oculto-visual">Antes </span>${pesos(p.precio)}</s>`
              : `<span class="precio-actual">${pesos(p.precio)}</span>`}
          </p>
          ${colores.length
            ? `<p class="tarjeta-colores" title="${esc(nombresColores)}">
                 <span class="oculto-visual">Colores: ${esc(nombresColores)}</span>
                 <span aria-hidden="true" class="tarjeta-puntos">${puntos}${extra}</span>
               </p>`
            : ""}
        </div>
      </a>
    </article>`;
}

/* ---------- Datos de la marca ----------
   Lo que no viene del .env (el WhatsApp sí: NEGOCIO_WHATSAPP). */

const SITIO = {
  nombre: "Octavo Compás",
  nombreCompleto: "Octavo Compás Indumentaria",
  instagramUsuario: "@octavo.compas.indumentaria",
  instagram: "https://www.instagram.com/octavo.compas.indumentaria/",
  email: "[EMAIL DE CONTACTO]",
  ubicacion: "[CIUDAD, PROVINCIA]"
};

const ANUNCIOS = [
  "Envíos a todo el país",
  "Vestuarios a medida para academias y grupos",
  "Hasta 12 cuotas"
];

/* Menú principal (los slugs coinciden con las categorías de la base) */
const MENU = [
  {
    nombre: "Danza",
    url: "/tienda.html?categoria=danza",
    hijas: [
      ["Ballet", "/tienda.html?categoria=ballet"],
      ["Contemporáneo", "/tienda.html?categoria=contemporaneo"],
      ["Folklore", "/tienda.html?categoria=folklore"],
      ["Tango", "/tienda.html?categoria=tango"],
      ["Ver todo danza", "/tienda.html?categoria=danza"]
    ]
  },
  { nombre: "Fiesta y gala", url: "/tienda.html?categoria=fiesta-y-gala" },
  { nombre: "Reinas 2026", url: "/tienda.html?categoria=reinas-2026" },
  { nombre: "A medida", url: "/#a-medida" }
];

/* Íconos SVG de trazo fino (sin librerías) */
const ICONOS = {
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  bolsa: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  cerrar: '<path d="m6 6 12 12M18 6 6 18"/>',
  flechaIzq: '<path d="M15 5l-7 7 7 7"/>',
  flechaDer: '<path d="m9 5 7 7-7 7"/>',
  abajo: '<path d="m6 9 6 6 6-6"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  envio: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>',
  tarjeta: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 10h18M7 14.5h4"/>',
  aguja: '<path d="M19 5 8.5 15.5"/><path d="M16.5 4.5a1.8 1.8 0 0 1 3 3"/><path d="M8.5 15.5 5 19"/><path d="M4 9c3-3 8-4 11-2M10 20c3-1 6-3 7-7"/>',
  whatsapp: '<path d="M4 20l1.3-4A8 8 0 1 1 8.4 19L4 20Z"/><path d="M9.3 8.6c.2 2.9 2.4 5.3 5.4 5.9l.9-1.3 1.7.9c-.3 1-1.2 1.6-2.2 1.6-3.7-.3-6.6-3.3-6.8-7 0-1 .7-1.8 1.6-2l.8 1.7-1.4 1Z"/>'
};

function icono(nombre, clase = "") {
  return `<svg class="icono ${clase}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONOS[nombre]}</svg>`;
}

/* Link de WhatsApp con mensaje prearmado.
   Si NEGOCIO_WHATSAPP está vacío en el .env, WhatsApp pide elegir el contacto. */
async function linkWhatsApp(mensaje) {
  const config = await obtenerConfig();
  const numero = String(config.negocio?.whatsapp || "").replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/* Completa todos los links que tengan data-whatsapp="mensaje" */
async function activarLinksWhatsApp(raiz = document) {
  const links = [...raiz.querySelectorAll("a[data-whatsapp]")];
  for (const link of links) {
    link.href = await linkWhatsApp(link.dataset.whatsapp);
    link.target = "_blank";
    link.rel = "noopener";
  }
}

/* ---------- Header y footer ---------- */

function armarBarraAnuncios() {
  const header = document.getElementById("header");
  if (!header || document.querySelector(".barra-anuncio")) return;

  const textos = ANUNCIOS.map((t) => `<span>${esc(t)}</span>`).join("");

  header.insertAdjacentHTML(
    "beforebegin",
    `<div class="barra-anuncio">
       <p class="oculto-visual">${esc(ANUNCIOS.join(" · "))}</p>
       <div class="barra-anuncio-pista" aria-hidden="true">
         <div class="barra-anuncio-grupo">${textos}${textos}</div>
         <div class="barra-anuncio-grupo">${textos}${textos}</div>
       </div>
     </div>`
  );
}

function armarHeader() {
  const header = document.getElementById("header");
  if (!header) return;

  header.insertAdjacentHTML(
    "beforebegin",
    `<a class="saltar-contenido" href="#contenido">Saltar al contenido</a>`
  );
  armarBarraAnuncios();

  const actual = location.pathname + location.search;

  const items = MENU.map((item, i) => {
    const activo = actual === item.url ? ' aria-current="page"' : "";

    if (!item.hijas) {
      return `<li><a class="nav-link" href="${item.url}"${activo}>${esc(item.nombre)}</a></li>`;
    }

    return `
      <li class="con-submenu">
        <div class="nav-fila">
          <a class="nav-link" href="${item.url}"${activo}>${esc(item.nombre)}</a>
          <button class="boton-submenu" type="button" aria-expanded="false" aria-controls="submenu-${i}"
                  aria-label="Ver disciplinas de ${esc(item.nombre)}">${icono("abajo")}</button>
        </div>
        <ul class="submenu" id="submenu-${i}">
          ${item.hijas.map(([nombre, url]) => `<li><a href="${url}">${esc(nombre)}</a></li>`).join("")}
        </ul>
      </li>`;
  }).join("");

  header.innerHTML = `
    <div class="header-principal contenedor">
      <div class="header-izq">
        <button class="boton-icono boton-menu" type="button" aria-label="Abrir menú"
                aria-expanded="false" aria-controls="nav-principal">${icono("menu")}</button>
        <nav class="nav" id="nav-principal" aria-label="Principal">
          <div class="nav-cabecera">
            <img src="/img/marca/logo.svg" alt="" width="180" height="38">
            <button class="boton-icono boton-cerrar-menu" type="button" aria-label="Cerrar menú">${icono("cerrar")}</button>
          </div>
          <ul class="nav-lista">${items}</ul>
          <div class="nav-pie">
            <a class="link-subrayado" data-whatsapp="Hola Octavo Compás, quería hacerles una consulta.">Escribinos por WhatsApp</a>
          </div>
        </nav>
      </div>

      <a class="logo" href="/" aria-label="${esc(SITIO.nombreCompleto)}, ir al inicio">
        <img src="/img/marca/logo.svg" alt="" width="210" height="45">
      </a>

      <div class="header-der">
        <button class="boton-icono boton-buscar" type="button" aria-label="Buscar"
                aria-expanded="false" aria-controls="panel-busqueda">${icono("buscar")}</button>
        <button class="boton-icono boton-carrito" type="button" aria-label="Abrir carrito">
          ${icono("bolsa")}<span class="contador-carrito" hidden>0</span>
        </button>
      </div>
    </div>

    <div class="panel-busqueda" id="panel-busqueda" hidden>
      <form class="contenedor buscador" action="/tienda.html" role="search">
        <label class="oculto-visual" for="campo-buscar">Buscar productos</label>
        ${icono("buscar")}
        <input id="campo-buscar" type="search" name="buscar" placeholder="¿Qué estás buscando?"
               value="${esc(parametro("buscar") || "")}" autocomplete="off">
        <button class="boton" type="submit">Buscar</button>
      </form>
    </div>
    <div class="fondo-menu" hidden></div>`;

  /* Menú en celular */
  const botonMenu = header.querySelector(".boton-menu");
  const fondoMenu = header.querySelector(".fondo-menu");

  const cerrarMenu = () => {
    if (!header.classList.contains("menu-abierto")) return;
    header.classList.remove("menu-abierto");
    botonMenu.setAttribute("aria-expanded", "false");
    fondoMenu.hidden = true;
    document.body.classList.remove("sin-scroll");
  };

  botonMenu.addEventListener("click", () => {
    header.classList.add("menu-abierto");
    botonMenu.setAttribute("aria-expanded", "true");
    fondoMenu.hidden = false;
    document.body.classList.add("sin-scroll");
    header.querySelector(".boton-cerrar-menu").focus();
  });

  header.querySelector(".boton-cerrar-menu").addEventListener("click", () => {
    cerrarMenu();
    botonMenu.focus();
  });
  fondoMenu.addEventListener("click", cerrarMenu);
  header.querySelectorAll(".nav a").forEach((a) => a.addEventListener("click", cerrarMenu));

  /* Submenú: se abre con hover en escritorio y con el botón (celular y teclado) */
  header.querySelectorAll(".boton-submenu").forEach((boton) => {
    boton.addEventListener("click", () => {
      const abierto = boton.getAttribute("aria-expanded") === "true";
      boton.setAttribute("aria-expanded", String(!abierto));
      boton.closest(".con-submenu").classList.toggle("abierto", !abierto);
    });
  });

  /* Buscador */
  const botonBuscar = header.querySelector(".boton-buscar");
  const panelBusqueda = header.querySelector(".panel-busqueda");

  botonBuscar.addEventListener("click", () => {
    const abrir = panelBusqueda.hidden;
    panelBusqueda.hidden = !abrir;
    botonBuscar.setAttribute("aria-expanded", String(abrir));
    if (abrir) panelBusqueda.querySelector("input").focus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    cerrarMenu();
    if (!panelBusqueda.hidden) {
      panelBusqueda.hidden = true;
      botonBuscar.setAttribute("aria-expanded", "false");
      botonBuscar.focus();
    }
    header.querySelectorAll(".con-submenu.abierto").forEach((li) => {
      li.classList.remove("abierto");
      li.querySelector(".boton-submenu").setAttribute("aria-expanded", "false");
    });
  });

  /* Línea inferior cuando se hace scroll */
  const marcarScroll = () => header.classList.toggle("con-scroll", window.scrollY > 8);
  window.addEventListener("scroll", marcarScroll, { passive: true });
  marcarScroll();

  header.querySelector(".boton-carrito").addEventListener("click", abrirCarrito);
}

function armarFooter() {
  const footer = document.getElementById("footer");
  if (!footer) return;

  const anio = new Date().getFullYear();
  const consulta = "Hola Octavo Compás, quería hacerles una consulta.";

  footer.innerHTML = `
    <div class="contenedor footer-grid">
      <div class="footer-marca">
        <a href="/" class="footer-logo" aria-label="${esc(SITIO.nombreCompleto)}, ir al inicio">
          <img src="/img/marca/logo-claro.svg" alt="" width="230" height="49" loading="lazy">
        </a>
        <p>Indumentaria de danza, vestuarios a medida y ropa de fiesta. Confeccionamos cada prenda para que brilles en escena.</p>

        <form class="newsletter" id="form-newsletter" novalidate>
          <label for="newsletter-email" class="footer-titulo">Novedades en tu mail</label>
          <div class="newsletter-fila">
            <input id="newsletter-email" type="email" name="email" placeholder="Tu email" autocomplete="email" required>
            <button class="boton boton-claro" type="submit">Suscribirme</button>
          </div>
        </form>
      </div>

      <nav aria-label="Tienda">
        <h2 class="footer-titulo">Tienda</h2>
        <ul>
          <li><a href="/tienda.html?categoria=ballet">Ballet</a></li>
          <li><a href="/tienda.html?categoria=contemporaneo">Contemporáneo</a></li>
          <li><a href="/tienda.html?categoria=folklore">Folklore</a></li>
          <li><a href="/tienda.html?categoria=tango">Tango</a></li>
          <li><a href="/tienda.html?categoria=fiesta-y-gala">Fiesta y gala</a></li>
          <li><a href="/tienda.html?categoria=reinas-2026">Reinas 2026</a></li>
        </ul>
      </nav>

      <nav aria-label="Ayuda">
        <h2 class="footer-titulo">Ayuda</h2>
        <ul>
          <li><a href="/ayuda.html#envios">Envíos</a></li>
          <li><a href="/ayuda.html#cambios">Cambios y devoluciones</a></li>
          <li><a href="/ayuda.html#pagos">Medios de pago</a></li>
          <li><a href="/ayuda.html#talles">Guía de talles</a></li>
          <li><a href="/#a-medida">Vestuarios a medida</a></li>
          <li><a href="/arrepentimiento.html">Botón de arrepentimiento</a></li>
        </ul>
      </nav>

      <div>
        <h2 class="footer-titulo">Contacto</h2>
        <ul>
          <li><a data-whatsapp="${esc(consulta)}">WhatsApp</a></li>
          <li><a href="${esc(SITIO.instagram)}" target="_blank" rel="noopener">${esc(SITIO.instagramUsuario)}</a></li>
          <li><span>${esc(SITIO.email)}</span></li>
          <li><span>${esc(SITIO.ubicacion)}</span></li>
        </ul>
      </div>
    </div>

    <div class="footer-legal">
      <div class="contenedor">
        <p>© ${anio} ${esc(SITIO.nombreCompleto)} · Pagos procesados por Mercado Pago</p>
        <a class="boton-arrepentimiento" href="/arrepentimiento.html">Botón de arrepentimiento</a>
      </div>
    </div>`;

  /* [SERVICIO DE NEWSLETTER]: todavía no hay dónde guardar los mails */
  footer.querySelector("#form-newsletter").addEventListener("submit", (e) => {
    e.preventDefault();
    const campo = e.target.email;
    if (!campo.checkValidity()) {
      aviso("Revisá el email.", "error");
      campo.focus();
      return;
    }
    aviso("Muy pronto vas a poder suscribirte. Mientras tanto, seguinos en Instagram.");
  });
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
  armarHeader();
  armarFooter();
  activarLinksWhatsApp();
  crearPanelCarrito();
  api("/carrito").then(pintarCarrito).catch(() => {});
});
