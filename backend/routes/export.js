// backend/routes/export.js - Sistema di Export Unificato
const express = require('express');
const { queryOne, queryAll } = require('../config/database');
const auth = require('../middleware/auth');
const { validateQuery, schemas } = require('../middleware/validation');
const moment = require('moment');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

const router = express.Router();
router.use(auth);

// Schema per configurazione export (AGGIORNATO per Custom)
const exportConfigSchema = require('joi').object({
  // Tipo di export
  export_type: require('joi').string().valid(
    'commercialista', 'semplice', 'entrate', 'uscite', 
    'anagrafiche', 'conti', 'custom'
  ).required(),
  
  // NUOVO: Per export personalizzati
  table_type: require('joi').string().valid('movimenti', 'anagrafiche', 'conti_correnti').optional(),
  campi_personalizzati: require('joi').array().items(require('joi').string()).optional(),
  
  // Filtri periodo (solo per movimenti)
  data_inizio: require('joi').date().optional(),
  data_fine: require('joi').date().optional(),
  tutto_storico: require('joi').boolean().default(false),
  
  // Filtri specifici
  conto_id: require('joi').alternatives().try(
    require('joi').number().integer(),
    require('joi').string().allow('')
  ).optional(),
  tipologia_id: require('joi').alternatives().try(
    require('joi').number().integer(),
    require('joi').string().allow('')
  ).optional(),
  solo_attivi: require('joi').boolean().default(true),
  
  // Formato output
  formato: require('joi').string().valid('json', 'csv', 'xlsx', 'pdf').default('json'),
  
  // Opzioni ordinamento (con default)
  ordina_per: require('joi').string().valid('data', 'importo', 'anagrafica').default('data'),
  ordine: require('joi').string().valid('asc', 'desc').default('desc')
});

// Configurazioni predefinite per ogni tipo di export
const EXPORT_CONFIGS = {
  commercialista: {
    name: 'Estratto per Commercialista',
    table: 'movimenti',
    fields: [
      'data', 'descrizione', 'importo', 'tipo', 'note',
      'anagrafica_nome', 'anagrafica_piva', 'anagrafica_email',
      'tipologia_nome', 'categoria_movimento', 'conto_nome'
    ],
    required_joins: ['anagrafiche', 'tipologie', 'conti']
  },
  semplice: {
    name: 'Estratto Semplice',
    table: 'movimenti',
    fields: ['data', 'descrizione', 'importo', 'tipo', 'anagrafica_nome'],
    required_joins: ['anagrafiche']
  },
  entrate: {
    name: 'Solo Entrate',
    table: 'movimenti',
    fields: ['data', 'descrizione', 'importo', 'anagrafica_nome', 'categoria_movimento'],
    required_joins: ['anagrafiche'],
    filters: { tipo: 'Entrata' }
  },
  uscite: {
    name: 'Solo Uscite', 
    table: 'movimenti',
    fields: ['data', 'descrizione', 'importo', 'anagrafica_nome', 'categoria_movimento'],
    required_joins: ['anagrafiche'],
    filters: { tipo: 'Uscita' }
  },
  anagrafiche: {
    name: 'Lista Anagrafiche',
    table: 'anagrafiche',
    fields: ['nome', 'email', 'telefono', 'piva', 'tipologia_nome', 'categoria'],
    required_joins: ['tipologie']
  },
  conti: {
    name: 'Conti Bancari',
    table: 'conti_correnti',
    fields: ['nome_banca', 'intestatario', 'iban', 'saldo_iniziale', 'saldo_corrente'],
    required_joins: []
  }
};

// Middleware per validazione body (non query)
const validateBody = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    next();
  };
};

