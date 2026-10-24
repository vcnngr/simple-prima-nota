// Parte nel browser dello smoke U6c (scripts/smoke/u6c-studio.sh): portale dello
// studio. Da fare, clienti, scheda del cliente, movimenti in sola lettura con
// «Chiedi un chiarimento», export, chat, accessi; 390 px e CSP.
// Ambiente: WEB, CHROME, PROFILO, FOTO, STUDIO, PW, CLIENTE (id), NOME (username),
// CODICE (codice d'invito di un altro cliente), CHIUDI (id del cliente da scollegare). D7-D8: U6d.
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
  await p.schermo(390, 844);
  await p.schemaColori(false);
  const larghezza = () => p.valuta('document.documentElement.scrollWidth');
  const n = sel => p.valuta(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const attr = (sel, a) => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(a)}) ?? null`);
  const testo = sel => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const foto = async nome => {
    for (const [t, a] of [['registro', 'chiaro'], ['bottega', 'scuro']]) {
      await p.valuta(`(document.documentElement.dataset.tema='${t}', document.documentElement.dataset.aspetto='${a}', true)`);
      await p.foto(`${E.FOTO}/${nome}-${t}-${a}.png`);
    }
    await p.valuta("(document.documentElement.dataset.tema='registro', document.documentElement.dataset.aspetto='chiaro', true)");
  };
  const stretto = async nome => eq(`${nome}: 390 px senza scroll orizzontale`, 390, await larghezza());
  const C = `/studio/clienti/${E.CLIENTE}`;

  console.log('=== D1. Da fare ===');
  await p.vai(E.WEB + '/studio/accedi');
  await p.aspetta("document.querySelector('input[name=username]')");
  await p.scrivi('input[name=username]', E.STUDIO);
  await p.scrivi('input[name=password]', E.PW);
  await p.clic('button[type=submit]');
  eq('login dello studio: home «Da fare»', '/studio/da-fare', (await p.aspetta("location.pathname === '/studio/da-fare'")) && await p.valuta('location.pathname'));
  eq('barra: Da fare, Clienti, Chat, Impostazioni', 'Da fare|Clienti|Chat|Impostazioni',
    await p.valuta("[...new Set([...document.querySelectorAll('[data-shell] nav a')].map(a => a.textContent.trim()))].join('|')"));
  eq('da fare: 1 da rivedere, 2 in attesa, 1 cliente con messaggi', '1|2|1',
    (await p.aspetta("document.querySelector('[data-da-fare]')?.dataset.daFare === '4'"))
    && `${await n('[data-voce=rivedere]')}|${await n('[data-voce=attesa]')}|${await n('[data-voce=messaggi]')}`);
  eq('movimento citato con importo', 'true', await p.valuta("[...document.querySelectorAll('[data-movimento-citato]')].some(e => e.textContent.includes('100,50'))"));
  await p.clic('[data-filtro=attesa]');
  eq('filtro «In attesa»: solo quelli', '2|0', `${await n('[data-voce=attesa]')}|${await n('[data-voce=rivedere]')}`);
  await p.clic('[data-filtro=tutto]');
  await stretto('Da fare');
  await foto('da-fare');

  console.log('=== D2. clienti e scheda ===');
  await p.vai(E.WEB + '/studio/clienti');
  eq('clienti: U attivo, W in attesa in grigio', 'true|true',
    `${await p.aspetta(`document.querySelector('[data-cliente="${E.CLIENTE}"][data-stato=attiva]')`)}|${await p.aspetta('document.querySelector("[data-richiesta]")')}`);
  eq('non letti accanto al cliente', '2', await attr(`[data-cliente="${E.CLIENTE}"] [data-non-letti]`, 'data-non-letti'));
  await p.scrivi('input[name=cerca]', 'nessuno-cosi');
  eq('cerca: nessuno', '0', await p.valuta("document.querySelectorAll('[data-cliente]').length"));
  await p.scrivi('input[name=cerca]', '');
  await stretto('Clienti');
  await foto('clienti');
  await p.clic(`[data-cliente="${E.CLIENTE}"] a`);
  eq('scheda del cliente: da chiarire e non letti', '3|2',
    (await p.aspetta("document.querySelector('[data-tessera=chiarire]')")) && `${(await testo('[data-tessera=chiarire] p')).trim()}|${(await testo('[data-tessera=non-letti] p')).trim()}`);
  for (let i = 0; i < 24 && (await attr('[data-mese]', 'data-mese')) !== '2026-03'; i++) {
    const prima = await attr('[data-mese]', 'data-mese');
    await p.clic(prima > '2026-03' ? '[data-mese-prima]' : '[data-mese-dopo]');
    await p.aspetta(`(document.querySelector('[data-mese]')?.dataset.mese ?? '${prima}') !== '${prima}'`);
  }
  eq('marzo 2026: entrate e uscite che lo studio vede', '100.50|20.25|100,50|20,25',
    `${await attr('[data-entrate]', 'data-entrate')}|${await attr('[data-uscite]', 'data-uscite')}|${(await testo('[data-entrate]')).trim()}|${(await testo('[data-uscite]')).trim()}`);
  eq('voci della scheda', 'movimenti|report|chat|accessi', await p.valuta("[...document.querySelectorAll('[data-voce-cliente]')].map(a => a.dataset.voceCliente).join('|')"));
  await stretto('Scheda del cliente');
  await foto('scheda-cliente');

  console.log('=== D3. movimenti in sola lettura ===');
  await p.vai(E.WEB + C + '/movimenti');
  eq('movimenti: 3 dentro l\'ambito', '3|3', (await p.aspetta("document.querySelector('[data-movimenti-cliente]')?.dataset.movimentiCliente === '3'")) && `3|${await n('[data-movimento]')}`);
  eq('nessun movimento fuori ambito', 'false', await p.valuta("document.body.textContent.includes('Fuori conto') || document.body.textContent.includes('Fuori periodo')"));
  eq('niente modifica ne\' eliminazione', '0', await p.valuta("document.querySelectorAll('[data-scorri-elimina], [data-elimina], [data-modifica]').length"));
  await p.valuta("([...document.querySelectorAll('[data-movimento] button')].find(b => b.textContent.includes('Aprile')).click(), true)");
  eq('tocco: «Chiedi un chiarimento»', 'true', await p.aspetta("document.querySelector('dialog[open] [data-chiedi-chiarimento]')"));
  await p.scrivi('dialog[open] textarea[name=messaggio]', 'Che entrata è ad aprile?');
  await foto('chiedi-chiarimento');
  await p.clic('dialog[open] button[type=submit]');
  eq('chiarimento mandato: la finestra si chiude', 'true', await p.aspetta("!document.querySelector('dialog[open]')"));
  await stretto('Movimenti del cliente');

  console.log('=== D4. report ed export ===');
  await p.vai(E.WEB + C + '/report');
  await p.aspetta("document.querySelector('[data-periodo=anno]')");
  await p.clic('[data-periodo=anno]');
  eq('anno: dal 1 gennaio al 31 dicembre', 'true', await p.valuta("/^\\d{4}-01-01\\|\\d{4}-12-31$/.test(document.querySelector('[data-periodo-scelto]').dataset.periodoScelto)"));
  await p.clic('[data-periodo=scelto]');
  await p.scrivi('input[name=dal]', '2026-03-31');
  await p.scrivi('input[name=al]', '2026-03-01');
  eq('date invertite: export fermo', 'true', await p.aspetta("document.querySelector('[data-esporta=csv]').disabled"));
  await p.scrivi('input[name=dal]', '2026-03-01');
  await p.scrivi('input[name=al]', '2026-03-31');
  eq('marzo scelto a mano', '2026-03-01|2026-03-31', await attr('[data-periodo-scelto]', 'data-periodo-scelto'));
  await p.clic('[data-esporta=csv]');
  eq('export CSV di marzo: scaricato', 'true', await p.aspetta("document.querySelector('[data-esportato]')", 15000));
  await stretto('Report ed export');
  await foto('report-cliente');

  console.log('=== D5. chat ===');
  await p.vai(E.WEB + '/studio/messaggi');
  eq('Chat: il cliente attivo', 'true', await p.aspetta(`document.querySelector('[data-chat-con="${E.CLIENTE}"]')`));
  await p.clic(`[data-chat-con="${E.CLIENTE}"]`);
  eq('chat del cliente: fascia dei chiarimenti (4 aperti)', '4', (await p.aspetta("document.querySelector('[data-fascia-chiarire]')?.dataset.fasciaChiarire === '4'")) && await attr('[data-fascia-chiarire]', 'data-fascia-chiarire'));
  eq('i messaggi dello studio a destra', 'true', await p.valuta("[...document.querySelectorAll('[data-messaggio]')].some(e => e.className.includes('ml-auto') && e.textContent.includes('documenti di febbraio'))"));
  await p.scrivi('textarea[name=messaggio]', 'Grazie, guardo domani.');
  await p.clic('[data-invia]');
  eq('messaggio mandato', 'true', await p.aspetta("[...document.querySelectorAll('[data-messaggio]')].some(e => e.textContent.includes('guardo domani'))"));
  const primo = await p.valuta("[...document.querySelectorAll('[data-chiarimento]')].find(e => e.textContent.includes('E questo bar?')).dataset.chiarimento");
  await p.clic(`[data-risolvi="${primo}"]`);
  eq('«Chiarito»: 3 aperti', 'true', await p.aspetta("document.querySelector('[data-fascia-chiarire]')?.dataset.fasciaChiarire === '3'"));
  await stretto('Chat dello studio');
  await foto('chat-studio');
  await p.clic('[data-scheda=documenti]');
  eq('Documenti: nessuno', '0', (await p.aspetta("document.querySelector('[data-documenti]')?.dataset.documenti === '0'")) && '0');

  console.log('=== D6. accessi ===');
  await p.vai(E.WEB + C + '/accessi');
  eq('accessi: l\'export di marzo con le sue righe', 'true', await p.aspetta("[...document.querySelectorAll('[data-accesso=export]')].some(e => /2 righe/.test(e.textContent))"));
  await stretto('Accessi');
  await p.vai(E.WEB + '/studio/clienti/987654321');
  eq('cliente non collegato: errore, nessun dato', 'true', await p.aspetta("document.querySelector('[role=alert]')"));
  await p.vai(E.WEB + '/studio/clienti/abc');
  eq('id non valido: cliente non trovato', 'true', await p.aspetta("document.querySelector('[data-cliente-assente]')"));

  console.log('=== D7. codice d\'invito (U6d) ===');
  await p.vai(E.WEB + '/studio/clienti');
  await p.aspetta("document.querySelector('[data-codice-invito] input[name=codice]')");
  await p.scrivi('[data-codice-invito] input[name=codice]', 'abc123');
  eq('codice incompleto: «Usa il codice» spento', 'true', await p.valuta("document.querySelector('[data-codice-invito] button[type=submit]').disabled"));
  await p.scrivi('[data-codice-invito] input[name=codice]', ' ' + E.CODICE + ' ');
  eq('codice completo: acceso', 'false', await p.valuta("document.querySelector('[data-codice-invito] button[type=submit]').disabled"));
  await p.clic('[data-codice-invito] button[type=submit]');
  eq('codice usato: richiesta mandata al cliente', 'true', await p.aspetta("document.querySelector('[data-codice-esito]')?.textContent.includes('Richiesta inviata')"));
  eq('il campo si svuota', '', await p.valuta("document.querySelector('[data-codice-invito] input[name=codice]').value"));
  await p.scrivi('[data-codice-invito] input[name=codice]', E.CODICE);
  await p.clic('[data-codice-invito] button[type=submit]');
  eq('stesso codice di nuovo: errore, nessun 500', 'true', await p.aspetta("document.querySelector('[data-codice-invito] [role=alert]')"));
  await stretto('Clienti con il codice');
  await foto('codice-invito');

  console.log('=== D8. chiudi il collegamento (U6d) ===');
  await p.vai(E.WEB + `/studio/clienti/${E.CHIUDI}`);
  await p.aspetta("document.querySelector('[data-chiudi-collegamento]')");
  await p.clic('[data-chiudi-collegamento]');
  eq('conferma prima di chiudere', 'true', await p.aspetta("document.querySelector('[data-conferma-chiusura]')"));
  await p.scrivi('[data-conferma-chiusura] textarea[name=motivo]', 'Fine incarico');
  await stretto('Chiudi il collegamento');
  await foto('chiudi-collegamento');
  await p.clic('[data-conferma-chiudi]');
  eq('chiuso: torna ai clienti, il cliente non c\'e\' piu\'', '/studio/clienti|0',
    (await p.aspetta(`location.pathname === '/studio/clienti' && document.querySelector('[data-clienti]')?.dataset.clienti !== '' && !document.querySelector('[data-cliente="${E.CHIUDI}"]')`))
    && `${await p.valuta('location.pathname')}|${await n(`[data-cliente="${E.CHIUDI}"]`)}`);
  eq('zero violazioni CSP', 0, p.violazioni.length);
  if (p.violazioni.length) console.log(p.violazioni.slice(0, 5));
} catch (e) {
  fail++; console.log(`  FAIL  eccezione nel browser\n         ${e.message}`);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
