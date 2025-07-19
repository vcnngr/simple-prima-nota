// routes/movimenti.js
const express = require('express');
const { query, queryOne, queryAll, withTransaction } = require('../config/database');
const auth = require('../middleware/auth');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const moment = require('moment');

const router = express.Router();

// Middleware di autenticazione per tutte le route
router.use(auth);

// Schema per filtri movimenti
const movimentiFiltersSchema = require('joi').object({
  data_inizio: require('joi').date().optional(),
  data_fine: require('joi').date().optional(),
  conto_id: require('joi').number().integer().optional(),
  anagrafica_id: require('joi').number().integer().optional(),
  tipo: require('joi').string().valid('Entrata', 'Uscita').optional(),
  importo_min: require('joi').number().min(0).optional(),
  importo_max: require('joi').number().min(0).optional(),
  search: require('joi').string().max(100).optional(),
  limit: require('joi').number().integer().min(1).max(1000).default(50),
  offset: require('joi').number().integer().min(0).default(0),
  order_by: require('joi').string().valid('data', 'importo', 'created_at').default('data'),
  order_direction: require('joi').string().valid('ASC', 'DESC').default('DESC')
});

// GET /api/movimenti - Lista movimenti con filtri avanzati
router.get('/', validateQuery(movimentiFiltersSchema), async (req, res) => {
  try {
    const {
      data_inizio,
      data_fine,
      conto_id,
      anagrafica_id,
      tipo,
      importo_min,
      importo_max,
      search,
      limit,
      offset,
      order_by,
      order_direction
    } = req.query;

    let whereConditions = ['m.user_id = $1'];
    let params = [req.user.id];
    let paramIndex = 2;

    // Filtro per date
    if (data_inizio) {
      whereConditions.push(`m.data >= $${paramIndex}`);
      params.push(data_inizio);
      paramIndex++;
    }

    if (data_fine) {
      whereConditions.push(`m.data <= $${paramIndex}`);
      params.push(data_fine);
      paramIndex++;
    }

    // Filtro per conto
    if (conto_id) {
      whereConditions.push(`m.conto_id = $${paramIndex}`);
      params.push(conto_id);
      paramIndex++;
    }

    // Filtro per anagrafica
    if (anagrafica_id) {
      whereConditions.push(`m.anagrafica_id = $${paramIndex}`);
      params.push(anagrafica_id);
      paramIndex++;
    }

    // Filtro per tipo movimento
    if (tipo) {
      whereConditions.push(`m.tipo = $${paramIndex}`);
      params.push(tipo);
      paramIndex++;
    }

    // Filtro per importo minimo
    if (importo_min) {
      whereConditions.push(`m.importo >= $${paramIndex}`);
      params.push(importo_min);
      paramIndex++;
    }

    // Filtro per importo massimo
    if (importo_max) {
      whereConditions.push(`m.importo <= $${paramIndex}`);
      params.push(importo_max);
      paramIndex++;
    }

    // Ricerca testuale
    if (search) {
      whereConditions.push(`(m.descrizione ILIKE $${paramIndex} OR m.note ILIKE $${paramIndex} OR a.nome ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const movimenti = await queryAll(`
      SELECT 
        m.*,
        a.nome as anagrafica_nome,
        a.tipo as anagrafica_tipo,
        cc.nome_banca,
        cc.intestatario
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY m.${order_by} ${order_direction}, m.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    // Conta il totale per la paginazione
    const totalCount = await queryOne(`
      SELECT COUNT(*) as count
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE ${whereConditions.join(' AND ')}
    `, params);

    // Calcola totali per il periodo filtrato
    const totali = await queryOne(`
      SELECT 
        COUNT(*) as numero_movimenti,
        COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END), 0) as totale_entrate,
        COALESCE(SUM(CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END), 0) as totale_uscite,
        COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE -m.importo END), 0) as saldo_netto
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE ${whereConditions.join(' AND ')}
    `, params);

    res.json({
      movimenti,
      pagination: {
        total: parseInt(totalCount.count),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < parseInt(totalCount.count)
      },
      totali
    });
  } catch (error) {
    console.error('Error fetching movimenti:', error);
    res.status(500).json({ error: 'Errore durante il caricamento dei movimenti' });
  }
});

// GET /api/movimenti/recenti - Ultimi movimenti (per dashboard)
router.get('/recenti', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const movimenti = await queryAll(`
      SELECT 
        m.*,
        a.nome as anagrafica_nome,
        a.tipo as anagrafica_tipo,
        cc.nome_banca
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE m.user_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2
    `, [req.user.id, limit]);

    res.json(movimenti);
  } catch (error) {
    console.error('Error fetching movimenti recenti:', error);
    res.status(500).json({ error: 'Errore durante il caricamento dei movimenti recenti' });
  }
});

