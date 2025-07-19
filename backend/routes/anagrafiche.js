// routes/anagrafiche.js
const express = require('express');
const { query, queryOne, queryAll } = require('../config/database');
const auth = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// Middleware di autenticazione per tutte le route
router.use(auth);

// GET /api/anagrafiche/export - Export anagrafiche
router.get('/export', async (req, res) => {
  try {
    const userId = req.user.id;
    const { formato = 'csv', tipo } = req.query;

    let whereCondition = 'a.user_id = $1';
    let params = [userId];

    if (tipo && ['Cliente', 'Fornitore'].includes(tipo)) {
      whereCondition += ' AND a.tipo = $2';
      params.push(tipo);
    }

    const anagrafiche = await queryAll(`
      SELECT 
        a.nome,
        a.tipo,
        a.categoria,
        a.email,
        a.telefono,
        a.piva,
        a.indirizzo,
        CASE WHEN a.attivo THEN 'Attivo' ELSE 'Inattivo' END as stato,
        COALESCE(stats.numero_movimenti, 0) as numero_movimenti,
        COALESCE(stats.totale_entrate, 0) as totale_entrate,
        COALESCE(stats.totale_uscite, 0) as totale_uscite,
        COALESCE(stats.ultimo_movimento, NULL) as ultimo_movimento,
        a.created_at::date as data_creazione
      FROM anagrafiche a
      LEFT JOIN (
        SELECT 
          m.anagrafica_id,
          COUNT(*) as numero_movimenti,
          SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END) as totale_entrate,
          SUM(CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END) as totale_uscite,
          MAX(m.data) as ultimo_movimento
        FROM movimenti m
        WHERE m.user_id = $1
        GROUP BY m.anagrafica_id
      ) stats ON a.id = stats.anagrafica_id
      WHERE ${whereCondition}
      ORDER BY a.tipo, a.nome
    `, params);

    if (formato === 'xlsx') {
      const XLSX = require('xlsx');
      const ws = XLSX.utils.json_to_sheet(anagrafiche);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Anagrafiche');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="anagrafiche_${new Date().toISOString().split('T')[0]}.xlsx"`);
      res.send(buffer);
    } else {
      // Default CSV  
      const fields = Object.keys(anagrafiche[0] || {});
      let csvContent = fields.join(',') + '\n';
      
      anagrafiche.forEach(anagrafica => {
        const values = fields.map(field => {
          let value = anagrafica[field];
          if (value === null || value === undefined) value = '';
          if (typeof value === 'string' && value.includes(',')) {
            value = `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        });
        csvContent += values.join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="anagrafiche_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    }

  } catch (error) {
    console.error('Error exporting anagrafiche:', error);
    res.status(500).json({ error: 'Errore durante l\'export delle anagrafiche' });
  }
});

// GET /api/anagrafiche - Lista tutte le anagrafiche dell'utente
router.get('/', async (req, res) => {
  try {
    const { tipo, categoria, search, attivo } = req.query;
    
    let whereConditions = ['a.user_id = $1'];
    let params = [req.user.id];
    let paramIndex = 2;
    
    // Filtro per tipo
    if (tipo && ['Cliente', 'Fornitore'].includes(tipo)) {
      whereConditions.push(`a.tipo = $${paramIndex}`);
      params.push(tipo);
      paramIndex++;
    }
    
    // Filtro per categoria
    if (categoria) {
      whereConditions.push(`a.categoria ILIKE $${paramIndex}`);
      params.push(`%${categoria}%`);
      paramIndex++;
    }
    
    // Filtro per stato attivo
    if (attivo !== undefined) {
      whereConditions.push(`a.attivo = $${paramIndex}`);
      params.push(attivo === 'true');
      paramIndex++;
    }
    
    // Ricerca testuale
    if (search) {
      whereConditions.push(`(a.nome ILIKE $${paramIndex} OR a.email ILIKE $${paramIndex} OR a.piva ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    const anagrafiche = await queryAll(`
      SELECT 
        a.*,
        COUNT(m.id) as numero_movimenti,
        COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END), 0) as totale_entrate,
        COALESCE(SUM(CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END), 0) as totale_uscite,
        MAX(m.data) as ultimo_movimento
      FROM anagrafiche a
      LEFT JOIN movimenti m ON a.id = m.anagrafica_id
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY a.id
      ORDER BY a.nome
    `, params);
    
    res.json(anagrafiche);
  } catch (error) {
    console.error('Error fetching anagrafiche:', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle anagrafiche' });
  }
});

// GET /api/anagrafiche/categorie - Lista categorie uniche
router.get('/categorie', async (req, res) => {
  try {
    const { tipo } = req.query;
    
    let whereCondition = 'user_id = $1 AND categoria IS NOT NULL AND categoria != \'\'';
    let params = [req.user.id];
    
    if (tipo && ['Cliente', 'Fornitore'].includes(tipo)) {
      whereCondition += ' AND tipo = $2';
      params.push(tipo);
    }
    
    const categorie = await queryAll(`
      SELECT DISTINCT categoria, COUNT(*) as count
      FROM anagrafiche 
      WHERE ${whereCondition}
      GROUP BY categoria
      ORDER BY categoria
    `, params);
    
    res.json(categorie);
  } catch (error) {
    console.error('Error fetching categorie:', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle categorie' });
  }
});

// GET /api/anagrafiche/attive - Solo anagrafiche attive (per dropdown)
router.get('/attive', async (req, res) => {
  try {
    const { tipo } = req.query;
    
    let whereCondition = 'user_id = $1 AND attivo = true';
    let params = [req.user.id];
    
    if (tipo && ['Cliente', 'Fornitore'].includes(tipo)) {
      whereCondition += ' AND tipo = $2';
      params.push(tipo);
    }
    
    const anagrafiche = await queryAll(`
      SELECT id, nome, tipo, categoria, email, telefono
      FROM anagrafiche 
      WHERE ${whereCondition}
      ORDER BY nome
    `, params);
    
    res.json(anagrafiche);
  } catch (error) {
    console.error('Error fetching anagrafiche attive:', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle anagrafiche attive' });
  }
});

// GET /api/anagrafiche/:id - Dettaglio singola anagrafica
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const anagrafica = await queryOne(`
      SELECT 
        a.*,
        COUNT(m.id) as numero_movimenti,
        COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END), 0) as totale_entrate,
        COALESCE(SUM(CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END), 0) as totale_uscite,
        MAX(m.data) as ultimo_movimento,
        MIN(m.data) as primo_movimento
      FROM anagrafiche a
      LEFT JOIN movimenti m ON a.id = m.anagrafica_id
      WHERE a.id = $1 AND a.user_id = $2
      GROUP BY a.id
    `, [id, req.user.id]);
    
    if (!anagrafica) {
      return res.status(404).json({ error: 'Anagrafica non trovata' });
    }
    
    res.json(anagrafica);
  } catch (error) {
    console.error('Error fetching anagrafica detail:', error);
    res.status(500).json({ error: 'Errore durante il caricamento dell\'anagrafica' });
  }
});

// POST /api/anagrafiche - Crea nuova anagrafica
router.post('/', validate(schemas.anagrafica), async (req, res) => {
  try {
    const { nome, tipo, categoria, email, telefono, piva, indirizzo, attivo } = req.body;
    
    // Verifica se esiste già un'anagrafica con stesso nome e tipo
    const existingAnagrafica = await queryOne(
      'SELECT id FROM anagrafiche WHERE LOWER(nome) = LOWER($1) AND tipo = $2 AND user_id = $3',
      [nome, tipo, req.user.id]
    );
    
    if (existingAnagrafica) {
      return res.status(400).json({ 
        error: `Esiste già un ${tipo.toLowerCase()} con questo nome` 
      });
    }
    
    // Verifica P.IVA duplicata (se fornita)
    if (piva && piva.trim()) {
      const existingPiva = await queryOne(
        'SELECT id, nome FROM anagrafiche WHERE piva = $1 AND user_id = $2',
        [piva.trim(), req.user.id]
      );
      
      if (existingPiva) {
        return res.status(400).json({ 
          error: `P.IVA già associata a: ${existingPiva.nome}` 
        });
      }
    }
    
    const result = await query(`
      INSERT INTO anagrafiche 
      (nome, tipo, categoria, email, telefono, piva, indirizzo, attivo, user_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING *
    `, [
      nome, 
      tipo, 
      categoria || null, 
      email || null, 
      telefono || null, 
      piva || null, 
      indirizzo || null, 
      attivo !== false, 
      req.user.id
    ]);
    
    const newAnagrafica = result.rows[0];
    
    res.status(201).json(newAnagrafica);
  } catch (error) {
    console.error('Error creating anagrafica:', error);
    res.status(500).json({ error: 'Errore durante la creazione dell\'anagrafica' });
  }
});

// PUT /api/anagrafiche/:id - Aggiorna anagrafica esistente
router.put('/:id', validate(schemas.anagrafica), async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, tipo, categoria, email, telefono, piva, indirizzo, attivo } = req.body;
    
    // Verifica che l'anagrafica appartenga all'utente
    const existingAnagrafica = await queryOne(
      'SELECT id FROM anagrafiche WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (!existingAnagrafica) {
      return res.status(404).json({ error: 'Anagrafica non trovata' });
    }
    
    // Verifica nome duplicato (escludendo l'anagrafica corrente)
    const duplicateName = await queryOne(
      'SELECT id FROM anagrafiche WHERE LOWER(nome) = LOWER($1) AND tipo = $2 AND user_id = $3 AND id != $4',
      [nome, tipo, req.user.id, id]
    );
    
    if (duplicateName) {
      return res.status(400).json({ 
        error: `Esiste già un ${tipo.toLowerCase()} con questo nome` 
      });
    }
    
    // Verifica P.IVA duplicata (se fornita, escludendo l'anagrafica corrente)
    if (piva && piva.trim()) {
      const duplicatePiva = await queryOne(
        'SELECT id, nome FROM anagrafiche WHERE piva = $1 AND user_id = $2 AND id != $3',
        [piva.trim(), req.user.id, id]
      );
      
      if (duplicatePiva) {
        return res.status(400).json({ 
          error: `P.IVA già associata a: ${duplicatePiva.nome}` 
        });
      }
    }
    
    const result = await query(`
      UPDATE anagrafiche 
      SET nome = $1, tipo = $2, categoria = $3, email = $4, telefono = $5, 
          piva = $6, indirizzo = $7, attivo = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9 AND user_id = $10
      RETURNING *
    `, [
      nome, 
      tipo, 
      categoria || null, 
      email || null, 
      telefono || null, 
      piva || null, 
      indirizzo || null, 
      attivo !== false, 
      id, 
      req.user.id
    ]);
    
    const updatedAnagrafica = result.rows[0];
    
    res.json(updatedAnagrafica);
  } catch (error) {
    console.error('Error updating anagrafica:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento dell\'anagrafica' });
  }
});

// DELETE /api/anagrafiche/:id - Elimina anagrafica (solo se non ha movimenti)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica che l'anagrafica appartenga all'utente
    const anagrafica = await queryOne(
      'SELECT id, nome FROM anagrafiche WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (!anagrafica) {
      return res.status(404).json({ error: 'Anagrafica non trovata' });
    }
    
    // Verifica se ci sono movimenti associati
    const movimenti = await queryOne(
      'SELECT COUNT(*) as count FROM movimenti WHERE anagrafica_id = $1',
      [id]
    );
    
    if (parseInt(movimenti.count) > 0) {
      return res.status(400).json({ 
        error: 'Impossibile eliminare l\'anagrafica: sono presenti movimenti associati',
        suggestion: 'Disattiva l\'anagrafica invece di eliminarla'
      });
    }
    
    await query(
      'DELETE FROM anagrafiche WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    res.json({ message: `Anagrafica "${anagrafica.nome}" eliminata con successo` });
  } catch (error) {
    console.error('Error deleting anagrafica:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione dell\'anagrafica' });
  }
});

