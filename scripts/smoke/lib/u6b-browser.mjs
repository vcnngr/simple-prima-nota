// Parte nel browser dello smoke U6b (scripts/smoke/u6b-account.sh): registrazione,
// password dimenticata e link della mail, conferma email, cambio password,
// codice d'invito, dati dello studio, eliminazione dell'account.
// Ambiente: WEB, CHROME, PROFILO, FOTO, MAIL_API, UTENTE, STUDIO, SFX, PW.
import { avvia } from './cdp.mjs';

const E = process.env;
let pass = 0, fail = 0;
const eq = (nome, atteso, ottenuto) => {
  if (String(atteso) === String(ottenuto)) { pass++; console.log(`  OK    ${nome}`); }
  else { fail++; console.log(`  FAIL  ${nome}\n         atteso=${atteso} ottenuto=${ottenuto}`); }
};
const attendi = ms => new Promise(r => setTimeout(r, ms));

// Token dall'ultima mail a quell'indirizzo con quell'oggetto (mailpit).
async function tokenDaMail(a, oggetto, ms = 15000) {
  for (let t = 0; t < ms; t += 500) {
    const d = await (await fetch(`${E.MAIL_API}/api/v1/messages?limit=500`)).json();
    const m = (d.messages || []).find(x => x.To?.some(y => y.Address.toLowerCase() === a.toLowerCase()) && x.Subject.includes(oggetto));
    if (m) {
      const testo = (await (await fetch(`${E.MAIL_API}/api/v1/message/${m.ID}`)).json()).Text || '';
      const r = /(https?:\/\/\S+?)#token=([0-9a-f]{64})/.exec(testo);
      if (r) return { link: r[1], token: r[2] };
    }
    await attendi(500);
  }
  return { link: null, token: null };
}

