/* =====================================================
   CATÁLOGO CON FILTROS
   Los filtros viven en la URL (?categoria=...&talle=M,L)
   así se pueden compartir y el botón "atrás" funciona.
===================================================== */

const FILTROS = ["categoria", "talle", "color", "min", "max", "buscar", "orden", "pagina", "ofertas"];

function leerFiltros() {
  const params = new URLSearchParams(location.search);
  const filtros = {};
  FILTROS.forEach((f) => {
    if (params.get(f)) filtros[f] = params.get(f);
  });
  return filtros;
}

function cambiarFiltros(cambios, { resetPagina = true } = {}) {
  const filtros = { ...leerFiltros(), ...cambios };
  if (resetPagina) delete filtros.pagina;

  Object.keys(filtros).forEach((k) => {
    if (filtros[k] === "" || filtros[k] === null || filtros[k] === undefined) delete filtros[k];
  });

  history.pushState(null, "", "/tienda.html?" + new URLSearchParams(filtros));
  cargar();
}

/* Agrega o saca un valor de una lista "M,L,XL" */
function alternar(lista, valor) {
  const valores = lista ? lista.split(",") : [];
  const i = valores.indexOf(valor);
  i === -1 ? valores.push(valor) : valores.splice(i, 1);
  return valores.join(",");
}

let categorias = [];

function buscarCategoria(slug) {
  for (const c of categorias) {
    if (c.slug === slug) return { categoria: c, padre: null };
    const hija = c.hijas.find((h) => h.slug === slug);
    if (hija) return { categoria: hija, padre: c };
  }
  return null;
}

function pintarCategorias(filtros) {
  const link = (c) =>
    `<a href="#" data-categoria="${esc(c.slug)}" class="${filtros.categoria === c.slug ? "activo" : ""}">${esc(c.nombre)}</a>`;

  document.getElementById("filtro-categorias").innerHTML =
    `<li><a href="#" data-categoria="" class="${!filtros.categoria ? "activo" : ""}">Todo</a></li>` +
    categorias
      .map((c) => `<li>${link(c)}${c.hijas.length ? `<ul>${c.hijas.map((h) => `<li>${link(h)}</li>`).join("")}</ul>` : ""}</li>`)
      .join("");
}

function pintarTitulo(filtros) {
  const titulo = document.getElementById("titulo");
  const migas = document.getElementById("migas");
  const encontrada = filtros.categoria && buscarCategoria(filtros.categoria);

  let texto = "Tienda";
  let rastro = `<a href="/">Inicio</a> / <a href="/tienda.html">Tienda</a>`;

  if (encontrada) {
    texto = encontrada.padre ? `${encontrada.padre.nombre} · ${encontrada.categoria.nombre}` : encontrada.categoria.nombre;
    if (encontrada.padre) {
      rastro += ` / <a href="/tienda.html?categoria=${encodeURIComponent(encontrada.padre.slug)}">${esc(encontrada.padre.nombre)}</a>`;
    }
    rastro += ` / ${esc(encontrada.categoria.nombre)}`;
  } else if (filtros.ofertas) {
    texto = "Ofertas";
  } else if (filtros.buscar) {
    texto = `Resultados para "${filtros.buscar}"`;
  }

  titulo.textContent = texto;
  migas.innerHTML = rastro;
  document.title = `${texto} | Tienda`;
}

