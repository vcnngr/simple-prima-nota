// middleware/collegamento.js
// Unico punto di controllo dell'accesso del commercialista ai dati di un cliente.
//
// Prima di questo modulo il controllo era ricopiato a mano in ogni route che ne
// aveva bisogno, ed era assente in DELETE /clienti/:userId. Ogni route nuova
// ereditava il rischio di dimenticarselo.
//
// Regola: fail-closed. Se il collegamento non si risolve, o non e' nello stato
// che consente l'accesso, la richiesta si ferma qui.

const { queryOne } = require('../config/database');

// Stati in cui il commercialista puo' leggere i dati del cliente.
const STATI_CON_ACCESSO = ['attiva'];

// Messaggi per gli stati che esistono ma non danno accesso: servono a distinguere
// "non ti conosco" da "il cliente ha sospeso il collegamento".
const MOTIVO_PER_STATO = {
  in_attesa: 'Il cliente non ha ancora accettato la richiesta di collegamento',
  sospesa: 'Il cliente ha sospeso temporaneamente il collegamento',
  rifiutata: 'Il cliente ha rifiutato la richiesta di collegamento',
  revocata: 'Il collegamento con questo cliente e\' stato revocato',
  scaduta: 'Il collegamento con questo cliente e\' scaduto'
};

/**
 * Estrae l'id del cliente dalla richiesta, nell'ordine in cui le route lo passano.
 * Restituisce null se assente o non numerico: nessun fallback implicito.
 */
