// services/AllegatiService.js
// Allegati della chat: riconoscimento del tipo, scrittura su disco, lettura,
// pulizia dei file il cui allegato non esiste piu'.
//
// Il contenuto non entra mai nel database. Sul disco il file si chiama con una
// chiave casuale di 32 esadecimali generata qui: il nome scelto da chi carica e'
// solo un'etichetta e non arriva mai al filesystem.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { withTransaction } = require('../config/database');

const cfg = () => ({
  dir: process.env.ALLEGATI_DIR || path.join(__dirname, '..', 'uploads', 'allegati'),
  maxBytes: parseInt(process.env.ALLEGATI_MAX_BYTES || process.env.MAX_FILE_SIZE || String(10 * 1024 * 1024), 10),
  // Spazio massimo per collegamento: senza, la chat diventa un modo di riempire il disco.
  quotaBytes: parseInt(process.env.ALLEGATI_QUOTA_BYTES || String(200 * 1024 * 1024), 10),
  puliziaMs: parseInt(process.env.ALLEGATI_PULIZIA_MS || '60000', 10)
});

const CHIAVE = /^[0-9a-f]{32}$/;

// Tipi ammessi. Il tipo si riconosce dal contenuto; l'estensione deve
// corrispondere. Il tipo dichiarato dal browser non conta.
const TIPI = {
  pdf:  { mime: 'application/pdf', estensioni: ['pdf'] },
  png:  { mime: 'image/png', estensioni: ['png'] },
  jpeg: { mime: 'image/jpeg', estensioni: ['jpg', 'jpeg'] },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', estensioni: ['xlsx'] },
  csv:  { mime: 'text/csv', estensioni: ['csv'] }
};

const ESTENSIONI_AMMESSE = Object.values(TIPI).flatMap(t => t.estensioni);

function iniziaCon(buf, byte) {
  if (buf.length < byte.length) return false;
  for (let i = 0; i < byte.length; i++) if (buf[i] !== byte[i]) return false;
  return true;
}

function testoUtf8(buf) {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch (_) {
    return false;
  }
}

// Nomi delle voci di uno zip, letti dalla directory centrale. null se la
// struttura non torna. Non basta che ogni record dichiarato sia leggibile: un
// record in piu' oltre il conteggio dell'EOCD, o una voce locale che nessun
// record nomina, resterebbero fuori dai controlli pur essendo estraibili. Per
// questo si pretende che il file sia tutto spiegato, byte per byte:
//   [voci locali contigue da 0] [directory centrale di esattamente `dim` byte] [EOCD]
// senza zip64, archivi multi-disco ne' commenti.
function vociZip(buf) {
  const EOCD = 0x06054b50, CEN = 0x02014b50, LOC = 0x04034b50, DESCR = 0x08074b50;
  if (buf.length < 22) return null;
  const fine = buf.length - 22;                        // EOCD senza commento
  if (buf.readUInt32LE(fine) !== EOCD || buf.readUInt16LE(fine + 20) !== 0) return null;
  if (buf.readUInt16LE(fine + 4) !== 0 || buf.readUInt16LE(fine + 6) !== 0) return null; // un solo disco
  const n = buf.readUInt16LE(fine + 10);
  if (n === 0 || buf.readUInt16LE(fine + 8) !== n) return null;
  const dim = buf.readUInt32LE(fine + 12);
  const inizioCen = buf.readUInt32LE(fine + 16);
  if (inizioCen + dim !== fine) return null;           // niente fra directory ed EOCD

  const voci = new Set();
  const locali = [];
  let p = inizioCen;
  for (let k = 0; k < n; k++) {
    if (p + 46 > fine || buf.readUInt32LE(p) !== CEN) return null;
    const flag = buf.readUInt16LE(p + 8);
    const compresso = buf.readUInt32LE(p + 20);
    const lNome = buf.readUInt16LE(p + 28), lExtra = buf.readUInt16LE(p + 30), lComm = buf.readUInt16LE(p + 32);
    const locale = buf.readUInt32LE(p + 42);
    if (compresso === 0xffffffff || locale === 0xffffffff || lComm !== 0) return null; // zip64, commenti
    if (p + 46 + lNome + lExtra > fine) return null;
    const nome = buf.subarray(p + 46, p + 46 + lNome);

    // La voce locale deve esistere, avere lo stesso nome e finire dove dice il record.
    if (locale + 30 > inizioCen || buf.readUInt32LE(locale) !== LOC) return null;
    const lNomeLoc = buf.readUInt16LE(locale + 26), lExtraLoc = buf.readUInt16LE(locale + 28);
    if (lNomeLoc !== lNome || !buf.subarray(locale + 30, locale + 30 + lNome).equals(nome)) return null;
    let fineLoc = locale + 30 + lNomeLoc + lExtraLoc + compresso;
    if (flag & 0x08) {                                   // data descriptor dopo i dati
      fineLoc += fineLoc + 4 <= inizioCen && buf.readUInt32LE(fineLoc) === DESCR ? 16 : 12;
    }
    if (fineLoc > inizioCen) return null;
    locali.push([locale, fineLoc]);

    voci.add(nome.toString('utf8'));
    p += 46 + lNome + lExtra;
  }
  if (p !== fine) return null;                         // i record consumano esattamente `dim`

  // Le voci locali coprono [0, inizioCen) senza buchi ne' sovrapposizioni.
  locali.sort((x, y) => x[0] - y[0]);
  let cursore = 0;
  for (const [da, a] of locali) {
    if (da !== cursore) return null;
    cursore = a;
  }
  if (cursore !== inizioCen) return null;
  return voci;
}

