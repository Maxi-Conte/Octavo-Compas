/* =====================================================
   MODO CLARO / OSCURO
   Corre en el <head>, antes de que se dibuje la página,
   para que nunca se vea un destello del otro modo.
   Por defecto: oscuro (la noche de función de la marca).
   Si la persona elige otro, se recuerda en este navegador.
===================================================== */

(function () {
  "use strict";

  var COLORES_BARRA = { oscuro: "#120A0E", claro: "#FBF9F7" };
  var raiz = document.documentElement;

  function leer() {
    try {
      var guardado = localStorage.getItem("tema");
      if (guardado === "claro" || guardado === "oscuro") return guardado;
    } catch (e) {
      /* navegación privada: sin memoria, igual funciona */
    }
    return "oscuro";
  }

  function aplicar(tema) {
    raiz.setAttribute("data-tema", tema);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", COLORES_BARRA[tema]);
  }

  aplicar(leer());

  /* Lo usa el botón del header (js/comun.js) */
  window.temaActual = function () {
    return raiz.getAttribute("data-tema") === "claro" ? "claro" : "oscuro";
  };

  window.cambiarTema = function (origen) {
    var nuevo = window.temaActual() === "oscuro" ? "claro" : "oscuro";
    try {
      localStorage.setItem("tema", nuevo);
    } catch (e) {
      /* sin memoria */
    }

    var reducido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* Con View Transitions: el modo nuevo se abre en círculo desde el botón */
    if (document.startViewTransition && !reducido && origen) {
      var caja = origen.getBoundingClientRect();
      raiz.style.setProperty("--tema-x", caja.left + caja.width / 2 + "px");
      raiz.style.setProperty("--tema-y", caja.top + caja.height / 2 + "px");
      document.startViewTransition(function () {
        aplicar(nuevo);
      });
      return nuevo;
    }

    /* Sin View Transitions: los colores se funden */
    if (!reducido) {
      raiz.classList.add("cambiando-tema");
      setTimeout(function () {
        raiz.classList.remove("cambiando-tema");
      }, 600);
    }
    aplicar(nuevo);
    return nuevo;
  };
})();