function estraiUserId(req) {
  const grezzo = req.params.userId ?? req.query.userId ?? req.body?.user_id;
  if (grezzo === undefined || grezzo === null || grezzo === '') return null;
  const n = parseInt(grezzo, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Middleware factory.
 *
 * @param {string}   tipoAccesso  dettaglio_cliente | export | chat | disconnessione
 * @param {function} [dettagli]   (req) => oggetto da registrare con l'accesso
 *                                (pagina, formato, filtri). Solo parametri: mai
 *                                valori che il commercialista non ha scelto.
 */
function requireCollegamento(tipoAccesso, dettagli) {
  return async (req, res, next) => {
    try {
      // Fail-closed: questo middleware vale solo dopo un'autenticazione commercialista.
      if (!req.commercialista || !req.commercialista.id) {
        return res.status(401).json({ error: 'Accesso negato.' });
      }

      const userId = estraiUserId(req);
      if (!userId) {
        return res.status(400).json({ error: 'Identificativo cliente mancante o non valido' });
      }

      // Dopo la migration 002 una coppia (commercialista, cliente) puo' avere piu'
      // righe: al massimo una aperta, piu' lo storico dei cicli chiusi. Si prende
      // sempre quella aperta; se non c'e', la piu' recente, per poterne riferire
      // il motivo del diniego.
      const collegamento = await queryOne(
        `SELECT id, stato, ambito_dal, ambito_al, conti_ammessi,
                data_accettazione, data_richiesta
         FROM collegamenti_commercialista
         WHERE commercialista_id = $1 AND user_id = $2
         ORDER BY (stato IN ('in_attesa','attiva','sospesa')) DESC, id DESC
         LIMIT 1`,
        [req.commercialista.id, userId]
      );

      if (!collegamento) {
        return res.status(403).json({ error: 'Non hai accesso a questo cliente' });
      }

      if (!STATI_CON_ACCESSO.includes(collegamento.stato)) {
        return res.status(403).json({
          error: MOTIVO_PER_STATO[collegamento.stato] || 'Non hai accesso a questo cliente',
          stato: collegamento.stato
        });
      }

      req.collegamento = collegamento;
      req.clienteId = userId;
      req.tipoAccesso = tipoAccesso;
      req.ambito = {
        dal: collegamento.ambito_dal,
        al: collegamento.ambito_al,
        conti: collegamento.conti_ammessi
      };

      // Audit PRIMA dei dati. Se la riga non si scrive, l'accesso non avviene:
      // un registro che perde gli accessi quando qualcosa va storto e' un
      // registro di cui il cliente non si puo' fidare.
      req.accessoId = await registraAccesso({
        collegamentoId: collegamento.id,
        commercialistaId: req.commercialista.id,
        userId,
        tipo: tipoAccesso,
        dettagli: {
          ...(dettagli ? dettagli(req) : {}),
          ambito: req.ambito
        }
      });

      next();
    } catch (error) {
      console.error('requireCollegamento error:', error.message);
      res.status(500).json({ error: 'Errore nella verifica del collegamento' });
    }
  };
}

/**
 * Scrive una riga nel registro degli accessi e ne restituisce l'id.
 * Lancia se la scrittura fallisce: chi chiama deve fermarsi (fail-closed).
 */
async function registraAccesso({ collegamentoId, commercialistaId, userId, tipo, dettagli }) {
  const riga = await queryOne(
    `INSERT INTO accessi_commercialista
       (collegamento_id, commercialista_id, user_id, tipo_accesso, dettagli)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id`,
    [collegamentoId, commercialistaId, userId, tipo, JSON.stringify(dettagli || {})]
  );
  return riga.id;
}

/**
 * Completa la riga di un export con il numero di record effettivamente usciti.
 * Il trigger della 005 consente questo solo aggiornamento, una volta.
 */
async function completaAccesso(accessoId, numeroRecord) {
  await queryOne(
    `UPDATE accessi_commercialista SET numero_record = $1
     WHERE id = $2 AND numero_record IS NULL
     RETURNING id`,
    [numeroRecord, accessoId]
  );
}

/**
 * Come registraAccesso, ma al massimo una riga all'ora per collegamento e tipo.
 * Per la chat: la pagina interroga i messaggi ogni pochi secondi, e una riga per
 * interrogazione seppellirebbe gli accessi che contano (export, dettaglio).
 */
// I parametri sono tipizzati a mano: $1 e $4 compaiono due volte, una nella
// SELECT (dove PostgreSQL li dedurrebbe come text) e una nel confronto con
// colonne integer/varchar. Senza cast la deduzione e' incoerente e la query
// fallisce con 42P08 — e la chat del commercialista con lei.
async function registraAccessoOrario({ collegamentoId, commercialistaId, userId, tipo, dettagli }) {
  await queryOne(
    `INSERT INTO accessi_commercialista
       (collegamento_id, commercialista_id, user_id, tipo_accesso, dettagli)
     SELECT $1::int, $2::int, $3::int, $4::varchar, $5::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM accessi_commercialista
       WHERE collegamento_id = $1::int AND tipo_accesso = $4::varchar
         AND created_at > NOW() - INTERVAL '1 hour'
     )
     RETURNING id`,
    [collegamentoId, commercialistaId, userId, tipo, JSON.stringify(dettagli || {})]
  );
}

/**
 * Accessi "di elenco" (dashboard, anteprima chat): una riga per cliente attivo,
 * al massimo una all'ora per tipo. Vedi registra_accessi_elenco nella 005.
 */
async function registraAccessiElenco(commercialistaId, tipo) {
  const r = await queryOne(
    'SELECT registra_accessi_elenco($1, $2) AS n',
    [commercialistaId, tipo]
  );
  return r.n;
}

/**
 * Risolve il collegamento dal lato utente, per id esplicito.
 * Serve alla chat: "il primo collegamento attivo che trovo" non e' deterministico
 * appena un utente ha piu' di un commercialista.
 */
async function collegamentoDiUtente(userId, collegamentoId) {
  return queryOne(
    `SELECT id, commercialista_id, stato
     FROM collegamenti_commercialista
     WHERE id = $1 AND user_id = $2`,
    [collegamentoId, userId]
  );
}


/**
 * Traduce l'ambito accettato dal cliente in clausole SQL.
 *
 * L'ambito non e' un'etichetta: se non entra nelle query, il cliente crede di
 * aver concesso due conti su cinque e il commercialista ne vede cinque. Questa
 * funzione e' l'unico posto in cui l'ambito diventa un filtro reale, e va usata
 * da OGNI query che legge dati contabili del cliente.
 *
 * @param {object} ambito        req.ambito ({ dal, al, conti })
 * @param {object} alias         { conto: 'cc.id', data: 'm.data' }
 * @param {number} paramIndex    primo segnaposto libero ($n)
 * @returns {{ sql: string, params: any[], paramIndex: number }}
 */
function clausolaAmbito(ambito, alias, paramIndex) {
  const params = [];
  let sql = '';
  let i = paramIndex;

  if (!ambito) return { sql, params, paramIndex: i };

  if (alias.conto && Array.isArray(ambito.conti) && ambito.conti.length > 0) {
    sql += ` AND ${alias.conto} = ANY($${i}::int[])`;
    params.push(ambito.conti);
    i++;
  }
  if (alias.data && ambito.dal) {
    sql += ` AND ${alias.data} >= $${i}`;
    params.push(ambito.dal);
    i++;
  }
  if (alias.data && ambito.al) {
    sql += ` AND ${alias.data} <= $${i}`;
    params.push(ambito.al);
    i++;
  }

  return { sql, params, paramIndex: i };
}

/**
 * Vero se il conto indicato rientra nell'ambito. Serve ai filtri che arrivano
 * dal client (`conto_id` di un export): un conto fuori ambito non va ignorato,
 * va rifiutato.
 */
function contoNellAmbito(ambito, contoId) {
  if (!ambito || !Array.isArray(ambito.conti) || ambito.conti.length === 0) return true;
  return ambito.conti.includes(Number(contoId));
}

module.exports = {
  requireCollegamento,
  registraAccesso,
  completaAccesso,
  registraAccessoOrario,
  registraAccessiElenco,
  collegamentoDiUtente,
  clausolaAmbito,
  contoNellAmbito,
  STATI_CON_ACCESSO,
  MOTIVO_PER_STATO
};
