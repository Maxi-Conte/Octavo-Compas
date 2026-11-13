/* =====================================================
   CHECKOUT
   El total que se muestra es orientativo: el servidor lo
   vuelve a calcular con los precios reales antes de cobrar.
===================================================== */

const PROVINCIAS = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes",
  "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones",
  "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe",
  "Santiago del Estero", "Tierra del Fuego", "Tucumán"
];

const form = document.getElementById("form-checkout");
let carrito = null;

function metodoEntrega() {
  return form.metodo_entrega.value;
}

function costoEnvio() {
  if (!carrito || metodoEntrega() === "retiro") return 0;
  const { costo, gratisDesde } = carrito.envio;
  return gratisDesde > 0 && carrito.subtotal >= gratisDesde ? 0 : costo;
}

function pintarResumen() {
  const validos = carrito.items.filter((i) => i.disponible);
  const envio = costoEnvio();

  document.getElementById("resumen-items").innerHTML = validos
    .map(
      (i) => `
      <div class="item-carrito">
        ${i.imagen ? `<img src="${esc(i.imagen)}" alt="">` : "<span></span>"}
        <div>
          <span class="item-nombre">${esc(i.nombre)}</span>
          <p class="item-detalle">${esc(i.color)} · Talle ${esc(i.talle)} · x${i.cantidad}</p>
        </div>
        <strong>${pesos(i.precio * i.cantidad)}</strong>
      </div>`
    )
    .join("");

  document.getElementById("resumen-subtotal").textContent = pesos(carrito.subtotal);
  document.getElementById("resumen-envio").textContent = envio === 0 ? "Gratis" : pesos(envio);
  document.getElementById("resumen-total").textContent = pesos(carrito.subtotal + envio);
  document.getElementById("precio-envio").textContent =
    carrito.envio.gratisDesde > 0 && carrito.subtotal >= carrito.envio.gratisDesde ? "Gratis" : pesos(carrito.envio.costo);

  document.getElementById("campos-envio").hidden = metodoEntrega() === "retiro";
}

/*
  Validación rápida en el navegador (el servidor valida igual).
  Devuelve [campo, mensaje] del primer dato que falta, o null.
*/
function validar(datos) {
  if (datos.nombre.trim().length < 3) return ["nombre", "Ingresá tu nombre y apellido."];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(datos.email.trim())) return ["email", "Ingresá un email válido."];
  if (datos.telefono.replace(/\D/g, "").length < 8) return ["telefono", "Ingresá un teléfono con código de área."];
  if (!/^\d{7,11}$/.test(datos.dni.replace(/[.\s-]/g, ""))) return ["dni", "Ingresá un DNI o CUIT válido (solo números)."];

  if (datos.metodo_entrega === "envio") {
    if (datos.direccion.trim().length < 5) return ["direccion", "Ingresá la calle y el número."];
    if (datos.ciudad.trim().length < 2) return ["ciudad", "Ingresá la ciudad."];
    if (!datos.provincia) return ["provincia", "Elegí la provincia."];
    if (!/^[A-Za-z]?\d{4}[A-Za-z]{0,3}$/.test(datos.codigo_postal.trim())) {
      return ["codigo_postal", "Ingresá un código postal válido (por ejemplo 5500)."];
    }
  }

  return null;
}

/* El mensaje va debajo del campo que falló, y el cursor queda ahí */
function limpiarErrorDeCampo() {
  document.getElementById("error-campo")?.remove();
  form.querySelectorAll("[aria-invalid]").forEach((el) => {
    el.removeAttribute("aria-invalid");
    el.removeAttribute("aria-describedby");
  });
}

function mostrarErrorDeCampo(campo, mensaje) {
  limpiarErrorDeCampo();

  const control = form.elements[campo];
  const aviso = document.createElement("span");
  aviso.id = "error-campo";
  aviso.className = "texto-error";
  aviso.textContent = mensaje;

  control.closest(".campo").append(aviso);
  control.setAttribute("aria-invalid", "true");
  control.setAttribute("aria-describedby", "error-campo");
  control.focus();
}

/* Apenas la persona corrige el dato, el aviso se va */
form.addEventListener("input", (e) => {
  if (e.target.getAttribute("aria-invalid")) limpiarErrorDeCampo();
});

form.addEventListener("change", (e) => {
  if (e.target.name === "metodo_entrega") pintarResumen();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const datos = Object.fromEntries(new FormData(form));
  const errorCaja = document.getElementById("error-checkout");
  const boton = document.getElementById("boton-pagar");

  errorCaja.textContent = "";

  const error = validar(datos);
  if (error) {
    mostrarErrorDeCampo(...error);
    return;
  }

  limpiarErrorDeCampo();
  boton.disabled = true;
  boton.textContent = "Conectando con Mercado Pago...";

  try {
    const respuesta = await api("/checkout", { method: "POST", body: datos });
    location.href = respuesta.url_pago;
  } catch (err) {
    errorCaja.textContent = err.message;
    boton.disabled = false;
    boton.textContent = "Ir a pagar con Mercado Pago";
  }
});

(async () => {
  form.provincia.innerHTML += PROVINCIAS.map((p) => `<option>${p}</option>`).join("");

  try {
    carrito = await api("/carrito");
  } catch (error) {
    document.getElementById("error-checkout").textContent = error.message;
    return;
  }

  if (!carrito.items.some((i) => i.disponible)) {
    location.href = "/tienda.html";
    return;
  }

  if (carrito.envio.retiroHabilitado) {
    document.getElementById("opcion-retiro").hidden = false;
    document.getElementById("direccion-retiro").textContent = `(${carrito.envio.retiroDireccion})`;
  }

  pintarResumen();
})();
