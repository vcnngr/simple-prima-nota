// Parte nel browser dello smoke U4 (scripts/smoke/u4-componenti.sh): Estratto a
// cursore con le quattro viste, scelta della vista sull'account, cambio di conto
// nel bottom sheet, nuovo movimento «chi, poi quanto» con il tastierino.
// Ambiente: WEB, CHROME, PROFILO, FOTO, UTENTE, PW, SALDO (centesimi), NMOV, CASSA.
import { avvia } from './cdp.mjs';

const { WEB, CHROME, PROFILO, FOTO, UTENTE, PW, SALDO, NMOV, CASSA } = process.env;
let pass = 0, fail = 0;
const eq = (nome, atteso, ottenuto) => {
  if (String(atteso) === String(ottenuto)) { pass++; console.log(`  OK    ${nome}`); }
  else { fail++; console.log(`  FAIL  ${nome}\n         atteso=${atteso} ottenuto=${ottenuto}`); }
};
const it = c => `${c < 0 ? '−' : ''}${String(Math.floor(Math.abs(c) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(Math.abs(c) % 100).padStart(2, '0')}`;
const attendi = ms => new Promise(r => setTimeout(r, ms));

const b = await avvia({ chrome: CHROME, profilo: PROFILO });
try {
  const p = await b.pagina();
  await p.schermo(390, 844);
  await p.schemaColori(false);
  const larghezza = () => p.valuta('document.documentElement.scrollWidth');
  const api = (percorso, metodo = 'GET', corpo) => p.valuta(`fetch('/api${percorso}', { method: '${metodo}',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
    body: ${corpo ? JSON.stringify(JSON.stringify(corpo)) : 'undefined'} }).then(r => r.json())`);
  const tasti = async seq => { for (const t of seq) await p.clic(`[data-tasto="${t}"]`); };
  const sheetAperto = () => p.valuta("!!document.querySelector('dialog[open]')");
  const fino = async () => {   // scorre fino alla fine della lista
    for (let i = 0; i < 40; i++) {
      if (await p.valuta("document.querySelector('[data-fine-lista]')?.dataset.fineLista === 'fine'")) return true;
      await p.valuta('(window.scrollTo(0, document.body.scrollHeight), true)');
      await attendi(250);
    }
    return false;
  };

  console.log('=== A. Estratto a cursore ===');
  await p.vai(WEB + '/accedi');
  await p.aspetta("document.querySelector('input[name=username]')");
  await p.scrivi('input[name=username]', UTENTE);
  await p.scrivi('input[name=password]', PW);
  await p.clic('button[type=submit]');
  eq('login: Estratto con le righe', 'si', (await p.aspetta("document.querySelector('[data-movimento]')")) ? 'si' : 'no');
  eq('saldo del conto = calcola_saldo_conto', SALDO, await p.valuta("document.querySelector('[data-saldo]').dataset.saldo"));
  eq('prima pagina: 30 righe, altre da caricare', '30|altre',
    `${await p.valuta("document.querySelectorAll('[data-movimento]').length")}|${await p.valuta("document.querySelector('[data-fine-lista]').dataset.fineLista")}`);
  eq('scorrendo arriva in fondo', 'true', await fino());
  eq(`tutte le ${NMOV} righe, nessuna ripetuta`, `${NMOV}|${NMOV}`,
    await p.valuta("(() => { const v = [...document.querySelectorAll('[data-movimento]')].map(e => e.dataset.movimento); return v.length + '|' + new Set(v).size; })()"));
  eq('giorni in ordine decrescente, ciascuno una volta', 'true',
    await p.valuta("(() => { const g = [...document.querySelectorAll('[data-giorno]')].map(e => e.dataset.giorno); return g.every((x, i) => !i || x < g[i - 1]); })()"));
  eq('prima riga: saldo dopo il movimento = saldo del conto', `saldo ${it(Number(SALDO))} €`,
    await p.valuta("document.querySelector('[data-movimento] .text-xs').textContent"));
  eq('390 px: nessuno scroll orizzontale', '390', await larghezza());

  console.log('=== B. quattro viste, scelte sull\'account ===');
  for (const v of ['colonne', 'iniziali', 'mastro', 'due_righe']) {
    await p.vai(WEB + '/impostazioni');
    await p.aspetta(`document.querySelector('[data-valore=${v}]')`);
    await p.clic(`[data-valore=${v}]`);
    await p.aspetta(`document.querySelector('[data-valore=${v}][aria-pressed=true]') && !document.querySelector('button[disabled]')`);
    eq(`${v}: salvata sull'account`, v, (await api('/auth/preferenze')).vista_estratto);
    await p.vai(WEB + '/');
    eq(`${v}: Estratto nella vista scelta`, v, (await p.aspetta(`document.querySelector('[data-vista=${v}] [data-movimento]')`)) && await p.valuta("document.querySelector('[data-vista]').dataset.vista"));
    await fino();
    eq(`${v}: 390 px senza scroll orizzontale, ${NMOV} righe`, `390|${NMOV}`, `${await larghezza()}|${await p.valuta("document.querySelectorAll('[data-movimento]').length")}`);
    if (v === 'iniziali') {
      eq('iniziali: saldo di fine giornata del primo giorno', `fine giornata ${it(Number(SALDO))} €`, await p.valuta("document.querySelector('[data-saldo-giorno]').textContent"));
    }
    await p.valuta('(window.scrollTo(0, 0), true)');
    for (const [t, a] of [['registro', 'chiaro'], ['bottega', 'scuro']]) {
      await p.valuta(`(document.documentElement.dataset.tema='${t}', document.documentElement.dataset.aspetto='${a}', true)`);
      await p.foto(`${FOTO}/estratto-${v}-${t}-${a}.png`);
    }
    await p.valuta("(document.documentElement.dataset.tema='registro', document.documentElement.dataset.aspetto='automatico', true)");
  }

  console.log('=== C. bottom sheet: cambio di conto ===');
  await p.clic('[data-scegli-conto]');
  eq('sheet aperto', 'true', await p.aspetta("document.querySelector('dialog[open] [data-conto]')"));
  await p.foto(`${FOTO}/sheet-conto.png`);
  await p.clic(`[data-conto="${CASSA}"]`);
  eq('altro conto: saldo e lista vuota', '5000|true',
    (await p.aspetta(`document.querySelector('[data-estratto="${CASSA}"]') && document.querySelector('[data-fine-lista=fine]')`)) &&
    `${await p.valuta("document.querySelector('[data-saldo]').dataset.saldo")}|${await p.valuta("document.querySelectorAll('[data-movimento]').length === 0")}`);
  eq('sheet chiuso dopo la scelta', 'false', await sheetAperto());
  await p.vai(WEB + '/');
  eq('il conto scelto resta dopo la ricarica', CASSA, (await p.aspetta('document.querySelector("[data-estratto]")')) && await p.valuta("document.querySelector('[data-estratto]').dataset.estratto"));
  await p.clic('[data-scegli-conto]');
  await p.aspetta("document.querySelector('dialog[open] [data-conto]')");
  await p.valuta("(document.querySelector('dialog[open] [data-conto]:not([data-conto=\"" + CASSA + "\"])').click(), true)");
  await p.aspetta(`document.querySelector('[data-estratto]:not([data-estratto="${CASSA}"]) [data-movimento]')`);

  console.log('=== D. nuovo movimento: chi, poi quanto ===');
  await p.clic('a[aria-label="Nuovo movimento"]');
  eq('il + apre il nuovo movimento in un sheet', '/nuovo|true',
    (await p.aspetta("location.pathname === '/nuovo' && document.querySelector('dialog[open] [data-controparte]')")) && `${await p.valuta('location.pathname')}|${await sheetAperto()}`);
  await p.aspetta("document.querySelector('[data-risultati=pronti] [data-controparte]')");
  eq('senza testo: prima la piu\' usata', 'Enel Energia', await p.valuta("document.querySelector('[data-risultati] [data-controparte] .font-semibold').textContent"));
  await p.foto(`${FOTO}/nuovo-1-chi.png`);
  await p.scrivi('input[name=cerca-controparte]', 'bian');
  eq('ricerca sul server', 'Bianchi e Rossi srl',
    (await p.aspetta("[...document.querySelectorAll('[data-risultati=pronti] [data-controparte] .font-semibold')].some(e => e.textContent === 'Bianchi e Rossi srl')")) &&
    await p.valuta("[...document.querySelectorAll('[data-risultati] [data-controparte] .font-semibold')].map(e => e.textContent).find(t => t.startsWith('Bianchi'))"));
  await p.valuta("([...document.querySelectorAll('[data-controparte]')].find(e => e.textContent.includes('Bianchi e Rossi srl')).click(), true)");
  eq('tipo dalla controparte (Entrata)', 'true', await p.aspetta("document.querySelector('[data-tipo=Entrata][aria-checked=true]')"));
  eq('Registra spento senza importo', 'true', await p.valuta("document.querySelector('[data-registra]').disabled"));
  await tasti(['1', '2', ',', '4', '+', '6', ',', '5']);
  eq('somma degli scontrini in corso', '12,40 +|1890',
    `${await p.valuta("document.querySelector('[data-espressione]').textContent")}|${await p.valuta("document.querySelector('[data-totale]').dataset.totale")}`);
  await tasti(['=']);
  eq('= : 18,90', '1890|+ 18,90 €', `${await p.valuta("document.querySelector('[data-totale]').dataset.totale")}|${await p.valuta("document.querySelector('[data-totale]').textContent")}`);
  eq('390 px: sheet senza scroll orizzontale', '390', await larghezza());
  await p.foto(`${FOTO}/nuovo-2-quanto.png`);
  await p.clic('[data-registra]');
  eq('registrato: torna all\'Estratto, sheet chiuso', '/|false',
    (await p.aspetta("location.pathname === '/' && !document.querySelector('dialog[open]')")) && `${await p.valuta('location.pathname')}|${await sheetAperto()}`);
  eq('in cima all\'Estratto, saldo aggiornato', `+ 18,90 €|${Number(SALDO) + 1890}`,
    (await p.aspetta(`document.querySelector('[data-saldo]').dataset.saldo === '${Number(SALDO) + 1890}'`)) &&
    `${await p.valuta("document.querySelector('[data-movimento] .importo').textContent")}|${await p.valuta("document.querySelector('[data-saldo]').dataset.saldo")}`);

  console.log('=== E. importi rifiutati, Esc, doppio tocco ===');
  await p.vai(WEB + '/nuovo');
  await p.aspetta("document.querySelector('[data-controparte=nessuna]')");
  await p.clic('[data-controparte=nessuna]');
  await p.aspetta("document.querySelector('[data-tasto]')");
  await p.scrivi('input[name=descrizione]', 'prova negativa');
  await tasti(['5', '-', '9', '=']);
  eq('totale negativo: Registra spento, messaggio', 'true|Il totale deve essere positivo',
    `${await p.valuta("document.querySelector('[data-registra]').disabled")}|${await p.valuta("document.querySelector('[role=alert]')?.textContent")}`);
  await p.invia('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  eq('Esc chiude il sheet senza registrare', '/|false',
    (await p.aspetta("location.pathname === '/' && !document.querySelector('dialog[open]')")) && `${await p.valuta('location.pathname')}|${await sheetAperto()}`);
  await p.vai(WEB + '/nuovo');
  await p.aspetta("document.querySelector('[data-risultati=pronti] [data-controparte]:not([data-controparte=nessuna])')");
  await p.valuta("([...document.querySelectorAll('[data-controparte]')].find(e => e.textContent.includes('Enel Energia')).click(), true)");
  await p.aspetta("document.querySelector('[data-tasto]')");
  eq('tipo dalla controparte (Uscita)', 'true', await p.aspetta("document.querySelector('[data-tipo=Uscita][aria-checked=true]')"));
  await tasti(['7', ',', '7', '7']);
  await p.valuta("(() => { const b = document.querySelector('[data-registra]'); b.click(); b.click(); b.click(); return true; })()");
  await p.aspetta("location.pathname === '/'");
  await attendi(500);

  console.log('=== F. CSP ===');
  eq('nessuna violazione della CSP in tutto il giro', '', p.violazioni.join(' ; '));
} catch (e) {
  fail++; console.log(`  FAIL  eccezione nel browser\n         ${e.message}`);
} finally {
  b.chiudi();
}
console.log(`CONTEGGIO ${pass} ${fail}`);
