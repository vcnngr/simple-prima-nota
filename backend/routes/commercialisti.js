// routes/commercialisti.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, queryOne } = require('../config/database');
const { auth } = require('../middleware/auth');
const {
  requireCollegamento, clausolaAmbito, contoNellAmbito,
  completaAccesso, registraAccessiElenco
} = require('../middleware/collegamento');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const account = require('../services/AccountService');
const { versioneValida } = account;
const { limiteResetPassword, rispondiResetAccolto } = require('../middleware/account');

const router = express.Router();

// ==============================================================================
// RATE LIMIT: richieste di collegamento
// ==============================================================================
// POST /richieste accetta username o email di un cliente. Senza un tetto, un
// commercialista autenticato puo' usarlo per scoprire quali indirizzi sono
// registrati, una prova alla volta. Il tetto non elimina il problema, lo rende
// lento e visibile nei log.
const limiteRichieste = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Il tetto e' per commercialista, non per IP: due studi dietro lo stesso
  // indirizzo non devono consumarsi il budget a vicenda. Il middleware gira
  // dopo authCommercialista, quindi req.commercialista c'e' gia'.
  keyGenerator: (req) => (req.commercialista?.id ? `c${req.commercialista.id}` : req.ip),
  message: { error: 'Troppe richieste di collegamento. Riprova piu\' tardi.' }
});

// ==============================================================================
// MIDDLEWARE: Verify commercialista authentication
// ==============================================================================
const authCommercialista = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Accesso negato. Token non fornito.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify commercialista exists
    const commercialista = await queryOne(
      'SELECT id, username, email, ragione_sociale, partita_iva, telefono, versione_credenziali FROM commercialisti WHERE id = $1',
      [decoded.id]
    );

    if (!commercialista || decoded.tipo !== 'commercialista' || !versioneValida(decoded, commercialista)) {
      return res.status(401).json({ error: 'Token non valido.' });
    }

    delete commercialista.versione_credenziali;
    req.commercialista = commercialista;
    next();
  } catch (error) {
    console.error('Commercialista auth error:', error.message);
    res.status(401).json({ error: 'Token non valido.' });
  }
};

