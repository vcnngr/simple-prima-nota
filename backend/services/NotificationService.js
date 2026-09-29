// services/NotificationService.js
// Consegna delle notifiche accodate in `notifiche` (migration 006).
//
// Le righe le scrivono i trigger del database, nella stessa transazione della
// transizione che le causa. Qui si fa solo la consegna:
//   * si prende un lotto di righe con un lease (in_lavorazione_fino), cosi' due
//     backend non spediscono la stessa riga e un worker morto non la blocca per
//     sempre;
//   * si ricontrolla che l'evento sia ancora vero (una richiesta gia' accettata
//     non si annuncia piu', un promemoria su messaggi gia' letti nemmeno);
//   * si compone il testo con i dati correnti e si spedisce con un solo send();
//   * in errore si ritenta con attesa crescente, fino a NOTIFICHE_MAX_TENTATIVI.
//
// Consegna almeno-una-volta: se la spedizione riesce e l'aggiornamento della riga
// no, al giro dopo la mail riparte. Si accetta: un doppio avviso e' meglio di uno
// perso.
//
// Nei log: solo id della notifica ed esito. Mai l'indirizzo, mai il testo, mai il
// messaggio d'errore del server SMTP (che di solito cita l'indirizzo).

const nodemailer = require('nodemailer');
const { query, queryOne } = require('../config/database');

const cfg = () => ({
  intervalloMs: parseInt(process.env.NOTIFICHE_INTERVALLO_MS, 10) || 30000,
  lotto: parseInt(process.env.NOTIFICHE_LOTTO, 10) || 10,
  maxTentativi: parseInt(process.env.NOTIFICHE_MAX_TENTATIVI, 10) || 5,
  backoffMs: parseInt(process.env.NOTIFICHE_BACKOFF_MS, 10) || 60000,
  leaseSec: parseInt(process.env.NOTIFICHE_LEASE_SEC, 10) || 300,
  oreNonLetti: parseInt(process.env.NOTIFICHE_NON_LETTI_ORE, 10) || 4,
  appUrl: (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  from: process.env.MAIL_FROM || 'Simple Prima Nota <no-reply@localhost>'
});

// ------------------------------------------------------------------------------
// Adapter di trasporto
// ------------------------------------------------------------------------------
function creaTrasportoSmtp() {
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    // nodemailer puo' stampare il dialogo SMTP (indirizzi compresi): spento.
    logger: false,
    debug: false
  });
}

// ------------------------------------------------------------------------------
// Testi. Solo testo semplice: nessun HTML in cui un nome scelto da un utente
// possa diventare markup. Nessun dato contabile, nessun testo di chat.
// ------------------------------------------------------------------------------

// Un nome finisce nell'oggetto della mail: niente a capo (header injection),
// niente caratteri di controllo, lunghezza limitata.
function pulisci(testo, max = 80) {
  return String(testo || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max);
}

