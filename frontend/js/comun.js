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
  opciones.insignia: sello sobre la foto ("Nuevo"). Arriba del nombre va siempre el tipo de prenda.
  En escritorio, al pasar el mouse aparece la segunda foto y la barra "Elegí tu talle".
*/
function tarjetaProducto(p, opciones = {}) {
  const conOferta = p.precio_oferta !== null;
  const actual = conOferta ? p.precio_oferta : p.precio;
  const descuento = conOferta ? Math.round((1 - p.precio_oferta / p.precio) * 100) : 0;
  const tipo = tipoDePrenda(p.nombre);

  const insignias = [
    opciones.insignia ? `<li class="insignia">${esc(opciones.insignia)}</li>` : "",
    descuento > 0 ? `<li class="insignia insignia-oferta">-${descuento}%</li>` : ""
  ].join("");

  const colores = p.colores.slice(0, 4);
  const puntos = colores
    .map((c) => `<span class="punto-color" style="background:${colorSeguro(c.hex)}"></span>`)
    .join("");
  const extra = p.colores.length > 4 ? `<span class="colores-mas">+${p.colores.length - 4}</span>` : "";
  const nombresColores = p.colores.map((c) => c.nombre).join(", ");

  return `
    <article class="tarjeta${p.agotado ? " tarjeta-agotada" : ""}">
      <a class="tarjeta-link" href="/producto.html?p=${encodeURIComponent(p.slug)}">
        <div class="tarjeta-foto foto" data-foto="Foto del producto · 4:5">
          ${p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy" width="800" height="1000">` : ""}
          ${p.imagen_hover ? `<img class="foto-hover" src="${esc(p.imagen_hover)}" alt="" loading="lazy" width="800" height="1000">` : ""}
          ${insignias ? `<ul class="tarjeta-insignias">${insignias}</ul>` : ""}
          ${p.agotado ? `<span class="tarjeta-sin-stock">Sin stock</span>` : ""}
          <span class="tarjeta-accion" aria-hidden="true">${p.agotado ? "Ver detalle" : "Elegí tu talle"}${icono("flechaDer")}</span>
        </div>
        <div class="tarjeta-info">
          <div class="tarjeta-fila">
            ${tipo ? `<span class="tarjeta-etiqueta">${esc(tipo)}</span>` : ""}
            ${colores.length
              ? `<span class="tarjeta-colores" title="${esc(nombresColores)}">
                   <span class="oculto-visual">Colores: ${esc(nombresColores)}</span>
                   <span aria-hidden="true" class="tarjeta-puntos">${puntos}${extra}</span>
                 </span>`
              : ""}
          </div>
          <h3 class="tarjeta-nombre">${esc(p.nombre)}</h3>
          <p class="precio tarjeta-precio">
            <span class="precio-actual">${pesos(actual)}</span>
            ${conOferta ? `<s><span class="oculto-visual">Antes </span>${pesos(p.precio)}</s>` : ""}
          </p>
          ${p.agotado ? "" : `<p class="tarjeta-cuotas">12 cuotas de ${pesos(actual / 12)}</p>`}
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
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  envio: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>',
  tarjeta: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 10h18M7 14.5h4"/>',
  aguja: '<path d="M19 5 8.5 15.5"/><path d="M16.5 4.5a1.8 1.8 0 0 1 3 3"/><path d="M8.5 15.5 5 19"/><path d="M4 9c3-3 8-4 11-2M10 20c3-1 6-3 7-7"/>',
  whatsapp: '<path d="M4 20l1.3-4A8 8 0 1 1 8.4 19L4 20Z"/><path d="M9.3 8.6c.2 2.9 2.4 5.3 5.4 5.9l.9-1.3 1.7.9c-.3 1-1.2 1.6-2.2 1.6-3.7-.3-6.6-3.3-6.8-7 0-1 .7-1.8 1.6-2l.8 1.7-1.4 1Z"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6"/>',
  email: '<rect x="3" y="5.5" width="18" height="13" rx="1"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  ubicacion: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  escudo: '<path d="M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6l-7-2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  arriba: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  diagonal: '<path d="M7 17 17 7M9 7h8v8"/>'
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
      <a class="logo" href="/" aria-label="${esc(SITIO.nombreCompleto)}, ir al inicio">
        <img src="/img/marca/logo.svg" alt="" width="210" height="45">
      </a>

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
  const pedido = "Hola Octavo Compás, quiero pedir un presupuesto de vestuario a medida.";

  /* Columna de links: en celular es un acordeón, en escritorio está siempre abierta */
  const columna = (titulo, contenido) => `
    <details class="pie-col" open>
      <summary><h2 class="pie-titulo">${titulo}</h2>${icono("abajo", "pie-col-flecha")}</summary>
      ${contenido}
    </details>`;

  footer.innerHTML = `
    <!-- Banda de cierre -->
    <div class="pie-cta">
      <div class="contenedor pie-cta-interior">
        <div>
          <span class="pie-sobretitulo">Vestuarios a medida</span>
          <p class="pie-cta-titulo">¿Tenés una función en puerta? <em>Hagamos tu vestuario.</em></p>
        </div>
        <div class="pie-cta-acciones">
          <a class="boton boton-claro" data-whatsapp="${esc(pedido)}">${icono("whatsapp")}Pedí tu presupuesto</a>
          <a class="pie-link-flecha" href="/#a-medida">Cómo trabajamos ${icono("diagonal")}</a>
        </div>
      </div>
    </div>

    <div class="contenedor pie-grid">
      <div class="pie-marca">
        <a href="/" class="pie-logo" aria-label="${esc(SITIO.nombreCompleto)}, ir al inicio">
          <img src="/img/marca/logo-claro.svg" alt="" width="250" height="49" loading="lazy">
        </a>
        <p>Indumentaria de danza, vestuarios a medida y ropa de fiesta. Cada prenda sale de nuestro taller pensada para moverse, brillar y durar.</p>
        <ul class="pie-redes" aria-label="Redes y contacto">
          <li><a href="${esc(SITIO.instagram)}" target="_blank" rel="noopener" aria-label="Instagram ${esc(SITIO.instagramUsuario)}">${icono("instagram")}</a></li>
          <li><a data-whatsapp="${esc(consulta)}" aria-label="WhatsApp">${icono("whatsapp")}</a></li>
          <li><a href="/ayuda.html" aria-label="Ayuda y contacto">${icono("email")}</a></li>
        </ul>
      </div>

      <nav class="pie-navs" aria-label="Pie de página">
        ${columna("Tienda", `
          <ul>
            <li><a href="/tienda.html?categoria=ballet">Ballet</a></li>
            <li><a href="/tienda.html?categoria=contemporaneo">Contemporáneo</a></li>
            <li><a href="/tienda.html?categoria=folklore">Folklore</a></li>
            <li><a href="/tienda.html?categoria=tango">Tango</a></li>
            <li><a href="/tienda.html?categoria=fiesta-y-gala">Fiesta y gala</a></li>
            <li><a href="/tienda.html?categoria=reinas-2026">Reinas 2026</a></li>
          </ul>`)}
        ${columna("Ayuda", `
          <ul>
            <li><a href="/ayuda.html#envios">Envíos</a></li>
            <li><a href="/ayuda.html#cambios">Cambios y devoluciones</a></li>
            <li><a href="/ayuda.html#pagos">Medios de pago</a></li>
            <li><a href="/ayuda.html#talles">Guía de talles</a></li>
            <li><a href="/#a-medida">Vestuarios a medida</a></li>
            <li><a href="/arrepentimiento.html">Botón de arrepentimiento</a></li>
          </ul>`)}
        ${columna("Contacto", `
          <ul class="pie-contacto">
            <li>${icono("whatsapp")}<a data-whatsapp="${esc(consulta)}">WhatsApp</a></li>
            <li>${icono("instagram")}<a href="${esc(SITIO.instagram)}" target="_blank" rel="noopener">${esc(SITIO.instagramUsuario).replaceAll(".", ".<wbr>")}</a></li>
            <li>${icono("email")}<span>${esc(SITIO.email)}</span></li>
            <li>${icono("ubicacion")}<span>${esc(SITIO.ubicacion)}</span></li>
          </ul>`)}
      </nav>

      <form class="pie-news" id="form-newsletter" novalidate>
        <h2 class="pie-titulo">Novedades del taller</h2>
        <p>Lanzamientos, colecciones nuevas y fechas de toma de medidas. Sin spam.</p>
        <div class="pie-news-campo">
          <label class="oculto-visual" for="newsletter-email">Tu email</label>
          <input id="newsletter-email" type="email" name="email" placeholder="Tu email" autocomplete="email" required>
          <button type="submit" aria-label="Suscribirme">${icono("flechaDer")}</button>
        </div>
        <p class="pie-news-nota">Te podés dar de baja cuando quieras.</p>
      </form>
    </div>

    <div class="contenedor">
      <ul class="pie-garantias">
        <li>${icono("envio")}<span><strong>Envíos a todo el país</strong>Seguimiento de tu pedido</span></li>
        <li>${icono("tarjeta")}<span><strong>Hasta 12 cuotas</strong>Con Mercado Pago</span></li>
        <li>${icono("escudo")}<span><strong>Compra protegida</strong>Pago seguro y cifrado</span></li>
        <li>${icono("aguja")}<span><strong>Confección propia</strong>Hecho en nuestro taller</span></li>
      </ul>

      <div class="pie-pagos">
        <div>
          <h2 class="pie-titulo">Medios de pago</h2>
          <ul class="pie-medios">
            <li>Mercado Pago</li><li>Visa</li><li>Mastercard</li><li>American Express</li>
            <li>Naranja X</li><li>Débito</li><li>Efectivo</li>
          </ul>
        </div>
        <!-- [DATA FISCAL]: reemplazar por el QR de ARCA con su link -->
        <div class="pie-fiscal" role="img" aria-label="Espacio para el QR de data fiscal">[QR DATA<br>FISCAL]</div>
      </div>
    </div>

    <p class="pie-firma" aria-hidden="true">Octavo Compás</p>

    <div class="pie-legal">
      <div class="contenedor pie-legal-interior">
        <p>© ${anio} ${esc(SITIO.nombreCompleto)} · [RAZÓN SOCIAL · CUIT]</p>
        <ul class="pie-legal-links">
          <li><a href="/ayuda.html">Ayuda</a></li>
          <li><a href="https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario" target="_blank" rel="noopener">Defensa del consumidor ${icono("diagonal")}</a></li>
          <li><a class="boton-arrepentimiento" href="/arrepentimiento.html">Botón de arrepentimiento</a></li>
        </ul>
        <button class="pie-arriba" type="button">Volver arriba ${icono("arriba")}</button>
      </div>
    </div>`;

  /* Acordeones: abiertos en escritorio, cerrados en celular */
  const celular = window.matchMedia("(max-width: 760px)");
  const ajustarColumnas = () => {
    footer.querySelectorAll(".pie-col").forEach((d) => (d.open = !celular.matches));
  };
  ajustarColumnas();
  celular.addEventListener("change", ajustarColumnas);
  footer.querySelectorAll(".pie-col summary").forEach((s) => {
    s.addEventListener("click", (e) => {
      if (!celular.matches) e.preventDefault(); // en escritorio no se cierran
    });
  });

  footer.querySelector(".pie-arriba").addEventListener("click", () => {
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducido ? "auto" : "smooth" });
    document.querySelector(".logo")?.focus({ preventScroll: true });
  });

  /* [SERVICIO DE NEWSLETTER]: todavía no hay dónde guardar los mails */
  footer.querySelector("#form-newsletter").addEventListener("submit", (e) => {
    e.preventDefault();
    const campo = e.target.email;
    if (!campo.checkValidity() || !campo.value.trim()) {
      aviso("Revisá el email.", "error");
      campo.focus();
      return;
    }
    aviso("Muy pronto vas a poder suscribirte. Mientras tanto, seguinos en Instagram.");
  });
}