// PATCH /api/anagrafiche/:id/toggle-stato - Attiva/disattiva anagrafica
router.patch('/:id/toggle-stato', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      UPDATE anagrafiche 
      SET attivo = NOT attivo, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anagrafica non trovata' });
    }
    
    const updatedAnagrafica = result.rows[0];
    
    res.json({
      message: `Anagrafica "${updatedAnagrafica.nome}" ${updatedAnagrafica.attivo ? 'attivata' : 'disattivata'} con successo`,
      anagrafica: updatedAnagrafica
    });
  } catch (error) {
    console.error('Error toggling anagrafica stato:', error);
    res.status(500).json({ error: 'Errore durante il cambio stato dell\'anagrafica' });
  }
});

// GET /api/anagrafiche/:id/movimenti - Movimenti dell'anagrafica
router.get('/:id/movimenti', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    // Verifica che l'anagrafica appartenga all'utente
    const anagrafica = await queryOne(
      'SELECT id FROM anagrafiche WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (!anagrafica) {
      return res.status(404).json({ error: 'Anagrafica non trovata' });
    }
    
    const movimenti = await queryAll(`
      SELECT 
        m.*,
        cc.nome_banca,
        cc.intestatario
      FROM movimenti m
      JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE m.anagrafica_id = $1 AND m.user_id = $2
      ORDER BY m.data DESC, m.created_at DESC
      LIMIT $3 OFFSET $4
    `, [id, req.user.id, limit, offset]);
    
    // Conta il totale per la paginazione
    const totalCount = await queryOne(
      'SELECT COUNT(*) as count FROM movimenti WHERE anagrafica_id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    res.json({
      movimenti,
      pagination: {
        total: parseInt(totalCount.count),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < parseInt(totalCount.count)
      }
    });
  } catch (error) {
    console.error('Error fetching anagrafica movimenti:', error);
    res.status(500).json({ error: 'Errore durante il caricamento dei movimenti' });
  }
});

