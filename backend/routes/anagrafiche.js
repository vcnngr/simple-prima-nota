// routes/anagrafiche.js - VERSIONE FLESSIBILE CON TIPOLOGIE
const express = require('express');
const { query, queryOne, queryAll } = require('../config/database');
const auth = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// Middleware di autenticazione per tutte le route
router.use(auth);

// ==============================================================================
// ENDPOINTS TIPOLOGIE ANAGRAFICHE (ORDINAMENTO IMPORTANTE!)
// ==============================================================================

// GET /api/anagrafiche/tipologie - Lista tipologie
router.get('/tipologie', async (req, res) => {
  try {
    const tipologie = await queryAll(`
      SELECT id, nome, descrizione, tipo_movimento_default, colore, icona, attiva,
             created_at, updated_at
      FROM tipologie_anagrafiche 
      WHERE user_id = $1 
      ORDER BY nome
    `, [req.user.id]);
    
    res.json(tipologie);
  } catch (error) {
    console.error('Error fetching tipologie:', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle tipologie' });
  }
});

// POST /api/anagrafiche/tipologie - Crea tipologia
router.post('/tipologie', validate(schemas.tipologiaAnagrafica), async (req, res) => {
  try {
    const { nome, descrizione, tipo_movimento_default, colore, icona } = req.body;
    
    const existingTipologia = await queryOne(
      'SELECT id FROM tipologie_anagrafiche WHERE LOWER(nome) = LOWER($1) AND user_id = $2',
      [nome, req.user.id]
    );
    
    if (existingTipologia) {
      return res.status(400).json({ 
        error: `Esiste già una tipologia con questo nome: ${nome}` 
      });
    }
    
    const result = await query(`
      INSERT INTO tipologie_anagrafiche 
      (nome, descrizione, tipo_movimento_default, colore, icona, user_id) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `, [nome, descrizione || null, tipo_movimento_default, colore || '#6B7280', icona || 'user', req.user.id]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating tipologia:', error);
    res.status(500).json({ error: 'Errore durante la creazione della tipologia' });
  }
});

// GET /api/anagrafiche/tipologie/:id - Dettaglio tipologia
router.get('/tipologie/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const tipologia = await queryOne(`
      SELECT id, nome, descrizione, tipo_movimento_default, colore, icona, attiva,
             created_at, updated_at
      FROM tipologie_anagrafiche 
      WHERE id = $1 AND user_id = $2
    `, [id, req.user.id]);
    
    if (!tipologia) {
      return res.status(404).json({ error: 'Tipologia non trovata' });
    }
    
    res.json(tipologia);
  } catch (error) {
    console.error('Error fetching tipologia detail:', error);
    res.status(500).json({ error: 'Errore durante il caricamento della tipologia' });
  }
});

// PUT /api/anagrafiche/tipologie/:id - Aggiorna tipologia
router.put('/tipologie/:id', validate(schemas.tipologiaAnagraficaUpdate), async (req, res) => {
  try {
    const tipologiaId = parseInt(req.params.id);
    const userId = req.user.id;
    const updateData = req.body;


    // Verifica che la tipologia esista e appartenga all'utente
    const existingTipologia = await queryOne(
      'SELECT id FROM tipologie_anagrafiche WHERE id = $1 AND user_id = $2',
      [tipologiaId, userId]
    );

    if (!existingTipologia) {
      return res.status(404).json({ error: 'Tipologia non trovata' });
    }

    // Verifica unicità nome (se viene cambiato)
    if (updateData.nome) {
      const duplicateName = await queryOne(
        'SELECT id FROM tipologie_anagrafiche WHERE LOWER(nome) = LOWER($1) AND user_id = $2 AND id != $3',
        [updateData.nome, userId, tipologiaId]
      );
      
      if (duplicateName) {
        return res.status(400).json({ 
          error: `Esiste già una tipologia con questo nome: ${updateData.nome}` 
        });
      }
    }

    // Costruisci query di update dinamica
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(updateData[key]);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(tipologiaId, userId);

    const updateQuery = `
      UPDATE tipologie_anagrafiche 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;

    
    const result = await queryOne(updateQuery, values);

    res.json({
      success: true,
      message: 'Tipologia aggiornata con successo',
      data: result
    });

  } catch (error) {
    console.error('❌ Error updating tipologia:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento della tipologia' });
  }
});

