// Prova del lettore dei PDF (U9c), sui PDF inventati di u9c-pdf-dati.js.
// Uso: node scripts/smoke/lib/u9c-lettore.js <cartella con fineco.pdf, bpm.pdf, scansione.pdf>
const path = require('path');
const fs = require('fs');
const P = require(path.join(__dirname, '../../../backend/services/estratti/pdf'));
const dir = process.argv[2];
let pass = 0, fail = 0;
const eq = (nome, atteso, ottenuto) => {
  const a = JSON.stringify(atteso), o = JSON.stringify(ottenuto);
  if (a === o) { pass++; console.log(`  OK    ${nome}`); } else { fail++; console.log(`  FAIL  ${nome}\n         atteso=${a}\n         ottenuto=${o}`); }
};
const breve = ms => ms.map(m => `${m.data}|${m.tipo[0]}|${m.centesimi}|${m.descrizione}`);
const err = async f => { try { await f(); return 'nessun errore'; } catch (e) { return e.estratto ? e.message : 'ECCEZIONE ' + e.message; } };
const leggi = n => P.leggiPdf(fs.readFileSync(path.join(dir, n)));

(async () => {
  console.log('--- Fineco, estratto trimestrale (USCITE/ENTRATE, date gg.mm.aa, due pagine)');
  const f = await leggi('fineco.pdf');
  eq('5 movimenti, descrizioni su due righe unite (anche se la riga dopo comincia con una data o rientra), importo nella descrizione ignorato', [
    '2026-01-02|U|4530|Addebito SDD Enel Energia bolletta dicembre',
    '2026-01-10|E|150000|Bonifico da Bianchi srl 05/01/2026 Fattura 12',
    '2026-01-15|U|120|Pagamento POS bar Centrale', '2026-01-15|U|120|Pagamento POS bar Centrale',
    '2026-03-31|U|1250|Imposta di bollo 3,00 31/03/2026 trimestre'], breve(f.movimenti));
  eq('saldo iniziale e finale dalla tabella', [-125040, 18940], [f.saldo_iniziale, f.saldo_finale]);
  eq('saldo iniziale + movimenti = saldo finale', f.saldo_finale,
    f.movimenti.reduce((s, m) => s + (m.tipo === 'Entrata' ? m.centesimi : -m.centesimi), f.saldo_iniziale));
  eq('tabelle dopo il saldo finale (carte di credito, competenze) ignorate, nessuna scartata', 0, f.scartate.length);
  eq('formato pdf', 'pdf', f.formato);

  console.log('--- Banco BPM, lista movimenti (un importo col segno ed EUR, causale, data sopra l\'intestazione)');
  const b = await leggi('bpm.pdf');
  eq('5 movimenti, codice causale tolto, continuazioni unite, seconda pagina', [
    '2026-03-02|U|2340|Pagamento POS - Carta*1234-12:30-FARMACIA CENTRALE ITA',
    '2026-03-05|E|180000|Accr. vs. favore - bon.da ROSSI SRL ft 3 del 01/03/2026',
    '2026-03-10|U|15000|Addebito diretto SDD - sdd core: 1234567 TIM SPA fattura marzo',
    '2026-03-20|U|250|Comm. su bonifico - ns rif. 123 Spese e comm.',
    '2026-03-27|U|100000|Prelievo Bancomat - ATM 0001'], breve(b.movimenti));
  eq('saldo contabile scritto in testa', [null, 234567], [b.saldo_iniziale, b.saldo_finale]);

  console.log('--- testo e file non validi');
  eq('scansione (niente testo): spiegato', true, /scansione/.test(await err(() => leggi('scansione.pdf'))));
  eq('non e\' un PDF', 'Non e\' un PDF', await err(() => P.leggiPdf(Buffer.from('ciao'))));
  eq('PDF rovinato: spiegato', true, /Non riesco a leggere il PDF/.test(await err(() => P.leggiPdf(Buffer.from('%PDF-1.4\n' + 'x'.repeat(500))))));
  eq('PDF senza tabella dei movimenti', true, /non trovo la tabella/.test(await err(() => P.leggiTestoPdf('Lettera\nGentile cliente,\n12/01/2026 qualcosa 12,00'))));
  eq('righe con data prima della tabella ignorate', 1, P.leggiTestoPdf('01/01/2026 pubblicita 5,00\nData  Importo  Descrizione\n02/01/2026  -5,00  Spesa').movimenti.length);
  eq('importo col meno in fondo (1.234,56-) e +', ['U|123456', 'E|1000'],
    P.leggiTestoPdf('Data  Importo  Descrizione\n02/01/2026  1.234,56-  A\n03/01/2026  +10,00  B').movimenti.map(m => `${m.tipo[0]}|${m.centesimi}`));
  eq('riga con data senza importo: scartata', ['importo mancante'], P.leggiTestoPdf('Data  Importo  Descrizione\n02/01/2026   senza cifra').scartate.map(x => x.motivo));
  const vecchio = process.env.PDFTOTEXT_BIN;
  process.env.PDFTOTEXT_BIN = '/inesistente/pdftotext';
  delete require.cache[require.resolve(path.join(__dirname, '../../../backend/services/estratti/pdf'))];
  const P2 = require(path.join(__dirname, '../../../backend/services/estratti/pdf'));
  eq('server senza pdftotext: spiegato', true, /non si possono leggere i PDF/.test(await err(() => P2.leggiPdf(fs.readFileSync(path.join(dir, 'bpm.pdf'))))));
  if (vecchio === undefined) delete process.env.PDFTOTEXT_BIN; else process.env.PDFTOTEXT_BIN = vecchio;
  console.log(`PASS ${pass}   FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();
