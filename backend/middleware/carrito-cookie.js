/* =====================================================
   IDENTIFICAR EL CARRITO DEL VISITANTE
   Cada visitante tiene una cookie httpOnly con un UUID.
   Así no hace falta crear cuenta para comprar.
===================================================== */

const crypto = require("crypto");
const config = require("../config");

const COOKIE_CARRITO = "carrito";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function identificarCarrito(req, res, next) {
  let token = req.cookies?.[COOKIE_CARRITO];

  if (!token || !UUID_REGEX.test(token)) {
    token = crypto.randomUUID();

    res.cookie(COOKIE_CARRITO, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.esProduccion,
      maxAge: 1000 * 60 * 60 * 24 * 60, // 60 días
      path: "/"
    });
  }

  req.carritoToken = token;
  next();
}

module.exports = { identificarCarrito };
