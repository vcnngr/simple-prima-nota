// Parte nel browser dello smoke U8c (scripts/smoke/u8c-export.sh): export dal Registro.
// Ambiente: WEB, CHROME, PROFILO, FOTO, SCARICATI (cartella dei download), TOKEN, C1 (Banca).
// Dati del setup: 6 movimenti, 2 uscite su Banca.
import { readdirSync } from 'node:fs';
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
  const testo = sel => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const larghezza = () => p.valuta('document.documentElement.scrollWidth');
  await p.invia('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: E.SCARICATI });

  await p.schermo(1366, 768, 2, false);
  await p.vai(E.WEB + '/accedi');
  await p.valuta(`localStorage.setItem('token', ${JSON.stringify(E.TOKEN)}); localStorage.setItem('user_type', 'user'); localStorage.setItem('user', '{}'); localStorage.removeItem('pn_testo'); true`);

  console.log('--- 1366 px');
  await p.vai(E.WEB + `/?tipo=Uscita&conto=${E.C1}`);
  eq('Registro filtrato: 2 movimenti', 'true', await p.aspetta(`document.querySelectorAll('[data-movimento]').length === 2 && document.querySelector('[data-totali="2"]')`, 10000));
  await p.clic('[data-link-esporta]');
  eq('«Esporta» apre il pannello, non porta via', 'true|/', `${await p.aspetta(`document.querySelector('dialog[open] [data-esporta-movimenti]')`)}|${await p.valuta('location.pathname')}`);
  eq('il pannello dice quanti e quali filtri', 'true|true|true', `${(await testo('[data-esporta-movimenti] p')).startsWith('2 movimenti')}|${(await testo('[data-filtri-export]')).includes('Uscite')}|${(await testo('[data-filtri-export]')).includes('Banca')}`);
  eq('Excel, CSV e il link all\'archivio', '2|1', `${await n('dialog[open] [data-esporta-formato]')}|${await n('dialog[open] [data-link-archivio]')}`);
  await p.foto(`${E.FOTO}/esporta-1366.png`);
  await p.clic('[data-esporta-formato="csv"]');
  eq('scaricato: il pannello si chiude', 'true', await p.aspetta(`!document.querySelector('dialog[open]')`, 10000));
  let f = [];
  for (let i = 0; i < 50 && !f.length; i++) { f = readdirSync(E.SCARICATI).filter(x => /^prima_nota_.*\.csv$/.test(x)); if (!f.length) await attendi(100); }
  eq('file CSV nella cartella dei download', 1, f.length);

  console.log('--- 390 px');
  await p.schermo(390, 844);
  await p.vai(E.WEB + '/?q=Vendita');
  eq('telefono: 2 movimenti col filtro', 'true', await p.aspetta(`document.querySelector('[data-totali="2"]')`, 10000));
  await p.clic('[data-esporta-telefono]');
  eq('telefono: «Esporta» nella riga dei totali apre il pannello con la ricerca', 'true|true',
    `${await p.aspetta(`document.querySelector('dialog[open] [data-esporta-movimenti]')`)}|${(await testo('[data-filtri-export]')).includes('Vendita')}`);
  eq('390 px: nessuno scorrimento orizzontale', 390, await larghezza());
  await p.foto(`${E.FOTO}/esporta-390.png`);

  eq('nessuna violazione della CSP', '[]', JSON.stringify(p.violazioni));
} catch (e) {
  fail++; console.log('  FAIL  eccezione nel browser: ' + e.message);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
