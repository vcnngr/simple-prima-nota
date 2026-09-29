// routes/messaggi.js
// Async chat between user and commercialista
const express = require('express');
const { query, queryOne, withTransaction } = require('../config/database');
const { authEither } = require('../middleware/auth');
const multer = require('multer');
const {
  MOTIVO_PER_STATO, registraAccesso, registraAccessoOrario, registraAccessiElenco
} = require('../middleware/collegamento');
const allegati = require('../services/AllegatiService');
const { validate, validateQuery, schemas } = require('../middleware/validation');

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
          `SELECT id, stato, user_id, commercialista_id, ambito_dal, ambito_al, conti_ammessi FROM collegamenti_commercialista
           WHERE id = $1 AND user_id = $2`,
          [richiesto, req.user.id]
        );
      } else {
        collegamento = await queryOne(
          `SELECT id, stato, user_id, commercialista_id, ambito_dal, ambito_al, conti_ammessi FROM collegamenti_commercialista
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

      // Una coppia puo' avere piu' righe (storico dei cicli chiusi): la chat vive
      // su quella aperta, non sulla prima che il piano di esecuzione restituisce.
      collegamento = await queryOne(
        `SELECT id, stato, user_id, commercialista_id, ambito_dal, ambito_al, conti_ammessi FROM collegamenti_commercialista
         WHERE commercialista_id = $1 AND user_id = $2
         ORDER BY (stato IN ('in_attesa','attiva','sospesa')) DESC, id DESC
         LIMIT 1`,
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
    req.collegamento = collegamento;
    req.cliente_id = req.commercialista ? parseInt(req.query.userId, 10) : null;
    next();
  } catch (error) {
    console.error('Get collegamento error:', error.message);
    res.status(500).json({ error: 'Errore nel recupero del collegamento' });
  }
};

// ==============================================================================
// Movimento citato in un messaggio
// ==============================================================================
const MOVIMENTO_NON_CITABILE =
  'Movimento non trovato o fuori dall\'ambito concesso al commercialista';

// Si cita solo un movimento del cliente e dentro l'ambito del collegamento, da
// entrambi i lati: il commercialista non deve poter sondare movimenti esclusi, e
// il cliente che ne cita uno escluso lo mostrerebbe a chi non doveva vederlo.
// Stessa risposta per "non esiste", "non e' suo" e "fuori ambito".
async function movimentoCitabile(collegamento, movimentoId) {
  // L'ambito si legge qui dal collegamento, nella stessa query: ripassare al
  // database le date come oggetti JS le espone al fuso orario del processo.
  const r = await queryOne(
    `SELECT 1 AS ok
     FROM collegamenti_commercialista c
     JOIN conti_correnti cc ON cc.user_id = c.user_id
     JOIN movimenti mv ON mv.conto_id = cc.id
     WHERE c.id = $1 AND mv.id = $2
       AND (c.conti_ammessi IS NULL OR cardinality(c.conti_ammessi) = 0
            OR cc.id = ANY(c.conti_ammessi))
       AND (c.ambito_dal IS NULL OR mv.data >= c.ambito_dal)
       AND (c.ambito_al  IS NULL OR mv.data <= c.ambito_al)`,
    [collegamento.id, movimentoId]
  );
  return Boolean(r);
}

// ==============================================================================
// GET /api/messaggi - Get messages for current connection
// ==============================================================================
router.get('/', authEither, validateQuery(schemas.messaggiQuery), getCollegamentoId, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    // Il commercialista che legge la chat accede a dati del cliente: si registra,
    // una volta all'ora per collegamento (la pagina interroga ogni pochi secondi).
    if (req.commercialista) {
      await registraAccessoOrario({
        collegamentoId: req.collegamento_id,
        commercialistaId: req.commercialista.id,
        userId: req.cliente_id,
        tipo: 'chat'
      });
    }

    // Il movimento di riferimento si mostra solo se e' ancora del cliente e, per
    // il commercialista, ancora dentro l'ambito: il cliente puo' averlo spostato
    // su un conto escluso dopo averlo citato. Fuori ambito resta solo il fatto
    // che un riferimento c'era (movimento_nascosto), non il suo contenuto.
    const messaggi = await query(
      `SELECT m.id, m.mittente_tipo, m.mittente_id, m.messaggio, m.letto,
              m.data_lettura, m.created_at,
              m.chiarimento_stato, m.chiarimento_risolto_at, m.chiarimento_risolto_da,
              CASE WHEN mv.id IS NOT NULL THEN json_build_object(
                'id', mv.id, 'data', mv.data, 'descrizione', mv.descrizione,
                'importo', mv.importo, 'tipo', mv.tipo, 'conto', cc.nome_banca)
              END AS movimento,
              (m.movimento_id IS NOT NULL AND mv.id IS NULL) AS movimento_nascosto,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', a.id, 'nome', a.nome_originale, 'mime', a.mime,
                  'dimensione', a.dimensione) ORDER BY a.id)
                FROM allegati_messaggio a WHERE a.messaggio_id = m.id
              ), '[]'::json) AS allegati
       FROM messaggi_commercialista m
       JOIN collegamenti_commercialista c ON c.id = m.collegamento_id
       LEFT JOIN movimenti mv0 ON mv0.id = m.movimento_id
       LEFT JOIN conti_correnti cc ON cc.id = mv0.conto_id AND cc.user_id = c.user_id
       LEFT JOIN movimenti mv ON mv.id = mv0.id AND cc.id IS NOT NULL
         AND ($4::boolean = FALSE OR (
               (c.conti_ammessi IS NULL OR cardinality(c.conti_ammessi) = 0
                OR cc.id = ANY(c.conti_ammessi))
           AND (c.ambito_dal IS NULL OR mv0.data >= c.ambito_dal)
           AND (c.ambito_al  IS NULL OR mv0.data <= c.ambito_al)))
       WHERE m.collegamento_id = $1
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $2 OFFSET $3`,
      [req.collegamento_id, limit, offset, Boolean(req.commercialista)]
    );

    const chiarimentiAperti = await queryOne(
      `SELECT COUNT(*)::int AS n FROM messaggi_commercialista
       WHERE collegamento_id = $1 AND chiarimento_stato = 'aperta'`,
      [req.collegamento_id]
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
      chiarimenti_aperti: chiarimentiAperti.n,
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
router.post('/', authEither, validateQuery(schemas.messaggiQuery), validate(schemas.messaggioNuovo), getCollegamentoId, async (req, res) => {
  try {
    const { messaggio, movimento_id = null, chiarimento = false } = req.body;

    if (movimento_id && !(await movimentoCitabile(req.collegamento, movimento_id))) {
      return res.status(400).json({ error: MOVIMENTO_NON_CITABILE });
    }

    const result = await queryOne(
      `INSERT INTO messaggi_commercialista
       (collegamento_id, mittente_tipo, mittente_id, messaggio, movimento_id, chiarimento_stato)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, mittente_tipo, mittente_id, messaggio, letto, created_at,
                 movimento_id, chiarimento_stato`,
      [req.collegamento_id, req.mittente_tipo, req.mittente_id, messaggio.trim(),
       movimento_id, chiarimento ? 'aperta' : null]
    );

    res.status(201).json({
      success: true,
      message: 'Messaggio inviato',
      messaggio: result
    });
  } catch (error) {
    console.error('Send message error:', error.message);
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
      // Il conteggio dice al commercialista che un cliente gli ha scritto: e' un
      // accesso alla chat come l'anteprima, e come lei si registra prima di
      // leggere. Se il registro non si scrive, il conteggio non esce.
      await registraAccessiElenco(req.commercialista.id, 'chat');

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

    // L'anteprima mostra l'ultimo messaggio di ogni cliente: accesso alla chat.
    await registraAccessiElenco(req.commercialista.id, 'chat');

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

// ==============================================================================
// Allegati
// ==============================================================================
// In memoria, un file per richiesta, con il limite di dimensione applicato da
// multer mentre legge: un file troppo grande non arriva mai intero in RAM.
const caricamento = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: allegati.cfg().maxBytes, files: 1, fields: 5, parts: 7 }
}).single('file');

function riceviFile(req, res, next) {
  caricamento(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File troppo grande (massimo ${Math.floor(allegati.cfg().maxBytes / 1024 / 1024)} MB)`
      });
    }
    console.error('Upload error:', err.code || 'ERRORE');
    return res.status(400).json({ error: 'Caricamento non valido' });
  });
}

