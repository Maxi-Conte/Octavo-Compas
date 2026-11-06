/* Página de inicio: categorías, destacados y ofertas */

function esqueletos(cantidad) {
  return Array.from({ length: cantidad }, () =>
    `<div><div class="cargando" style="aspect-ratio:4/5"></div></div>`
  ).join("");
}

async function cargarGrilla(id, consulta) {
  const grilla = document.getElementById(id);
  grilla.innerHTML = esqueletos(4);

  try {
    const { productos } = await api(`/productos?${consulta}&por_pagina=4`);
    grilla.innerHTML = productos.length
      ? productos.map(tarjetaProducto).join("")
      : `<p class="vacio">Pronto vas a ver productos acá.</p>`;

    /* Si una sección queda vacía, la ocultamos */
    if (!productos.length && id === "ofertas") grilla.closest("section").hidden = true;
  } catch (error) {
    grilla.innerHTML = `<p class="vacio">${esc(error.message)}</p>`;
  }
}

async function cargarCategorias() {
  const contenedor = document.getElementById("categorias-inicio");

  try {
    const categorias = await api("/categorias");
    contenedor.innerHTML = categorias
      .slice(0, 3)
      .map((c) => `<a class="categoria-bloque" href="/tienda.html?categoria=${encodeURIComponent(c.slug)}">${esc(c.nombre)}</a>`)
      .join("");
  } catch {
    contenedor.closest("section").hidden = true;
  }
}

async function textoEnvio() {
  const config = await obtenerConfig();
  if (config.envio?.gratisDesde) {
    document.getElementById("texto-envio").textContent = `Gratis desde ${pesos(config.envio.gratisDesde)}`;
  }
}

cargarCategorias();
cargarGrilla("destacados", "destacados=1");
cargarGrilla("ofertas", "ofertas=1&orden=precio_asc");
textoEnvio();
