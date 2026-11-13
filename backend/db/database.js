const { Pool } = require("pg");
const config = require("../config");

/*
  Render / Railway / Neon exigen SSL en producción.
  En local no hace falta. Se puede apagar con DATABASE_SSL=false.
*/
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10
});

pool.on("error", (error) => {
  console.error("Error inesperado en el pool de PostgreSQL:", error.message);
});

/*
  Ejecuta varias consultas dentro de una transacción.
  Si algo falla, se deshace todo (ROLLBACK).

  Uso:
    await transaccion(async (cliente) => {
      await cliente.query(...);
      await cliente.query(...);
    });
*/
async function transaccion(funcion) {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    const resultado = await funcion(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = {
  query: (texto, parametros) => pool.query(texto, parametros),
  transaccion,
  pool
};
