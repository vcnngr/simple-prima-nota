// middleware/parametri.js
// Identificativi nel percorso (fase UX, blocco U1). Un id che non e' un intero
// positivo a 32 bit non arriva al database: prima diventava un 22P02 di pg e un
// 500 ("abc", "1.5", "99999999999"). Ora e' un 400 della richiesta.
const INTERO = /^[1-9][0-9]{0,9}$/;
const MASSIMO = 2147483647; // INTEGER / SERIAL di PostgreSQL

function idIntero(req, res, next, valore) {
  if (INTERO.test(valore) && Number(valore) <= MASSIMO) return next();
  return res.status(400).json({ error: 'Identificativo non valido' });
}

// Registra il controllo per i parametri indicati su un router.
function idNumerici(router, ...nomi) {
  for (const n of nomi) router.param(n, idIntero);
}

module.exports = { idIntero, idNumerici };
