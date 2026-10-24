// routes/reports.js - VERSIONE FLESSIBILE CON TIPOLOGIE
const express = require('express');
const { queryOne, queryAll } = require('../config/database');
const { auth } = require('../middleware/auth');
const { validateQuery, giorno } = require('../middleware/validation');
const moment = require('moment');
const csv = require('csv-writer');
const PDFDocument = require('pdfkit');
const { logErrore } = require('../utils/errori');
const { cartellaXlsx } = require('../utils/xlsx');

const router = express.Router();
router.use(auth);

// Schema per filtri report (AGGIORNATO)
const reportFiltersSchema = require('joi').object({
  data_inizio: giorno().required(),
  data_fine: giorno().required(),
  conto_id: require('joi').number().integer().optional(),
  anagrafica_id: require('joi').number().integer().optional(),
  tipologia_id: require('joi').number().integer().optional(), // NUOVO
  tipo: require('joi').string().valid('Entrata', 'Uscita').optional(),
  categoria: require('joi').string().optional(),
  formato: require('joi').string().valid('json', 'csv', 'xlsx', 'pdf').default('json')
});

// Report a flusso del nuovo frontend (U5). Mesi come testo YYYY-MM, importi
// come testo (DECIMAL): niente Date fra pg e il client, niente virgola mobile.
const Joi = require('joi');
const meseTesto = () => Joi.string().pattern(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/)
  .messages({ 'string.pattern.base': '{{#label}} deve essere un mese YYYY-MM' });
const mesiSchema = Joi.object({
  fino: meseTesto().optional(),
  mesi: Joi.number().integer().min(1).max(36).default(12),
  conto_id: Joi.number().integer().positive().optional(),
  anagrafica_id: Joi.number().integer().positive().optional()
});
const meseSchema = Joi.object({
  mese: meseTesto().required(),
  conto_id: Joi.number().integer().positive().optional()
});

// GET /api/reports/mesi?fino=YYYY-MM&mesi=12 - Entrate e uscite mese per mese,
// dal piu' recente (fino, predefinito il mese corrente del database). Anche per
// un conto o una controparte (scheda della controparte).
router.get('/mesi', validateQuery(mesiSchema), async (req, res) => {
  try {
    const { fino, mesi, conto_id, anagrafica_id } = req.query;
    const righe = await queryAll(`
      WITH elenco AS (
        SELECT (date_trunc('month', coalesce(to_date($2 || '-01', 'YYYY-MM-DD'), CURRENT_DATE))
                - make_interval(months => g))::date AS inizio
        FROM generate_series(0, $3::int - 1) g
      )
      SELECT to_char(e.inizio, 'YYYY-MM') AS mese,
             count(x.id)::int AS numero,
             coalesce(sum(x.importo) FILTER (WHERE x.tipo = 'Entrata'), 0.00) AS entrate,
             coalesce(sum(x.importo) FILTER (WHERE x.tipo = 'Uscita'), 0.00) AS uscite
      FROM elenco e
      LEFT JOIN movimenti x ON x.user_id = $1
        AND x.data >= e.inizio AND x.data < (e.inizio + interval '1 month')::date
        AND ($4::int IS NULL OR x.conto_id = $4::int)
        AND ($5::int IS NULL OR x.anagrafica_id = $5::int)
      GROUP BY e.inizio
      ORDER BY e.inizio DESC
    `, [req.user.id, fino ?? null, mesi, conto_id ?? null, anagrafica_id ?? null]);
    res.json({ mesi: righe });
  } catch (error) {
    logErrore('Error fetching report mesi', error);
    res.status(500).json({ error: 'Errore durante il caricamento del report' });
  }
});

