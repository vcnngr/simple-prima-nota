// routes/movimenti.js - VERSIONE FLESSIBILE CON TIPOLOGIE
const express = require('express');
const { query, queryOne, queryAll, withTransaction } = require('../config/database');
const auth = require('../middleware/auth');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const moment = require('moment');
const UnifiedImportProcessor = require('../services/UnifiedImportProcessor');

const router = express.Router();

// Middleware di autenticazione per tutte le route
router.use((req, res, next) => {
  // Route pubbliche (senza autenticazione)
  const publicRoutes = [
    '/template',
    '/import/info'
  ];
  
  // Controlla se la route corrente è pubblica
  if (publicRoutes.includes(req.path)) {
    return next(); // Salta l'autenticazione
  }
  
  // Per tutte le altre route, applica l'autenticazione
  return auth(req, res, next);
});

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
    const { formato = 'csv' } = req.query;
    
    if (formato === 'xlsx') {
      return res.status(501).json({ 
        error: 'Template Excel non ancora supportato',
        suggestion: 'Usa il template CSV che è più universale e compatibile'
      });
    }
    
    // Template CSV completo con documentazione integrata
    const template = `# =============================================================================
# Template Import Prima Nota - Versione 2.0
# Sistema Unificato per Import CSV con Creazione Automatica Entità
# =============================================================================
# 
# FORMATO: CSV con delimitatore punto e virgola (;)
# ENCODING: UTF-8 (obbligatorio)
# 
# COLONNE OBBLIGATORIE (devono essere presenti):
# - Data: formato YYYY-MM-DD (es: 2025-01-15)
# - Descrizione: testo libero che descrive il movimento
# - Importo: numero decimale positivo (usa . o , per decimali)
# - Tipo: "Entrata" o "Uscita" (prima lettera maiuscola)
#
# COLONNE OPZIONALI (raccomandate per organizzazione):
# - Anagrafica: nome persona/azienda (se vuoto: "Non specificato")
# - Tipologia_Anagrafica: Cliente, Fornitore, Consulente, etc. (creata automaticamente)
# - Categoria_Anagrafica: VIP, Locale, Strategico, etc. (creata automaticamente)
# - Conto: nome banca/conto corrente (se vuoto: "Conto Principale")
# - Categoria_Movimento: Vendite, Acquisti, Consulenze, etc. (creata automaticamente)
# - Note: informazioni aggiuntive libere
#
# CREAZIONE AUTOMATICA:
# Il sistema creerà automaticamente tutte le entità che non esistono:
# - Conti correnti con il nome specificato
# - Tipologie anagrafiche con tipo movimento appropriato
# - Categorie anagrafiche e movimenti
# - Anagrafiche collegate alle tipologie
#
# COMPATIBILITÀ TIPOLOGIE:
# - Tipologie "Cliente" compatibili con movimenti "Entrata"
# - Tipologie "Fornitore" compatibili con movimenti "Uscita"  
# - Tipologie "Consulente" compatibili con entrambi i tipi
# - Se incompatibili, verrà creata una variante (es: "Cliente (Uscita)")

Data;Descrizione;Importo;Tipo;Anagrafica;Tipologia_Anagrafica;Categoria_Anagrafica;Conto;Categoria_Movimento;Note
2025-01-15;Fattura servizi sviluppo web FT001/2025;2500.00;Entrata;TechSolutions SRL;Cliente Premium;Strategico;Intesa Sanpaolo;Vendite Servizi;Progetto e-commerce Q1 2025
2025-01-16;Acquisto server Dell PowerEdge;1200.00;Uscita;Hardware Express SpA;Fornitore Materiali;Operativo;UniCredit Business;Acquisti IT;Upgrade infrastruttura produzione
2025-01-17;Consulenza fiscale dichiarazione 2024;400.00;Uscita;Dott. Mario Rossi;Consulente;VIP;Fineco Conto;Consulenza Esterna;Preparazione dichiarazione redditi
2025-01-18;Vendita licenze Office 365;800.00;Entrata;Azienda Locale SNC;Cliente Standard;Locale;Intesa Sanpaolo;Vendite Prodotti;20 licenze mensili gennaio
2025-01-19;Spese cancelleria e materiali ufficio;150.00;Uscita;Cartoleria Centrale;Fornitore Servizi;Operativo;Fineco Conto;Spese Operative;Materiali gennaio 2025
2025-01-20;Rimborso spese trasferta Milano;320.00;Uscita;Mario Bianchi;Dipendente;Interno;UniCredit Business;Rimborsi;Trasferta cliente 15-16 gennaio
2025-01-22;Incasso fattura dicembre ritardataria;1800.00;Entrata;ClienteVIP Corporation;Cliente Premium;VIP;Intesa Sanpaolo;Vendite Servizi;Progetto concluso dicembre 2024
2025-01-23;Pagamento hosting annuale;480.00;Uscita;CloudProvider Hosting;Fornitore Servizi;Strategico;Fineco Conto;Spese IT;Hosting siti web 2025
2025-01-24;Consulenza marketing strategico;750.00;Uscita;Agenzia CreativeMedia;Consulente;Strategico;UniCredit Business;Consulenza Esterna;Piano marketing Q1 2025
2025-01-25;Vendita corso formazione aziendale;1200.00;Entrata;FormAzienda Learning;Cliente Standard;Nazionale;Intesa Sanpaolo;Vendite Servizi;Corso leadership management
#
# SUGGERIMENTI PER L'USO:
# 1. Salva sempre in formato UTF-8 per evitare problemi con caratteri speciali
# 2. Non usare punti e virgola (;) nei testi - usa virgole o trattini
# 3. Per importi usa sempre numeri positivi - il tipo determina entrata/uscita
# 4. Mantieni consistenza nei nomi di anagrafiche e categorie
# 5. Puoi lasciare vuote le colonne opzionali - verranno gestite automaticamente
# 6. Testa prima con poche righe, poi importa il file completo
#
# Per supporto: consulta la documentazione o contatta l'assistenza
# =============================================================================`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="template_prima_nota_v2.csv"');
    
    // BOM UTF-8 per compatibilità Excel
    res.send('\uFEFF' + template);
    
  } catch (error) {
    console.error('Errore generazione template:', error);
    res.status(500).json({ 
      error: 'Errore durante la generazione del template',
      suggestion: 'Riprova tra qualche secondo' 
    });
  }
});

