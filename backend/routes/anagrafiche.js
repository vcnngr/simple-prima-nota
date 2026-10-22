// routes/anagrafiche.js - VERSIONE FLESSIBILE CON TIPOLOGIE
const express = require('express');
const { query, queryOne, queryAll } = require('../config/database');
const { auth } = require('../middleware/auth');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { contiene, iniziaCon } = require('../utils/ricerca');
const { logErrore } = require('../utils/errori');
const { cartellaXlsx } = require('../utils/xlsx');

const { idNumerici } = require('../middleware/parametri');
const router = express.Router();
idNumerici(router, 'id'); // 400 per id non interi (U1)

// Middleware di autenticazione per tutte le route
router.use(auth);

// ==============================================================================
// ENDPOINTS TIPOLOGIE ANAGRAFICHE (ORDINAMENTO IMPORTANTE!)
// ==============================================================================

// La tipologia indicata appartiene all'utente?
async function tipologiaPropria(id, userId) {
  return Boolean(await queryOne('SELECT 1 FROM tipologie_anagrafiche WHERE id = $1 AND user_id = $2', [id, userId]));
}

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
    logErrore('Error fetching tipologie', error);
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
    logErrore('Error creating tipologia', error);
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
    logErrore('Error fetching tipologia detail', error);
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
    logErrore('❌ Error updating tipologia', error);
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
    logErrore('Error deleting tipologia', error);
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
    logErrore('Error toggling tipologia stato', error);
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
      const buffer = cartellaXlsx([{ nome: 'Anagrafiche', righe: anagrafiche }]);
      
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
    logErrore('Error exporting anagrafiche', error);
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
    logErrore('Error fetching anagrafiche', error);
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
    logErrore('Error fetching categorie', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle categorie' });
  }
});

// ==============================================================================
// FASE UX, BLOCCO U1: ricerca sul server, sempre con un tetto
// ==============================================================================
// Con migliaia di anagrafiche le tendine che caricavano l'elenco intero non
// reggono. Il selettore chiede /cerca (al massimo 50 righe, le piu' usate prima),
// la pagina delle controparti chiede /elenco a pagine, con gli aggregati
// calcolati solo per la pagina. GET / e /attive restano per il frontend attuale
// e spariscono con la sua ricostruzione.

// Filtri comuni a /cerca e /elenco. Ritorna { dove, params }.
function filtriAnagrafiche(userId, { q, attivo, tipologia_id, lettera }) {
  const dove = ['a.user_id = $1'];
  const params = [userId];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  if (attivo === true) dove.push('a.attivo = true');
  if (attivo === false) dove.push('a.attivo = false');
  if (tipologia_id) dove.push(`a.tipologia_id = ${p(tipologia_id)}`);
  if (q) {
    const like = p(contiene(q));
    dove.push(`(lower(a.nome) LIKE ${like} ESCAPE '\\' OR lower(coalesce(a.piva, '')) LIKE ${like} ESCAPE '\\')`);
  }
  if (lettera === '#') dove.push(`upper(left(a.nome, 1)) !~ '^[A-Z]$'`);
  else if (lettera) dove.push(`upper(left(a.nome, 1)) = ${p(lettera)}`);
  return { dove, params, p };
}