// POST /api/export/generate - Endpoint unificato per tutti gli export
router.post('/generate', validateBody(exportConfigSchema), async (req, res) => {
  try {
    const config = req.body;
    const userId = req.user.id;
    
    console.log('🚀 Generazione export:', config);

    // Ottieni configurazione predefinita o usa quella personalizzata
    let exportConfig;
    if (config.export_type === 'custom') {
      exportConfig = buildCustomConfig(config);
    } else {
      exportConfig = EXPORT_CONFIGS[config.export_type];
      if (!exportConfig) {
        return res.status(400).json({ error: 'Tipo di export non valido' });
      }
    }

    // Genera la query SQL
    const { query, params } = buildExportQuery(exportConfig, config, userId);
    

    // Esegui la query
    const data = await queryAll(query, params);
    
    console.log(`✅ Dati estratti: ${data.length} record`);

    // Prepara i metadati del report
    const metadata = {
      tipo_export: config.export_type,
      nome_export: exportConfig.name,
      numero_record: data.length,
      filtri_applicati: buildFiltersDescription(config),
      generato_il: new Date().toISOString(),
      generato_da: req.user.username || req.user.email
    };

    // Formatta i dati secondo il tipo richiesto
    const formattedData = formatExportData(data, exportConfig, config);

    // Restituisci secondo il formato richiesto
    if (config.formato === 'json') {
      return res.json({
        metadata,
        data: formattedData,
        preview: formattedData.slice(0, 10) // Primi 10 record per anteprima
      });
    } else if (config.formato === 'csv') {
      return exportToCsv(res, formattedData, metadata);
    } else if (config.formato === 'xlsx') {
      return exportToXlsx(res, formattedData, metadata);
    } else if (config.formato === 'pdf') {
      return exportToPdf(res, formattedData, metadata);
    }

  } catch (error) {
    console.error('❌ Errore generazione export:', error);
    res.status(500).json({ 
      error: 'Errore durante la generazione dell\'export',
      details: error.message 
    });
  }
});

// Funzione per costruire la query SQL dinamica
function buildExportQuery(exportConfig, userConfig, userId) {
  const { table, fields, required_joins = [], filters = {} } = exportConfig;
  
  // Costruisci SELECT con alias leggibili
  const selectFields = fields.map(field => {
    return getFieldMapping(field, table);
  }).join(', ');

  // Base query
  let query = '';
  let joins = [];
  let whereConditions = [`${getTableAlias(table)}.user_id = $1`];
  let params = [userId];
  let paramIndex = 2;

  // Costruisci query base per tipo di tabella
  if (table === 'movimenti') {
    query = `
      SELECT ${selectFields}
      FROM movimenti m
    `;
    
    // Joins necessari
    if (required_joins.includes('anagrafiche')) {
      joins.push('LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id');
    }
    if (required_joins.includes('tipologie')) {
      joins.push('LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id');
    }
    if (required_joins.includes('conti')) {
      joins.push('LEFT JOIN conti_correnti cc ON m.conto_id = cc.id');
    }

    // Filtri periodo
    if (!userConfig.tutto_storico) {
      if (userConfig.data_inizio) {
        whereConditions.push(`m.data >= $${paramIndex}`);
        params.push(userConfig.data_inizio);
        paramIndex++;
      }
      if (userConfig.data_fine) {
        whereConditions.push(`m.data <= $${paramIndex}`);
        params.push(userConfig.data_fine);
        paramIndex++;
      }
    }

    // Filtro conto specifico
    if (userConfig.conto_id) {
      whereConditions.push(`m.conto_id = $${paramIndex}`);
      params.push(userConfig.conto_id);
      paramIndex++;
    }

    // Filtro tipologia
    if (userConfig.tipologia_id) {
      whereConditions.push(`a.tipologia_id = $${paramIndex}`);
      params.push(userConfig.tipologia_id);
      paramIndex++;
    }

  } else if (table === 'anagrafiche') {
    query = `
      SELECT ${selectFields}
      FROM anagrafiche a
    `;
    
    if (required_joins.includes('tipologie')) {
      joins.push('LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id');
    }

    // Filtro solo attivi
    if (userConfig.solo_attivi) {
      whereConditions.push('a.attivo = true');
    }

  } else if (table === 'conti_correnti') {
    query = `
      SELECT ${selectFields}
      FROM conti_correnti cc
    `;
    
    // Aggiungi calcolo saldo corrente
    if (fields.includes('saldo_corrente')) {
      // Questa parte richiederebbe la funzione calcola_saldo_conto
      // Per semplicità usiamo il saldo iniziale
    }

    if (userConfig.solo_attivi) {
      whereConditions.push('cc.attivo = true');
    }
  }

  // Filtri predefiniti del tipo di export
  Object.entries(filters).forEach(([key, value]) => {
    whereConditions.push(`${getTableAlias(table)}.${key} = $${paramIndex}`);
    params.push(value);
    paramIndex++;
  });

  // Assembla la query completa
  if (joins.length > 0) {
    query += '\n' + joins.join('\n');
  }
  
  query += `\nWHERE ${whereConditions.join(' AND ')}`;
  
  // Ordinamento
  const orderField = getOrderField(userConfig.ordina_per, table);
  query += `\nORDER BY ${orderField} ${userConfig.ordine.toUpperCase()}`;

  return { query, params };
}