function componi(n, appUrl) {
  const studio = pulisci(n.ragione_sociale || n.commercialista_username);
  const cliente = pulisci(n.user_username);
  const firma = '\n\n— Simple Prima Nota\nQuesta e\' una notifica automatica: non rispondere a questo indirizzo.';
  const link = n.destinatario_tipo === 'user'
    ? `${appUrl}/commercialista-management`
    : `${appUrl}/commercialista/dashboard`;

  switch (n.evento) {
    case 'richiesta_ricevuta':
      return n.destinatario_tipo === 'user'
        ? {
            subject: `${studio} chiede di collegarsi alla tua prima nota`,
            text: `Lo studio ${studio} ha chiesto di collegarsi al tuo account.\n\n` +
                  `Finche' non accetti non vede nessun dato. Puoi accettare, scegliendo quali ` +
                  `conti e quale periodo condividere, oppure rifiutare:\n${link}${firma}`
          }
        : {
            subject: `${cliente} chiede di collegarsi al tuo studio`,
            text: `Il cliente ${cliente} ha chiesto di collegarsi al tuo studio.\n${link}${firma}`
          };
    case 'richiesta_accettata':
      return {
        subject: `${cliente} ha accettato il collegamento`,
        text: `Il cliente ${cliente} ha accettato la tua richiesta di collegamento.\n` +
              `Trovi nel portale i dati che ha scelto di condividere:\n${link}${firma}`
      };
    case 'richiesta_rifiutata':
      return {
        subject: `${cliente} ha rifiutato il collegamento`,
        text: `Il cliente ${cliente} ha rifiutato la tua richiesta di collegamento.${firma}`
      };
    case 'collegamento_sospeso':
      return {
        subject: `${cliente} ha sospeso il collegamento`,
        text: `Il cliente ${cliente} ha sospeso temporaneamente il collegamento: finche' non ` +
              `lo riattiva non vedi i suoi dati.${firma}`
      };
    case 'collegamento_riattivato':
      return {
        subject: `${cliente} ha riattivato il collegamento`,
        text: `Il cliente ${cliente} ha riattivato il collegamento.\n${link}${firma}`
      };
    case 'collegamento_revocato':
      return n.destinatario_tipo === 'user'
        ? {
            subject: `${studio} ha chiuso il collegamento`,
            text: `Lo studio ${studio} ha chiuso il collegamento con il tuo account e non vede ` +
                  `piu' i tuoi dati. Il registro di cio' che ha consultato resta nella tua area:\n` +
                  `${link}${firma}`
          }
        : {
            subject: `${cliente} ha revocato il collegamento`,
            text: `Il cliente ${cliente} ha revocato il collegamento: non vedi piu' i suoi dati.${firma}`
          };
    case 'messaggi_non_letti': {
      const da = n.destinatario_tipo === 'user' ? `dallo studio ${studio}` : `dal cliente ${cliente}`;
      const chat = n.destinatario_tipo === 'user'
        ? `${appUrl}/chat`
        : `${appUrl}/commercialista/chat`;
      return {
        subject: `Hai messaggi non letti ${da}`,
        text: `Hai ${n.non_letti} messaggi non letti ${da}.\n${chat}${firma}`
      };
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------------------------
// Coda
// ------------------------------------------------------------------------------

// Prende un lotto con lease. SKIP LOCKED: due backend non si contendono le righe.
async function prendiLotto(c) {
  const r = await query(
    `UPDATE notifiche
     SET in_lavorazione_fino = NOW() + make_interval(secs => $2),
         tentativi = tentativi + 1
     WHERE id IN (
       SELECT id FROM notifiche
       WHERE stato = 'in_coda'
         AND prossimo_tentativo <= NOW()
         AND (in_lavorazione_fino IS NULL OR in_lavorazione_fino < NOW())
       ORDER BY prossimo_tentativo, id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id`,
    [c.lotto, c.leaseSec]
  );
  return r.rows.map(x => x.id);
}

// Tutto cio' che serve per decidere e comporre, letto adesso.
async function carica(id) {
  return queryOne(
    `SELECT n.id, n.evento, n.destinatario_tipo, n.tentativi,
            c.stato AS stato_collegamento,
            u.username AS user_username, u.email AS user_email,
            com.username AS commercialista_username, com.email AS commercialista_email,
            com.ragione_sociale,
            (SELECT count(*)::int FROM messaggi_commercialista m
              WHERE m.collegamento_id = c.id
                AND m.letto = FALSE
                AND m.mittente_tipo = CASE WHEN n.destinatario_tipo = 'user'
                                           THEN 'commercialista' ELSE 'user' END) AS non_letti
     FROM notifiche n
     JOIN collegamenti_commercialista c ON c.id = n.collegamento_id
     JOIN utenti u ON u.id = c.user_id
     JOIN commercialisti com ON com.id = c.commercialista_id
     WHERE n.id = $1`,
    [id]
  );
}

// L'evento e' ancora vero? Una mail che annuncia qualcosa di gia' superato
// confonde: "ti chiede di collegarsi" quando il cliente ha gia' risposto.
function ancoraAttuale(n) {
  if (n.evento === 'richiesta_ricevuta') return n.stato_collegamento === 'in_attesa';
  if (n.evento === 'messaggi_non_letti') return n.stato_collegamento === 'attiva' && n.non_letti > 0;
  if (n.evento === 'collegamento_sospeso') return n.stato_collegamento === 'sospesa';
  return true;
}

async function chiudi(id, stato, errore = null) {
  // Tipi espliciti: lo stesso parametro compare come valore di colonna e in un
  // confronto, e senza cast PostgreSQL rifiuta la query (42P08). Qui l'errore non
  // era innocuo: la riga restava in coda e la mail, gia' spedita, ripartiva.
  await query(
    `UPDATE notifiche
     SET stato = $2::varchar, in_lavorazione_fino = NULL,
         inviata_at = CASE WHEN $2::varchar = 'inviata' THEN NOW() ELSE inviata_at END,
         ultimo_errore = $3::varchar
     WHERE id = $1`,
    [id, stato, errore]
  );
}

async function rimanda(id, tentativi, c, codice) {
  if (tentativi >= c.maxTentativi) {
    return chiudi(id, 'fallita', codice);
  }
  // Attesa crescente: backoff, 2x, 4x, ...
  const attesaMs = c.backoffMs * Math.pow(2, Math.max(0, tentativi - 1));
  await query(
    `UPDATE notifiche
     SET in_lavorazione_fino = NULL, ultimo_errore = $2::varchar,
         prossimo_tentativo = NOW() + make_interval(secs => $3::double precision)
     WHERE id = $1`,
    [id, codice, attesaMs / 1000]
  );
}

// L'unico punto da cui parte una mail.
async function send(trasporto, c, n) {
  const to = n.destinatario_tipo === 'user' ? n.user_email : n.commercialista_email;
  const msg = componi(n, c.appUrl);
  if (!to || !msg) throw Object.assign(new Error('destinatario o evento non validi'), { code: 'EDESTINATARIO' });
  await trasporto.sendMail({ from: c.from, to, subject: msg.subject, text: msg.text });
}

async function giro(trasporto) {
  const c = cfg();
  await queryOne('SELECT accoda_promemoria_non_letti($1) AS n', [c.oreNonLetti]);

  const ids = await prendiLotto(c);
  for (const id of ids) {
    const n = await carica(id);
    if (!n) continue; // cancellata in cascata nel frattempo
    if (!ancoraAttuale(n)) {
      await chiudi(id, 'annullata');
      console.log(`notifica ${id}: annullata (evento superato)`);
      continue;
    }
    try {
      await send(trasporto, c, n);
    } catch (err) {
      const codice = String(err.code || err.responseCode || 'ERRORE').replace(/[^A-Za-z0-9_]/g, '').slice(0, 60);
      await rimanda(id, n.tentativi, c, codice);
      console.error(`notifica ${id}: invio non riuscito (${codice}), tentativo ${n.tentativi}`);
      continue;
    }
    // La mail e' partita: da qui in poi un errore NON e' un invio fallito e non
    // deve far ripartire la mail. Se anche questo aggiornamento non riesce, la
    // riga torna disponibile solo alla scadenza del lease (almeno-una-volta).
    await chiudi(id, 'inviata');
    console.log(`notifica ${id}: inviata`);
  }
  return ids.length;
}

// ------------------------------------------------------------------------------
// Avvio
// ------------------------------------------------------------------------------
let timer = null;
let inCorso = false;

function avvia() {
  if (!process.env.SMTP_HOST) {
    // Senza SMTP le notifiche restano in coda: nessuna perdita, partono quando
    // il trasporto viene configurato.
    console.log('Notifiche email disattivate: SMTP_HOST non impostato (le notifiche restano in coda)');
    return;
  }
  const trasporto = creaTrasportoSmtp();
  const c = cfg();
  timer = setInterval(async () => {
    if (inCorso) return; // un giro lento non si sovrappone al successivo
    inCorso = true;
    try {
      await giro(trasporto);
    } catch (err) {
      console.error('Worker notifiche:', err.code || err.message);
    } finally {
      inCorso = false;
    }
  }, c.intervalloMs);
  timer.unref();
  console.log(`Notifiche email attive (giro ogni ${c.intervalloMs} ms)`);
}

function ferma() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { avvia, ferma, giro, componi, pulisci };
