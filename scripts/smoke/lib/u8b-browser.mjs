// Parte nel browser dello smoke U8b (scripts/smoke/u8b-controparti.sh): controparti.
// Ambiente: WEB, CHROME, PROFILO, FOTO, TOKEN (utente), TC (Clienti), TF (Fornitori).
// Dati del setup: Alfa (Clienti, Utenze), Beta (Fornitori, Affitto), Gamma (niente),
// Delta (Clienti, disattivata), =HYPERLINK (Fornitori, Affitto): 5 controparti.
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
  const righe = k => p.aspetta(`document.querySelectorAll('[data-controparte]').length === ${k} && document.querySelector('[data-totale-controparti="${k}"]')`, 10000);
  const nomi = () => p.valuta(`[...document.querySelectorAll('[data-controparte]')].map(e => e.querySelector('a, span.block.font-bold')?.textContent.trim()).sort().join(',')`);
  const cerca = () => p.valuta('location.search');

  await p.schermo(1366, 768, 2, false);
  await p.vai(E.WEB + '/accedi');
  await p.valuta(`localStorage.setItem('token', ${JSON.stringify(E.TOKEN)}); localStorage.setItem('user_type', 'user'); localStorage.setItem('user', '{}'); localStorage.removeItem('pn_testo'); true`);

  console.log('--- 1366 px');
  await p.vai(E.WEB + '/controparti');
  eq('tabella con 5 controparti', 'true|1', `${await righe(5)}|${await n('[data-tabella-controparti]')}`);
  eq('colonne: Nome, Tipologia, Categoria, Contatti, Mov., Entrate, Uscite', 'Nome|Tipologia|Categoria|Contatti|Mov.|Entrate|Uscite',
    await p.valuta(`[...document.querySelectorAll('[data-tabella-controparti] thead th')].map(t => t.textContent).join('|')`));
  eq('conteggi per tipologia: Clienti 2, Fornitori 2, Senza 1, Disattivate 1 (Vuota nascosta)', 'Clienti 2|Fornitori 2|Senza tipologia 1|Disattivate 1',
    await p.valuta(`[...document.querySelectorAll('[data-conteggi-tipologie] button')].map(e => e.textContent.trim()).join('|')`));
  eq('nessuno scorrimento orizzontale', 1366, await larghezza());
  await p.foto(`${E.FOTO}/controparti-1366.png`);

  await p.clic(`[data-conteggio-tipologia="${E.TC}"]`);
  eq('tocco su Clienti: 2 righe, indirizzo tip', `true|?tip=${E.TC}`, `${await righe(2)}|${await cerca()}`);
  eq('Clienti premuto, etichetta togliibile', 'true|1', `${await attr(`[data-conteggio-tipologia="${E.TC}"]`, 'aria-pressed')}|${await n('[data-togli-controparti]')}`);

  await p.clic('[data-apri-filtri-controparti]');
  eq('pannello dei filtri a destra', 'true', await p.aspetta(`document.querySelector('dialog[open] [data-pannello-controparti]')`));
  await p.clic('[data-filtro-categoria="Utenze"]');
  await p.clic('[data-filtro-stato="true"]');
  await p.foto(`${E.FOTO}/filtri-1366.png`);
  await p.clic('[data-applica-controparti]');
  eq('Clienti + Utenze + attive: solo Alfa', 'true|Alfa', `${await righe(1)}|${await nomi()}`);
  eq('tre etichette e «Filtri · 3»', '3|Filtri · 3', `${await n('[data-togli-controparti]')}|${(await p.valuta(`document.querySelector('[data-apri-filtri-controparti]').textContent`)).trim()}`);
  await p.vai(E.WEB + '/controparti' + await cerca());
  eq('i filtri restano dopo la ricarica', 'true|Alfa', `${await righe(1)}|${await nomi()}`);
  await p.clic('[data-togli-tutti-controparti]');
  eq('«Togli tutti»: di nuovo 5, indirizzo pulito', 'true|', `${await righe(5)}|${await cerca()}`);

  await p.clic('[data-conteggio-disattivate]');
  eq('Disattivate: solo Delta', 'true|Delta', `${await righe(1)}|${await nomi()}`);
  await p.clic('[data-togli-tutti-controparti]');
  await righe(5);

  await p.clic('[data-apri-esporta-controparti]');
  eq('esporta: Excel e CSV', '2', (await p.aspetta(`document.querySelector('dialog[open] [data-esporta-controparti]')`)) && await n('dialog[open] [data-esporta-controparti]'));
  await p.invia('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: E.FOTO });
  await p.clic('[data-esporta-controparti="csv"]');
  eq('dopo il download il pannello si chiude, nessun errore', 'true', await p.aspetta(`!document.querySelector('dialog[open]')`));

  console.log('--- nuova controparte');
  await p.clic('[data-nuova-controparte]');
  eq('pannello «Nuova controparte», contatti aperti, niente Elimina', 'true|0',
    `${await p.aspetta(`document.querySelector('dialog[open][data-sheet="Nuova controparte"] input[name=email]')`)}|${await n('dialog[open] [data-elimina-controparte]')}`);
  await p.scrivi('dialog[open] input[name=nome]', 'Nuova Ditta');
  await p.clic(`dialog[open] [data-tipologia-scelta="${E.TF}"]`);
  await p.clic('dialog[open] [data-categoria-controparte="Energia"]');
  await p.scrivi('dialog[open] input[name=email]', 'info@nuova.it');
  await p.foto(`${E.FOTO}/nuova-1366.png`);
  await p.clic('[data-salva-controparte]');
  eq('creata: si apre la sua scheda', 'true', await p.aspetta(`/^\\/controparti\\/\\d+$/.test(location.pathname) && document.querySelector('[data-scheda-controparte]')?.textContent.includes('Nuova Ditta')`, 10000));
  await p.vai(E.WEB + '/controparti');
  eq('in elenco: 6 controparti, Fornitori 3', 'true|Fornitori 3', `${await righe(6)}|${(await p.valuta(`document.querySelector('[data-conteggio-tipologia="${E.TF}"]').textContent`)).trim()}`);

  console.log('--- 390 px');
  await p.schermo(390, 844);
  await p.vai(E.WEB + '/controparti');
  eq('schede, niente tabella', 'true|0', `${await righe(6)}|${await n('[data-tabella-controparti]')}`);
  eq('390 px: nessuno scorrimento orizzontale', 390, await larghezza());
  await p.foto(`${E.FOTO}/controparti-390.png`);
  await p.clic('[data-apri-filtri-controparti]');
  await p.aspetta(`document.querySelector('dialog[open] [data-pannello-controparti]')`);
  await p.clic('[data-filtro-tipologia="senza"]');
  await p.foto(`${E.FOTO}/filtri-390.png`);
  await p.clic('[data-applica-controparti]');
  eq('senza tipologia: solo Gamma', 'true|Gamma', `${await righe(1)}|${await nomi()}`);
  eq('390 px coi filtri: nessuno scorrimento orizzontale', 390, await larghezza());

  eq('nessuna violazione della CSP', '[]', JSON.stringify(p.violazioni));
} catch (e) {
  fail++; console.log('  FAIL  eccezione nel browser: ' + e.message);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
