// Gara deterministica fra consegna di una notifica e eliminazione dello studio
// destinatario (blocco S3, review pn-gpt). Usato da s3-eliminazione-studio.sh,
// sezione L; si puo' lanciare anche da solo contro un database migrato:
//
//   DB_HOST=127.0.0.1 DB_PORT=55510 DB_NAME=prima_nota DB_USER=postgres DB_PASSWORD=pw \
//     node scripts/smoke/s3-gara-notifiche.js
//
// Caso 1: l'eliminazione parte MENTRE la mail e' in spedizione. Deve aspettare
//   che la consegna sia chiusa: nessuna mail esce dopo il commit dell'eliminazione.
// Caso 2: l'eliminazione e' in corso (lock preso, non ancora committata) quando la
//   consegna comincia. La consegna aspetta, poi trova la notifica annullata: nessuna
//   mail.
// Stampa una riga JSON con i fatti osservati; i controlli li fa lo smoke.
const path = require('path');
const backend = path.join(__dirname, '..', '..', 'backend');
const { pool } = require(path.join(backend, 'config', 'database'));
const notifiche = require(path.join(backend, 'services', 'NotificationService'));

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));
const sfx = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

// Studio + cliente + collegamento revocato dal cliente: il trigger della 006
// accoda 'collegamento_revocato' allo studio. La riga si prende in lease qui, cosi'
// il worker di un backend acceso sulla stessa base non la tocca.
async function prepara(k) {
  const com = await pool.query(
    `INSERT INTO commercialisti (username, email, password_hash, ragione_sociale)
     VALUES ($1, $2, '!', 'Studio gara') RETURNING id`,
    [`gara${k}${sfx}`, `gara${k}${sfx}@t.it`]
  );
  const ute = await pool.query(
    `INSERT INTO utenti (username, email, password_hash) VALUES ($1, $2, '!') RETURNING id`,
    [`garau${k}${sfx}`, `garau${k}${sfx}@t.it`]
  );
  const col = await pool.query(
    `INSERT INTO collegamenti_commercialista (commercialista_id, user_id, stato, richiesto_da, data_richiesta)
     VALUES ($1, $2, 'attiva', 'user', NOW()) RETURNING id`,
    [com.rows[0].id, ute.rows[0].id]
  );
  await pool.query(
    `UPDATE collegamenti_commercialista SET stato = 'revocata', revocato_da = 'user', data_revoca = NOW() WHERE id = $1`,
    [col.rows[0].id]
  );
  const n = await pool.query(
    `UPDATE notifiche SET in_lavorazione_fino = NOW() + INTERVAL '10 minutes', tentativi = 1
     WHERE collegamento_id = $1 AND destinatario_tipo = 'commercialista' AND stato = 'in_coda'
     RETURNING id`,
    [col.rows[0].id]
  );
  return { studio: com.rows[0].id, email: `gara${k}${sfx}@t.it`, notifica: n.rows[0] && n.rows[0].id };
}

async function statoStudio(id) {
  const r = await pool.query('SELECT eliminato_il IS NOT NULL AS eliminato FROM commercialisti WHERE id = $1', [id]);
  return r.rows[0].eliminato;
}

async function consegna(trasporto, id) {
  if (notifiche.consegna) return notifiche.consegna(trasporto, notifiche.cfg(), id);
  // Codice anteriore al fix (nessuna consegna singola): la riga torna prendibile e
  // gira un giro intero. Da usare senza backend acceso sulla stessa base.
  await pool.query('UPDATE notifiche SET in_lavorazione_fino = NULL WHERE id = $1', [id]);
  return notifiche.giro(trasporto);
}

async function caso1() {
  const p = await prepara(1);
  const fatti = { notifica_accodata: Boolean(p.notifica), mail: [], eliminato_prima_di_inviare: null, eliminato_durante_invio: null };
  let eliminazione;
  const trasporto = {
    sendMail: async (m) => {
      fatti.eliminato_prima_di_inviare = await statoStudio(p.studio);
      fatti.mail.push(m.to === p.email ? 'studio' : 'altro');
      eliminazione = pool.query('SELECT elimina_account_commercialista($1) AS r', [p.studio]);
      await attesa(1500);
      fatti.eliminato_durante_invio = await statoStudio(p.studio);
    }
  };
  if (p.notifica) await consegna(trasporto, p.notifica);
  if (eliminazione) await eliminazione;
  fatti.eliminato_alla_fine = await statoStudio(p.studio);
  const n = await pool.query('SELECT stato FROM notifiche WHERE id = $1', [p.notifica]);
  fatti.stato_notifica = n.rows[0] && n.rows[0].stato;
  return fatti;
}

async function caso2() {
  const p = await prepara(2);
  const fatti = { notifica_accodata: Boolean(p.notifica), mail: [] };
  const trasporto = { sendMail: async (m) => { fatti.mail.push(m.to === p.email ? 'studio' : 'altro'); } };
  const cl = await pool.connect();
  try {
    await cl.query('BEGIN');
    await cl.query('SELECT elimina_account_commercialista($1)', [p.studio]);
    const c = p.notifica ? consegna(trasporto, p.notifica) : Promise.resolve();
    await attesa(800);
    await cl.query('COMMIT');
    await c;
  } finally {
    cl.release();
  }
  const n = await pool.query('SELECT stato FROM notifiche WHERE id = $1', [p.notifica]);
  fatti.stato_notifica = n.rows[0] && n.rows[0].stato;
  return fatti;
}

(async () => {
  const esito = { caso1: await caso1(), caso2: await caso2() };
  console.log(JSON.stringify(esito));
  await pool.end();
})().catch(async (e) => {
  console.log(JSON.stringify({ errore: e.code || e.message }));
  await pool.end().catch(() => {});
  process.exit(1);
});