// POST /api/messaggi/allegati - messaggio con un allegato (multipart: file, messaggio?)
router.post('/allegati', authEither, validateQuery(schemas.messaggiQuery), getCollegamentoId, riceviFile, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nessun file ricevuto' });
  }

  const { error: erroreCampi, value: campi } = schemas.messaggioAllegato.validate(req.body || {}, { stripUnknown: true });
  if (erroreCampi) {
    return res.status(400).json({ error: 'Dati non validi' });
  }

  let info;
  try {
    info = allegati.verifica(req.file);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  if (campi.movimento_id && !(await movimentoCitabile(req.collegamento, campi.movimento_id))) {
    return res.status(400).json({ error: MOVIMENTO_NON_CITABILE });
  }

  let salvato = null;
  try {
    const risultato = await withTransaction(async (client) => {
      // Il lock sul collegamento serializza i caricamenti concorrenti: la quota
      // si controlla e si consuma nello stesso passo.
      await client.query(
        'SELECT id FROM collegamenti_commercialista WHERE id = $1 FOR UPDATE',
        [req.collegamento_id]
      );
      const usato = await client.query(
        `SELECT COALESCE(SUM(a.dimensione), 0)::bigint AS byte
         FROM allegati_messaggio a
         JOIN messaggi_commercialista m ON m.id = a.messaggio_id
         WHERE m.collegamento_id = $1`,
        [req.collegamento_id]
      );
      if (Number(usato.rows[0].byte) + req.file.size > allegati.cfg().quotaBytes) {
        return { quota: true };
      }

      const msg = await client.query(
        `INSERT INTO messaggi_commercialista
         (collegamento_id, mittente_tipo, mittente_id, messaggio, movimento_id, chiarimento_stato)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, mittente_tipo, mittente_id, messaggio, letto, created_at,
                   movimento_id, chiarimento_stato`,
        [req.collegamento_id, req.mittente_tipo, req.mittente_id, campi.messaggio,
         campi.movimento_id || null, campi.chiarimento ? 'aperta' : null]
      );

      // Il file si scrive dentro la transazione: se il disco fallisce, niente
      // riga; se fallisce il commit, il file si toglie qui sotto.
      salvato = await allegati.salva(req.file.buffer);
      const all = await client.query(
        `INSERT INTO allegati_messaggio
         (messaggio_id, nome_originale, mime, dimensione, sha256, chiave)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, nome_originale AS nome, mime, dimensione, sha256`,
        [msg.rows[0].id, info.nome, info.mime, req.file.size, salvato.sha256, salvato.chiave]
      );
      return { messaggio: { ...msg.rows[0], allegati: [all.rows[0]] } };
    });

    if (risultato.quota) {
      return res.status(413).json({ error: 'Spazio per gli allegati di questo collegamento esaurito' });
    }
    res.status(201).json({ success: true, message: 'Allegato inviato', messaggio: risultato.messaggio });
  } catch (error) {
    if (salvato) {
      await allegati.rimuovi(salvato.chiave).catch(() => {});
    }
    console.error('Upload allegato error:', error.code || error.message);
    res.status(500).json({ error: 'Errore nel caricamento dell\'allegato' });
  }
});

