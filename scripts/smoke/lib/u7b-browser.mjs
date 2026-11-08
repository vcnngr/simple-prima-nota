// Parte nel browser dello smoke U7b (scripts/smoke/u7b-conti.sh): piu' conti insieme.
// Ambiente: WEB, CHROME, PROFILO, FOTO, TOKEN (utente), C1 (Banca), C2 (Cassa).
// Dati del setup U7: tutti i conti 1350,25; Banca 1110,00; Cassa 20,25; Banca+Cassa 1130,25 (4 movimenti).
import { avvia } from './cdp.mjs';

const E = process.env;
let pass = 0, fail = 0;
const eq = (nome, atteso, ottenuto) => {
  if (String(atteso) === String(ottenuto)) { pass++; console.log(`  OK    ${nome}`); }
  else { fail++; console.log(`  FAIL  ${nome}\n         atteso=${atteso} ottenuto=${ottenuto}`); }
};
const attendi = ms => new Promise(r => setTimeout(r, ms));

const b = await avvia({ chrome: E.CHROME, profilo: E.PROFILO });
try {
  const p = await b.pagina();
  const n = sel => p.valuta(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const attr = (sel, a) => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(a)}) ?? null`);
  const testo = sel => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const scelta = () => p.valuta(`new URLSearchParams(location.search).get('conto') ?? ''`);
  const saldo = () => attr('[data-fascia] [data-saldo]', 'data-saldo');
  // Attende fascia e prima riga col saldo atteso (le query si aggiornano dopo il clic).
  const fino = (s, righe) => p.aspetta(`document.querySelector('[data-fascia] [data-saldo]')?.dataset.saldo === '${s}'
    && document.querySelector('[data-movimento] [data-saldo-riga]')?.dataset.saldoRiga === '${s}'
    && document.querySelectorAll('[data-movimento]').length === ${righe}`, 10000);
  const C1 = E.C1, C2 = E.C2;

  await p.schermo(1366, 768, 2, false);
  await p.vai(E.WEB + '/accedi');
  await p.valuta(`localStorage.setItem('token', ${JSON.stringify(E.TOKEN)}); localStorage.setItem('user_type', 'user'); localStorage.setItem('user', '{}'); localStorage.removeItem('pn_testo'); true`);

  console.log('--- 1366 px, carte della fascia');
  await p.vai(E.WEB + '/');
  eq('tutti i conti: 1350,25, 5 righe', true, await fino('135025', 5));
  await p.clic(`[data-carta-conto="${C1}"]`);
  eq('una carta: solo Banca, 1110,00, 3 righe', `true|${C1}|Saldo · Banca`, `${await fino('111000', 3)}|${await scelta()}|${await testo('[data-fascia-etichetta]')}`);
  await p.clic(`[data-carta-conto="${C2}"]`);
  eq('seconda carta aggiunta: Banca + Cassa, 1130,25, 4 righe', `true|${C1},${C2}|Saldo di 2 conti`,
    `${await fino('113025', 4)}|${await scelta()}|${await testo('[data-fascia-etichetta]')}`);
  eq('due carte premute, Tutti i conti visibile e spenta', 'true|true|false',
    `${await attr(`[data-carta-conto="${C1}"]`, 'aria-pressed')}|${await attr(`[data-carta-conto="${C2}"]`, 'aria-pressed')}|${await attr('[data-carta-conto=tutti]', 'aria-pressed')}`);
  eq('mese dei due conti: +210,00 −30,25', '2 conti|+ 210,00|− 30,25',
    await p.aspetta(`document.querySelector('[data-fascia-mese]')?.textContent.includes('2 conti')`) &&
    `2 conti|${await testo('[data-mese-entrate]')}|${await testo('[data-mese-uscite]')}`);
  eq('colonna Conto con piu\' conti', 'true', await p.valuta(`[...document.querySelectorAll('[data-tabella-registro] thead th')].some(t => t.textContent === 'Conto')`));
  eq('aiuto sotto le carte', 'true', await p.valuta(`!!document.querySelector('[data-fascia-aiuto]')`));
  eq('totali delle 4 righe', '4', await attr('[data-totali]', 'data-totali'));
  eq('pulsante Conti: 2 conti', '2 conti', (await testo('[data-scelta-conto]')).trim());
  await p.foto(`${E.FOTO}/conti-1366.png`);
  await p.clic(`[data-carta-conto="${C1}"]`);
  eq('Banca tolta: resta Cassa, 20,25', `true|${C2}`, `${await fino('2025', 1)}|${await scelta()}`);
  await p.clic(`[data-carta-conto="${C2}"]`);
  eq('ultima tolta: di nuovo tutti i conti', 'true|', `${await fino('135025', 5)}|${await scelta()}`);

  console.log('--- 1366 px, pulsante Conti');
  await p.clic('[data-scelta-conto]');
  eq('pannello dei conti aperto', true, await p.aspetta(`document.querySelector('dialog[open] [data-pannello-conti]')`));
  await p.clic(`[data-pannello-conti] [data-filtro-conto="${C2}"]`);
  await p.clic(`[data-pannello-conti] [data-filtro-conto="${C1}"]`);
  await p.clic('[data-applica-conti]');
  eq('dal pannello: Banca + Cassa', `true|${C1},${C2}`, `${await fino('113025', 4)}|${await scelta()}`);
  await p.clic('[data-scelta-conto]');
  await p.aspetta(`document.querySelector('dialog[open] [data-pannello-conti]')`);
  await p.clic('[data-pannello-conti] [data-filtro-conto=tutti]');
  await p.clic('[data-applica-conti]');
  eq('dal pannello, Tutti: di nuovo tutti i conti', 'true|', `${await fino('135025', 5)}|${await scelta()}`);

  console.log('--- link');
  await p.vai(`${E.WEB}/?conto=${C2},${C1},${C1}`);
  eq('indirizzo con doppioni e fuori ordine: stessa scelta', 'true', await fino('113025', 4));
  await p.vai(`${E.WEB}/movimenti?conto=${C1},${C2}&tipo=Entrata`);
  eq('/movimenti vecchio con due conti e tipo', 'true|2', `${await p.aspetta(`location.pathname === '/' && document.querySelectorAll('[data-movimento]').length === 2`)}|${await n('[data-movimento]')}`);
  await p.vai(`${E.WEB}/?conto=abc`);
  eq('scelta illeggibile: tutti i conti', 'true', await fino('135025', 5));

  console.log('--- 390 px, pannello dei filtri');
  await p.schermo(390, 844);
  await p.vai(E.WEB + '/');
  await fino('135025', 5);
  await p.clic('[data-apri-filtri]');
  await p.aspetta(`document.querySelector('dialog[open] [data-pannello-filtri]')`);
  await p.clic(`[data-pannello-filtri] [data-filtro-conto="${C1}"]`);
  await p.clic(`[data-pannello-filtri] [data-filtro-conto="${C2}"]`);
  eq('due conti accesi nel pannello', 'true|true',
    `${await attr(`[data-pannello-filtri] [data-filtro-conto="${C1}"]`, 'aria-pressed')}|${await attr(`[data-pannello-filtri] [data-filtro-conto="${C2}"]`, 'aria-pressed')}`);
  await p.clic('[data-applica]');
  eq('telefono: Banca + Cassa, etichetta «2 conti»', `true|${C1},${C2}|true`,
    `${await fino('113025', 4)}|${await scelta()}|${await p.valuta(`[...document.querySelectorAll('[data-etichette] [data-togli=conto]')].some(e => e.textContent.includes('2 conti'))`)}`);
  eq('390 px: nessuno scorrimento orizzontale', 390, await p.valuta('document.documentElement.scrollWidth'));
  await attendi(200);
  await p.foto(`${E.FOTO}/conti-390.png`);
  await p.clic('[data-etichette] [data-togli=conto]');
  eq('togliendo l\'etichetta: tutti i conti', 'true|', `${await fino('135025', 5)}|${await scelta()}`);

  eq('nessuna violazione della CSP', '[]', JSON.stringify(p.violazioni));
} catch (e) {
  fail++; console.log('  FAIL  eccezione nel browser: ' + e.message);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
