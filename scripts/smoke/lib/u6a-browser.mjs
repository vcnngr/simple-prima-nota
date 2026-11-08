// Parte nel browser dello smoke U6a (scripts/smoke/u6a-registro.sh): richiesta
// dello studio in 3 passi, permessi, 📎 e Documenti, «+ Crea», modifica della
// controparte, conti come carte e pagina del conto.
// Ambiente: WEB, CHROME, PROFILO, FOTO, UTENTE, PW, OGGI, PDF, PDF_BYTE, COLL, C1, CC, ENEL.
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
  const api = percorso => p.valuta(`fetch('/api${percorso}', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
    .then(async r => ({ stato: r.status, corpo: await r.json().catch(() => null) }))`);
  const n = sel => p.valuta(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const attr = (sel, a) => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(a)}) ?? null`);
  const testo = sel => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const coll = async () => (await api('/utenti/collegamenti')).corpo.collegamenti.find(c => c.id === Number(E.COLL));
  const foto = async nome => {
    for (const [t, a] of [['registro', 'chiaro'], ['bottega', 'scuro']]) {
      await p.valuta(`(document.documentElement.dataset.tema='${t}', document.documentElement.dataset.aspetto='${a}', true)`);
      await p.foto(`${E.FOTO}/${nome}-${t}-${a}.png`);
    }
    await p.valuta("(document.documentElement.dataset.tema='registro', document.documentElement.dataset.aspetto='chiaro', true)");
  };
  const stretto = async nome => eq(`${nome}: 390 px senza scroll orizzontale`, 390, await larghezza());

  console.log('=== D1. richiesta dello studio in 3 passi ===');
  await p.vai(E.WEB + '/accedi');
  await p.aspetta("document.querySelector('input[name=username]')");
  await p.scrivi('input[name=username]', E.UTENTE);
  await p.scrivi('input[name=password]', E.PW);
  await p.clic('button[type=submit]');
  await p.aspetta("document.querySelector('[data-estratto]')");
  await p.vai(E.WEB + '/studio');
  eq('Studio: la richiesta in cima', 'true', await p.aspetta(`document.querySelector('[data-richiesta="${E.COLL}"]')`));
  await stretto('Studio con richiesta');
  await p.clic(`[data-rispondi="${E.COLL}"]`);
  eq('passo 1: chi è, col nome dello studio', 'true', await p.aspetta("document.querySelector('dialog[open] [data-passo-chi]')?.textContent.includes('Studio Verdi')"));
  await foto('richiesta-1');
  await p.clic('dialog[open] [data-avanti]');
  eq('passo 2: cosa vede', 'true', await p.aspetta("document.querySelector('dialog[open] [data-ambito-editor]')"));
  await p.clic('dialog[open] input[name=tutti_i_conti]');
  eq('senza conti scelti non si va avanti', 'true', await p.aspetta("document.querySelector('dialog[open] [data-avanti]').disabled"));
  await p.clic(`dialog[open] [data-conto-ammesso="${E.C1}"]`);
  await p.scrivi('dialog[open] input[name=ambito_dal]', '2026-01-01');
  await p.scrivi('dialog[open] input[name=ambito_al]', '2025-12-01');
  eq('fine prima dell\'inizio: fermo', 'true', await p.aspetta("document.querySelector('dialog[open] [data-avanti]').disabled"));
  await p.scrivi('dialog[open] input[name=ambito_al]', '');
  await foto('richiesta-2');
  await p.clic('dialog[open] [data-avanti]');
  eq('passo 3: la frase dice conto e periodo', 'Banca Intesa, dal 1 gen 2026',
    (await p.aspetta("document.querySelector('dialog[open] [data-frase-ambito]')")) && await testo('dialog[open] [data-frase-ambito]'));
  await foto('richiesta-3');
  await p.clic('dialog[open] [data-accetta]');
  eq('accettata: il riepilogo dello studio', 'true', await p.aspetta(`document.querySelector('[data-studio="${E.COLL}"]') && !document.querySelector('dialog[open]')`));
  const c1 = await coll();
  eq('API: attiva, dal 2026-01-01, solo Banca Intesa', `attiva|2026-01-01|null|${E.C1}`, `${c1.stato}|${c1.ambito_dal}|${c1.ambito_al}|${c1.conti_ammessi}`);

  console.log('=== D2. permessi ===');
  await p.clic('[data-apri-permessi]');
  eq('permessi: cosa vede adesso', 'Banca Intesa, dal 1 gen 2026', (await p.aspetta('document.querySelector("[data-ambito-attuale]")')) && await testo('[data-ambito-attuale]'));
  eq('nessun pulsante Salva senza modifiche', 0, await n('[data-salva-ambito]'));
  await p.clic(`[data-conto-ammesso="${E.CC}"]`);
  await p.clic('[data-salva-ambito]');
  eq('salvato: Banca Intesa e Cassa', 'Banca Intesa, Cassa, dal 1 gen 2026', (await p.aspetta("document.querySelector('[data-ambito-attuale]')?.textContent.includes('Cassa')")) && await testo('[data-ambito-attuale]'));
  await stretto('Permessi');
  await foto('permessi');
  await p.clic('[data-sospendi=attiva]');
  eq('sospeso', 'sospesa', (await p.aspetta("document.querySelector('[data-permessi][data-stato=sospesa]')")) && (await coll()).stato);
  await p.vai(E.WEB + '/studio');
  eq('Studio: sospeso, niente chat', 'true|0', `${await p.aspetta("document.querySelector('[data-sospeso]')")}|${await n('[data-apri-chat]')}`);
  await p.clic('[data-riattiva]');
  eq('riattivato dallo Studio', 'true', await p.aspetta("document.querySelector('[data-apri-chat]')"));
  eq('API: di nuovo attivo, ambito intatto', `attiva|2026-01-01`, `${(await coll()).stato}|${(await coll()).ambito_dal}`);

  console.log('=== D3. 📎 e Documenti ===');
  await p.vai(E.WEB + '/chat');
  await p.aspetta("document.querySelector('[data-file]')");
  const o = await p.invia('Runtime.evaluate', { expression: "document.querySelector('[data-file]')" });
  await p.invia('DOM.setFileInputFiles', { files: [E.PDF], objectId: o.result.objectId });
  eq('il pdf compare come bolla con allegato', 'true', await p.aspetta("[...document.querySelectorAll('[data-allegato]')].some(e => e.textContent.includes('scontrino.pdf'))"));
  await stretto('Chat con allegato');
  await p.clic('[data-scheda=documenti]');
  eq('Documenti: un file', '1', (await p.aspetta("document.querySelector('[data-documenti]')?.dataset.documenti === '1'")) && await attr('[data-documenti]', 'data-documenti'));
  await p.valuta(`(() => { window.__scaricati = [];
    const crea = URL.createObjectURL.bind(URL);
    URL.createObjectURL = b => { window.__peso = b.size; return crea(b); };
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__scaricati.push(this.download + ':' + window.__peso); };
    return true; })()`);
  await p.clic('[data-documento]');
  eq('tocco sul documento: scaricato col suo nome, byte giusti', `scontrino.pdf:${E.PDF_BYTE}`,
    (await p.aspetta('window.__scaricati.length > 0')) && await p.valuta('window.__scaricati[0]'));
  await stretto('Documenti');
  await foto('documenti');

  console.log('=== D4. «+ Crea» mentre si registra ===');
  await p.vai(E.WEB + '/nuovo');
  await p.aspetta("document.querySelector('input[name=cerca-controparte]')");
  await p.scrivi('input[name=cerca-controparte]', 'Enel Energia');
  await attendi(600);
  eq('nome che esiste: niente «+ Crea»', 0, (await p.aspetta('document.querySelector("[data-risultati=pronti] [data-controparte]")')) && await n('[data-crea-controparte]'));
  await p.scrivi('input[name=cerca-controparte]', '  Bar   Roma ');
  eq('nome nuovo: «+ Crea «Bar Roma»»', 'Bar Roma', (await p.aspetta('document.querySelector("[data-crea-controparte]")')) && await attr('[data-crea-controparte]', 'data-crea-controparte'));
  await foto('crea');
  await p.clic('[data-crea-controparte]');
  eq('creata: si passa all\'importo con Bar Roma', 'Bar Roma', (await p.aspetta("document.querySelector('[data-modulo=nuovo]')")) && (await testo('[data-cambia-controparte]')).trim());
  for (const t of ['3', ',', '2']) await p.clic(`[data-tasto="${t}"]`);
  await p.clic('[data-registra]');
  eq('registrato', 'true', await p.aspetta("!document.querySelector('[data-modulo=nuovo]')"));

  console.log('=== D5. modifica della controparte ===');
  await p.vai(E.WEB + `/controparti/${E.ENEL}`);
  await p.aspetta('document.querySelector("[data-modifica-controparte]")');
  await p.clic('[data-modifica-controparte]');
  eq('pannello breve aperto, nome compilato', 'Enel Energia', (await p.aspetta("document.querySelector('dialog[open] input[name=nome]')")) && await p.valuta("document.querySelector('dialog[open] input[name=nome]').value"));
  eq('P.IVA nascosta dietro la riga', 0, await n('dialog[open] input[name=piva]'));
  await p.scrivi('dialog[open] input[name=categoria]', 'Luce e gas');
  await p.clic('dialog[open] [data-altri-dati]');
  eq('P.IVA visibile, compilata', '00934061003', (await p.aspetta("document.querySelector('dialog[open] input[name=piva]')")) && await p.valuta("document.querySelector('dialog[open] input[name=piva]').value"));
  await stretto('Pannello controparte');
  await foto('pannello-controparte');
  await p.clic('[data-salva-controparte]');
  eq('salvata: la scheda dice la categoria', 'true', await p.aspetta("!document.querySelector('dialog[open]') && document.querySelector('[data-scheda-controparte]').textContent.includes('Luce e gas')"));
  await p.clic('[data-modifica-controparte]');
  await p.aspetta("document.querySelector('dialog[open] [data-elimina-controparte]')");
  await p.clic('dialog[open] [data-elimina-controparte]');
  await p.clic('dialog[open] [data-elimina-controparte=conferma]');
  eq('Elimina con movimenti: il server spiega, resta', 'true', await p.aspetta("document.querySelector('dialog[open] [role=alert]')?.textContent.includes('movimenti')"));
  await p.clic('dialog[open] [data-attiva-controparte]');
  eq('disattivata', 'true', await p.aspetta("!document.querySelector('dialog[open]') && document.querySelector('[data-scheda-controparte]').textContent.includes('disattivata')"));

  console.log('=== D6. conti come carte, pagina del conto ===');
  await p.vai(E.WEB + '/conti');
  eq('due carte, prima Banca Intesa', `2|${E.C1}`, (await p.aspetta('document.querySelector("[data-carta-conto]")'))
    && `${await n('[data-carta-conto]')}|${await attr('[data-movimenti-di]', 'data-movimenti-di')}`);
  await stretto('Conti');
  await foto('conti');
  await p.valuta(`(() => { const n = document.querySelector('[data-nastro]'); n.scrollTo({ left: n.children[1].offsetLeft - 16 }); n.dispatchEvent(new Event('scroll')); return true; })()`);
  eq('sfogliata: sotto i movimenti della Cassa', E.CC, (await p.aspetta(`document.querySelector('[data-movimenti-di="${E.CC}"]')`)) && await attr('[data-movimenti-di]', 'data-movimenti-di'));
  await p.clic('[data-nuovo-conto]');
  await p.aspetta('document.querySelector("[data-modulo-conto=nuovo]")');
  await p.scrivi('input[name=nome_banca]', 'Carta prepagata');
  await p.scrivi('input[name=intestatario]', 'U6');
  await p.scrivi('input[name=saldo_iniziale]', '1,2,3');
  eq('saldo illeggibile: Salva fermo', 'true', await p.aspetta('document.querySelector("[data-salva-conto]").disabled'));
  await p.scrivi('input[name=saldo_iniziale]', '-12,30');
  await stretto('Nuovo conto');
  await p.clic('[data-salva-conto]');
  eq('creato: tre carte', '3', (await p.aspetta('document.querySelectorAll("[data-carta-conto]").length === 3')) && await n('[data-carta-conto]'));
  const nuovo = (await api('/conti-bancari')).corpo.find(c => c.nome_banca === 'Carta prepagata');
  console.log(`  nuovo conto: ${nuovo?.saldo_iniziale}`);
  await p.clic(`[data-modifica-conto="${nuovo.id}"]`);
  await p.aspetta(`document.querySelector('[data-modulo-conto="${nuovo.id}"]')`);
  eq('in modifica il saldo si legge -12,30', '-12,30', await p.valuta("document.querySelector('input[name=saldo_iniziale]').value"));
  await p.clic('[data-elimina-conto]');
  await p.clic('[data-elimina-conto=conferma]');
  eq('conto senza movimenti eliminato', 'true', await p.aspetta('location.pathname === "/conti" && document.querySelectorAll("[data-carta-conto]").length === 2'));
  await p.clic(`[data-modifica-conto="${E.C1}"]`);
  await p.aspetta(`document.querySelector('[data-modulo-conto="${E.C1}"]')`);
  eq('saldo iniziale come numero italiano', '1000,00', await p.valuta("document.querySelector('input[name=saldo_iniziale]').value"));
  await p.scrivi('input[name=saldo_iniziale]', '1.250,00');
  eq('avviso: cambiano tutti i saldi', 'true', await p.aspetta("document.querySelector('[data-avviso-saldo]')?.textContent.includes('1.250,00')"));
  await foto('conto');
  await p.clic('[data-salva-conto]');
  await p.aspetta('location.pathname === "/conti"');
  const intesa = (await api("/conti-bancari")).corpo.find(c => c.id === Number(E.C1));
  const atteso = Math.round(Number(intesa.saldo_corrente) * 100);
  eq('salvato: saldo iniziale 1250.00, la carta mostra il saldo del server', `1250.00|${atteso}`,
    (await p.aspetta(`document.querySelector('[data-carta-conto="${E.C1}"] [data-saldo-carta]')?.dataset.saldoCarta === '${atteso}'`))
    && `${intesa.saldo_iniziale}|${await attr(`[data-carta-conto="${E.C1}"] [data-saldo-carta]`, 'data-saldo-carta')}`);
  await p.clic(`[data-modifica-conto="${E.C1}"]`);
  await p.aspetta('document.querySelector("[data-elimina-conto]")');
  await p.clic('[data-elimina-conto]');
  await p.clic('[data-elimina-conto=conferma]');
  eq('conto con movimenti: il server spiega, resta', 'true', await p.aspetta("document.querySelector('[role=alert]')?.textContent.includes('movimenti')"));

  console.log('=== D7. accessi rapidi ===');
  await p.vai(E.WEB + '/impostazioni');
  eq('Impostazioni: Conti, Controparti, Studio (+ Categorie, Import ed export da U6b)', 5, (await p.aspetta('document.querySelector("nav[aria-label=Registro]")')) && await n('nav[aria-label=Registro] a'));
  await p.vai(E.WEB + '/');
  eq('Registro: i conti nella fascia, «Conti» nella barra', 'true',
    await p.aspetta("document.querySelector('[data-fascia] [data-carta-conto]') && document.querySelector('nav[aria-label=Navigazione] a[href=\"/conti\"]')"));
  eq('zero violazioni CSP', 0, p.violazioni.length);
  if (p.violazioni.length) console.log(p.violazioni.slice(0, 5));
} catch (e) {
  fail++; console.log(`  FAIL  eccezione nel browser\n         ${e.message}`);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
