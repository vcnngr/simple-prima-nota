// utils/ricerca.js
// Testo cercato dall'utente dentro un LIKE (fase UX, blocco U1). `%` e `_`
// digitati sono caratteri, non jolly: senza escape "%" trovava tutto e "_" ogni
// carattere. Le query usano `ESCAPE '\'` e lower() su entrambi i lati.
function escapeLike(testo) {
  return String(testo).toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
}
const contiene = (testo) => `%${escapeLike(testo)}%`;
const iniziaCon = (testo) => `${escapeLike(testo)}%`;

module.exports = { escapeLike, contiene, iniziaCon };
