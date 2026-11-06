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

/* ---------- Comprá por disciplina (carrusel) ---------- */

function iniciarDisciplinas() {
  const pista = document.getElementById("disc-pista");
  if (!pista) return;

  const carrusel = pista.closest(".disc-carrusel");
  const slides = [...pista.querySelectorAll(".disc-slide")];
  const tabs = [...document.querySelectorAll(".disc-tabs [data-ir]")];
  const anterior = document.getElementById("disc-anterior");
  const siguiente = document.getElementById("disc-siguiente");
  const numero = document.getElementById("disc-actual");
  const barra = document.getElementById("disc-barra");
  const anuncio = document.getElementById("disc-anuncio");
  const total = slides.length;
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let actual = -1;

  const paso = () => (slides[1] ? slides[1].offsetLeft - slides[0].offsetLeft : 1);
  const indiceVisible = () => Math.min(total - 1, Math.max(0, Math.round(pista.scrollLeft / paso())));

  function marcar(i, { anunciar = false } = {}) {
    if (i === actual) return;
    actual = i;

    slides.forEach((s, n) => s.classList.toggle("es-activa", n === i));
    tabs.forEach((t, n) => (n === i ? t.setAttribute("aria-current", "true") : t.removeAttribute("aria-current")));

    numero.textContent = dosDigitos(i + 1);
    numero.classList.remove("cambia");
    void numero.offsetWidth; // reinicia la animación del número
    numero.classList.add("cambia");

    barra.style.transform = `translateX(${i * 100}%)`;
    anterior.disabled = i === 0;
    siguiente.disabled = i === total - 1;

    if (anunciar) {
      const nombre = slides[i].querySelector(".disc-nombre").textContent;
      anuncio.textContent = `${nombre}, ${i + 1} de ${total}`;
    }
  }

  /* Mientras se desplaza solo (flechas, pestañas) no cuenta los intermedios */
  let bloqueoHasta = 0;

  function ir(i, opciones = {}) {
    const destino = Math.min(total - 1, Math.max(0, i));
    bloqueoHasta = performance.now() + 800;
    pista.scrollTo({
      left: slides[destino].offsetLeft - slides[0].offsetLeft,
      behavior: reducido ? "auto" : "smooth"
    });
    marcar(destino, opciones);
  }

  /* Al deslizar: actualizar contador, barra y pestañas */
  let pendiente = false;
  pista.addEventListener(
    "scroll",
    () => {
      if (pendiente || performance.now() < bloqueoHasta) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        marcar(indiceVisible());
      });
    },
    { passive: true }
  );

  pista.addEventListener("scrollend", () => {
    bloqueoHasta = 0;
    marcar(indiceVisible());
  });

  anterior.addEventListener("click", () => ir(actual - 1, { anunciar: true }));
  siguiente.addEventListener("click", () => ir(actual + 1, { anunciar: true }));
  tabs.forEach((t) => t.addEventListener("click", () => ir(Number(t.dataset.ir), { anunciar: true })));

  pista.addEventListener("keydown", (e) => {
    const teclas = { ArrowRight: actual + 1, ArrowLeft: actual - 1, Home: 0, End: total - 1 };
    if (!(e.key in teclas) || e.target !== pista) return;
    e.preventDefault();
    ir(teclas[e.key], { anunciar: true });
  });

  /* Arrastrar con el mouse (en pantallas táctiles desliza el navegador) */
  let arrastre = null;
  let huboArrastre = false;

  pista.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    arrastre = { x: e.clientX, scroll: pista.scrollLeft, inicio: actual };
    huboArrastre = false;
  });

  window.addEventListener("pointermove", (e) => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x;
    if (!huboArrastre && Math.abs(dx) > 5) {
      huboArrastre = true;
      pista.classList.add("arrastrando");
    }
    if (huboArrastre) pista.scrollLeft = arrastre.scroll - dx;
  });

  window.addEventListener("pointerup", () => {
    if (!arrastre) return;
    const desde = arrastre;
    arrastre = null;
    if (!huboArrastre) return;
    pista.classList.remove("arrastrando");
    /* Un arrastre corto alcanza para pasar a la siguiente */
    const recorrido = (pista.scrollLeft - desde.scroll) / paso();
    const destino = Math.abs(recorrido) > 0.15
      ? desde.inicio + Math.sign(recorrido) * Math.max(1, Math.round(Math.abs(recorrido)))
      : desde.inicio;
    ir(destino);
  });

  /* Si se arrastró, el soltar no abre el link */
  pista.addEventListener("click", (e) => {
    if (!huboArrastre) return;
    e.preventDefault();
    e.stopPropagation();
    huboArrastre = false;
  }, true);

  pista.addEventListener("dragstart", (e) => e.preventDefault());

  /* Cursor "Arrastrá / Ver" que sigue al mouse */
  const cursor = carrusel.querySelector(".disc-cursor");
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !reducido) {
    carrusel.classList.add("con-cursor");
    const texto = cursor.querySelector("span");
    let objetivo = null;
    let posicion = null;
    let animando = false;

    const mover = () => {
      if (!objetivo) {
        animando = false;
        return;
      }
      posicion = posicion || { ...objetivo };
      posicion.x += (objetivo.x - posicion.x) * 0.22;
      posicion.y += (objetivo.y - posicion.y) * 0.22;
      cursor.style.setProperty("--cx", `${posicion.x}px`);
      cursor.style.setProperty("--cy", `${posicion.y}px`);
      requestAnimationFrame(mover);
    };

    carrusel.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const caja = carrusel.getBoundingClientRect();
      objetivo = { x: e.clientX - caja.left, y: e.clientY - caja.top };
      texto.textContent = e.target.closest(".disc-tarjeta") && !arrastre ? "Ver" : "Arrastrá";
      cursor.classList.add("visible");
      if (!animando) {
        animando = true;
        requestAnimationFrame(mover);
      }
    });

    carrusel.addEventListener("pointerleave", () => {
      cursor.classList.remove("visible");
      objetivo = null;
      posicion = null;
    });

    /* Sobre los accesos por prenda vuelve la flecha normal */
    carrusel.querySelectorAll(".disc-chips").forEach((c) => {
      c.addEventListener("pointerenter", () => cursor.classList.remove("visible"));
    });
  }

  /* Cantidad real de piezas de cada disciplina */
  slides.forEach(async (slide) => {
    const lugar = slide.querySelector("[data-cantidad]");
    try {
      const { total: cantidad } = await api(
        `/productos?categoria=${encodeURIComponent(slide.dataset.categoria)}&por_pagina=1`
      );
      if (cantidad) lugar.textContent = `${cantidad} pieza${cantidad === 1 ? "" : "s"}`;
    } catch {
      /* Si falla, simplemente no se muestra */
    }
  });

  marcar(0);
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
iniciarDisciplinas();
cargarNovedades();
textoEnvio();
