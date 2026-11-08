// Parte nel browser dello smoke U3 (scripts/smoke/u3-web.sh): login dei due
// tipi di account, token separati, tema dall'account, cambio di tema salvato,
// sessione scaduta, niente scroll orizzontale a 390 px, zero violazioni CSP.
// Argomenti via ambiente: WEB, CHROME, PROFILO, FOTO, UTENTE, STUDIO, PW.
import { avvia } from './cdp.mjs';

const { WEB, CHROME, PROFILO, FOTO, UTENTE, STUDIO, PW } = process.env;
let pass = 0, fail = 0;
const eq = (nome, atteso, ottenuto) => {
  if (String(atteso) === String(ottenuto)) { pass++; console.log(`  OK    ${nome}`); }
  else { fail++; console.log(`  FAIL  ${nome}\n         atteso=${atteso} ottenuto=${ottenuto}`); }
};

const b = await avvia({ chrome: CHROME, profilo: PROFILO });
try {
  const p = await b.pagina();
  await p.schermo(390, 844);
  await p.schemaColori(false);
  const tema = () => p.valuta("document.documentElement.dataset.tema + '/' + document.documentElement.dataset.aspetto");
  const ls = k => p.valuta(`localStorage.getItem(${JSON.stringify(k)})`);
  const larghezza = () => p.valuta('document.documentElement.scrollWidth');
  const api = (percorso, metodo = 'GET', corpo) => p.valuta(`fetch('/api${percorso}', { method: '${metodo}',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem(localStorage.getItem('user_type') === 'commercialista' ? 'commercialista_token' : 'token')) },
    body: ${corpo ? JSON.stringify(JSON.stringify(corpo)) : 'undefined'} }).then(r => r.json())`);
  async function accedi(percorso, username, password) {
    await p.vai(WEB + percorso);
    await p.aspetta("document.querySelector('input[name=username]')");
    await p.scrivi('input[name=username]', username);
    await p.scrivi('input[name=password]', password);
    await p.clic('button[type=submit]');
  }

  console.log('=== A. utente ===');
  await p.vai(WEB + '/');
  eq('senza sessione / porta a /accedi', '/accedi', await p.aspetta("location.pathname === '/accedi'") && await p.valuta('location.pathname'));
  eq('primo disegno: predefiniti registro/automatico', 'registro/automatico', await tema());
  await p.foto(`${FOTO}/accedi-registro-chiaro.png`);
  await accedi('/accedi', UTENTE, 'sbagliata-123');
  eq('password sbagliata: messaggio, resta su /accedi', 'Credenziali non valide|/accedi',
    (await p.aspetta("document.querySelector('[role=alert]')")) && (await p.valuta("document.querySelector('[role=alert]').textContent + '|' + location.pathname")));
  await accedi('/accedi', UTENTE, PW);
  eq('login: shell dell\'utente', 'user', await p.aspetta("document.querySelector('[data-shell]')") && await p.valuta("document.querySelector('[data-shell]').dataset.shell"));
  eq('token utente salvato, nessun token di studio', 'si|null|user', `${(await ls('token')) ? 'si' : 'no'}|${await ls('commercialista_token')}|${await ls('user_type')}`);
  eq('tema dall\'account (bottega/scuro impostato via API prima)', 'bottega/scuro', await tema());
  eq('390 px: nessuno scroll orizzontale (Registro)', '390', await larghezza());
  eq('barra in basso con il + al centro', 'Prima nota,Conti,Nuovo movimento,Report,Studio',
    await p.valuta("[...document.querySelector('nav[aria-label=Navigazione]').children].map(e => e.getAttribute('aria-label') || e.textContent).join(',')"));

  // Foto: i quattro temi sull'Estratto a 390 px.
  for (const [t, a] of [['registro', 'chiaro'], ['registro', 'scuro'], ['bottega', 'chiaro'], ['bottega', 'scuro']]) {
    await p.valuta(`(document.documentElement.dataset.tema='${t}', document.documentElement.dataset.aspetto='${a}', true)`);
    await p.foto(`${FOTO}/registro-${t}-${a}.png`);
  }

  console.log('=== B. impostazioni: tema e aspetto sull\'account ===');
  await p.vai(WEB + '/impostazioni');
  await p.aspetta("document.querySelector('[data-valore=registro]')");
  eq('pulsanti sullo stato salvato', 'bottega|scuro',
    await p.valuta("[...document.querySelectorAll('[aria-pressed=true]')].map(e => e.dataset.valore).filter(v => !['due_righe', 'colonne', 'iniziali', 'mastro', 'normale', 'grande', 'molto_grande'].includes(v)).join('|')"));
  await p.clic('[data-valore=registro]');
  await p.aspetta("document.documentElement.dataset.tema === 'registro' && !document.querySelector('button[disabled]')");
  await p.clic('[data-valore=chiaro]');
  await p.aspetta("document.documentElement.dataset.aspetto === 'chiaro' && !document.querySelector('button[disabled]')");
  eq('scelta applicata alla pagina', 'registro/chiaro', await tema());
  const srv = await api('/auth/preferenze');
  eq('scelta salvata sull\'account (GET /auth/preferenze)', 'registro/chiaro', `${srv.tema}/${srv.aspetto}`);
  eq('copia locale aggiornata', 'registro/chiaro', JSON.parse(await ls('pn_preferenze')).tema + '/' + JSON.parse(await ls('pn_preferenze')).aspetto);
  eq('390 px: nessuno scroll orizzontale (Impostazioni)', '390', await larghezza());
  await p.foto(`${FOTO}/impostazioni-registro-chiaro.png`);
  await p.clic('[data-valore=automatico]');
  await p.aspetta("document.documentElement.dataset.aspetto === 'automatico' && !document.querySelector('button[disabled]')");
  await p.schemaColori(true);
  eq('automatico segue il sistema (scuro): fondo scuro', 'rgb(14, 20, 36)', await p.valuta('getComputedStyle(document.body).backgroundColor'));
  await p.schemaColori(false);
  eq('automatico segue il sistema (chiaro): fondo chiaro', 'rgb(247, 245, 239)', await p.valuta('getComputedStyle(document.body).backgroundColor'));

  // Un altro dispositivo con una copia locale diversa: vince l'account.
  await api('/auth/preferenze', 'PUT', { tema: 'bottega', aspetto: 'scuro' });
  await p.valuta(`(localStorage.setItem('pn_preferenze', JSON.stringify({ tema: 'registro', aspetto: 'chiaro' })), true)`);
  await p.vai(WEB + '/');
  await p.aspetta("document.querySelector('[data-shell]')");
  eq('ricarica: vince l\'account sulla copia locale', 'bottega/scuro', (await p.aspetta("document.documentElement.dataset.tema === 'bottega'")) && await tema());

  console.log('=== C. separazione utente / studio ===');
  await p.vai(WEB + '/studio/clienti');
  eq('utente su una pagina dello studio: torna alla sua home', '/', (await p.aspetta("location.pathname === '/'")) && await p.valuta('location.pathname'));
  await p.vai(WEB + '/impostazioni');
  await p.aspetta("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Esci'))");
  await p.valuta("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Esci')).click(), true");
  eq('esci: /accedi, token tolto', '/accedi|null', (await p.aspetta("location.pathname === '/accedi'")) && `${await p.valuta('location.pathname')}|${await ls('token')}`);
  await accedi('/studio/accedi', STUDIO, PW);
  eq('login dello studio: shell dello studio', 'commercialista|/studio/da-fare',
    (await p.aspetta("document.querySelector('[data-shell=commercialista]')")) && `${await p.valuta("document.querySelector('[data-shell]').dataset.shell")}|${await p.valuta('location.pathname')}`);
  eq('token di studio salvato, nessun token utente', 'si|null|commercialista', `${(await ls('commercialista_token')) ? 'si' : 'no'}|${await ls('token')}|${await ls('user_type')}`);
  eq('tema dello studio dal suo account (registro/automatico)', 'registro/automatico', await tema());
  eq('studio senza il + (niente nuovo movimento)', '0', await p.valuta("document.querySelectorAll('[aria-label=\"Nuovo movimento\"]').length"));
  eq('390 px: nessuno scroll orizzontale (studio)', '390', await larghezza());
  await p.foto(`${FOTO}/studio-registro-automatico.png`);
  await p.vai(WEB + '/movimenti');
  eq('studio su una pagina dell\'utente: torna alla sua home', '/studio/da-fare', (await p.aspetta("location.pathname === '/studio/da-fare'")) && await p.valuta('location.pathname'));

  console.log('=== D. sessione scaduta ===');
  await p.valuta("(localStorage.setItem('commercialista_token', 'non-valido'), true)");
  await p.vai(WEB + '/studio/clienti');
  eq('token rifiutato: login dello studio, token tolto', '/studio/accedi|null',
    (await p.aspetta("location.pathname === '/studio/accedi'")) && `${await p.valuta('location.pathname')}|${await ls('commercialista_token')}`);

  console.log('=== E. desktop ===');
  await accedi('/accedi', UTENTE, PW);
  await p.aspetta("document.querySelector('[data-shell=user]')");
  await p.schermo(1280, 800, 1, false);
  await p.vai(WEB + '/');
  await p.aspetta("document.querySelector('[data-shell=user]')");
  eq('desktop: colonna laterale visibile, barra in basso nascosta', 'flex|none',
    await p.valuta("getComputedStyle(document.querySelector('aside')).display + '|' + getComputedStyle(document.querySelector('nav[aria-label=Navigazione]')).display"));
  await p.foto(`${FOTO}/estratto-desktop-bottega-scuro.png`);

  console.log('=== F. CSP ===');
  eq('nessuna violazione della CSP in tutto il giro', '', p.violazioni.join(' ; '));
} catch (e) {
  fail++; console.log(`  FAIL  eccezione nel browser\n         ${e.message}`);
} finally {
  b.chiudi();
}
console.log(`CONTEGGIO ${pass} ${fail}`);
