/* =====================================================
   DETALLE DE PRODUCTO
   El cliente elige color -> talle -> cantidad.
   Los talles sin stock del color elegido aparecen tachados.
===================================================== */

const estado = {
  producto: null,
  color: null,
  talle: null,
  cantidad: 1
};

const $ = (id) => document.getElementById(id);

const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- Foto adelantada ----------
   Si la persona viene de tocar una tarjeta, comun.js dejó guardada la foto
   que ya tenía en pantalla. La mostramos antes del primer dibujo, así la
   foto de la tarjeta "viaja" hasta la ficha en vez de aparecer de golpe. */

(function adelantarFoto() {
  try {
    const previa = JSON.parse(sessionStorage.getItem("oc-foto-previa") || "null");
    sessionStorage.removeItem("oc-foto-previa");
    if (!previa || previa.slug !== parametro("p") || !/^(\/|https:\/\/)/.test(previa.url)) return;

    const principal = $("foto-principal");
    principal.classList.remove("cargando");
    principal.innerHTML = `<img src="${esc(previa.url)}" alt="" width="800" height="1000">`;
  } catch {
    /* sin sessionStorage: la foto llega con el resto de la ficha */
  }
})();

function coloresUnicos(variantes) {
  const vistos = new Map();
  variantes.forEach((v) => {
    if (!vistos.has(v.color)) vistos.set(v.color, { nombre: v.color, hex: v.color_hex, hayStock: false });
    if (v.disponible) vistos.get(v.color).hayStock = true;
  });
  return [...vistos.values()];
}

function varianteElegida() {
  return estado.producto.variantes.find((v) => v.color === estado.color && v.talle === estado.talle) || null;
}

/* ---------- Galería ----------
   Una pista horizontal con todas las fotos: en celular se desliza con el
   dedo y en escritorio se recorre con las miniaturas o el teclado.
   Con mouse, al pasar por la foto se amplía siguiendo el cursor. */

function pintarGaleria() {
  const { imagenes, nombre } = estado.producto;

  /* Primero las fotos del color elegido, después el resto */
  const ordenadas = [
    ...imagenes.filter((i) => i.color === estado.color),
    ...imagenes.filter((i) => i.color !== estado.color)
  ];

  const principal = $("foto-principal");
  const miniaturas = $("miniaturas");
  principal.classList.remove("cargando");

  if (!ordenadas.length) {
    principal.innerHTML = "";
    miniaturas.innerHTML = "";
    return;
  }

  const total = ordenadas.length;

  principal.innerHTML = `
    <div class="galeria-pista" id="galeria-pista" tabindex="0" role="group"
         aria-roledescription="carrusel" aria-label="Fotos de ${esc(nombre)}">
      ${ordenadas
        .map(
          (img, i) => `
        <div class="foto galeria-slide" data-foto="Foto del producto · 4:5"
             role="group" aria-roledescription="foto" aria-label="${i + 1} de ${total}">
          <img src="${esc(img.url)}" alt="${esc(nombre)}${img.color ? `, color ${esc(img.color)}` : ""}"
               width="800" height="1000" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>
        </div>`
        )
        .join("")}
    </div>
    ${total > 1 ? `<span class="galeria-contador" id="galeria-contador" aria-hidden="true">1 / ${total}</span>` : ""}`;

  miniaturas.innerHTML = total > 1
    ? ordenadas
        .map(
          (img, i) => `<button type="button" class="foto" data-foto="" data-indice="${i}" aria-label="Ver foto ${i + 1}">
            <img src="${esc(img.url)}" alt="" loading="lazy" width="160" height="200"></button>`
        )
        .join("")
    : "";

  const pista = $("galeria-pista");
  let actual = -1;

  const marcar = (indice) => {
    if (indice === actual) return;
    actual = indice;

    miniaturas.querySelectorAll("button").forEach((b, i) => {
      b.classList.toggle("activo", i === indice);
      b.setAttribute("aria-pressed", String(i === indice));
    });

    const contador = $("galeria-contador");
    if (contador) contador.textContent = `${indice + 1} / ${total}`;
  };

  marcar(0);

  /* Al deslizar, se actualizan el contador y la miniatura activa */
  let cuadro = 0;
  pista.addEventListener(
    "scroll",
    () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => marcar(Math.round(pista.scrollLeft / pista.clientWidth)));
    },
    { passive: true }
  );

  miniaturas.onclick = (e) => {
    const boton = e.target.closest("[data-indice]");
    if (!boton) return;
    pista.scrollTo({
      left: Number(boton.dataset.indice) * pista.clientWidth,
      behavior: sinMovimiento.matches ? "auto" : "smooth"
    });
  };

  /* Lupa: solo con mouse (en pantallas táctiles se usa el zoom del teléfono) */
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    pista.addEventListener("pointermove", (e) => {
      const slide = e.target.closest(".galeria-slide");
      if (!slide || !slide.classList.contains("foto-ok")) return;

      const caja = slide.getBoundingClientRect();
      slide.style.setProperty("--zoom-x", `${((e.clientX - caja.left) / caja.width) * 100}%`);
      slide.style.setProperty("--zoom-y", `${((e.clientY - caja.top) / caja.height) * 100}%`);
      slide.classList.add("con-zoom");
    });

    pista.addEventListener("pointerleave", () => {
      pista.querySelectorAll(".con-zoom").forEach((s) => s.classList.remove("con-zoom"));
    });
  }
}

