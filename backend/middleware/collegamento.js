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
 * @param {string} tipoAccesso  lista_clienti | dettaglio_cliente | export | chat
 *                              (registrato su req; l'audit arriva con il blocco W3)
 */
function requireCollegamento(tipoAccesso) {
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

      next();
    } catch (error) {
      console.error('requireCollegamento error:', error.message);
      res.status(500).json({ error: 'Errore nella verifica del collegamento' });
    }
  };
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
  collegamentoDiUtente,
  clausolaAmbito,
  contoNellAmbito,
  STATI_CON_ACCESSO,
  MOTIVO_PER_STATO
};
