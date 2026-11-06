/* =====================================================
   BOTÓN DE ARREPENTIMIENTO
   Por ahora arma un mensaje de WhatsApp o un email con los datos.
   (Más adelante conviene guardarlo en el servidor: ver README.)
===================================================== */

const form = document.getElementById("form-arrepentimiento");

/* Código de identificación de la solicitud: ARR-AAAAMMDD-XXXX */
function generarCodigo() {
  const fecha = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const azar = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(-4).padStart(4, "0");
  return `ARR-${fecha}-${azar}`;
}

function mostrarError(campo, mensaje) {
  const error = document.getElementById(`error-${campo.name}`);
  campo.setAttribute("aria-invalid", mensaje ? "true" : "false");
  if (error) error.textContent = mensaje;
}

function validar() {
  const { nombre, email, pedido } = form;
  let primero = null;

  const revisar = (campo, mensaje) => {
    const ok = campo.checkValidity() && campo.value.trim() !== "";
    mostrarError(campo, ok ? "" : mensaje);
    if (!ok && !primero) primero = campo;
  };

  revisar(nombre, "Escribí tu nombre y apellido.");
  revisar(email, "Escribí un email válido.");
  revisar(pedido, "Escribí el número de pedido.");

  primero?.focus();
  return !primero;
}

function armarMensaje(codigo) {
  const d = Object.fromEntries(new FormData(form));
  return [
    "Hola Octavo Compás, quiero ejercer el derecho de arrepentimiento de mi compra.",
    "",
    `Código de solicitud: ${codigo}`,
    `Nombre: ${d.nombre.trim()}`,
    `Email: ${d.email.trim()}`,
    `Número de pedido: ${d.pedido.trim()}`,
    d.motivo.trim() ? `Motivo: ${d.motivo.trim()}` : ""
  ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n").trim();
}

/* Si todavía no hay email de contacto cargado, solo queda WhatsApp */
const emailNegocio = SITIO.email;
const hayEmail = /^[^\s@\[\]]+@[^\s@\[\]]+\.[^\s@\[\]]+$/.test(emailNegocio);
if (!hayEmail) document.getElementById("enviar-email").hidden = true;

form.addEventListener("input", (e) => {
  if (e.target.getAttribute("aria-invalid") === "true") mostrarError(e.target, "");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validar()) return;

  const codigo = generarCodigo();
  const mensaje = armarMensaje(codigo);

  document.getElementById("codigo-solicitud").textContent = codigo;
  document.getElementById("constancia").hidden = false;

  if (e.submitter?.dataset.canal === "email" && hayEmail) {
    const asunto = `Botón de arrepentimiento - ${codigo}`;
    location.href = `mailto:${emailNegocio}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`;
  } else {
    window.open(await linkWhatsApp(mensaje), "_blank", "noopener");
  }
});