// Mapping dei campi alle colonne del database (CORRETTO)
function getFieldMapping(field, table) {
  const mappings = {
    // Movimenti
    'data': 'm.data',
    'descrizione': 'm.descrizione', 
    'importo': 'm.importo',
    'tipo': 'm.tipo',
    'note': 'm.note',
    'categoria_movimento': 'm.categoria as categoria_movimento',
    'anagrafica_nome': 'COALESCE(a.nome, \'Senza anagrafica\') as anagrafica_nome',
    'anagrafica_email': 'a.email as anagrafica_email',
    'anagrafica_telefono': 'a.telefono as anagrafica_telefono',
    'anagrafica_piva': 'a.piva as anagrafica_piva',
    'tipologia_nome': 'COALESCE(ta.nome, \'Senza tipologia\') as tipologia_nome',
    'conto_nome': 'cc.nome_banca as conto_nome',
    'conto_iban': 'cc.iban as conto_iban',
    'conto_intestatario': 'cc.intestatario as conto_intestatario',
    
    // Anagrafiche
    'nome': 'a.nome',
    'email': 'a.email',
    'telefono': 'a.telefono', 
    'piva': 'a.piva',
    'categoria': 'a.categoria',
    'indirizzo': 'a.indirizzo',
    
    // Conti
    'nome_banca': 'cc.nome_banca',
    'intestatario': 'cc.intestatario',
    'iban': 'cc.iban',
    'saldo_iniziale': 'cc.saldo_iniziale',
    'saldo_corrente': 'calcola_saldo_conto(cc.id) as saldo_corrente'
  };

  return mappings[field] || field;
}

// Helper functions
function getTableAlias(table) {
  const aliases = {
    'movimenti': 'm',
    'anagrafiche': 'a', 
    'conti_correnti': 'cc'
  };
  return aliases[table] || table;
}

function getOrderField(orderBy, table) {
  const prefix = getTableAlias(table);
  if (orderBy === 'data') return `${prefix}.data`;
  if (orderBy === 'importo') return `${prefix}.importo`;
  if (orderBy === 'anagrafica') return 'a.nome';
  return `${prefix}.created_at`;
}

function buildCustomConfig(config) {
  
  // Determina tabella dal table_type o dai campi
  let table = config.table_type || 'movimenti';
  
  // Se non specificato, indovina dalla prima field
  if (!config.table_type && config.campi_personalizzati && config.campi_personalizzati.length > 0) {
    const firstField = config.campi_personalizzati[0];
    if (['nome', 'email', 'telefono', 'piva', 'categoria', 'indirizzo'].includes(firstField)) {
      table = 'anagrafiche';
    } else if (['nome_banca', 'intestatario', 'iban', 'saldo_iniziale', 'saldo_corrente'].includes(firstField)) {
      table = 'conti_correnti';
    }
  }
  
  const fields = config.campi_personalizzati && config.campi_personalizzati.length > 0 
    ? config.campi_personalizzati 
    : ['data', 'descrizione', 'importo', 'tipo']; // Default sicuro
    
  return {
    name: 'Export Personalizzato',
    table: table,
    fields: fields,
    required_joins: determineRequiredJoins(fields)
  };
}

