// services/estratti/leggi.js
// Lettura dell'estratto conto della banca (blocco U9a): CSV, Excel (.xlsx) e
// camt.053 (ISO 20022). Nessuna dipendenza esterna: il file e' di un estraneo
// (la banca, via il cliente) e si legge con tetti espliciti.
//
//   leggiTabella(buffer, nomeFile) -> { formato, righe: [[celle testo]] }   (csv, xlsx)
//   leggiCamt(buffer)              -> { formato: 'camt053', movimenti, saldo_iniziale, saldo_finale }
//   trovaIntestazione(righe)       -> { indice, mappa } | null   (mappa proposta)
//   applicaMappa(righe, mappa)     -> { movimenti, scartate }
//   firmaIntestazione(celle)       -> sha256 dell'intestazione normalizzata
//   impronte(movimenti)            -> stesso ordine, con .impronta
//
// Un movimento: { data: 'YYYY-MM-DD', data_valuta, descrizione, centesimi (>0), tipo }.
const crypto = require('crypto');
const zlib = require('zlib');

const MAX_FILE = 10 * 1024 * 1024;       // file caricato
const MAX_ESPANSO = 40 * 1024 * 1024;    // parte del .xlsx una volta decompressa
const MAX_RIGHE = 20000;
const MAX_COLONNE = 60;

class ErroreEstratto extends Error {
  constructor(msg) { super(msg); this.estratto = true; }
}
const errore = msg => new ErroreEstratto(msg);

// ------------------------------------------------------------------ testo
function decodifica(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  if ((buf[0] === 0xff && buf[1] === 0xfe)) return buf.subarray(2).toString('utf16le');
  const s = buf.toString('utf8');
  if (!s.includes('�')) return s;
  // Windows-1252 (molte banche): latin1 + i caratteri 0x80-0x9f che contano qui.
  const W = { 0x80: '€', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—' };
  let out = '';
  for (const b of buf) out += W[b] ?? String.fromCharCode(b);
  return out;
}

// ------------------------------------------------------------------ CSV
function righeCsv(testo, sep) {
  const righe = []; let riga = []; let cella = ''; let tra = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (tra) {
      if (c === '"') { if (testo[i + 1] === '"') { cella += '"'; i++; } else tra = false; }
      else cella += c;
    } else if (c === '"' && cella.trim() === '') { tra = true; cella = ''; }
    else if (c === sep) { riga.push(cella); cella = ''; if (riga.length > MAX_COLONNE) throw errore('Troppe colonne nel file'); }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i++;
      riga.push(cella); righe.push(riga); riga = []; cella = '';
      if (righe.length > MAX_RIGHE) throw errore(`Il file ha piu' di ${MAX_RIGHE} righe`);
    } else cella += c;
  }
  if (cella !== '' || riga.length) { riga.push(cella); righe.push(riga); }
  return righe.map(r => r.map(x => x.trim()));
}
function leggiCsv(buf) {
  const testo = decodifica(buf);
  // Separatore: quello che da' piu' righe con lo stesso numero (>1) di colonne.
  let meglio = null;
  for (const sep of [';', ',', '\t', '|']) {
    let r;
    try { r = righeCsv(testo, sep); } catch (e) { if (e.estratto) continue; throw e; }
    const conta = new Map();
    for (const x of r) if (x.length > 1) conta.set(x.length, (conta.get(x.length) || 0) + 1);
    const punti = Math.max(0, ...conta.values());
    if (!meglio || punti > meglio.punti) meglio = { punti, righe: r };
  }
  if (!meglio || meglio.punti < 2) throw errore('Non riesco a leggere le colonne del file');
  return meglio.righe;
}

