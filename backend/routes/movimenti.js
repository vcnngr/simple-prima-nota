// routes/movimenti.js - VERSIONE FLESSIBILE CON TIPOLOGIE
const express = require('express');
const { query, queryOne, queryAll, withTransaction } = require('../config/database');
const auth = require('../middleware/auth');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const moment = require('moment');

const router = express.Router();

// Middleware di autenticazione per tutte le route
router.use(auth);

// Schema per filtri movimenti (AGGIORNATO)
const movimentiFiltersSchema = require('joi').object({
  data_inizio: require('joi').date().optional(),
  data_fine: require('joi').date().optional(),
  conto_id: require('joi').number().integer().optional(),
  anagrafica_id: require('joi').number().integer().optional(),
  tipologia_id: require('joi').number().integer().optional(), // NUOVO
  tipo: require('joi').string().valid('Entrata', 'Uscita').optional(),
  importo_min: require('joi').number().min(0).optional(),
  importo_max: require('joi').number().min(0).optional(),
  search: require('joi').string().max(100).optional(),
  limit: require('joi').number().integer().min(1).max(1000).default(50),
  offset: require('joi').number().integer().min(0).default(0),
  order_by: require('joi').string().valid('data', 'importo', 'created_at').default('data'),
  order_direction: require('joi').string().valid('ASC', 'DESC').default('DESC')
});

