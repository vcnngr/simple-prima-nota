// Parte nel browser dello smoke U9c: un PDF caricato dalla pagina «Carica l'estratto conto».
// Ambiente: WEB, CHROME, PROFILO, FOTO, TOKEN, FILE (fineco.pdf inventato).
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
  const attr = (sel, a) => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(a)}) ?? null`);
  for (const [w, h, m] of [[1366, 768, false], [390, 844, true]]) {
    console.log(`--- ${w} px`);
    await p.schermo(w, h, 2, m);
    await p.vai(E.WEB + '/accedi');
    await p.valuta(`localStorage.setItem('token', ${JSON.stringify(E.TOKEN)}); localStorage.setItem('user_type', 'user'); localStorage.setItem('user', '{}'); true`);
    await p.vai(E.WEB + '/estratti/carica');
    await p.aspetta(`document.querySelector('[data-carica-estratto] input[type=file]') && document.querySelector('select[name=conto] option')`, 10000);
    eq('il campo accetta i PDF, la pagina li nomina', 'true|true', `${(await attr('[data-file-estratto]', 'accept')).includes('.pdf')}|${await p.valuta(`document.body.innerText.includes('PDF')`)}`);
    const o = await p.invia('Runtime.evaluate', { expression: `document.querySelector('[data-file-estratto]')` });
    await p.invia('DOM.setFileInputFiles', { files: [E.FILE], objectId: o.result.objectId });
    eq('anteprima del PDF: 5 nuove', 'true|5', `${await p.aspetta(`document.querySelector('[data-anteprima-estratto]')`, 15000)}|${await attr('[data-anteprima-estratto]', 'data-nuove')}`);
    eq('controllo del saldo: torna', 'ok', await attr('[data-controllo-saldo]', 'data-controllo-saldo'));
    eq(`${w} px: nessuno scorrimento orizzontale`, w, await p.valuta('document.documentElement.scrollWidth'));
    await p.foto(`${E.FOTO}/anteprima-pdf-${w}.png`);
    if (w === 390) {
      await p.clic('[data-conferma-estratto]');
      eq('importato: 5 nuovi', 'true', await p.aspetta(`document.querySelector('[data-estratto-importato="5"]')`, 15000));
    }
  }
  eq('nessuna violazione della CSP', '[]', JSON.stringify(p.violazioni));
} catch (e) {
  fail++; console.log('  FAIL  eccezione nel browser: ' + e.message);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