router.get('/import/info', (req, res) => {
  try {
    res.json({
      title: 'Import Prima Nota - Sistema Unificato',
      version: '2.0',
      description: 'Import CSV con creazione automatica di tutte le entità correlate',
      
      formato: {
        tipo: 'CSV',
        delimitatore: ';',
        encoding: 'UTF-8',
        header_richiesto: true,
        commenti_supportati: true,
        max_file_size: '10MB',
        max_righe: 10000
      },
      
      colonne: {
        obbligatorie: [
          {
            nome: 'Data',
            tipo: 'string',
            formato: 'YYYY-MM-DD',
            esempio: '2025-01-15',
            descrizione: 'Data del movimento in formato ISO'
          },
          {
            nome: 'Descrizione', 
            tipo: 'string',
            formato: 'Testo libero',
            esempio: 'Fattura servizi web FT001',
            descrizione: 'Descrizione dettagliata del movimento'
          },
          {
            nome: 'Importo',
            tipo: 'number',
            formato: 'Decimale positivo',
            esempio: '1500.00 o 1500,00',
            descrizione: 'Importo in euro, sempre positivo'
          },
          {
            nome: 'Tipo',
            tipo: 'enum',
            formato: 'Entrata|Uscita',
            esempio: 'Entrata',
            descrizione: 'Tipo di movimento (prima lettera maiuscola)'
          }
        ],
        
        opzionali: [
          {
            nome: 'Anagrafica',
            tipo: 'string',
            esempio: 'TechSolutions SRL',
            descrizione: 'Nome persona/azienda (default: "Non specificato")',
            creazione_automatica: true
          },
          {
            nome: 'Tipologia_Anagrafica',
            tipo: 'string', 
            esempio: 'Cliente Premium',
            descrizione: 'Tipologia anagrafica (default: Cliente per Entrate, Fornitore per Uscite)',
            creazione_automatica: true
          },
          {
            nome: 'Categoria_Anagrafica',
            tipo: 'string',
            esempio: 'VIP',
            descrizione: 'Categoria di classificazione anagrafica (opzionale)',
            creazione_automatica: true
          },
          {
            nome: 'Conto',
            tipo: 'string',
            esempio: 'Intesa Sanpaolo',
            descrizione: 'Nome conto corrente (default: "Conto Principale")',
            creazione_automatica: true
          },
          {
            nome: 'Categoria_Movimento',
            tipo: 'string',
            esempio: 'Vendite Servizi',
            descrizione: 'Categoria specifica del movimento (opzionale)',
            creazione_automatica: true
          },
          {
            nome: 'Note',
            tipo: 'string',
            esempio: 'Progetto Q1 2025',
            descrizione: 'Note aggiuntive libere (opzionale)'
          }
        ]
      },
      
      creazione_automatica: {
        descrizione: 'Il sistema crea automaticamente le entità mancanti durante l\'import',
        entità: [
          'Conti correnti non esistenti',
          'Tipologie anagrafiche con tipo movimento appropriato',
          'Categorie anagrafiche',
          'Categorie movimenti con tipo compatibile',
          'Anagrafiche con tipologia assegnata'
        ]
      },
      
      esempi: [
        {
          scenario: 'Movimento base con solo campi obbligatori',
          csv: '2025-01-15;Pagamento consulenza;500.00;Uscita;;;;;;;'
        },
        {
          scenario: 'Movimento completo',
          csv: '2025-01-15;Fattura servizi;2500.00;Entrata;Tech Solutions SRL;Cliente Premium;Strategico;Intesa Sanpaolo;Vendite Servizi;Progetto web'
        }
      ],
      
      limitazioni: [
        'File massimo: 10MB',
        'Righe massime: 10.000 per import',
        'Formato supportato: solo CSV con delimitatore ;',
        'Encoding richiesto: UTF-8'
      ]
    });
  } catch (error) {
    console.error('Errore info import:', error);
    res.status(500).json({ 
      error: 'Errore durante il caricamento delle informazioni import' 
    });
  }
});


