// services/AccountService.js
// Cambio password ed email, reset della password via email (blocco W6,
// migration 008). Stessa logica per utenti e commercialisti: cambia solo la
// tabella, scelta da una mappa fissa e mai dall'input.
//
// Regole:
//   * la password nuova si salva solo come hash bcrypt; ogni cambio o reset
//     incrementa `versione_credenziali`, che il middleware confronta con il claim
//     `cv` del JWT: le altre sessioni aperte smettono di valere;
//   * i token di reset e di conferma email sono 32 byte casuali; nel database
//     solo lo SHA-256; nel link stanno dopo `#`, cosi' non finiscono nei log di
//     nginx ne' nel Referer;
//   * la richiesta di reset risponde sempre allo stesso modo, prima di sapere se
//     l'account esiste: il lavoro vero si fa dopo la risposta;
//   * ordine dei lock sempre account -> token, per non incrociarsi fra un reset
//     e un cambio password concorrenti.
//
// Nei log: tipo di account, id ed esito. Mai indirizzi, token o password.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryOne, withTransaction } = require('../config/database');
const { creaTrasportoSmtp, pulisci } = require('./NotificationService');

const TIPI = {
  user: { tabella: 'utenti', colonna: 'user_id', percorso: '', durataJwt: '24h' },
  commercialista: { tabella: 'commercialisti', colonna: 'commercialista_id', percorso: '/commercialista', durataJwt: '7d' }
};

const cfg = () => ({
  appUrl: (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  from: process.env.MAIL_FROM || 'Simple Prima Nota <no-reply@localhost>',
  resetMinuti: parseInt(process.env.RESET_PASSWORD_MINUTI, 10) || 60,
  confermaOre: parseInt(process.env.CONFERMA_EMAIL_ORE, 10) || 24,
  // Fra due mail dello stesso tipo allo stesso account: la richiesta in piu'
  // non manda niente (e la risposta resta identica).
  attesaSec: parseInt(process.env.ACCOUNT_MAIL_ATTESA_SEC, 10) || 120
});

const FIRMA = '\n\n— Simple Prima Nota\nQuesta e\' una mail automatica: non rispondere a questo indirizzo.';
const TOKEN = /^[0-9a-f]{64}$/;
const PASSWORD_CAMBIATA = Symbol('password cambiata');

function tipo(t) {
  const d = TIPI[t];
  if (!d) throw new Error('tipo di account non valido');
  return d;
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Un JWT che non porta `cv` e' anteriore alla 008: vale come versione 0.
function versioneValida(decoded, account) {
  const cv = Number.isInteger(decoded.cv) ? decoded.cv : 0;
  return cv === account.versione_credenziali;
}

// Ogni token dice per quale tabella vale (`tipo`). Gli id di utenti e studi sono
// due sequenze separate: senza il tipo, lo studio 1 era anche l'utente 1.
function firmaJwt(t, account) {
  const payload = { id: account.id, username: account.username, cv: account.versione_credenziali, tipo: t };
  return jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: tipo(t).durataJwt });
}

// Verifica firma e scadenza, solo HS256. Restituisce il payload con `tipo`
// normalizzato ('user' | 'commercialista'); lancia se il token non vale.
// I token utente firmati prima del blocco K1 non hanno `tipo`: sono utente (i
// token degli studi l'hanno sempre avuto). Ogni altro valore e' rifiutato.
function verificaJwt(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  if (decoded.tipo === undefined) decoded.tipo = 'user';
  if (decoded.tipo !== 'user' && decoded.tipo !== 'commercialista') {
    throw new jwt.JsonWebTokenError('tipo di token sconosciuto');
  }
  return decoded;
}

// ------------------------------------------------------------------------------
// Posta: invio diretto, non dalla coda della 006. Il link di reset contiene il
// token in chiaro e la coda lo conserverebbe nel database.
// ------------------------------------------------------------------------------
let trasporto = null;

