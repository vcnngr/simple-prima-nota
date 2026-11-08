// Parte nel browser dello smoke U7 (scripts/smoke/u7-registro.sh): il Registro.
// Ambiente: WEB, CHROME, PROFILO, FOTO, TOKEN (utente), CONTO (id del conto Banca).
// Dati del setup: saldo di tutti i conti 1350,25; Banca 1110,00; 5 movimenti, 2 da chiarire.
import { avvia } from './cdp.mjs';

const E = process.env;
let pass = 0, fail = 0;
const eq = (nome, atteso, ottenuto) => {
  if (String(atteso) === String(ottenuto)) { pass++; console.log(`  OK    ${nome}`); }
  else { fail++; console.log(`  FAIL  ${nome}\n         atteso=${atteso} ottenuto=${ottenuto}`); }
};

const b = await avvia({ chrome: E.CHROME, profilo: E.PROFILO });
try {
  const p = await b.pagina();
  const n = sel => p.valuta(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const attr = (sel, a) => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(a)}) ?? null`);
  const larghezza = () => p.valuta('document.documentElement.scrollWidth');
  const radice = () => p.valuta('getComputedStyle(document.documentElement).fontSize');
  const pronto = () => p.aspetta(`document.querySelector('[data-movimento]') && document.querySelector('[data-fascia] [data-saldo]')`, 10000);
  const percorso = () => p.valuta('location.pathname + location.search');

  await p.schermo(1366, 768, 2, false);
  await p.vai(E.WEB + '/accedi');
  await p.valuta(`localStorage.setItem('token', ${JSON.stringify(E.TOKEN)}); localStorage.setItem('user_type', 'user'); localStorage.setItem('user', '{}'); localStorage.removeItem('pn_testo'); true`);

  console.log('--- 1366 px');
  await p.vai(E.WEB + '/');
  eq('Registro aperto come pagina iniziale', true, await pronto());
  eq('fascia: saldo di tutti i conti', '135025', await attr('[data-fascia] [data-saldo]', 'data-saldo'));
  eq('fascia: due carte dei conti attivi (Tutti nascosta senza scelta) e i disattivati', '2|1',
    `${await n('button[data-carta-conto]:not([data-carta-conto=tutti])')}|${await n('[data-carta-conto=disattivati]')}`);
  eq('fascia: richieste aperte dello studio', '2', await attr('[data-fascia-chiarire]', 'data-fascia-chiarire'));
  eq('tabella del registro, niente lista', '1|0', `${await n('[data-tabella-registro]')}|${await n('li[data-movimento]')}`);
  eq('cinque righe, la prima col saldo totale', '5|135025', `${await n('tr[data-movimento]')}|${await attr('tr[data-movimento] [data-saldo-riga]', 'data-saldo-riga')}`);
  eq('colonne: Data, Controparte e descrizione, Categoria, Conto, Entrate, Uscite, Saldo',
    'Data|Controparte e descrizione|Categoria|Conto|Entrate|Uscite|Saldo',
    await p.valuta(`[...document.querySelectorAll('[data-tabella-registro] thead th')].map(t => t.textContent).join('|')`));
  eq('entrata nella sua colonna, uscita nella sua', '10,00||',
    await p.valuta(`(() => { const r = document.querySelector('tr[data-movimento]'); return r.querySelector('[data-entrata]').textContent + '|' + r.querySelector('[data-uscita]').textContent + '|'; })()`));
  eq('testo a 17 px da computer', '17px', await radice());
  eq('nessuno scorrimento orizzontale', 1366, await larghezza());
  eq('una sola barra di navigazione: la colonna a sinistra', '0', await p.valuta(`String([...document.querySelectorAll('nav[aria-label=Navigazione]')].filter(x => x.offsetParent).length)`));
  await p.foto(`${E.FOTO}/registro-1366.png`);

  await p.clic(`[data-carta-conto="${E.CONTO}"]`);
  await p.aspetta(`location.search.includes('conto=${E.CONTO}') && document.querySelectorAll('tr[data-movimento]').length === 3`);
  eq('carta del conto: filtra il registro', `/?conto=${E.CONTO}`, await percorso());
  eq('carta del conto: saldo del conto e righe col suo saldo', '111000|111000|Saldo · Banca',
    `${await attr('[data-fascia] [data-saldo]', 'data-saldo')}|${await attr('tr[data-movimento] [data-saldo-riga]', 'data-saldo-riga')}|${await p.valuta(`document.querySelector('[data-fascia-etichetta]').textContent`)}`);
  eq('con un conto la colonna Conto sparisce', '6', await n('[data-tabella-registro] thead th'));
  await p.clic(`[data-carta-conto="${E.CONTO}"]`);
  await p.aspetta(`!location.search.includes('conto=')`);
  eq('di nuovo la carta: tutti i conti', '/', await percorso());

  await p.clic('[data-fascia-chiarire]');
  await p.aspetta(`location.search.includes('chiarire=1') && document.querySelectorAll('tr[data-movimento]').length === 2`);
  eq('richieste dello studio: solo i movimenti da chiarire', '2|2', `${await n('tr[data-movimento]')}|${await n('tr[data-movimento] [data-da-chiarire]')}`);

  await p.vai(E.WEB + '/movimenti?tipo=Uscita');
  await p.aspetta(`location.pathname === '/' && document.querySelectorAll('tr[data-movimento]').length === 2`);
  eq('/movimenti (link vecchi) porta al Registro coi filtri', '/?tipo=Uscita|2', `${await percorso()}|${await n('tr[data-movimento]')}`);
  eq('select del tipo allineata al filtro', 'Uscita', await p.valuta(`document.querySelector('[data-scelta-tipo]').value`));

  await p.vai(E.WEB + '/');
  await pronto();
  await p.clic('tr[data-movimento]');
  eq('clic su una riga: scheda del movimento', true, await p.aspetta(`document.querySelector('dialog[open]')`));

  console.log('--- 390 px');
  await p.schermo(390, 844, 2, true);
  await p.vai(E.WEB + '/');
  eq('telefono: Registro aperto', true, await pronto());
  eq('telefono: lista, niente tabella', '0|5', `${await n('[data-tabella-registro]')}|${await n('li[data-movimento]')}`);
  eq('telefono: saldo su ogni riga e a fine giornata', '5|135025',
    `${await n('li[data-movimento] [data-saldo-riga]')}|${await p.valuta(`String(Math.round(Number(document.querySelector('[data-saldo-giorno]').textContent.replace(/[^0-9,]/g,'').replace(',','.')) * 100))`)}`);
  eq('telefono: barra in basso con Prima nota, Conti, +, Report, Studio', 'Prima nota|Conti|Report|Studio',
    await p.valuta(`[...document.querySelectorAll('nav[aria-label=Navigazione] a span')].map(s => s.textContent).join('|')`));
  eq('telefono: nessuno scorrimento orizzontale', 390, await larghezza());
  eq('telefono: testo a 16 px', '16px', await radice());
  await p.foto(`${E.FOTO}/registro-390.png`);

  console.log('--- dimensione del testo');
  await p.vai(E.WEB + '/impostazioni');
  await p.aspetta(`document.querySelector('[data-dimensione-testo] [data-valore=grande]')`);
  await p.clic('[data-dimensione-testo] [data-valore=grande]');
  eq('«Grande»: subito 18 px', '18px|grande', `${await radice()}|${await p.valuta('document.documentElement.dataset.testo')}`);
  await p.vai(E.WEB + '/');
  await pronto();
  eq('«Grande» resta dopo il ricaricamento, anche prima di React', 'grande|18px', `${await p.valuta('document.documentElement.dataset.testo')}|${await radice()}`);
  eq('«Grande» a 390 px: nessuno scorrimento orizzontale', 390, await larghezza());
  await p.schermo(1366, 768, 2, false);
  await p.vai(E.WEB + '/');
  await pronto();
  eq('«Grande» da computer: 19 px', '19px', await radice());
  eq('«Grande» da computer: nessuno scorrimento orizzontale', 1366, await larghezza());
  await p.foto(`${E.FOTO}/registro-1366-grande.png`);
  await p.vai(E.WEB + '/impostazioni');
  await p.aspetta(`document.querySelector('[data-dimensione-testo] [data-valore=normale]')`);
  await p.clic('[data-dimensione-testo] [data-valore=normale]');
  eq('«Normale»: di nuovo 17 px', '17px', await radice());

  eq('nessuna violazione della CSP', '[]', JSON.stringify(p.violazioni));
} catch (e) {
  fail++; console.log('  FAIL  eccezione nel browser: ' + e.message);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