router.post('/import', auth, async (req, res) => {
  try {
    const { csvData } = req.body;
    const userId = req.user.id;
    
    // Validazione input base
    if (!csvData || typeof csvData !== 'string') {
      return res.status(400).json({ 
        error: 'Dati CSV richiesti',
        suggestion: 'Invia un oggetto JSON con campo "csvData" contenente il testo del file CSV'
      });
    }
    
    if (csvData.trim().length < 20) {
      return res.status(400).json({ 
        error: 'File CSV troppo piccolo o vuoto',
        suggestion: 'Il file deve contenere almeno header e una riga di dati'
      });
    }
    
    console.log('🚀 Avvio nuovo import unificato per utente:', userId);
    console.log('📊 Dimensione CSV:', csvData.length, 'caratteri');
    
    // Inizializza e avvia processore
    const processor = new UnifiedImportProcessor(userId);
    const result = await processor.processCSV(csvData);
    
    console.log('✅ Import completato con successo per utente:', userId, result.stats);
    
    res.json(result);
    
  } catch (error) {
    console.error('💥 Errore import per utente:', req.user?.id, error.message);
    
    // Analizza tipo errore per suggerimenti specifici
    let suggestions = [];
    let statusCode = 400;
    
    if (error.message.includes('Header CSV non trovato')) {
      suggestions = [
        'Assicurati che il file contenga almeno una riga header',
        'La prima riga non deve iniziare con # (commento)',
        'Usa il template CSV fornito come esempio'
      ];
    } else if (error.message.includes('Campi obbligatori mancanti')) {
      suggestions = [
        'Il CSV deve contenere le colonne: Data, Descrizione, Importo, Tipo',
        'Controlla che i nomi delle colonne corrispondano al template',
        'Scarica e usa il template ufficiale'
      ];
    } else if (error.message.includes('numero colonne non corrispondente')) {
      suggestions = [
        'Verifica che tutte le righe abbiano lo stesso numero di colonne',
        'Controlla che non ci siano punti e virgola extra nei dati',
        'Usa le virgolette per racchiudere testi con caratteri speciali'
      ];
    } else if (error.message.includes('Data non valida')) {
      suggestions = [
        'Usa formato data YYYY-MM-DD (es: 2025-01-15)',
        'Controlla che tutte le date siano nel formato corretto',
        'Evita date future oltre il 2030 o precedenti al 1900'
      ];
    } else if (error.message.includes('Importo non valido')) {
      suggestions = [
        'Usa formato numerico (es: 1500.00 o 1500,00)',
        'Rimuovi simboli extra eccetto virgola decimale',
        'Gli importi devono essere positivi e maggiori di zero'
      ];
    } else if (error.message.includes('Tipo deve essere')) {
      suggestions = [
        'La colonna Tipo deve contenere solo "Entrata" o "Uscita"',
        'Controlla maiuscole/minuscole (prima lettera maiuscola)',
        'Non lasciare vuoti i campi Tipo'
      ];
    } else if (error.message.includes('Errore caricamento dati esistenti')) {
      suggestions = [
        'Problema di connessione al database',
        'Riprova tra qualche secondo',
        'Contatta il supporto se il problema persiste'
      ];
      statusCode = 500;
    } else {
      suggestions = [
        'Verifica il formato del file CSV',
        'Usa il template ufficiale come base',
        'Controlla la documentazione per esempi',
        'Prova con un file più piccolo per identificare il problema'
      ];
    }
    
    res.status(statusCode).json({
      error: error.message,
      suggestions,
      timestamp: new Date().toISOString(),
      user_id: req.user?.id
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


module.exports = router;