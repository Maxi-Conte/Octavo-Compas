/* =====================================================
   PÁGINA DE INICIO
   - Hero con 3 looks (bailarina + prendas del look)
   - Novedades
===================================================== */

/*
  LOOKS DEL HERO
  Para cambiar un look:
    - imagen: PNG de la bailarina recortada, sin fondo (ver README).
    - nombre: lo que se lee arriba de las prendas.
    - alt: descripción de la foto para lectores de pantalla.
    - productos: slugs de los productos (los ves en la URL: producto.html?p=ESTE-SLUG).
  Se pueden agregar o quitar looks: el contador se ajusta solo.
*/
const LOOKS = [
  {
    nombre: "Look ballet",
    imagen: "/img/hero/look-1.png",
    alt: "Bailarina de ballet con malla clásica y falda de gasa",
    productos: ["malla-clasica-de-breteles", "falda-de-gasa-con-lazo", "tutu-plato-de-ensayo"]
  },
  {
    nombre: "Look folklore",
    imagen: "/img/hero/look-2.png",
    alt: "Bailarina de folklore con pollera de volados y camisa paisana",
    productos: ["pollera-de-folklore-de-tres-volados", "camisa-paisana-con-puntilla", "chaleco-de-gaucho-bordado"]
  },
  {
    nombre: "Look gala",
    imagen: "/img/hero/look-3.png",
    alt: "Modelo con vestido de gala bordado de la colección Reinas 2026",
    productos: ["vestido-de-gala-bordado-reina", "capa-de-tul-bordada", "vestido-largo-de-saten"]
  }
];

/* ---------- Hero ---------- */

const hero = {
  actual: 0,
  productos: new Map(), // slug -> producto (se pide una sola vez)
  cambiando: false
};

const dosDigitos = (n) => String(n).padStart(2, "0");

async function obtenerProducto(slug) {
  if (!hero.productos.has(slug)) {
    hero.productos.set(
      slug,
      api(`/productos/${encodeURIComponent(slug)}`).catch(() => null)
    );
  }
  return hero.productos.get(slug);
}

function armarFigurasHero() {
  const figura = document.getElementById("hero-figura");

  figura.innerHTML = LOOKS.map(
    (look, i) => `
      <div class="hero-look ${i === 0 ? "activo" : ""}" aria-hidden="${i === 0 ? "false" : "true"}">
        <div class="foto foto-recorte" data-foto="Look ${i + 1} · bailarina recortada (PNG sin fondo)">
          <img src="${esc(look.imagen)}" alt="${esc(look.alt)}"
               ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} width="900" height="1200">
        </div>
      </div>`
  ).join("");
}

function itemPrenda(p) {
  const precio = p.precio_oferta ?? p.precio;
  const imagen = p.imagenes?.[0]?.url;

  return `
    <li>
      <a class="hero-prenda" href="/producto.html?p=${encodeURIComponent(p.slug)}">
        <span class="foto hero-prenda-foto" data-foto="Foto">
          ${imagen ? `<img src="${esc(imagen)}" alt="" loading="lazy" width="160" height="200">` : ""}
        </span>
        <span class="hero-prenda-info">
          <span class="hero-prenda-nombre">${esc(p.nombre)}</span>
          <span class="hero-prenda-precio">${pesos(precio)}</span>
        </span>
      </a>
    </li>`;
}

async function pintarPrendas(indice) {
  const look = LOOKS[indice];
  const lista = document.getElementById("hero-prendas");

  const productos = (await Promise.all(look.productos.map(obtenerProducto))).filter(Boolean);

  /* Si mientras cargaba se pasó a otro look, no pisamos */
  if (indice !== hero.actual) return;

  lista.innerHTML = productos.length
    ? productos.map(itemPrenda).join("")
    : `<li class="hero-prendas-vacio">Pronto vas a ver las prendas de este look.</li>`;
}

async function mostrarLook(indice) {
  if (hero.cambiando || indice === hero.actual) return;
  hero.cambiando = true;

  const total = LOOKS.length;
  hero.actual = (indice + total) % total;

  const prendas = document.querySelector(".hero-prendas");
  prendas.classList.add("saliendo");

  document.querySelectorAll(".hero-look").forEach((el, i) => {
    const activo = i === hero.actual;
    el.classList.toggle("activo", activo);
    el.setAttribute("aria-hidden", String(!activo));
  });

  document.getElementById("hero-contador").textContent =
    `${dosDigitos(hero.actual + 1)} / ${dosDigitos(total)}`;
  document.getElementById("hero-look-nombre").textContent = LOOKS[hero.actual].nombre;

  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
  await new Promise((r) => setTimeout(r, reducido ? 0 : 250));
  await pintarPrendas(hero.actual);

  prendas.classList.remove("saliendo");
  hero.cambiando = false;
}

function iniciarHero() {
  if (!LOOKS.length) return;

  armarFigurasHero();
  document.getElementById("hero-look-nombre").textContent = LOOKS[0].nombre;
  document.getElementById("hero-contador").textContent = `01 / ${dosDigitos(LOOKS.length)}`;
  pintarPrendas(0);

  const anterior = document.getElementById("look-anterior");
  const siguiente = document.getElementById("look-siguiente");

  if (LOOKS.length < 2) {
    anterior.hidden = true;
    siguiente.hidden = true;
    return;
  }

  anterior.addEventListener("click", () => mostrarLook(hero.actual - 1));
  siguiente.addEventListener("click", () => mostrarLook(hero.actual + 1));

  /* Precarga de las prendas del resto de los looks */
  LOOKS.slice(1).forEach((look) => look.productos.forEach(obtenerProducto));
}

/* ---------- Novedades ---------- */

function esqueletos(cantidad) {
  return Array.from({ length: cantidad }, () =>
    `<div aria-hidden="true"><div class="cargando esqueleto-tarjeta"></div></div>`
  ).join("");
}

async function cargarNovedades() {
  const grilla = document.getElementById("novedades");
  grilla.innerHTML = esqueletos(4);

  try {
    const { productos } = await api("/productos?orden=nuevos&por_pagina=4");
    grilla.innerHTML = productos.length
      ? productos.map((p) => tarjetaProducto(p, { etiqueta: "Nuevo" })).join("")
      : `<p class="vacio">Pronto vas a ver productos acá.</p>`;
  } catch (error) {
    grilla.innerHTML = `<p class="vacio">${esc(error.message)}</p>`;
  }
}

async function textoEnvio() {
  const config = await obtenerConfig();
  if (config.envio?.gratisDesde) {
    document.getElementById("texto-envio").textContent = `Gratis desde ${pesos(config.envio.gratisDesde)}`;
  }
}

iniciarHero();
cargarNovedades();
textoEnvio();
