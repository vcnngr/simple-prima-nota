// routes/messaggi.js
// Async chat between user and commercialista
const express = require('express');
const { query, queryOne } = require('../config/database');
const { authEither } = require('../middleware/auth');
const { MOTIVO_PER_STATO } = require('../middleware/collegamento');

const router = express.Router();

// ==============================================================================
// MIDDLEWARE: Get collegamento_id for current user/commercialista
// ==============================================================================
const getCollegamentoId = async (req, res, next) => {
  try {
    let collegamento;

    if (req.user) {
      // Utente. Se indica un collegamento lo si usa, altrimenti si prende il piu'
      // recente fra quelli attivi con un ordinamento deterministico: "il primo che
      // trovo" smette di essere una risposta appena l'utente ha due commercialisti.
      const richiesto = parseInt(req.query.collegamentoId ?? req.body?.collegamento_id, 10);

      if (Number.isInteger(richiesto) && richiesto > 0) {
        collegamento = await queryOne(
          `SELECT id, stato FROM collegamenti_commercialista
           WHERE id = $1 AND user_id = $2`,
          [richiesto, req.user.id]
        );
      } else {
        collegamento = await queryOne(
          `SELECT id, stato FROM collegamenti_commercialista
           WHERE user_id = $1 AND stato = 'attiva'
           ORDER BY data_accettazione DESC NULLS LAST, id DESC
           LIMIT 1`,
          [req.user.id]
        );
      }

      req.mittente_tipo = 'user';
      req.mittente_id = req.user.id;
    } else if (req.commercialista) {
      const userId = parseInt(req.query.userId, 10);

      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: 'userId richiesto per commercialista' });
      }

      collegamento = await queryOne(
        `SELECT id, stato FROM collegamenti_commercialista
         WHERE commercialista_id = $1 AND user_id = $2`,
        [req.commercialista.id, userId]
      );

      req.mittente_tipo = 'commercialista';
      req.mittente_id = req.commercialista.id;
    } else {
      return res.status(401).json({ error: 'Accesso negato.' });
    }

    if (!collegamento) {
      return res.status(404).json({ error: 'Collegamento non trovato' });
    }

    // Fail-closed: la chat vive solo su un collegamento attivo.
    if (collegamento.stato !== 'attiva') {
      return res.status(403).json({
        error: MOTIVO_PER_STATO[collegamento.stato] || 'Collegamento non attivo',
        stato: collegamento.stato
      });
    }

    req.collegamento_id = collegamento.id;
    next();
  } catch (error) {
    console.error('Get collegamento error:', error.message);
    res.status(500).json({ error: 'Errore nel recupero del collegamento' });
  }
};

