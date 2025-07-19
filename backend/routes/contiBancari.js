// routes/contiBancari.js
const express = require('express');
const { query, queryOne, queryAll } = require('../config/database');
const auth = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// Middleware di autenticazione per tutte le route
router.use(auth);

// GET /api/conti-bancari - Lista tutti i conti dell'utente
router.get('/', async (req, res) => {
  try {
    const conti = await queryAll(`
      SELECT 
        cc.*,
        calcola_saldo_conto(cc.id) as saldo_corrente,
        (SELECT COUNT(*) FROM movimenti m WHERE m.conto_id = cc.id) as numero_movimenti
      FROM conti_correnti cc 
      WHERE cc.user_id = $1 
      ORDER BY cc.nome_banca, cc.intestatario
    `, [req.user.id]);
    
    res.json(conti);
  } catch (error) {
    console.error('Error fetching conti bancari:', error);
    res.status(500).json({ error: 'Errore durante il caricamento dei conti bancari' });
  }
});

// GET /api/conti-bancari/attivi - Solo conti attivi
router.get('/attivi', async (req, res) => {
  try {
    const conti = await queryAll(`
      SELECT 
        cc.*,
        calcola_saldo_conto(cc.id) as saldo_corrente
      FROM conti_correnti cc 
      WHERE cc.user_id = $1 AND cc.attivo = true
      ORDER BY cc.nome_banca, cc.intestatario
    `, [req.user.id]);
    
    res.json(conti);
  } catch (error) {
    console.error('Error fetching conti attivi:', error);
    res.status(500).json({ error: 'Errore durante il caricamento dei conti attivi' });
  }
});

// GET /api/conti-bancari/:id - Dettaglio singolo conto
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const conto = await queryOne(`
      SELECT 
        cc.*,
        calcola_saldo_conto(cc.id) as saldo_corrente,
        (SELECT COUNT(*) FROM movimenti m WHERE m.conto_id = cc.id) as numero_movimenti,
        (SELECT SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE 0 END) FROM movimenti m WHERE m.conto_id = cc.id) as totale_entrate,
        (SELECT SUM(CASE WHEN tipo = 'Uscita' THEN importo ELSE 0 END) FROM movimenti m WHERE m.conto_id = cc.id) as totale_uscite
      FROM conti_correnti cc 
      WHERE cc.id = $1 AND cc.user_id = $2
    `, [id, req.user.id]);
    
    if (!conto) {
      return res.status(404).json({ error: 'Conto bancario non trovato' });
    }
    
    res.json(conto);
  } catch (error) {
    console.error('Error fetching conto detail:', error);
    res.status(500).json({ error: 'Errore durante il caricamento del conto' });
  }
});

// POST /api/conti-bancari - Crea nuovo conto
router.post('/', validate(schemas.contoBancario), async (req, res) => {
  try {
    const { nome_banca, intestatario, iban, saldo_iniziale, attivo } = req.body;
    
    // Verifica se esiste già un conto con lo stesso IBAN (se fornito)
    if (iban && iban.trim()) {
      const existingConto = await queryOne(
        'SELECT id FROM conti_correnti WHERE iban = $1 AND user_id = $2',
        [iban.trim(), req.user.id]
      );
      
      if (existingConto) {
        return res.status(400).json({ error: 'Esiste già un conto con questo IBAN' });
      }
    }
    
    const result = await query(`
      INSERT INTO conti_correnti 
      (nome_banca, intestatario, iban, saldo_iniziale, attivo, user_id) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `, [nome_banca, intestatario, iban || null, saldo_iniziale || 0, attivo !== false, req.user.id]);
    
    const newConto = result.rows[0];
    
    // Aggiungi il saldo corrente al risultato
    newConto.saldo_corrente = newConto.saldo_iniziale;
    
    res.status(201).json(newConto);
  } catch (error) {
    console.error('Error creating conto bancario:', error);
    res.status(500).json({ error: 'Errore durante la creazione del conto bancario' });
  }
});