// GET /api/reports/mese?mese=YYYY-MM - Chi ha pagato (entrate per controparte)
// e dove sono andati i soldi (uscite per categoria) in un mese.
router.get('/mese', validateQuery(meseSchema), async (req, res) => {
  try {
    const { mese, conto_id } = req.query;
    const params = [req.user.id, mese, conto_id ?? null];
    const dove = `m.user_id = $1
        AND m.data >= to_date($2 || '-01', 'YYYY-MM-DD')
        AND m.data < (to_date($2 || '-01', 'YYYY-MM-DD') + interval '1 month')::date
        AND ($3::int IS NULL OR m.conto_id = $3::int)`;
    const entrate = await queryAll(`
      SELECT a.id AS anagrafica_id, coalesce(a.nome, 'Senza controparte') AS nome,
             count(*)::int AS numero, sum(m.importo) AS totale
      FROM movimenti m
      LEFT JOIN anagrafiche a ON a.id = m.anagrafica_id AND a.user_id = m.user_id
      WHERE ${dove} AND m.tipo = 'Entrata'
      GROUP BY a.id, a.nome
      ORDER BY sum(m.importo) DESC, nome
    `, params);
    const uscite = await queryAll(`
      SELECT coalesce(nullif(trim(m.categoria), ''), ta.nome, 'Senza categoria') AS nome,
             count(*)::int AS numero, sum(m.importo) AS totale
      FROM movimenti m
      LEFT JOIN anagrafiche a ON a.id = m.anagrafica_id AND a.user_id = m.user_id
      LEFT JOIN tipologie_anagrafiche ta ON ta.id = a.tipologia_id AND ta.user_id = m.user_id
      WHERE ${dove} AND m.tipo = 'Uscita'
      GROUP BY 1
      ORDER BY sum(m.importo) DESC, 1
    `, params);
    const totali = await queryOne(`
      SELECT count(*)::int AS numero,
             coalesce(sum(m.importo) FILTER (WHERE m.tipo = 'Entrata'), 0.00) AS entrate,
             coalesce(sum(m.importo) FILTER (WHERE m.tipo = 'Uscita'), 0.00) AS uscite
      FROM movimenti m WHERE ${dove}
    `, params);
    res.json({ mese, totali, entrate, uscite });
  } catch (error) {
    logErrore('Error fetching report mese', error);
    res.status(500).json({ error: 'Errore durante il caricamento del report' });
  }
});

// GET /api/reports/estratto-conto - Estratto conto per periodo (AGGIORNATO)
router.get('/estratto-conto', validateQuery(reportFiltersSchema), async (req, res) => {
  try {
    const { data_inizio, data_fine, conto_id, formato } = req.query;
    const userId = req.user.id;

    let whereConditions = ['m.user_id = $1', 'm.data >= $2', 'm.data <= $3'];
    let params = [userId, data_inizio, data_fine];
    let paramIndex = 4;

    if (conto_id) {
      whereConditions.push(`m.conto_id = $${paramIndex}`);
      params.push(conto_id);
      paramIndex++;
    }

    // Informazioni conto/conti (INVARIATO)
    const contiInfo = await queryAll(`
      SELECT cc.*, calcola_saldo_conto(cc.id) as saldo_corrente
      FROM conti_correnti cc 
      WHERE cc.user_id = $1 AND cc.attivo = true
      ${conto_id ? 'AND cc.id = $2' : ''}
      ORDER BY cc.nome_banca
    `, conto_id ? [userId, conto_id] : [userId]);

    // Movimenti del periodo (AGGIORNATO CON TIPOLOGIE)
    const movimenti = await queryAll(`
      SELECT 
        m.*,
        a.nome as anagrafica_nome,
        ta.nome as tipologia_nome,
        ta.tipo_movimento_default,
        ta.colore as tipologia_colore,
        ta.icona as tipologia_icona,
        a.categoria as anagrafica_categoria,
        cc.nome_banca,
        cc.intestatario
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY m.data ASC, m.created_at ASC
    `, params);

    // Calcola saldi progressivi (INVARIATO)
    let saldoProgressivo = 0;
    if (conto_id) {
      const saldoIniziale = await queryOne(`
        SELECT 
          cc.saldo_iniziale,
          COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE -m.importo END), 0) as movimenti_precedenti
        FROM conti_correnti cc
        LEFT JOIN movimenti m ON cc.id = m.conto_id AND m.data < $3
        WHERE cc.id = $1 AND cc.user_id = $2
        GROUP BY cc.saldo_iniziale
      `, [conto_id, userId, data_inizio]);
      
      saldoProgressivo = parseFloat(saldoIniziale.saldo_iniziale) + parseFloat(saldoIniziale.movimenti_precedenti);
    }

    const movimentiConSaldo = movimenti.map(movimento => {
      if (conto_id) {
        saldoProgressivo += movimento.tipo === 'Entrata' ? parseFloat(movimento.importo) : -parseFloat(movimento.importo);
        return { ...movimento, saldo_progressivo: saldoProgressivo };
      }
      return movimento;
    });

    // Totali del periodo (AGGIORNATO)
    const totali = await queryOne(`
      SELECT 
        COUNT(*) as numero_movimenti,
        COALESCE(SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE 0 END), 0) as totale_entrate,
        COALESCE(SUM(CASE WHEN tipo = 'Uscita' THEN importo ELSE 0 END), 0) as totale_uscite,
        COALESCE(SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE -importo END), 0) as saldo_netto
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      WHERE ${whereConditions.join(' AND ')}
    `, params);

    const report = {
      tipo_report: 'estratto_conto',
      periodo: {
        data_inizio,
        data_fine,
        giorni: moment(data_fine).diff(moment(data_inizio), 'days') + 1
      },
      conti: contiInfo,
      movimenti: movimentiConSaldo,
      totali,
      generato_il: new Date().toISOString()
    };

    // Gestione formati di export (INVARIATA)
    if (formato === 'csv') {
      return exportToCsv(res, movimentiConSaldo, `estratto_conto_${data_inizio}_${data_fine}`);
    } else if (formato === 'xlsx') {
      return exportToXlsx(res, movimentiConSaldo, `estratto_conto_${data_inizio}_${data_fine}`);
    } else if (formato === 'pdf') {
      return exportToPdf(res, report);
    }

    res.json(report);
  } catch (error) {
    logErrore('Error generating estratto conto', error);
    res.status(500).json({ error: 'Errore durante la generazione dell\'estratto conto' });
  }
});