// GET /api/anagrafiche/:id/statistiche - Statistiche anagrafica per mese
router.get('/:id/statistiche', async (req, res) => {
  try {
    const { id } = req.params;
    const { mesi = 12 } = req.query;
    
    // Verifica che l'anagrafica appartenga all'utente
    const anagrafica = await queryOne(
      'SELECT id FROM anagrafiche WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (!anagrafica) {
      return res.status(404).json({ error: 'Anagrafica non trovata' });
    }
    
    const statistiche = await queryAll(`
      SELECT 
        DATE_TRUNC('month', data) as mese,
        COUNT(*) as numero_movimenti,
        SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE 0 END) as entrate,
        SUM(CASE WHEN tipo = 'Uscita' THEN importo ELSE 0 END) as uscite,
        SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE -importo END) as saldo_netto
      FROM movimenti 
      WHERE anagrafica_id = $1 
        AND user_id = $2
        AND data >= CURRENT_DATE - INTERVAL '${parseInt(mesi)} months'
      GROUP BY DATE_TRUNC('month', data)
      ORDER BY mese DESC
    `, [id, req.user.id]);
    
    res.json(statistiche);
  } catch (error) {
    console.error('Error fetching anagrafica statistiche:', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle statistiche' });
  }
});

module.exports = router;
