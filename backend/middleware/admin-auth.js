/* =====================================================
   SESIÓN DEL ADMINISTRADOR
   Token firmado con HMAC en una cookie httpOnly:
   el JavaScript del navegador no lo puede leer (protege de XSS)
   y sameSite=strict evita que otro sitio lo use (CSRF).
===================================================== */

const crypto = require("crypto");
const config = require("../config");

const COOKIE_ADMIN = "admin_sesion";
const DURACION_MS = 1000 * 60 * 60 * 8; // 8 horas

function firmar(contenido) {
  return crypto.createHmac("sha256", config.admin.secreto).update(contenido).digest("hex");
}

/* Compara dos textos sin filtrar información por el tiempo de respuesta */
function iguales(a, b) {
  const hashA = crypto.createHash("sha256").update(String(a)).digest();
  const hashB = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function credencialesValidas(usuario, password) {
  /* Se evalúan las dos siempre, para no revelar cuál falló */
  const usuarioOk = iguales(usuario, config.admin.usuario);
  const passwordOk = iguales(password, config.admin.password);
  return usuarioOk && passwordOk;
}

function crearToken() {
  const contenido = `admin:${Date.now() + DURACION_MS}`;
  return `${contenido}:${firmar(contenido)}`;
}

function tokenValido(token) {
  const partes = String(token || "").split(":");
  if (partes.length !== 3) return false;

  const [tipo, vence, firma] = partes;
  if (tipo !== "admin") return false;

  const venceNumero = Number(vence);
  if (!Number.isFinite(venceNumero) || Date.now() > venceNumero) return false;

  return iguales(firma, firmar(`${tipo}:${vence}`));
}

function opcionesCookie() {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: config.esProduccion,
    path: "/"
  };
}

/* Middleware: corta con 401 si no hay sesión válida */
function requiereAdmin(req, res, next) {
  if (!tokenValido(req.cookies?.[COOKIE_ADMIN])) {
    return res.status(401).json({ error: "Tu sesión venció. Volvé a ingresar." });
  }
  next();
}

module.exports = {
  COOKIE_ADMIN,
  DURACION_MS,
  credencialesValidas,
  crearToken,
  tokenValido,
  opcionesCookie,
  requiereAdmin
};
