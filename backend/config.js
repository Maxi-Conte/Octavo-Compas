/* =====================================================
   CONFIGURACIÓN CENTRAL
   Lee el .env una sola vez y valida lo obligatorio.
   En producción, si falta algo crítico, el servidor
   NO arranca (mejor un error claro que una tienda rota).
===================================================== */

require("dotenv").config();

const esProduccion = process.env.NODE_ENV === "production";

function texto(nombre, porDefecto = "") {
  return String(process.env[nombre] ?? porDefecto).trim();
}

function numero(nombre) {
  const valor = Number(process.env[nombre]);
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

const config = {
  esProduccion,
  puerto: Number(process.env.PORT) || 3000,
  urlSitio: texto("FRONTEND_URL", "http://localhost:3000").replace(/\/+$/, ""),
  databaseUrl: texto("DATABASE_URL"),
  /* SSL hacia la base: activado en producción salvo que DATABASE_SSL=false */
  databaseSsl: esProduccion && texto("DATABASE_SSL").toLowerCase() !== "false",

  admin: {
    usuario: texto("ADMIN_USER"),
    password: String(process.env.ADMIN_PASSWORD ?? ""),
    secreto: texto("ADMIN_SESSION_SECRET")
  },

  mp: {
    accessToken: texto("MP_ACCESS_TOKEN"),
    webhookSecret: texto("MP_WEBHOOK_SECRET")
  },

  envio: {
    costo: numero("ENVIO_COSTO"),
    gratisDesde: numero("ENVIO_GRATIS_DESDE"),
    retiroDireccion: texto("RETIRO_DIRECCION")
  },

  mail: {
    resendApiKey: texto("RESEND_API_KEY"),
    from: texto("MAIL_FROM", "Tienda <onboarding@resend.dev>"),
    tienda: texto("MAIL_TIENDA")
  },

  negocio: {
    nombre: texto("NEGOCIO_NOMBRE", "TU MARCA"),
    whatsapp: texto("NEGOCIO_WHATSAPP"),
    instagram: texto("NEGOCIO_INSTAGRAM_URL")
  }
};

/* ---------- Validaciones ---------- */

const errores = [];

if (!config.databaseUrl) errores.push("DATABASE_URL");
if (!config.admin.usuario) errores.push("ADMIN_USER");
if (!config.admin.password) errores.push("ADMIN_PASSWORD");

if (config.admin.secreto.length < 32) {
  errores.push("ADMIN_SESSION_SECRET (mínimo 32 caracteres)");
}

if (esProduccion) {
  if (!config.mp.accessToken) errores.push("MP_ACCESS_TOKEN");
  if (!config.mp.webhookSecret) errores.push("MP_WEBHOOK_SECRET");
  if (!config.urlSitio.startsWith("https://")) {
    errores.push("FRONTEND_URL (tiene que empezar con https://)");
  }
  if (config.admin.password.length < 12) {
    errores.push("ADMIN_PASSWORD (mínimo 12 caracteres en producción)");
  }
  /* Las contraseñas de ejemplo son públicas: están en el repositorio */
  const EJEMPLOS = ["cambiar-esta-password", "tu_password", config.admin.usuario];
  if (EJEMPLOS.includes(config.admin.password)) {
    errores.push("ADMIN_PASSWORD (es una contraseña de ejemplo: elegí una propia)");
  }
}

if (errores.length > 0) {
  console.error("\n❌ Faltan o son inválidas estas variables del .env:");
  errores.forEach((e) => console.error("   - " + e));
  console.error("\nRevisá el archivo .env.example.\n");
  process.exit(1);
}

if (!config.mp.accessToken) {
  console.warn("⚠️  Falta MP_ACCESS_TOKEN: el checkout no va a funcionar hasta que lo cargues.");
}

if (!config.mp.webhookSecret) {
  console.warn("⚠️  Falta MP_WEBHOOK_SECRET: en desarrollo el webhook no valida la firma.");
}

/* En producción la tienda arranca igual, pero estas cosas la dejan a medias */
if (esProduccion) {
  const avisos = [];

  if (config.mp.accessToken.startsWith("TEST-")) {
    avisos.push("MP_ACCESS_TOKEN es de PRUEBA: los pagos no son reales.");
  }
  if (!config.mail.resendApiKey) {
    avisos.push("Falta RESEND_API_KEY: no se envía NINGÚN mail (ni confirmaciones ni alertas).");
  }
  if (!config.mail.tienda) {
    avisos.push("Falta MAIL_TIENDA: no vas a recibir avisos de ventas ni de pedidos a revisar.");
  }
  if (/resend.dev|tudominio/i.test(config.mail.from)) {
    avisos.push("MAIL_FROM sigue con la dirección de ejemplo: los mails a clientes no van a salir.");
  }
  if (config.negocio.nombre === "TU MARCA") {
    avisos.push("Falta NEGOCIO_NOMBRE: los mails y el resumen de la tarjeta dicen \"TU MARCA\".");
  }

  avisos.forEach((aviso) => console.warn("⚠️  " + aviso));
}

module.exports = config;