// ------------------------------------------------------------------ XLSX
function vociZip(buf) {
  // Directory centrale: si cerca la fine (EOCD) negli ultimi 64 KB.
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) throw errore('File Excel non valido');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  const voci = new Map();
  for (let k = 0; k < n && k < 2000; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw errore('File Excel non valido');
    const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20), lnome = buf.readUInt16LE(p + 28);
    const lextra = buf.readUInt16LE(p + 30), lcomm = buf.readUInt16LE(p + 32), locale = buf.readUInt32LE(p + 42);
    voci.set(buf.toString('utf8', p + 46, p + 46 + lnome), { metodo, comp, locale });
    p += 46 + lnome + lextra + lcomm;
  }
  let usati = 0;
  return nome => {
    const v = voci.get(nome);
    if (!v) return null;
    const l = v.locale;
    if (l + 30 > buf.length || buf.readUInt32LE(l) !== 0x04034b50) throw errore('File Excel non valido');
    const inizio = l + 30 + buf.readUInt16LE(l + 26) + buf.readUInt16LE(l + 28);
    const dati = buf.subarray(inizio, inizio + v.comp);
    let out;
    if (v.metodo === 0) out = dati;
    else if (v.metodo === 8) {
      try { out = zlib.inflateRawSync(dati, { maxOutputLength: MAX_ESPANSO - usati }); }
      catch { throw errore('File Excel troppo grande o rovinato'); }
    } else throw errore('File Excel compresso in un modo non supportato');
    usati += out.length;
    if (usati > MAX_ESPANSO) throw errore('File Excel troppo grande');
    return out.toString('utf8');
  };
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const xmlTesto = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, x) =>
  x[0] === '#' ? String.fromCodePoint(x[1] === 'x' || x[1] === 'X' ? parseInt(x.slice(2), 16) : parseInt(x.slice(1), 10)) : ENT[x.toLowerCase()]);
const testoT = frammento => xmlTesto([...frammento.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''));
function colonnaDa(rif) {
  let n = 0;
  for (const c of rif.replace(/\d+$/, '')) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}
function leggiXlsx(buf) {
  const leggi = vociZip(buf);
  const condivisi = [];
  const ss = leggi('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) condivisi.push(testoT(m[1]));
  // Primo foglio dal workbook (le banche ne hanno uno).
  let percorso = 'xl/worksheets/sheet1.xml';
  const wb = leggi('xl/workbook.xml'), rels = leggi('xl/_rels/workbook.xml.rels');
  const rid = wb && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb);
  if (rid && rels) {
    const t = new RegExp(`<Relationship\\b[^>]*Id="${rid[1]}"[^>]*Target="([^"]+)"`).exec(rels)
      || new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid[1]}"`).exec(rels);
    if (t) percorso = t[1].startsWith('/') ? t[1].slice(1) : `xl/${t[1]}`;
  }
  const foglio = leggi(percorso);
  if (!foglio) throw errore('Nel file Excel non trovo il foglio');
  const righe = [];
  for (const r of foglio.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (righe.length >= MAX_RIGHE) throw errore(`Il file ha piu' di ${MAX_RIGHE} righe`);
    const riga = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const att = c[1], corpo = c[2] || '';
      const rif = /\br="([A-Z]+\d+)"/.exec(att); const tipo = (/\bt="(\w+)"/.exec(att) || [])[1];
      const i = rif ? colonnaDa(rif[1]) : riga.length;
      if (i >= MAX_COLONNE) continue;
      const v = (/<v>([\s\S]*?)<\/v>/.exec(corpo) || [])[1];
      let val = '';
      if (tipo === 's') val = condivisi[Number(v)] ?? '';
      else if (tipo === 'inlineStr') val = testoT(corpo);
      else if (v !== undefined) val = xmlTesto(v);
      riga[i] = val.trim();
    }
    righe.push(Array.from(riga, x => x ?? ''));
  }
  return righe;
}

function leggiTabella(buf, nomeFile = '') {
  if (!Buffer.isBuffer(buf) || !buf.length) throw errore('Il file e\' vuoto');
  if (buf.length > MAX_FILE) throw errore('Il file supera i 10 MB');
  if (buf[0] === 0x50 && buf[1] === 0x4b) return { formato: 'xlsx', righe: leggiXlsx(buf) };
  if (buf[0] === 0xd0 && buf[1] === 0xcf) throw errore('File .xls del vecchio Excel: salvalo come .xlsx o CSV e ricaricalo');
  if (/\.xlsx?$/i.test(nomeFile) && /^\s*<(!doctype\s+)?html/i.test(buf.subarray(0, 200).toString('latin1')))
    throw errore('Questo file e\' una pagina web con estensione .xls: aprilo con Excel e salvalo come .xlsx o CSV');
  return { formato: 'csv', righe: leggiCsv(buf) };
}