async function spedisci(to, subject, text, etichetta) {
  if (!process.env.SMTP_HOST) {
    console.log(`${etichetta}: mail non inviata, SMTP_HOST non impostato`);
    return false;
  }
  try {
    trasporto = trasporto || creaTrasportoSmtp();
    await trasporto.sendMail({ from: cfg().from, to, subject, text: text + FIRMA });
    console.log(`${etichetta}: mail inviata`);
    return true;
  } catch (err) {
    const codice = String(err.code || err.responseCode || 'ERRORE').replace(/[^A-Za-z0-9_]/g, '').slice(0, 60);
    console.error(`${etichetta}: invio non riuscito (${codice})`);
    return false;
  }
}

// Annulla i token attivi di un account (tutti, o di uno scopo). Dentro una
// transazione che ha gia' il lock sull'account.
async function annullaToken(c, t, id, scopo = null) {
  const { colonna } = tipo(t);
  await c.query(
    `UPDATE token_account SET annullato_il = NOW()
     WHERE ${colonna} = $1 AND usato_il IS NULL AND annullato_il IS NULL
       AND ($2::varchar IS NULL OR scopo = $2)`,
    [id, scopo]
  );
}

// Emette un token per l'account (gia' bloccato con FOR UPDATE nella transazione
// c). null se ne e' appena stato emesso uno dello stesso scopo ancora valido.
async function emettiToken(c, t, account, scopo, durataSec, nuovaEmail = null) {
  const { colonna } = tipo(t);
  const recente = await c.query(
    `SELECT 1 FROM token_account
     WHERE ${colonna} = $1 AND scopo = $2 AND usato_il IS NULL AND annullato_il IS NULL
       AND scadenza > NOW() AND created_at > NOW() - make_interval(secs => $3)
       AND ($4::varchar IS NULL OR nuova_email = $4)`,
    [account.id, scopo, cfg().attesaSec, nuovaEmail]
  );
  if (recente.rowCount > 0) return null;

  await annullaToken(c, t, account.id, scopo);
  const token = crypto.randomBytes(32).toString('hex');
  await c.query(
    `INSERT INTO token_account
       (${colonna}, scopo, token_hash, nuova_email, versione_credenziali, scadenza)
     VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(secs => $6))`,
    [account.id, scopo, hashToken(token), nuovaEmail, account.versione_credenziali, durataSec]
  );
  return token;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// ------------------------------------------------------------------------------
// Reset della password
// ------------------------------------------------------------------------------

/**
 * Richiesta di reset. Da chiamare DOPO aver risposto: l'esito non deve
 * trasparire ne' dalla risposta ne' dai tempi.
 */
async function richiediReset(t, identificativo) {
  const { tabella, percorso } = tipo(t);
  const id = String(identificativo || '').trim();
  if (!id) return;
  const c = cfg();

  const esito = await withTransaction(async (cl) => {
    const r = await cl.query(
      `SELECT id, username, email, versione_credenziali FROM ${tabella}
       WHERE username = $1 OR lower(email) = lower($1)
       ORDER BY (username = $1) DESC, id
       LIMIT 1
       FOR UPDATE`,
      [id]
    );
    const account = r.rows[0];
    if (!account) return null;
    const token = await emettiToken(cl, t, account, 'reset_password', c.resetMinuti * 60);
    return token ? { account, token } : { account, token: null };
  });

  if (!esito) return;
  const etichetta = `reset password ${t} ${esito.account.id}`;
  if (!esito.token) {
    console.log(`${etichetta}: richiesta ravvicinata, nessuna nuova mail`);
    return;
  }
  const link = `${c.appUrl}${percorso}/reimposta-password#token=${esito.token}`;
  await spedisci(
    esito.account.email,
    'Reimposta la password di Simple Prima Nota',
    `Qualcuno ha chiesto di reimpostare la password dell'account ${pulisci(esito.account.username)}.\n` +
    `Se sei stato tu, apri questo link entro ${c.resetMinuti} minuti:\n${link}\n\n` +
    `Il link si usa una volta sola. Se non sei stato tu, ignora questa mail: la password non cambia.`,
    etichetta
  );
}

/**
 * Consuma un token di reset. true se la password e' stata cambiata.
 */
async function reimpostaPassword(t, token, password) {
  const { tabella, colonna } = tipo(t);
  if (!TOKEN.test(String(token || ''))) return false;
  const h = hashToken(token);
  const nuovoHash = await hashPassword(password);

  const account = await withTransaction(async (cl) => {
    const tok = await cl.query(
      `SELECT ${colonna} AS account_id FROM token_account WHERE token_hash = $1 AND scopo = 'reset_password'`,
      [h]
    );
    if (tok.rowCount === 0 || tok.rows[0].account_id === null) return null;
    const accountId = tok.rows[0].account_id;

    const a = await cl.query(
      `SELECT id, email, versione_credenziali FROM ${tabella} WHERE id = $1 FOR UPDATE`,
      [accountId]
    );
    if (a.rowCount === 0) return null;
    const acc = a.rows[0];

    const usato = await cl.query(
      `UPDATE token_account SET usato_il = NOW()
       WHERE token_hash = $1 AND scopo = 'reset_password' AND ${colonna} = $2
         AND usato_il IS NULL AND annullato_il IS NULL AND scadenza > NOW()
         AND versione_credenziali = $3`,
      [h, acc.id, acc.versione_credenziali]
    );
    if (usato.rowCount === 0) return null;

    await cl.query(
      `UPDATE ${tabella}
       SET password_hash = $1, versione_credenziali = versione_credenziali + 1, updated_at = NOW()
       WHERE id = $2`,
      [nuovoHash, acc.id]
    );
    await annullaToken(cl, t, acc.id);
    return acc;
  });

  if (!account) return false;
  await spedisci(
    account.email,
    'La password di Simple Prima Nota e\' stata reimpostata',
    'La password del tuo account e\' stata reimpostata con il link ricevuto per email.\n' +
    'Tutte le sessioni aperte sono state chiuse.\n\n' +
    'Se non sei stato tu, reimposta subito la password dalla pagina di accesso.',
    `reset password ${t} ${account.id} (avviso)`
  );
  return true;
}

// ------------------------------------------------------------------------------
// Cambio password da loggato
// ------------------------------------------------------------------------------

/**
 * @returns {{esito: 'ok', token}|{esito: 'password_errata'}|{esito: 'conflitto'}}
 */
async function cambiaPassword(t, accountId, attuale, nuova) {
  const { tabella } = tipo(t);
  const prima = await queryOne(
    `SELECT id, password_hash, versione_credenziali FROM ${tabella} WHERE id = $1`,
    [accountId]
  );
  if (!prima || !(await bcrypt.compare(String(attuale || ''), prima.password_hash))) {
    return { esito: 'password_errata' };
  }
  const nuovoHash = await hashPassword(nuova);

  const account = await withTransaction(async (cl) => {
    // Solo se nel frattempo nessuno ha cambiato o reimpostato la password.
    const r = await cl.query(
      `UPDATE ${tabella}
       SET password_hash = $1, versione_credenziali = versione_credenziali + 1, updated_at = NOW()
       WHERE id = $2 AND versione_credenziali = $3
       RETURNING id, username, email, versione_credenziali`,
      [nuovoHash, accountId, prima.versione_credenziali]
    );
    if (r.rowCount === 0) return null;
    await annullaToken(cl, t, accountId);
    return r.rows[0];
  });
  if (!account) return { esito: 'conflitto' };

  await spedisci(
    account.email,
    'La password di Simple Prima Nota e\' stata cambiata',
    'La password del tuo account e\' stata cambiata. Le altre sessioni aperte sono state chiuse.\n\n' +
    'Se non sei stato tu, reimposta subito la password dalla pagina di accesso.',
    `cambio password ${t} ${account.id} (avviso)`
  );
  return { esito: 'ok', token: firmaJwt(t, account) };
}

// ------------------------------------------------------------------------------
// Cambio email: vale solo dopo la conferma dal nuovo indirizzo
// ------------------------------------------------------------------------------

/**
 * @returns {{esito: 'ok'|'password_errata'|'stessa_email'|'email_in_uso'}}
 */
async function richiediCambioEmail(t, accountId, password, email) {
  const { tabella, percorso } = tipo(t);
  const nuova = String(email).trim();
  const c = cfg();
  const prima = await queryOne(
    `SELECT id, email, password_hash FROM ${tabella} WHERE id = $1`,
    [accountId]
  );
  if (!prima || !(await bcrypt.compare(String(password || ''), prima.password_hash))) {
    return { esito: 'password_errata' };
  }
  if (prima.email.toLowerCase() === nuova.toLowerCase()) return { esito: 'stessa_email' };
  const altro = await queryOne(
    `SELECT 1 FROM ${tabella} WHERE lower(email) = lower($1) AND id <> $2`,
    [nuova, accountId]
  );
  if (altro) return { esito: 'email_in_uso' };

  // La password e' stata verificata fuori dal lock. Se nel frattempo e' cambiata
  // (il titolare l'ha appena cambiata per chiudere fuori chi conosceva la
  // vecchia), il token non si emette: si confronta l'hash sotto lock con quello
  // verificato. Senza, la vecchia password sposterebbe l'email dopo il cambio.
  const token = await withTransaction(async (cl) => {
    const r = await cl.query(
      `SELECT id, password_hash, versione_credenziali FROM ${tabella} WHERE id = $1 FOR UPDATE`,
      [accountId]
    );
    if (r.rowCount === 0 || r.rows[0].password_hash !== prima.password_hash) return PASSWORD_CAMBIATA;
    return emettiToken(cl, t, r.rows[0], 'conferma_email', c.confermaOre * 3600, nuova);
  });

  const etichetta = `cambio email ${t} ${accountId}`;
  if (token === PASSWORD_CAMBIATA) return { esito: 'password_errata' };
  if (!token) {
    console.log(`${etichetta}: richiesta ravvicinata, nessuna nuova mail`);
    return { esito: 'ok' };
  }
  const link = `${c.appUrl}${percorso}/conferma-email#token=${token}`;
  await spedisci(
    nuova,
    'Conferma il nuovo indirizzo per Simple Prima Nota',
    `Per usare questo indirizzo con il tuo account, apri questo link entro ${c.confermaOre} ore:\n${link}\n\n` +
    'Fino alla conferma resta valido l\'indirizzo precedente. Se non hai chiesto tu il cambio, ignora questa mail.',
    etichetta
  );
  return { esito: 'ok' };
}

// ------------------------------------------------------------------------------
// Eliminazione dell'account di uno studio (S3, migration 010)
// ------------------------------------------------------------------------------

/**
 * Password verificata fuori dal lock, hash ricontrollato sotto lock come nel
 * cambio email: una password vecchia non elimina l'account dopo un cambio.
 * @returns {{esito: 'ok', revocati}|{esito: 'password_errata'}|{esito: 'non_trovato'}}
 */
async function eliminaAccountCommercialista(accountId, password) {
  const prima = await queryOne(
    'SELECT id, password_hash FROM commercialisti WHERE id = $1 AND eliminato_il IS NULL',
    [accountId]
  );
  if (!prima) return { esito: 'non_trovato' };
  if (!(await bcrypt.compare(String(password || ''), prima.password_hash))) {
    return { esito: 'password_errata' };
  }
  return withTransaction(async (cl) => {
    const r = await cl.query(
      'SELECT password_hash FROM commercialisti WHERE id = $1 AND eliminato_il IS NULL FOR UPDATE',
      [accountId]
    );
    if (r.rowCount === 0) return { esito: 'non_trovato' };
    if (r.rows[0].password_hash !== prima.password_hash) return { esito: 'password_errata' };
    const e = await cl.query('SELECT elimina_account_commercialista($1) AS revocati', [accountId]);
    if (e.rows[0].revocati === null) return { esito: 'non_trovato' };
    return { esito: 'ok', revocati: e.rows[0].revocati };
  });
}

/**
 * @returns {{esito: 'ok', email}|{esito: 'non_valido'}|{esito: 'email_in_uso'}}
 */
async function confermaEmail(t, token) {
  const { tabella, colonna } = tipo(t);
  if (!TOKEN.test(String(token || ''))) return { esito: 'non_valido' };
  const h = hashToken(token);

  let esito;
  try {
    esito = await withTransaction(async (cl) => {
      const tok = await cl.query(
        `SELECT ${colonna} AS account_id FROM token_account WHERE token_hash = $1 AND scopo = 'conferma_email'`,
        [h]
      );
      if (tok.rowCount === 0 || tok.rows[0].account_id === null) return { esito: 'non_valido' };

      const a = await cl.query(
        `SELECT id, email, versione_credenziali FROM ${tabella} WHERE id = $1 FOR UPDATE`,
        [tok.rows[0].account_id]
      );
      if (a.rowCount === 0) return { esito: 'non_valido' };
      const acc = a.rows[0];

      const usato = await cl.query(
        `UPDATE token_account SET usato_il = NOW()
         WHERE token_hash = $1 AND scopo = 'conferma_email' AND ${colonna} = $2
           AND usato_il IS NULL AND annullato_il IS NULL AND scadenza > NOW()
           AND versione_credenziali = $3
         RETURNING nuova_email`,
        [h, acc.id, acc.versione_credenziali]
      );
      if (usato.rowCount === 0) return { esito: 'non_valido' };
      const nuova = usato.rows[0].nuova_email;

      const occupata = await cl.query(
        `SELECT 1 FROM ${tabella} WHERE lower(email) = lower($1) AND id <> $2`,
        [nuova, acc.id]
      );
      if (occupata.rowCount > 0) throw Object.assign(new Error('email in uso'), { esitoAccount: 'email_in_uso' });

      await cl.query(`UPDATE ${tabella} SET email = $1, updated_at = NOW() WHERE id = $2`, [nuova, acc.id]);
      // Un reset chiesto prima del cambio porterebbe la password al vecchio
      // indirizzo: si annulla tutto cio' che era ancora aperto.
      await annullaToken(cl, t, acc.id);
      return { esito: 'ok', id: acc.id, vecchia: acc.email, email: nuova };
    });
  } catch (err) {
    // 23505: un altro account ha preso l'indirizzo fra il controllo e l'UPDATE.
    if (err.esitoAccount === 'email_in_uso' || err.code === '23505') return { esito: 'email_in_uso' };
    throw err;
  }

  if (esito.esito !== 'ok') return esito;
  await spedisci(
    esito.vecchia,
    'L\'indirizzo email di Simple Prima Nota e\' cambiato',
    'L\'indirizzo email del tuo account e\' stato cambiato: da ora le mail arrivano al nuovo indirizzo.\n\n' +
    'Se non sei stato tu, contatta subito l\'assistenza.',
    `cambio email ${t} ${esito.id} (avviso)`
  );
  return { esito: 'ok', email: esito.email };
}

module.exports = {
  versioneValida,
  firmaJwt,
  verificaJwt,
  richiediReset,
  reimpostaPassword,
  cambiaPassword,
  richiediCambioEmail,
  confermaEmail,
  eliminaAccountCommercialista,
  hashToken
};