function determineRequiredJoins(fields) {
  const joins = [];
  if (fields.some(f => f.startsWith('anagrafica_'))) joins.push('anagrafiche');
  if (fields.some(f => f.includes('tipologia'))) joins.push('tipologie');
  if (fields.some(f => f.startsWith('conto_'))) joins.push('conti');
  return joins;
}

function buildFiltersDescription(config) {
  const filters = [];
  
  if (config.tutto_storico) {
    filters.push('Tutto lo storico');
  } else {
    if (config.data_inizio && config.data_fine) {
      filters.push(`Periodo: ${config.data_inizio} - ${config.data_fine}`);
    }
  }
  
  if (config.conto_id) filters.push(`Conto specifico: ${config.conto_id}`);
  if (config.tipologia_id) filters.push(`Tipologia: ${config.tipologia_id}`);
  
  return filters.join(', ') || 'Nessun filtro applicato';
}

function formatExportData(data, exportConfig, userConfig) {
  // Formatta i dati secondo le esigenze dell'export
  return data.map(row => {
    const formattedRow = {};
    
    // Copia e formatta ogni campo
    Object.keys(row).forEach(key => {
      let value = row[key];
      
      // Formattazione specifica per tipo di dato
      if (key === 'importo' && value !== null) {
        value = parseFloat(value).toFixed(2);
      } else if (key === 'data' && value) {
        value = moment(value).format('DD/MM/YYYY');
      } else if (value === null) {
        value = '';
      }
      
      formattedRow[key] = value;
    });
    
    return formattedRow;
  });
}

