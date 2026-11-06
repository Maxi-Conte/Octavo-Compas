/*
  Crea las tablas que falten.
  Se puede correr las veces que quieras: no borra nada.

  npm run db:init
*/

const fs = require("fs");
const path = require("path");
const { pool } = require("./database");

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

  try {
    await pool.query(schema);
    console.log("✅ Tablas listas.");
  } catch (error) {
    console.error("❌ Error creando las tablas:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

init();