/* ---------- Carrito lateral ----------
   Un panel que entra desde la derecha:
   - arriba, cuánto falta para el envío gratis (la barra se va llenando);
   - cada prenda con su foto, color, talle, cantidad y precio;
   - sugerencias para completar el look;
   - abajo, los totales y el botón para pagar. */

let carritoActual = null;
let carritoFocoPrevio = null;
let sugeridosPromesa = null;

const ISOTIPO_TRAZO =
  '<path d="M50 12 C36 4 14 8 11 26 C9 38 19 44 29 40"/><path d="M14 52 C28 60 50 56 53 38 C55 26 45 20 35 24"/>';

/* Accesos del carrito vacío */
const ACCESOS_CARRITO = [
  ["Ballet", "/tienda.html?categoria=ballet"],
  ["Contemporáneo", "/tienda.html?categoria=contemporaneo"],
  ["Folklore", "/tienda.html?categoria=folklore"],
  ["Tango", "/tienda.html?categoria=tango"],
  ["Fiesta y gala", "/tienda.html?categoria=fiesta-y-gala"]
];

function actualizarContador(carrito) {
  const contador = document.querySelector(".contador-carrito");
  if (!contador) return;

  const antes = Number(contador.textContent) || 0;
  contador.textContent = carrito.cantidad;
  contador.hidden = carrito.cantidad === 0;

  /* Un saltito cuando entra una prenda */
  if (carrito.cantidad > antes && carritoActual) {
    contador.classList.remove("rebote");
    void contador.offsetWidth;
    contador.classList.add("rebote");
  }
}