// GET /api/movimenti/:id - Dettaglio singolo movimento
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const movimento = await queryOne(`
      SELECT 
        m.*,
        a.nome as anagrafica_nome,
        a.tipo as anagrafica_tipo,
        a.categoria as anagrafica_categoria,
        cc.nome_banca,
        cc.intestatario,
        cc.iban
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE m.id = $1 AND m.user_id = $2
    `, [id, req.user.id]);

    if (!movimento) {
      return res.status(404).json({ error: 'Movimento non trovato' });
    }

    res.json(movimento);
  } catch (error) {
    console.error('Error fetching movimento detail:', error);
    res.status(500).json({ error: 'Errore durante il caricamento del movimento' });
  }
});

// POST /api/movimenti - Crea nuovo movimento
router.post('/', validate(schemas.movimento), async (req, res) => {
  try {
    const { data, anagrafica_id, conto_id, descrizione, importo, tipo, note } = req.body;

    // Verifica che il conto appartenga all'utente
    const conto = await queryOne(
      'SELECT id, attivo FROM conti_correnti WHERE id = $1 AND user_id = $2',
      [conto_id, req.user.id]
    );

    if (!conto) {
      return res.status(400).json({ error: 'Conto corrente non trovato' });
    }

    if (!conto.attivo) {
      return res.status(400).json({ error: 'Impossibile registrare movimenti su un conto disattivato' });
    }

    // Verifica anagrafica se specificata
    if (anagrafica_id) {
      const anagrafica = await queryOne(
        'SELECT id, attivo FROM anagrafiche WHERE id = $1 AND user_id = $2',
        [anagrafica_id, req.user.id]
      );

      if (!anagrafica) {
        return res.status(400).json({ error: 'Anagrafica non trovata' });
      }

      if (!anagrafica.attivo) {
        return res.status(400).json({ error: 'Impossibile registrare movimenti per un\'anagrafica disattivata' });
      }
    }

    const result = await query(`
      INSERT INTO movimenti 
      (data, anagrafica_id, conto_id, descrizione, importo, tipo, note, user_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING *
    `, [
      data,
      anagrafica_id || null,
      conto_id,
      descrizione,
      importo,
      tipo,
      note || null,
      req.user.id
    ]);

    const newMovimento = result.rows[0];

    // Recupera i dettagli completi del movimento appena creato
    const movimentoCompleto = await queryOne(`
      SELECT 
        m.*,
        a.nome as anagrafica_nome,
        a.tipo as anagrafica_tipo,
        cc.nome_banca,
        cc.intestatario
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE m.id = $1
    `, [newMovimento.id]);

    res.status(201).json(movimentoCompleto);
  } catch (error) {
    console.error('Error creating movimento:', error);
    res.status(500).json({ error: 'Errore durante la creazione del movimento' });
  }
});

