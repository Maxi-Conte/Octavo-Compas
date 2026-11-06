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

/* ---------- Pintar ---------- */

function pintarGaleria() {
  const { imagenes } = estado.producto;

  /* Primero las fotos del color elegido, después el resto */
  const ordenadas = [
    ...imagenes.filter((i) => i.color === estado.color),
    ...imagenes.filter((i) => i.color !== estado.color)
  ];

  const principal = $("foto-principal");
  principal.classList.remove("cargando");

  if (!ordenadas.length) {
    principal.innerHTML = "";
    $("miniaturas").innerHTML = "";
    return;
  }

  const mostrar = (url) => {
    principal.classList.remove("foto-ok");
    principal.innerHTML = `<img src="${esc(url)}" alt="${esc(estado.producto.nombre)}" width="800" height="1000">`;
    document.querySelectorAll(".miniaturas button").forEach((b) => {
      const activo = b.dataset.url === url;
      b.classList.toggle("activo", activo);
      b.setAttribute("aria-pressed", String(activo));
    });
  };

  $("miniaturas").innerHTML = ordenadas
    .map((img, i) => `<button type="button" class="foto" data-foto="" data-url="${esc(img.url)}" aria-label="Ver foto ${i + 1}">
        <img src="${esc(img.url)}" alt="" loading="lazy" width="160" height="200"></button>`)
    .join("");

  mostrar(ordenadas[0].url);

  $("miniaturas").onclick = (e) => {
    const boton = e.target.closest("[data-url]");
    if (boton) mostrar(boton.dataset.url);
  };
}

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

  $("talles").innerHTML = delColor
    .map(
      (v) => `<button type="button" class="chip chip-talle ${v.talle === estado.talle ? "activo" : ""}"
        data-talle="${esc(v.talle)}" aria-pressed="${v.talle === estado.talle}"
        ${v.disponible ? "" : `disabled aria-label="${esc(v.talle)}, sin stock"`}>${esc(v.talle)}</button>`
    )
    .join("");

  $("talle-elegido").textContent = estado.talle || "";

  const variante = varianteElegida();
  $("aviso-stock").textContent = variante?.ultimas ? "Quedan pocas unidades en este talle" : "";

  const boton = $("agregar");
  if (!delColor.some((v) => v.disponible)) {
    boton.disabled = true;
    boton.textContent = "Sin stock en este color";
  } else if (!variante) {
    boton.disabled = true;
    boton.textContent = "Elegí un talle";
  } else {
    boton.disabled = false;
    boton.textContent = "Agregar al carrito";
  }
}

function pintarPrecio() {
  const p = estado.producto;
  const actual = p.precio_oferta ?? p.precio;

  $("precio").innerHTML = p.precio_oferta !== null
    ? `<span class="precio-actual">${pesos(p.precio_oferta)}</span><s><span class="oculto-visual">Antes </span>${pesos(p.precio)}</s>`
    : `<span class="precio-actual">${pesos(p.precio)}</span>`;

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

function pintarTodo() {
  const p = estado.producto;

  actualizarMeta(p);
  $("etiqueta-producto").textContent = p.categoria_nombre || "";
  $("nombre").textContent = p.nombre;
  $("nombre").classList.remove("cargando");
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

$("agregar").addEventListener("click", async () => {
  const variante = varianteElegida();
  if (!variante) return;

  const boton = $("agregar");
  boton.disabled = true;
  boton.textContent = "Agregando...";

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
});

$("ver-guia").addEventListener("click", () => $("guia-talles").showModal());
$("cerrar-guia").addEventListener("click", () => $("guia-talles").close());

/* Cerrar la guía tocando afuera */
$("guia-talles").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
});

/* Texto de envío gratis en el acordeón */
obtenerConfig().then((config) => {
  if (config.envio?.gratisDesde) {
    $("texto-envio-gratis").textContent = `Envío gratis en compras desde ${pesos(config.envio.gratisDesde)}.`;
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
