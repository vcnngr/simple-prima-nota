// Logica pura del frontend U4 (importi in centesimi, tastierino, date), senza
// browser. Lo esegue scripts/smoke/u4-componenti.sh. Argomento: cartella web/src.
import { pathToFileURL } from 'node:url';

const src = process.argv[2];
const carica = f => import(pathToFileURL(`${src}/${f}`).href);
let pass = 0, fail = 0;
const eq = (nome, atteso, ottenuto) => {
  if (String(atteso) === String(ottenuto)) { pass++; console.log(`  OK    ${nome}`); }
  else { fail++; console.log(`  FAIL  ${nome}\n         atteso=${atteso} ottenuto=${ottenuto}`); }
};
try {
  const I = await carica('util/importi.js');
  const K = await carica('util/tastierino.js');
  const D = await carica('util/date.js');
  const k = tasti => tasti.reduce(K.premi, K.VUOTO);

  eq('centesimi da testo del server', '123450|29|-1230|5|null', [I.centesimiDa('1234.50'), I.centesimiDa('0.29'), I.centesimiDa('-12.3'), I.centesimiDa('0.05'), String(I.centesimiDa('abc'))].join('|'));
  eq('formato italiano', '1.234.567,89|0,05|−12,30', [I.formatta(123456789), I.formatta(5), I.formatta(-1230)].join('|'));
  eq('testo per l\'API senza virgola mobile', '0.29|18.90|9999999999.99', [I.perApi(29), I.perApi(1890), I.perApi(999999999999)].join('|'));
  eq('0,1 + 0,2 = 0,30 esatto', '30|0.30', `${K.totale(k(['0', ',', '1', '+', '0', ',', '2']))}|${I.perApi(K.totale(k(['0', ',', '1', '+', '0', ',', '2', '='])))}`);
  const s = k(['1', '2', ',', '4', '+', '6', ',', '5']);
  eq('12,40 + 6,50: totale e somma in corso', '1890|12,40 +', `${K.totale(s)}|${K.espressione(s)}`);
  eq('= raccoglie in un solo importo', '18,9|1890', `${K.premi(s, '=').voce}|${K.totale(K.premi(s, '='))}`);
  eq('massimo due decimali', '12,34', k(['1', '2', ',', '3', '4', '5']).voce);
  eq('una sola virgola', '1,5', k(['1', ',', ',', '5']).voce);
  eq('niente zeri iniziali', '7', k(['0', '0', '7']).voce);
  eq('virgola come primo tasto: 0,', '0,', k([',']).voce);
  eq('al massimo 10 cifre intere', '9999999999', k(Array(12).fill('9')).voce);
  eq('cancella toglie l\'ultima cifra', '12,', k(['1', '2', ',', '4', 'canc']).voce);
  eq('cancella a vuoto riprende l\'ultimo termine', '12,4|0', (() => { const x = k(['1', '2', ',', '4', '+', 'canc']); return `${x.voce}|${x.termini.length}`; })());
  eq('meno dopo un termine: sottrae', '1000', K.totale(k(['1', '5', '-', '5'])));
  eq('due operatori di fila: vale l\'ultimo', '20', K.totale(k(['1', '5', '+', '-', '+', '5'])) / 100);
  eq('totale zero: da inserire', 'Inserisci un importo', K.problema(K.VUOTO));
  eq('totale negativo: rifiutato', 'Il totale deve essere positivo', K.problema(k(['5', '-', '9'])));
  eq('somma oltre il tetto: rifiutata', 'Importo troppo grande', K.problema(k([...Array(10).fill('9'), '+', '9'])));
  eq('importo valido: nessun problema', 'null', String(K.problema(s)));
  // Date nel fuso del dispositivo (TZ dell'ambiente): mai toISOString().
  eq('giorno locale, non UTC', '2026-10-09', D.giornoDi(new Date(2026, 9, 9, 0, 30)));
  eq('etichette dei giorni', 'Oggi · ven 9 ott|Ieri · gio 8 ott|lun 5 ott|mer 31 dic 2025',
    ['2026-10-09', '2026-10-08', '2026-10-05', '2025-12-31'].map(g => D.etichettaGiorno(g, '2026-10-09')).join('|'));
  eq('ieri a cavallo del mese', 'Ieri · mer 30 set', D.etichettaGiorno('2026-09-30', '2026-10-01'));
} catch (e) {
  fail++; console.log(`  FAIL  moduli non caricati\n         ${e.message}`);
}
console.log(`CONTEGGIO ${pass} ${fail}`);
