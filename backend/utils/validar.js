/* =====================================================
   VALIDACIONES Y LIMPIEZA DE DATOS
   Todo lo que llega del navegador pasa por acá.
===================================================== */

const { ErrorHttp } = require("./http");

/* Texto recortado y con largo máximo */
function texto(valor, maximo = 255) {
  return String(valor ?? "").trim().slice(0, maximo);
}

/* Texto o null si viene vacío */
function textoONull(valor, maximo = 255) {
  const limpio = texto(valor, maximo);
  return limpio || null;
}

/* Entero positivo (o error 400) */
function idValido(valor, nombre = "id") {
  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero <= 0) {
    throw new ErrorHttp(400, `El ${nombre} no es válido.`);
  }

  return numero;
}

/* Entero >= 0 (stock, orden) */
function enteroNoNegativo(valor, nombre) {
  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero < 0) {
    throw new ErrorHttp(400, `${nombre} tiene que ser un número entero mayor o igual a 0.`);
  }

  return numero;
}

/* Precio > 0 con hasta 2 decimales */
function precio(valor, nombre = "El precio") {
  const numero = Math.round(Number(valor) * 100) / 100;

  if (!Number.isFinite(numero) || numero <= 0) {
    throw new ErrorHttp(400, `${nombre} tiene que ser mayor a 0.`);
  }

  return numero;
}

function precioONull(valor, nombre) {
  if (valor === null || valor === undefined || valor === "") return null;
  return precio(valor, nombre);
}

/* "Remera Oversize Negra" -> "remera-oversize-negra" */
function slugify(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function colorHex(valor) {
  const limpio = texto(valor, 7).toLowerCase();
  return /^#[0-9a-f]{6}$/.test(limpio) ? limpio : "#cccccc";
}

/* Solo aceptamos URLs http(s) o rutas locales: evita "javascript:" y similares */
function urlImagen(valor) {
  const limpio = texto(valor, 1000);

  if (/^https?:\/\//i.test(limpio) || /^\/[\w\-./]+$/.test(limpio)) {
    return limpio;
  }

  throw new ErrorHttp(400, "Hay una URL de imagen inválida (tiene que empezar con https:// o /).");
}

function email(valor) {
  const limpio = texto(valor, 255).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpio) ? limpio : null;
}

module.exports = {
  texto,
  textoONull,
  idValido,
  enteroNoNegativo,
  precio,
  precioONull,
  slugify,
  colorHex,
  urlImagen,
  email
};
