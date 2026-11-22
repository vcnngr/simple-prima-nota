// Prova del lettore degli estratti (U9a): formati inventati come quelli delle
// banche (intestazioni in testa, Entrate/Uscite separate, importi con segno,
// decimali con la virgola o col punto), Excel, camt.053, file ostili.
// Uso: node scripts/smoke/lib/u9a-lettore.js   (esce 1 se un caso fallisce)
const path = require('path');
const zlib = require('zlib');
const L = require(path.join(__dirname, '../../../backend/services/estratti/leggi'));
const { cartellaXlsx } = require(path.join(__dirname, '../../../backend/utils/xlsx'));
let pass = 0, fail = 0;
const eq = (nome, atteso, ottenuto) => {
  const a = JSON.stringify(atteso), o = JSON.stringify(ottenuto);
  if (a === o) { pass++; console.log(`  OK    ${nome}`); } else { fail++; console.log(`  FAIL  ${nome}\n         atteso=${a}\n         ottenuto=${o}`); }
};
const errDi = f => { try { f(); return 'nessun errore'; } catch (e) { return e.estratto ? e.message : 'ECCEZIONE ' + e.message; } };
const breve = ms => ms.map(m => `${m.data}|${m.tipo[0]}|${m.centesimi}|${m.descrizione}`);
const tutto = (buf, nome) => { const t = L.leggiTabella(buf, nome); const h = L.trovaIntestazione(t.righe); return { t, h, r: h && L.applicaMappa(t.righe, h.mappa) }; };

console.log('--- CSV tipo Fineco: titolo in testa, Entrate/Uscite separate');
const fineco = Buffer.from([
  'Conto Corrente: 1234;;;;;', 'Periodo dal 01/10/2026 al 31/10/2026;;;;;', ';;;;;',
  'Data_Operazione;Data_Valuta;Entrate;Uscite;Descrizione;Descrizione_Completa',
  '03/10/2026;03/10/2026;;-45,30;Pagamento POS;POS BAR CENTRALE LECCE',
  '05/10/2026;05/10/2026;1.250,00;;Bonifico;BONIFICO DA ROSSI MARIO FATTURA 12',
  '05/10/2026;05/10/2026;;-1,20;Pagamento POS;CAFFE',
  '05/10/2026;05/10/2026;;-1,20;Pagamento POS;CAFFE',
  ';;;;Saldo finale;1.202,30'
].join('\r\n'), 'latin1');
let x = tutto(fineco, 'fineco.csv');
eq('intestazione alla riga 4 (indice 3)', 3, x.h && x.h.indice);
eq('mappa: Entrate/Uscite, descrizione completa', { data: 0, data_valuta: 1, descrizione: 5, entrate: 2, uscite: 3 }, x.h && (({ intestazione, ...m }) => Object.fromEntries(Object.entries(m).sort()))(x.h.mappa) && Object.fromEntries(Object.entries((({ intestazione, ...m }) => m)(x.h.mappa)).sort((a, b) => a[0].localeCompare(b[0]))));
eq('4 movimenti, saldo scartato', ['2026-10-03|U|4530|POS BAR CENTRALE LECCE', '2026-10-05|E|125000|BONIFICO DA ROSSI MARIO FATTURA 12', '2026-10-05|U|120|CAFFE', '2026-10-05|U|120|CAFFE'], breve(x.r.movimenti));
eq('riga di saldo scartata (data mancante)', ['data mancante'], x.r.scartate.map(s => s.motivo));
const imp = L.impronte(x.r.movimenti);
eq('due caffè identici: impronte diverse', true, imp[2].impronta !== imp[3].impronta);
eq('impronte stabili fra due letture', imp.map(m => m.impronta), L.impronte(tutto(fineco, 'f.csv').r.movimenti).map(m => m.impronta));

