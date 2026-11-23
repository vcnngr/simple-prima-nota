// utils/ricerca.js
// Testo cercato dall'utente dentro un LIKE (fase UX, blocco U1). `%` e `_`
// digitati sono caratteri, non jolly: senza escape "%" trovava tutto e "_" ogni
// carattere. Le query usano `ESCAPE '\'` e piega() su entrambi i lati.
//
// U8e: la ricerca non guarda accenti ne' maiuscole («caffe» trova «Caffè»,
// «citta» trova «CITTÀ»). Il database ha collation C, dove lower() abbassa solo
// le lettere ASCII: per questo translate() porta anche le maiuscole accentate
// alla lettera semplice. Gli apostrofi tipografici diventano '. Niente
// estensioni nuove (unaccent) e niente migrazioni.
const GRUPPI = {
  a: 'àáâãäåāăą', e: 'èéêëēėęě', i: 'ìíîïīį', o: 'òóôõöøōő', u: 'ùúûüūůű',
  c: 'çćč', n: 'ñń', y: 'ýÿ', s: 'š', z: 'žź', l: 'ł', "'": '’‘`´'
};
const COPPIE = Object.entries(GRUPPI).flatMap(([semplice, lettere]) =>
  [...lettere, ...(semplice === "'" ? [] : [...lettere.toUpperCase()])].map((c) => [c, semplice]));
const MAPPA = new Map(COPPIE);
// Accenti scritti a parte (lettera + segno combinante, U+0300-U+036F: testo
// incollato da PDF o dal Mac): translate() li toglie, perche' in DA non hanno
// corrispondente in A_ (review t_a3209904, P1).
const SEGNI = Array.from({ length: 0x70 }, (_, k) => String.fromCharCode(0x300 + k)).join('');
const DA = COPPIE.map(([c]) => c).join('') + SEGNI;
const A_ = COPPIE.map(([, x]) => x).join('');

// Lato JavaScript: la stessa piega del database.
function piegaTesto(testo) {
  return [...String(testo).normalize('NFC')].map((c) => MAPPA.get(c) ?? c).join('').toLowerCase().replace(/[\u0300-\u036f]/g, '');
}
// Lato SQL: espressione da confrontare con contiene()/iniziaCon().
const piega = (espr) => `translate(lower(${espr}), '${DA}', '${A_.replace(/'/g, "''")}')`;

function escapeLike(testo) {
  return piegaTesto(testo).replace(/[\\%_]/g, (c) => `\\${c}`);
}
const contiene = (testo) => `%${escapeLike(testo)}%`;
const iniziaCon = (testo) => `${escapeLike(testo)}%`;

module.exports = { escapeLike, contiene, iniziaCon, piega, piegaTesto };
