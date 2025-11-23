// routes/commercialisti.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, queryOne } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ==============================================================================
// MIDDLEWARE: Verify commercialista authentication
// ==============================================================================
const authCommercialista = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Accesso negato. Token non fornito.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify commercialista exists
    const commercialista = await queryOne(
      'SELECT id, username, email, ragione_sociale, partita_iva, telefono FROM commercialisti WHERE id = $1',
      [decoded.id]
    );

    if (!commercialista || decoded.tipo !== 'commercialista') {
      return res.status(401).json({ error: 'Token non valido.' });
    }

    req.commercialista = commercialista;
    next();
  } catch (error) {
    console.error('Commercialista auth error:', error);
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
      'SELECT id FROM commercialisti WHERE username = $1 OR email = $2',
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
       RETURNING id, username, email, ragione_sociale, partita_iva, telefono, created_at`,
      [username, password_hash, email, ragione_sociale, partita_iva, telefono]
    );

    // Generate JWT token
    const token = jwt.sign(
      { id: result.id, username: result.username, tipo: 'commercialista' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Registrazione completata con successo',
      commercialista: result,
      token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Errore durante la registrazione' });
  }
});

// ==============================================================================
// POST /api/commercialisti/login - Login commercialista
// ==============================================================================
router.post('/login', async (req, res) => {
  try {
    console.log('🔍 COMMERCIALISTA LOGIN REQUEST:', {
      body: req.body,
      contentType: req.get('Content-Type'),
      origin: req.get('Origin')
    });
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password sono obbligatori' });
    }

    // Get commercialista
    const commercialista = await queryOne(
      'SELECT id, username, email, password_hash, ragione_sociale, partita_iva, telefono FROM commercialisti WHERE username = $1',
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

    // Generate token
    const token = jwt.sign(
      { id: commercialista.id, username: commercialista.username, tipo: 'commercialista' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password_hash from response
    delete commercialista.password_hash;

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
// GET /api/commercialisti/dashboard - Get dashboard with clients summary
// ==============================================================================
router.get('/dashboard', authCommercialista, async (req, res) => {
  try {
    // Get clients summary using database function
    const clienti = await query(
      'SELECT * FROM get_commercialista_clients_summary($1)',
      [req.commercialista.id]
    );

    // Get unread messages count
    const unreadMessages = await query(
      `SELECT collegamento_id, COUNT(*) as unread_count
       FROM messaggi_commercialista m
       JOIN collegamenti_commercialista c ON c.id = m.collegamento_id
       WHERE c.commercialista_id = $1
       AND m.mittente_tipo = 'user'
       AND m.letto = FALSE
       GROUP BY collegamento_id`,
      [req.commercialista.id]
    );

    // Merge unread messages with clients
    const clientiConMessaggi = clienti.rows.map(cliente => {
      const unread = unreadMessages.rows.find(um => um.user_id === cliente.user_id);
      return {
        ...cliente,
        unread_messages: unread ? parseInt(unread.unread_count) : 0
      };
    });

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
router.post('/collega-cliente', authCommercialista, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token richiesto' });
    }

    // Use database function to validate and use token
    const result = await queryOne(
      'SELECT usa_token_invito($1, $2) as success',
      [token, req.commercialista.id]
    );

    // Get connected user info
    const userInfo = await queryOne(
      `SELECT u.id, u.username, u.email
       FROM collegamenti_commercialista c
       JOIN utenti u ON u.id = c.user_id
       WHERE c.commercialista_id = $1
       ORDER BY c.data_collegamento DESC
       LIMIT 1`,
      [req.commercialista.id]
    );

    res.json({
      success: true,
      message: 'Cliente collegato con successo',
      cliente: userInfo
    });
  } catch (error) {
    console.error('Connect client error:', error);
    res.status(400).json({
      error: error.message || 'Errore nel collegamento del cliente'
    });
  }
});

// ==============================================================================
// GET /api/commercialisti/clienti/:userId - Get client details
// ==============================================================================
router.get('/clienti/:userId', authCommercialista, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Verify commercialista has access to this client
    const collegamento = await queryOne(
      `SELECT id FROM collegamenti_commercialista
       WHERE commercialista_id = $1 AND user_id = $2 AND attivo = TRUE`,
      [req.commercialista.id, userId]
    );

    if (!collegamento) {
      return res.status(403).json({
        error: 'Non hai accesso a questo cliente'
      });
    }

    // Get client details
    const cliente = await queryOne(
      'SELECT id, username, email, created_at FROM utenti WHERE id = $1',
      [userId]
    );

    // Get client accounts with calculated balance
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
          WHERE m.conto_id = cc.id
        ), 0) as saldo_corrente
       FROM conti_correnti cc
       WHERE cc.user_id = $1
       ORDER BY cc.attivo DESC, cc.nome_banca`,
      [userId]
    );

    // Get movements with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Count total movements
    const totalCount = await queryOne(
      `SELECT COUNT(*) as count
       FROM movimenti m
       JOIN conti_correnti cc ON cc.id = m.conto_id
       WHERE cc.user_id = $1`,
      [userId]
    );
    const total = parseInt(totalCount.count);
    const totalPages = Math.ceil(total / limit);

    // Get paginated movements
    const movimenti = await query(
      `SELECT m.*, cc.nome_banca
       FROM movimenti m
       JOIN conti_correnti cc ON cc.id = m.conto_id
       WHERE cc.user_id = $1
       ORDER BY m.data DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({
      success: true,
      cliente,
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
router.delete('/clienti/:userId', authCommercialista, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Call the disconnect function
    await query(
      'SELECT disconnetti_cliente_commercialista($1, $2)',
      [req.commercialista.id, userId]
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

module.exports = router;