// Funzioni di export (CSV, Excel, PDF)
async function exportToCsv(res, data, metadata) {
  if (!data || data.length === 0) {
    return res.status(400).json({ error: 'Nessun dato da esportare' });
  }

  const headers = Object.keys(data[0]);
  let csvContent = headers.join(',') + '\n';
  
  data.forEach(row => {
    const values = headers.map(header => {
      let value = row[header] || '';
      // Escape delle virgole e virgolette
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvContent += values.join(',') + '\n';
  });

  const filename = `${metadata.tipo_export}_${moment().format('YYYY-MM-DD')}.csv`;
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\ufeff' + csvContent); // BOM per UTF-8
}

async function exportToXlsx(res, data, metadata) {
  if (!data || data.length === 0) {
    return res.status(400).json({ error: 'Nessun dato da esportare' });
  }

  // Crea workbook
  const wb = XLSX.utils.book_new();
  
  // Sheet principale con i dati
  const ws = XLSX.utils.json_to_sheet(data);
  
  // Formattazione colonne (larghezza automatica)
  const range = XLSX.utils.decode_range(ws['!ref']);
  const colWidths = [];
  
  for (let c = range.s.c; c <= range.e.c; c++) {
    const header = data.length > 0 ? Object.keys(data[0])[c] : '';
    let maxWidth = header ? header.length : 10;
    
    for (let r = 0; r < Math.min(data.length, 100); r++) {
      const value = Object.values(data[r])[c];
      if (value) {
        maxWidth = Math.max(maxWidth, value.toString().length);
      }
    }
    
    colWidths.push({ width: Math.min(maxWidth + 2, 50) });
  }
  
  ws['!cols'] = colWidths;
  
  // Aggiungi sheet al workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Export');
  
  // Crea sheet metadati
  const metaWs = XLSX.utils.json_to_sheet([metadata]);
  XLSX.utils.book_append_sheet(wb, metaWs, 'Informazioni');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `${metadata.tipo_export}_${moment().format('YYYY-MM-DD')}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

async function exportToPdf(res, data, metadata) {
  try {
    const doc = new PDFDocument({ margin: 50 });
    const filename = `${metadata.tipo_export}_${moment().format('YYYY-MM-DD')}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    doc.pipe(res);

    // Header
    doc.fontSize(16).text('Prima Nota Contabile - Export Report', { align: 'center' });
    doc.moveDown(0.5);
    
    // Metadati
    doc.fontSize(12)
       .text(`Tipo Export: ${metadata.nome_export}`)
       .text(`Generato il: ${moment(metadata.generato_il).format('DD/MM/YYYY HH:mm')}`)
       .text(`Record esportati: ${metadata.numero_record}`)
       .text(`Filtri: ${metadata.filtri_applicati}`)
       .moveDown();

    // Nota per dati dettagliati
    doc.fontSize(10)
       .fillColor('gray')
       .text('Per visualizzare tutti i dati in dettaglio, utilizzare l\'export in formato CSV o Excel.', { 
         align: 'center',
         italics: true 
       });

    // Se ci sono pochi dati, mostra una tabella semplice
    if (data.length <= 20 && data.length > 0) {
      doc.moveDown()
         .fontSize(10)
         .fillColor('black');
      
      const headers = Object.keys(data[0]);
      let y = doc.y;
      
      // Headers
      headers.forEach((header, i) => {
        doc.text(header, 50 + i * 80, y, { width: 75 });
      });
      
      y += 20;
      
      // Dati (primi 20)
      data.slice(0, 20).forEach((row, rowIndex) => {
        headers.forEach((header, colIndex) => {
          const value = row[header] || '';
          doc.text(value.toString().substring(0, 15), 50 + colIndex * 80, y, { width: 75 });
        });
        y += 15;
        
        if (y > 700) { // Nuova pagina se necessario
          doc.addPage();
          y = 50;
        }
      });
    }

    doc.end();
  } catch (error) {
    console.error('❌ Errore export PDF:', error);
    res.status(500).json({ error: 'Errore durante l\'export PDF' });
  }
}

// GET /api/export/preview - Anteprima senza scaricare (CORRETTO)
router.post('/preview', validateBody(exportConfigSchema), async (req, res) => {
  try {
    const config = { ...req.body, formato: 'json' };
    const userId = req.user.id;
    
    console.log('🔍 Generazione anteprima:', config);

    // Usa la stessa logica di generate
    let exportConfig;
    if (config.export_type === 'custom') {
      exportConfig = buildCustomConfig(config);
    } else {
      exportConfig = EXPORT_CONFIGS[config.export_type];
      if (!exportConfig) {
        return res.status(400).json({ error: 'Tipo di export non valido' });
      }
    }

    // Genera la query SQL
    const { query, params } = buildExportQuery(exportConfig, config, userId);
    
    // Limita a 10 record per anteprima
    const limitedQuery = query + ' LIMIT 10';
    
    
    // Esegui la query
    const data = await queryAll(limitedQuery, params);
    
    // Prepara i metadati
    const metadata = {
      tipo_export: config.export_type,
      nome_export: exportConfig.name,
      numero_record_totali: 'Non calcolato (anteprima)',
      numero_record_anteprima: data.length,
      filtri_applicati: buildFiltersDescription(config),
      generato_il: new Date().toISOString(),
      is_preview: true
    };

    // Formatta i dati
    const formattedData = formatExportData(data, exportConfig, config);

    res.json({
      metadata,
      data: formattedData,
      preview: true
    });
    
  } catch (error) {
    console.error('❌ Errore anteprima:', error);
    res.status(500).json({ 
      error: 'Errore durante l\'anteprima',
      details: error.message 
    });
  }
});

module.exports = router;