/* ---------- Pintar ---------- */

function pintarColores() {
  $("colores").innerHTML = coloresUnicos(estado.producto.variantes)
    .map(
      (c) => {
        const activo = c.nombre === estado.color;
        const nombre = `${c.nombre}${c.hayStock ? "" : " (sin stock)"}`;
        return `<button type="button" class="muestra-color ${activo ? "activo" : ""} ${c.hayStock ? "" : "sin-stock"}"
          data-color="${esc(c.nombre)}" style="background:${colorSeguro(c.hex)}" aria-pressed="${activo}"
          title="${esc(nombre)}" aria-label="${esc(nombre)}"></button>`;
      }
    )
    .join("");

  $("color-elegido").textContent = estado.color || "";
}

function pintarTalles() {
  const delColor = estado.producto.variantes.filter((v) => v.color === estado.color);
  const conStock = delColor.filter((v) => v.disponible);

  /* Si el color tiene un solo talle disponible, ya queda elegido */
  if (!estado.talle && conStock.length === 1) estado.talle = conStock[0].talle;

  $("talles").innerHTML = delColor
    .map(
      (v) => `<button type="button" class="chip chip-talle ${v.talle === estado.talle ? "activo" : ""}"
        data-talle="${esc(v.talle)}" aria-pressed="${v.talle === estado.talle}"
        ${v.disponible ? "" : `disabled aria-label="${esc(v.talle)}, sin stock"`}>${esc(v.talle)}</button>`
    )
    .join("");

  $("talle-elegido").textContent = estado.talle || "";
  $("selector-talle").classList.remove("pide-talle");

  const variante = varianteElegida();
  const avisoStock = $("aviso-stock");
  avisoStock.classList.remove("aviso-falta");
  avisoStock.textContent = variante?.ultimas ? "Quedan pocas unidades en este talle" : "";

  /*
    El botón solo se apaga si no hay nada para vender. Sin talle elegido
    sigue activo: al tocarlo, lleva a elegir el talle.
  */
  let texto = "Agregar al carrito";
  let apagado = false;

  if (conStock.length === 0) {
    texto = "Sin stock en este color";
    apagado = true;
  } else if (!variante) {
    texto = "Elegí un talle";
  }

  for (const boton of [$("agregar"), $("agregar-fijo")]) {
    boton.disabled = apagado;
    boton.textContent = texto;
  }
}

