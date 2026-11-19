// Parte nel browser dello smoke U8e (scripts/smoke/u8e-ricerca.sh): la ricerca
// della pagina Controparti senza accenti. Ambiente: WEB, CHROME, PROFILO, FOTO, TOKEN.
// Dati: 6 controparti, fra cui «Caffè Quarta spa» e «CITTÀ DI LECCE».
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
  const una = testo => p.aspetta(`document.querySelectorAll('[data-controparte]').length === 1
    && document.querySelector('[data-controparte]').textContent.includes(${JSON.stringify(testo)})`, 10000);
  for (const [w, h, m] of [[1366, 768, false], [390, 844, true]]) {
    console.log(`--- ${w} px`);
    await p.schermo(w, h, 2, m);
    await p.vai(E.WEB + '/accedi');
    await p.valuta(`localStorage.setItem('token', ${JSON.stringify(E.TOKEN)}); localStorage.setItem('user_type', 'user'); localStorage.setItem('user', '{}'); true`);
    await p.vai(E.WEB + '/controparti');
    eq('pagina con 6 controparti', 'true', await p.aspetta(`document.querySelector('[data-totale-controparti="6"]')`, 10000));
    await p.scrivi('input[name=cerca]', 'caffe');
    eq('«caffe» senza accento: una riga, Caffè Quarta', 'true', await una('Caffè Quarta'));
    await p.foto(`${E.FOTO}/ricerca-caffe-${w}.png`);
    await p.vai(E.WEB + '/controparti?q=citta');
    eq('dall\'indirizzo «citta»: una riga, CITTÀ DI LECCE', 'true', await una('CITTÀ DI LECCE'));
  }
  eq('nessuna violazione della CSP', '[]', JSON.stringify(p.violazioni));
} catch (e) {
  fail++; console.log('  FAIL  eccezione nel browser: ' + e.message);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