// ------------------------------------------------------------------ valori
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const ISO = (a, m, g) => {
  const d = new Date(Date.UTC(a, m - 1, g));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== g || a < 1990 || a > 2100) return null;
  return d.toISOString().slice(0, 10);
};
function leggiData(v) {
  const s = String(v ?? '').trim();
  let m;
  if ((m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})(?:\s.*)?$/.exec(s))) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return ISO(a, Number(m[2]), Number(m[1]));
  }
  if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s))) return ISO(Number(m[1]), Number(m[2]), Number(m[3]));
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return ISO(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/^\d{5}(\.\d+)?$/.test(s)) {                                // seriale di Excel
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return ISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}
// Importo in centesimi con segno. decimali: ',' | '.' (deciso per colonna).
function leggiImporto(v, decimali) {
  let s = String(v ?? '').replace(/[\s €]|EUR/gi, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (/^[+-]/.test(s)) { neg = s[0] === '-'; s = s.slice(1); }
  const migliaia = decimali === ',' ? '.' : ',';
  s = s.split(migliaia).join('');
  if (decimali === ',') s = s.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i, d = ''] = s.split('.');
  const c = Number(i) * 100 + Number((d + '00').slice(0, 2));
  if (!Number.isSafeInteger(c) || c > 99999999999999) return null;
  return neg ? -c : c;
}
// Convenzione dei decimali di una colonna: ',' se qualche valore finisce con
// ,dd o ha punti come migliaia; '.' se finisce con .dd o ha virgole come migliaia.
function decimaliDi(valori) {
  let v = 0, p = 0;
  for (const x of valori) {
    const s = String(x ?? '').replace(/[\s €]|EUR/gi, '');
    if (/,\d{1,2}-?\)?$/.test(s) || /\.\d{3}[.,]/.test(s)) v++;
    else if (/\.\d{1,2}-?\)?$/.test(s) || /,\d{3}[.,]/.test(s)) p++;
  }
  return p > v ? '.' : ',';
}

// ------------------------------------------------------------------ intestazione
const NOMI = {
  data: ['data operazione', 'data contabile', 'data registrazione', 'data', 'date', 'booking date', 'data movimento'],
  data_valuta: ['data valuta', 'valuta', 'value date'],
  descrizione: ['descrizione operazione', 'descrizione completa', 'descrizione', 'causale', 'operazione', 'dettagli', 'description', 'motivo', 'beneficiario'],
  importo: ['importo', 'importo eur', 'amount', 'ammontare'],
  entrate: ['entrate', 'avere', 'accrediti', 'accredito', 'credito', 'credit'],
  uscite: ['uscite', 'dare', 'addebiti', 'addebito', 'debito', 'debit'],
  stato: ['stato', 'stato operazione', 'stato movimento', 'status']
};
// Righe non ancora contabilizzate (Fineco: «Autorizzato» accanto a «Contabilizzato»):
// cambiano o spariscono, non entrano nel Registro.
const NON_CONTABILIZZATE = ['autorizzato', 'autorizzata', 'in lavorazione', 'non contabilizzato', 'non contabilizzata',
  'prenotato', 'prenotata', 'pending', 'in attesa'];
function propostaMappa(celle) {
  const n = celle.map(norm);
  const trova = (chiave, gia) => {
    for (const nome of NOMI[chiave]) {
      const i = n.findIndex((x, k) => !gia.includes(k) && x === nome);
      if (i >= 0) return i;
    }
    for (const nome of NOMI[chiave]) {
      const i = n.findIndex((x, k) => !gia.includes(k) && x.startsWith(nome + ' '));
      if (i >= 0) return i;
    }
    return -1;
  };
  const gia = [];
  const metti = k => { const i = trova(k, gia); if (i >= 0) gia.push(i); return i; };
  const data_valuta = metti('data_valuta');
  const data = metti('data');
  const entrate = metti('entrate'), uscite = metti('uscite');
  const importo = entrate >= 0 && uscite >= 0 ? -1 : metti('importo');
  const descrizione = metti('descrizione');
  const stato = metti('stato');
  const m = { data, descrizione };
  if (stato >= 0) m.stato = stato;
  if (data_valuta >= 0) m.data_valuta = data_valuta;
  if (importo >= 0) m.importo = importo;
  else if (entrate >= 0 && uscite >= 0) { m.entrate = entrate; m.uscite = uscite; }
  return m;
}
const mappaCompleta = m => m && m.data >= 0 && m.descrizione >= 0 && (m.importo >= 0 || (m.entrate >= 0 && m.uscite >= 0));

