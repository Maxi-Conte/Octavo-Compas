/* =====================================================
   PANTALLA DE CARGA: bailarina dando una vuelta
   Se carga en el <head> SIN defer, para aparecer antes que la página.
   - Se muestra una sola vez por visita (sessionStorage).
   - Se va con un fundido cuando la página terminó de cargar.
   - Para desactivarla: sacá el <script src="/js/carga.js"> del <head>.
===================================================== */

(function () {
  const MINIMO_MS = 1900; // tiempo mínimo, para que se vea una pirueta completa
  const MAXIMO_MS = 5000; // por si alguna foto tarda: nunca bloquea más que esto

  try {
    if (sessionStorage.getItem("oc-carga-vista")) return;
    sessionStorage.setItem("oc-carga-vista", "1");
  } catch {
    /* Sin sessionStorage (modo privado estricto): se muestra igual */
  }

  const inicio = Date.now();

  const pantalla = document.createElement("div");
  pantalla.className = "pantalla-carga";
  pantalla.setAttribute("role", "status");
  pantalla.innerHTML = `
    <div class="carga-escena">
      <canvas class="carga-3d" aria-hidden="true"></canvas>
      <svg class="carga-bailarina" viewBox="0 0 120 200" aria-hidden="true" focusable="false">
        <ellipse class="carga-sombra" cx="60" cy="186" rx="18" ry="3.2"/>
        <g class="carga-giro">
          <!-- brazos en corona -->
          <path class="carga-trazo" d="M53 47 C39 39 40 12 56 9"/>
          <path class="carga-trazo" d="M67 47 C81 39 80 12 64 9"/>
          <!-- cabeza y rodete -->
          <circle class="carga-cuerpo" cx="60" cy="31" r="8"/>
          <circle class="carga-cuerpo" cx="60" cy="21.5" r="4"/>
          <!-- torso -->
          <path class="carga-cuerpo" d="M53 44 Q60 40.5 67 44 L64.5 82 L55.5 82 Z"/>
          <!-- tutú -->
          <path class="carga-tutu" d="M29 86 Q60 74 91 86 Q86 90 80 89 Q75 93 69 90 Q64 94 60 91 Q56 94 51 90 Q45 93 40 89 Q34 90 29 86 Z"/>
          <!-- pierna de apoyo, en punta -->
          <path class="carga-cuerpo" d="M57 90 L64.5 90 L61.5 178 L59.5 178 Z"/>
          <!-- pierna en retiré (pie a la rodilla) -->
          <path class="carga-trazo carga-pierna" d="M57 92 L41 114 L58.5 131"/>
        </g>
      </svg>
    </div>
    <p class="carga-marca">Octavo Compás</p>
    <span class="oculto-visual">Cargando</span>`;

  document.documentElement.classList.add("cargando-sitio");
  document.documentElement.appendChild(pantalla);

  /* Versión 3D (js/bailarina-3d.js). Si no hay WebGL, queda el dibujo SVG. */
  let bailarina3D = null;
  const lienzo = pantalla.querySelector(".carga-3d");
  try {
    if (typeof crearBailarina3D === "function") {
      const quieta = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      bailarina3D = crearBailarina3D(lienzo, { estatica: quieta });
    }
  } catch {
    bailarina3D = null;
  }

  if (bailarina3D) pantalla.classList.add("con-3d");
  else lienzo.remove();

  let terminado = false;

  function cerrar() {
    if (terminado) return;
    terminado = true;
    pantalla.classList.add("saliendo");
    document.documentElement.classList.remove("cargando-sitio");
    setTimeout(() => {
      bailarina3D?.detener();
      pantalla.remove();
    }, 700);
  }

  window.addEventListener("load", () => {
    const falta = Math.max(0, MINIMO_MS - (Date.now() - inicio));
    setTimeout(cerrar, falta);
  });

  setTimeout(cerrar, MAXIMO_MS);
})();
