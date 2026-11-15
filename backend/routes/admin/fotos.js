/* =====================================================
   ADMIN - SUBIDA DE FOTOS DE PRODUCTOS
   El navegador achica la foto y la sube directo a Cloudinary
   con una firma que da este servidor (el secreto nunca sale
   de acá). Sin Cloudinary, en desarrollo se guarda en
   frontend/img/subidas para poder probar.

   GET  /api/admin/fotos/destino   a dónde subir y con qué firma
   POST /api/admin/fotos           (solo desarrollo) guarda la foto local
===================================================== */

const express = require("express");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const config = require("../../config");
const { asyncRuta, ErrorHttp } = require("../../utils/http");

const router = express.Router();

const CARPETA_LOCAL = path.join(__dirname, "..", "..", "..", "frontend", "img", "subidas");
const TAMANIO_MAXIMO = 8 * 1024 * 1024; // 8 MB (ya llegan achicadas, suelen pesar 200-500 KB)

function hayCloudinary() {
  const { cloudName, apiKey, apiSecret } = config.fotos;
  return Boolean(cloudName && apiKey && apiSecret);
}

/* Firma de Cloudinary: parámetros ordenados "a=1&b=2" + secreto, en SHA-1 */
function firmarCloudinary(parametros, secreto) {
  const base = Object.keys(parametros)
    .sort()
    .map((clave) => `${clave}=${parametros[clave]}`)
    .join("&");
  return crypto.createHash("sha1").update(base + secreto).digest("hex");
}

router.get(
  "/destino",
  asyncRuta(async (req, res) => {
    if (hayCloudinary()) {
      const { cloudName, apiKey, apiSecret, carpeta } = config.fotos;
      const parametros = {
        folder: carpeta,
        timestamp: Math.floor(Date.now() / 1000)
      };

      return res.json({
        tipo: "cloudinary",
        url: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
        campos: { ...parametros, api_key: apiKey, signature: firmarCloudinary(parametros, apiSecret) }
      });
    }

    /* En producción el disco del servidor se borra en cada deploy: no sirve para fotos */
    if (config.esProduccion) {
      throw new ErrorHttp(503, "Para subir fotos falta configurar Cloudinary (variables CLOUDINARY_* del servidor).");
    }

    res.json({ tipo: "local", url: "/api/admin/fotos" });
  })
);

/* Reconoce el formato por los primeros bytes (no por lo que dice el navegador) */
function formatoDe(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

router.post(
  "/",
  (req, res, next) => {
    if (config.esProduccion || hayCloudinary()) {
      return next(new ErrorHttp(404, "Las fotos se suben a Cloudinary."));
    }
    next();
  },
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: TAMANIO_MAXIMO }),
  asyncRuta(async (req, res) => {
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const formato = formatoDe(buffer);
    if (!formato) {
      throw new ErrorHttp(400, "El archivo no es una foto JPG, PNG o WEBP.");
    }

    const nombre = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${formato}`;
    await fs.mkdir(CARPETA_LOCAL, { recursive: true });
    await fs.writeFile(path.join(CARPETA_LOCAL, nombre), buffer);

    res.status(201).json({ url: `/img/subidas/${nombre}` });
  })
);

module.exports = router;
module.exports.firmarCloudinary = firmarCloudinary;
module.exports.CARPETA_LOCAL = CARPETA_LOCAL;