function trovaIntestazione(righe) {
  for (let i = 0; i < Math.min(righe.length, 40); i++) {
    const celle = righe[i].filter(x => x !== '');
    if (celle.length < 3) continue;
    const mappa = propostaMappa(righe[i]);
    if (mappaCompleta(mappa)) return { indice: i, mappa: { ...mappa, intestazione: i } };
  }
  return null;
}
const firmaIntestazione = celle =>
  crypto.createHash('sha256').update(celle.map(norm).filter(Boolean).join('|')).digest('hex');

// Valida una mappa scritta dal cliente (o letta da un modello): indici interi.
function mappaValida(m, colonne) {
  if (!m || typeof m !== 'object') return false;
  const ok = k => m[k] === undefined || (Number.isInteger(m[k]) && m[k] >= 0 && m[k] < colonne);
  if (!['data', 'data_valuta', 'descrizione', 'importo', 'entrate', 'uscite', 'stato', 'intestazione'].every(ok)) return false;
  if (m.decimali !== undefined && m.decimali !== ',' && m.decimali !== '.') return false;
  if (m.inverti !== undefined && typeof m.inverti !== 'boolean') return false;
  return mappaCompleta(m) && Number.isInteger(m.intestazione);
}

function applicaMappa(righe, m) {
  const corpo = righe.slice(m.intestazione + 1);
  const colImporti = m.importo >= 0 ? [m.importo] : [m.entrate, m.uscite];
  const decimali = m.decimali || decimaliDi(corpo.flatMap(r => colImporti.map(i => r[i])));
  const movimenti = []; const scartate = [];
  corpo.forEach((r, k) => {
    const riga = m.intestazione + 2 + k;               // numero di riga del file (1 = prima)
    if (!r.some(x => x !== '')) return;
    const data = leggiData(r[m.data]);
    let cent;
    if (m.importo >= 0) cent = leggiImporto(r[m.importo], decimali);
    else {
      const e = leggiImporto(r[m.entrate], decimali), u = leggiImporto(r[m.uscite], decimali);
      cent = e ? Math.abs(e) : u ? -Math.abs(u) : null;
    }
    if (cent !== null && m.inverti) cent = -cent;
    if (m.stato >= 0 && NON_CONTABILIZZATE.includes(norm(r[m.stato]))) {
      scartate.push({ riga, motivo: 'non contabilizzata', testo: String(r[m.stato]).slice(0, 40) });
      return;
    }
    const descrizione = String(r[m.descrizione] ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000);
    // Righe di saldo e totali (niente data, o «saldo ...» in descrizione): si saltano.
    if (!data || cent === null || cent === 0) {
      if (r.some(x => x !== '')) scartate.push({ riga, motivo: !data ? 'data mancante' : 'importo mancante', testo: r.filter(Boolean).join(' · ').slice(0, 120) });
      return;
    }
    movimenti.push({
      riga, data, data_valuta: m.data_valuta >= 0 ? leggiData(r[m.data_valuta]) : null,
      descrizione: descrizione || '(senza descrizione)', centesimi: Math.abs(cent), tipo: cent > 0 ? 'Entrata' : 'Uscita'
    });
  });
  return { movimenti, scartate, decimali };
}

// Saldo scritto dalla banca sopra l'intestazione (Fineco: «Saldo Finale: -4.251,43»),
// per il controllo del saldo. null se non c'e' o non si legge.
function saldoDichiarato(righe, intestazione) {
  for (const r of righe.slice(0, Math.max(0, intestazione))) {
    for (const c of r) {
      const m = /^\s*saldo\s+(?:finale|contabile|al\s+[\d/.\-]+)\s*:?\s*([-+]?[\d.,]+\s*(?:€|EUR)?)\s*$/i.exec(String(c));
      if (m) return leggiImporto(m[1], decimaliDi([m[1]]));
    }
  }
  return null;
}

