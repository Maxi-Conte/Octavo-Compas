/* =====================================================
   CATÁLOGO CON FILTROS
   Los filtros viven en la URL (?categoria=...&talle=M,L)
   así se pueden compartir y el botón "atrás" funciona.
===================================================== */

const FILTROS = ["categoria", "talle", "color", "min", "max", "buscar", "orden", "pagina", "ofertas"];

/* Texto corto debajo del título de cada categoría (editable) */
const DESCRIPCIONES = {
  danza: "Prendas para clase, ensayo y escenario, pensadas para acompañar cada movimiento.",
  ballet: "Mallas, faldas y tutús para clase, examen y función.",
  contemporaneo: "Prendas fluidas y cómodas para el trabajo de piso y el movimiento libre.",
  folklore: "Polleras, camisas y chalecos con terminaciones de taller para lucirse en el escenario.",
  tango: "Vestidos y faldas que acompañan cada giro.",
  "fiesta-y-gala": "Vestidos para fiestas, egresos y noches especiales.",
  "reinas-2026": "Vestidos de gala con bordados y pedrería, confeccionados a medida."
};

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
  const link = (c) => {
    const activo = filtros.categoria === c.slug;
    return `<a href="/tienda.html?categoria=${encodeURIComponent(c.slug)}" data-categoria="${esc(c.slug)}"
      class="${activo ? "activo" : ""}"${activo ? ' aria-current="page"' : ""}>${esc(c.nombre)}</a>`;
  };

  const todo = !filtros.categoria;

  document.getElementById("filtro-categorias").innerHTML =
    `<li><a href="/tienda.html" data-categoria="" class="${todo ? "activo" : ""}"${todo ? ' aria-current="page"' : ""}>Todo</a></li>` +
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
    texto = encontrada.categoria.nombre;
    if (encontrada.padre) {
      rastro += ` / <a href="/tienda.html?categoria=${encodeURIComponent(encontrada.padre.slug)}">${esc(encontrada.padre.nombre)}</a>`;
    }
    rastro += ` / ${esc(encontrada.categoria.nombre)}`;
  } else if (filtros.ofertas) {
    texto = "Ofertas";
  } else if (filtros.buscar) {
    texto = `Resultados para “${filtros.buscar}”`;
  }

  titulo.textContent = texto;
  migas.innerHTML = rastro;
  document.title = `${texto} | Octavo Compás Indumentaria`;

  const sobretitulo = document.getElementById("sobretitulo");
  sobretitulo.textContent = encontrada?.padre ? encontrada.padre.nombre : "";
  sobretitulo.hidden = !encontrada?.padre;

  const descripcion = document.getElementById("descripcion-categoria");
  const textoDescripcion = encontrada ? DESCRIPCIONES[encontrada.categoria.slug] || "" : "";
  descripcion.textContent = textoDescripcion;
  descripcion.hidden = !textoDescripcion;
}

async function pintarFiltrosDisponibles(filtros) {
  const consulta = new URLSearchParams();
  ["categoria", "buscar", "ofertas"].forEach((f) => filtros[f] && consulta.set(f, filtros[f]));

  const disponibles = await api("/productos/filtros?" + consulta).catch(() => ({ talles: [], colores: [] }));
  const tallesActivos = (filtros.talle || "").split(",");
  const coloresActivos = (filtros.color || "").split(",");

  document.getElementById("filtro-talles").innerHTML = disponibles.talles
    .map((t) => {
      const activo = tallesActivos.includes(t);
      return `<button type="button" class="chip ${activo ? "activo" : ""}" data-talle="${esc(t)}" aria-pressed="${activo}">${esc(t)}</button>`;
    })
    .join("") || `<span class="filtro-vacio">Sin talles disponibles</span>`;

  document.getElementById("filtro-colores").innerHTML = disponibles.colores
    .map((c) => {
      const activo = coloresActivos.includes(c.nombre);
      return `<button type="button" class="muestra-color ${activo ? "activo" : ""}" aria-pressed="${activo}"
        data-color="${esc(c.nombre)}" style="background:${colorSeguro(c.hex)}"
        title="${esc(c.nombre)}" aria-label="${esc(c.nombre)}"></button>`;
    })
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
    .map((n) => `<button type="button" class="chip ${n === pagina ? "activo" : ""}" data-pagina="${n}"
      aria-label="Página ${n}"${n === pagina ? ' aria-current="page"' : ""}>${n}</button>`)
    .join("");
}

async function cargar() {
  const filtros = leerFiltros();
  const grilla = document.getElementById("grilla");

  document.getElementById("orden").value = filtros.orden || "nuevos";
  pintarCategorias(filtros);
  pintarTitulo(filtros);
  pintarFiltrosDisponibles(filtros);

  grilla.innerHTML = Array.from({ length: 6 }, () =>
    `<div class="cargando esqueleto-tarjeta" aria-hidden="true"></div>`
  ).join("");

  try {
    const datos = await api("/productos?" + new URLSearchParams(filtros));
    const cantidad = `${datos.total} producto${datos.total === 1 ? "" : "s"}`;

    document.getElementById("cantidad-resultados").textContent = cantidad;
    document.getElementById("ver-resultados").textContent = `Ver ${cantidad}`;

    grilla.innerHTML = datos.productos.length
      ? datos.productos.map((p) => tarjetaProducto(p)).join("")
      : `<div class="vacio vacio-tienda">
           <p>No encontramos productos con esos filtros.</p>
           <a class="link-subrayado" data-whatsapp="Hola Octavo Compás, estoy buscando una prenda que no encontré en la tienda.">¿Buscás algo especial? Lo confeccionamos a medida</a>
         </div>`;

    activarLinksWhatsApp(grilla);
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

/* ---------- Panel de filtros en celular ---------- */

const panelFiltros = document.getElementById("filtros");
const botonFiltros = document.getElementById("boton-filtros");
const fondoFiltros = document.getElementById("fondo-filtros");

function abrirFiltros() {
  panelFiltros.classList.add("abierto");
  fondoFiltros.hidden = false;
  botonFiltros.setAttribute("aria-expanded", "true");
  document.body.classList.add("sin-scroll");
  document.getElementById("cerrar-filtros").focus();
}

function cerrarFiltros() {
  if (!panelFiltros.classList.contains("abierto")) return;
  panelFiltros.classList.remove("abierto");
  fondoFiltros.hidden = true;
  botonFiltros.setAttribute("aria-expanded", "false");
  document.body.classList.remove("sin-scroll");
  botonFiltros.focus();
}

botonFiltros.addEventListener("click", abrirFiltros);
document.getElementById("cerrar-filtros").addEventListener("click", cerrarFiltros);
document.getElementById("ver-resultados").addEventListener("click", cerrarFiltros);
fondoFiltros.addEventListener("click", cerrarFiltros);
document.addEventListener("keydown", (e) => e.key === "Escape" && cerrarFiltros());

window.addEventListener("popstate", cargar);

api("/categorias")
  .then((lista) => (categorias = lista))
  .catch(() => {})
  .finally(cargar);
