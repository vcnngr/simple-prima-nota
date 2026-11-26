// services/estratti/pdf.js
// Estratto conto in PDF (blocco U9c): estratti trimestrali e liste movimenti che
// le banche danno solo in PDF (Fineco, Banco BPM, ...). Il PDF non ha colonne:
// lo si porta a testo con pdftotext (poppler) mantenendo l'impaginazione, poi
// si leggono le righe della tabella dei movimenti per posizione.
//
//   leggiPdf(buffer)        -> Promise<{ formato: 'pdf', movimenti, scartate, saldo_iniziale, saldo_finale }>
//   leggiTestoPdf(testo)    -> stesso risultato, dal testo di `pdftotext -layout` (per le prove)
//
// pdftotext gira senza shell, col file da stdin, come l'utente del backend, con
// tetti espliciti (pagine, tempo, output): il file viene da un estraneo.
// Un PDF senza testo (scansione) o protetto da password: errore spiegato.
const { execFile } = require('child_process');
const { ErroreEstratto, leggiData, leggiImporto } = require('./leggi');

const PDFTOTEXT = process.env.PDFTOTEXT_BIN || 'pdftotext';
const MAX_PAGINE = 60;
const MAX_TESTO = 4 * 1024 * 1024;
const TEMPO_MS = 15000;

const errore = msg => new ErroreEstratto(msg);

