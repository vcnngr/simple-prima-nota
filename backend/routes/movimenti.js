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

// GET /api/movimenti/export - Export movimenti (NUOVO FORMATO)
router.get('/export', async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      formato = 'csv',
      data_inizio,
      data_fine,
      conto_id,
      anagrafica_id,
      tipo,
      limit = 5000
    } = req.query;

    let whereConditions = ['m.user_id = $1'];
    let params = [userId];
    let paramIndex = 2;

    // Filtri (come prima)
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

    if (conto_id) {
      whereConditions.push(`m.conto_id = $${paramIndex}`);
      params.push(conto_id);
      paramIndex++;
    }

    if (anagrafica_id) {
      whereConditions.push(`m.anagrafica_id = $${paramIndex}`);
      params.push(anagrafica_id);
      paramIndex++;
    }

    if (tipo && ['Entrata', 'Uscita'].includes(tipo)) {
      whereConditions.push(`m.tipo = $${paramIndex}`);
      params.push(tipo);
      paramIndex++;
    }

    // Query con calcolo saldo progressivo
    const movimenti = await queryAll(`
      SELECT 
        m.data,
        COALESCE(a.nome, 'Non specificato') as anagrafica,
        COALESCE(cc.nome_banca, 'Non specificato') as conto,
        COALESCE(a.categoria, m.tipo) as categoria,
        m.descrizione as operazione,
        CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END as entrate,
        CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END as uscite,
        COALESCE(m.note, '') as note
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY m.data ASC, m.created_at ASC
      LIMIT ${paramIndex}
    `, [...params, parseInt(limit)]);

    // Calcola saldo progressivo
    let saldoProgressivo = 0;
    
    // Se filtrato per conto specifico, calcola saldo iniziale
    if (conto_id) {
      const saldoIniziale = await queryOne(`
        SELECT 
          cc.saldo_iniziale,
          COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE -m.importo END), 0) as movimenti_precedenti
        FROM conti_correnti cc
        LEFT JOIN movimenti m ON cc.id = m.conto_id AND m.data < COALESCE($3, '1900-01-01')
        WHERE cc.id = $1 AND cc.user_id = $2
        GROUP BY cc.saldo_iniziale
      `, [conto_id, userId, data_inizio]);
      
      saldoProgressivo = parseFloat(saldoIniziale?.saldo_iniziale || 0) + parseFloat(saldoIniziale?.movimenti_precedenti || 0);
    }

    const movimentiConSaldo = movimenti.map(movimento => {
      saldoProgressivo += parseFloat(movimento.entrate) - parseFloat(movimento.uscite);
      return {
        ...movimento,
        saldo: saldoProgressivo
      };
    });

    if (formato === 'xlsx') {
      const XLSX = require('xlsx');
      
      // Prepara dati per Excel (formato del tuo CSV + Note)
      const excelData = movimentiConSaldo.map(m => ({
        'Data': m.data,
        'Anagrafica': m.anagrafica,
        'Conto': m.conto,
        'Categoria': m.categoria,
        'Operazione': m.operazione,
        'Entrate': parseFloat(m.entrate).toFixed(2) + ' €',
        'Uscite': parseFloat(m.uscite).toFixed(2) + ' €',
        'Saldo': parseFloat(m.saldo).toFixed(2) + ' €',
        'Note': m.note
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Prima Nota');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="prima_nota_${new Date().toISOString().split('T')[0]}.xlsx"`);
      res.send(buffer);
    } else {
      // CSV nel TUO formato esatto + Note
      let csvContent = 'Data;Anagrafica;Conto;Categoria;Operazione;Entrate;Uscite;Saldo;Note\n';
      
      // Riga vuota come nel tuo file
      csvContent += ';;;;;;;;;\n';
      
      movimentiConSaldo.forEach(movimento => {
        const data = movimento.data;
        const anagrafica = movimento.anagrafica.replace(/;/g, ','); // Sostituisce ; interni
        const conto = movimento.conto.replace(/;/g, ',');
        const categoria = movimento.categoria.replace(/;/g, ',');
        const operazione = movimento.operazione.replace(/;/g, ',');
        const entrate = parseFloat(movimento.entrate).toFixed(2).replace('.', ',') + ' €';
        const uscite = parseFloat(movimento.uscite).toFixed(2).replace('.', ',') + ' €';
        const saldo = parseFloat(movimento.saldo).toFixed(2).replace('.', ',') + ' €';
        const note = movimento.note.replace(/;/g, ','); // Sostituisce ; interni
        
        csvContent += `${data};${anagrafica};${conto};${categoria};${operazione};${entrate};${uscite};${saldo};${note}\n`;
      });

      // Aggiungi riga riepilogativa finale
      const totaleEntrate = movimentiConSaldo.reduce((sum, m) => sum + parseFloat(m.entrate), 0);
      const totaleUscite = movimentiConSaldo.reduce((sum, m) => sum + parseFloat(m.uscite), 0);
      const saldoFinale = totaleEntrate - totaleUscite;
      const numeroTransazioni = movimentiConSaldo.length;

      csvContent += `;;;;Numero transazioni:;${numeroTransazioni};${totaleEntrate.toFixed(2).replace('.', ',')} €;${totaleUscite.toFixed(2).replace('.', ',')} €;${saldoFinale.toFixed(2).replace('.', ',')} €**%**;\n`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="prima_nota_${new Date().toISOString().split('T')[0]}.csv"`);
      
      // Aggiungi BOM per Excel italiano
      res.send('\uFEFF' + csvContent);
    }

  } catch (error) {
    console.error('Error exporting movimenti:', error);
    res.status(500).json({ error: 'Errore durante l\'export dei movimenti' });
  }
});

router.get('/template', (req, res) => {
  try {
    let csvContent = 'Data;Anagrafica;Conto;Categoria;Operazione;Entrate;Uscite;Saldo;Note\n';
    csvContent += ';;;;;;;;;\n'; // Riga vuota
    csvContent += '2025-01-15;Cliente Esempio;Fineco;fattura;Fattura nr 001 del 15/01/2025;1500,00 €;0,00 €;1500,00 €;Note esempio entrata\n';
    csvContent += '2025-01-16;Fornitore Test;Fineco;acquisti;Fattura FOR-123 del 16/01/2025;0,00 €;450,00 €;1050,00 €;Note esempio uscita\n';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="template_prima_nota.csv"');
    res.send('\uFEFF' + csvContent);
  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({ error: 'Errore durante la generazione del template' });
  }
});

// POST /api/movimenti/import - Import movimenti da CSV
router.post('/import', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { csvData, skipFirstRows = 2 } = req.body; // Salta header e riga vuota

    if (!csvData) {
      return res.status(400).json({ error: 'Dati CSV richiesti' });
    }

    const righe = csvData.split('\n').slice(skipFirstRows); // Salta prime righe
    const movimentiCreati = [];
    const errori = [];

    // Cache per conti e anagrafiche
    const contiCache = {};
    const anagraficheCache = {};

    // Carica conti utente
    const contiUtente = await queryAll(
      'SELECT id, nome_banca FROM conti_correnti WHERE user_id = $1',
      [userId]
    );
    contiUtente.forEach(conto => {
      contiCache[conto.nome_banca.toLowerCase()] = conto.id;
    });

    // Carica anagrafiche utente
    const anagraficheUtente = await queryAll(
      'SELECT id, nome, tipo FROM anagrafiche WHERE user_id = $1',
      [userId]
    );
    anagraficheUtente.forEach(anagrafica => {
      anagraficheCache[anagrafica.nome.toLowerCase()] = anagrafica;
    });

    for (let i = 0; i < righe.length; i++) {
      const riga = righe[i].trim();
      
      // Salta righe vuote e riga di totali
      if (!riga || riga.includes('Numero transazioni:')) continue;

      try {
        const campi = riga.split(';');
        
        if (campi.length < 8) {
          errori.push({
            riga: i + skipFirstRows + 1,
            errore: 'Numero di campi insufficiente (minimo 8)',
            dati: riga
          });
          continue;
        }

        const [data, anagrafica, conto, categoria, operazione, entrate, uscite, saldo, note = ''] = campi;

        // Parsing data
        let dataMovimento;
        try {
          dataMovimento = new Date(data).toISOString().split('T')[0];
        } catch (e) {
          errori.push({
            riga: i + skipFirstRows + 1,
            errore: 'Data non valida',
            dati: data
          });
          continue;
        }

        // Parsing importi
        const importoEntrate = parseFloat(entrate.replace(/[€\s,]/g, '').replace(',', '.')) || 0;
        const importoUscite = parseFloat(uscite.replace(/[€\s,]/g, '').replace(',', '.')) || 0;

        // Determina tipo e importo
        let tipoMovimento, importo;
        if (importoEntrate > 0) {
          tipoMovimento = 'Entrata';
          importo = importoEntrate;
        } else if (importoUscite > 0) {
          tipoMovimento = 'Uscita';
          importo = importoUscite;
        } else {
          errori.push({
            riga: i + skipFirstRows + 1,
            errore: 'Nessun importo valido trovato',
            dati: `Entrate: ${entrate}, Uscite: ${uscite}`
          });
          continue;
        }

        // Trova conto
        let contoId = null;
        if (conto && conto !== 'Non specificato') {
          contoId = contiCache[conto.toLowerCase()];
          if (!contoId) {
            // Crea nuovo conto se non esiste
            const nuovoConto = await queryOne(`
              INSERT INTO conti_correnti (user_id, nome_banca, intestatario, saldo_iniziale)
              VALUES ($1, $2, $3, 0)
              RETURNING id
            `, [userId, conto, 'Importato da CSV']);
            contoId = nuovoConto.id;
            contiCache[conto.toLowerCase()] = contoId;
          }
        }

        // Trova anagrafica
        let anagraficaId = null;
        if (anagrafica && anagrafica !== 'Non specificato') {
          const anagraficaExistente = anagraficheCache[anagrafica.toLowerCase()];
          if (anagraficaExistente) {
            anagraficaId = anagraficaExistente.id;
          } else {
            // Crea nuova anagrafica
            const tipoAnagrafica = tipoMovimento === 'Entrata' ? 'Cliente' : 'Fornitore';
            const nuovaAnagrafica = await queryOne(`
              INSERT INTO anagrafiche (user_id, nome, tipo, categoria)
              VALUES ($1, $2, $3, $4)
              RETURNING id
            `, [userId, anagrafica, tipoAnagrafica, categoria || null]);
            anagraficaId = nuovaAnagrafica.id;
            anagraficheCache[anagrafica.toLowerCase()] = { id: anagraficaId, tipo: tipoAnagrafica };
          }
        }

        // Crea movimento
        const nuovoMovimento = await queryOne(`
          INSERT INTO movimenti (user_id, data, anagrafica_id, conto_id, descrizione, importo, tipo, note)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [userId, dataMovimento, anagraficaId, contoId, operazione, importo, tipoMovimento, note || null]);

        movimentiCreati.push(nuovoMovimento);

      } catch (error) {
        errori.push({
          riga: i + skipFirstRows + 1,
          errore: error.message,
          dati: riga
        });
      }
    }

    res.json({
      success: true,
      movimenti_importati: movimentiCreati.length,
      errori: errori.length,
      dettagli: {
        movimenti_creati: movimentiCreati,
        errori: errori
      },
      message: `Import completato: ${movimentiCreati.length} movimenti importati, ${errori.length} errori`
    });

  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ error: 'Errore durante l\'import del CSV' });
  }
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

    // Valida parametri di ordinamento per sicurezza
    const validOrderBy = ['data', 'importo', 'created_at'];
    const validDirection = ['ASC', 'DESC'];
    const safeOrderBy = validOrderBy.includes(order_by) ? order_by : 'data';
    const safeDirection = validDirection.includes(order_direction) ? order_direction : 'DESC';

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
      ORDER BY m.data DESC, m.created_at DESC
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