// Voci che un xlsx puo' contenere. Uno zip qualunque con due voci vuote dai
// nomi giusti non e' un foglio di lavoro, e un foglio vero non porta con se'
// file estranei (un eseguibile accanto al workbook) ne' macro (xlsm).
const RADICI_XLSX = ['[Content_Types].xml', '_rels/', 'docProps/', 'xl/', 'customXml/'];

function cartellaDiLavoro(buf, voci) {
  for (const v of voci) {
    if (!RADICI_XLSX.some(r => (r.endsWith('/') ? v.startsWith(r) : v === r))) return false;
    if (v.includes('..') || v.includes('\\') || /vbaProject\.bin$/i.test(v)) return false;
  }
  // Il parser gia' usato dall'import legge solo la struttura del workbook
  // (nomi dei fogli), senza celle ne' formule: se non la trova, non e' un xlsx.
  try {
    const wb = XLSX.read(buf, { type: 'buffer', bookSheets: true, bookVBA: false });
    return Array.isArray(wb.SheetNames) && wb.SheetNames.length > 0;
  } catch (_) {
    return false;
  }
}

// Riconosce il tipo dal contenuto. null = non ammesso.
function riconosci(buf) {
  if (iniziaCon(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';            // %PDF-
  if (iniziaCon(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (iniziaCon(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (iniziaCon(buf, [0x50, 0x4b, 0x03, 0x04])) {
    // Uno zip qualunque non basta, e nemmeno le due stringhe cercate nei byte:
    // si legge la directory centrale e si pretendono le due voci di un xlsx.
    const voci = vociZip(buf);
    if (!voci || !voci.has('xl/workbook.xml') || !voci.has('[Content_Types].xml')) return null;
    return cartellaDiLavoro(buf, voci) ? 'xlsx' : null;
  }
  if (testoUtf8(buf)) {
    // Un file di testo che si apre come pagina web non e' un CSV.
    const inizio = buf.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
    if (inizio.startsWith('<')) return null;
    return 'csv';
  }
  return null;
}

// multer decodifica il nome come latin1: si torna a UTF-8, poi si toglie tutto
// cio' che non e' un'etichetta (separatori di percorso, caratteri di controllo,
// virgolette che romperebbero l'header del download).
function nomePulito(originale) {
  let nome = Buffer.from(String(originale || ''), 'latin1').toString('utf8');
  nome = nome.replace(/[\u0000-\u001f\u007f"\\/<>|:*?]/g, '_').replace(/^\.+/, '').trim();
  if (!nome) nome = 'allegato';
  return nome.slice(0, 200);
}

function estensione(nome) {
  const i = nome.lastIndexOf('.');
  return i < 0 ? '' : nome.slice(i + 1).toLowerCase();
}

/**
 * Verifica un file caricato. Restituisce { tipo, mime, nome } oppure lancia un
 * errore con `status` (415) e un messaggio da mostrare.
 */
function verifica(file) {
  const nome = nomePulito(file.originalname);
  const tipo = riconosci(file.buffer);
  const ext = estensione(nome);
  if (!tipo || !TIPI[tipo].estensioni.includes(ext)) {
    const e = new Error(`Tipo di file non ammesso. Ammessi: ${ESTENSIONI_AMMESSE.join(', ')}`);
    e.status = 415;
    throw e;
  }
  return { tipo, mime: TIPI[tipo].mime, nome };
}

function percorso(chiave) {
  // La chiave arriva dal database, ma si ricontrolla: il percorso non si
  // compone mai con qualcosa che non sia 32 esadecimali.
  if (!CHIAVE.test(chiave)) throw new Error('chiave allegato non valida');
  return path.join(cfg().dir, chiave);
}

// Scrive il contenuto su disco con una chiave nuova. Scrittura su file
// temporaneo e rename: un file a meta' non ha mai il nome definitivo.
async function salva(buffer) {
  const c = cfg();
  await fs.promises.mkdir(c.dir, { recursive: true, mode: 0o700 });
  const chiave = crypto.randomBytes(16).toString('hex');
  const finale = percorso(chiave);
  const tmp = `${finale}.tmp`;
  await fs.promises.writeFile(tmp, buffer, { mode: 0o600, flag: 'wx' });
  await fs.promises.rename(tmp, finale);
  return {
    chiave,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex')
  };
}

async function rimuovi(chiave) {
  try {
    await fs.promises.unlink(percorso(chiave));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function apri(chiave) {
  return fs.createReadStream(percorso(chiave));
}

// Cancella dal disco i file il cui allegato non esiste piu' (trigger della 007).
// La riga si toglie dalla coda solo nella stessa transazione in cui il file e'
// stato rimosso: se il processo cade a meta', la riga torna disponibile e il
// file non resta orfano. SKIP LOCKED: piu' backend non si pestano i piedi.
async function pulisci() {
  return withTransaction(async (client) => {
    const r = await client.query(
      `SELECT chiave FROM allegati_da_rimuovere
       ORDER BY created_at
       LIMIT 100
       FOR UPDATE SKIP LOCKED`
    );
    const rimossi = [];
    for (const { chiave } of r.rows) {
      try {
        await rimuovi(chiave);
        rimossi.push(chiave);
      } catch (err) {
        // Il file resta e la riga pure: ci si riprova al giro successivo.
        console.error(`pulizia allegati: rimozione non riuscita (${err.code || 'ERRORE'})`);
      }
    }
    if (rimossi.length) {
      await client.query(
        'DELETE FROM allegati_da_rimuovere WHERE chiave = ANY($1::varchar[])',
        [rimossi]
      );
    }
    return rimossi.length;
  });
}

let timer = null;
let inCorso = false;

function avvia() {
  if (timer) return;
  const c = cfg();
  timer = setInterval(async () => {
    if (inCorso) return;
    inCorso = true;
    try {
      await pulisci();
    } catch (err) {
      console.error(`pulizia allegati: ${err.code || 'ERRORE'}`);
    } finally {
      inCorso = false;
    }
  }, c.puliziaMs);
  timer.unref();
}

function ferma() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  cfg,
  verifica,
  salva,
  rimuovi,
  apri,
  pulisci,
  avvia,
  ferma,
  ESTENSIONI_AMMESSE
};