// GET /api/anagrafiche/cerca?q=&tipo=&limit= - Selettore della controparte.
// q vuoto: le controparti usate di recente (ultimi 12 mesi) prima, poi A-Z.
// q: chi inizia con q prima, poi chi lo contiene; a parita', le piu' usate.
// tipo (Entrata/Uscita): a parita', prima le controparti di quel tipo.
router.get('/cerca', validateQuery(schemas.cercaAnagrafiche), async (req, res) => {
  try {
    const { q, tipo, limit, solo_attive } = req.query;
    const { dove, params, p } = filtriAnagrafiche(req.user.id, { q, attivo: solo_attive ? true : undefined });
    const prefisso = q ? p(iniziaCon(q)) : null;
    const tipoP = tipo ? p(tipo) : null;
    const tetto = p(limit + 1);

    const righe = await queryAll(`
      WITH uso AS (
        SELECT anagrafica_id, count(*)::int AS n, max(data) AS ultimo
        FROM movimenti
        WHERE user_id = $1 AND anagrafica_id IS NOT NULL AND data >= CURRENT_DATE - 365
        GROUP BY anagrafica_id
      )
      SELECT a.id, a.nome, a.piva, a.categoria, a.attivo,
             ta.nome AS tipologia_nome, ta.colore AS tipologia_colore,
             coalesce(a.tipo_movimento_preferito, ta.tipo_movimento_default) AS tipo_movimento_preferito,
             coalesce(u.n, 0) AS movimenti_recenti, u.ultimo AS ultimo_movimento
      FROM anagrafiche a
      LEFT JOIN tipologie_anagrafiche ta ON ta.id = a.tipologia_id AND ta.user_id = a.user_id
      LEFT JOIN uso u ON u.anagrafica_id = a.id
      WHERE ${dove.join(' AND ')}
      ORDER BY
        ${prefisso ? `(lower(a.nome) LIKE ${prefisso} ESCAPE '\\') DESC,` : ''}
        ${tipoP ? `(coalesce(a.tipo_movimento_preferito, ta.tipo_movimento_default, 'Entrambi') IN (${tipoP}, 'Entrambi')) DESC,` : ''}
        u.n DESC NULLS LAST, u.ultimo DESC NULLS LAST, lower(a.nome), a.id
      LIMIT ${tetto}
    `, params);

    res.json({ risultati: righe.slice(0, limit), altri: righe.length > limit });
  } catch (error) {
    logErrore('Error searching anagrafiche', error);
    res.status(500).json({ error: 'Errore durante la ricerca delle anagrafiche' });
  }
});