// PUT /api/movimenti/:id - Aggiorna movimento esistente
router.put('/:id', validate(schemas.movimentoUpdate), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Verifica che il movimento appartenga all'utente
    const existingMovimento = await queryOne(
      'SELECT * FROM movimenti WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (!existingMovimento) {
      return res.status(404).json({ error: 'Movimento non trovato' });
    }

    // Prepara i campi da aggiornare
    const fieldsToUpdate = [];
    const params = [];
    let paramIndex = 1;

    for (const [field, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fieldsToUpdate.push(`${field} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    }

    // Verifica conto se aggiornato
    if (updates.conto_id) {
      const conto = await queryOne(
        'SELECT id, attivo FROM conti_correnti WHERE id = $1 AND user_id = $2',
        [updates.conto_id, req.user.id]
      );

      if (!conto || !conto.attivo) {
        return res.status(400).json({ error: 'Conto corrente non valido o disattivato' });
      }
    }

    // Verifica anagrafica se aggiornata
    if (updates.anagrafica_id) {
      const anagrafica = await queryOne(
        'SELECT id, attivo FROM anagrafiche WHERE id = $1 AND user_id = $2',
        [updates.anagrafica_id, req.user.id]
      );

      if (!anagrafica || !anagrafica.attivo) {
        return res.status(400).json({ error: 'Anagrafica non valida o disattivata' });
      }
    }

    fieldsToUpdate.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, req.user.id);

    const result = await query(`
      UPDATE movimenti 
      SET ${fieldsToUpdate.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `, params);

    const updatedMovimento = result.rows[0];

    // Recupera i dettagli completi
    const movimentoCompleto = await queryOne(`
      SELECT 
        m.*,
        a.nome as anagrafica_nome,
        a.tipo as anagrafica_tipo,
        cc.nome_banca,
        cc.intestatario
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE m.id = $1
    `, [updatedMovimento.id]);

    res.json(movimentoCompleto);
  } catch (error) {
    console.error('Error updating movimento:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del movimento' });
  }
});

// DELETE /api/movimenti/:id - Elimina movimento
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verifica che il movimento appartenga all'utente
    const movimento = await queryOne(
      'SELECT id, descrizione, importo, tipo FROM movimenti WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (!movimento) {
      return res.status(404).json({ error: 'Movimento non trovato' });
    }

    await query(
      'DELETE FROM movimenti WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    res.json({ 
      message: 'Movimento eliminato con successo',
      movimento_eliminato: movimento
    });
  } catch (error) {
    console.error('Error deleting movimento:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione del movimento' });
  }
});

// POST /api/movimenti/bulk - Creazione multipla movimenti
router.post('/bulk', async (req, res) => {
  try {
    const { movimenti } = req.body;

    if (!Array.isArray(movimenti) || movimenti.length === 0) {
      return res.status(400).json({ error: 'Array di movimenti richiesto' });
    }

    if (movimenti.length > 100) {
      return res.status(400).json({ error: 'Massimo 100 movimenti per richiesta' });
    }

    const results = await withTransaction(async (client) => {
      const createdMovimenti = [];
      const errors = [];

      for (let i = 0; i < movimenti.length; i++) {
        try {
          // Valida ogni movimento
          const { error } = schemas.movimento.validate(movimenti[i]);
          if (error) {
            errors.push({
              index: i,
              movimento: movimenti[i],
              error: error.details.map(d => d.message).join(', ')
            });
            continue;
          }

          const { data, anagrafica_id, conto_id, descrizione, importo, tipo, note } = movimenti[i];

          // Verifica conto
          const contoCheck = await client.query(
            'SELECT id, attivo FROM conti_correnti WHERE id = $1 AND user_id = $2',
            [conto_id, req.user.id]
          );

          if (contoCheck.rows.length === 0 || !contoCheck.rows[0].attivo) {
            errors.push({
              index: i,
              movimento: movimenti[i],
              error: 'Conto corrente non trovato o disattivato'
            });
            continue;
          }

          // Verifica anagrafica se specificata
          if (anagrafica_id) {
            const anagraficaCheck = await client.query(
              'SELECT id, attivo FROM anagrafiche WHERE id = $1 AND user_id = $2',
              [anagrafica_id, req.user.id]
            );

            if (anagraficaCheck.rows.length === 0 || !anagraficaCheck.rows[0].attivo) {
              errors.push({
                index: i,
                movimento: movimenti[i],
                error: 'Anagrafica non trovata o disattivata'
              });
              continue;
            }
          }

          // Crea il movimento
          const result = await client.query(`
            INSERT INTO movimenti 
            (data, anagrafica_id, conto_id, descrizione, importo, tipo, note, user_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING *
          `, [
            data,
            anagrafica_id || null,
            conto_id,
            descrizione,
            importo,
            tipo,
            note || null,
            req.user.id
          ]);

          createdMovimenti.push(result.rows[0]);
        } catch (err) {
          errors.push({
            index: i,
            movimento: movimenti[i],
            error: err.message
          });
        }
      }

      return { createdMovimenti, errors };
    });

    res.status(201).json({
      message: `${results.createdMovimenti.length} movimenti creati con successo`,
      movimenti_creati: results.createdMovimenti,
      errori: results.errors,
      totale_richiesti: movimenti.length,
      totale_creati: results.createdMovimenti.length,
      totale_errori: results.errors.length
    });
  } catch (error) {
    console.error('Error creating bulk movimenti:', error);
    res.status(500).json({ error: 'Errore durante la creazione multipla dei movimenti' });
  }
});

// GET /api/movimenti/statistiche/mensili - Statistiche mensili
router.get('/statistiche/mensili', async (req, res) => {
  try {
    const { mesi = 12, conto_id } = req.query;

    let whereCondition = 'user_id = $1 AND data >= CURRENT_DATE - INTERVAL \'$2 months\'';
    let params = [req.user.id, parseInt(mesi)];

    if (conto_id) {
      whereCondition += ' AND conto_id = $3';
      params.push(conto_id);
    }

    const statistiche = await queryAll(`
      SELECT 
        DATE_TRUNC('month', data) as mese,
        COUNT(*) as numero_movimenti,
        SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE 0 END) as entrate,
        SUM(CASE WHEN tipo = 'Uscita' THEN importo ELSE 0 END) as uscite,
        SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE -importo END) as saldo_netto
      FROM movimenti 
      WHERE ${whereCondition}
      GROUP BY DATE_TRUNC('month', data)
      ORDER BY mese DESC
    `, params);

    res.json(statistiche);
  } catch (error) {
    console.error('Error fetching statistiche mensili:', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle statistiche mensili' });
  }
});

module.exports = router;
