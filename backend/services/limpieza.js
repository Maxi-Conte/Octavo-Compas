/* =====================================================
   LIMPIEZA AUTOMÁTICA
   Cada intento de compra deja un pedido "pendiente" y cada
   visita con productos deja un carrito. Los que quedaron
   abandonados se borran solos para que la base no crezca
   sin sentido.

   Nunca se borra un pedido pagado, cancelado, marcado para
   revisión o con una solicitud de arrepentimiento.
===================================================== */

const db = require("../db/database");

/* Un pedido sin pagar durante este tiempo se considera abandonado */
const DIAS_PEDIDO_SIN_PAGAR = 30;

/* La cookie del carrito dura 60 días: pasado eso, nadie puede volver a verlo */
const DIAS_CARRITO = 60;

const CADA_HORAS = 12;

async function limpiarAbandonados() {
  const pedidos = await db.query(
    `DELETE FROM ordenes o
     WHERE o.estado IN ('pendiente', 'rechazado')
       AND NOT o.requiere_revision
       AND o.actualizado_en < NOW() - make_interval(days => $1)
       AND NOT EXISTS (SELECT 1 FROM arrepentimientos a WHERE a.orden_id = o.id)`,
    [DIAS_PEDIDO_SIN_PAGAR]
  );

  const carritos = await db.query(
    "DELETE FROM carritos WHERE actualizado_en < NOW() - make_interval(days => $1)",
    [DIAS_CARRITO]
  );

  return { pedidos: pedidos.rowCount, carritos: carritos.rowCount };
}

/* Corre al rato de arrancar y después dos veces por día */
function programarLimpieza() {
  const correr = () =>
    limpiarAbandonados()
      .then(({ pedidos, carritos }) => {
        if (pedidos || carritos) {
          console.log(`Limpieza: ${pedidos} pedidos sin pagar y ${carritos} carritos abandonados borrados.`);
        }
      })
      .catch((error) => console.error("No se pudo hacer la limpieza:", error.message));

  /* unref: estos relojes no impiden que el servidor se apague */
  setTimeout(correr, 60 * 1000).unref();
  setInterval(correr, CADA_HORAS * 60 * 60 * 1000).unref();
}

module.exports = { limpiarAbandonados, programarLimpieza, DIAS_PEDIDO_SIN_PAGAR, DIAS_CARRITO };
