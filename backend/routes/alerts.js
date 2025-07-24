// routes/alerts.js - GESTIONE ALERTS
const express = require('express');
const { query, queryOne, queryAll } = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Middleware di autenticazione per tutte le route
router.use(auth);

// PATCH /api/alerts/:id/read - Segna alert come letto
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log('📖 Marking alert as read:', { alertId: id, userId });

    // Verifica che l'alert appartenga all'utente
    const alert = await queryOne(
      'SELECT id, titolo FROM alerts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (!alert) {
      return res.status(404).json({ error: 'Avviso non trovato' });
    }

    // Segna come letto (o elimina se gli alerts vengono eliminati quando letti)
    const result = await queryOne(`
      UPDATE alerts 
      SET letto = true, data_lettura = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, userId]);

    if (!result) {
      return res.status(500).json({ error: 'Errore nell\'aggiornamento dell\'avviso' });
    }

    res.json({
      success: true,
      message: `Avviso "${alert.titolo}" contrassegnato come letto`,
      alert: result
    });

  } catch (error) {
    console.error('❌ Error marking alert as read:', error);
    res.status(500).json({ error: 'Errore durante l\'operazione' });
  }
});

// DELETE /api/alerts/:id - Elimina alert
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log('🗑️ Deleting alert:', { alertId: id, userId });

    // Verifica che l'alert appartenga all'utente e recupera il titolo
    const alert = await queryOne(
      'SELECT id, titolo, messaggio FROM alerts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (!alert) {
      return res.status(404).json({ error: 'Avviso non trovato' });
    }

    // Elimina l'alert
    await query(
      'DELETE FROM alerts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    res.json({
      success: true,
      message: `Avviso "${alert.titolo}" eliminato con successo`,
      deletedAlert: {
        id: alert.id,
        titolo: alert.titolo
      }
    });

  } catch (error) {
    console.error('❌ Error deleting alert:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione dell\'avviso' });
  }
});

// PATCH /api/alerts/mark-all-read - Segna tutti gli alerts come letti
router.patch('/mark-all-read', async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('📚 Marking all alerts as read for user:', userId);

    // Conta quanti alerts non letti ci sono
    const unreadCount = await queryOne(
      'SELECT COUNT(*) as count FROM alerts WHERE user_id = $1 AND (letto = false OR letto IS NULL)',
      [userId]
    );

    if (parseInt(unreadCount.count) === 0) {
      return res.json({
        success: true,
        message: 'Nessun avviso da contrassegnare come letto',
        updatedCount: 0
      });
    }

    // Segna tutti come letti
    const result = await query(`
      UPDATE alerts 
      SET letto = true, data_lettura = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND (letto = false OR letto IS NULL)
      RETURNING id, titolo
    `, [userId]);

    res.json({
      success: true,
      message: `${result.rows.length} avvisi contrassegnati come letti`,
      updatedCount: result.rows.length,
      updatedAlerts: result.rows
    });

  } catch (error) {
    console.error('❌ Error marking all alerts as read:', error);
    res.status(500).json({ error: 'Errore durante l\'operazione di massa' });
  }
});

// GET /api/alerts - Lista tutti gli alerts (opzionale, per debug)
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { letto } = req.query;

    let whereCondition = 'user_id = $1';
    let params = [userId];

    if (letto !== undefined) {
      whereCondition += ' AND letto = $2';
      params.push(letto === 'true');
    }

    const alerts = await queryAll(`
      SELECT id, titolo, messaggio, tipo, priorita, letto, data_creazione, data_lettura
      FROM alerts 
      WHERE ${whereCondition}
      ORDER BY data_creazione DESC
    `, params);

    res.json({
      alerts,
      count: alerts.length,
      unread: alerts.filter(a => !a.letto).length
    });

  } catch (error) {
    console.error('❌ Error fetching alerts:', error);
    res.status(500).json({ error: 'Errore durante il caricamento degli avvisi' });
  }
});

module.exports = router;