// PUT /api/conti-bancari/:id - Aggiorna conto esistente
router.put('/:id', validate(schemas.contoBancario), async (req, res) => {
  try {
    const { id } = req.params;
    const { nome_banca, intestatario, iban, saldo_iniziale, attivo } = req.body;
    
    // Verifica che il conto appartenga all'utente
    const existingConto = await queryOne(
      'SELECT id FROM conti_correnti WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (!existingConto) {
      return res.status(404).json({ error: 'Conto bancario non trovato' });
    }
    
    // Verifica IBAN duplicato (escludendo il conto corrente)
    if (iban && iban.trim()) {
      const duplicateIban = await queryOne(
        'SELECT id FROM conti_correnti WHERE iban = $1 AND user_id = $2 AND id != $3',
        [iban.trim(), req.user.id, id]
      );
      
      if (duplicateIban) {
        return res.status(400).json({ error: 'Esiste già un conto con questo IBAN' });
      }
    }
    
    const result = await query(`
      UPDATE conti_correnti 
      SET nome_banca = $1, intestatario = $2, iban = $3, saldo_iniziale = $4, attivo = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND user_id = $7
      RETURNING *
    `, [nome_banca, intestatario, iban || null, saldo_iniziale || 0, attivo !== false, id, req.user.id]);
    
    const updatedConto = result.rows[0];
    
    // Aggiungi il saldo corrente
    const saldoCorrente = await queryOne(
      'SELECT calcola_saldo_conto($1) as saldo_corrente',
      [id]
    );
    updatedConto.saldo_corrente = saldoCorrente.saldo_corrente;
    
    res.json(updatedConto);
  } catch (error) {
    console.error('Error updating conto bancario:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del conto bancario' });
  }
});

// DELETE /api/conti-bancari/:id - Elimina conto (solo se non ha movimenti)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica che il conto appartenga all'utente
    const conto = await queryOne(
      'SELECT id FROM conti_correnti WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (!conto) {
      return res.status(404).json({ error: 'Conto bancario non trovato' });
    }
    
    // Verifica se ci sono movimenti associati
    const movimenti = await queryOne(
      'SELECT COUNT(*) as count FROM movimenti WHERE conto_id = $1',
      [id]
    );
    
    if (parseInt(movimenti.count) > 0) {
      return res.status(400).json({ 
        error: 'Impossibile eliminare il conto: sono presenti movimenti associati',
        suggestion: 'Disattiva il conto invece di eliminarlo'
      });
    }
    
    await query(
      'DELETE FROM conti_correnti WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    res.json({ message: 'Conto bancario eliminato con successo' });
  } catch (error) {
    console.error('Error deleting conto bancario:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione del conto bancario' });
  }
});

// PATCH /api/conti-bancari/:id/toggle-stato - Attiva/disattiva conto
router.patch('/:id/toggle-stato', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      UPDATE conti_correnti 
      SET attivo = NOT attivo, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conto bancario non trovato' });
    }
    
    const updatedConto = result.rows[0];
    
    res.json({
      message: `Conto ${updatedConto.attivo ? 'attivato' : 'disattivato'} con successo`,
      conto: updatedConto
    });
  } catch (error) {
    console.error('Error toggling conto stato:', error);
    res.status(500).json({ error: 'Errore durante il cambio stato del conto' });
  }
});

// GET /api/conti-bancari/:id/saldo-storico - Storico saldi (ultimi 12 mesi)
router.get('/:id/saldo-storico', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica che il conto appartenga all'utente
    const conto = await queryOne(
      'SELECT saldo_iniziale FROM conti_correnti WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (!conto) {
      return res.status(404).json({ error: 'Conto bancario non trovato' });
    }
    
    const storicoSaldi = await queryAll(`
      WITH monthly_movements AS (
        SELECT 
          DATE_TRUNC('month', data) as mese,
          SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE -importo END) as saldo_mese
        FROM movimenti 
        WHERE conto_id = $1 
          AND data >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', data)
        ORDER BY mese
      ),
      running_totals AS (
        SELECT 
          mese,
          saldo_mese,
          SUM(saldo_mese) OVER (ORDER BY mese) + $2 as saldo_progressivo
        FROM monthly_movements
      )
      SELECT 
        TO_CHAR(mese, 'YYYY-MM') as mese,
        saldo_mese,
        saldo_progressivo
      FROM running_totals
      ORDER BY mese
    `, [id, conto.saldo_iniziale]);
    
    res.json(storicoSaldi);
  } catch (error) {
    console.error('Error fetching saldo storico:', error);
    res.status(500).json({ error: 'Errore durante il caricamento dello storico saldi' });
  }
});

module.exports = router;