// GET /api/messaggi/allegati/:id - download
router.get('/allegati/:id', authEither, validateQuery(schemas.messaggiQuery), getCollegamentoId, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: 'Allegato non trovato' });
    }

    // L'allegato deve stare nel collegamento risolto per chi chiede: un id di
    // un'altra chat risponde come uno inesistente.
    const a = await queryOne(
      `SELECT a.id, a.nome_originale, a.mime, a.dimensione, a.chiave, a.sha256
       FROM allegati_messaggio a
       JOIN messaggi_commercialista m ON m.id = a.messaggio_id
       WHERE a.id = $1 AND m.collegamento_id = $2`,
      [id, req.collegamento_id]
    );
    if (!a) {
      return res.status(404).json({ error: 'Allegato non trovato' });
    }

    // Il commercialista che scarica un documento del cliente accede ai suoi dati:
    // una riga per download, prima dei byte. Registro non scrivibile, niente file.
    if (req.commercialista) {
      await registraAccesso({
        collegamentoId: req.collegamento_id,
        commercialistaId: req.commercialista.id,
        userId: req.collegamento.user_id,
        tipo: 'allegato',
        dettagli: { allegato_id: a.id, mime: a.mime, dimensione: a.dimensione }
      });
    }

    const flusso = allegati.apri(a.chiave);
    flusso.on('error', (err) => {
      console.error('Download allegato error:', err.code || 'ERRORE');
      if (!res.headersSent) res.status(500).json({ error: 'Allegato non disponibile' });
      else res.destroy();
    });
    flusso.on('open', () => {
      // Sempre come download, mai visualizzato nella pagina dell'app.
      const ascii = a.nome_originale.replace(/[^\x20-\x7e]/g, '_');
      res.set({
        'Content-Type': a.mime,
        'Content-Length': String(a.dimensione),
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.nome_originale)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'; sandbox"
      });
      flusso.pipe(res);
    });
  } catch (error) {
    console.error('Download allegato error:', error.message);
    if (!res.headersSent) res.status(500).json({ error: 'Errore nel recupero dell\'allegato' });
  }
});