function pintarPrecio() {
  const p = estado.producto;
  const actual = p.precio_oferta ?? p.precio;

  const precio = p.precio_oferta !== null
    ? `<span class="precio-actual">${pesos(p.precio_oferta)}</span><s><span class="oculto-visual">Antes </span>${pesos(p.precio)}</s>`
    : `<span class="precio-actual">${pesos(p.precio)}</span>`;

  $("precio").innerHTML = precio;
  $("precio-fijo").innerHTML = precio;
  $("cuotas").textContent = `Hasta 12 cuotas de ${pesos(actual / 12)} con Mercado Pago (según tu tarjeta)`;
}

/* Title, description y Open Graph con los datos del producto */
function actualizarMeta(p) {
  const descripcion = (p.descripcion || `${p.nombre} de Octavo Compás Indumentaria.`).slice(0, 160);
  const meta = (selector, valor) => document.querySelector(selector)?.setAttribute("content", valor);

  document.title = `${p.nombre} | Octavo Compás Indumentaria`;
  meta('meta[name="description"]', descripcion);
  meta('meta[property="og:title"]', p.nombre);
  meta('meta[property="og:description"]', descripcion);
  if (p.imagenes[0]) meta('meta[property="og:image"]', new URL(p.imagenes[0].url, location.origin).href);
}

/* Datos estructurados: así Google puede mostrar precio y disponibilidad */
function publicarDatosEstructurados(p) {
  const datos = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.nombre,
    description: p.descripcion || undefined,
    category: p.categoria_nombre || undefined,
    image: p.imagenes.map((i) => new URL(i.url, location.origin).href),
    brand: { "@type": "Brand", name: "Octavo Compás Indumentaria" },
    offers: {
      "@type": "Offer",
      url: location.href,
      priceCurrency: "ARS",
      price: p.precio_oferta ?? p.precio,
      availability: p.variantes.some((v) => v.disponible)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock"
    }
  };

  const bloque = document.createElement("script");
  bloque.type = "application/ld+json";
  bloque.textContent = JSON.stringify(datos);
  document.head.append(bloque);
}

function pintarTodo() {
  const p = estado.producto;

  actualizarMeta(p);
  publicarDatosEstructurados(p);

  $("etiqueta-producto").textContent = p.categoria_nombre || "";
  $("nombre").textContent = p.nombre;
  $("nombre").classList.remove("cargando");
  $("nombre-fijo").textContent = p.nombre;
  $("descripcion").textContent = p.descripcion || "";

  const linkMedida = $("link-medida");
  linkMedida.dataset.whatsapp =
    `Hola Octavo Compás, me interesa "${p.nombre}" y quiero consultar por otro talle o color a medida.`;
  activarLinksWhatsApp(linkMedida.parentElement);

  $("migas").innerHTML = `<a href="/">Inicio</a> / ` +
    (p.categoria_slug ? `<a href="/tienda.html?categoria=${encodeURIComponent(p.categoria_slug)}">${esc(p.categoria_nombre)}</a> / ` : "") +
    esc(p.nombre);

  pintarPrecio();
  pintarColores();
  pintarTalles();
  pintarGaleria();

  if (p.relacionados.length) {
    $("relacionados").innerHTML = p.relacionados.map((r) => tarjetaProducto(r)).join("");
    $("seccion-relacionados").hidden = false;
  }
}

/* ---------- Eventos ---------- */

$("colores").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-color]");
  if (!boton) return;

  estado.color = boton.dataset.color;
  /* Si el talle elegido no existe o no tiene stock en el nuevo color, se limpia */
  if (!varianteElegida()?.disponible) estado.talle = null;
  estado.cantidad = 1;
  $("cantidad").textContent = "1";

  pintarColores();
  pintarTalles();
  pintarGaleria();
});

$("talles").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-talle]");
  if (!boton || boton.disabled) return;
  estado.talle = boton.dataset.talle;
  pintarTalles();
});

$("menos").addEventListener("click", () => {
  estado.cantidad = Math.max(1, estado.cantidad - 1);
  $("cantidad").textContent = estado.cantidad;
});