const b = await avvia({ chrome: E.CHROME, profilo: E.PROFILO });
try {
  const p = await b.pagina();
  await p.schermo(390, 844);
  await p.schemaColori(false);
  const larghezza = () => p.valuta('document.documentElement.scrollWidth');
  const api = (percorso, { metodo = 'GET', corpo, chiave = 'token' } = {}) => p.valuta(`fetch('/api${percorso}', { method: '${metodo}',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('${chiave}') }${corpo ? `, body: ${JSON.stringify(JSON.stringify(corpo))}` : ''} })
    .then(async r => ({ stato: r.status, corpo: await r.json().catch(() => null) }))`);
  const n = sel => p.valuta(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const testo = sel => p.valuta(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
  const errore = sel => p.valuta(`document.querySelector(${JSON.stringify(`${sel} [role=alert]`)})?.textContent ?? null`);
  const esito = sel => p.valuta(`document.querySelector(${JSON.stringify(`${sel} [data-esito]`)})?.textContent ?? null`);
  const invia = sel => p.valuta(`(document.querySelector(${JSON.stringify(sel)}).requestSubmit(), true)`);
  const modulo = sez => `[data-sezione="${sez}"] form`;
  const foto = async nome => {
    for (const [t, a] of [['registro', 'chiaro'], ['bottega', 'scuro']]) {
      await p.valuta(`(document.documentElement.dataset.tema='${t}', document.documentElement.dataset.aspetto='${a}', true)`);
      await p.foto(`${E.FOTO}/${nome}-${t}-${a}.png`);
    }
    await p.valuta("(document.documentElement.dataset.tema='registro', document.documentElement.dataset.aspetto='chiaro', true)");
  };
  const stretto = async nome => eq(`${nome}: 390 px senza scroll orizzontale`, 390, await larghezza());
  // Link della mail: da about:blank, perche' cambiare solo il # non ricarica la pagina.
  const link = async u => { await p.vai('about:blank'); await p.vai(u); };
  const esci = () => p.valuta('(localStorage.clear(), true)');
  const mail = `${E.UTENTE}@t.it`, nuova = `${E.UTENTE}.nuovo@t.it`;
  const PW2 = 'Nuova-Password-2', PW3 = 'Terza-Password-3';

  console.log('=== B1. registrazione dell\'utente ===');
  await p.vai(E.WEB + '/accedi');
  await p.aspetta("document.querySelector('[data-link-registrati]')");
  eq('dall\'accesso: «Crea un account» e «Password dimenticata?»', '1|1', `${await n('[data-link-registrati]')}|${await n('[data-link-dimenticata]')}`);
  await p.clic('[data-link-registrati]');
  await p.aspetta("document.querySelector('[data-registrati=user]')");
  await p.scrivi('input[name=username]', E.UTENTE);
  await p.scrivi('input[name=email]', mail);
  await p.scrivi('input[name=password]', 'corta');
  await p.scrivi('input[name=conferma]', 'corta');
  await invia('[data-registrati]');
  eq('password corta: rifiutata prima del server', 'La password deve avere almeno 8 caratteri', await errore('[data-registrati]'));
  await p.scrivi('input[name=password]', E.PW);
  await p.scrivi('input[name=conferma]', E.PW + 'x');
  await invia('[data-registrati]');
  eq('password ripetuta diversa: rifiutata', 'Le due password non coincidono', await errore('[data-registrati]'));
  await stretto('Registrazione');
  await foto('registrati');
  await p.scrivi('input[name=conferma]', E.PW);
  await invia('[data-registrati]');
  eq('registrato: dentro, nello shell dell\'utente', 'true', await p.aspetta("document.querySelector('[data-shell=user]')"));
  eq('token dell\'utente salvato, nessun token dello studio', 'true|false',
    await p.valuta("String(!!localStorage.getItem('token')) + '|' + String(!!localStorage.getItem('commercialista_token'))"));
  // Stesso username: il server rifiuta, la pagina lo dice.
  const doppio = await p.valuta(`fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '${E.UTENTE}', email: 'altro${E.SFX}@t.it', password: '${E.PW}' }) }).then(r => r.status)`);
  eq('username gia\' preso: 400', 400, doppio);

  console.log('=== B2. account: email ===');
  await p.vai(E.WEB + '/impostazioni');
  await p.aspetta("document.querySelector('[data-link-account]')");
  await p.clic('[data-link-account]');
  eq('Impostazioni → Account', 'true', await p.aspetta("document.querySelector('[data-account=user]')"));
  eq('email attuale', mail, await testo('[data-email-attuale]'));
  await p.scrivi('input[name=nuova-email]', nuova);
  await p.scrivi('input[name=password-email]', 'sbagliata');
  await invia(modulo('email'));
  eq('password sbagliata: il messaggio del server', 'true', await p.aspetta(`document.querySelector('${modulo('email')} [role=alert]')?.textContent === 'Password non corretta'`));
  await p.scrivi('input[name=password-email]', E.PW);
  await invia(modulo('email'));
  eq('cambio chiesto: vale dopo la conferma', 'true', await p.aspetta(`!!document.querySelector('${modulo('email')} [data-esito]')`));
  eq('campi svuotati', '|', `${await p.valuta("document.querySelector('input[name=nuova-email]').value")}|${await p.valuta("document.querySelector('input[name=password-email]').value")}`);
  await stretto('Account');
  await foto('account');
  const conf = await tokenDaMail(nuova, 'Conferma il nuovo indirizzo');
  eq('mail al nuovo indirizzo con il link /conferma-email', `${new URL(conf.link || 'http://x').pathname}`, '/conferma-email');
  await link(`${E.WEB}/conferma-email#token=${conf.token}`);
  eq('conferma: fatta', 'true', await p.aspetta("document.querySelector('[data-conferma=ok]')"));
  eq('il token esce dall\'indirizzo', '', await p.valuta('location.hash'));
  eq('profilo con il nuovo indirizzo', nuova, (await api('/auth/profile')).corpo.email);
  await link(`${E.WEB}/conferma-email#token=${conf.token}`);
  eq('stesso link due volte: non valido', 'true', await p.aspetta("document.querySelector('[data-conferma=errore]')?.textContent.includes('non valido')"));
  await link(`${E.WEB}/conferma-email`);
  eq('senza token: non valido, nessuna chiamata', 'true', await p.aspetta("document.querySelector('[data-conferma=errore]')"));

  console.log('=== B3. account: password ===');
  await p.vai(E.WEB + '/account');
  await p.aspetta(`document.querySelector('${modulo('password')}')`);
  await p.scrivi('input[name=password-attuale]', E.PW);
  await p.scrivi('input[name=password-nuova]', PW2);
  await p.scrivi('input[name=password-conferma]', PW2 + 'x');
  await invia(modulo('password'));
  eq('nuova ripetuta diversa: rifiutata', 'Le due password non coincidono', await errore(modulo('password')));
  await p.scrivi('input[name=password-attuale]', 'sbagliata');
  await p.scrivi('input[name=password-conferma]', PW2);
  await invia(modulo('password'));
  eq('attuale sbagliata: il messaggio del server', 'true', await p.aspetta(`document.querySelector('${modulo('password')} [role=alert]')?.textContent === 'Password corrente non corretta'`));
  const vecchio = await p.valuta("localStorage.getItem('token')");
  await p.scrivi('input[name=password-attuale]', E.PW);
  await invia(modulo('password'));
  eq('password cambiata', 'true', await p.aspetta(`!!document.querySelector('${modulo('password')} [data-esito]')`));
  eq('token nuovo salvato, la sessione resta', 'true|200', `${await p.valuta(`localStorage.getItem('token') !== ${JSON.stringify(vecchio)}`)}|${(await api('/auth/profile')).stato}`);
  eq('il token di prima non vale piu\'', 401, await p.valuta(`fetch('/api/auth/profile', { headers: { Authorization: 'Bearer ${vecchio}' } }).then(r => r.status)`));

  console.log('=== B4. codice d\'invito per lo studio ===');
  await p.clic('[data-genera]');
  eq('codice di 64 caratteri, mostrato una volta', 'true', await p.aspetta("/^[0-9a-f]{64}$/.test(document.querySelector('[data-codice]')?.textContent || '')"));
  const codice = await testo('[data-codice]');
  eq('in elenco: attivo, con il prefisso; niente nuovo codice finche\' e\' attivo', `1|0|${codice.slice(0, 8)}…`,
    `${await p.aspetta("document.querySelector('[data-stato=attivo]')") && await n('[data-stato=attivo]')}|${await n('[data-genera]')}|${await p.valuta("document.querySelector('[data-stato=attivo] .font-mono').textContent")}`);
  eq('il codice in chiaro non torna dal server', 'false', String(JSON.stringify((await api('/utenti/token-inviti')).corpo).includes(codice)));
  await stretto('Invito');
  await foto('invito');
  await p.clic('[data-revoca-invito]');
  eq('revocato: codice nascosto, si puo\' crearne un altro', 'true', await p.aspetta("!document.querySelector('[data-stato=attivo]') && !document.querySelector('[data-codice]') && !!document.querySelector('[data-genera]') && !!document.querySelector('[data-stato=revocato]')"));
  await p.clic('[data-genera]');
  await p.aspetta("document.querySelector('[data-codice]')");

  console.log('=== B5. password dimenticata e link della mail ===');
  await esci();
  await attendi(3500); // ACCOUNT_MAIL_ATTESA_SEC=3: mail dello stesso tipo distanziate
  await p.vai(E.WEB + '/accedi');
  await p.aspetta("document.querySelector('[data-link-dimenticata]')");
  await p.clic('[data-link-dimenticata]');
  await p.aspetta("document.querySelector('[data-dimenticata=user]')");
  await p.scrivi('input[name=identificativo]', E.UTENTE);
  await invia('[data-dimenticata]');
  eq('risposta che non dice se l\'account esiste', 'true', await p.aspetta("document.querySelector('[data-dimenticata] [data-esito]')?.textContent.startsWith('Se l')"));
  await stretto('Password dimenticata');
  const reset = await tokenDaMail(nuova, 'Reimposta la password');
  eq('mail al nuovo indirizzo, link /reimposta-password', '/reimposta-password', new URL(reset.link || 'http://x').pathname);
  await link(`${E.WEB}/reimposta-password#token=${reset.token}`);
  await p.aspetta("document.querySelector('[data-reimposta] input[name=password]')");
  eq('il token esce dall\'indirizzo', '', await p.valuta('location.hash'));
  await p.scrivi('input[name=password]', PW3);
  await p.scrivi('input[name=conferma]', PW3);
  await stretto('Nuova password');
  await foto('reimposta');
  await invia('[data-reimposta]');
  eq('password reimpostata', 'true', await p.aspetta("document.querySelector('[data-reimposta] [data-esito]')"));
  const login = pw => p.valuta(`fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '${E.UTENTE}', password: '${pw}' }) }).then(r => r.status)`);
  eq('accesso: la nuova vale, quella di prima no', '200|400', `${await login(PW3)}|${await login(PW2)}`);
  await link(`${E.WEB}/reimposta-password#token=${reset.token}`);
  await p.aspetta("document.querySelector('[data-reimposta] input[name=password]')");
  await p.scrivi('input[name=password]', 'Quarta-Password-4');
  await p.scrivi('input[name=conferma]', 'Quarta-Password-4');
  await invia('[data-reimposta]');
  eq('stesso link due volte: non valido', 'true', await p.aspetta("document.querySelector('[data-reimposta] [role=alert]')?.textContent === 'Link non valido o scaduto'"));
  await link(`${E.WEB}/reimposta-password`);
  eq('senza token: niente modulo, link per chiederne un altro', '0|1', (await p.aspetta("document.querySelector('[data-reimposta] [role=alert]')"))
    && `${await n('[data-reimposta] input')}|${await n('[data-reimposta] a[href="/password-dimenticata"]')}`);

  console.log('=== B6. eliminazione dell\'utente ===');
  await p.vai(E.WEB + '/accedi');
  await p.aspetta("document.querySelector('input[name=username]')");
  await p.scrivi('input[name=username]', E.UTENTE);
  await p.scrivi('input[name=password]', PW3);
  await p.clic('button[type=submit]');
  await p.aspetta("document.querySelector('[data-shell=user]')");
  await p.vai(E.WEB + '/account');
  await p.aspetta("document.querySelector('[data-apri-elimina]')");
  await p.clic('[data-apri-elimina]');
  await p.aspetta("document.querySelector('dialog[open] input[name=password-elimina]')");
  await p.scrivi('input[name=password-elimina]', 'sbagliata');
  await invia('dialog[open] form');
  eq('password sbagliata: account intatto', 'true', await p.aspetta("document.querySelector('dialog[open] [role=alert]')?.textContent === 'Password non corretta'"));
  await foto('elimina');
  await p.scrivi('input[name=password-elimina]', PW3);
  await invia('dialog[open] form');
  eq('eliminato: fuori, all\'accesso', 'true', await p.aspetta("location.pathname === '/accedi' && !localStorage.getItem('token')"));
  eq('accesso dopo l\'eliminazione: rifiutato (400)', '400', String(await login(PW3)));

  console.log('=== B7. studio: registrazione, dati, eliminazione ===');
  await p.vai(E.WEB + '/studio/accedi');
  await p.aspetta("document.querySelector('[data-link-registrati]')");
  await p.clic('[data-link-registrati]');
  await p.aspetta("document.querySelector('[data-registrati=commercialista]')");
  await p.scrivi('input[name=ragione_sociale]', `Studio Bianchi ${E.SFX}`);
  await p.scrivi('input[name=username]', E.STUDIO);
  await p.scrivi('input[name=email]', `${E.STUDIO}@t.it`);
  await p.scrivi('input[name=partita_iva]', '123');
  await p.scrivi('input[name=password]', E.PW);
  await p.scrivi('input[name=conferma]', E.PW);
  await invia('[data-registrati]');
  eq('partita IVA di 3 cifre: rifiutata', 'La partita IVA ha 11 cifre', await errore('[data-registrati]'));
  await p.scrivi('input[name=partita_iva]', '');
  await stretto('Registrazione dello studio');
  await invia('[data-registrati]');
  eq('studio registrato: shell dello studio, solo il suo token', 'true|false', `${await p.aspetta("document.querySelector('[data-shell=commercialista]')")}|${await p.valuta("!!localStorage.getItem('token')")}`);
  await p.vai(E.WEB + '/studio/impostazioni');
  await p.aspetta("document.querySelector('[data-link-account]')");
  await p.clic('[data-link-account]');
  eq('dati dello studio dal profilo', `Studio Bianchi ${E.SFX}`, (await p.aspetta("document.querySelector('input[name=ragione_sociale]')"))
    && await p.valuta("document.querySelector('input[name=ragione_sociale]').value"));
  eq('lo studio non ha l\'invito', 0, await n('[data-sezione=invito]'));
  await p.scrivi('input[name=partita_iva]', '0123456789');
  await invia(modulo('studio'));
  eq('partita IVA di 10 cifre: rifiutata', 'La partita IVA ha 11 cifre', await errore(modulo('studio')));
  await p.scrivi('input[name=partita_iva]', '01234567890');
  await p.scrivi('input[name=telefono]', '06 1234567');
  await invia(modulo('studio'));
  eq('dati salvati', 'true', await p.aspetta(`!!document.querySelector('${modulo('studio')} [data-esito]')`));
  const prof = (await api('/commercialisti/profile', { chiave: 'commercialista_token' })).corpo.commercialista;
  eq('sul server: partita IVA e telefono', '01234567890|06 1234567', `${prof.partita_iva}|${prof.telefono}`);
  await p.vai(E.WEB + '/studio/account');
  eq('ricaricata: i dati restano', '01234567890', (await p.aspetta("document.querySelector('input[name=partita_iva]')?.value === '01234567890'")) && '01234567890');
  await stretto('Account dello studio');
  await foto('account-studio');
  await p.clic('[data-apri-elimina]');
  await p.aspetta("document.querySelector('dialog[open] input[name=password-elimina]')");
  await p.scrivi('input[name=password-elimina]', E.PW);
  await invia('dialog[open] form');
  eq('studio eliminato: fuori, all\'accesso dello studio', 'true', await p.aspetta("location.pathname === '/studio/accedi' && !localStorage.getItem('commercialista_token')"));

  console.log('=== B8. link della mail dello studio ===');
  await link(`${E.WEB}/commercialista/reimposta-password`);
  eq('/commercialista/reimposta-password esiste (link delle mail)', 'true', await p.aspetta("document.querySelector('[data-reimposta=commercialista] [role=alert]')"));
  await link(`${E.WEB}/commercialista/conferma-email`);
  eq('/commercialista/conferma-email esiste', 'true', await p.aspetta("document.querySelector('[data-conferma=errore]')"));
  eq('zero violazioni CSP', 0, p.violazioni.length);
  if (p.violazioni.length) console.log(p.violazioni.slice(0, 5));
} catch (e) {
  fail++; console.log(`  FAIL  eccezione nel browser\n         ${e.message}`);
} finally {
  b.chiudi();
  console.log(`CONTEGGIO ${pass} ${fail}`);
}
