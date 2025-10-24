// routes/utentiCommercialista.js
// Routes for users to manage their commercialista relationship
const express = require('express');
const { query, queryOne } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ==============================================================================
// POST /api/utenti/genera-token-invito - Generate invitation token for commercialista
// ==============================================================================
router.post('/genera-token-invito', auth, async (req, res) => {
  try {
    const { giorni_validita = 30 } = req.body;

    // Generate token using database function
    const result = await queryOne(
      'SELECT genera_token_invito($1, $2) as token',
      [req.user.id, giorni_validita]
    );

    // Get token details
    const tokenInfo = await queryOne(
      `SELECT token, scadenza, created_at
       FROM token_inviti
       WHERE token = $1`,
      [result.token]
    );

    res.json({
      success: true,
      message: 'Token generato con successo',
      token: tokenInfo.token,
      scadenza: tokenInfo.scadenza,
      istruzioni: 'Comunica questo token al tuo commercialista. Ha validità fino alla data di scadenza.'
    });
  } catch (error) {
    console.error('Generate token error:', error);
    res.status(500).json({ error: 'Errore nella generazione del token' });
  }
});

// ==============================================================================
// GET /api/utenti/token-inviti - Get user's invitation tokens
// ==============================================================================
router.get('/token-inviti', auth, async (req, res) => {
  try {
    const tokens = await query(
      `SELECT t.id, t.token, t.scadenza, t.usato, t.data_utilizzo,
              t.created_at, c.ragione_sociale as commercialista_nome
       FROM token_inviti t
       LEFT JOIN commercialisti c ON c.id = t.commercialista_id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      tokens: tokens.rows
    });
  } catch (error) {
    console.error('Get tokens error:', error);
    res.status(500).json({ error: 'Errore nel recupero dei token' });
  }
});

// ==============================================================================
// GET /api/utenti/commercialista - Get user's commercialista info
// ==============================================================================
router.get('/commercialista', auth, async (req, res) => {
  try {
    if (!req.user.commercialista_id) {
      return res.json({
        success: true,
        has_commercialista: false,
        commercialista: null
      });
    }

    // Get commercialista info
    const commercialista = await queryOne(
      `SELECT c.id, c.username, c.email, c.ragione_sociale, c.partita_iva, c.telefono,
              col.data_collegamento, col.attivo
       FROM commercialisti c
       JOIN collegamenti_commercialista col ON col.commercialista_id = c.id
       WHERE col.user_id = $1 AND col.attivo = TRUE`,
      [req.user.id]
    );

    res.json({
      success: true,
      has_commercialista: !!commercialista,
      commercialista
    });
  } catch (error) {
    console.error('Get commercialista error:', error);
    res.status(500).json({ error: 'Errore nel recupero delle informazioni del commercialista' });
  }
});

// ==============================================================================
// DELETE /api/utenti/commercialista - Disconnect from commercialista
// ==============================================================================
router.delete('/commercialista', auth, async (req, res) => {
  try {
    // Deactivate connection
    await query(
      `UPDATE collegamenti_commercialista
       SET attivo = FALSE
       WHERE user_id = $1`,
      [req.user.id]
    );

    // Remove commercialista_id from user
    await query(
      'UPDATE utenti SET commercialista_id = NULL WHERE id = $1',
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'Collegamento con commercialista rimosso'
    });
  } catch (error) {
    console.error('Disconnect commercialista error:', error);
    res.status(500).json({ error: 'Errore nella rimozione del collegamento' });
  }
});

module.exports = router;