// ==============================================================================
// POST /api/commercialisti/register - Register new commercialista
// ==============================================================================
router.post('/register', async (req, res) => {
  try {
    const { username, password, email, ragione_sociale, partita_iva, telefono } = req.body;

    // Validation
    if (!username || !password || !email) {
      return res.status(400).json({
        error: 'Username, password ed email sono obbligatori'
      });
    }

    // Check if username or email already exists
    const existing = await queryOne(
      'SELECT id FROM commercialisti WHERE username = $1 OR lower(email) = lower($2)',
      [username, email]
    );

    if (existing) {
      return res.status(400).json({
        error: 'Username o email già esistente'
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert commercialista
    const result = await queryOne(
      `INSERT INTO commercialisti (username, password_hash, email, ragione_sociale, partita_iva, telefono)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, ragione_sociale, partita_iva, telefono, created_at, versione_credenziali`,
      [username, password_hash, email, ragione_sociale, partita_iva, telefono]
    );

    const token = account.firmaJwt('commercialista', result);
    delete result.versione_credenziali;

    res.status(201).json({
      success: true,
      message: 'Registrazione completata con successo',
      commercialista: result,
      token
    });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Username o email già esistente' });
    console.error('Register error:', error.code || error.message);
    res.status(500).json({ error: 'Errore durante la registrazione' });
  }
});

// ==============================================================================
// POST /api/commercialisti/login - Login commercialista
// ==============================================================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password sono obbligatori' });
    }

    // Get commercialista
    const commercialista = await queryOne(
      'SELECT id, username, email, password_hash, ragione_sociale, partita_iva, telefono, versione_credenziali FROM commercialisti WHERE username = $1',
      [username]
    );

    if (!commercialista) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, commercialista.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const token = account.firmaJwt('commercialista', commercialista);

    // Remove password_hash from response
    delete commercialista.password_hash;
    delete commercialista.versione_credenziali;

    res.json({
      success: true,
      message: 'Login effettuato con successo',
      commercialista,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Errore durante il login' });
  }
});

// ==============================================================================
// GET /api/commercialisti/profile - Get commercialista profile
// ==============================================================================
router.get('/profile', authCommercialista, async (req, res) => {
  try {
    res.json({
      success: true,
      commercialista: req.commercialista
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Errore nel recupero del profilo' });
  }
});

// ==============================================================================
// Account (blocco W6): profilo, password, email, reset
// ==============================================================================
router.put('/profile', authCommercialista, validate(schemas.profiloCommercialista), async (req, res) => {
  try {
    const campi = ['ragione_sociale', 'partita_iva', 'telefono'].filter(k => k in req.body);
    const set = campi.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const valori = campi.map(k => (req.body[k] === '' ? null : req.body[k]));
    const r = await queryOne(
      `UPDATE commercialisti SET ${set}, updated_at = NOW() WHERE id = $1
       RETURNING id, username, email, ragione_sociale, partita_iva, telefono`,
      [req.commercialista.id, ...valori]
    );
    res.json({ success: true, commercialista: r });
  } catch (error) {
    console.error('Update profile error:', error.code || error.message);
    res.status(500).json({ error: 'Errore nell\'aggiornamento del profilo' });
  }
});

router.put('/password', authCommercialista, validate(schemas.cambioPassword), async (req, res) => {
  try {
    const r = await account.cambiaPassword('commercialista', req.commercialista.id,
      req.body.currentPassword, req.body.newPassword);
    if (r.esito === 'password_errata') {
      return res.status(400).json({ error: 'Password corrente non corretta' });
    }
    if (r.esito === 'conflitto') {
      return res.status(409).json({ error: 'La password e\' appena cambiata altrove: accedi di nuovo' });
    }
    res.json({ success: true, message: 'Password cambiata con successo', token: r.token });
  } catch (error) {
    console.error('Change password error:', error.code || error.message);
    res.status(500).json({ error: 'Errore durante il cambio password' });
  }
});

router.post('/password-dimenticata', limiteResetPassword, validate(schemas.passwordDimenticata),
  rispondiResetAccolto('commercialista'));

router.post('/password-reimposta', validate(schemas.passwordReimposta), async (req, res) => {
  try {
    const ok = await account.reimpostaPassword('commercialista', req.body.token, req.body.password);
    if (!ok) return res.status(400).json({ error: 'Link non valido o scaduto' });
    res.json({ success: true, message: 'Password reimpostata: accedi con la nuova password' });
  } catch (error) {
    console.error('Reset password error:', error.code || error.message);
    res.status(500).json({ error: 'Errore durante la reimpostazione della password' });
  }
});

router.post('/email', authCommercialista, validate(schemas.cambioEmail), async (req, res) => {
  try {
    const r = await account.richiediCambioEmail('commercialista', req.commercialista.id,
      req.body.password, req.body.email);
    if (r.esito === 'password_errata') return res.status(400).json({ error: 'Password non corretta' });
    if (r.esito === 'stessa_email') return res.status(400).json({ error: 'E\' gia\' il tuo indirizzo' });
    if (r.esito === 'email_in_uso') return res.status(409).json({ error: 'Indirizzo gia\' in uso' });
    res.status(202).json({ success: true, message: 'Ti abbiamo scritto al nuovo indirizzo: il cambio vale dopo la conferma' });
  } catch (error) {
    console.error('Change email error:', error.code || error.message);
    res.status(500).json({ error: 'Errore durante il cambio email' });
  }
});

router.post('/email/conferma', validate(schemas.confermaEmail), async (req, res) => {
  try {
    const r = await account.confermaEmail('commercialista', req.body.token);
    if (r.esito === 'non_valido') return res.status(400).json({ error: 'Link non valido o scaduto' });
    if (r.esito === 'email_in_uso') return res.status(409).json({ error: 'Indirizzo gia\' in uso' });
    res.json({ success: true, message: 'Indirizzo email aggiornato', email: r.email });
  } catch (error) {
    console.error('Confirm email error:', error.code || error.message);
    res.status(500).json({ error: 'Errore durante la conferma dell\'indirizzo' });
  }
});

// ==============================================================================
// GET /api/commercialisti/dashboard - Get dashboard with clients summary
// ==============================================================================
router.get('/dashboard', authCommercialista, async (req, res) => {
  try {
    // La dashboard mostra saldi e conteggi di ogni cliente attivo: e' un accesso
    // ai loro dati e va registrato, prima di leggerli (fail-closed).
    await registraAccessiElenco(req.commercialista.id, 'lista_clienti');

    // Get clients summary using database function
    const clienti = await query(
      'SELECT * FROM get_commercialista_clients_summary($1)',
      [req.commercialista.id]
    );

    // Non letti per collegamento. La query raggruppa per collegamento_id: il merge
    // deve usare la stessa chiave, altrimenti il conteggio resta a zero comunque.
    // Solo collegamenti attivi: durante una sospensione la chat e' chiusa, quindi
    // un contatore che continua a salire direbbe al commercialista cosa succede
    // dall'altra parte proprio mentre il cliente gli ha tolto la visibilita'.
    const unreadMessages = await query(
      `SELECT m.collegamento_id, COUNT(*)::int as unread_count
       FROM messaggi_commercialista m
       JOIN collegamenti_commercialista c ON c.id = m.collegamento_id
       WHERE c.commercialista_id = $1
       AND c.stato = 'attiva'
       AND m.mittente_tipo = 'user'
       AND m.letto = FALSE
       GROUP BY m.collegamento_id`,
      [req.commercialista.id]
    );

    const perCollegamento = new Map(
      unreadMessages.rows.map(r => [r.collegamento_id, r.unread_count])
    );

    const clientiConMessaggi = clienti.rows.map(cliente => ({
      ...cliente,
      unread_messages: perCollegamento.get(cliente.collegamento_id) || 0
    }));

    res.json({
      success: true,
      commercialista: req.commercialista,
      clienti: clientiConMessaggi,
      totale_clienti: clienti.rows.length
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Errore nel recupero della dashboard' });
  }
});

// ==============================================================================
// POST /api/commercialisti/collega-cliente - Connect client using invitation token
// ==============================================================================
router.post('/collega-cliente', authCommercialista, validate(schemas.collegaCliente), async (req, res) => {
  try {
    const { token } = req.body;

    // La funzione SQL consuma il token e apre una richiesta in stato `in_attesa`:
    // il token non da' accesso ai dati, da' il diritto di bussare.
    const result = await queryOne(
      'SELECT usa_token_invito($1, $2) as collegamento_id',
      [token, req.commercialista.id]
    );

    // Il cliente e' quello del collegamento appena creato, non "l'ultimo per data".
    const collegamento = await queryOne(
      `SELECT c.id AS collegamento_id, c.stato,
              u.id, u.username, u.email
       FROM collegamenti_commercialista c
       JOIN utenti u ON u.id = c.user_id
       WHERE c.id = $1 AND c.commercialista_id = $2`,
      [result.collegamento_id, req.commercialista.id]
    );

    const inAttesa = collegamento && collegamento.stato === 'in_attesa';

    res.json({
      success: true,
      message: inAttesa
        ? 'Richiesta inviata. Il cliente deve accettarla prima che i dati siano visibili.'
        : 'Collegamento gia\' attivo con questo cliente',
      stato: collegamento?.stato,
      cliente: collegamento
        ? { id: collegamento.id, username: collegamento.username, email: collegamento.email }
        : null
    });
  } catch (error) {
    console.error('Connect client error:', error);
    res.status(400).json({
      error: error.message || 'Errore nel collegamento del cliente'
    });
  }
});

// ==============================================================================
// POST /api/commercialisti/richieste - chiede il collegamento nominando il cliente
// ==============================================================================
// Percorso principale del workflow: il commercialista bussa, il cliente apre.
// Il token resta solo per il caso "il mio commercialista non e' ancora registrato".
//
// La risposta e' la STESSA che il cliente esista o no. Altrimenti l'endpoint
// diventa un modo per sapere quali username ed email sono registrati: si prova
// un indirizzo e si legge l'esito. Il rate limit qui sotto serve allo stesso scopo.
router.post('/richieste', authCommercialista, limiteRichieste, validate(schemas.richiestaCollegamento), async (req, res) => {
  const RISPOSTA_UNIFORME = {
    success: true,
    message: 'Richiesta inviata. Se il cliente esiste, la trovera\' in app e dovra\' accettarla prima che i dati siano visibili.'
  };

  try {
    const { identificativo_cliente } = req.body;

    // La funzione ha tre esiti di dominio: id del collegamento (nuovo o gia'
    // aperto), oppure NULL (cliente inesistente o identificativo ambiguo). Tutti
    // e tre rispondono 202 con lo stesso corpo: distinguerli sarebbe l'oracolo.
    await queryOne(
      'SELECT richiedi_collegamento($1, $2) as collegamento_id',
      [req.commercialista.id, identificativo_cliente]
    );

    return res.status(202).json(RISPOSTA_UNIFORME);
  } catch (error) {
    // Un'eccezione NON e' un esito di dominio: la richiesta non e' stata salvata,
    // e rispondere 202 success:true confermerebbe qualcosa che non esiste.
    // La gara fra richieste concorrenti, che rendeva il 500 un oracolo, e'
    // assorbita dalla 004 (ON CONFLICT DO NOTHING): cio' che arriva qui e' un
    // guasto (database giu', funzione mancante), indipendente dal cliente.
    console.error('Richiesta collegamento error:', error.message);
    return res.status(500).json({ error: 'Errore nell\'invio della richiesta. Riprova.' });
  }
});

// ==============================================================================
// GET /api/commercialisti/richieste - le proprie richieste ancora in attesa
// ==============================================================================
router.get('/richieste', authCommercialista, async (req, res) => {
  try {
    const richieste = await query(
      `SELECT c.id, c.stato, c.richiesto_da, c.data_richiesta,
              u.id AS user_id, u.username, u.email
       FROM collegamenti_commercialista c
       JOIN utenti u ON u.id = c.user_id
       WHERE c.commercialista_id = $1 AND c.stato = 'in_attesa'
       ORDER BY c.data_richiesta DESC NULLS LAST, c.id DESC`,
      [req.commercialista.id]
    );

    res.json({ success: true, richieste: richieste.rows, totale: richieste.rows.length });
  } catch (error) {
    console.error('Get richieste error:', error.message);
    res.status(500).json({ error: 'Errore nel recupero delle richieste' });
  }
});

// ==============================================================================
// GET /api/commercialisti/clienti/:userId - Get client details
// ==============================================================================
router.get('/clienti/:userId', authCommercialista, validateQuery(schemas.paginazione),
  requireCollegamento('dettaglio_cliente', req => ({ page: req.query.page, limit: req.query.limit })), async (req, res) => {
  try {
    const userId = req.clienteId;

    // Get client details
    const cliente = await queryOne(
      'SELECT id, username, email, created_at FROM utenti WHERE id = $1',
      [userId]
    );

    // L'ambito accettato dal cliente entra QUI, nelle query: fuori di qui e' una
    // dichiarazione d'intenti che il database non conosce.
    const ambitoConti = clausolaAmbito(req.ambito, { conto: 'cc.id' }, 2);
    const ambitoDate = clausolaAmbito(req.ambito, { data: 'm.data' }, 2 + ambitoConti.params.length);

    // Il saldo del conto si ferma anch'esso alla finestra concordata: mostrare il
    // saldo pieno significherebbe rivelare i movimenti che l'ambito esclude.
    const saldoDate = clausolaAmbito(req.ambito, { data: 'm.data' }, 2);
    const filtroConti = clausolaAmbito(req.ambito, { conto: 'cc.id' }, saldoDate.paramIndex);

    const conti = await query(
      `SELECT
        cc.id,
        cc.nome_banca,
        cc.intestatario,
        cc.iban,
        cc.attivo,
        cc.saldo_iniziale +
        COALESCE((
          SELECT SUM(CASE
            WHEN m.tipo = 'Entrata' THEN m.importo
            ELSE -m.importo
          END)
          FROM movimenti m
          WHERE m.conto_id = cc.id${saldoDate.sql}
        ), 0) as saldo_corrente
       FROM conti_correnti cc
       WHERE cc.user_id = $1${filtroConti.sql}
       ORDER BY cc.attivo DESC, cc.nome_banca`,
      [userId, ...saldoDate.params, ...filtroConti.params]
    );

    // Get movements with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const filtroMovimenti = ambitoConti.sql + ambitoDate.sql;
    const paramsMovimenti = [...ambitoConti.params, ...ambitoDate.params];

    // Count total movements
    const totalCount = await queryOne(
      `SELECT COUNT(*) as count
       FROM movimenti m
       JOIN conti_correnti cc ON cc.id = m.conto_id
       WHERE cc.user_id = $1${filtroMovimenti}`,
      [userId, ...paramsMovimenti]
    );
    const total = parseInt(totalCount.count);
    const totalPages = Math.ceil(total / limit);

    // Get paginated movements
    const iLimit = 2 + paramsMovimenti.length;
    const movimenti = await query(
      `SELECT m.*, cc.nome_banca
       FROM movimenti m
       JOIN conti_correnti cc ON cc.id = m.conto_id
       WHERE cc.user_id = $1${filtroMovimenti}
       ORDER BY m.data DESC
       LIMIT $${iLimit} OFFSET $${iLimit + 1}`,
      [userId, ...paramsMovimenti, limit, offset]
    );

    res.json({
      success: true,
      cliente,
      // L'ambito viaggia nella risposta: il commercialista deve sapere che sta
      // guardando una fetta, non il tutto.
      ambito: {
        dal: req.ambito?.dal || null,
        al: req.ambito?.al || null,
        conti: req.ambito?.conti || null
      },
      conti: conti.rows,
      movimenti: movimenti.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: 'Errore nel recupero dei dati del cliente' });
  }
});

// ==============================================================================
// DELETE /api/commercialisti/clienti/:userId - Disconnect client
// ==============================================================================
router.delete('/clienti/:userId', authCommercialista, requireCollegamento('disconnessione'), async (req, res) => {
  try {
    const userId = req.clienteId;
    const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.slice(0, 500) : null;

    await query(
      'SELECT disconnetti_cliente_commercialista($1, $2, $3, $4)',
      [req.commercialista.id, userId, 'commercialista', motivo]
    );

    res.json({
      success: true,
      message: 'Cliente disconnesso con successo'
    });
  } catch (error) {
    console.error('Disconnect client error:', error);
    res.status(500).json({ error: error.message || 'Errore nella disconnessione del cliente' });
  }
});

// ==============================================================================
// POST /api/commercialisti/clienti/:userId/export - Generate export for client
// ==============================================================================
// La validazione precede il controllo del collegamento: l'audit registra i
// parametri gia' validati, e una richiesta malformata non lascia righe.
router.post('/clienti/:userId/export', authCommercialista, validate(schemas.exportCommercialista),
  requireCollegamento('export', req => ({
    export_type: req.body.export_type,
    formato: req.body.formato,
    campi: req.body.campi_personalizzati || null,
    conto_id: req.body.conto_id || null,
    data_inizio: req.body.data_inizio || null,
    data_fine: req.body.data_fine || null,
    tutto_storico: req.body.tutto_storico
  })), async (req, res) => {
  try {
    const userId = req.clienteId;
    const config = req.body;

    // Get client info
    const cliente = await queryOne(
      'SELECT username, email FROM utenti WHERE id = $1',
      [userId]
    );

    // Import export logic from export.js
    const { queryAll } = require('../config/database');
    const moment = require('moment');
    const XLSX = require('xlsx');
    const PDFDocument = require('pdfkit');

    // Export configurations
    const EXPORT_CONFIGS = {
      commercialista: {
        name: 'Estratto per Commercialista',
        table: 'movimenti',
        fields: [
          'data', 'descrizione', 'importo', 'tipo', 'note',
          'anagrafica_nome', 'anagrafica_piva', 'anagrafica_email',
          'tipologia_nome', 'categoria', 'conto_nome'
        ]
      },
      semplice: {
        name: 'Estratto Semplice',
        table: 'movimenti',
        fields: ['data', 'descrizione', 'importo', 'tipo', 'anagrafica_nome']
      },
      entrate: {
        name: 'Solo Entrate',
        table: 'movimenti',
        fields: ['data', 'descrizione', 'importo', 'anagrafica_nome', 'categoria'],
        filters: { tipo: 'Entrata' }
      },
      uscite: {
        name: 'Solo Uscite',
        table: 'movimenti',
        fields: ['data', 'descrizione', 'importo', 'anagrafica_nome', 'categoria'],
        filters: { tipo: 'Uscita' }
      },
      custom: {
        name: 'Export Personalizzato',
        table: 'movimenti',
        fields: [] // Will be provided by user
      }
    };

    const exportConfig = EXPORT_CONFIGS[config.export_type];
    if (!exportConfig) {
      return res.status(400).json({ error: 'Tipo di export non valido' });
    }

    // Handle custom fields
    const fieldsToSelect = config.export_type === 'custom' && config.campi_personalizzati
      ? config.campi_personalizzati
      : exportConfig.fields;

    // Build query
    let sqlQuery = `
      SELECT
        m.data,
        m.descrizione,
        m.importo,
        m.tipo,
        m.note,
        m.categoria,
        a.nome as anagrafica_nome,
        a.piva as anagrafica_piva,
        a.email as anagrafica_email,
        t.nome as tipologia_nome,
        cc.nome_banca as conto_nome
      FROM movimenti m
      LEFT JOIN anagrafiche a ON a.id = m.anagrafica_id
      LEFT JOIN tipologie_anagrafiche t ON t.id = a.tipologia_id
      JOIN conti_correnti cc ON cc.id = m.conto_id
      WHERE cc.user_id = $1
    `;

    const params = [userId];
    let paramIndex = 2;

    // L'ambito accettato dal cliente vincola l'export prima di ogni filtro scelto
    // dal commercialista: e' il perimetro, non una preferenza.
    const ambitoExport = clausolaAmbito(
      req.ambito,
      { conto: 'm.conto_id', data: 'm.data' },
      paramIndex
    );
    sqlQuery += ambitoExport.sql;
    params.push(...ambitoExport.params);
    paramIndex = ambitoExport.paramIndex;

    // Add filters
    if (exportConfig.filters?.tipo) {
      sqlQuery += ` AND m.tipo = $${paramIndex}`;
      params.push(exportConfig.filters.tipo);
      paramIndex++;
    }

    if (config.conto_id && config.conto_id !== '') {
      // Un conto fuori ambito non si ignora in silenzio: si rifiuta, altrimenti
      // l'export tornerebbe vuoto senza spiegare perche'.
      if (!contoNellAmbito(req.ambito, config.conto_id)) {
        return res.status(403).json({
          error: 'Il conto richiesto non rientra nell\'ambito concesso dal cliente'
        });
      }
      sqlQuery += ` AND m.conto_id = $${paramIndex}`;
      params.push(parseInt(config.conto_id));
      paramIndex++;
    }

    if (!config.tutto_storico) {
      if (config.data_inizio) {
        sqlQuery += ` AND m.data >= $${paramIndex}`;
        params.push(config.data_inizio);
        paramIndex++;
      }
      if (config.data_fine) {
        sqlQuery += ` AND m.data <= $${paramIndex}`;
        params.push(config.data_fine);
        paramIndex++;
      }
    }

    // Add ordering
    const orderField = config.ordina_per === 'importo' ? 'm.importo' :
                       config.ordina_per === 'anagrafica' ? 'a.nome' : 'm.data';
    const orderDirection = config.ordine === 'asc' ? 'ASC' : 'DESC';
    sqlQuery += ` ORDER BY ${orderField} ${orderDirection}`;

    // Execute query
    const result = await queryAll(sqlQuery, params);
    const data = result || [];

    // Format data
    const formattedData = data.map(row => {
      const formatted = {};
      fieldsToSelect.forEach(field => {
        if (field === 'data') {
          formatted[field] = moment(row.data).format('DD/MM/YYYY');
        } else if (field === 'importo') {
          formatted[field] = parseFloat(row.importo).toFixed(2);
        } else {
          formatted[field] = row[field] || '';
        }
      });
      return formatted;
    });

    // Il registro dice quanti record sono usciti, non solo che l'export c'e' stato.
    // Prima di inviare: se non si scrive, l'export non parte.
    await completaAccesso(req.accessoId, formattedData.length);

    // Metadata
    const metadata = {
      tipo_export: config.export_type,
      nome_export: exportConfig.name,
      cliente: cliente.username,
      cliente_email: cliente.email,
      numero_record: formattedData.length,
      generato_il: new Date().toISOString(),
      generato_da: req.commercialista.ragione_sociale || req.commercialista.username,
      filtri_applicati: buildFiltersDescription(config)
    };

    // Handle different formats
    const formato = config.formato || 'json';

    if (formato === 'json') {
      // Return JSON for preview
      return res.json({
        metadata,
        data: formattedData,
        preview: formattedData.slice(0, 10)
      });
    } else if (formato === 'csv') {
      return exportToCsv(res, formattedData, metadata, cliente);
    } else if (formato === 'xlsx') {
      return exportToXlsx(res, formattedData, metadata, cliente);
    } else if (formato === 'pdf') {
      return exportToPdf(res, formattedData, metadata, cliente);
    }

  } catch (error) {
    console.error('Export client error:', error);
    res.status(500).json({ error: 'Errore nella generazione dell\'export' });
  }
});

// Helper functions for export formats
function buildFiltersDescription(config) {
  const filters = [];

  if (config.tutto_storico) {
    filters.push('Tutto lo storico');
  } else {
    if (config.data_inizio && config.data_fine) {
      filters.push(`Periodo: ${config.data_inizio} - ${config.data_fine}`);
    }
  }

  if (config.conto_id) filters.push(`Conto specifico selezionato`);

  return filters.join(', ') || 'Nessun filtro applicato';
}

function exportToCsv(res, data, metadata, cliente) {
  if (!data || data.length === 0) {
    return res.status(400).json({ error: 'Nessun dato da esportare' });
  }

  const moment = require('moment');
  const headers = Object.keys(data[0]);
  let csvContent = headers.join(',') + '\n';

  data.forEach(row => {
    const values = headers.map(header => {
      let value = row[header] || '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvContent += values.join(',') + '\n';
  });

  const filename = `${cliente.username}_${metadata.tipo_export}_${moment().format('YYYY-MM-DD')}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\ufeff' + csvContent);
}

function exportToXlsx(res, data, metadata, cliente) {
  if (!data || data.length === 0) {
    return res.status(400).json({ error: 'Nessun dato da esportare' });
  }

  const moment = require('moment');
  const XLSX = require('xlsx');

  const wb = XLSX.utils.book_new();

  // Sheet principale con i dati
  const ws = XLSX.utils.json_to_sheet(data);

  // Formattazione colonne (larghezza automatica)
  const range = XLSX.utils.decode_range(ws['!ref']);
  const colWidths = [];

  for (let c = range.s.c; c <= range.e.c; c++) {
    const header = data.length > 0 ? Object.keys(data[0])[c] : '';
    let maxWidth = header ? header.length : 10;

    for (let r = 0; r < Math.min(data.length, 100); r++) {
      const value = Object.values(data[r])[c];
      if (value) {
        maxWidth = Math.max(maxWidth, value.toString().length);
      }
    }

    colWidths.push({ width: Math.min(maxWidth + 2, 50) });
  }

  ws['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(wb, ws, 'Movimenti');

  // Sheet metadati
  const metaData = {
    'Cliente': metadata.cliente,
    'Email Cliente': metadata.cliente_email,
    'Tipo Export': metadata.nome_export,
    'Record Esportati': metadata.numero_record,
    'Generato il': moment(metadata.generato_il).format('DD/MM/YYYY HH:mm'),
    'Generato da': metadata.generato_da,
    'Filtri': metadata.filtri_applicati
  };
  const metaWs = XLSX.utils.json_to_sheet([metaData]);
  XLSX.utils.book_append_sheet(wb, metaWs, 'Informazioni');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `${cliente.username}_${metadata.tipo_export}_${moment().format('YYYY-MM-DD')}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

function exportToPdf(res, data, metadata, cliente) {
  try {
    const moment = require('moment');
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    const filename = `${cliente.username}_${metadata.tipo_export}_${moment().format('YYYY-MM-DD')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    // Header
    doc.fontSize(18).text('Prima Nota - Report Cliente', { align: 'center' });
    doc.moveDown(0.5);

    // Info Cliente
    doc.fontSize(12)
       .text(`Cliente: ${metadata.cliente} (${metadata.cliente_email})`)
       .text(`Tipo Export: ${metadata.nome_export}`)
       .text(`Generato il: ${moment(metadata.generato_il).format('DD/MM/YYYY HH:mm')}`)
       .text(`Generato da: ${metadata.generato_da}`)
       .text(`Record esportati: ${metadata.numero_record}`)
       .text(`Filtri: ${metadata.filtri_applicati}`)
       .moveDown();

    // Tabella dati (primi 30 record)
    if (data.length > 0) {
      doc.fontSize(10).fillColor('black');

      const headers = Object.keys(data[0]);
      const maxRecords = Math.min(data.length, 30);
      const colWidth = 120;
      let y = doc.y;

      // Headers
      doc.font('Helvetica-Bold');
      headers.forEach((header, i) => {
        if (i < 6) { // Mostra max 6 colonne
          doc.text(header.toUpperCase(), 50 + i * colWidth, y, { width: colWidth - 5 });
        }
      });
      doc.font('Helvetica');

      y += 20;

      // Dati
      for (let rowIndex = 0; rowIndex < maxRecords; rowIndex++) {
        const row = data[rowIndex];
        headers.forEach((header, colIndex) => {
          if (colIndex < 6) {
            const value = row[header] || '';
            doc.text(value.toString().substring(0, 20), 50 + colIndex * colWidth, y, { width: colWidth - 5 });
          }
        });

        y += 18;

        // Nuova pagina se necessario
        if (y > 550) {
          doc.addPage();
          y = 50;
        }
      }

      if (data.length > 30) {
        doc.moveDown()
           .fontSize(10)
           .fillColor('gray')
           .text(`Sono stati esportati ${data.length} record totali. Mostrando i primi 30.`, {
             align: 'center',
             italics: true
           })
           .text('Per visualizzare tutti i dati, utilizzare l\'export in formato CSV o Excel.', {
             align: 'center',
             italics: true
           });
      }
    }

    doc.end();
  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({ error: 'Errore nella generazione del PDF' });
  }
}

module.exports = router;
