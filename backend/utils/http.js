/* =====================================================
   AYUDANTES PARA LAS RUTAS
===================================================== */

/*
  Error con código HTTP y mensaje para el usuario.
  throw new ErrorHttp(404, "Producto no encontrado.")
*/
class ErrorHttp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

/*
  Envuelve una ruta async: si tira un error, lo pasa
  al manejador central en vez de colgar la request.
*/
function asyncRuta(funcion) {
  return (req, res, next) => {
    Promise.resolve(funcion(req, res, next)).catch(next);
  };
}

/*
  Manejador central de errores (va al final de server.js).
  - ErrorHttp: se muestra el mensaje al usuario.
  - Cualquier otro: se loguea y se responde un mensaje genérico
    (nunca mostramos detalles internos al navegador).
*/
function manejarErrores(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof ErrorHttp) {
    return res.status(error.status).json({ error: error.message });
  }

  /* JSON mal formado */
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Los datos enviados no son válidos." });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Los datos enviados son demasiado grandes." });
  }

  /* Violación de UNIQUE en PostgreSQL */
  if (error.code === "23505") {
    return res.status(409).json({ error: "Ya existe un registro con esos datos." });
  }

  /* Referencia a algo que no existe (ej: categoría inexistente) */
  if (error.code === "23503") {
    return res.status(400).json({ error: "Alguno de los datos hace referencia a algo que no existe." });
  }

  /* No cumple una regla de la base (ej: stock negativo) */
  if (error.code === "23514") {
    return res.status(400).json({ error: "Alguno de los valores no es válido." });
  }

  console.error(`[${req.method} ${req.originalUrl}]`, error);
  res.status(500).json({ error: "Ocurrió un error inesperado. Probá de nuevo." });
}

module.exports = { ErrorHttp, asyncRuta, manejarErrores };