// ------------------------------------------------------------------ camt.053
function leggiCamt(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw errore('Il file e\' vuoto');
  if (buf.length > MAX_FILE) throw errore('Il file supera i 10 MB');
  const x = decodifica(buf);
  if (/<!DOCTYPE|<!ENTITY/i.test(x)) throw errore('File XML con dichiarazioni non ammesse');
  if (!/<(\w+:)?BkToCstmrStmt\b/.test(x)) throw errore('Non e\' un estratto camt.053');
  const tag = (s, nome) => { const m = new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nome}>`).exec(s); return m ? m[1] : null; };
  const tutti = (s, nome) => [...s.matchAll(new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, 'g'))].map(m => m[1]);
  const imp = s => { const a = tag(s, 'Amt'); const c = a === null ? null : leggiImporto(xmlTesto(a), '.'); return c === null ? null : (tag(s, 'CdtDbtInd') || '').trim() === 'DBIT' ? -Math.abs(c) : Math.abs(c); };
  const dataDi = s => { if (!s) return null; const d = tag(s, 'Dt') ?? tag(s, 'DtTm'); return d ? leggiData(d.trim().slice(0, 10)) : null; };
  const stmt = tag(x, 'Stmt') || x;
  let saldo_iniziale = null, saldo_finale = null;
  for (const b of tutti(stmt, 'Bal')) {
    const cd = (tag(b, 'Cd') || '').trim();
    if (cd === 'OPBD' || cd === 'PRCD') saldo_iniziale ??= imp(b);
    if (cd === 'CLBD') saldo_finale = imp(b);
  }
  const movimenti = []; const scartate = [];
  const voci = tutti(stmt, 'Ntry');
  if (voci.length > MAX_RIGHE) throw errore(`Il file ha piu' di ${MAX_RIGHE} righe`);
  voci.forEach((n, k) => {
    const stato = (tag(n, 'Sts') || '').replace(/<[^>]+>/g, '').trim();
    if (stato && stato !== 'BOOK') { scartate.push({ riga: k + 1, motivo: 'non contabilizzata', testo: stato }); return; }
    const cent = imp(n.replace(/<(?:\w+:)?NtryDtls\b[\s\S]*$/, ''));
    const data = dataDi(tag(n, 'BookgDt'));
    const descr = [...tutti(n, 'Ustrd'), tag(n, 'AddtlNtryInf'), tag(tag(n, 'Cdtr') || tag(n, 'Dbtr') || '', 'Nm')]
      .filter(Boolean).map(s => xmlTesto(s).replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!data || !cent) { scartate.push({ riga: k + 1, motivo: !data ? 'data mancante' : 'importo mancante', testo: '' }); return; }
    movimenti.push({ riga: k + 1, data, data_valuta: dataDi(tag(n, 'ValDt')), descrizione: ([...new Set(descr)].join(' · ') || '(senza descrizione)').slice(0, 1000),
      centesimi: Math.abs(cent), tipo: cent > 0 ? 'Entrata' : 'Uscita' });
  });
  return { formato: 'camt053', movimenti, scartate, saldo_iniziale, saldo_finale };
}

// ------------------------------------------------------------------ impronte
// Due righe identiche nello stesso giorno (due caffe' da 1,20) restano due:
// l'ordinale fra le identiche entra nell'impronta.
function impronte(movimenti) {
  const visti = new Map();
  return movimenti.map(m => {
    const base = `${m.data}|${m.tipo === 'Uscita' ? -m.centesimi : m.centesimi}|${norm(m.descrizione)}`;
    const n = (visti.get(base) || 0) + 1; visti.set(base, n);
    return { ...m, impronta: crypto.createHash('sha256').update(`${base}|${n}`).digest('hex') };
  });
}

module.exports = {
  leggiTabella, leggiCamt, trovaIntestazione, applicaMappa, saldoDichiarato, mappaValida, firmaIntestazione, impronte,
  leggiData, leggiImporto, decimaliDi, ErroreEstratto, MAX_FILE
};
