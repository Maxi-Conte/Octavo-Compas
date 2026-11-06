/* =====================================================
   LOGIN DEL ADMINISTRADOR
   POST /api/admin/login
   GET  /api/admin/sesion
   POST /api/admin/logout
===================================================== */

const express = require("express");
const {
  COOKIE_ADMIN,
  DURACION_MS,
  credencialesValidas,
  crearToken,
  tokenValido,
  opcionesCookie
} = require("../../middleware/admin-auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const usuario = String(req.body?.usuario || "").trim();
  const password = String(req.body?.password || "");

  if (!usuario || !password) {
    return res.status(400).json({ error: "Completá usuario y contraseña." });
  }

  if (!credencialesValidas(usuario, password)) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }

  res.cookie(COOKIE_ADMIN, crearToken(), { ...opcionesCookie(), maxAge: DURACION_MS });
  res.json({ ok: true });
});

router.get("/sesion", (req, res) => {
  res.json({ logueado: tokenValido(req.cookies?.[COOKIE_ADMIN]) });
});

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_ADMIN, opcionesCookie());
  res.json({ ok: true });
});

module.exports = router;