// DELETE /api/anagrafiche/tipologie/:id - Elimina tipologia
router.delete('/tipologie/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica che la tipologia appartenga all'utente
    const tipologia = await queryOne(
      'SELECT id, nome FROM tipologie_anagrafiche WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (!tipologia) {
      return res.status(404).json({ error: 'Tipologia non trovata' });
    }
    
    // Verifica se ci sono anagrafiche associate
    const anagrafiche = await queryOne(
      'SELECT COUNT(*) as count FROM anagrafiche WHERE tipologia_id = $1',
      [id]
    );
    
    if (parseInt(anagrafiche.count) > 0) {
      return res.status(400).json({ 
        error: 'Impossibile eliminare la tipologia: sono presenti anagrafiche associate',
        suggestion: 'Disattiva la tipologia invece di eliminarla, oppure rimuovi prima i riferimenti dalle anagrafiche'
      });
    }
    
    await query(
      'DELETE FROM tipologie_anagrafiche WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    res.json({ message: `Tipologia "${tipologia.nome}" eliminata con successo` });
  } catch (error) {
    console.error('Error deleting tipologia:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della tipologia' });
  }
});

// PATCH /api/anagrafiche/tipologie/:id/toggle-stato - Attiva/disattiva tipologia
router.patch('/tipologie/:id/toggle-stato', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      UPDATE tipologie_anagrafiche 
      SET attiva = NOT attiva, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tipologia non trovata' });
    }
    
    const updatedTipologia = result.rows[0];
    
    res.json({
      message: `Tipologia "${updatedTipologia.nome}" ${updatedTipologia.attiva ? 'attivata' : 'disattivata'} con successo`,
      tipologia: updatedTipologia
    });
  } catch (error) {
    console.error('Error toggling tipologia stato:', error);
    res.status(500).json({ error: 'Errore durante il cambio stato della tipologia' });
  }
});

// ==============================================================================
// ENDPOINTS ANAGRAFICHE (DOPO LE TIPOLOGIE PER EVITARE CONFLITTI DI ROUTING)
// ==============================================================================

