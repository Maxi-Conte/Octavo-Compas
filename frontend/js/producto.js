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
    principal.innerHTML = `<img src="${esc(url)}" alt="${esc(estado.producto.nombre)}">`;
    document.querySelectorAll(".miniaturas button").forEach((b) => b.classList.toggle("activo", b.dataset.url === url));
  };

  $("miniaturas").innerHTML = ordenadas
    .map((img) => `<button type="button" data-url="${esc(img.url)}" aria-label="Ver foto"><img src="${esc(img.url)}" alt=""></button>`)
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
      (c) => `<button type="button" class="muestra-color ${c.nombre === estado.color ? "activo" : ""}"
        data-color="${esc(c.nombre)}" style="background:${esc(c.hex)}; ${c.hayStock ? "" : "opacity:.35"}"
        title="${esc(c.nombre)}${c.hayStock ? "" : " (sin stock)"}" aria-label="${esc(c.nombre)}"></button>`
    )
    .join("");

  $("color-elegido").textContent = estado.color || "";
}

function pintarTalles() {
  const delColor = estado.producto.variantes.filter((v) => v.color === estado.color);

  $("talles").innerHTML = delColor
    .map(
      (v) => `<button type="button" class="chip ${v.talle === estado.talle ? "activo" : ""}"
        data-talle="${esc(v.talle)}" ${v.disponible ? "" : "disabled"}>${esc(v.talle)}</button>`
    )
    .join("");

  $("talle-elegido").textContent = estado.talle || "";

  const variante = varianteElegida();
  $("aviso-stock").textContent = variante?.ultimas ? "¡Últimas unidades!" : "";

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
    ? `<span class="precio-actual">${pesos(p.precio_oferta)}</span><s>${pesos(p.precio)}</s>`
    : `<span class="precio-actual">${pesos(p.precio)}</span>`;

  $("cuotas").textContent = `Hasta 12 cuotas de ${pesos(actual / 12)} con Mercado Pago (según tu tarjeta)`;
}

function pintarTodo() {
  const p = estado.producto;

  document.title = `${p.nombre} | Tienda`;
  $("nombre").textContent = p.nombre;
  $("nombre").classList.remove("cargando");
  $("descripcion").textContent = p.descripcion || "";

  $("migas").innerHTML = `<a href="/">Inicio</a> / ` +
    (p.categoria_slug ? `<a href="/tienda.html?categoria=${encodeURIComponent(p.categoria_slug)}">${esc(p.categoria_nombre)}</a> / ` : "") +
    esc(p.nombre);

  pintarPrecio();
  pintarColores();
  pintarTalles();
  pintarGaleria();

  if (p.relacionados.length) {
    $("relacionados").innerHTML = p.relacionados.map(tarjetaProducto).join("");
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
