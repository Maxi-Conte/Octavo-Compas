/* =====================================================
   ORDEN DE TALLES
   Para que se muestren XS, S, M, L... y no S, L, M, XS.
===================================================== */

const ORDEN_LETRAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "U", "UNICO"];

function pesoTalle(talle) {
  const valor = String(talle).toUpperCase().trim();
  const indice = ORDEN_LETRAS.indexOf(valor);

  if (indice !== -1) return indice;

  /* Talles numéricos (34, 36, 38...) van después de las letras */
  const numero = parseFloat(valor);
  if (Number.isFinite(numero)) return 100 + numero;

  return 1000;
}

function compararTalles(a, b) {
  return pesoTalle(a) - pesoTalle(b) || String(a).localeCompare(String(b));
}

module.exports = { compararTalles };
