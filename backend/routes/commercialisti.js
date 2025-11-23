// routes/commercialisti.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, queryOne } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ==============================================================================
// MIDDLEWARE: Verify commercialista authentication
// ==============================================================================
const authCommercialista = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Accesso negato. Token non fornito.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify commercialista exists
    const commercialista = await queryOne(
      'SELECT id, username, email, ragione_sociale, partita_iva, telefono FROM commercialisti WHERE id = $1',
      [decoded.id]
    );

    if (!commercialista || decoded.tipo !== 'commercialista') {
      return res.status(401).json({ error: 'Token non valido.' });
    }

    req.commercialista = commercialista;
    next();
  } catch (error) {
    console.error('Commercialista auth error:', error);
    res.status(401).json({ error: 'Token non valido.' });
  }
};

// ==============================================================================
// POST /api/commercialisti/register - Register new commercialista
// ==============================================================================
router.post('/register', async (req, res) => {
  try {
    const { username, password, email, ragione_sociale, partita_iva, telefono } = req.body;

    // Validation
    if (!username || !password || !email) {
      return res.status(400).json({
        error: 'Username, password ed email sono obbligatori'
      });
    }

    // Check if username or email already exists
    const existing = await queryOne(
      'SELECT id FROM commercialisti WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existing) {
      return res.status(400).json({
        error: 'Username o email già esistente'
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert commercialista
    const result = await queryOne(
      `INSERT INTO commercialisti (username, password_hash, email, ragione_sociale, partita_iva, telefono)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, ragione_sociale, partita_iva, telefono, created_at`,
      [username, password_hash, email, ragione_sociale, partita_iva, telefono]
    );

    // Generate JWT token
    const token = jwt.sign(
      { id: result.id, username: result.username, tipo: 'commercialista' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Registrazione completata con successo',
      commercialista: result,
      token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Errore durante la registrazione' });
  }
});

// ==============================================================================
// POST /api/commercialisti/login - Login commercialista
// ==============================================================================
router.post('/login', async (req, res) => {
  try {
    console.log('🔍 COMMERCIALISTA LOGIN REQUEST:', {
      body: req.body,
      contentType: req.get('Content-Type'),
      origin: req.get('Origin')
    });
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password sono obbligatori' });
    }

    // Get commercialista
    const commercialista = await queryOne(
      'SELECT id, username, email, password_hash, ragione_sociale, partita_iva, telefono FROM commercialisti WHERE username = $1',
      [username]
    );

    if (!commercialista) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, commercialista.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    // Generate token
    const token = jwt.sign(
      { id: commercialista.id, username: commercialista.username, tipo: 'commercialista' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password_hash from response
    delete commercialista.password_hash;

    res.json({
      success: true,
      message: 'Login effettuato con successo',
      commercialista,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Errore durante il login' });
  }
});

// ==============================================================================
// GET /api/commercialisti/profile - Get commercialista profile
// ==============================================================================
router.get('/profile', authCommercialista, async (req, res) => {
  try {
    res.json({
      success: true,
      commercialista: req.commercialista
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Errore nel recupero del profilo' });
  }
});

// ==============================================================================
// GET /api/commercialisti/dashboard - Get dashboard with clients summary
// ==============================================================================
router.get('/dashboard', authCommercialista, async (req, res) => {
  try {
    // Get clients summary using database function
    const clienti = await query(
      'SELECT * FROM get_commercialista_clients_summary($1)',
      [req.commercialista.id]
    );

    // Get unread messages count
    const unreadMessages = await query(
      `SELECT collegamento_id, COUNT(*) as unread_count
       FROM messaggi_commercialista m
       JOIN collegamenti_commercialista c ON c.id = m.collegamento_id
       WHERE c.commercialista_id = $1
       AND m.mittente_tipo = 'user'
       AND m.letto = FALSE
       GROUP BY collegamento_id`,
      [req.commercialista.id]
    );

    // Merge unread messages with clients
    const clientiConMessaggi = clienti.rows.map(cliente => {
      const unread = unreadMessages.rows.find(um => um.user_id === cliente.user_id);
      return {
        ...cliente,
        unread_messages: unread ? parseInt(unread.unread_count) : 0
      };
    });

    res.json({
      success: true,
      commercialista: req.commercialista,
      clienti: clientiConMessaggi,
      totale_clienti: clienti.rows.length
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Errore nel recupero della dashboard' });
  }
});

// ==============================================================================
// POST /api/commercialisti/collega-cliente - Connect client using invitation token
// ==============================================================================
router.post('/collega-cliente', authCommercialista, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token richiesto' });
    }

    // Use database function to validate and use token
    const result = await queryOne(
      'SELECT usa_token_invito($1, $2) as success',
      [token, req.commercialista.id]
    );

    // Get connected user info
    const userInfo = await queryOne(
      `SELECT u.id, u.username, u.email
       FROM collegamenti_commercialista c
       JOIN utenti u ON u.id = c.user_id
       WHERE c.commercialista_id = $1
       ORDER BY c.data_collegamento DESC
       LIMIT 1`,
      [req.commercialista.id]
    );

    res.json({
      success: true,
      message: 'Cliente collegato con successo',
      cliente: userInfo
    });
  } catch (error) {
    console.error('Connect client error:', error);
    res.status(400).json({
      error: error.message || 'Errore nel collegamento del cliente'
    });
  }
});

// ==============================================================================
// GET /api/commercialisti/clienti/:userId - Get client details
// ==============================================================================
router.get('/clienti/:userId', authCommercialista, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Verify commercialista has access to this client
    const collegamento = await queryOne(
      `SELECT id FROM collegamenti_commercialista
       WHERE commercialista_id = $1 AND user_id = $2 AND attivo = TRUE`,
      [req.commercialista.id, userId]
    );

    if (!collegamento) {
      return res.status(403).json({
        error: 'Non hai accesso a questo cliente'
      });
    }

    // Get client details
    const cliente = await queryOne(
      'SELECT id, username, email, created_at FROM utenti WHERE id = $1',
      [userId]
    );

    // Get client accounts with calculated balance
    const conti = await query(
      `SELECT
        cc.id,
        cc.nome_banca,
        cc.intestatario,
        cc.iban,
        cc.attivo,
        cc.saldo_iniziale +
        COALESCE((
          SELECT SUM(CASE
            WHEN m.tipo = 'Entrata' THEN m.importo
            ELSE -m.importo
          END)
          FROM movimenti m
          WHERE m.conto_id = cc.id
        ), 0) as saldo_corrente
       FROM conti_correnti cc
       WHERE cc.user_id = $1
       ORDER BY cc.attivo DESC, cc.nome_banca`,
      [userId]
    );

    // Get movements with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Count total movements
    const totalCount = await queryOne(
      `SELECT COUNT(*) as count
       FROM movimenti m
       JOIN conti_correnti cc ON cc.id = m.conto_id
       WHERE cc.user_id = $1`,
      [userId]
    );
    const total = parseInt(totalCount.count);
    const totalPages = Math.ceil(total / limit);

    // Get paginated movements
    const movimenti = await query(
      `SELECT m.*, cc.nome_banca
       FROM movimenti m
       JOIN conti_correnti cc ON cc.id = m.conto_id
       WHERE cc.user_id = $1
       ORDER BY m.data DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({
      success: true,
      cliente,
      conti: conti.rows,
      movimenti: movimenti.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: 'Errore nel recupero dei dati del cliente' });
  }
});

// ==============================================================================
// DELETE /api/commercialisti/clienti/:userId - Disconnect client
// ==============================================================================
router.delete('/clienti/:userId', authCommercialista, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Call the disconnect function
    await query(
      'SELECT disconnetti_cliente_commercialista($1, $2)',
      [req.commercialista.id, userId]
    );

    res.json({
      success: true,
      message: 'Cliente disconnesso con successo'
    });
  } catch (error) {
    console.error('Disconnect client error:', error);
    res.status(500).json({ error: error.message || 'Errore nella disconnessione del cliente' });
  }
});

// ==============================================================================
// POST /api/commercialisti/clienti/:userId/export - Generate export for client
// ==============================================================================
router.post('/clienti/:userId/export', authCommercialista, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const config = req.body;

    // Verify commercialista has access to this client
    const collegamento = await queryOne(
      `SELECT id FROM collegamenti_commercialista
       WHERE commercialista_id = $1 AND user_id = $2 AND attivo = TRUE`,
      [req.commercialista.id, userId]
    );

    if (!collegamento) {
      return res.status(403).json({
        error: 'Non hai accesso a questo cliente'
      });
    }

    // Get client info
    const cliente = await queryOne(
      'SELECT username, email FROM utenti WHERE id = $1',
      [userId]
    );

    // Import export logic from export.js
    const { queryAll } = require('../config/database');
    const moment = require('moment');
    const XLSX = require('xlsx');
    const PDFDocument = require('pdfkit');

    // Export configurations
    const EXPORT_CONFIGS = {
      commercialista: {
        name: 'Estratto per Commercialista',
        table: 'movimenti',
        fields: [
          'data', 'descrizione', 'importo', 'tipo', 'note',
          'anagrafica_nome', 'anagrafica_piva', 'anagrafica_email',
          'tipologia_nome', 'categoria', 'conto_nome'
        ]
      },
      semplice: {
        name: 'Estratto Semplice',
        table: 'movimenti',
        fields: ['data', 'descrizione', 'importo', 'tipo', 'anagrafica_nome']
      },
      entrate: {
        name: 'Solo Entrate',
        table: 'movimenti',
        fields: ['data', 'descrizione', 'importo', 'anagrafica_nome', 'categoria'],
        filters: { tipo: 'Entrata' }
      },
      uscite: {
        name: 'Solo Uscite',
        table: 'movimenti',
        fields: ['data', 'descrizione', 'importo', 'anagrafica_nome', 'categoria'],
        filters: { tipo: 'Uscita' }
      },
      custom: {
        name: 'Export Personalizzato',
        table: 'movimenti',
        fields: [] // Will be provided by user
      }
    };

    const exportConfig = EXPORT_CONFIGS[config.export_type];
    if (!exportConfig) {
      return res.status(400).json({ error: 'Tipo di export non valido' });
    }

    // Handle custom fields
    const fieldsToSelect = config.export_type === 'custom' && config.campi_personalizzati
      ? config.campi_personalizzati
      : exportConfig.fields;

    // Build query
    let sqlQuery = `
      SELECT
        m.data,
        m.descrizione,
        m.importo,
        m.tipo,
        m.note,
        m.categoria,
        a.nome as anagrafica_nome,
        a.piva as anagrafica_piva,
        a.email as anagrafica_email,
        t.nome as tipologia_nome,
        cc.nome_banca as conto_nome
      FROM movimenti m
      LEFT JOIN anagrafiche a ON a.id = m.anagrafica_id
      LEFT JOIN tipologie_anagrafiche t ON t.id = a.tipologia_id
      JOIN conti_correnti cc ON cc.id = m.conto_id
      WHERE cc.user_id = $1
    `;

    const params = [userId];
    let paramIndex = 2;

    // Add filters
    if (exportConfig.filters?.tipo) {
      sqlQuery += ` AND m.tipo = $${paramIndex}`;
      params.push(exportConfig.filters.tipo);
      paramIndex++;
    }

    if (config.conto_id && config.conto_id !== '') {
      sqlQuery += ` AND m.conto_id = $${paramIndex}`;
      params.push(parseInt(config.conto_id));
      paramIndex++;
    }

    if (!config.tutto_storico) {
      if (config.data_inizio) {
        sqlQuery += ` AND m.data >= $${paramIndex}`;
        params.push(config.data_inizio);
        paramIndex++;
      }
      if (config.data_fine) {
        sqlQuery += ` AND m.data <= $${paramIndex}`;
        params.push(config.data_fine);
        paramIndex++;
      }
    }

    // Add ordering
    const orderField = config.ordina_per === 'importo' ? 'm.importo' :
                       config.ordina_per === 'anagrafica' ? 'a.nome' : 'm.data';
    const orderDirection = config.ordine === 'asc' ? 'ASC' : 'DESC';
    sqlQuery += ` ORDER BY ${orderField} ${orderDirection}`;

    // Execute query
    const result = await queryAll(sqlQuery, params);
    const data = result || [];

    // Format data
    const formattedData = data.map(row => {
      const formatted = {};
      fieldsToSelect.forEach(field => {
        if (field === 'data') {
          formatted[field] = moment(row.data).format('DD/MM/YYYY');
        } else if (field === 'importo') {
          formatted[field] = parseFloat(row.importo).toFixed(2);
        } else {
          formatted[field] = row[field] || '';
        }
      });
      return formatted;
    });

    // Metadata
    const metadata = {
      tipo_export: config.export_type,
      nome_export: exportConfig.name,
      cliente: cliente.username,
      cliente_email: cliente.email,
      numero_record: formattedData.length,
      generato_il: new Date().toISOString(),
      generato_da: req.commercialista.ragione_sociale || req.commercialista.username,
      filtri_applicati: buildFiltersDescription(config)
    };

    // Handle different formats
    const formato = config.formato || 'json';

    if (formato === 'json') {
      // Return JSON for preview
      return res.json({
        metadata,
        data: formattedData,
        preview: formattedData.slice(0, 10)
      });
    } else if (formato === 'csv') {
      return exportToCsv(res, formattedData, metadata, cliente);
    } else if (formato === 'xlsx') {
      return exportToXlsx(res, formattedData, metadata, cliente);
    } else if (formato === 'pdf') {
      return exportToPdf(res, formattedData, metadata, cliente);
    }

  } catch (error) {
    console.error('Export client error:', error);
    res.status(500).json({ error: 'Errore nella generazione dell\'export' });
  }
});

// Helper functions for export formats
function buildFiltersDescription(config) {
  const filters = [];

  if (config.tutto_storico) {
    filters.push('Tutto lo storico');
  } else {
    if (config.data_inizio && config.data_fine) {
      filters.push(`Periodo: ${config.data_inizio} - ${config.data_fine}`);
    }
  }

  if (config.conto_id) filters.push(`Conto specifico selezionato`);

  return filters.join(', ') || 'Nessun filtro applicato';
}

function exportToCsv(res, data, metadata, cliente) {
  if (!data || data.length === 0) {
    return res.status(400).json({ error: 'Nessun dato da esportare' });
  }

  const moment = require('moment');
  const headers = Object.keys(data[0]);
  let csvContent = headers.join(',') + '\n';

  data.forEach(row => {
    const values = headers.map(header => {
      let value = row[header] || '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvContent += values.join(',') + '\n';
  });

  const filename = `${cliente.username}_${metadata.tipo_export}_${moment().format('YYYY-MM-DD')}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\ufeff' + csvContent);
}

function exportToXlsx(res, data, metadata, cliente) {
  if (!data || data.length === 0) {
    return res.status(400).json({ error: 'Nessun dato da esportare' });
  }

  const moment = require('moment');
  const XLSX = require('xlsx');

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
  XLSX.utils.book_append_sheet(wb, ws, 'Movimenti');

  // Sheet metadati
  const metaData = {
    'Cliente': metadata.cliente,
    'Email Cliente': metadata.cliente_email,
    'Tipo Export': metadata.nome_export,
    'Record Esportati': metadata.numero_record,
    'Generato il': moment(metadata.generato_il).format('DD/MM/YYYY HH:mm'),
    'Generato da': metadata.generato_da,
    'Filtri': metadata.filtri_applicati
  };
  const metaWs = XLSX.utils.json_to_sheet([metaData]);
  XLSX.utils.book_append_sheet(wb, metaWs, 'Informazioni');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `${cliente.username}_${metadata.tipo_export}_${moment().format('YYYY-MM-DD')}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

function exportToPdf(res, data, metadata, cliente) {
  try {
    const moment = require('moment');
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    const filename = `${cliente.username}_${metadata.tipo_export}_${moment().format('YYYY-MM-DD')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    // Header
    doc.fontSize(18).text('Prima Nota - Report Cliente', { align: 'center' });
    doc.moveDown(0.5);

    // Info Cliente
    doc.fontSize(12)
       .text(`Cliente: ${metadata.cliente} (${metadata.cliente_email})`)
       .text(`Tipo Export: ${metadata.nome_export}`)
       .text(`Generato il: ${moment(metadata.generato_il).format('DD/MM/YYYY HH:mm')}`)
       .text(`Generato da: ${metadata.generato_da}`)
       .text(`Record esportati: ${metadata.numero_record}`)
       .text(`Filtri: ${metadata.filtri_applicati}`)
       .moveDown();

    // Tabella dati (primi 30 record)
    if (data.length > 0) {
      doc.fontSize(10).fillColor('black');

      const headers = Object.keys(data[0]);
      const maxRecords = Math.min(data.length, 30);
      const colWidth = 120;
      let y = doc.y;

      // Headers
      doc.font('Helvetica-Bold');
      headers.forEach((header, i) => {
        if (i < 6) { // Mostra max 6 colonne
          doc.text(header.toUpperCase(), 50 + i * colWidth, y, { width: colWidth - 5 });
        }
      });
      doc.font('Helvetica');

      y += 20;

      // Dati
      for (let rowIndex = 0; rowIndex < maxRecords; rowIndex++) {
        const row = data[rowIndex];
        headers.forEach((header, colIndex) => {
          if (colIndex < 6) {
            const value = row[header] || '';
            doc.text(value.toString().substring(0, 20), 50 + colIndex * colWidth, y, { width: colWidth - 5 });
          }
        });

        y += 18;

        // Nuova pagina se necessario
        if (y > 550) {
          doc.addPage();
          y = 50;
        }
      }

      if (data.length > 30) {
        doc.moveDown()
           .fontSize(10)
           .fillColor('gray')
           .text(`Sono stati esportati ${data.length} record totali. Mostrando i primi 30.`, {
             align: 'center',
             italics: true
           })
           .text('Per visualizzare tutti i dati, utilizzare l\'export in formato CSV o Excel.', {
             align: 'center',
             italics: true
           });
      }
    }

    doc.end();
  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({ error: 'Errore nella generazione del PDF' });
  }
}

module.exports = router;