// ------------------------------------------------------------------ testo
const DATA_IN_TESTA = /^\s*(\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2}))(?:\s+(\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})))?(?=\s|$)/;
// Importi all'italiana: 1.234,56  -1.234,56  1234,56  1.234,56-  (+ EUR o €).
const IMPORTO = /(?<![\d.,\w])([+-]?)(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(-?)(?:\s?(?:EUR|€))?(?![\d,])/g;
const PAROLE = {
  uscite: /\b(uscite|dare|addebiti|addebito)\b/i,
  entrate: /\b(entrate|avere|accrediti|accredito)\b/i,
  importo: /\bimporto\b/i,
  descrizione: /\bdescrizione\b/i,
  causale: /\bcausale\b/i,
  data: /\bdata\b/i
};
const RUMORE = /\bpagina\s+\d+\s+di\s+\d+\b|\bpag\.?\s*\d+\s*(?:di|\/)\s*\d+\b|\bstampat[oa]\s+il\b|\bcreato\s+il\b/i;
const SALDO = /\bsaldo\s+(iniziale|finale|contabile|precedente|al)\b/i;

// Riga d'intestazione della tabella: le colonne degli importi e la descrizione;
// «data» sulla stessa riga o su quelle accanto (Banco BPM la scrive sopra).
function intestazione(riga, accanto = '') {
  if (!PAROLE.data.test(riga) && !PAROLE.data.test(accanto)) return null;
  const pos = {};
  for (const k of ['uscite', 'entrate', 'importo', 'descrizione', 'causale']) {
    const m = PAROLE[k].exec(riga);
    if (m) pos[k] = { da: m.index, a: m.index + m[0].length };
  }
  const importi = (pos.uscite && pos.entrate) || pos.importo;
  if (!importi || !(pos.descrizione || pos.causale)) return null;
  return pos;
}

function importiDi(riga) {
  const out = [];
  for (const m of riga.matchAll(IMPORTO)) {
    const s = `${m[1]}${m[2]},${m[3]}${m[4]}`;
    const c = leggiImporto(s, ',') === null ? null : Math.abs(leggiImporto(s, ','));
    if (c !== null) out.push({ da: m.index, a: m.index + m[0].length, c, segno: m[1] === '-' || m[4] === '-' ? -1 : m[1] === '+' ? 1 : 0 });
  }
  return out;
}

// Da dove comincia la descrizione (la causale fa parte del testo della banca).
const inizioTesto = col => Math.min(col.causale?.da ?? Infinity, col.descrizione?.da ?? Infinity);

function pulisci(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function leggiTestoPdf(testo) {
  const righe = String(testo).replace(/\r/g, '').split(/\n|\f/);
  const movimenti = []; const scartate = [];
  let col = null;          // colonne della tabella in corso (ultima intestazione)
  let aperta = false;      // dentro una tabella dei movimenti
  let ultimo = null;       // movimento a cui attaccare le righe di continuazione
  let saldo_iniziale = null, saldo_finale = null, contabile = null;

  righe.forEach((riga, k) => {
    if (!riga.trim()) return;
    if (RUMORE.test(riga)) { ultimo = null; return; }
    const testa = DATA_IN_TESTA.exec(riga);
    if (!testa) {
      const h = intestazione(riga, righe.slice(Math.max(0, k - 2), k + 3).join(' '));
      if (h) { col = h; aperta = true; ultimo = null; return; }
    }
    if (!aperta) {
      // Prima della tabella conta solo il «saldo contabile» (lista movimenti di
      // Banco BPM: il saldo alla stampa). Un saldo finale della tabella vince.
      const m = /\bsaldo\s+contabile\b[^\d+-]*/i.exec(riga);
      const x = m && importiDi(riga.slice(m.index + m[0].length - 1))[0];
      if (x) contabile = x.segno < 0 ? -x.c : x.c;
      return;
    }
    const limite = inizioTesto(col);

    // Righe di saldo (con o senza data): danno i saldi, non sono movimenti.
    if (SALDO.test(riga)) {
      const imp = importiDi(riga).filter(x => x.da < limite + 2 || !testa);
      const x = imp[0];
      if (x) {
        const v = x.segno < 0 ? -x.c : x.c;
        const tipo = SALDO.exec(riga)[1].toLowerCase();
        if (tipo === 'iniziale' || tipo === 'precedente') saldo_iniziale ??= v;
        else { saldo_finale = v; if (tipo === 'finale') aperta = false; }
      }
      ultimo = null;
      return;
    }

    if (!testa) {
      // Continuazione della descrizione: testo nella colonna della descrizione.
      const rientro = riga.search(/\S/);
      if (ultimo && rientro >= limite - 6 && !importiDi(riga).some(x => x.da < limite - 2)) {
        ultimo.descrizione = pulisci(`${ultimo.descrizione} ${riga}`).slice(0, 1000);
      } else ultimo = null;
      return;
    }

    const data = leggiData(testa[1]);
    const data_valuta = testa[2] ? leggiData(testa[2]) : null;
    const imp = importiDi(riga).filter(x => x.da >= testa[0].length - 1 && x.da < limite + 2);
    if (!data || !imp.length) {
      scartate.push({ riga: k + 1, motivo: !data ? 'data mancante' : 'importo mancante', testo: pulisci(riga).slice(0, 120) });
      ultimo = null;
      return;
    }
    const x = imp[imp.length - 1];
    let entrata;
    if (col.uscite && col.entrate) {
      // Colonne separate: decide la posizione (gli importi sono allineati a destra).
      const confine = (col.uscite.a + col.entrate.a) / 2;
      entrata = x.segno < 0 ? false : x.a > confine;
    } else entrata = x.segno >= 0;
    let descrizione = riga.slice(x.a);
    if (col.causale) descrizione = descrizione.replace(/^\s*(?=[0-9A-Z]{2,4}\s)(?=\S*\d)\S+\s+/, ' ');
    descrizione = pulisci(descrizione).slice(0, 1000) || '(senza descrizione)';
    ultimo = { riga: k + 1, data, data_valuta, descrizione, centesimi: Math.abs(x.c), tipo: entrata ? 'Entrata' : 'Uscita' };
    movimenti.push(ultimo);
  });

  if (!col) throw errore('Nel PDF non trovo la tabella dei movimenti. Scarica dalla banca l\'Excel o il CSV');
  return { formato: 'pdf', movimenti, scartate, saldo_iniziale, saldo_finale: saldo_finale ?? contabile };
}

// ------------------------------------------------------------------ pdftotext
function testoDi(buf) {
  return new Promise((risolvi, rifiuta) => {
    const p = execFile(PDFTOTEXT, ['-layout', '-enc', 'UTF-8', '-q', '-l', String(MAX_PAGINE), '-', '-'],
      { timeout: TEMPO_MS, killSignal: 'SIGKILL', maxBuffer: MAX_TESTO, encoding: 'utf8', env: { PATH: process.env.PATH || '/usr/bin:/bin' } },
      (err, stdout) => {
        if (err) {
          if (err.code === 'ENOENT') return rifiuta(errore('Su questo server non si possono leggere i PDF: scarica dalla banca l\'Excel o il CSV'));
          if (err.killed || err.signal) return rifiuta(errore('Il PDF e\' troppo pesante da leggere: scarica dalla banca l\'Excel o il CSV'));
          if (/maxBuffer/i.test(err.message)) return rifiuta(errore('Il PDF ha troppo testo: carica un periodo piu\' breve'));
          return rifiuta(errore('Non riesco a leggere il PDF (forse e\' protetto da password)'));
        }
        risolvi(stdout);
      });
    p.stdin.on('error', () => {});
    p.stdin.end(buf);
  });
}

async function leggiPdf(buf) {
  if (!Buffer.isBuffer(buf) || buf.subarray(0, 1024).indexOf('%PDF-') < 0) throw errore('Non e\' un PDF');
  const testo = await testoDi(buf);
  if (testo.replace(/\s/g, '').length < 20) throw errore('Il PDF non contiene testo (forse e\' una scansione): scarica dalla banca l\'Excel o il CSV');
  return leggiTestoPdf(testo);
}

module.exports = { leggiPdf, leggiTestoPdf, MAX_PAGINE };