function crearPanelCarrito() {
  if (document.querySelector(".panel-carrito")) return;

  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="fondo-oscuro"></div>
     <aside class="panel-carrito" role="dialog" aria-modal="true" aria-labelledby="titulo-carrito" inert>
       <header class="bolsa-cabecera">
         <h2 id="titulo-carrito">Tu carrito</h2>
         <span class="bolsa-cuenta" id="bolsa-cuenta"></span>
         <button class="boton-icono cerrar-carrito" type="button" aria-label="Cerrar carrito">${icono("cerrar")}</button>
       </header>
       <div class="bolsa-envio" id="bolsa-envio" hidden>
         <p id="bolsa-envio-texto"></p>
         <div class="bolsa-envio-barra" aria-hidden="true"><span id="bolsa-envio-avance"></span></div>
       </div>
       <div class="panel-cuerpo"></div>
       <footer class="panel-pie"></footer>
     </aside>`
  );

  const panel = document.querySelector(".panel-carrito");

  panel.querySelector(".cerrar-carrito").addEventListener("click", cerrarCarrito);
  document.querySelector(".fondo-oscuro").addEventListener("click", cerrarCarrito);
  document.addEventListener("keydown", (e) => e.key === "Escape" && cerrarCarrito());

  /* Los links del panel cierran el carrito (en la demo no se recarga la página) */
  panel.addEventListener("click", (e) => {
    if (e.target.closest("[data-cerrar-carrito]")) cerrarCarrito();
  });

  /* Sumar, restar y quitar */
  panel.querySelector(".panel-cuerpo").addEventListener("click", async (e) => {
    const boton = e.target.closest("[data-accion]");
    if (!boton) return;

    const id = boton.dataset.id;
    const item = carritoActual.items.find((i) => String(i.variante_id) === id);
    if (!item) return;

    const fila = boton.closest(".bolsa-item");
    const nueva = item.cantidad + (boton.dataset.accion === "sumar" ? 1 : -1);
    const quitar = boton.dataset.accion === "quitar" || nueva < 1;

    fila.querySelectorAll("button").forEach((b) => (b.disabled = true));
    fila.classList.add(quitar ? "saliendo" : "actualizando");

    try {
      const pedido = quitar
        ? api(`/carrito/items/${id}`, { method: "DELETE" })
        : api(`/carrito/items/${id}`, { method: "PUT", body: { cantidad: nueva } });

      /* Al quitar, la fila se pliega antes de redibujar la lista */
      const [carrito] = await Promise.all([pedido, quitar ? plegarFila(fila) : null]);
      pintarCarrito(carrito);
    } catch (error) {
      aviso(error.message, "error");
      pintarCarrito(carritoActual);
    }
  });
}

/* Pliega una fila (alto y opacidad a cero) y avisa cuando terminó */
function plegarFila(fila) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();

  fila.style.height = `${fila.offsetHeight}px`;
  void fila.offsetHeight;
  fila.style.height = "0px";

  return new Promise((listo) => setTimeout(listo, 380));
}

/* Cuánto falta para el envío gratis. La barra es siempre la misma: así se anima al cambiar */
function pintarEnvioGratis(carrito) {
  const caja = document.getElementById("bolsa-envio");
  const { gratisDesde } = carrito.envio;
  const hayPrendas = carrito.items.some((i) => i.disponible);

  caja.hidden = !(gratisDesde > 0 && hayPrendas);
  if (caja.hidden) return;

  const avance = Math.min(Math.round((carrito.subtotal / gratisDesde) * 100), 100);
  const logrado = avance >= 100;

  caja.classList.toggle("logrado", logrado);
  document.getElementById("bolsa-envio-texto").innerHTML = logrado
    ? `${icono("check")}<span>Tu pedido tiene <strong>envío gratis</strong></span>`
    : `${icono("envio")}<span>Te faltan <strong>${pesos(gratisDesde - carrito.subtotal)}</strong> para el envío gratis</span>`;
  document.getElementById("bolsa-envio-avance").style.setProperty("--avance", `${avance}%`);
}

function itemDelCarrito(i, orden) {
  const url = `/producto.html?p=${encodeURIComponent(i.slug)}`;

  return `
    <li class="bolsa-item ${i.disponible ? "" : "no-disponible"}" style="--orden:${orden}">
      <a class="foto bolsa-foto" data-foto="" href="${url}" data-cerrar-carrito tabindex="-1" aria-hidden="true">
        ${i.imagen ? `<img src="${esc(i.imagen)}" alt="" width="200" height="250">` : ""}
      </a>
      <div class="bolsa-info">
        <a class="bolsa-nombre" href="${url}" data-cerrar-carrito>${esc(i.nombre)}</a>
        <p class="bolsa-detalle">
          <span class="punto-color" style="background:${colorSeguro(i.color_hex)}"></span>${esc(i.color)}<span aria-hidden="true">·</span>Talle ${esc(i.talle)}
        </p>
        ${!i.disponible ? `<p class="texto-error">Sin stock: quitala para continuar</p>` : ""}
        ${i.stock_insuficiente ? `<p class="texto-error">Solo quedan ${i.maximo}</p>` : ""}
        <div class="bolsa-fila">
          <div class="cantidad bolsa-cantidad" role="group" aria-label="Cantidad de ${esc(i.nombre)}">
            <button type="button" data-accion="restar" data-id="${i.variante_id}"
              aria-label="${i.cantidad === 1 ? "Quitar" : "Restar una unidad de"} ${esc(i.nombre)}">−</button>
            <span aria-live="polite">${i.cantidad}</span>
            <button type="button" data-accion="sumar" data-id="${i.variante_id}" aria-label="Sumar una unidad de ${esc(i.nombre)}"
              ${i.cantidad >= i.maximo ? "disabled" : ""}>+</button>
          </div>
          <p class="bolsa-precio">
            <strong>${pesos(i.precio * i.cantidad)}</strong>
            ${i.cantidad > 1 ? `<span>${pesos(i.precio)} c/u</span>` : ""}
          </p>
        </div>
      </div>
      <button type="button" class="bolsa-quitar" data-accion="quitar" data-id="${i.variante_id}"
              aria-label="Quitar ${esc(i.nombre)} del carrito" title="Quitar">${icono("cerrar")}</button>
    </li>`;
}

/* Prendas para sumar al pedido: las novedades que todavía no están en el carrito */
function obtenerSugeridos() {
  if (!sugeridosPromesa) {
    sugeridosPromesa = api("/productos?por_pagina=12")
      .then((datos) => datos.productos.filter((p) => !p.agotado))
      .catch(() => []);
  }
  return sugeridosPromesa;
}

async function pintarSugeridos(carrito) {
  const caja = document.querySelector(".bolsa-sugeridos");
  if (!caja) return;

  const enCarrito = new Set(carrito.items.map((i) => i.producto_id));
  const sugeridos = (await obtenerSugeridos()).filter((p) => !enCarrito.has(p.id)).slice(0, 6);

  /* Mientras se pedían, el carrito pudo cambiar */
  if (carrito !== carritoActual || sugeridos.length === 0) return;

  caja.innerHTML = `
    <h3>Completá tu look</h3>
    <ul class="bolsa-sugeridos-pista">
      ${sugeridos
        .map((p) => {
          const precio = p.precio_oferta ?? p.precio;
          return `
          <li>
            <a class="bolsa-sugerido" href="/producto.html?p=${encodeURIComponent(p.slug)}" data-cerrar-carrito>
              <span class="foto" data-foto="">${p.imagen ? `<img src="${esc(p.imagen)}" alt="" loading="lazy" width="240" height="300">` : ""}</span>
              <span class="bolsa-sugerido-nombre">${esc(p.nombre)}</span>
              <span class="bolsa-sugerido-precio">${pesos(precio)}</span>
            </a>
          </li>`;
        })
        .join("")}
    </ul>`;
  caja.hidden = false;
}

function pintarCarrito(carrito) {
  actualizarContador(carrito);
  carritoActual = carrito;

  const panel = document.querySelector(".panel-carrito");
  if (!panel) return;

  const cuerpo = panel.querySelector(".panel-cuerpo");
  const pie = panel.querySelector(".panel-pie");
  const cuenta = document.getElementById("bolsa-cuenta");

  pintarEnvioGratis(carrito);

  /* ---------- Vacío ---------- */
  if (carrito.items.length === 0) {
    cuenta.textContent = "";
    panel.classList.add("vacio");

    cuerpo.innerHTML = `
      <div class="bolsa-vacia">
        <svg class="bolsa-vacia-isotipo" viewBox="0 0 64 64" aria-hidden="true">${ISOTIPO_TRAZO}</svg>
        <p class="bolsa-vacia-titulo">Tu carrito espera su primera prenda</p>
        <p>Elegí por disciplina y armá el look para tu próxima función.</p>
        <ul class="bolsa-accesos">
          ${ACCESOS_CARRITO.map(([nombre, url]) => `<li><a href="${url}" data-cerrar-carrito>${esc(nombre)}${icono("flechaDer")}</a></li>`).join("")}
        </ul>
      </div>`;
    pie.innerHTML = `<a class="boton boton-ancho" href="/tienda.html" data-cerrar-carrito>Ver toda la tienda</a>`;
    return;
  }

  /* ---------- Con prendas ---------- */
  panel.classList.remove("vacio");
  cuenta.textContent = `${carrito.cantidad} ${carrito.cantidad === 1 ? "prenda" : "prendas"}`;

  cuerpo.innerHTML = `
    <ul class="bolsa-lista">${carrito.items.map(itemDelCarrito).join("")}</ul>
    <section class="bolsa-sugeridos" aria-label="Sugerencias" hidden></section>`;

  pintarSugeridos(carrito);

  const hayProblemas = carrito.items.some((i) => !i.disponible || i.stock_insuficiente);
  const { costo, gratisDesde } = carrito.envio;
  const envio = gratisDesde > 0 && carrito.subtotal >= gratisDesde ? 0 : costo || 0;
  const total = carrito.subtotal + envio;

  pie.innerHTML = `
    <dl class="bolsa-totales">
      <div><dt>Subtotal</dt><dd>${pesos(carrito.subtotal)}</dd></div>
      <div><dt>Envío a domicilio</dt><dd>${envio === 0 ? "Gratis" : pesos(envio)}</dd></div>
      <div class="bolsa-total"><dt>Total</dt><dd>${pesos(total)}</dd></div>
    </dl>
    <p class="bolsa-cuotas">Hasta 12 cuotas de ${pesos(total / 12)} con Mercado Pago</p>
    ${hayProblemas ? `<p class="texto-error">Quitá o ajustá las prendas sin stock para continuar.</p>` : ""}
    <a class="boton boton-ancho bolsa-pagar ${hayProblemas ? "deshabilitado" : ""}" href="/checkout.html" data-cerrar-carrito>
      Finalizar compra${icono("flechaDer")}
    </a>
    <div class="bolsa-pie-links">
      <button type="button" class="bolsa-seguir" data-cerrar-carrito>Seguir comprando</button>
      <span class="bolsa-seguro">${icono("escudo")}Pago seguro</span>
    </div>`;
}

/* Con el carrito abierto, el resto de la página no recibe foco ni clics */
function bloquearFondo(bloquear) {
  document.querySelectorAll("#header, #contenido, #footer, .barra-anuncio").forEach((el) => (el.inert = bloquear));
}

async function abrirCarrito() {
  crearPanelCarrito();

  const panel = document.querySelector(".panel-carrito");
  if (panel.classList.contains("abierto")) return;

  carritoFocoPrevio = document.activeElement;

  document.querySelector(".fondo-oscuro").classList.add("visible");
  panel.classList.add("abierto", "entrando");
  panel.inert = false;
  document.body.classList.add("sin-scroll");
  bloquearFondo(true);
  panel.querySelector(".cerrar-carrito").focus({ preventScroll: true });

  /* Las filas entran escalonadas solo al abrir, no en cada cambio de cantidad */
  setTimeout(() => panel.classList.remove("entrando"), 1200);

  try {
    /* Se muestra lo que ya teníamos; solo se redibuja si el servidor dice otra cosa */
    const fresco = await api("/carrito");
    if (JSON.stringify(fresco) !== JSON.stringify(carritoActual)) pintarCarrito(fresco);
  } catch (error) {
    aviso(error.message, "error");
  }
}

function cerrarCarrito() {
  const panel = document.querySelector(".panel-carrito");
  if (!panel || !panel.classList.contains("abierto")) return;

  panel.classList.remove("abierto", "entrando");
  panel.inert = true;
  document.querySelector(".fondo-oscuro").classList.remove("visible");
  document.body.classList.remove("sin-scroll");
  bloquearFondo(false);
  carritoFocoPrevio?.focus?.({ preventScroll: true });
}

/* Para que otras páginas (producto) actualicen el carrito */
window.tienda = { abrirCarrito, pintarCarrito, actualizarContador };

/* ---------- De la tarjeta a la ficha ----------
   Al tocar una tarjeta, su foto "viaja" hasta la ficha del producto
   (en navegadores con transiciones entre páginas). Guardamos qué foto
   era para que la ficha la muestre desde el primer instante. */

document.addEventListener("click", (e) => {
  const link = e.target.closest(".tarjeta-link");
  if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const foto = link.querySelector(".tarjeta-foto");
  if (!foto) return;

  /* El nombre de la transición tiene que estar en un solo elemento */
  document.querySelectorAll(".tarjeta-foto").forEach((f) => (f.style.viewTransitionName = ""));
  const fotoDeFicha = document.getElementById("foto-principal");
  if (fotoDeFicha) fotoDeFicha.style.viewTransitionName = "none";
  foto.style.viewTransitionName = "producto-foto";

  try {
    const img = foto.querySelector("img:not(.foto-hover):not(.foto-faltante)");
    const slug = new URL(link.href).searchParams.get("p");
    if (img && slug) {
      sessionStorage.setItem("oc-foto-previa", JSON.stringify({ slug, url: img.getAttribute("src") }));
    }
  } catch {
    /* sin sessionStorage la ficha carga la foto como siempre */
  }
});

/* ---------- Movimiento de entrada ----------
   Cada cosa entra a su manera cuando llega a la pantalla:
   - los textos suben;
   - las fotos grandes se descubren como un telón que se abre;
   - el hero arma su propia entrada, palabra por palabra.
   Si la persona pidió menos movimiento, no se anima nada.
   Las reglas visuales están en styles.css ("Movimiento de entrada"). */

const MOVIMIENTO = [
  [".hero", "hero"],
  [".a-medida-foto, .reinas-foto, .escena-grilla .foto", "telon"],
  [".seccion-cabecera > *, .disc-titulos > *, .disc-controles, .seccion-pie", "sube"],
  [".a-medida-texto > .sobretitulo, .a-medida-texto > h2, .a-medida-texto > p, .a-medida-texto > .boton", "sube"],
  [".reinas-texto > *, .pie-cta-interior > *, .tienda-cabecera > *", "sube"],
  [".beneficios li, .pasos li, .pie-garantias li", "sube"],
  [".tarjeta", "sube"]
];

function iniciarMovimiento() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.documentElement.classList.add("con-movimiento");

  /* Hasta que el telón de entrada termina, nada se descubre */
  let telonTerminado = false;
  let pendientes = [];
  let revisionPedida = false;
  let reloj = null;

  /*
    Descubre lo que ya está en pantalla. Se mide la posición directamente
    (en vez de esperar un aviso del navegador): así nada queda oculto.
  */
  const revisar = () => {
    revisionPedida = false;
    if (!telonTerminado || pendientes.length === 0) return;

    const limite = window.innerHeight * 0.94;

    pendientes = pendientes.filter((el) => {
      if (!el.isConnected) return false;

      const caja = el.getBoundingClientRect();
      const visible = caja.top < limite && caja.bottom > 0 && caja.width > 0;
      if (visible) el.classList.add("en-vista");
      return !visible;
    });

    /*
      Red de seguridad: mientras quede algo por descubrir, se vuelve a mirar
      cada tanto. Cubre los casos en que el navegador no avisa del scroll.
    */
    if (pendientes.length === 0) {
      clearInterval(reloj);
      reloj = null;
    } else if (!reloj) {
      reloj = setInterval(revisar, 500);
    }
  };

  const pedirRevision = () => {
    if (revisionPedida) return;
    revisionPedida = true;
    requestAnimationFrame(revisar);
    /* Si la ventana no está dibujando (pestaña en segundo plano), el reloj lo resuelve igual */
    setTimeout(revisar, 160);
  };

  /* El título del hero se parte en palabras para que suban de a una */
  const partirTitulo = (hero) => {
    const titulo = hero.querySelector("h1");
    if (!titulo || titulo.querySelector(".palabra")) return;

    const texto = titulo.textContent.trim();
    titulo.setAttribute("aria-label", texto);
    titulo.innerHTML = texto
      .split(/\s+/)
      .map((p, i) => `<span class="palabra" aria-hidden="true"><span style="--i:${i}">${esc(p)}</span></span>`)
      .join(" ");
  };

  const marcar = (nodo) => {
    if (!(nodo instanceof Element)) return;

    MOVIMIENTO.forEach(([selector, tipo]) => {
      const encontrados = [...nodo.querySelectorAll(selector)];
      if (nodo.matches(selector)) encontrados.unshift(nodo);

      encontrados.forEach((el) => {
        if (el.dataset.mov) return;
        el.dataset.mov = tipo;

        /* Los hermanos entran uno detrás del otro */
        const hermanos = [...el.parentElement.children].filter((h) => h.matches(selector));
        el.style.setProperty("--orden", hermanos.indexOf(el) % (tipo === "telon" ? 4 : 6));

        if (tipo === "hero") partirTitulo(el);
        pendientes.push(el);
      });
    });

    pedirRevision();
  };

  marcar(document.body);

  /* Lo que se agrega después (tarjetas de producto, vistas de la demo) */
  new MutationObserver((cambios) => {
    cambios.forEach((c) => c.addedNodes.forEach(marcar));
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener("scroll", pedirRevision, { passive: true });
  window.addEventListener("resize", pedirRevision);

  (window.telonListo || Promise.resolve()).then(() => {
    telonTerminado = true;
    revisar();
  });
}

/* ---------- Arranque ----------
   El header y el footer se arman apenas hay página (antes del primer
   dibujo, porque el script bloquea el render): así no "aparecen" después. */

function arrancar() {
  armarHeader();
  armarFooter();
  iniciarMovimiento();
  activarLinksWhatsApp();
  crearPanelCarrito();
  api("/carrito").then(pintarCarrito).catch(() => {});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", arrancar);
} else {
  arrancar();
}
