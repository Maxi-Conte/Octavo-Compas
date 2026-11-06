/* =====================================================
   ENVÍO Y DATOS DEL COMPRADOR
===================================================== */

const config = require("../config");
const { texto, email: validarEmail } = require("./validar");
const { ErrorHttp } = require("./http");

function configEnvioPublica() {
  return {
    costo: config.envio.costo,
    gratisDesde: config.envio.gratisDesde,
    retiroHabilitado: Boolean(config.envio.retiroDireccion),
    retiroDireccion: config.envio.retiroDireccion
  };
}

function calcularCostoEnvio(metodoEntrega, subtotal) {
  if (metodoEntrega === "retiro") return 0;

  const { costo, gratisDesde } = config.envio;

  if (gratisDesde > 0 && subtotal >= gratisDesde) return 0;

  return costo;
}

/*
  Valida y limpia los datos del checkout.
  Devuelve los datos o tira ErrorHttp(400).
*/
function validarComprador(body = {}) {
  const metodo = body.metodo_entrega === "retiro" ? "retiro" : "envio";

  const datos = {
    nombre: texto(body.nombre, 150),
    email: validarEmail(body.email),
    telefono: texto(body.telefono, 40),
    dni: texto(body.dni, 20).replace(/[.\s-]/g, ""),
    metodo_entrega: metodo,
    direccion: texto(body.direccion, 255),
    ciudad: texto(body.ciudad, 120),
    provincia: texto(body.provincia, 120),
    codigo_postal: texto(body.codigo_postal, 15).toUpperCase(),
    notas: texto(body.notas, 500)
  };

  const falla = (mensaje) => {
    throw new ErrorHttp(400, mensaje);
  };

  if (datos.nombre.length < 3) falla("Ingresá tu nombre y apellido.");
  if (!datos.email) falla("Ingresá un correo electrónico válido.");

  const digitos = datos.telefono.replace(/\D/g, "");
  if (digitos.length < 8 || digitos.length > 15) {
    falla("Ingresá un teléfono válido, con código de área.");
  }

  if (!/^\d{7,11}$/.test(datos.dni)) falla("Ingresá un DNI o CUIT válido (solo números).");

  if (metodo === "retiro") {
    if (!config.envio.retiroDireccion) falla("El retiro en local no está disponible.");
    datos.direccion = datos.ciudad = datos.provincia = datos.codigo_postal = "";
  } else {
    if (datos.direccion.length < 5) falla("Ingresá la dirección (calle y número).");
    if (datos.ciudad.length < 2) falla("Ingresá la ciudad o localidad.");
    if (datos.provincia.length < 2) falla("Ingresá la provincia.");
    if (!/^[A-Z]?\d{4}[A-Z]{0,3}$/.test(datos.codigo_postal)) falla("Ingresá un código postal válido.");
  }

  return datos;
}

module.exports = { configEnvioPublica, calcularCostoEnvio, validarComprador };