console.log('--- CSV tipo Intesa: punto e virgola, un importo col segno, latin1');
const intesa = Buffer.concat([Buffer.from('Data contabile;Data valuta;Descrizione;Importo\n', 'latin1'),
  Buffer.from('31/10/2026;31/10/2026;COMMISSIONI E SPESE;-2,50\n01/11/2026;01/11/2026;ACCREDITO STIPENDIO ', 'latin1'),
  Buffer.from([0xc0]), Buffer.from(' NOVEMBRE;1.834,12\n02/11/2026;02/11/2026;ADDEBITO SDD ENEL ENERGIA;-112,40\n', 'latin1')]);
x = tutto(intesa, 'intesa.csv');
eq('3 movimenti, latin1 letto', ['2026-10-31|U|250|COMMISSIONI E SPESE', '2026-11-01|E|183412|ACCREDITO STIPENDIO À NOVEMBRE', '2026-11-02|U|11240|ADDEBITO SDD ENEL ENERGIA'], breve(x.r.movimenti));

console.log('--- CSV con virgole, decimali col punto, campi tra virgolette');
const uc = Buffer.from('﻿Booking date,Value date,Description,Amount\n"2026-11-03","2026-11-03","PAYMENT, AMAZON EU","-1,234.56"\n"2026-11-04","2026-11-04","REFUND ""X""",25.00\n');
x = tutto(uc, 'uc.csv');
eq('virgole in campo, punto decimale', ['2026-11-03|U|123456|PAYMENT, AMAZON EU', '2026-11-04|E|2500|REFUND "X"'], x.r ? breve(x.r.movimenti) : 'nessuna intestazione');

console.log('--- Excel (.xlsx)');
const xl = cartellaXlsx([{ nome: 'Movimenti', righe: [
  { 'Data': new Date(Date.UTC(2026, 9, 7)), 'Descrizione': 'BONIFICO A FAVORE DI IMMOBILIARE DUOMO', 'Dare': 650, 'Avere': null },
  { 'Data': '08/10/2026', 'Descrizione': 'VERSAMENTO CONTANTI', 'Dare': null, 'Avere': '300,00' }] }]);
x = tutto(xl, 'estratto.xlsx');
eq('xlsx: 2 movimenti, data seriale e testo', ['2026-10-07|U|65000|BONIFICO A FAVORE DI IMMOBILIARE DUOMO', '2026-10-08|E|30000|VERSAMENTO CONTANTI'], x.r ? breve(x.r.movimenti) : 'nessuna intestazione');

console.log('--- camt.053');
const camt = Buffer.from(`<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
<Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
<Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">887.60</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
<Ntry><Amt Ccy="EUR">112.40</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-11-02</Dt></BookgDt><ValDt><Dt>2026-11-02</Dt></ValDt>
<NtryDtls><TxDtls><Amt Ccy="EUR">112.40</Amt><RltdPties><Cdtr><Nm>Enel Energia &amp; C.</Nm></Cdtr></RltdPties><RmtInf><Ustrd>SDD bolletta ottobre</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">5.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>PDNG</Sts><BookgDt><Dt>2026-11-03</Dt></BookgDt></Ntry>
</Stmt></BkToCstmrStmt></Document>`);
const c = L.leggiCamt(camt);
eq('camt: 1 movimento contabilizzato, 1 in attesa scartato', ['2026-11-02|U|11240|SDD bolletta ottobre · Enel Energia & C.'], breve(c.movimenti));
eq('camt: saldi iniziale e finale', [100000, 88760], [c.saldo_iniziale, c.saldo_finale]);
eq('camt con DOCTYPE rifiutato', 'File XML con dichiarazioni non ammesse', errDi(() => L.leggiCamt(Buffer.from('<!DOCTYPE x [<!ENTITY a "b">]><BkToCstmrStmt/>'))));

console.log('--- valori');
eq('date', ['2026-10-03', '2026-10-03', '2026-10-03', '2026-02-01', null, null, '2026-10-03'],
  ['03/10/2026', '3.10.26', '2026-10-03', '01-02-2026', '31/02/2026', 'ieri', '20261003'].map(L.leggiData));
eq('importi virgola', [123456, -123456, -4530, 4530, 100, null, null], ['1.234,56', '-1.234,56', '45,30-', '€ 45,30', '1', 'abc', '1,234'].map(v => L.leggiImporto(v, ',')));
eq('importi punto', [123456, -2500, -2500], ['1,234.56', '(25.00)', '-25'].map(v => L.leggiImporto(v, '.')));

