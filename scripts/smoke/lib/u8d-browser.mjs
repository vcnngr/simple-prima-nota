// Parte nel browser dello smoke U8d (scripts/smoke/u8d-controparti.sh).
// Ambiente: WEB, CHROME, PROFILO, FOTO, TOKEN, TR (id della tipologia «Rara»).
// Dati: 68 controparti; 12 tipologie (Tipo 01..11 + Rara, mai usata);
// categorie Cat 01..11 scritte solo sulle controparti + Energia nell'elenco.
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
  const voci = nome => p.valuta(`[...document.querySelectorAll('dialog[open] [data-scelta-voce="${nome}"] [aria-pressed]')].length`);
  const larghezza = () => p.valuta('document.documentElement.scrollWidth');

  for (const [w, h, m] of [[1366, 768, false], [390, 844, true]]) {
    console.log(`--- ${w} px`);
    await p.schermo(w, h, 2, m);
    await p.vai(E.WEB + '/accedi');
    await p.valuta(`localStorage.setItem('token', ${JSON.stringify(E.TOKEN)}); localStorage.setItem('user_type', 'user'); localStorage.setItem('user', '{}'); true`);
    await p.vai(E.WEB + '/controparti');
    eq('pagina con 68 controparti', 'true', await p.aspetta(`document.querySelector('[data-totale-controparti="68"]')`, 10000));
    await p.scrivi('input[name=cerca]', 'alfa');
    eq('ricerca «alfa»: una riga, Alfa Ricambi', 'true', await p.aspetta(`document.querySelectorAll('[data-controparte]').length === 1
      && document.querySelector('[data-controparte]').textContent.includes('Alfa Ricambi')`, 10000));
    eq('ricerca nell\'indirizzo', 'alfa', await p.valuta(`new URLSearchParams(location.search).get('q')`));
    await p.vai(E.WEB + '/controparti?q=ditta%2011');
    eq('dall\'indirizzo «ditta 11»: una riga', 'true', await p.aspetta(`document.querySelectorAll('[data-controparte]').length === 1`, 10000));
    eq(`${w} px: nessuno scorrimento orizzontale`, w, await larghezza());
  }

  console.log('--- nuova controparte, 390 px');
  await p.vai(E.WEB + '/controparti');
  await p.aspetta(`document.querySelector('[data-nuova-controparte]')`);
  await p.clic('[data-nuova-controparte]');
  await p.aspetta(`document.querySelectorAll('dialog[open] [data-scelta-voce="tipologia"] [aria-pressed]').length >= 8
    && document.querySelectorAll('dialog[open] [data-scelta-voce="categoria-controparte"] [aria-pressed]').length >= 8`, 10000);
  await p.scrivi('dialog[open] input[name=nome]', 'Nuova Prova');
  eq('tipologie: le 8 più usate e «Tutte (12)», Rara non fra le prime', '8|Tutte (12)|0',
    `${await voci('tipologia')}|${(await p.valuta(`document.querySelector('dialog[open] [data-tutte-voci="tipologia"]')?.textContent`))}|${await n(`dialog[open] [data-tipologia-scelta="${E.TR}"]`)}`);
  await p.clic('dialog[open] [data-tutte-voci="tipologia"]');
  eq('«Tutte»: 12 tipologie', '12', await voci('tipologia'));
  await p.clic('dialog[open] [data-tutte-voci="tipologia"]');
  await p.scrivi('dialog[open] input[name=cerca-tipologia]', 'rar');
  eq('cerca «rar»: solo Rara, e «Crea»', 'true|1', `${await p.aspetta(`document.querySelectorAll('dialog[open] [data-scelta-voce="tipologia"] [aria-pressed]').length === 1 && document.querySelector('dialog[open] [data-tipologia-scelta="${E.TR}"]')`)}|${await n('dialog[open] [data-crea-voce="tipologia"]')}`);
  await p.scrivi('dialog[open] input[name=cerca-tipologia]', 'RARA');
  eq('nome esatto (maiuscole a parte): niente «Crea»', '0', await n('dialog[open] [data-crea-voce="tipologia"]'));
  await p.clic(`dialog[open] [data-tipologia-scelta="${E.TR}"]`);
  eq('Rara scelta, ricerca svuotata, resta in vista', 'true|', `${await attr(`dialog[open] [data-tipologia-scelta="${E.TR}"]`, 'aria-pressed')}|${await p.valuta(`document.querySelector('dialog[open] input[name=cerca-tipologia]').value`)}`);
  eq('categorie: anche quelle scritte solo sulle controparti, «Tutte (12)»', 'true|Tutte (12)',
    `${(await voci('categoria-controparte')) === 8}|${await p.valuta(`document.querySelector('dialog[open] [data-tutte-voci="categoria-controparte"]')?.textContent`)}`);
  await p.scrivi('dialog[open] input[name=cerca-categoria-controparte]', 'cat 11');
  eq('cerca «cat 11»: la trova (usata una volta, fuori dalle prime 8)', 'true', await p.aspetta(`document.querySelector('dialog[open] [data-categoria-controparte="Cat 11"]')`));
  await p.foto(`${E.FOTO}/nuova-ricerca-390.png`);
  await p.clic('dialog[open] [data-categoria-controparte="Cat 11"]');
  eq('Cat 11 scelta', 'true', await attr('dialog[open] [data-categoria-controparte="Cat 11"]', 'aria-pressed'));
  eq('390 px: pannello senza scorrimento orizzontale', 390, await larghezza());
  await p.clic('[data-salva-controparte]');
  eq('creata: si apre la scheda', 'true', await p.aspetta(`/^\\/controparti\\/\\d+$/.test(location.pathname) && document.querySelector('[data-scheda-controparte]')?.textContent.includes('Nuova Prova')`, 10000));

  console.log('--- «Crea» per un nome nuovo, con Invio');
  await p.vai(E.WEB + '/controparti');
  await p.aspetta(`document.querySelector('[data-nuova-controparte]')`);
  await p.clic('[data-nuova-controparte]');
  await p.aspetta(`document.querySelectorAll('dialog[open] [data-scelta-voce="categoria-controparte"] [aria-pressed]').length >= 8`, 10000);
  await p.scrivi('dialog[open] input[name=nome]', 'Seconda Prova');
  await p.scrivi('dialog[open] input[name=cerca-categoria-controparte]', 'Ricambi auto');
  await p.valuta(`(document.querySelector('dialog[open] input[name=cerca-categoria-controparte]').focus(), true)`);
  await p.invia('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  eq('Invio crea e sceglie «Ricambi auto»', 'true', await p.aspetta(`document.querySelector('dialog[open] [data-categoria-controparte="Ricambi auto"][aria-pressed=true]')`, 10000));
  eq('Invio non ha salvato la controparte (pannello ancora aperto)', 'true', await p.valuta(`!!document.querySelector('dialog[open][data-sheet="Nuova controparte"]')`));
  await p.clic('[data-salva-controparte]');
  await p.aspetta(`/^\\/controparti\\/\\d+$/.test(location.pathname)`, 10000);

  console.log('--- RED t_9f0f8523: corrispondenza parziale e doppio Invio');
  const invio = () => p.invia('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  const campo = "dialog[open] input[name=cerca-categoria-controparte]";
  await p.vai(E.WEB + '/controparti');
  await p.aspetta(`document.querySelector('[data-nuova-controparte]')`);
  await p.clic('[data-nuova-controparte]');
  await p.aspetta(`document.querySelectorAll('dialog[open] [data-scelta-voce="categoria-controparte"] [aria-pressed]').length >= 8`, 10000);
  await p.scrivi('dialog[open] input[name=nome]', 'Terza Prova');
  await p.scrivi(campo, 'Ricambi');
  eq('«Ricambi»: compare solo «Ricambi auto» e «Crea «Ricambi»»', 'true|1',
    `${await p.aspetta(`document.querySelector('dialog[open] [data-categoria-controparte="Ricambi auto"]')`)}|${await n('dialog[open] [data-crea-voce="categoria-controparte"]')}`);
  await p.valuta(`(document.querySelector(${JSON.stringify(campo)}).focus(), true)`);
  await invio();
  eq('Invio con corrispondenza solo parziale: crea e sceglie «Ricambi», non «Ricambi auto»', 'true|false',
    `${await p.aspetta(`document.querySelector('dialog[open] [data-categoria-controparte="Ricambi"][aria-pressed=true]')`, 10000)}|${(await attr('dialog[open] [data-categoria-controparte="Ricambi auto"]', 'aria-pressed')) === 'true'}`);
  await p.scrivi(campo, 'Duplicata70');
  await p.valuta(`(document.querySelector(${JSON.stringify(campo)}).focus(), true)`);
  // Tre Invio nello stesso giro del browser, prima che React ridisegni.
  await p.valuta(`(() => { const el = document.querySelector(${JSON.stringify(campo)});
    for (let i = 0; i < 3; i++) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    return true; })()`);
  eq('tre Invio di fila: «Duplicata70» scelta, nessun errore', 'true|0',
    `${await p.aspetta(`document.querySelector('dialog[open] [data-categoria-controparte="Duplicata70"][aria-pressed=true]')`, 10000)}|${await n('dialog[open] [role=alert]')}`);
  await p.clic('[data-salva-controparte]');
  await p.aspetta(`/^\\/controparti\\/\\d+$/.test(location.pathname)`, 10000);

  eq('nessuna violazione della CSP', '[]', JSON.stringify(p.violazioni));
} catch (e) {
  fail++; console.log('  FAIL  eccezione nel browser: ' + e.message);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
