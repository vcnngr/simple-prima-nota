// ==============================================================================
// FILE: backend/routes/categorieMovimenti.js
// POSIZIONE: backend/routes/categorieMovimenti.js (NUOVO FILE)
// ==============================================================================

const express = require('express');
const { queryAll, queryOne, execute } = require('../config/database');
const auth = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();
router.use(auth);

// GET /api/categorie-movimenti - Lista tutte le categorie
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { search, tipo, attiva } = req.query;

    let whereConditions = ['user_id = $1'];
    let params = [userId];
    let paramIndex = 2;

    if (search) {
      whereConditions.push(`nome ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (tipo) {
      whereConditions.push(`(tipo = $${paramIndex} OR tipo = 'Entrambi')`);
      params.push(tipo);
      paramIndex++;
    }

    if (attiva !== undefined) {
      whereConditions.push(`attiva = $${paramIndex}`);
      params.push(attiva === 'true');
      paramIndex++;
    }

    const categorie = await queryAll(`
      SELECT 
        id, nome, tipo, descrizione, colore, attiva, created_at, updated_at,
        (SELECT COUNT(*) FROM movimenti WHERE categoria = cm.nome AND user_id = cm.user_id) as utilizzi
      FROM categorie_movimenti cm
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY tipo, nome
    `, params);

    console.log(`📋 Categorie movimenti trovate: ${categorie.length} per utente ${userId}`);
    res.json(categorie);
  } catch (error) {
    console.error('❌ Error fetching categorie movimenti:', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle categorie movimenti' });
  }
});

// GET /api/categorie-movimenti/suggestions - Autocompletamento
router.get('/suggestions', async (req, res) => {
  try {
    const userId = req.user.id;
    const { q, tipo } = req.query;

    if (!q || q.length < 2) {
      return res.json([]);
    }


    let tipoCondition = '';
    let params = [userId, `%${q}%`];
    
    if (tipo) {
      tipoCondition = 'AND (tipo = $3 OR tipo = \'Entrambi\')';
      params.push(tipo);
    }

    // Cerca nelle categorie esistenti + categorie usate nei movimenti
    const suggestions = await queryAll(`
      SELECT DISTINCT nome, tipo, colore, descrizione, 'categoria' as fonte
      FROM categorie_movimenti 
      WHERE user_id = $1 AND attiva = true AND nome ILIKE $2 ${tipoCondition}
      
      UNION
      
      SELECT DISTINCT 
        categoria as nome, 
        'movimento' as tipo, 
        '#6B7280' as colore,
        'Categoria usata nei movimenti' as descrizione,
        'movimento' as fonte
      FROM movimenti 
      WHERE user_id = $1 AND categoria IS NOT NULL AND categoria != '' 
        AND categoria ILIKE $2
        AND categoria NOT IN (
          SELECT nome FROM categorie_movimenti WHERE user_id = $1
        )
      
      ORDER BY nome
      LIMIT 10
    `, params);

    res.json(suggestions);
  } catch (error) {
    console.error('❌ Error getting movimento suggestions:', error);
    res.status(500).json({ error: 'Errore durante il caricamento dei suggerimenti' });
  }
});

// GET /api/categorie-movimenti/:id - Dettaglio categoria
router.get('/:id', async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.id);
    const userId = req.user.id;

    const categoria = await queryOne(`
      SELECT 
        cm.*,
        (SELECT COUNT(*) FROM movimenti WHERE categoria = cm.nome AND user_id = cm.user_id) as utilizzi
      FROM categorie_movimenti cm
      WHERE cm.id = $1 AND cm.user_id = $2
    `, [categoriaId, userId]);

    if (!categoria) {
      return res.status(404).json({ error: 'Categoria movimento non trovata' });
    }

    res.json(categoria);
  } catch (error) {
    console.error('❌ Error fetching categoria movimento:', error);
    res.status(500).json({ error: 'Errore durante il caricamento della categoria movimento' });
  }
});

// POST /api/categorie-movimenti - Crea nuova categoria
router.post('/', validate(schemas.categoriaMovimento), async (req, res) => {
  try {
    const userId = req.user.id;
    const { nome, tipo, descrizione, colore } = req.body;

    console.log(`➕ Creazione categoria movimento: "${nome}" tipo: ${tipo} per utente ${userId}`);

    const categoria = await queryOne(`
      INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, colore)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userId, nome, tipo || 'Entrambi', descrizione || null, colore || '#6B7280']);

    console.log(`✅ Categoria movimento creata con ID: ${categoria.id}`);

    res.status(201).json({
      success: true,
      message: 'Categoria movimento creata con successo',
      data: categoria
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      console.log(`⚠️ Categoria movimento già esistente: "${req.body.nome}"`);
      return res.status(400).json({ error: 'Categoria movimento già esistente' });
    }
    console.error('❌ Error creating categoria movimento:', error);
    res.status(500).json({ error: 'Errore durante la creazione della categoria movimento' });
  }
});