// Funzioni di utilità per export (INVARIATE)
async function exportToCsv(res, data, filename) {
  try {
    if (!data || data.length === 0) {
      return res.status(400).json({ error: 'Nessun dato da esportare' });
    }

    const fields = Object.keys(data[0]);
    let csvContent = fields.join(',') + '\n';
    
    data.forEach(row => {
      const values = fields.map(field => {
        let value = row[field];
        if (value === null || value === undefined) value = '';
        if (typeof value === 'string' && value.includes(',')) {
          value = `"${value}"`;
        }
        return value;
      });
      csvContent += values.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.send(csvContent);
  } catch (error) {
    logErrore('Error exporting CSV', error);
    res.status(500).json({ error: 'Errore durante l\'export CSV' });
  }
}

async function exportToXlsx(res, data, filename) {
  try {
    if (!data || data.length === 0) {
      return res.status(400).json({ error: 'Nessun dato da esportare' });
    }

    const buffer = cartellaXlsx([{ nome: 'Report', righe: data }]);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    logErrore('Error exporting XLSX', error);
    res.status(500).json({ error: 'Errore durante l\'export Excel' });
  }
}

async function exportToPdf(res, reportData) {
  try {
    const doc = new PDFDocument();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report_${Date.now()}.pdf"`);
    
    doc.pipe(res);

    // Header
    doc.fontSize(16).text('Prima Nota - Report', { align: 'center' });
    doc.fontSize(12).text(`Tipo: ${reportData.tipo_report}`, { align: 'center' });
    doc.text(`Generato il: ${new Date(reportData.generato_il).toLocaleDateString('it-IT')}`, { align: 'center' });
    doc.moveDown();

    // Periodo
    if (reportData.periodo) {
      doc.text(`Periodo: dal ${reportData.periodo.data_inizio} al ${reportData.periodo.data_fine}`);
      doc.moveDown();
    }

    // Totali generali (se presenti)
    if (reportData.totali_generali || reportData.totali) {
      const totali = reportData.totali_generali || reportData.totali;
      doc.fontSize(14).text('Totali Generali:', { underline: true });
      doc.fontSize(10);
      doc.text(`Numero movimenti: ${totali.numero_movimenti}`);
      doc.text(`Totale entrate: €${parseFloat(totali.totale_entrate).toFixed(2)}`);
      doc.text(`Totale uscite: €${parseFloat(totali.totale_uscite).toFixed(2)}`);
      doc.text(`Saldo netto: €${parseFloat(totali.saldo_netto).toFixed(2)}`);
      doc.moveDown();
    }

    // Nota per dati dettagliati
    doc.fontSize(10).text('Per visualizzare i dati dettagliati, utilizzare l\'export in formato CSV o Excel.', { align: 'center', italics: true });

    doc.end();
  } catch (error) {
    logErrore('Error exporting PDF', error);
    res.status(500).json({ error: 'Errore durante l\'export PDF' });
  }
}


module.exports = router;