console.log('--- file ostili');
eq('vuoto', "Il file e' vuoto", errDi(() => L.leggiTabella(Buffer.alloc(0))));
eq('.xls vecchio (BIFF)', 'File .xls del vecchio Excel: salvalo come .xlsx o CSV e ricaricalo', errDi(() => L.leggiTabella(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), 'a.xls')));
eq('pagina web con estensione .xls', true, /pagina web/.test(errDi(() => L.leggiTabella(Buffer.from('<html><table></table></html>'), 'lista.xls'))));
eq('oltre 10 MB', 'Il file supera i 10 MB', errDi(() => L.leggiTabella(Buffer.alloc(L.MAX_FILE + 1, 65))));
eq('zip rovinato', 'File Excel non valido', errDi(() => L.leggiTabella(Buffer.from('PK\x03\x04rotto'))));
// Bomba: un foglio che si espande a 64 MB (compresso pochi KB).
const bomba = (() => {
  const dati = zlib.deflateRawSync(Buffer.alloc(64 * 1024 * 1024, 32));
  const nome = Buffer.from('xl/worksheets/sheet1.xml');
  const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(8, 8); loc.writeUInt32LE(dati.length, 18); loc.writeUInt16LE(nome.length, 26);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(dati.length, 20); cen.writeUInt16LE(nome.length, 28); cen.writeUInt32LE(0, 42);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cen.length + nome.length, 12); eocd.writeUInt32LE(loc.length + nome.length + dati.length, 16);
  return Buffer.concat([loc, nome, dati, cen, nome, eocd]);
})();
console.log('--- Excel Fineco (struttura del file vero, dati inventati: scripts/smoke/dati/fineco-finto.xlsx)');
const fx = tutto(require('fs').readFileSync(path.join(__dirname, '../dati/fineco-finto.xlsx')), 'movements.xlsx');
eq('Fineco: intestazione alla riga 13, Entrate/Uscite, Descrizione_Completa, Stato', { data: 0, descrizione: 5, stato: 6, data_valuta: 1, entrate: 2, uscite: 3, intestazione: 12 }, fx.h && fx.h.mappa);
eq('Fineco: celle t="str", date dal seriale, uscite negative', ['2026-10-30|E|150000|Ord: BIANCHI SRL Ben: ROSSI MARIO Dati Pag: Fattura 12',
  '2026-10-25|U|4530|Addebito SDD ENEL ENERGIA SPA bolletta ottobre', '2026-10-05|U|43545|Rata 7 di 48 prestito', '2026-10-02|U|50|Commissione SDD'], breve(fx.r.movimenti));
eq('Fineco: «Autorizzato» non entra', ['non contabilizzata'], fx.r.scartate.map(x => x.motivo));
eq('Fineco: saldo finale scritto sopra la tabella', 101925, L.saldoDichiarato(fx.t.righe, fx.h.mappa.intestazione));
eq('saldo dichiarato: formati', [123456, -50, null], [[['Saldo Finale: 1.234,56 EUR']], [['Saldo contabile: -0,50']], [['Saldo: abc']]].map(r => L.saldoDichiarato(r, 1)));
eq('zip bomb fermata', true, /troppo grande/.test(errDi(() => L.leggiTabella(bomba, 'b.xlsx'))));
eq('testo senza colonne', "Non riesco a leggere le colonne del file", errDi(() => L.leggiTabella(Buffer.from('ciao\nmondo\n'))));
eq('mappa ostile rifiutata', [false, false, true], [{ data: -1, descrizione: 1, importo: 2, intestazione: 0 }, { data: '0', descrizione: 1, importo: 2, intestazione: 0 },
  { data: 0, descrizione: 1, importo: 2, intestazione: 0, decimali: ',' }].map(m => L.mappaValida(m, 4)));
console.log(`PASS ${pass}   FAIL ${fail}`);
process.exit(fail ? 1 : 0);
