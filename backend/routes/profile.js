// Aggiungi questo endpoint a routes/auth.js o crea routes/profile.js

// DELETE /api/auth/account - Elimina account utente
router.delete('/account', auth, async (req, res) => {
  const { password } = req.body;
  const userId = req.user.id;

  if (!password) {
    return res.status(400).json({ 
      error: 'Password richiesta per confermare l\'eliminazione' 
    });
  }

  try {
    // 1. Verifica password corrente
    const user = await queryOne(
      'SELECT id, password_hash FROM utenti WHERE id = $1',
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }

    const bcrypt = require('bcrypt');
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Password non corretta' });
    }

    // 2. Elimina dati in cascata (con transazione)
    await withTransaction(async (client) => {
      console.log(`🗑️ Eliminazione account utente ${userId} in corso...`);

      // Elimina movimenti
      const movimentiResult = await client.query(
        'DELETE FROM movimenti WHERE user_id = $1',
        [userId]
      );
      console.log(`📊 Eliminati ${movimentiResult.rowCount} movimenti`);

      // Elimina anagrafiche
      const anagraficheResult = await client.query(
        'DELETE FROM anagrafiche WHERE user_id = $1',
        [userId]
      );
      console.log(`👥 Eliminate ${anagraficheResult.rowCount} anagrafiche`);

      // Elimina tipologie anagrafiche
      const tipologieResult = await client.query(
        'DELETE FROM tipologie_anagrafiche WHERE user_id = $1',
        [userId]
      );
      console.log(`🏷️ Eliminate ${tipologieResult.rowCount} tipologie`);

      // Elimina categorie
      const categorieMovimentiResult = await client.query(
        'DELETE FROM categorie_movimenti WHERE user_id = $1',
        [userId]
      );
      const categorieAnagraficheResult = await client.query(
        'DELETE FROM categorie_anagrafiche WHERE user_id = $1',
        [userId]
      );
      console.log(`📂 Eliminate ${categorieMovimentiResult.rowCount + categorieAnagraficheResult.rowCount} categorie`);

      // Elimina conti correnti
      const contiResult = await client.query(
        'DELETE FROM conti_correnti WHERE user_id = $1',
        [userId]
      );
      console.log(`💳 Eliminati ${contiResult.rowCount} conti correnti`);

      // Elimina alerts se esistono
      await client.query('DELETE FROM alerts WHERE user_id = $1', [userId]);

      // Elimina utente (ultimo)
      const userResult = await client.query(
        'DELETE FROM utenti WHERE id = $1',
        [userId]
      );
      console.log(`👤 Eliminato utente ${userId}`);

      if (userResult.rowCount === 0) {
        throw new Error('Errore nell\'eliminazione dell\'utente');
      }
    });

    console.log(`✅ Account ${userId} eliminato con successo`);
    
    res.json({
      success: true,
      message: 'Account eliminato con successo',
      deleted_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Errore eliminazione account:', error);
    res.status(500).json({ 
      error: 'Errore durante l\'eliminazione dell\'account',
      details: error.message 
    });
  }
});

// GET /api/auth/account/stats - Statistiche prima dell'eliminazione
router.get('/account/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await queryOne(`
      SELECT 
        (SELECT COUNT(*) FROM movimenti WHERE user_id = $1) as movimenti,
        (SELECT COUNT(*) FROM anagrafiche WHERE user_id = $1) as anagrafiche,
        (SELECT COUNT(*) FROM conti_correnti WHERE user_id = $1) as conti,
        (SELECT COUNT(*) FROM tipologie_anagrafiche WHERE user_id = $1) as tipologie,
        (SELECT created_at FROM utenti WHERE id = $1) as account_created
    `, [userId]);

    res.json(stats);
  } catch (error) {
    console.error('Errore nel recupero statistiche:', error);
    res.status(500).json({ error: 'Errore nel recupero delle statistiche' });
  }
});

module.exports = router;