// PUT /api/movimenti/:id - Aggiorna movimento
router.put('/:id', validate(schemas.movimentoUpdate), async (req, res) => {
  try {
    const movimentoId = parseInt(req.params.id);
    const userId = req.user.id;
    const updateData = req.body;

    console.log('📝 Update movimento:', { movimentoId, userId, updateData });

    // Verifica che il movimento esista e appartenga all'utente
    const existingMovimento = await queryOne(
      'SELECT id, conto_id FROM movimenti WHERE id = $1 AND user_id = $2',
      [movimentoId, userId]
    );

    if (!existingMovimento) {
      return res.status(404).json({ error: 'Movimento non trovato' });
    }

    // Se cambia il conto, verifica che il nuovo conto appartenga all'utente
    if (updateData.conto_id && updateData.conto_id !== existingMovimento.conto_id) {
      const conto = await queryOne(
        'SELECT id FROM conti_correnti WHERE id = $1 AND user_id = $2',
        [updateData.conto_id, userId]
      );
      
      if (!conto) {
        return res.status(400).json({ error: 'Conto bancario non valido' });
      }
    }

    // Se cambia l'anagrafica, verifica che appartenga all'utente
    if (updateData.anagrafica_id) {
      const anagrafica = await queryOne(
        'SELECT id FROM anagrafiche WHERE id = $1 AND user_id = $2',
        [updateData.anagrafica_id, userId]
      );
      
      if (!anagrafica) {
        return res.status(400).json({ error: 'Anagrafica non valida' });
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
    values.push(movimentoId, userId);

    const updateQuery = `
      UPDATE movimenti 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `;

    console.log('🔄 Update query:', updateQuery);
    
    const result = await queryOne(updateQuery, values);

    res.json({
      success: true,
      message: 'Movimento aggiornato con successo',
      data: result
    });

  } catch (error) {
    console.error('❌ Error updating movimento:', error);
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