// ==============================================================================
// Richieste di chiarimento
// ==============================================================================
// GET /api/messaggi/chiarimenti?stato=aperta|risolta
router.get('/chiarimenti', authEither, validateQuery(schemas.chiarimentiQuery), getCollegamentoId, async (req, res) => {
  try {
    if (req.commercialista) {
      await registraAccessoOrario({
        collegamentoId: req.collegamento_id,
        commercialistaId: req.commercialista.id,
        userId: req.collegamento.user_id,
        tipo: 'chat'
      });
    }
    const r = await query(
      `SELECT id, mittente_tipo, messaggio, created_at, movimento_id,
              chiarimento_stato, chiarimento_risolto_at, chiarimento_risolto_da
       FROM messaggi_commercialista
       WHERE collegamento_id = $1
         AND chiarimento_stato = COALESCE($2::varchar, chiarimento_stato)
       ORDER BY (chiarimento_stato = 'aperta') DESC, created_at DESC
       LIMIT 200`,
      [req.collegamento_id, req.query.stato || null]
    );
    res.json({ success: true, chiarimenti: r.rows });
  } catch (error) {
    console.error('Get chiarimenti error:', error.message);
    res.status(500).json({ error: 'Errore nel recupero delle richieste di chiarimento' });
  }
});

// PUT /api/messaggi/:id/chiarimento { stato: 'risolta' | 'aperta' }
router.put('/:id/chiarimento', authEither, validateQuery(schemas.messaggiQuery), validate(schemas.chiarimentoStato), getCollegamentoId, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: 'Richiesta di chiarimento non trovata' });
    }
    const { stato } = req.body;
    const da = stato === 'risolta' ? 'aperta' : 'risolta';

    // Stato di partenza come predicato: due "risolvi" simultanei, uno solo passa.
    const aggiornato = await queryOne(
      `UPDATE messaggi_commercialista
       SET chiarimento_stato = $3::varchar,
           chiarimento_risolto_at = CASE WHEN $3::varchar = 'risolta' THEN NOW() END,
           chiarimento_risolto_da = CASE WHEN $3::varchar = 'risolta' THEN $5::varchar END
       WHERE id = $1 AND collegamento_id = $2 AND chiarimento_stato = $4::varchar
       RETURNING id, chiarimento_stato, chiarimento_risolto_at, chiarimento_risolto_da`,
      [id, req.collegamento_id, stato, da, req.mittente_tipo]
    );
    if (aggiornato) {
      return res.json({ success: true, chiarimento: aggiornato });
    }

    const attuale = await queryOne(
      `SELECT chiarimento_stato FROM messaggi_commercialista
       WHERE id = $1 AND collegamento_id = $2 AND chiarimento_stato IS NOT NULL`,
      [id, req.collegamento_id]
    );
    if (!attuale) {
      return res.status(404).json({ error: 'Richiesta di chiarimento non trovata' });
    }
    return res.status(409).json({ error: `La richiesta e' gia' ${attuale.chiarimento_stato}`, stato: attuale.chiarimento_stato });
  } catch (error) {
    console.error('Chiarimento error:', error.message);
    res.status(500).json({ error: 'Errore nell\'aggiornamento della richiesta di chiarimento' });
  }
});

module.exports = router;