// GET /api/movimenti/export - Export movimenti (AGGIORNATO CON TIPOLOGIE)
router.get('/export', async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      formato = 'csv',
      data_inizio,
      data_fine,
      conto_id,
      anagrafica_id,
      tipologia_id, // NUOVO
      tipo,
      limit = 5000
    } = req.query;
    
    let whereConditions = ['m.user_id = $1'];
    let params = [userId];
    let paramIndex = 2;
    
    // Filtri esistenti
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
    
    // NUOVO: Filtro per tipologia
    if (tipologia_id) {
      whereConditions.push(`a.tipologia_id = $${paramIndex}`);
      params.push(tipologia_id);
      paramIndex++;
    }
    
    if (tipo && ['Entrata', 'Uscita'].includes(tipo)) {
      whereConditions.push(`m.tipo = $${paramIndex}`);
      params.push(tipo);
      paramIndex++;
    }
    
    // Query con calcolo saldo progressivo (AGGIORNATA CON TIPOLOGIE)
    const movimenti = await queryAll(`
      SELECT 
        m.data,
        COALESCE(a.nome, 'Non specificato') as anagrafica,
        COALESCE(ta.nome, 'Senza tipologia') as tipologia,
        COALESCE(cc.nome_banca, 'Non specificato') as conto,
        COALESCE(a.categoria, m.tipo) as categoria,
        m.descrizione as operazione,
        CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END as entrate,
        CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END as uscite,
        COALESCE(m.note, '') as note
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY m.data ASC, m.created_at ASC
      LIMIT ${paramIndex}
    `, [...params, parseInt(limit)]);
      
      // Calcola saldo progressivo (INVARIATO)
      let saldoProgressivo = 0;
      
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
          
          // Prepara dati per Excel (AGGIORNATO CON TIPOLOGIA)
          const excelData = movimentiConSaldo.map(m => ({
            'Data': m.data,
            'Anagrafica': m.anagrafica,
            'Tipologia': m.tipologia,
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
          // CSV nel formato con tipologie (AGGIORNATO)
          let csvContent = 'Data;Anagrafica;Tipologia;Conto;Categoria;Operazione;Entrate;Uscite;Saldo;Note\n';
          
          // Riga vuota come nel formato originale
          csvContent += ';;;;;;;;;;;\n';
          
          movimentiConSaldo.forEach(movimento => {
            const data = movimento.data;
            const anagrafica = movimento.anagrafica.replace(/;/g, ',');
            const tipologia = movimento.tipologia.replace(/;/g, ','); // NUOVO
            const conto = movimento.conto.replace(/;/g, ',');
            const categoria = movimento.categoria.replace(/;/g, ',');
            const operazione = movimento.operazione.replace(/;/g, ',');
            const entrate = parseFloat(movimento.entrate).toFixed(2).replace('.', ',') + ' €';
            const uscite = parseFloat(movimento.uscite).toFixed(2).replace('.', ',') + ' €';
            const saldo = parseFloat(movimento.saldo).toFixed(2).replace('.', ',') + ' €';
            const note = movimento.note.replace(/;/g, ',');
            
            csvContent += `${data};${anagrafica};${tipologia};${conto};${categoria};${operazione};${entrate};${uscite};${saldo};${note}\n`;
          });
          
          // Aggiungi riga riepilogativa finale (INVARIATA)
          const totaleEntrate = movimentiConSaldo.reduce((sum, m) => sum + parseFloat(m.entrate), 0);
          const totaleUscite = movimentiConSaldo.reduce((sum, m) => sum + parseFloat(m.uscite), 0);
          const saldoFinale = totaleEntrate - totaleUscite;
          const numeroTransazioni = movimentiConSaldo.length;
          
          csvContent += `;;;;Numero transazioni:;${numeroTransazioni};${totaleEntrate.toFixed(2).replace('.', ',')} €;${totaleUscite.toFixed(2).replace('.', ',')} €;${saldoFinale.toFixed(2).replace('.', ',')} €**%**;;\n`;
          
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="prima_nota_${new Date().toISOString().split('T')[0]}.csv"`);
          
          res.send('\uFEFF' + csvContent);
        }
        
      } catch (error) {
        console.error('Error exporting movimenti:', error);
        res.status(500).json({ error: 'Errore durante l\'export dei movimenti' });
      }
    });
    
    // GET /api/movimenti/template - Template con tipologie (AGGIORNATO)
    router.get('/template', (req, res) => {
      try {
        let csvContent = 'Data;Anagrafica;Tipologia;Conto;Categoria;Operazione;Entrate;Uscite;Saldo;Note\n';
        csvContent += ';;;;;;;;;;;\n'; // Riga vuota
        csvContent += '2025-01-15;Cliente Esempio;Cliente Premium;Fineco;fattura;Fattura nr 001 del 15/01/2025;1500,00 €;0,00 €;1500,00 €;Note esempio entrata\n';
        csvContent += '2025-01-16;Fornitore Test;Fornitore Servizi;Fineco;acquisti;Fattura FOR-123 del 16/01/2025;0,00 €;450,00 €;1050,00 €;Note esempio uscita\n';
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="template_prima_nota.csv"');
        res.send('\uFEFF' + csvContent);
      } catch (error) {
        console.error('Error generating template:', error);
        res.status(500).json({ error: 'Errore durante la generazione del template' });
      }
    });
    
    // POST /api/movimenti/import - SOSTITUISCI COMPLETAMENTE L'ENDPOINT ESISTENTE
    router.post('/import', auth, async (req, res) => {
      const { csvData } = req.body;
      const userId = req.user.id;
      
      if (!csvData) {
        return res.status(400).json({ error: 'Dati CSV richiesti' });
      }
      
      try {
        console.log('🔄 Inizio import CSV per utente:', userId);
        
        // Parse CSV con delimitatore ;
        const lines = csvData.split('\n');
        const risultati = {
          movimenti_importati: 0,
          errori: 0,
          anagrafiche_create: 0,
          categorie_create: 0,
          dettagli_errori: [],
          riepilogo: {
            entrate_totali: 0,
            uscite_totali: 0
          }
        };
        
        // Cache per evitare query ripetute
        const cache = {
          anagrafiche: new Map(),
          tipologie: new Map(),
          categorie: new Map(),
          conto_fineco: null
        };
        
        // 1. Trova il conto Fineco (o primo disponibile)
        const contiQuery = await queryAll(
          'SELECT id, nome_banca FROM conti_correnti WHERE user_id = $1 AND attivo = true ORDER BY nome_banca',
          [userId]
        );
        
        cache.conto_fineco = contiQuery.find(c => 
          c.nome_banca.toLowerCase().includes('fineco')
        ) || contiQuery[0];
        
        if (!cache.conto_fineco) {
          return res.status(400).json({ 
            error: 'Nessun conto corrente attivo trovato. Crea almeno un conto prima di importare.' 
          });
        }
        
        console.log('💳 Conto selezionato:', cache.conto_fineco.nome_banca);
        
        // 2. Carica tipologie esistenti
        const tipologieQuery = await queryAll(
          'SELECT id, nome, tipo_movimento_default FROM tipologie_anagrafiche WHERE user_id = $1',
          [userId]
        );
        tipologieQuery.forEach(t => cache.tipologie.set(t.nome.toLowerCase(), t));
        
        // 3. Processa ogni riga del CSV
        for (let i = 0; i < lines.length; i++) {
          const lineNumber = i + 1;
          const line = lines[i].trim();
          
          // Salta righe vuote, header e footer
          if (!line || 
            line.startsWith('PrimaNotaContabile') ||
            line.startsWith('Data;Anagrafica') ||
            line.startsWith(';;;;;;;') ||
            line.includes('Numero transazioni:')) {
              continue;
            }
            
            try {
              const movimento = await processaCsvRow(line, userId, cache, lineNumber);
              if (movimento) {
                risultati.movimenti_importati++;
                risultati.riepilogo.entrate_totali += movimento.tipo === 'Entrata' ? movimento.importo : 0;
                risultati.riepilogo.uscite_totali += movimento.tipo === 'Uscita' ? movimento.importo : 0;
              }
            } catch (error) {
              risultati.errori++;
              risultati.dettagli_errori.push(`Riga ${lineNumber}: ${error.message}`);
              console.error(`❌ Errore riga ${lineNumber}:`, error.message);
              
              // Continua con le altre righe invece di fermarsi
              if (risultati.errori > 50) {
                risultati.dettagli_errori.push('Troppi errori, import interrotto');
                break;
              }
            }
          }
          
          console.log('✅ Import completato:', risultati);
          
          res.json({
            success: true,
            movimenti_importati: risultati.movimenti_importati,
            errori: risultati.errori,
            anagrafiche_create: risultati.anagrafiche_create,
            categorie_create: risultati.categorie_create,
            dettagli: {
              errori: risultati.dettagli_errori
            },
            message: `Import completato: ${risultati.movimenti_importati} movimenti importati, ${risultati.errori} errori`
          });
          
        } catch (error) {
          console.error('💥 Errore generale import:', error);
          res.status(500).json({ 
            error: 'Errore durante l\'import', 
            dettaglio: error.message 
          });
        }
      });
      
      // GET /api/movimenti - Lista movimenti (AGGIORNATO CON TIPOLOGIE)
      router.get('/', validateQuery(movimentiFiltersSchema), async (req, res) => {
        try {
          const {
            data_inizio,
            data_fine,
            conto_id,
            anagrafica_id,
            tipologia_id, // NUOVO
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
          
          // Filtri esistenti (INVARIATI)
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
          
          // NUOVO: Filtro per tipologia
          if (tipologia_id) {
            whereConditions.push(`a.tipologia_id = $${paramIndex}`);
            params.push(tipologia_id);
            paramIndex++;
          }
          
          if (tipo) {
            whereConditions.push(`m.tipo = $${paramIndex}`);
            params.push(tipo);
            paramIndex++;
          }
          
          if (importo_min) {
            whereConditions.push(`m.importo >= $${paramIndex}`);
            params.push(importo_min);
            paramIndex++;
          }
          
          if (importo_max) {
            whereConditions.push(`m.importo <= $${paramIndex}`);
            params.push(importo_max);
            paramIndex++;
          }
          
          if (search) {
            whereConditions.push(`(m.descrizione ILIKE $${paramIndex} OR m.note ILIKE $${paramIndex} OR a.nome ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
          }
          
          const validOrderBy = ['data', 'importo', 'created_at'];
          const validDirection = ['ASC', 'DESC'];
          const safeOrderBy = validOrderBy.includes(order_by) ? order_by : 'data';
          const safeDirection = validDirection.includes(order_direction) ? order_direction : 'DESC';
          
          // Query principale con tipologie (AGGIORNATA)
          const movimenti = await queryAll(`
      SELECT 
        m.*,
        a.nome as anagrafica_nome,
        ta.nome as tipologia_nome,
        ta.tipo_movimento_default,
        ta.colore as tipologia_colore,
        ta.icona as tipologia_icona,
        cc.nome_banca,
        cc.intestatario
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY m.data DESC, m.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);
            
            // Conta il totale (AGGIORNATO)
            const totalCount = await queryOne(`
      SELECT COUNT(*) as count
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE ${whereConditions.join(' AND ')}
    `, params);
              
              // Totali per il periodo filtrato (AGGIORNATO)
              const totali = await queryOne(`
      SELECT 
        COUNT(*) as numero_movimenti,
        COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END), 0) as totale_entrate,
        COALESCE(SUM(CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END), 0) as totale_uscite,
        COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE -m.importo END), 0) as saldo_netto
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
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
            
            // Tutti gli altri endpoint (recenti, :id, POST, PUT, DELETE, bulk, statistiche) 
            // rimangono INVARIATI tranne le query che ora includono tipologie nelle JOIN
            
            // GET /api/movimenti/recenti - Ultimi movimenti (AGGIORNATO CON TIPOLOGIE)
            router.get('/recenti', async (req, res) => {
              try {
                const { limit = 10 } = req.query;
                
                const movimenti = await queryAll(`
      SELECT 
        m.*,
        a.nome as anagrafica_nome,
        ta.nome as tipologia_nome,
        ta.colore as tipologia_colore,
        ta.icona as tipologia_icona,
        cc.nome_banca
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
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
              
              // GET /api/movimenti/:id - Dettaglio singolo movimento (AGGIORNATO)
              router.get('/:id', async (req, res) => {
                try {
                  const { id } = req.params;
                  
                  const movimento = await queryOne(`
      SELECT 
        m.*,
        a.nome as anagrafica_nome,
        ta.nome as tipologia_nome,
        ta.tipo_movimento_default,
        ta.colore as tipologia_colore,
        ta.icona as tipologia_icona,
        a.categoria as anagrafica_categoria,
        cc.nome_banca,
        cc.intestatario,
        cc.iban
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
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
                
                // POST /api/movimenti - Crea nuovo movimento (INVARIATO - usa schema esistente)
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
                    
                    // Recupera i dettagli completi con tipologie (AGGIORNATO)
                    const movimentoCompleto = await queryOne(`
      SELECT 
        m.*,
        a.nome as anagrafica_nome,
        ta.nome as tipologia_nome,
        ta.colore as tipologia_colore,
        ta.icona as tipologia_icona,
        cc.nome_banca,
        cc.intestatario
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE m.id = $1
    `, [newMovimento.id]);
                      
                      res.status(201).json(movimentoCompleto);
                    } catch (error) {
                      console.error('Error creating movimento:', error);
                      res.status(500).json({ error: 'Errore durante la creazione del movimento' });
                    }
                  });
                  
                  // PUT, DELETE, bulk, statistiche rimangono INVARIATI
                  // Solo aggiornate le query che fanno JOIN con anagrafiche per includere tipologie
                  
                  // PUT /api/movimenti/:id - Aggiorna movimento (INVARIATO)
                  router.put('/:id', validate(schemas.movimentoUpdate), async (req, res) => {
                    try {
                      const movimentoId = parseInt(req.params.id);
                      const userId = req.user.id;
                      const updateData = req.body;
                      
                      const existingMovimento = await queryOne(
                        'SELECT id, conto_id FROM movimenti WHERE id = $1 AND user_id = $2',
                        [movimentoId, userId]
                      );
                      
                      if (!existingMovimento) {
                        return res.status(404).json({ error: 'Movimento non trovato' });
                      }
                      
                      if (updateData.conto_id && updateData.conto_id !== existingMovimento.conto_id) {
                        const conto = await queryOne(
                          'SELECT id FROM conti_correnti WHERE id = $1 AND user_id = $2',
                          [updateData.conto_id, userId]
                        );
                        
                        if (!conto) {
                          return res.status(400).json({ error: 'Conto bancario non valido' });
                        }
                      }
                      
                      if (updateData.anagrafica_id) {
                        const anagrafica = await queryOne(
                          'SELECT id FROM anagrafiche WHERE id = $1 AND user_id = $2',
                          [updateData.anagrafica_id, userId]
                        );
                        
                        if (!anagrafica) {
                          return res.status(400).json({ error: 'Anagrafica non valida' });
                        }
                      }
                      
                      const fields = [];
                      const values = [];
                      let paramIndex = 1;
                      
                      Object.keys(updateData).forEach(key => {
                        if (updateData[key] !== undefined) {
                          fields.push(`${key} = $${paramIndex}`);
                          
                          // Converti tipi specifici
                          let value = updateData[key];
                          if (key === 'data' && typeof value === 'string') {
                            // Converte data ISO in formato DATE
                            value = value.split('T')[0]; // "2025-07-22T00:00:00.000Z" → "2025-07-22"
                          } else if (key === 'importo' && typeof value === 'string') {
                            // Assicura che importo sia numerico
                            value = parseFloat(value);
                          }
                          
                          values.push(value);
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
                      
                      const result = await queryOne(updateQuery, values);
                      
                      res.json({
                        success: true,
                        message: 'Movimento aggiornato con successo',
                        data: result
                      });
                      
                    } catch (error) {
                      console.error('Error updating movimento:', error);
                      res.status(500).json({ error: 'Errore durante l\'aggiornamento del movimento' });
                    }
                  });
                  
                  // DELETE /api/movimenti/:id - Elimina movimento (INVARIATO)
                  router.delete('/:id', async (req, res) => {
                    try {
                      const { id } = req.params;
                      
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
                  
                  // GET /api/movimenti/statistiche/mensili - Statistiche mensili (INVARIATO)
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

                    // Funzione per processare una singola riga CSV
async function processaCsvRow(line, userId, cache, lineNumber) {
  const columns = line.split(';');
  
  if (columns.length < 8) {
    throw new Error('Formato riga non valido (colonne insufficienti)');
  }

  const [
    dataStr,
    anagraficaStr,
    contoStr,
    categoriaStr,
    operazioneStr,
    entrateStr,
    usciteStr,
    saldoStr
  ] = columns;

  // 1. Valida e parsing data
  const data = parseDate(dataStr.trim());
  if (!data) {
    throw new Error(`Data non valida: ${dataStr}`);
  }

  // 2. Parse importi
  const entrate = parseImporto(entrateStr);
  const uscite = parseImporto(usciteStr);
  
  if (entrate === 0 && uscite === 0) {
    throw new Error('Nessun importo specificato');
  }
  
  if (entrate > 0 && uscite > 0) {
    throw new Error('Entrate e uscite non possono essere entrambe > 0');
  }

  // 3. Determina tipo e importo
  const tipo = entrate > 0 ? 'Entrata' : 'Uscita';
  const importo = Math.max(entrate, uscite);

  // 4. Gestisci anagrafica
  const anagraficaId = await gestisciAnagrafica(
    anagraficaStr.trim(), 
    tipo, 
    userId, 
    cache
  );

  // 5. Gestisci categoria
  const categoria = await gestisciCategoria(
    categoriaStr.trim(), 
    tipo, 
    userId, 
    cache
  );

  // 6. Crea movimento
  const descrizione = operazioneStr.trim() || 'Movimento importato';
  
  const note = contoStr.trim() && !contoStr.includes('Fineco') ? 
    `Origine: ${contoStr}` : null;

  const result = await query(`
    INSERT INTO movimenti (
      data, anagrafica_id, conto_id, descrizione, categoria, 
      importo, tipo, note, user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
    RETURNING *
  `, [
    data,
    anagraficaId,
    cache.conto_fineco.id,
    descrizione,
    categoria || null,
    importo,
    tipo,
    note,
    userId
  ]);

  return {
    id: result.rows[0].id,
    tipo,
    importo,
    descrizione
  };
}

// Funzione per parsing data
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // Formato atteso: YYYY-MM-DD
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  
  const [, year, month, day] = match;
  const date = new Date(year, month - 1, day);
  
  // Verifica che la data sia valida
  if (date.getFullYear() != year || 
      date.getMonth() != month - 1 || 
      date.getDate() != day) {
    return null;
  }
  
  return date.toISOString().split('T')[0];
}

// Funzione per parsing importi italiani
function parseImporto(importoStr) {
  if (!importoStr) return 0;
  
  // Rimuovi €, spazi e sostituisci , con .
  let cleanStr = importoStr
    .replace(/€/g, '')
    .replace(/\s/g, '')
    .trim();
  
  if (!cleanStr || cleanStr === '0,00') return 0;
  
  // Gestisce formato italiano: 1.234,56 → 1234.56
  if (cleanStr.includes(',')) {
    const parts = cleanStr.split(',');
    if (parts.length === 2) {
      const integerPart = parts[0].replace(/\./g, ''); // Rimuovi punti migliaia
      const decimalPart = parts[1];
      cleanStr = `${integerPart}.${decimalPart}`;
    }
  }
  
  const importo = parseFloat(cleanStr);
  return isNaN(importo) ? 0 : importo;
}

// Funzione per gestire anagrafiche
async function gestisciAnagrafica(nomeAnagrafica, tipoMovimento, userId, cache) {
  if (!nomeAnagrafica || nomeAnagrafica.toLowerCase() === 'non specificato') {
    return null;
  }

  const nomeKey = nomeAnagrafica.toLowerCase();
  
  // Controlla cache
  if (cache.anagrafiche.has(nomeKey)) {
    return cache.anagrafiche.get(nomeKey);
  }

  // Cerca anagrafica esistente
  const existingQuery = await queryOne(
    'SELECT id FROM anagrafiche WHERE LOWER(nome) = $1 AND user_id = $2',
    [nomeKey, userId]
  );

  if (existingQuery) {
    const id = existingQuery.id;
    cache.anagrafiche.set(nomeKey, id);
    return id;
  }

  // Crea nuova anagrafica
  const tipologia = await determinaTipologia(nomeAnagrafica, tipoMovimento, userId, cache);
  
  const result = await queryOne(`
    INSERT INTO anagrafiche (nome, tipologia_id, user_id) 
    VALUES ($1, $2, $3) 
    RETURNING id
  `, [nomeAnagrafica, tipologia.id, userId]);
  
  const nuovoId = result.id;
  
  cache.anagrafiche.set(nomeKey, nuovoId);
  console.log(`📝 Creata anagrafica: ${nomeAnagrafica} (${tipologia.nome})`);
  
  return nuovoId;
}

// Funzione per determinare tipologia anagrafica
async function determinaTipologia(nomeAnagrafica, tipoMovimento, userId, cache) {
  const nomeLower = nomeAnagrafica.toLowerCase();
  
  // Regole specifiche per soci
  if (nomeLower.includes('giorgia') || nomeLower.includes('valentina')) {
    return await creaTipologiaSeNecessaria('Socio', 'Entrambi', userId, cache);
  }

  // Regole per dipendenti
  if (nomeLower.includes('elmor') || nomeLower.includes('celia')) {
    return await creaTipologiaSeNecessaria('Dipendente', 'Uscita', userId, cache);
  }

  // Regole per tipologie comuni
  const regoleTipologie = [
    { keywords: ['srl', 'spa', 's.p.a.', 'srls'], tipo: 'Fornitore', movimento: 'Uscita' },
    { keywords: ['arch.', 'dott.', 'studio'], tipo: 'Consulente', movimento: 'Entrambi' },
    { keywords: ['illumia', 'vodafone'], tipo: 'Fornitore Servizi', movimento: 'Uscita' }
  ];

  for (const regola of regoleTipologie) {
    if (regola.keywords.some(keyword => nomeLower.includes(keyword))) {
      return await creaTipologiaSeNecessaria(regola.tipo, regola.movimento, userId, cache);
    }
  }

  // Default basato sul tipo movimento
  if (tipoMovimento === 'Entrata') {
    return await creaTipologiaSeNecessaria('Cliente', 'Entrata', userId, cache);
  } else {
    return await creaTipologiaSeNecessaria('Fornitore', 'Uscita', userId, cache);
  }
}

// Funzione per creare tipologia se non esiste
async function creaTipologiaSeNecessaria(nomeTipologia, tipoMovimento, userId, cache) {
  const key = nomeTipologia.toLowerCase();
  
  if (cache.tipologie.has(key)) {
    return cache.tipologie.get(key);
  }

  // Crea tipologia
  const result = await queryOne(`
    INSERT INTO tipologie_anagrafiche (user_id, nome, tipo_movimento_default) 
    VALUES ($1, $2, $3) 
    RETURNING id, nome, tipo_movimento_default
  `, [userId, nomeTipologia, tipoMovimento]);
  
  const tipologia = result;
  
  cache.tipologie.set(key, tipologia);
  console.log(`🏷️  Creata tipologia: ${nomeTipologia} (${tipoMovimento})`);
  
  return tipologia;
}

// Funzione per gestire categorie
async function gestisciCategoria(categoriaStr, tipoMovimento, userId, cache) {
  if (!categoriaStr || categoriaStr.toLowerCase() === 'non specificato') {
    return null;
  }

  // Mapping categorie speciali
  const mappingCategorie = {
    'fattura': 'Fatture',
    'finanziamento infruttifero soci': 'Finanziamenti Soci',
    'tassa di soggiorno': 'Tasse di Soggiorno',
    'stipendio': 'Stipendi',
    'stipendio celia': 'Stipendi',
    'pagopa': 'Pagamenti PagoPA',
    'documento commerciale di vendita o prestazione': 'Vendite'
  };

  const categoriaKey = categoriaStr.toLowerCase();
  const nomeCategoria = mappingCategorie[categoriaKey] || 
    // Capitalizza prima lettera
    categoriaStr.charAt(0).toUpperCase() + categoriaStr.slice(1).toLowerCase();

  const cacheKey = `${nomeCategoria}_${tipoMovimento}`;
  
  if (cache.categorie.has(cacheKey)) {
    return cache.categorie.get(cacheKey);
  }

  // Cerca categoria esistente
  const existingQuery = await queryOne(
    'SELECT nome FROM categorie_movimenti WHERE nome = $1 AND user_id = $2',
    [nomeCategoria, userId]
  );

  if (existingQuery) {
    cache.categorie.set(cacheKey, nomeCategoria);
    return nomeCategoria;
  }

  // Crea nuova categoria
  await query(`
    INSERT INTO categorie_movimenti (user_id, nome, tipo) 
    VALUES ($1, $2, $3) 
    ON CONFLICT (user_id, nome) DO NOTHING
  `, [userId, nomeCategoria, tipoMovimento]);
  
  cache.categorie.set(cacheKey, nomeCategoria);
  console.log(`📂 Creata categoria: ${nomeCategoria} (${tipoMovimento})`);
  
  return nomeCategoria;
}

module.exports = router;