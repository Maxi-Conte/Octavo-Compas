/* =====================================================
   SERVIDOR PRINCIPAL
   Abre el puerto y se apaga prolijo cuando el hosting lo pide.
===================================================== */

const config = require("./config"); // primero: valida el .env
const db = require("./db/database");
const { crearApp } = require("./app");
const { programarLimpieza } = require("./services/limpieza");

const servidor = crearApp().listen(config.puerto, () => {
  console.log(`🛍️  Tienda corriendo en http://localhost:${config.puerto}`);
  console.log(`🔐 Panel admin en   http://localhost:${config.puerto}/admin.html`);
});

programarLimpieza();

/*
  En cada publicación el hosting manda SIGTERM: dejamos de aceptar
  pedidos nuevos, esperamos a que terminen los que están en curso
  (por ejemplo, un aviso de pago) y cerramos la base.
*/
let apagando = false;

function apagar(senal) {
  if (apagando) return;
  apagando = true;

  console.log(`${senal} recibido: cerrando el servidor...`);

  /* Si algo queda colgado, salimos igual a los 10 segundos */
  setTimeout(() => process.exit(1), 10000).unref();

  servidor.close(() => {
    db.pool
      .end()
      .catch(() => {})
      .finally(() => process.exit(0));
  });

  /* Las conexiones keep-alive sin uso no tienen por qué demorar el cierre */
  servidor.closeIdleConnections?.();
}

process.on("SIGTERM", () => apagar("SIGTERM"));
process.on("SIGINT", () => apagar("SIGINT"));