async function pintarFiltrosDisponibles(filtros) {
  const consulta = new URLSearchParams();
  ["categoria", "buscar", "ofertas"].forEach((f) => filtros[f] && consulta.set(f, filtros[f]));

  const disponibles = await api("/productos/filtros?" + consulta).catch(() => ({ talles: [], colores: [] }));
  const tallesActivos = (filtros.talle || "").split(",");
  const coloresActivos = (filtros.color || "").split(",");

  document.getElementById("filtro-talles").innerHTML = disponibles.talles
    .map((t) => `<button type="button" class="chip ${tallesActivos.includes(t) ? "activo" : ""}" data-talle="${esc(t)}">${esc(t)}</button>`)
    .join("") || `<span class="vacio">—</span>`;

  document.getElementById("filtro-colores").innerHTML = disponibles.colores
    .map(
      (c) => `<button type="button" class="muestra-color ${coloresActivos.includes(c.nombre) ? "activo" : ""}"
        data-color="${esc(c.nombre)}" style="background:${esc(c.hex)}" title="${esc(c.nombre)}" aria-label="${esc(c.nombre)}"></button>`
    )
    .join("");

  const formPrecio = document.getElementById("filtro-precio");
  formPrecio.min.value = filtros.min || "";
  formPrecio.max.value = filtros.max || "";
  if (disponibles.precio_min) formPrecio.min.placeholder = `Mín ${pesos(disponibles.precio_min)}`;
  if (disponibles.precio_max) formPrecio.max.placeholder = `Máx ${pesos(disponibles.precio_max)}`;
}

function pintarPaginacion(pagina, paginas) {
  const nav = document.getElementById("paginacion");
  if (paginas <= 1) {
    nav.innerHTML = "";
    return;
  }

  nav.innerHTML = Array.from({ length: paginas }, (_, i) => i + 1)
    .map((n) => `<button type="button" class="chip ${n === pagina ? "activo" : ""}" data-pagina="${n}">${n}</button>`)
    .join("");
}

async function cargar() {
  const filtros = leerFiltros();
  const grilla = document.getElementById("grilla");

  document.getElementById("orden").value = filtros.orden || "nuevos";
  pintarCategorias(filtros);
  pintarTitulo(filtros);
  pintarFiltrosDisponibles(filtros);

  grilla.innerHTML = Array.from({ length: 8 }, () => `<div class="cargando" style="aspect-ratio:4/5"></div>`).join("");

  try {
    const datos = await api("/productos?" + new URLSearchParams(filtros));

    document.getElementById("cantidad-resultados").textContent =
      `${datos.total} producto${datos.total === 1 ? "" : "s"}`;

    grilla.innerHTML = datos.productos.length
      ? datos.productos.map(tarjetaProducto).join("")
      : `<p class="vacio">No encontramos productos con esos filtros.</p>`;

    pintarPaginacion(datos.pagina, datos.paginas);
  } catch (error) {
    grilla.innerHTML = `<p class="vacio">${esc(error.message)}</p>`;
  }
}

/* ---------- Eventos ---------- */

document.getElementById("filtros").addEventListener("click", (e) => {
  const cat = e.target.closest("[data-categoria]");
  if (cat) {
    e.preventDefault();
    return cambiarFiltros({ categoria: cat.dataset.categoria, talle: "", color: "" });
  }

  const talle = e.target.closest("[data-talle]");
  if (talle) return cambiarFiltros({ talle: alternar(leerFiltros().talle, talle.dataset.talle) });

  const color = e.target.closest("[data-color]");
  if (color) return cambiarFiltros({ color: alternar(leerFiltros().color, color.dataset.color) });
});

document.getElementById("filtro-precio").addEventListener("submit", (e) => {
  e.preventDefault();
  cambiarFiltros({ min: e.target.min.value, max: e.target.max.value });
});

document.getElementById("orden").addEventListener("change", (e) => cambiarFiltros({ orden: e.target.value }));

document.getElementById("limpiar").addEventListener("click", () => {
  history.pushState(null, "", "/tienda.html");
  cargar();
});

document.getElementById("paginacion").addEventListener("click", (e) => {
  const boton = e.target.closest("[data-pagina]");
  if (!boton) return;
  cambiarFiltros({ pagina: boton.dataset.pagina }, { resetPagina: false });
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.getElementById("boton-filtros").addEventListener("click", () => {
  document.getElementById("filtros").classList.toggle("abierto");
});

window.addEventListener("popstate", cargar);

api("/categorias")
  .then((lista) => (categorias = lista))
  .catch(() => {})
  .finally(cargar);
