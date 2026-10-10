// Parte nel browser dello smoke U5 (scripts/smoke/u5-pagine.sh): Movimenti con
// filtri, scheda, modifica ed eliminazione, scorrimento; Controparti; Report;
// Studio e chat. Ambiente: WEB, CHROME, PROFILO, FOTO, UTENTE, PW, CUR, OGGI,
// M_BAR, M_ENEL, M_ARUBA, M_BIANCHI, ENEL, C2, NETTO_ENEL.
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
  await p.schermo(390, 844);
  await p.schemaColori(false);
  const larghezza = () => p.valuta('document.documentElement.scrollWidth');
  const api = (percorso, metodo = 'GET') => p.valuta(`fetch('/api${percorso}', { method: '${metodo}',
    headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } }).then(async r => ({ stato: r.status, corpo: await r.json().catch(() => null) }))`);
  const n = sel => p.valuta(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const attr = (sel, a) => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(a)}) ?? null`);
  const testo = sel => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const tasti = async seq => { for (const t of seq) await p.clic(`[data-tasto="${t}"]`); };
  const scriviArea = (sel, v) => p.valuta(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(v)});
    el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const foto = async nome => {
    for (const [t, a] of [['registro', 'chiaro'], ['bottega', 'scuro']]) {
      await p.valuta(`(document.documentElement.dataset.tema='${t}', document.documentElement.dataset.aspetto='${a}', true)`);
      await p.foto(`${E.FOTO}/${nome}-${t}-${a}.png`);
    }
    await p.valuta("(document.documentElement.dataset.tema='registro', document.documentElement.dataset.aspetto='chiaro', true)");
  };
  const stretto = async nome => eq(`${nome}: 390 px senza scroll orizzontale`, 390, await larghezza());
  const riga = id => `[data-movimento="${id}"] [role=button]`;
  // Scorre la riga a sinistra col mouse (pointer events).
  const scorri = async id => {
    await p.valuta(`(document.querySelector('${riga(id)}').scrollIntoView({ block: 'center' }), true)`);
    const r = await p.valuta(`(() => { const b = document.querySelector('${riga(id)}').getBoundingClientRect(); return { x: b.right - 30, y: b.top + b.height / 2 }; })()`);
    await p.invia('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) await p.invia('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x - i * 20, y: r.y, button: 'left', buttons: 1 });
    await p.invia('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x - 200, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
    return p.aspetta(`document.querySelector('[data-movimento="${id}"]')?.dataset.aperta === 'si'`, 3000);
  };

  console.log('=== C1. Movimenti: ricerca ed etichette ===');
  await p.vai(E.WEB + '/accedi');
  await p.aspetta("document.querySelector('input[name=username]')");
  await p.scrivi('input[name=username]', E.UTENTE);
  await p.scrivi('input[name=password]', E.PW);
  await p.clic('button[type=submit]');
  await p.aspetta("document.querySelector('[data-estratto]')");
  await p.vai(E.WEB + '/movimenti');
  eq('Movimenti: 43 in tutto, prima pagina 30', '43|30', (await p.aspetta("document.querySelector('[data-totali]')"))
    && `${await attr('[data-totali]', 'data-totali')}|${await n('[data-movimento]')}`);
  eq('il Bar porta l\'etichetta «da chiarire»', '1|1', `${await n(`[data-movimento="${E.M_BAR}"] [data-da-chiarire]`)}|${await n('[data-da-chiarire]')}`);
  await stretto('Movimenti');
  await foto('movimenti');
  await p.scrivi('input[name=cerca]', 'Enel');
  eq('ricerca «Enel»: 4 movimenti, tutti di Enel', '4|4', (await p.aspetta("document.querySelector('[data-totali]')?.dataset.totali === '4'"))
    && `4|${await p.valuta("[...document.querySelectorAll('[data-movimento]')].filter(e => e.textContent.includes('Enel')).length")}`);
  eq('la ricerca va nell\'indirizzo', 'Enel', await p.valuta("new URL(location.href).searchParams.get('q')"));
  await p.clic('[aria-label="Svuota la ricerca"]');
  eq('ricerca svuotata: 43', 'true', await p.aspetta("document.querySelector('[data-totali]')?.dataset.totali === '43'"));
  await p.clic('[data-rapido=uscite]');
  eq('etichetta rapida «Uscite»: 41, nessuna entrata', '41|0', (await p.aspetta("document.querySelector('[data-totali]')?.dataset.totali === '41'"))
    && `41|${await n('[data-movimento] .text-entrata')}`);
  await p.clic('[data-togli=tipo]');
  eq('✕ toglie il filtro: 43', 'true', await p.aspetta("document.querySelector('[data-totali]')?.dataset.totali === '43'"));

  console.log('=== C2. pannello dei filtri ===');
  await p.clic('[data-apri-filtri]');
  await p.aspetta("document.querySelector('[data-pannello-filtri]')");
  await p.clic('[data-periodo=mese]');
  await p.clic(`[data-filtro-conto="${E.C2}"]`);
  await foto('filtri');
  await p.clic('[data-applica]');
  eq('questo mese + Cassa: solo il Bar, due etichette', `1|${E.M_BAR}|2`, (await p.aspetta("document.querySelector('[data-totali]')?.dataset.totali === '1'"))
    && `1|${await attr('[data-movimento]', 'data-movimento')}|${await n('[data-togli]')}`);
  eq('periodo nell\'indirizzo come giorni', `${E.CUR}-01`, await p.valuta("new URL(location.href).searchParams.get('dal')"));
  await p.clic('[data-togli=dal]');
  eq('tolto il periodo: i 2 della Cassa', 'true', await p.aspetta("document.querySelector('[data-totali]')?.dataset.totali === '2'"));
  await p.vai(E.WEB + '/movimenti?chiarire=1');
  eq('?chiarire=1: solo il Bar', `1|${E.M_BAR}`, (await p.aspetta("document.querySelector('[data-totali]')?.dataset.totali === '1'")) && `1|${await attr('[data-movimento]', 'data-movimento')}`);
  await p.vai(E.WEB + '/movimenti?tipo=Boh&conto=abc&dal=ieri');
  eq('filtri non validi nell\'indirizzo: ignorati', 'true', await p.aspetta("document.querySelector('[data-totali]')?.dataset.totali === '43'"));

  console.log('=== C3. Controparti e scheda ===');
  await p.vai(E.WEB + '/movimenti');
  await p.aspetta('document.querySelector("[data-link-controparti]")');
  await p.clic('[data-link-controparti]');
  eq('Controparti: la piu\' movimentata in cima (Enel)', E.ENEL, (await p.aspetta("document.querySelector('[data-controparte]')")) && await attr('[data-controparte]', 'data-controparte'));
  eq('Enel: netto in totale', E.NETTO_ENEL, await attr(`[data-controparte="${E.ENEL}"] [data-netto]`, 'data-netto'));
  await stretto('Controparti');
  await foto('controparti');
  await p.clic('[data-ordina=nome]');
  eq('A–Z: prima Aruba', 'Aruba spa', (await p.aspetta("document.querySelector('[data-ordina=nome][aria-checked=true]') && document.querySelector('[data-controparte]')?.textContent.startsWith('A')"))
    && await p.valuta("document.querySelector('[data-controparte] .truncate.font-bold').textContent"));
  await p.clic(`[data-controparte="${E.ENEL}"]`);
  eq('scheda di Enel: 12 mesi, netto dell\'anno', `12|${E.NETTO_ENEL}`, (await p.aspetta("document.querySelector('[data-barre]') && document.querySelector('[data-anno]')"))
    && `${await attr('[data-barre]', 'data-barre')}|${await attr('[data-anno]', 'data-anno')}`);
  eq('scheda: i 4 movimenti di Enel', 'true', await p.aspetta("document.querySelectorAll('[data-scheda-controparte] [data-movimento]').length === 4"));
  await stretto('Scheda della controparte');
  await foto('controparte');
  await p.clic('[data-nuovo-con]');
  eq('+ Movimento: si parte dall\'importo, Enel e Uscita gia\' scelte', 'nuovo|Enel Energia|true',
    (await p.aspetta("document.querySelector('[data-modulo=nuovo]')"))
    && `nuovo|${await testo('[data-cambia-controparte]')}|${await attr('[data-tipo=Uscita]', 'aria-checked')}`);
  await tasti(['5']);
  await p.clic('[data-registra]');
  eq('registrato: si torna alla scheda, 5 movimenti', 'true', await p.aspetta(`location.pathname === '/controparti/${E.ENEL}' && document.querySelectorAll('[data-scheda-controparte] [data-movimento]').length === 5`));
  await p.vai(E.WEB + '/controparti/999999999');
  eq('controparte altrui o inesistente: «non trovata»', 'true', await p.aspetta("document.querySelector('[data-controparte-assente]')"));

  console.log('=== C4. scheda, modifica, eliminazione ===');
  await p.vai(E.WEB + '/movimenti');
  await p.aspetta(`document.querySelector('${riga(E.M_ARUBA)}')`);
  await p.clic(riga(E.M_ARUBA));
  eq('tocco: scheda con l\'importo', '-2989', (await p.aspetta("document.querySelector('dialog[open] [data-dettaglio]')")) && await attr('[data-importo]', 'data-importo'));
  await foto('dettaglio');
  await p.clic('[data-modifica]');
  eq('Modifica: tastierino gia\' compilato (29,89)', '2989', (await p.aspetta("document.querySelector('[data-modulo=modifica]')")) && await attr('[data-totale]', 'data-totale'));
  await tasti(['canc', 'canc', 'canc', 'canc', 'canc', '3', '1', ',', '5']);
  eq('nuovo importo 31,50', '3150', await attr('[data-totale]', 'data-totale'));
  await foto('modifica');
  await p.clic('[data-registra]');
  eq('salvato: la scheda mostra 31,50', 'true', await p.aspetta("document.querySelector('[data-importo]')?.dataset.importo === '-3150'"));
  await p.clic('dialog[open] [aria-label=Chiudi]');
  eq('la lista si aggiorna', 'true', await p.aspetta(`document.querySelector('[data-movimento="${E.M_ARUBA}"]')?.textContent.includes('31,50')`));
  await p.clic(riga(E.M_ENEL));
  await p.aspetta("document.querySelector('[data-elimina]')");
  await p.clic('[data-elimina]');
  eq('Elimina chiede conferma', 'true', await p.aspetta("document.querySelector('[data-elimina-conferma]')"));
  eq('senza conferma non elimina', 200, (await api(`/movimenti/${E.M_ENEL}`)).stato);
  await p.clic('[data-elimina-conferma]');
  eq('confermato: scheda chiusa, riga sparita, 404', 'true|404',
    `${await p.aspetta(`!document.querySelector('dialog[open]') && !document.querySelector('[data-movimento="${E.M_ENEL}"]')`)}|${(await api(`/movimenti/${E.M_ENEL}`)).stato}`);

  console.log('=== C5. scorrimento: Elimina annullabile, Studio ===');
  eq('scorrendo a sinistra compaiono Studio ed Elimina', 'true', await scorri(E.M_BIANCHI));
  await foto('scorri');
  await p.clic(`[data-movimento="${E.M_BIANCHI}"] [data-scorri-elimina]`);
  eq('Elimina: riga nascosta, avviso con Annulla', 'true', await p.aspetta(`!document.querySelector('[data-movimento="${E.M_BIANCHI}"]') && document.querySelector('[data-annulla]')`));
  await p.clic('[data-annulla]');
  eq('Annulla: la riga torna', 'true', await p.aspetta(`document.querySelector('[data-movimento="${E.M_BIANCHI}"]')`));
  await attendi(6000);
  eq('dopo 6 s il movimento esiste ancora', 200, (await api(`/movimenti/${E.M_BIANCHI}`)).stato);
  await scorri(E.M_BIANCHI);
  await p.clic(`[data-movimento="${E.M_BIANCHI}"] [data-scorri-elimina]`);
  eq('prima dei 5 s: ancora sul server', 200, (await api(`/movimenti/${E.M_BIANCHI}`)).stato);
  await attendi(6500);
  eq('dopo 5 s: eliminato (404), avviso sparito', '404|0', `${(await api(`/movimenti/${E.M_BIANCHI}`)).stato}|${await n('[data-annulla]')}`);
  eq('scorrendo il Bar', 'true', await scorri(E.M_BAR));
  await p.clic(`[data-movimento="${E.M_BAR}"] [data-scorri-studio]`);
  eq('Studio: scheda «Chiedi allo studio»', 'true', await p.aspetta("document.querySelector('dialog[open] [data-chiedi-studio] textarea')"));
  await scriviArea('[data-chiedi-studio] textarea', 'Ecco lo scontrino');
  await p.clic('[data-chiedi-studio] button[type=submit]');
  eq('inviato', 'true', await p.aspetta("document.querySelector('[data-inviato]')"));
  await p.clic('dialog[open] [aria-label=Chiudi]');

  console.log('=== C6. Report ===');
  await p.vai(E.WEB + '/report');
  eq('12 mesi, il primo e\' quello corrente', `12|${E.CUR}`, (await p.aspetta("document.querySelectorAll('[data-mese]').length === 12"))
    && `12|${await attr('[data-mese]', 'data-mese')}`);
  const mesi = (await api(`/reports/mesi?fino=${E.CUR}&mesi=12`)).corpo.mesi;
  const centesimi = v => Math.round(Number(v) * 100);
  eq('ogni scheda: netto del server', mesi.map(m => centesimi(m.entrate) - centesimi(m.uscite)).join(','),
    await p.valuta("[...document.querySelectorAll('[data-mese]')].map(e => e.dataset.netto).join(',')"));
  await stretto('Report');
  await foto('report');
  await p.clic(`[data-mese="${E.CUR}"]`);
  eq('tocco: il mese, stesso netto', await attr(`[data-mese="${E.CUR}"]`, 'data-netto') ?? String(centesimi(mesi[0].entrate) - centesimi(mesi[0].uscite)),
    (await p.aspetta("document.querySelector('[data-netto-mese]')")) && await attr('[data-netto-mese]', 'data-netto-mese'));
  eq('Escono: Senza categoria (il Bar) e Software', '1|1', `${await n('[data-voce="Senza categoria"]')}|${await n('[data-voce="Software"]')}`);
  await stretto('Report del mese');
  await foto('report-mese');
  await p.vai(E.WEB + '/report/2026-13');
  eq('mese non valido: torna al report', 'true', await p.aspetta("location.pathname === '/report'"));

  console.log('=== C7. Studio e chat ===');
  await p.vai(E.WEB + '/studio');
  eq('Studio: 1 da chiarire, ambito come giorno', 'true', await p.aspetta("document.querySelector('[data-tessera=chiarire] .importo')?.textContent === '1' && document.querySelector('[data-ambito]')?.textContent.includes('gen 2025')"));
  await stretto('Studio');
  await foto('studio');
  await p.clic('[data-apri-chat]');
  eq('chat: fascia con 1 da chiarire (il Bar, 6,50)', 'true', await p.aspetta(`document.querySelector('[data-fascia-chiarire="1"]')?.textContent.includes('6,50')`));
  await scriviArea('textarea[name=messaggio]', 'Grazie, a presto');
  await p.clic('[data-invia]');
  eq('messaggio nella chat', 'true', await p.aspetta("[...document.querySelectorAll('[data-messaggio]')].some(e => e.textContent.includes('Grazie, a presto'))"));
  await stretto('Chat');
  await foto('chat');
  await p.clic('[data-risolvi]');
  eq('Chiarito: fascia sparita', 'true', await p.aspetta("!document.querySelector('[data-fascia-chiarire]')"));
  eq('il Bar non e\' piu\' da chiarire', 'false', String((await api(`/movimenti/${E.M_BAR}`)).corpo.da_chiarire));

  console.log('=== C8. Estratto: tocco sulla riga ===');
  await p.vai(E.WEB + '/');
  await p.aspetta('document.querySelector("[data-estratto] [data-movimento]")');
  await p.clic('[data-estratto] [data-movimento]');
  eq('scheda del movimento dall\'Estratto', 'true', await p.aspetta("document.querySelector('dialog[open] [data-dettaglio]')"));
  eq('zero violazioni CSP', 0, p.violazioni.length);
  if (p.violazioni.length) console.log(p.violazioni.slice(0, 5));
} catch (e) {
  fail++; console.log(`  FAIL  eccezione nel browser\n         ${e.message}`);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