// GET /api/anagrafiche/export - Export anagrafiche (AGGIORNATO)
router.get('/export', async (req, res) => {
  try {
    const userId = req.user.id;
    const { formato = 'csv', tipologia_id } = req.query;

    let whereCondition = 'a.user_id = $1';
    let params = [userId];

    if (tipologia_id) {
      whereCondition += ' AND a.tipologia_id = $2';
      params.push(tipologia_id);
    }

    const anagrafiche = await queryAll(`
      SELECT 
        a.nome,
        COALESCE(ta.nome, 'Senza tipologia') as tipologia,
        ta.tipo_movimento_default,
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
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
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
      ORDER BY ta.nome, a.nome
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

// GET /api/anagrafiche - Lista tutte le anagrafiche (AGGIORNATO)
router.get('/', async (req, res) => {
  try {
    const { tipologia_id, categoria, search, attivo } = req.query;
    
    let whereConditions = ['a.user_id = $1'];
    let params = [req.user.id];
    let paramIndex = 2;
    
    if (tipologia_id) {
      whereConditions.push(`a.tipologia_id = $${paramIndex}`);
      params.push(tipologia_id);
      paramIndex++;
    }
    
    if (categoria) {
      whereConditions.push(`a.categoria ILIKE $${paramIndex}`);
      params.push(`%${categoria}%`);
      paramIndex++;
    }
    
    if (attivo !== undefined) {
      whereConditions.push(`a.attivo = $${paramIndex}`);
      params.push(attivo === 'true');
      paramIndex++;
    }
    
    if (search) {
      whereConditions.push(`(a.nome ILIKE $${paramIndex} OR a.email ILIKE $${paramIndex} OR a.piva ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    const anagrafiche = await queryAll(`
      SELECT 
        a.*,
        ta.nome as tipologia_nome,
        ta.tipo_movimento_default,
        ta.colore as tipologia_colore,
        ta.icona as tipologia_icona,
        COUNT(m.id) as numero_movimenti,
        COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END), 0) as totale_entrate,
        COALESCE(SUM(CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END), 0) as totale_uscite,
        MAX(m.data) as ultimo_movimento
      FROM anagrafiche a
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      LEFT JOIN movimenti m ON a.id = m.anagrafica_id
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY a.id, ta.nome, ta.tipo_movimento_default, ta.colore, ta.icona
      ORDER BY a.nome
    `, params);
    
    res.json(anagrafiche);
  } catch (error) {
    console.error('Error fetching anagrafiche:', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle anagrafiche' });
  }
});

// GET /api/anagrafiche/categorie - Lista categorie uniche (INVARIATO)
router.get('/categorie', async (req, res) => {
  try {
    const { tipologia_id } = req.query;
    
    let whereCondition = 'user_id = $1 AND categoria IS NOT NULL AND categoria != \'\'';
    let params = [req.user.id];
    
    if (tipologia_id) {
      whereCondition += ' AND tipologia_id = $2';
      params.push(tipologia_id);
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

// GET /api/anagrafiche/attive - Solo anagrafiche attive (AGGIORNATO)
router.get('/attive', async (req, res) => {
  try {
    const { tipologia_id } = req.query;
    
    let whereCondition = 'a.user_id = $1 AND a.attivo = true';
    let params = [req.user.id];
    
    if (tipologia_id) {
      whereCondition += ' AND a.tipologia_id = $2';
      params.push(tipologia_id);
    }
    
    const anagrafiche = await queryAll(`
      SELECT 
        a.id, a.nome, a.categoria, a.email, a.telefono,
        ta.nome as tipologia_nome, 
        ta.tipo_movimento_default,
        ta.colore as tipologia_colore,
        ta.icona as tipologia_icona
      FROM anagrafiche a
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      WHERE ${whereCondition}
      ORDER BY a.nome
    `, params);
    
    res.json(anagrafiche);
  } catch (error) {
    console.error('Error fetching anagrafiche attive:', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle anagrafiche attive' });
  }
});

// GET /api/anagrafiche/:id - Dettaglio singola anagrafica (AGGIORNATO)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const anagrafica = await queryOne(`
      SELECT 
        a.*,
        ta.nome as tipologia_nome,
        ta.descrizione as tipologia_descrizione,
        ta.tipo_movimento_default,
        ta.colore as tipologia_colore,
        ta.icona as tipologia_icona,
        COUNT(m.id) as numero_movimenti,
        COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END), 0) as totale_entrate,
        COALESCE(SUM(CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END), 0) as totale_uscite,
        MAX(m.data) as ultimo_movimento,
        MIN(m.data) as primo_movimento
      FROM anagrafiche a
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      LEFT JOIN movimenti m ON a.id = m.anagrafica_id
      WHERE a.id = $1 AND a.user_id = $2
      GROUP BY a.id, ta.nome, ta.descrizione, ta.tipo_movimento_default, ta.colore, ta.icona
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

// POST /api/anagrafiche - Crea nuova anagrafica (AGGIORNATO)
router.post('/', validate(schemas.anagrafica), async (req, res) => {
  try {
    const { nome, tipologia_id, categoria, email, telefono, piva, indirizzo, attivo } = req.body;
    
    // Verifica se esiste già un'anagrafica con stesso nome
    const existingAnagrafica = await queryOne(
      'SELECT id FROM anagrafiche WHERE LOWER(nome) = LOWER($1) AND user_id = $2',
      [nome, req.user.id]
    );
    
    if (existingAnagrafica) {
      return res.status(400).json({ 
        error: `Esiste già un'anagrafica con questo nome: ${nome}` 
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
      (nome, tipologia_id, categoria, email, telefono, piva, indirizzo, attivo, user_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING *
    `, [
      nome, 
      tipologia_id || null, 
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

// PUT /api/anagrafiche/:id - Aggiorna anagrafica (AGGIORNATO)
router.put('/:id', validate(schemas.anagraficaUpdate), async (req, res) => {
  try {
    const anagraficaId = parseInt(req.params.id);
    const userId = req.user.id;
    const updateData = req.body;


    // Verifica che l'anagrafica esista e appartenga all'utente
    const existingAnagrafica = await queryOne(
      'SELECT id FROM anagrafiche WHERE id = $1 AND user_id = $2',
      [anagraficaId, userId]
    );

    if (!existingAnagrafica) {
      return res.status(404).json({ error: 'Anagrafica non trovata' });
    }

    // Costruisci query di update dinamica
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(updateData[key]);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(anagraficaId, userId);

    const updateQuery = `
      UPDATE anagrafiche 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;

    
    const result = await queryOne(updateQuery, values);

    res.json({
      success: true,
      message: 'Anagrafica aggiornata con successo',
      data: result
    });

  } catch (error) {
    console.error('❌ Error updating anagrafica:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento dell\'anagrafica' });
  }
});

// DELETE, TOGGLE e altri endpoint rimangono INVARIATI
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

// GET /api/anagrafiche/:id/movimenti - Movimenti dell'anagrafica (INVARIATO)
router.get('/:id/movimenti', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
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

// GET /api/anagrafiche/:id/statistiche - Statistiche anagrafica per mese (INVARIATO)
router.get('/:id/statistiche', async (req, res) => {
  try {
    const { id } = req.params;
    const { mesi = 12 } = req.query;
    
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