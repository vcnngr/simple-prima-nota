// Parte nel browser dello smoke U9b (scripts/smoke/u9b-studio.sh).
// Ambiente: WEB, CHROME, PROFILO, FOTO, STUDIO (token), CLIENTE (id di U), UTENTE
// (token di un cliente con Cassa e Fineco), CONTO_BANCA (id del conto atteso).
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
  const larghezza = () => p.valuta('document.documentElement.scrollWidth');
  const studio = async () => {
    await p.vai(E.WEB + '/studio/accedi');
    await p.valuta(`localStorage.clear(); localStorage.setItem('commercialista_token', ${JSON.stringify(E.STUDIO)}); localStorage.setItem('user_type', 'commercialista'); localStorage.setItem('commercialista', '{}'); true`);
  };
  for (const [w, h, m] of [[1366, 768, false], [390, 844, true]]) {
    console.log(`--- ${w} px`);
    await p.schermo(w, h, 2, m);
    await studio();
    await p.vai(E.WEB + '/studio/estratti');
    eq('griglia: 4 clienti, cella U ottobre con 3 da descrivere', 'true', await p.aspetta(`document.querySelectorAll('[data-riga-cliente]').length === 4
      && document.querySelector('[data-cella="${E.CLIENTE}|2026-10"] [data-stato="descrivere"]')?.textContent === '3'`, 10000));
    eq('voce «Estratti» nella navigazione', 'true', await p.valuta(`[...document.querySelectorAll('a[href="/studio/estratti"]')].length > 0`));
    if (w === 390) eq('390 px: primo mese in vista = il corrente', new Date().toISOString().slice(0, 7), await p.valuta(`document.querySelector('[data-riga-cliente] [data-cella]').dataset.cella.split('|')[1]`));
    eq('V: «≠ saldo»', 'true', await p.valuta(`!!document.querySelector('[data-saldo="diverso"]')`));
    if (w === 390) eq('390 px: la griglia scorre dentro il suo riquadro, la pagina no', 390, await larghezza());
    await p.foto(`${E.FOTO}/griglia-${w}.png`);
    await p.clic(`[data-cella="${E.CLIENTE}|2026-10"]`);
    eq('cella -> righe di ottobre del cliente: 4, 3 col bordo', 'true|3', `${await p.aspetta(`document.querySelectorAll('[data-riga-estratto]').length === 4`, 10000)}|${await n('[data-riga-estratto][data-da-descrivere="si"]')}`);
    eq('saldo non torna piu\' (il cliente ha cancellato un movimento dell\'estratto)', 1, await n('[data-saldo-estratto="diverso"]'));
    await p.clic('[data-solo-descrivere]');
    eq('«Solo da descrivere»: 3', 'true', await p.aspetta(`document.querySelectorAll('[data-riga-estratto]').length === 3`));
    await p.clic('[data-solo-descrivere]');
    if (w === 390) eq('390 px: righe senza scorrimento orizzontale', 390, await larghezza());
    await p.foto(`${E.FOTO}/righe-${w}.png`);
  }
  // «Chiedi» su una riga da descrivere (una volta sola, a 390 px).
  await p.clic('[data-riga-estratto][data-da-descrivere="si"] [data-chiedi-riga]');
  await p.aspetta(`document.querySelector('dialog[open] textarea[name=messaggio]')`);
  await p.scrivi('dialog[open] textarea[name=messaggio]', 'Cosa è questo pagamento?');
  await p.foto(`${E.FOTO}/chiedi-390.png`);
  await p.clic('dialog[open] button[type=submit]');
  eq('chiesto: la riga mostra «chiarimento chiesto»', 'true', await p.aspetta(`!document.querySelector('dialog[open]') && document.querySelectorAll('[data-chiesto]').length === 1`, 10000));

  console.log('--- conto proposto per l\'estratto');
  await p.schermo(1366, 768, 2, false);
  await p.vai(E.WEB + '/accedi');
  await p.valuta(`localStorage.clear(); localStorage.setItem('token', ${JSON.stringify(E.UTENTE)}); localStorage.setItem('user_type', 'user'); localStorage.setItem('user', '{}'); true`);
  await p.vai(E.WEB + '/estratti/carica');
  eq('proposto il conto della banca, non la cassa', E.CONTO_BANCA, await p.aspetta(`document.querySelector('select[name=conto] option') && document.querySelector('select[name=conto]').value`, 10000)
    && await p.valuta(`document.querySelector('select[name=conto]').value`));
  eq('nessuna violazione della CSP', '[]', JSON.stringify(p.violazioni));
} catch (e) {
  fail++; console.log('  FAIL  eccezione nel browser: ' + e.message);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