// PUT /api/categorie-movimenti/:id - Aggiorna categoria
router.put('/:id', validate(schemas.categoriaMovimentoUpdate), async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.id);
    const userId = req.user.id;
    const updateData = req.body;


    // Costruisci query dinamica
    const fields = [];
    const values = [];
    let paramIndex = 3;

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

    fields.push('updated_at = NOW()');

    const updateQuery = `
      UPDATE categorie_movimenti 
      SET ${fields.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const categoria = await queryOne(updateQuery, [categoriaId, userId, ...values]);

    if (!categoria) {
      return res.status(404).json({ error: 'Categoria movimento non trovata' });
    }

    console.log(`✅ Categoria movimento aggiornata: ${categoria.nome}`);

    res.json({
      success: true,
      message: 'Categoria movimento aggiornata con successo',
      data: categoria
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Nome categoria movimento già esistente' });
    }
    console.error('❌ Error updating categoria movimento:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento della categoria movimento' });
  }
});

// DELETE /api/categorie-movimenti/:id - Elimina categoria
router.delete('/:id', async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.id);
    const userId = req.user.id;

    console.log(`🗑️ Eliminazione categoria movimento ID: ${categoriaId} per utente ${userId}`);

    // Verifica utilizzi
    const utilizzi = await queryOne(`
      SELECT COUNT(*) as count
      FROM movimenti m
      JOIN categorie_movimenti cm ON m.categoria = cm.nome
      WHERE cm.id = $1 AND cm.user_id = $2
    `, [categoriaId, userId]);

    if (parseInt(utilizzi.count) > 0) {
      console.log(`⚠️ Categoria movimento in uso: ${utilizzi.count} movimenti`);
      return res.status(400).json({ 
        error: 'Impossibile eliminare categoria in uso',
        utilizzi: parseInt(utilizzi.count)
      });
    }

    const result = await execute(`
      DELETE FROM categorie_movimenti 
      WHERE id = $1 AND user_id = $2
    `, [categoriaId, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Categoria movimento non trovata' });
    }

    console.log(`✅ Categoria movimento eliminata`);

    res.json({
      success: true,
      message: 'Categoria movimento eliminata con successo'
    });
  } catch (error) {
    console.error('❌ Error deleting categoria movimento:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della categoria movimento' });
  }
});

// PATCH /api/categorie-movimenti/:id/toggle - Attiva/disattiva categoria
router.patch('/:id/toggle', async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.id);
    const userId = req.user.id;

    const categoria = await queryOne(`
      UPDATE categorie_movimenti 
      SET attiva = NOT attiva, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [categoriaId, userId]);

    if (!categoria) {
      return res.status(404).json({ error: 'Categoria movimento non trovata' });
    }

    console.log(`🔄 Categoria movimento ${categoria.attiva ? 'attivata' : 'disattivata'}: ${categoria.nome}`);

    res.json({
      success: true,
      message: `Categoria movimento ${categoria.attiva ? 'attivata' : 'disattivata'} con successo`,
      data: categoria
    });
  } catch (error) {
    console.error('❌ Error toggling categoria movimento:', error);
    res.status(500).json({ error: 'Errore durante il cambio stato della categoria movimento' });
  }
});

module.exports = router;