$("mas").addEventListener("click", () => {
  estado.cantidad = Math.min(10, estado.cantidad + 1);
  $("cantidad").textContent = estado.cantidad;
});

/* Falta el talle: se lo señalamos en vez de dejar un botón que no responde */
function pedirTalle() {
  const selector = $("selector-talle");
  const avisoStock = $("aviso-stock");

  avisoStock.textContent = "Elegí un talle para agregar la prenda.";
  avisoStock.classList.add("aviso-falta");

  /* Reinicia la animación aunque ya estuviera marcada */
  selector.classList.remove("pide-talle");
  void selector.offsetWidth;
  selector.classList.add("pide-talle");

  selector.scrollIntoView({ block: "center", behavior: sinMovimiento.matches ? "auto" : "smooth" });
  selector.querySelector(".chip-talle:not(:disabled)")?.focus({ preventScroll: true });
}

async function agregarAlCarrito() {
  if (!estado.producto) return;

  const variante = varianteElegida();
  if (!variante) return pedirTalle();

  const botones = [$("agregar"), $("agregar-fijo")];
  botones.forEach((b) => {
    b.disabled = true;
    b.textContent = "Agregando...";
  });

  try {
    const carrito = await api("/carrito/items", {
      method: "POST",
      body: { variante_id: variante.id, cantidad: estado.cantidad }
    });

    window.tienda.pintarCarrito(carrito);
    if (carrito.aviso) aviso(carrito.aviso);
    window.tienda.abrirCarrito();
  } catch (error) {
    aviso(error.message, "error");
  } finally {
    pintarTalles();
  }
}

$("agregar").addEventListener("click", agregarAlCarrito);
$("agregar-fijo").addEventListener("click", agregarAlCarrito);

/* ---------- Barra de compra fija (celular) ----------
   Aparece cuando la persona ya pasó de largo el botón principal,
   y se corre cuando llega el pie de página. Al abrir la ficha no
   se muestra: ahí lo importante es la foto. */

(function barraFija() {
  const barra = $("compra-fija");
  const estados = new Map();

  const actualizar = () => {
    const mostrar = estado.producto && estados.get("agregar") === "arriba" && estados.get("footer") !== "visible";
    barra.classList.toggle("visible", Boolean(mostrar));
    barra.inert = !mostrar;
    document.body.classList.toggle("con-compra-fija", Boolean(mostrar));
  };

  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((e) => {
      const donde = e.isIntersecting ? "visible" : e.boundingClientRect.top < 0 ? "arriba" : "abajo";
      estados.set(e.target.id, donde);
    });
    actualizar();
  });

  observador.observe($("agregar"));
  observador.observe($("footer"));
})();

$("ver-guia").addEventListener("click", () => $("guia-talles").showModal());
$("cerrar-guia").addEventListener("click", () => $("guia-talles").close());

/* Cerrar la guía tocando afuera */
$("guia-talles").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
});

/* Texto de envío gratis en el acordeón y en las garantías */
obtenerConfig().then((config) => {
  if (config.envio?.gratisDesde) {
    const desde = pesos(config.envio.gratisDesde);
    $("texto-envio-gratis").textContent = `Envío gratis en compras desde ${desde}.`;
    $("garantia-envio").textContent = `Gratis desde ${desde}`;
  }
});

/* ---------- Carga inicial ---------- */

(async () => {
  const slug = parametro("p");

  if (!slug) {
    location.href = "/tienda.html";
    return;
  }

  try {
    estado.producto = await api(`/productos/${encodeURIComponent(slug)}`);

    /* Color inicial: el primero que tenga stock */
    const colores = coloresUnicos(estado.producto.variantes);
    estado.color = (colores.find((c) => c.hayStock) || colores[0])?.nombre || null;

    pintarTodo();
  } catch (error) {
    $("producto").innerHTML = `<p class="vacio">${esc(error.message)} <a href="/tienda.html">Volver a la tienda</a></p>`;
  }
})();
