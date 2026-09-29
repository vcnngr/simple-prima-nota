// utils/xlsx.js
// Scrittura di file .xlsx (blocco K4) al posto della libreria `xlsx` (SheetJS),
// ferma su npm alla 0.18.5 con vulnerabilita' note e senza correzioni pubblicate
// sul registro. Qui serve solo SCRIVERE: fogli di righe (oggetti chiave/valore)
// come faceva `json_to_sheet`, niente formule, niente lettura di file altrui.
//
//   cartellaXlsx([{ nome: 'Export', righe: [...], larghezze: true }, ...]) -> Buffer
//
// Valori: numeri finiti e booleani come tali; Date come data (formato gg/mm/aaaa,
// ora compresa se c'e'); tutto il resto come testo in linea (mai formule: un testo
// che comincia con "=" resta testo). null/undefined: cella vuota.
// Intestazioni: le chiavi delle righe, nell'ordine in cui compaiono.
const zlib = require('zlib');

// ------------------------------------------------------------------ zip (solo scrittura)
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Archivio semplice: voci deflate, niente data descriptor, campi extra, zip64 o
// commenti (lo stesso sottoinsieme che AllegatiService accetta in ingresso).
function zip(voci) {
  const locali = [], centrali = [];
  let offset = 0;
  const DATA = 0x21, ORA = 0;                          // 1980-01-01 00:00, fissa
  for (const [nome, contenuto] of voci) {
    const n = Buffer.from(nome, 'utf8');
    const dati = Buffer.from(contenuto, 'utf8');
    const compressi = zlib.deflateRawSync(dati);
    const crc = crc32(dati);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6);
    loc.writeUInt16LE(8, 8); loc.writeUInt16LE(ORA, 10); loc.writeUInt16LE(DATA, 12);
    loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(compressi.length, 18); loc.writeUInt32LE(dati.length, 22);
    loc.writeUInt16LE(n.length, 26); loc.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10); cen.writeUInt16LE(ORA, 12); cen.writeUInt16LE(DATA, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(compressi.length, 20); cen.writeUInt32LE(dati.length, 24);
    cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(offset, 42);
    locali.push(loc, n, compressi);
    centrali.push(cen, n);
    offset += 30 + n.length + compressi.length;
  }
  const dir = Buffer.concat(centrali);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(voci.length, 8); eocd.writeUInt16LE(voci.length, 10);
  eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locali, dir, eocd]);
}

// ------------------------------------------------------------------ SpreadsheetML
// Caratteri non ammessi in XML 1.0 (controlli e surrogati spaiati): tolti.
const NON_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const esc = (s) => String(s).replace(NON_XML, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colonna(i) {                                  // 0 -> A, 26 -> AA
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

// Numero seriale di Excel (sistema 1900) dai campi LOCALI della data: il driver pg
// restituisce le colonne DATE come mezzanotte locale.
function seriale(d) {
  const ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return ms / 86400000 + 25569;
}

// Stili: 0 normale, 1 data, 2 data e ora.
const STILI = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/></numFmts>'
  + '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
  + '</styleSheet>';

function cella(rif, v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${rif}"><v>${v}</v></c>` : '';
  if (typeof v === 'boolean') return `<c r="${rif}" t="b"><v>${v ? 1 : 0}</v></c>`;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const conOra = v.getHours() || v.getMinutes() || v.getSeconds();
    return `<c r="${rif}" s="${conOra ? 2 : 1}"><v>${seriale(v)}</v></c>`;
  }
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `<c r="${rif}" t="inlineStr"><is><t xml:space="preserve">${esc(s.slice(0, 32767))}</t></is></c>`;
}

function intestazioni(righe) {
  const h = [];
  const viste = new Set();
  for (const r of righe) for (const k of Object.keys(r || {})) if (!viste.has(k)) { viste.add(k); h.push(k); }
  return h;
}

// Larghezza come nel vecchio export: intestazione o valore piu' lungo (prime
// 100 righe), piu' 2, al massimo 50.
function larghezzeAuto(h, righe) {
  return h.map((k) => {
    let w = k.length || 10;
    for (const r of righe.slice(0, 100)) {
      const v = r ? r[k] : null;
      if (v) w = Math.max(w, String(v).length);
    }
    return Math.min(w + 2, 50);
  });
}

function foglio({ righe = [], larghezze = false }) {
  const h = intestazioni(righe);
  const cols = larghezze && h.length
    ? `<cols>${larghezzeAuto(h, righe).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const xml = [];
  if (h.length) {
    xml.push(`<row r="1">${h.map((k, i) => cella(`${colonna(i)}1`, k)).join('')}</row>`);
    righe.forEach((r, j) => {
      const n = j + 2;
      xml.push(`<row r="${n}">${h.map((k, i) => cella(`${colonna(i)}${n}`, r ? r[k] : null)).join('')}</row>`);
    });
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `${cols}<sheetData>${xml.join('')}</sheetData></worksheet>`;
}

// Nome del foglio: al massimo 31 caratteri, senza []:*?/\ e unico.
function nomiFogli(fogli) {
  const usati = new Set();
  return fogli.map((f, i) => {
    let base = String(f.nome || `Foglio${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').replace(NON_XML, '').trim().slice(0, 31) || `Foglio${i + 1}`;
    let nome = base, k = 2;
    while (usati.has(nome.toLowerCase())) nome = `${base.slice(0, 31 - String(k).length - 1)}_${k++}`;
    usati.add(nome.toLowerCase());
    return nome;
  });
}

function cartellaXlsx(fogli) {
  if (!Array.isArray(fogli) || fogli.length === 0) throw new Error('cartellaXlsx: nessun foglio');
  const nomi = nomiFogli(fogli);
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const voci = [
    ['[Content_Types].xml', XML
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>'],
    ['_rels/.rels', XML
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>'],
    ['xl/workbook.xml', XML
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets>${nomi.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
      + '</workbook>'],
    ['xl/_rels/workbook.xml.rels', XML
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + '</Relationships>'],
    ['xl/styles.xml', STILI],
    ...fogli.map((f, i) => [`xl/worksheets/sheet${i + 1}.xml`, foglio(f)])
  ];
  return zip(voci);
}

module.exports = { cartellaXlsx, crc32 };