// GET /api/anagrafiche/elenco - Pagina delle controparti, con indice A-Z.
// Aggregati (numero movimenti, totali, ultimo movimento) solo per le righe
// della pagina. `lettere`: quante controparti per iniziale con gli stessi
// filtri, lettera esclusa (l'indice resta intero mentre si salta fra lettere).
router.get('/elenco', validateQuery(schemas.elencoAnagrafiche), async (req, res) => {
  try {
    const { q, lettera, tipologia_id, ordina, limit, offset } = req.query;
    const attivo = req.query.attivo === 'tutte' ? undefined : req.query.attivo === 'true';
    const f = filtriAnagrafiche(req.user.id, { q, attivo, tipologia_id, lettera });
    const g = filtriAnagrafiche(req.user.id, { q, attivo, tipologia_id });

    const ordine = {
      nome: 'lower(a.nome), a.id',
      uso: 's.numero_movimenti DESC, lower(a.nome), a.id',
      recente: 's.ultimo_movimento DESC NULLS LAST, lower(a.nome), a.id'
    }[ordina];
    const lim = f.p(limit + 1);
    const off = f.p(offset);

    const righe = await queryAll(`
      SELECT a.id, a.nome, a.categoria, a.email, a.telefono, a.piva, a.attivo, a.tipologia_id,
             ta.nome AS tipologia_nome, ta.colore AS tipologia_colore, ta.icona AS tipologia_icona,
             coalesce(a.tipo_movimento_preferito, ta.tipo_movimento_default) AS tipo_movimento_preferito,
             s.numero_movimenti, s.totale_entrate, s.totale_uscite, s.ultimo_movimento
      FROM anagrafiche a
      LEFT JOIN tipologie_anagrafiche ta ON ta.id = a.tipologia_id AND ta.user_id = a.user_id
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS numero_movimenti,
               coalesce(sum(m.importo) FILTER (WHERE m.tipo = 'Entrata'), 0) AS totale_entrate,
               coalesce(sum(m.importo) FILTER (WHERE m.tipo = 'Uscita'), 0) AS totale_uscite,
               max(m.data) AS ultimo_movimento
        FROM movimenti m
        WHERE m.anagrafica_id = a.id AND m.user_id = $1
      ) s
      WHERE ${f.dove.join(' AND ')}
      ORDER BY ${ordine}
      LIMIT ${lim} OFFSET ${off}
    `, f.params);

    const totale = await queryOne(
      `SELECT count(*)::int AS n FROM anagrafiche a WHERE ${f.dove.join(' AND ')}`,
      f.params.slice(0, f.params.length - 2)
    );
    const lettere = await queryAll(`
      SELECT CASE WHEN upper(left(a.nome, 1)) ~ '^[A-Z]$' THEN upper(left(a.nome, 1)) ELSE '#' END AS lettera,
             count(*)::int AS n
      FROM anagrafiche a
      WHERE ${g.dove.join(' AND ')}
      GROUP BY 1 ORDER BY 1
    `, g.params);

    res.json({
      anagrafiche: righe.slice(0, limit),
      totale: totale.n,
      limit,
      offset,
      altri: righe.length > limit,
      lettere
    });
  } catch (error) {
    logErrore('Error listing anagrafiche', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle anagrafiche' });
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
    logErrore('Error fetching anagrafiche attive', error);
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
    logErrore('Error fetching anagrafica detail', error);
    res.status(500).json({ error: 'Errore durante il caricamento dell\'anagrafica' });
  }
});

// POST /api/anagrafiche - Crea nuova anagrafica (AGGIORNATO)
router.post('/', validate(schemas.anagrafica), async (req, res) => {
  try {
    const { nome, tipologia_id, tipo_movimento_preferito, categoria, email, telefono, piva, indirizzo, attivo } = req.body;

    // La tipologia deve essere dell'utente (U6a: prima si accettava quella di un altro).
    if (tipologia_id && !(await tipologiaPropria(tipologia_id, req.user.id))) {
      return res.status(400).json({ error: 'Tipologia non trovata' });
    }
    
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
      (nome, tipologia_id, categoria, email, telefono, piva, indirizzo, attivo, user_id, tipo_movimento_preferito)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      req.user.id,
      tipo_movimento_preferito || null
    ]);
    
    const newAnagrafica = result.rows[0];
    
    res.status(201).json(newAnagrafica);
  } catch (error) {
    // Due creazioni simultanee con lo stesso nome: il vincolo UNIQUE(user_id, nome).
    if (error.code === '23505') {
      return res.status(400).json({ error: `Esiste già un'anagrafica con questo nome: ${req.body.nome}` });
    }
    logErrore('Error creating anagrafica', error);
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

    // U6a: stesse regole della creazione (prima: tipologia altrui accettata,
    // nome doppio -> 500, P.IVA doppia accettata).
    if (updateData.tipologia_id && !(await tipologiaPropria(updateData.tipologia_id, userId))) {
      return res.status(400).json({ error: 'Tipologia non trovata' });
    }
    if (updateData.piva && updateData.piva.trim()) {
      const doppia = await queryOne(
        'SELECT nome FROM anagrafiche WHERE piva = $1 AND user_id = $2 AND id <> $3',
        [updateData.piva.trim(), userId, anagraficaId]
      );
      if (doppia) return res.status(400).json({ error: `P.IVA già associata a: ${doppia.nome}` });
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
    if (error.code === '23505') {
      return res.status(400).json({ error: `Esiste già un'anagrafica con questo nome: ${req.body.nome}` });
    }
    logErrore('❌ Error updating anagrafica', error);
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
    logErrore('Error deleting anagrafica', error);
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
    logErrore('Error toggling anagrafica stato', error);
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
    logErrore('Error fetching anagrafica movimenti', error);
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
    logErrore('Error fetching anagrafica statistiche', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle statistiche' });
  }
});

module.exports = router;