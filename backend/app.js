/* =====================================================
   LA APLICACIÓN (sin abrir el puerto)
   server.js la pone a escuchar; los tests la usan directo.
===================================================== */

const config = require("./config"); // primero: valida el .env
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const db = require("./db/database");
const { manejarErrores } = require("./utils/http");
const { configEnvioPublica } = require("./utils/envio");
const { requiereAdmin } = require("./middleware/admin-auth");

const carpetaFront = path.join(__dirname, "..", "frontend");

/* Páginas que no tienen que aparecer en Google */
const SIN_INDEXAR = ["admin.html", "checkout.html", "pago.html"];

function limite(ventanaMin, maximo, opciones = {}) {
  return rateLimit({
    windowMs: ventanaMin * 60 * 1000,
    limit: maximo,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Esperá unos minutos y volvé a probar." },
    ...opciones
  });
}

function crearApp() {
  const app = express();

  /* Render / Railway ponen un proxy adelante: necesario para saber la IP real */
  if (config.esProduccion) app.set("trust proxy", 1);

  app.disable("x-powered-by");

  /* ---------- Cabeceras de seguridad ----------
     La CSP solo permite cargar scripts propios: si alguien
     lograra inyectar un <script>, el navegador no lo ejecuta. */
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.esProduccion ? [] : null
        }
      }
    })
  );

  /* Solo aceptamos JSON (limitado a 200 KB) */
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());

  /* ---------- Límites de intentos ---------- */

  app.use("/api/admin/login", limite(15, 10, { skipSuccessfulRequests: true }));
  app.use("/api/checkout", limite(15, 20));
  app.use("/api/arrepentimiento", limite(60, 5));
  app.use("/api", limite(1, 300));

  /* Las respuestas de la API nunca se guardan en caché (carrito, pedidos, panel) */
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  /* ---------- API pública ---------- */

  app.get("/api/config", (req, res) => {
    res.json({
      negocio: config.negocio,
      envio: configEnvioPublica(),
      pagosActivos: Boolean(config.mp.accessToken)
    });
  });

  /* Para el monitor de uptime: verifica servidor + base de datos */
  app.get("/api/health", async (req, res) => {
    try {
      await db.query("SELECT 1");
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use("/api", require("./routes/catalogo"));
  app.use("/api/carrito", require("./routes/carrito").router);
  app.use("/api", require("./routes/pagos"));
  app.use("/api", require("./routes/arrepentimiento"));

  /* ---------- API de administración ---------- */

  app.use("/api/admin", require("./routes/admin/sesion"));
  app.use("/api/admin", requiereAdmin, require("./routes/admin/catalogo"));
  app.use("/api/admin/pedidos", requiereAdmin, require("./routes/admin/pedidos"));
  app.use("/api/admin/arrepentimientos", requiereAdmin, require("./routes/admin/arrepentimientos"));

  /* Ruta de API inexistente */
  app.use("/api", (req, res) => res.status(404).json({ error: "Ruta no encontrada." }));

  /* ---------- Buscadores ---------- */

  app.use(require("./routes/seo"));

  /* ---------- Frontend ---------- */

  app.use(
    express.static(carpetaFront, {
      extensions: ["html"],
      setHeaders(res, archivo) {
        const nombre = path.basename(archivo);

        if (SIN_INDEXAR.includes(nombre)) res.setHeader("X-Robots-Tag", "noindex, nofollow");

        /*
          HTML, CSS y JS: el navegador siempre pregunta si cambiaron
          (así un arreglo se ve apenas se publica). Las imágenes sí se
          guardan un día en producción.
        */
        if (config.esProduccion && /\.(jpe?g|png|webp|avif|svg|gif|ico|woff2?)$/i.test(nombre)) {
          res.setHeader("Cache-Control", "public, max-age=86400");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      }
    })
  );

  app.use((req, res) => {
    res.status(404).sendFile(path.join(carpetaFront, "404.html"));
  });

  app.use(manejarErrores);

  return app;
}

module.exports = { crearApp };
