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

      const collegamento = await queryOne(
        `SELECT id, stato, ambito_dal, ambito_al, conti_ammessi,
                data_accettazione, data_richiesta
         FROM collegamenti_commercialista
         WHERE commercialista_id = $1 AND user_id = $2`,
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

module.exports = {
  requireCollegamento,
  collegamentoDiUtente,
  STATI_CON_ACCESSO,
  MOTIVO_PER_STATO
};
