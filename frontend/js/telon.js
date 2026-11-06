/* =====================================================
   TELÓN DE ENTRADA
   1. Fondo bordó de terciopelo
   2. Un hilo dorado dibuja el isotipo
   3. Se abren las cortinas
   4. Aparece el logo
   5. "Preparando tu próximo gran momento..."
   6. Una línea dorada cierra y se ve la tienda

   - Dura ~4 s y NO espera a que cargue la página (no la frena).
   - Solo anima transform/opacity (y el trazo de un SVG chico).
   - Una vez por visita; se saltea con click o cualquier tecla.
   - Si la persona pidió menos movimiento, no se muestra.
   - Para quitarlo: sacá <script src="/js/telon.js"> del <head>.
===================================================== */

(function () {
  const DURACION_MS = 3950; // tiene que coincidir con la animación de salida en styles.css

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  try {
    if (sessionStorage.getItem("oc-telon-visto")) return;
    sessionStorage.setItem("oc-telon-visto", "1");
  } catch {
    return; /* sin sessionStorage no podemos evitar que se repita: mejor no mostrarlo */
  }

  const telon = document.createElement("div");
  telon.className = "telon";
  telon.setAttribute("role", "presentation");
  telon.innerHTML = `
    <div class="telon-escenario">
      <img class="telon-logo" src="/img/marca/logo-claro.svg" alt="" width="330" height="64">
      <p class="telon-frase">Preparando tu próximo gran momento…</p>
      <span class="telon-linea"></span>
    </div>
    <div class="telon-cortina telon-izq"></div>
    <div class="telon-cortina telon-der"></div>
    <svg class="telon-hilo" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path pathLength="1" d="M50 12 C36 4 14 8 11 26 C9 38 19 44 29 40"/>
      <path pathLength="1" d="M14 52 C28 60 50 56 53 38 C55 26 45 20 35 24"/>
    </svg>
    <button class="telon-saltar" type="button">Saltar</button>`;

  document.documentElement.appendChild(telon);

  let terminado = false;

  function terminar() {
    if (terminado) return;
    terminado = true;
    telon.classList.add("telon-fuera");
    setTimeout(() => telon.remove(), 450);
    window.removeEventListener("keydown", terminar);
  }

  telon.addEventListener("click", terminar);
  window.addEventListener("keydown", terminar);
  setTimeout(terminar, DURACION_MS);
})();
