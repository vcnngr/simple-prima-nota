// routes/utentiCommercialista.js
// Route con cui l'utente governa il collegamento con i propri commercialisti.
//
// Il collegamento e' una macchina a stati (migration 002):
//   in_attesa -> attiva | rifiutata
//   attiva    -> sospesa | revocata
//   sospesa   -> attiva | revocata
//   revocata / rifiutata / scaduta sono terminali.
// Ogni transizione registra chi l'ha fatta e quando.

const express = require('express');
const { query, queryOne } = require('../config/database');
const { auth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// Transizioni ammesse: stato corrente -> stati raggiungibili dall'utente.
const TRANSIZIONI_UTENTE = {
  in_attesa: ['attiva', 'rifiutata', 'revocata'],
  attiva: ['sospesa', 'revocata'],
  sospesa: ['attiva', 'revocata']
};

// Origini ammesse per ciascuno stato di arrivo, derivate dalla tabella sopra:
// una sola fonte di verita', invece di due elenchi da tenere allineati a mano.
const ORIGINI = Object.entries(TRANSIZIONI_UTENTE).reduce((acc, [da, arrivi]) => {
  arrivi.forEach(a => { (acc[a] = acc[a] || []).push(da); });
  return acc;
}, {});

// Carica il collegamento verificando che appartenga all'utente autenticato.
// Serve per i dati di contorno (nome dello studio) e per spiegare un rifiuto:
// NON e' il controllo su cui poggia una transizione, che deve essere atomica.
async function caricaCollegamento(userId, collegamentoId) {
  const id = parseInt(collegamentoId, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  return queryOne(
    `SELECT c.id, c.stato, c.commercialista_id, com.ragione_sociale, com.username AS commercialista_username
     FROM collegamenti_commercialista c
     JOIN commercialisti com ON com.id = c.commercialista_id
     WHERE c.id = $1 AND c.user_id = $2`,
    [id, userId]
  );
}

/**
 * Esegue una transizione di stato in un solo comando.
 *
 * Leggere lo stato e poi aggiornarlo in due passi lascia una finestra in cui due
 * richieste concorrenti superano entrambe il controllo: "rifiuta" e "accetta"
 * lanciate insieme rispondevano entrambe 200 e lo stato finale dipendeva
 * dall'ordine di arrivo, riaprendo uno stato terminale. Qui lo stato di partenza
 * e' un predicato dell'UPDATE: la seconda richiesta non trova righe.
 *
 * @returns {{esito:'ok'|'non_trovato'|'conflitto', collegamento?:object, stato?:string}}
 */
async function transizioneAtomica(userId, collegamentoId, statiOrigine, setSql, setParams = []) {
  const id = parseInt(collegamentoId, 10);
  if (!Number.isInteger(id) || id <= 0) return { esito: 'non_trovato' };

  const aggiornato = await queryOne(
    `UPDATE collegamenti_commercialista
     SET ${setSql}
     WHERE id = $1 AND user_id = $2 AND stato = ANY($3::varchar[])
     RETURNING id, stato, data_accettazione, data_revoca,
               ambito_dal, ambito_al, conti_ammessi`,
    [id, userId, statiOrigine, ...setParams]
  );

  if (aggiornato) return { esito: 'ok', collegamento: aggiornato };

  // Zero righe: o il collegamento non e' dell'utente, o era gia' in un altro stato.
  const attuale = await caricaCollegamento(userId, id);
  if (!attuale) return { esito: 'non_trovato' };
  return { esito: 'conflitto', stato: attuale.stato };
}

// ==============================================================================
// POST /api/utenti/genera-token-invito
// ==============================================================================
router.post('/genera-token-invito', auth, validate(schemas.tokenInvito), async (req, res) => {
  try {
    const { giorni_validita } = req.body;

    const result = await queryOne(
      'SELECT genera_token_invito($1, $2) as token',
      [req.user.id, giorni_validita]
    );

    const tokenInfo = await queryOne(
      'SELECT token, scadenza, created_at FROM token_inviti WHERE token = $1',
      [result.token]
    );

    res.json({
      success: true,
      message: 'Token generato con successo',
      token: tokenInfo.token,
      scadenza: tokenInfo.scadenza,
      istruzioni: 'Comunica questo token al tuo commercialista. Con il token potra\' inviarti una richiesta di collegamento, che dovrai accettare.'
    });
  } catch (error) {
    console.error('Generate token error:', error.message);
    res.status(500).json({ error: 'Errore nella generazione del token' });
  }
});

// ==============================================================================
// GET /api/utenti/token-inviti
// ==============================================================================
router.get('/token-inviti', auth, async (req, res) => {
  try {
    const tokens = await query(
      `SELECT t.id, t.token, t.scadenza, t.usato, t.data_utilizzo, t.created_at,
              c.ragione_sociale AS commercialista_nome,
              col.stato AS collegamento_stato,
              (col.stato = 'attiva') AS collegamento_attivo
       FROM token_inviti t
       LEFT JOIN commercialisti c ON c.id = t.commercialista_id
       -- LATERAL con LIMIT 1: dopo la 002 una coppia puo' avere piu' collegamenti
       -- (storico), e un JOIN semplice moltiplicherebbe le righe del token.
       LEFT JOIN LATERAL (
         SELECT cc.stato
         FROM collegamenti_commercialista cc
         WHERE cc.commercialista_id = t.commercialista_id AND cc.user_id = t.user_id
         ORDER BY (cc.stato IN ('in_attesa','attiva','sospesa')) DESC, cc.id DESC
         LIMIT 1
       ) col ON TRUE
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, tokens: tokens.rows });
  } catch (error) {
    console.error('Get tokens error:', error.message);
    res.status(500).json({ error: 'Errore nel recupero dei token' });
  }
});

// ==============================================================================
// DELETE /api/utenti/token-inviti/:tokenId
// ==============================================================================
router.delete('/token-inviti/:tokenId', auth, async (req, res) => {
  try {
    const tokenId = parseInt(req.params.tokenId, 10);
    if (!Number.isInteger(tokenId) || tokenId <= 0) {
      return res.status(400).json({ error: 'Identificativo token non valido' });
    }

    const token = await queryOne(
      `SELECT t.id, t.usato, t.commercialista_id, col.stato AS collegamento_stato
       FROM token_inviti t
       LEFT JOIN LATERAL (
         SELECT cc.stato
         FROM collegamenti_commercialista cc
         WHERE cc.commercialista_id = t.commercialista_id AND cc.user_id = t.user_id
         ORDER BY (cc.stato IN ('in_attesa','attiva','sospesa')) DESC, cc.id DESC
         LIMIT 1
       ) col ON TRUE
       WHERE t.id = $1 AND t.user_id = $2`,
      [tokenId, req.user.id]
    );

    if (!token) {
      return res.status(404).json({ error: 'Token non trovato' });
    }

    if (token.usato && ['attiva', 'sospesa', 'in_attesa'].includes(token.collegamento_stato)) {
      return res.status(400).json({
        error: 'Non puoi eliminare un token con un collegamento ancora aperto. Revoca prima il collegamento.'
      });
    }

    await query('DELETE FROM token_inviti WHERE id = $1 AND user_id = $2', [tokenId, req.user.id]);

    res.json({ success: true, message: 'Token eliminato con successo' });
  } catch (error) {
    console.error('Delete token error:', error.message);
    res.status(500).json({ error: 'Errore nell\'eliminazione del token' });
  }
});

// ==============================================================================
// GET /api/utenti/collegamenti - tutti i collegamenti dell'utente, con stato
// ==============================================================================
router.get('/collegamenti', auth, async (req, res) => {
  try {
    const collegamenti = await query(
      `SELECT c.id, c.stato, c.richiesto_da,
              c.data_richiesta, c.data_accettazione, c.data_revoca,
              c.revocato_da, c.motivo_revoca,
              c.ambito_dal, c.ambito_al, c.conti_ammessi,
              com.id AS commercialista_id, com.username, com.email,
              com.ragione_sociale, com.partita_iva, com.telefono
       FROM collegamenti_commercialista c
       JOIN commercialisti com ON com.id = c.commercialista_id
       WHERE c.user_id = $1
       ORDER BY
         CASE c.stato WHEN 'in_attesa' THEN 0 WHEN 'attiva' THEN 1 WHEN 'sospesa' THEN 2 ELSE 3 END,
         c.data_richiesta DESC NULLS LAST,
         c.id DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      collegamenti: collegamenti.rows,
      in_attesa: collegamenti.rows.filter(c => c.stato === 'in_attesa').length
    });
  } catch (error) {
    console.error('Get collegamenti error:', error.message);
    res.status(500).json({ error: 'Errore nel recupero dei collegamenti' });
  }
});

// ==============================================================================
// PUT /api/utenti/collegamenti/:id/accetta - consenso esplicito, con ambito
// ==============================================================================
router.put('/collegamenti/:id/accetta', auth, validate(schemas.collegamentoAccetta), async (req, res) => {
  try {
    const collegamento = await caricaCollegamento(req.user.id, req.params.id);
    if (!collegamento) {
      return res.status(404).json({ error: 'Collegamento non trovato' });
    }

    const { ambito_dal = null, ambito_al = null, conti_ammessi = null } = req.body;

    // I conti dell'ambito devono appartenere all'utente: un ambito che nomina
    // conti altrui e' un errore di input, non una richiesta da accogliere.
    if (Array.isArray(conti_ammessi) && conti_ammessi.length > 0) {
      const verifica = await queryOne(
        'SELECT COUNT(*)::int AS n FROM conti_correnti WHERE user_id = $1 AND id = ANY($2::int[])',
        [req.user.id, conti_ammessi]
      );
      if (verifica.n !== conti_ammessi.length) {
        return res.status(400).json({ error: 'Uno o piu\' conti indicati nell\'ambito non esistono' });
      }
    }

    const esito = await transizioneAtomica(
      req.user.id, req.params.id, ORIGINI.attiva,
      `stato = 'attiva',
       data_accettazione = NOW(),
       data_revoca = NULL, revocato_da = NULL, motivo_revoca = NULL,
       ambito_dal = $4, ambito_al = $5, conti_ammessi = $6`,
      [ambito_dal, ambito_al,
       Array.isArray(conti_ammessi) && conti_ammessi.length > 0 ? conti_ammessi : null]
    );

    if (esito.esito === 'non_trovato') {
      return res.status(404).json({ error: 'Collegamento non trovato' });
    }
    if (esito.esito === 'conflitto') {
      return res.status(409).json({
        error: `Un collegamento in stato "${esito.stato}" non puo' essere accettato`,
        stato: esito.stato
      });
    }

    res.json({
      success: true,
      message: `Collegamento con ${collegamento.ragione_sociale || collegamento.commercialista_username} attivato`,
      collegamento: esito.collegamento
    });
  } catch (error) {
    console.error('Accetta collegamento error:', error.message);
    res.status(500).json({ error: 'Errore nell\'accettazione del collegamento' });
  }
});

// ==============================================================================
// PUT /api/utenti/collegamenti/:id/rifiuta
// ==============================================================================
router.put('/collegamenti/:id/rifiuta', auth, validate(schemas.collegamentoMotivo), async (req, res) => {
  try {
    const esito = await transizioneAtomica(
      req.user.id, req.params.id, ORIGINI.rifiutata,
      `stato = 'rifiutata', data_revoca = NOW(), revocato_da = 'user', motivo_revoca = $4`,
      [req.body.motivo || null]
    );

    if (esito.esito === 'non_trovato') {
      return res.status(404).json({ error: 'Collegamento non trovato' });
    }
    if (esito.esito === 'conflitto') {
      return res.status(409).json({
        error: `Un collegamento in stato "${esito.stato}" non puo' essere rifiutato`,
        stato: esito.stato
      });
    }

    res.json({ success: true, message: 'Richiesta rifiutata', collegamento: esito.collegamento });
  } catch (error) {
    console.error('Rifiuta collegamento error:', error.message);
    res.status(500).json({ error: 'Errore nel rifiuto della richiesta' });
  }
});

// ==============================================================================
// PUT /api/utenti/collegamenti/:id/sospendi - stop reversibile, senza rifare il giro
// ==============================================================================
router.put('/collegamenti/:id/sospendi', auth, validate(schemas.collegamentoMotivo), async (req, res) => {
  try {
    const esito = await transizioneAtomica(
      req.user.id, req.params.id, ORIGINI.sospesa,
      `stato = 'sospesa', motivo_revoca = $4`,
      [req.body.motivo || null]
    );

    if (esito.esito === 'non_trovato') {
      return res.status(404).json({ error: 'Collegamento non trovato' });
    }
    if (esito.esito === 'conflitto') {
      return res.status(409).json({
        error: `Un collegamento in stato "${esito.stato}" non puo' essere sospeso`,
        stato: esito.stato
      });
    }

    res.json({
      success: true,
      message: 'Collegamento sospeso. Il commercialista non vede piu\' i tuoi dati finche\' non lo riattivi.',
      collegamento: esito.collegamento
    });
  } catch (error) {
    console.error('Sospendi collegamento error:', error.message);
    res.status(500).json({ error: 'Errore nella sospensione del collegamento' });
  }
});

// ==============================================================================
// PUT /api/utenti/collegamenti/:id/riattiva
// ==============================================================================
router.put('/collegamenti/:id/riattiva', auth, async (req, res) => {
  try {
    const esito = await transizioneAtomica(
      req.user.id, req.params.id, ['sospesa'],
      `stato = 'attiva', motivo_revoca = NULL`
    );

    if (esito.esito === 'non_trovato') {
      return res.status(404).json({ error: 'Collegamento non trovato' });
    }
    if (esito.esito === 'conflitto') {
      return res.status(409).json({
        error: `Un collegamento in stato "${esito.stato}" non puo' essere riattivato`,
        stato: esito.stato
      });
    }

    res.json({ success: true, message: 'Collegamento riattivato', collegamento: esito.collegamento });
  } catch (error) {
    console.error('Riattiva collegamento error:', error.message);
    res.status(500).json({ error: 'Errore nella riattivazione del collegamento' });
  }
});

// ==============================================================================
// DELETE /api/utenti/collegamenti/:id - revoca (terminale)
// ==============================================================================
router.delete('/collegamenti/:id', auth, validate(schemas.collegamentoMotivo), async (req, res) => {
  try {
    const esito = await transizioneAtomica(
      req.user.id, req.params.id, ORIGINI.revocata,
      `stato = 'revocata', data_revoca = NOW(), revocato_da = 'user', motivo_revoca = $4`,
      [req.body?.motivo || null]
    );

    if (esito.esito === 'non_trovato') {
      return res.status(404).json({ error: 'Collegamento non trovato' });
    }
    if (esito.esito === 'conflitto') {
      return res.status(409).json({
        error: `Un collegamento in stato "${esito.stato}" e' gia' chiuso`,
        stato: esito.stato
      });
    }

    res.json({ success: true, message: 'Collegamento revocato', collegamento: esito.collegamento });
  } catch (error) {
    console.error('Revoca collegamento error:', error.message);
    res.status(500).json({ error: 'Errore nella revoca del collegamento' });
  }
});

// ==============================================================================
// COMPATIBILITA' - il frontend attuale conosce ancora queste due route.
// Vanno via con il ridisegno UX, quando la pagina passera' alla lista.
// ==============================================================================

// GET /api/utenti/commercialista - primo collegamento attivo
router.get('/commercialista', auth, async (req, res) => {
  try {
    const commercialista = await queryOne(
      `SELECT c.id, c.username, c.email, c.ragione_sociale, c.partita_iva, c.telefono,
              col.id AS collegamento_id, col.stato, col.data_accettazione AS data_collegamento,
              (col.stato = 'attiva') AS attivo
       FROM commercialisti c
       JOIN collegamenti_commercialista col ON col.commercialista_id = c.id
       WHERE col.user_id = $1 AND col.stato = 'attiva'
       ORDER BY col.data_accettazione DESC NULLS LAST, col.id DESC
       LIMIT 1`,
      [req.user.id]
    );

    res.json({
      success: true,
      has_commercialista: !!commercialista,
      commercialista
    });
  } catch (error) {
    console.error('Get commercialista error:', error.message);
    res.status(500).json({ error: 'Errore nel recupero delle informazioni del commercialista' });
  }
});

// DELETE /api/utenti/commercialista - revoca tutti i collegamenti aperti
router.delete('/commercialista', auth, async (req, res) => {
  try {
    const result = await query(
      `UPDATE collegamenti_commercialista
       SET stato = 'revocata', data_revoca = NOW(), revocato_da = 'user'
       WHERE user_id = $1 AND stato IN ('in_attesa','attiva','sospesa')`,
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'Collegamento con commercialista rimosso',
      revocati: result.rowCount
    });
  } catch (error) {
    console.error('Disconnect commercialista error:', error.message);
    res.status(500).json({ error: 'Errore nella rimozione del collegamento' });
  }
});

module.exports = router;
