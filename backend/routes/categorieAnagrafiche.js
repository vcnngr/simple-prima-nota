// ==============================================================================
// FILE: backend/routes/categorieAnagrafiche.js
// Categorie delle controparti. Fino a U6b era una copia di categorieMovimenti.js
// e scriveva in categorie_movimenti: ora usa la sua tabella. anagrafiche.categoria
// tiene il NOME della categoria, come movimenti.categoria.
// ==============================================================================

const express = require('express');
const { queryAll, queryOne, withTransaction } = require('../config/database');
const { auth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { logErrore } = require('../utils/errori');
const { contiene } = require('../utils/ricerca');

const { idNumerici } = require('../middleware/parametri');
const router = express.Router();
idNumerici(router, 'id'); // 400 per id non interi (U1)
router.use(auth);

const COLONNE = `ca.id, ca.nome, ca.descrizione, ca.colore, ca.attiva, ca.created_at, ca.updated_at,
  (SELECT COUNT(*) FROM anagrafiche a WHERE a.categoria = ca.nome AND a.user_id = ca.user_id) AS utilizzi`;

// GET /api/categorie-anagrafiche?search=&attiva=
router.get('/', async (req, res) => {
  try {
    const cond = ['ca.user_id = $1'];
    const params = [req.user.id];
    if (typeof req.query.search === 'string' && req.query.search) {
      params.push(contiene(req.query.search));
      cond.push(`lower(ca.nome) LIKE $${params.length} ESCAPE '\\'`);
    }
    if (req.query.attiva === 'true' || req.query.attiva === 'false') {
      params.push(req.query.attiva === 'true');
      cond.push(`ca.attiva = $${params.length}`);
    }
    res.json(await queryAll(`SELECT ${COLONNE} FROM categorie_anagrafiche ca WHERE ${cond.join(' AND ')} ORDER BY ca.nome`, params));
  } catch (error) {
    logErrore('Error fetching categorie anagrafiche', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle categorie' });
  }
});

// GET /api/categorie-anagrafiche/suggestions?q= - categorie e nomi gia' usati
router.get('/suggestions', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (q.length < 2) return res.json([]);
    res.json(await queryAll(`
      SELECT nome, colore, descrizione, 'categoria' AS fonte
      FROM categorie_anagrafiche WHERE user_id = $1 AND attiva = true AND lower(nome) LIKE $2 ESCAPE '\\'
      UNION
      SELECT DISTINCT categoria, '#6B7280', 'Categoria usata nelle controparti', 'anagrafica'
      FROM anagrafiche
      WHERE user_id = $1 AND categoria IS NOT NULL AND categoria <> '' AND lower(categoria) LIKE $2 ESCAPE '\\'
        AND categoria NOT IN (SELECT nome FROM categorie_anagrafiche WHERE user_id = $1)
      ORDER BY 1 LIMIT 10`, [req.user.id, contiene(q)]));
  } catch (error) {
    logErrore('Error getting categoria anagrafica suggestions', error);
    res.status(500).json({ error: 'Errore durante il caricamento dei suggerimenti' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const c = await queryOne(`SELECT ${COLONNE} FROM categorie_anagrafiche ca WHERE ca.id = $1 AND ca.user_id = $2`,
      [req.params.id, req.user.id]);
    if (!c) return res.status(404).json({ error: 'Categoria non trovata' });
    res.json(c);
  } catch (error) {
    logErrore('Error fetching categoria anagrafica', error);
    res.status(500).json({ error: 'Errore durante il caricamento della categoria' });
  }
});

router.post('/', validate(schemas.categoriaAnagrafica), async (req, res) => {
  try {
    const { nome, descrizione, colore } = req.body;
    const c = await queryOne(
      `INSERT INTO categorie_anagrafiche (user_id, nome, descrizione, colore)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, nome, descrizione || null, colore || '#6B7280']);
    res.status(201).json({ success: true, message: 'Categoria creata', data: c });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Categoria già esistente' });
    logErrore('Error creating categoria anagrafica', error);
    res.status(500).json({ error: 'Errore durante la creazione della categoria' });
  }
});

// Rinominare porta con se' le controparti che la usano, nella stessa transazione.
router.put('/:id', validate(schemas.categoriaAnagraficaUpdate), async (req, res) => {
  try {
    const userId = req.user.id;
    const campi = ['nome', 'descrizione', 'colore', 'attiva'].filter(k => req.body[k] !== undefined);
    const c = await withTransaction(async (cl) => {
      const prima = (await cl.query(
        'SELECT nome FROM categorie_anagrafiche WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, userId])).rows[0];
      if (!prima) return null;
      const set = campi.map((k, n) => `${k} = $${n + 3}`).join(', ');
      const r = (await cl.query(
        `UPDATE categorie_anagrafiche SET ${set}, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
        [req.params.id, userId, ...campi.map(k => req.body[k])])).rows[0];
      if (r.nome !== prima.nome) {
        await cl.query('UPDATE anagrafiche SET categoria = $1 WHERE user_id = $2 AND categoria = $3', [r.nome, userId, prima.nome]);
      }
      return r;
    });
    if (!c) return res.status(404).json({ error: 'Categoria non trovata' });
    res.json({ success: true, message: 'Categoria aggiornata', data: c });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Nome categoria già esistente' });
    logErrore('Error updating categoria anagrafica', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento della categoria' });
  }
});

// Si elimina solo se nessuna controparte la usa.
router.delete('/:id', async (req, res) => {
  try {
    const esito = await withTransaction(async (cl) => {
      const c = (await cl.query(
        'SELECT nome FROM categorie_anagrafiche WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.user.id])).rows[0];
      if (!c) return { stato: 404 };
      const n = Number((await cl.query(
        'SELECT COUNT(*) AS n FROM anagrafiche WHERE user_id = $1 AND categoria = $2', [req.user.id, c.nome])).rows[0].n);
      if (n > 0) return { stato: 400, n };
      await cl.query('DELETE FROM categorie_anagrafiche WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      return { stato: 200 };
    });
    if (esito.stato === 404) return res.status(404).json({ error: 'Categoria non trovata' });
    if (esito.stato === 400) return res.status(400).json({ error: 'Impossibile eliminare categoria in uso', utilizzi: esito.n });
    res.json({ success: true, message: 'Categoria eliminata' });
  } catch (error) {
    logErrore('Error deleting categoria anagrafica', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione della categoria' });
  }
});

router.patch('/:id/toggle', async (req, res) => {
  try {
    const c = await queryOne(
      `UPDATE categorie_anagrafiche SET attiva = NOT attiva, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`, [req.params.id, req.user.id]);
    if (!c) return res.status(404).json({ error: 'Categoria non trovata' });
    res.json({ success: true, message: `Categoria ${c.attiva ? 'attivata' : 'disattivata'}`, data: c });
  } catch (error) {
    logErrore('Error toggling categoria anagrafica', error);
    res.status(500).json({ error: 'Errore durante il cambio stato della categoria' });
  }
});

module.exports = router;