// ==============================================================================
// GET /api/messaggi - Get messages for current connection
// ==============================================================================
router.get('/', authEither, getCollegamentoId, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const messaggi = await query(
      `SELECT id, mittente_tipo, mittente_id, messaggio, letto,
              data_lettura, created_at
       FROM messaggi_commercialista
       WHERE collegamento_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.collegamento_id, limit, offset]
    );

    // Count unread messages
    const unreadCount = await queryOne(
      `SELECT COUNT(*) as unread
       FROM messaggi_commercialista
       WHERE collegamento_id = $1
       AND mittente_tipo != $2
       AND letto = FALSE`,
      [req.collegamento_id, req.mittente_tipo]
    );

    res.json({
      success: true,
      messaggi: messaggi.rows.reverse(), // Most recent at bottom
      unread_count: parseInt(unreadCount.unread),
      total: messaggi.rows.length
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Errore nel recupero dei messaggi' });
  }
});

// ==============================================================================
// POST /api/messaggi - Send new message
// ==============================================================================
router.post('/', authEither, getCollegamentoId, async (req, res) => {
  try {
    const { messaggio } = req.body;

    if (!messaggio || messaggio.trim().length === 0) {
      return res.status(400).json({ error: 'Messaggio richiesto' });
    }

    const result = await queryOne(
      `INSERT INTO messaggi_commercialista
       (collegamento_id, mittente_tipo, mittente_id, messaggio)
       VALUES ($1, $2, $3, $4)
       RETURNING id, mittente_tipo, mittente_id, messaggio, letto, created_at`,
      [req.collegamento_id, req.mittente_tipo, req.mittente_id, messaggio.trim()]
    );

    res.status(201).json({
      success: true,
      message: 'Messaggio inviato',
      messaggio: result
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Errore nell\'invio del messaggio' });
  }
});

// ==============================================================================
// PUT /api/messaggi/:id/letto - Mark message as read
// ==============================================================================
router.put('/:id/letto', authEither, getCollegamentoId, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);

    // Verify message belongs to this connection and is for current user
    const message = await queryOne(
      `SELECT id FROM messaggi_commercialista
       WHERE id = $1
       AND collegamento_id = $2
       AND mittente_tipo != $3`,
      [messageId, req.collegamento_id, req.mittente_tipo]
    );

    if (!message) {
      return res.status(404).json({ error: 'Messaggio non trovato' });
    }

    // Mark as read
    await query(
      `UPDATE messaggi_commercialista
       SET letto = TRUE, data_lettura = NOW()
       WHERE id = $1`,
      [messageId]
    );

    res.json({
      success: true,
      message: 'Messaggio contrassegnato come letto'
    });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Errore nell\'aggiornamento del messaggio' });
  }
});

// ==============================================================================
// PUT /api/messaggi/leggi-tutti - Mark all messages as read
// ==============================================================================
router.put('/leggi-tutti', authEither, getCollegamentoId, async (req, res) => {
  try {
    const result = await query(
      `UPDATE messaggi_commercialista
       SET letto = TRUE, data_lettura = NOW()
       WHERE collegamento_id = $1
       AND mittente_tipo != $2
       AND letto = FALSE`,
      [req.collegamento_id, req.mittente_tipo]
    );

    res.json({
      success: true,
      message: 'Tutti i messaggi contrassegnati come letti',
      updated: result.rowCount
    });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Errore nell\'aggiornamento dei messaggi' });
  }
});

// ==============================================================================
// GET /api/messaggi/unread-count - Get total unread messages count
// ==============================================================================
router.get('/unread-count', authEither, async (req, res) => {
  try {
    let unreadCount = 0;

    if (req.user) {
      // User: count unread messages from their commercialista
      const result = await queryOne(
        `SELECT COUNT(*) as count
         FROM messaggi_commercialista m
         JOIN collegamenti_commercialista c ON m.collegamento_id = c.id
         WHERE c.user_id = $1
         AND c.stato = 'attiva'
         AND m.mittente_tipo = 'commercialista'
         AND m.letto = FALSE`,
        [req.user.id]
      );
      unreadCount = parseInt(result?.count || 0);
    } else if (req.commercialista) {
      // Commercialista: count unread messages from all their users
      const result = await queryOne(
        `SELECT COUNT(*) as count
         FROM messaggi_commercialista m
         JOIN collegamenti_commercialista c ON m.collegamento_id = c.id
         WHERE c.commercialista_id = $1
         AND c.stato = 'attiva'
         AND m.mittente_tipo = 'user'
         AND m.letto = FALSE`,
        [req.commercialista.id]
      );
      unreadCount = parseInt(result?.count || 0);
    }

    res.json({
      success: true,
      unread_count: unreadCount
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Errore nel conteggio dei messaggi non letti' });
  }
});

// ==============================================================================
// GET /api/messaggi/clients-overview - Get clients list with unread count and last message
// ==============================================================================
router.get('/clients-overview', authEither, async (req, res) => {
  try {
    // Only for commercialisti
    if (!req.commercialista) {
      return res.status(403).json({ error: 'Accesso riservato ai commercialisti' });
    }

    const clientsOverview = await query(
      `SELECT
        u.id as user_id,
        u.username,
        u.email,
        c.id as collegamento_id,
        c.data_collegamento,
        (
          SELECT COUNT(*)
          FROM messaggi_commercialista m
          WHERE m.collegamento_id = c.id
          AND m.mittente_tipo = 'user'
          AND m.letto = FALSE
        ) as unread_count,
        (
          SELECT messaggio
          FROM messaggi_commercialista m
          WHERE m.collegamento_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message,
        (
          SELECT created_at
          FROM messaggi_commercialista m
          WHERE m.collegamento_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message_at,
        (
          SELECT mittente_tipo
          FROM messaggi_commercialista m
          WHERE m.collegamento_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message_from
      FROM collegamenti_commercialista c
      JOIN utenti u ON c.user_id = u.id
      WHERE c.commercialista_id = $1
      AND c.stato = 'attiva'
      ORDER BY unread_count DESC, last_message_at DESC NULLS LAST`,
      [req.commercialista.id]
    );

    res.json({
      success: true,
      clients: clientsOverview.rows
    });
  } catch (error) {
    console.error('Get clients overview error:', error);
    res.status(500).json({ error: 'Errore nel recupero delle informazioni clienti' });
  }
});

module.exports = router;
