// Parte nel browser dello smoke U8a (scripts/smoke/u8a-classificazione.sh).
// Ambiente: WEB, CHROME, PROFILO, FOTO, TOKEN (utente), ENEL (controparte con
// ultima categoria «Bollette», tipologia Fornitori), LIBERA (Bar Sport, senza
// tipologia), TF (Fornitori), TC (Clienti).
import { avvia } from './cdp.mjs';

const E = process.env;
let pass = 0, fail = 0;
const eq = (nome, atteso, ottenuto) => {
  if (String(atteso) === String(ottenuto)) { pass++; console.log(`  OK    ${nome}`); }
  else { fail++; console.log(`  FAIL  ${nome}\n         atteso=${atteso} ottenuto=${ottenuto}`); }
};
const attendi = ms => new Promise(r => setTimeout(r, ms));
const J = JSON.stringify;

const b = await avvia({ chrome: E.CHROME, profilo: E.PROFILO });
try {
  const p = await b.pagina();
  const n = sel => p.valuta(`document.querySelectorAll(${J(sel)}).length`);
  const attr = (sel, a) => p.valuta(`document.querySelector(${J(sel)})?.getAttribute(${J(a)}) ?? null`);
  const testo = sel => p.valuta(`document.querySelector(${J(sel)})?.textContent ?? null`);
  const totale = () => attr('[data-totale]', 'data-totale');
  const incolla = t => p.valuta(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', ${J(t)});
    document.querySelector('[data-campo-importo]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true; })()`);
  const tasto = async (key, code) => {
    await p.invia('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text: key.length === 1 ? key : undefined, windowsVirtualKeyCode: key === 'Backspace' ? 8 : key.charCodeAt(0) });
    await p.invia('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
  };
  const larghezza = () => p.valuta('document.documentElement.scrollWidth');
  const cat = () => p.valuta(`new URLSearchParams(location.search).getAll('cat').sort().join(',')`);

  await p.schermo(390, 844);
  await p.vai(E.WEB + '/accedi');
  await p.valuta(`localStorage.setItem('token', ${J(E.TOKEN)}); localStorage.setItem('user_type', 'user'); localStorage.setItem('user', '{}'); localStorage.removeItem('pn_testo'); true`);

  console.log('--- 390 px, nuovo movimento');
  await p.vai(E.WEB + '/nuovo');
  await p.aspetta("document.querySelector('input[name=cerca-controparte]')");
  await p.scrivi('input[name=cerca-controparte]', 'Enel');
  await p.aspetta("[...document.querySelectorAll('[data-risultati=pronti] [data-controparte]')].some(e => e.textContent.includes('Enel Energia'))");
  await p.valuta("([...document.querySelectorAll('[data-controparte]')].find(e => e.textContent.includes('Enel Energia')).click(), true)");
  eq('categoria proposta dalla controparte, bottone premuto', 'true|proposta da Enel Energia',
    `${await p.aspetta("document.querySelector('[data-categoria-scelta=\"Bollette\"][aria-pressed=true]')")}|${await testo('[data-categoria-proposta]')}`);
  eq('bottoni: le categorie piu\' usate per le uscite, e «+»', 'true|1',
    `${await p.aspetta("document.querySelectorAll('[data-categoria-scelta]').length >= 3")}|${await n('[data-nuova-voce=categoria]')}`);
  await incolla('1.234');
  eq('incollato «1.234»: rifiutato, importo invariato', 'true|0',
    `${(await testo('[data-errore-incolla]'))?.includes('migliaia o decimali')}|${await totale()}`);
  await incolla(' € 1.234,56 ');
  eq('incollato «€ 1.234,56»: 1.234,56', '123456|false', `${await totale()}|${!!(await testo('[data-errore-incolla]'))}`);
  eq('importo in vista', '− 1.234,56 €', await testo('[data-totale]'));
  await p.scrivi('input[name=descrizione]', 'Incollato');
  await p.clic('[data-aggiungi-nota]');
  eq('«Aggiungi una nota» apre il campo', 'true', await p.aspetta("document.querySelector('textarea[name=note]')"));
  await p.scrivi('textarea[name=note]', 'pagata con bonifico');
  eq('390 px: nessuno scroll orizzontale', '390', await larghezza());
  await p.foto(`${E.FOTO}/nuovo-categoria-390.png`);
  await p.clic('[data-registra]');
  eq('registrato: torna al Registro', 'true', await p.aspetta("location.pathname === '/' && !document.querySelector('dialog[open]')"));

  await p.vai(E.WEB + '/nuovo');
  await p.aspetta("document.querySelector('[data-controparte=nessuna]')");
  await p.clic('[data-controparte=nessuna]');
  await p.aspetta("document.querySelector('[data-campo-importo]')");
  eq('senza controparte: nessuna categoria proposta', '0|0', `${await n('[data-categoria-scelta][aria-pressed=true]')}|${await n('[data-categoria-proposta]')}`);
  await p.valuta("(document.querySelector('[data-campo-importo]').focus(), true)");
  for (const [k, c] of [['1', 'Digit1'], ['2', 'Digit2'], ['.', 'Period'], ['4', 'Digit4'], ['Backspace', 'Backspace'], ['3', 'Digit3']]) await tasto(k, c);
  eq('tastiera vera: 1 2 . 4 ⌫ 3 = 12,30', '1230', await totale());
  await p.scrivi('input[name=descrizione]', 'Tastiera');
  await p.clic('[data-nuova-voce=categoria]');
  await p.aspetta("document.querySelector('input[name=nuova-categoria]')");
  await p.scrivi('input[name=nuova-categoria]', 'Cancelleria');
  await p.clic('[data-aggiungi-voce=categoria]');
  eq('categoria nuova scelta', 'true', await p.aspetta("document.querySelector('[data-categoria-scelta=\"Cancelleria\"][aria-pressed=true]')"));
  await p.clic('[data-categoria-scelta="Cancelleria"]');
  eq('ritoccata: tolta', 'false', await attr('[data-categoria-scelta="Cancelleria"]', 'aria-pressed'));
  await p.clic('[data-categoria-scelta="Cancelleria"]');
  await p.clic('[data-registra]');
  eq('registrato il secondo', 'true', await p.aspetta("location.pathname === '/' && !document.querySelector('dialog[open]')"));

  console.log('--- 390 px, controparte');
  await p.vai(E.WEB + `/controparti/${E.LIBERA}`);
  await p.aspetta('document.querySelector("[data-modifica-controparte]")');
  await p.clic('[data-modifica-controparte]');
  await p.aspetta(`document.querySelector('[data-tipologia-scelta="${E.TF}"]')`);
  eq('tipologie a bottoni, nessuna scelta', 'false', await attr(`[data-tipologia-scelta="${E.TF}"]`, 'aria-pressed'));
  await p.clic('[data-nuova-voce=tipologia]');
  await p.aspetta("document.querySelector('input[name=nuova-tipologia]')");
  await p.scrivi('input[name=nuova-tipologia]', 'Ospiti');
  await p.clic('[data-aggiungi-voce=tipologia]');
  eq('tipologia nuova creata e scelta', 'true', await p.aspetta("[...document.querySelectorAll('[data-tipologia-scelta][aria-pressed=true]')].some(e => e.textContent === 'Ospiti')"));
  await p.clic(`[data-tipologia-scelta="${E.TF}"]`);
  eq('Fornitori: «di solito» Uscita, deciso dalla tipologia', 'true|true',
    `${await p.aspetta(`document.querySelector('[data-tipologia-scelta="${E.TF}"][aria-pressed=true]')`)}|${await p.valuta("document.querySelector('[data-di-solito=Uscita]').disabled && document.querySelector('[data-di-solito=Uscita]').getAttribute('aria-checked') === 'true'")}`);
  await p.clic('[data-categoria-controparte="Energia"]');
  eq('categoria della controparte a bottoni', 'true', await attr('[data-categoria-controparte="Energia"]', 'aria-pressed'));
  eq('390 px: nessuno scroll orizzontale', '390', await larghezza());
  await p.foto(`${E.FOTO}/controparte-390.png`);
  await p.clic('[data-salva-controparte]');
  eq('salvata', 'true', await p.aspetta("!document.querySelector('dialog[open]')"));

  console.log('--- 390 px, filtri');
  await p.vai(E.WEB + '/');
  await p.aspetta('document.querySelector("[data-apri-filtri]")');
  await p.clic('[data-apri-filtri]');
  eq('pannello Filtri con categorie e importo', 'true', await p.aspetta("document.querySelector('dialog[open] [data-filtro-categorie]') && document.querySelector('dialog[open] input[name=importo-da]')"));
  await p.aspetta("document.querySelector('dialog[open] [data-filtro-categoria=\"Utenze\"]')");
  await p.clic('[data-filtro-categoria="Utenze"]');
  await p.clic('[data-applica]');
  eq('categoria nell\'indirizzo e fra le etichette', 'Utenze|true',
    `${(await p.aspetta("new URLSearchParams(location.search).get('cat')")) && await cat()}|${await p.aspetta("[...document.querySelectorAll('[data-etichette] [data-togli=cat]')].some(e => e.textContent.includes('Utenze'))")}`);
  eq('una riga (Utenze)', 'true', await p.aspetta("document.querySelectorAll('li[data-movimento]').length === 1"));
  await p.foto(`${E.FOTO}/filtri-390.png`);

  console.log('--- 1366 px, altri filtri');
  await p.schermo(1366, 768, 2, false);
  await p.vai(E.WEB + '/');
  await p.aspetta('document.querySelector("[data-apri-altri]")');
  eq('colonna Categoria con la tipologia sotto', 'true', await p.aspetta("[...document.querySelectorAll('[data-tipologia-riga]')].some(e => e.textContent.includes('Fornitori'))"));
  await p.clic('[data-apri-altri]');
  await p.aspetta("document.querySelector('dialog[open] [data-pannello-filtri=altri]')");
  eq('pannello laterale a destra, alto quanto lo schermo, senza periodo', '1366|768|0',
    await p.valuta("(() => { const r = document.querySelector('dialog[open]').getBoundingClientRect(); return Math.round(r.right) + '|' + Math.round(r.height) + '|' + document.querySelectorAll('dialog[open] [data-periodo]').length; })()"));
  await p.aspetta("document.querySelector('dialog[open] [data-filtro-categoria=\"Bollette\"]')");
  await p.clic('[data-filtro-categoria="Utenze"]');
  await p.clic('[data-filtro-categoria="Bollette"]');
  await p.foto(`${E.FOTO}/altri-filtri-1366.png`);
  await p.clic('[data-applica]');
  eq('due categorie: 4 righe (A, C, F, Incollato)', 'Bollette,Utenze|true',
    `${(await p.aspetta("new URLSearchParams(location.search).getAll('cat').length === 2")) && await cat()}|${await p.aspetta("document.querySelectorAll('tr[data-movimento]').length === 4")}`);
  eq('etichette sotto la barra e «Altri filtri · 2»', '2|Altri filtri · 2', `${await n('[data-etichette-largo] [data-togli-largo]')}|${await testo('[data-apri-altri]')}`);
  await p.clic('[data-togli-largo="cUtenze"]');
  eq('tolta Utenze: 3 righe', 'Bollette|true', `${(await p.aspetta("new URLSearchParams(location.search).getAll('cat').length === 1")) && await cat()}|${await p.aspetta("document.querySelectorAll('tr[data-movimento]').length === 3")}`);
  await p.clic('[data-togli-altri]');
  eq('«Togli tutti»: nessun filtro', 'true', await p.aspetta("!location.search.includes('cat') && !document.querySelector('[data-etichette-largo]')"));
  await p.clic('[data-apri-altri]');
  await p.aspetta(`document.querySelector('dialog[open] [data-filtro-tipologia="${E.TF}"]')`);
  await p.clic(`[data-filtro-tipologia="${E.TF}"]`);
  await p.scrivi('input[name=importo-a]', '60');
  await p.clic('[data-applica]');
  eq('Fornitori fino a 60 €: 3 righe (C, F, Bar Sport)', 'true', await p.aspetta(`new URLSearchParams(location.search).get('tipologie') === '${E.TF}' && new URLSearchParams(location.search).get('a') === '60.00' && document.querySelectorAll('tr[data-movimento]').length === 3`));
  eq('etichette: tipologia e importo', 'Fornitori|fino a 60,00 €',
    await p.valuta("[...document.querySelectorAll('[data-etichette-largo] [data-togli-largo]')].map(e => e.textContent).join('|')"));
  eq('nessuno scorrimento orizzontale', 1366, await larghezza());
  await p.foto(`${E.FOTO}/registro-filtri-1366.png`);

  eq('nessuna violazione della CSP', '[]', JSON.stringify(p.violazioni));
} catch (e) {
  fail++; console.log('  FAIL  eccezione nel browser: ' + e.message);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
