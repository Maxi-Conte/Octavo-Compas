/* =====================================================
   MODO PRODUCCIÓN
   La tienda no tiene que arrancar mal configurada, y cuando
   arranca tiene que hacerlo con las protecciones puestas.
   Cada caso corre el servidor real en un proceso aparte.
===================================================== */

const entorno = require("./ayuda/entorno");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { spawn } = require("child_process");

const raiz = path.join(__dirname, "..");

before(entorno.prepararBase);
after(entorno.cerrar);

/* Una configuración de producción completa y válida (con datos falsos) */
function configValida(extra = {}) {
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot || "",
    NODE_ENV: "production",
    PORT: "0",
    FRONTEND_URL: "https://tienda.test",
    DATABASE_URL: process.env.DATABASE_URL, // la base de pruebas
    DATABASE_SSL: "false",
    ADMIN_USER: "duenia",
    ADMIN_PASSWORD: "una-clave-larga-y-propia",
    ADMIN_SESSION_SECRET: "s".repeat(64),
    MP_ACCESS_TOKEN: "APP_USR-falso",
    MP_WEBHOOK_SECRET: "secreto-falso",
    RESEND_API_KEY: "re_falsa",
    MAIL_FROM: "Octavo Compás <ventas@tienda.test>",
    MAIL_TIENDA: "ventas@tienda.test",
    NEGOCIO_NOMBRE: "Octavo Compás",
    ENVIO_COSTO: "7000",
    ENVIO_GRATIS_DESDE: "150000",
    RETIRO_DIRECCION: "",
    NEGOCIO_WHATSAPP: "",
    NEGOCIO_INSTAGRAM_URL: "",
    ...extra
  };
}

/* Carga solo la configuración y devuelve cómo terminó */
function validarConfig(env) {
  return new Promise((listo) => {
    const proceso = spawn(process.execPath, ["-e", "require('./backend/config')"], { cwd: raiz, env });
    let salida = "";
    proceso.stdout.on("data", (d) => (salida += d));
    proceso.stderr.on("data", (d) => (salida += d));
    proceso.on("close", (codigo) => listo({ codigo, salida }));
  });
}

test("producción: con todo bien configurado arranca sin errores ni avisos", async () => {
  const { codigo, salida } = await validarConfig(configValida());

  assert.equal(codigo, 0, salida);
  assert.equal(salida.trim(), "");
});

test("producción: no arranca si falta o está mal algo crítico", async () => {
  const casos = {
    "sin token de Mercado Pago": [{ MP_ACCESS_TOKEN: "" }, /MP_ACCESS_TOKEN/],
    "sin clave del webhook": [{ MP_WEBHOOK_SECRET: "" }, /MP_WEBHOOK_SECRET/],
    "sitio sin https": [{ FRONTEND_URL: "http://tienda.test" }, /FRONTEND_URL/],
    "contraseña corta": [{ ADMIN_PASSWORD: "corta" }, /ADMIN_PASSWORD/],
    "contraseña del ejemplo": [{ ADMIN_PASSWORD: "cambiar-esta-password" }, /contraseña de ejemplo/],
    "contraseña igual al usuario": [{ ADMIN_USER: "administradora", ADMIN_PASSWORD: "administradora" }, /contraseña de ejemplo/],
    "secreto de sesión corto": [{ ADMIN_SESSION_SECRET: "corto" }, /ADMIN_SESSION_SECRET/],
    "sin base de datos": [{ DATABASE_URL: "" }, /DATABASE_URL/]
  };

  for (const [caso, [cambio, mensaje]] of Object.entries(casos)) {
    const { codigo, salida } = await validarConfig(configValida(cambio));
    assert.equal(codigo, 1, caso);
    assert.match(salida, mensaje, caso);
  }
});

test("producción: avisa si quedó en modo prueba o sin mails", async () => {
  const { codigo, salida } = await validarConfig(
    configValida({
      MP_ACCESS_TOKEN: "TEST-123",
      RESEND_API_KEY: "",
      MAIL_TIENDA: "",
      MAIL_FROM: "Tienda <ventas@tudominio.com>",
      NEGOCIO_NOMBRE: "TU MARCA"
    })
  );

  assert.equal(codigo, 0, "son avisos: la tienda arranca igual");
  for (const aviso of [/de PRUEBA/, /RESEND_API_KEY/, /MAIL_TIENDA/, /MAIL_FROM/, /NEGOCIO_NOMBRE/]) {
    assert.match(salida, aviso);
  }
});

test("producción: el servidor real arranca, protege las cookies y se apaga prolijo", async () => {
  const proceso = spawn(process.execPath, ["backend/server.js"], {
    cwd: raiz,
    env: configValida({ PORT: "34917" })
  });

  let salida = "";
  proceso.stdout.on("data", (d) => (salida += d));
  proceso.stderr.on("data", (d) => (salida += d));
  const terminado = new Promise((listo) => proceso.on("close", (codigo, senal) => listo({ codigo, senal })));

  try {
    const base = "http://127.0.0.1:34917";

    /* Esperamos a que responda (hasta ~10 segundos) */
    let salud = null;
    for (let i = 0; i < 50 && !salud; i++) {
      await new Promise((r) => setTimeout(r, 200));
      salud = await fetch(`${base}/api/health`).catch(() => null);
    }
    assert.ok(salud, `el servidor no arrancó:\n${salida}`);
    assert.deepEqual(await salud.json(), { ok: true });

    /* Render habla con el servidor por un proxy que avisa que el visitante vino por https */
    const comoRender = { "X-Forwarded-Proto": "https", "Content-Type": "application/json" };

    const inicio = await fetch(`${base}/`, { headers: comoRender });
    assert.equal(inicio.status, 200);
    assert.match(inicio.headers.get("strict-transport-security"), /max-age=\d+/);
    assert.match(inicio.headers.get("content-security-policy"), /upgrade-insecure-requests/);

    const foto = await fetch(`${base}/img/marca/logo.svg`, { headers: comoRender });
    assert.equal(foto.headers.get("cache-control"), "public, max-age=86400");

    const login = await fetch(`${base}/api/admin/login`, {
      method: "POST",
      headers: comoRender,
      body: JSON.stringify({ usuario: "duenia", password: "una-clave-larga-y-propia" })
    });
    assert.equal(login.status, 200);
    const sesion = login.headers.getSetCookie().find((c) => c.startsWith("admin_sesion="));
    assert.match(sesion, /; Secure/i, "la sesión solo viaja por https");
    assert.match(sesion, /HttpOnly/i);
    assert.match(sesion, /SameSite=Strict/i);

    const carrito = await fetch(`${base}/api/carrito`, { headers: comoRender });
    assert.match(carrito.headers.getSetCookie()[0], /; Secure/i);

    /* Sin firma, el webhook no pasa (en producción la firma es obligatoria) */
    const webhook = await fetch(`${base}/api/pagos/webhook?data.id=1&type=payment`, {
      method: "POST",
      headers: comoRender,
      body: JSON.stringify({ type: "payment", data: { id: "1" } })
    });
    assert.equal(webhook.status, 401);
  } finally {
    proceso.kill("SIGTERM");
  }

  const fin = await terminado;
  /* En Windows no existen las señales: kill corta el proceso sin avisarle */
  if (process.platform !== "win32") {
    assert.equal(fin.codigo, 0, `tiene que cerrar solo y sin error:\n${salida}`);
    assert.match(salida, /cerrando el servidor/);
  }
});
