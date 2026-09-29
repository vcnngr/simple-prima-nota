// utils/errori.js
// Errori non previsti (blocco K3): al client un messaggio generico scritto da
// noi, nel log solo il contesto e il codice. Mai il messaggio dell'errore:
// quello di pg cita i valori ricevuti (`invalid input syntax for type integer:
// "abc"`), `detail` cita le chiavi (`Key (email)=(...) already exists`), e un
// errore JavaScript puo' portarsi dietro dati della richiesta.
const path = require('path');

const RADICE = path.join(__dirname, '..') + path.sep;

// Dove e' nato l'errore: la prima riga dello stack dentro il backend, come
// percorso relativo, saltando l'helper delle query (tutti gli errori di pg
// passano di li'). Serve a trovare il guasto senza stampare il messaggio.
const HELPER_DB = path.join('config', 'database.js');
function origine(err) {
  if (!err || typeof err.stack !== 'string') return null;
  let ripiego = null;
  for (const riga of err.stack.split('\n').slice(1)) {
    const m = riga.match(/\(?([^()\s]+):(\d+):\d+\)?\s*$/);
    if (!m || !m[1].startsWith(RADICE) || m[1].includes(`${path.sep}node_modules${path.sep}`)) continue;
    const dove = `${m[1].slice(RADICE.length)}:${m[2]}`;
    if (!m[1].endsWith(HELPER_DB)) return dove;
    ripiego = ripiego || dove;
  }
  return ripiego;
}

// Codice dell'errore: SQLSTATE di pg (22P02, 23505...), codice di Node
// (ENOENT...), altrimenti il tipo (TypeError, JsonWebTokenError...).
function descriviErrore(err) {
  if (!err) return 'ERRORE';
  const parti = [String(err.code || err.name || 'ERRORE')];
  if (err.constraint) parti.push(`vincolo ${err.constraint}`); // nome dello schema, non un dato
  const dove = origine(err);
  if (dove) parti.push(dove);
  return parti.join(' ');
}

function logErrore(contesto, err) {
  console.error(`${contesto}: ${descriviErrore(err)}`);
}

// Le funzioni SQL del progetto segnalano i casi previsti con RAISE EXCEPTION
// e un testo italiano scritto da noi (SQLSTATE P0001): quello si puo' mostrare.
// Ogni altro errore del database resta dietro al messaggio generico.
function messaggioApplicativo(err, generico) {
  return err && err.code === 'P0001' && typeof err.message === 'string' ? err.message : generico;
}

// Motivo di una riga non importata (backup): testo nostro per famiglia di
// SQLSTATE, al posto del messaggio del driver.
function motivoRiga(err) {
  const c = (err && err.code) || '';
  if (c === '23505') return 'gia\' presente';
  if (c === '23502') return 'campo obbligatorio mancante';
  if (c === '23503') return 'riferimento non valido';
  if (c === '23514') return 'valore non ammesso';
  if (c.startsWith('22')) return 'dati non validi';
  return 'non importato';
}

module.exports = { logErrore, descriviErrore, messaggioApplicativo, motivoRiga };
