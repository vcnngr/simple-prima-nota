// Parte nel browser dello smoke U9a (scripts/smoke/u9a-estratti.sh).
// Ambiente: WEB, CHROME, PROFILO, FOTO, TOKEN, FILE (estratto Fineco finto).
// Dati: un conto Fineco (saldo iniziale 0,50) con la bolletta Enel gia' scritta.
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
  const file = async (sel, percorso) => {
    const o = await p.invia('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)})` });
    await p.invia('DOM.setFileInputFiles', { files: [percorso], objectId: o.result.objectId });
  };

  console.log('--- 1366 px: carica, anteprima, importa');
  await p.schermo(1366, 768, 2, false);
  await p.vai(E.WEB + '/accedi');
  await p.valuta(`localStorage.setItem('token', ${JSON.stringify(E.TOKEN)}); localStorage.setItem('user_type', 'user'); localStorage.setItem('user', '{}'); true`);
  await p.vai(E.WEB + '/');
  eq('Registro: «Carica estratto» nella barra', 'true', await p.aspetta(`document.querySelector('[data-carica-estratto-largo]')`, 10000));
  eq('nessun avviso «da descrivere» prima', 0, await n('[data-avviso-descrivere]'));
  await p.clic('[data-carica-estratto-largo]');
  await p.aspetta(`document.querySelector('[data-carica-estratto] input[type=file]') && document.querySelector('select[name=conto] option')`, 10000);
  await file('[data-file-estratto]', E.FILE);
  eq('anteprima: 3 nuove, 1 gia\' nel Registro', 'true|3|1', `${await p.aspetta(`document.querySelector('[data-anteprima-estratto]')`, 15000)}|${await attr('[data-anteprima-estratto]', 'data-nuove')}|${await attr('[data-anteprima-estratto]', 'data-abbinate')}`);
  eq('controllo del saldo: torna', 'ok', await attr('[data-controllo-saldo]', 'data-controllo-saldo'));
  eq('1366 px: nessuno scorrimento orizzontale', 1366, await larghezza());
  await p.foto(`${E.FOTO}/anteprima-1366.png`);
  await p.clic('[data-conferma-estratto]');
  eq('importato: 3 nuovi', 'true', await p.aspetta(`document.querySelector('[data-estratto-importato="3"]')`, 15000));
  await p.clic('[data-vai-descrivere]');
  eq('Registro filtrato: 3 righe col bordo, avviso «3»', 'true|3', `${await p.aspetta(`location.search === '?descrivere=1' && document.querySelectorAll('[data-movimento][data-da-descrivere]').length === 3`, 10000)}|${await attr('[data-avviso-descrivere]', 'data-avviso-descrivere')}`);
  await p.foto(`${E.FOTO}/registro-descrivere-1366.png`);

  console.log('--- 390 px: uno alla volta');
  await p.schermo(390, 844);
  await p.vai(E.WEB + '/');
  eq('avviso col pulsante «Uno alla volta»', 'true', await p.aspetta(`document.querySelector('[data-avviso-descrivere="3"] [data-uno-alla-volta]')`, 10000));
  eq('righe col bordo anche fra le altre', 3, await p.valuta(`(async () => { for (let i = 0; i < 50 && document.querySelectorAll('[data-movimento] [data-da-descrivere]').length < 3; i++) await new Promise(r => setTimeout(r, 100)); return document.querySelectorAll('[data-movimento] [data-da-descrivere]').length; })()`));
  await p.foto(`${E.FOTO}/registro-390.png`);
  await p.clic('[data-uno-alla-volta]');
  eq('prima scheda: «1 di 3», testo della banca', 'true', await p.aspetta(`document.querySelector('[data-descrivi-posizione]')?.textContent === '1 di 3' && document.querySelector('[data-testo-banca]')?.textContent.length > 3`, 10000));
  const primo = await p.valuta(`document.querySelector('[data-descrivi]').dataset.descrivi`);
  await p.scrivi('textarea[name=nota-descrivi]', 'spiegato al browser');
  await p.scrivi('input[name=cerca-categoria-descrivi]', 'Prova U9a');
  await p.clic('[data-crea-voce="categoria-descrivi"]');
  await p.foto(`${E.FOTO}/uno-alla-volta-390.png`);
  eq('390 px: scheda senza scorrimento orizzontale', 390, await larghezza());
  await p.clic('[data-descrivi-salva]');
  eq('salvata: «2 di 3»', 'true', await p.aspetta(`document.querySelector('[data-descrivi-posizione]')?.textContent === '2 di 3'`, 10000));
  await p.clic('[data-descrivi-salta]');
  eq('saltata: «3 di 3»', 'true', await p.aspetta(`document.querySelector('[data-descrivi-posizione]')?.textContent === '3 di 3'`, 10000));
  await p.clic('[data-descrivi-salta]');
  eq('fine', 'true', await p.aspetta(`document.querySelector('[data-descrivi-fine]')`, 10000));
  await p.clic('[data-descrivi-fine] button');
  eq('avviso ora «2»', 'true', await p.aspetta(`document.querySelector('[data-avviso-descrivere="2"]')`, 10000));
  console.log(`PRIMO ${primo}`);
  eq('nessuna violazione della CSP', '[]', JSON.stringify(p.violazioni));
} catch (e) {
  fail++; console.log('  FAIL  eccezione nel browser: ' + e.message);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
