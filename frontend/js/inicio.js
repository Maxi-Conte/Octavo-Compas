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

/* ---------- Comprá por disciplina (anillo giratorio) ----------
   Las tarjetas están ubicadas en un círculo visto desde arriba y adelante.
   Al girar, se mueven por ese círculo pero SIEMPRE quedan derechas:
   la profundidad se nota en el tamaño, la altura y una bruma del color del fondo.
   Para que el anillo se vea lleno, hay una segunda vuelta de copias decorativas.
   El giro es lento y con frenado suave (se acerca de a poco al destino). */

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

  /* Copias decorativas (no las recorren el teclado ni los lectores de pantalla) */
  const copias = slides.map((s) => {
    const c = s.cloneNode(true);
    c.classList.add("disc-copia");
    c.setAttribute("aria-hidden", "true");
    c.removeAttribute("aria-label");
    c.removeAttribute("aria-roledescription");
    c.querySelectorAll("a").forEach((a) => (a.tabIndex = -1));
    pista.appendChild(c);
    return c;
  });
  const elementos = [...slides, ...copias];
  const N = elementos.length;

  const SUAVIDAD = reducido ? 1 : 0.055; // cuánto se acerca al destino por cuadro (más bajo = más lento)
  let posicion = 0;  // dónde está el anillo ahora (puede ser decimal)
  let destino = 0;   // hacia dónde va (entero = una tarjeta al frente)
  let animando = false;
  let frenteActual = -1;

  const modulo = (n, m) => ((n % m) + m) % m;
  /* Distancia más corta en el círculo, con signo */
  const camino = (desde, hasta) => {
    let d = modulo(hasta - desde, N);
    if (d > N / 2) d -= N;
    return d;
  };

  function medidas() {
    const ancho = slides[0].offsetWidth;
    const angosto = window.innerWidth < 760;
    return {
      radio: ancho * (angosto ? 0.92 : 1.6),       // qué tan abierto es el círculo
      elevacion: ancho * (angosto ? 0.8 : 0.82),   // cuánto suben las de atrás
      soloFrente: window.innerWidth <= 1100        // en tablet y celular, las vecinas sin texto
    };
  }
  let m = medidas();

  /* Rampa suave entre dos valores (0 antes de a, 1 después de b) */
  const rampa = (v, a, b) => {
    const s = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return s * s * (3 - 2 * s);
  };

  function dibujar() {
    elementos.forEach((el, j) => {
      const angulo = ((j - posicion) / N) * Math.PI * 2; // 0 = adelante, π = atrás
      const x = Math.sin(angulo) * m.radio;
      const profundidad = (Math.cos(angulo) + 1) / 2;    // 1 adelante, 0 atrás
      const escala = 0.5 + 0.5 * profundidad;
      const y = -(1 - profundidad) * m.elevacion;

      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${escala.toFixed(3)})`;
      el.style.zIndex = String(Math.round(profundidad * 100));
      el.style.setProperty("--bruma", (0.8 * Math.pow(1 - profundidad, 1.15)).toFixed(3));
      /* El texto se va con la tarjeta: se desvanece mientras se aleja del frente */
      el.style.setProperty("--detalle", rampa(profundidad, 0.95, 0.995).toFixed(3));
      el.style.setProperty("--texto", (m.soloFrente ? rampa(profundidad, 0.945, 0.99) : rampa(profundidad, 0.78, 0.9)).toFixed(3));
    });
  }

  function marcar({ anunciar = false } = {}) {
    const frente = modulo(Math.round(destino), N);
    const i = frente % total; // disciplina que está adelante
    if (frente === frenteActual) return;
    const cambioDisciplina = frenteActual === -1 || frenteActual % total !== i;
    frenteActual = frente;

    elementos.forEach((el, j) => el.classList.toggle("es-activa", j === frente));
    slides.forEach((s, n) => {
      s.setAttribute("aria-hidden", String(n !== i));
      s.querySelectorAll("a").forEach((a) => (a.tabIndex = n === i ? 0 : -1));
    });
    if (!cambioDisciplina) return;

    tabs.forEach((t, n) => (n === i ? t.setAttribute("aria-current", "true") : t.removeAttribute("aria-current")));
    numero.textContent = dosDigitos(i + 1);
    numero.classList.remove("cambia");
    void numero.offsetWidth;
    numero.classList.add("cambia");
    barra.style.transform = `translateX(${i * 100}%)`;

    if (anunciar) {
      const nombre = slides[i].querySelector(".disc-nombre, .disc-final-titulo").textContent;
      anuncio.textContent = `${nombre}, ${i + 1} de ${total}`;
    }
  }

  function bucle() {
    const diferencia = destino - posicion;
    if (Math.abs(diferencia) < 0.0008) {
      posicion = destino;
      dibujar();
      animando = false;
      return;
    }
    posicion += diferencia * SUAVIDAD;
    dibujar();
    requestAnimationFrame(bucle);
  }

  function animar() {
    if (animando) return;
    animando = true;
    requestAnimationFrame(bucle);
  }

  /* Llevar al frente el elemento j (original o copia) por el camino más corto */
  function irAElemento(j, opciones = {}) {
    const base = Math.round(destino);
    destino = base + camino(modulo(base, N), j);
    marcar(opciones);
    animar();
  }

  /* Llevar al frente la disciplina i: elige la más cercana entre el original y su copia */
  function irADisciplina(i, opciones = {}) {
    const base = modulo(Math.round(destino), N);
    const j = Math.abs(camino(base, i)) <= Math.abs(camino(base, i + total)) ? i : i + total;
    irAElemento(j, opciones);
  }

  function paso(sentido) {
    destino = Math.round(destino) + sentido;
    marcar({ anunciar: true });
    animar();
  }

  anterior.addEventListener("click", () => paso(-1));
  siguiente.addEventListener("click", () => paso(1));
  tabs.forEach((t) => t.addEventListener("click", () => irADisciplina(Number(t.dataset.ir), { anunciar: true })));

  pista.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      paso(e.key === "ArrowRight" ? 1 : -1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      irADisciplina(e.key === "Home" ? 0 : total - 1, { anunciar: true });
    }
  });

  /* Tocar una tarjeta de costado la trae al frente (no abre el link) */
  elementos.forEach((el, j) => {
    el.addEventListener("click", (e) => {
      if (el.classList.contains("es-activa")) return;
      e.preventDefault();
      irAElemento(j, { anunciar: true });
    });
  });

  /* Arrastrar (mouse y dedo): el anillo sigue al gesto y al soltar se acomoda */
  let arrastre = null;
  let huboArrastre = false;

  pista.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    arrastre = { x: e.clientX, y: e.clientY, desde: destino, id: e.pointerId };
    huboArrastre = false;
  });

  window.addEventListener("pointermove", (e) => {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    const dx = e.clientX - arrastre.x;
    const dy = e.clientY - arrastre.y;
    if (!huboArrastre) {
      /* En celular, si el gesto es vertical se deja scrollear la página */
      if (Math.abs(dx) < 6 || Math.abs(dy) > Math.abs(dx)) return;
      huboArrastre = true;
      pista.classList.add("arrastrando");
    }
    destino = arrastre.desde - dx / (slides[0].offsetWidth * 0.9);
    animar();
  });

  const soltar = (e) => {
    if (!arrastre || (e && e.pointerId !== arrastre.id)) return;
    arrastre = null;
    if (!huboArrastre) return;
    pista.classList.remove("arrastrando");
    destino = Math.round(destino);
    marcar({ anunciar: true });
    animar();
  };
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);

  /* Si se arrastró, soltar no abre el link */
  pista.addEventListener("click", (e) => {
    if (!huboArrastre) return;
    e.preventDefault();
    e.stopPropagation();
    huboArrastre = false;
  }, true);

  pista.addEventListener("dragstart", (e) => e.preventDefault());

  window.addEventListener("resize", () => {
    m = medidas();
    dibujar();
  });

  /* Cursor "Arrastrá / Ver / Traer" que sigue al mouse */
  const cursor = carrusel.querySelector(".disc-cursor");
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !reducido) {
    carrusel.classList.add("con-cursor");
    const texto = cursor.querySelector("span");
    let objetivo = null;
    let punto = null;
    let siguiendo = false;

    const mover = () => {
      if (!objetivo) {
        siguiendo = false;
        return;
      }
      punto = punto || { ...objetivo };
      punto.x += (objetivo.x - punto.x) * 0.18;
      punto.y += (objetivo.y - punto.y) * 0.18;
      cursor.style.setProperty("--cx", `${punto.x}px`);
      cursor.style.setProperty("--cy", `${punto.y}px`);
      requestAnimationFrame(mover);
    };

    carrusel.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const caja = carrusel.getBoundingClientRect();
      objetivo = { x: e.clientX - caja.left, y: e.clientY - caja.top };
      const el = e.target.closest(".disc-slide");
      texto.textContent = arrastre ? "Arrastrá"
        : el?.classList.contains("es-activa") ? "Ver"
        : el ? "Traer" : "Arrastrá";
      cursor.classList.toggle("visible", !e.target.closest(".disc-chips, .disc-final-caja a"));
      if (!siguiendo) {
        siguiendo = true;
        requestAnimationFrame(mover);
      }
    });

    carrusel.addEventListener("pointerleave", () => {
      cursor.classList.remove("visible");
      objetivo = null;
      punto = null;
    });
  }

  /* Cantidad real de piezas de cada disciplina (en el original y en su copia) */
  slides.forEach(async (slide, i) => {
    const lugares = [slide, copias[i]].map((s) => s.querySelector("[data-cantidad]")).filter(Boolean);
    if (!lugares.length) return;
    try {
      const { total: cantidad } = await api(
        `/productos?categoria=${encodeURIComponent(slide.dataset.categoria)}&por_pagina=1`
      );
      if (cantidad) lugares.forEach((l) => (l.textContent = `${cantidad} pieza${cantidad === 1 ? "" : "s"}`));
    } catch {
      /* Si falla, simplemente no se muestra */
    }
  });

  dibujar();
  marcar();
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
