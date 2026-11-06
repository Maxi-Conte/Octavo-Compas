/* =====================================================
   BOTÓN DE ARREPENTIMIENTO
   Envía la solicitud a POST /api/arrepentimiento, que la guarda,
   genera el código de identificación y manda la constancia por mail.
===================================================== */

const form = document.getElementById("form-arrepentimiento");
const botonEnviar = document.getElementById("enviar-solicitud");
const errorEnvio = document.getElementById("error-envio");

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

async function mostrarConstancia(codigo, datos) {
  document.getElementById("codigo-solicitud").textContent = codigo;
  document.getElementById("email-constancia").textContent = datos.email;

  const link = document.getElementById("whatsapp-constancia");
  link.href = await linkWhatsApp(
    `Hola Octavo Compás, hice una solicitud de arrepentimiento.\nCódigo: ${codigo}\nPedido: ${datos.pedido}`
  );
  link.target = "_blank";
  link.rel = "noopener";

  /* El formulario ya no hace falta: queda solo la constancia */
  form.querySelectorAll(".campo, .form-acciones, .form-ayuda").forEach((el) => (el.hidden = true));
  const constancia = document.getElementById("constancia");
  constancia.hidden = false;
  constancia.focus();
}

form.addEventListener("input", (e) => {
  if (e.target.getAttribute("aria-invalid") === "true") mostrarError(e.target, "");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEnvio.textContent = "";
  if (!validar()) return;

  const datos = Object.fromEntries(new FormData(form));

  botonEnviar.disabled = true;
  botonEnviar.textContent = "Enviando...";

  try {
    const { codigo } = await api("/arrepentimiento", { method: "POST", body: datos });
    await mostrarConstancia(codigo, datos);
  } catch (error) {
    errorEnvio.textContent = error.message;
    botonEnviar.disabled = false;
    botonEnviar.textContent = "Enviar solicitud";
  }
});
