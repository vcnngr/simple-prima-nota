// routes/reports.js - VERSIONE FLESSIBILE CON TIPOLOGIE
const express = require('express');
const { queryOne, queryAll } = require('../config/database');
const auth = require('../middleware/auth');
const { validateQuery, schemas } = require('../middleware/validation');
const moment = require('moment');
const csv = require('csv-writer');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

const router = express.Router();
router.use(auth);

// Schema per filtri report (AGGIORNATO)
const reportFiltersSchema = require('joi').object({
  data_inizio: require('joi').date().required(),
  data_fine: require('joi').date().required(),
  conto_id: require('joi').number().integer().optional(),
  anagrafica_id: require('joi').number().integer().optional(),
  tipologia_id: require('joi').number().integer().optional(), // NUOVO
  tipo: require('joi').string().valid('Entrata', 'Uscita').optional(),
  categoria: require('joi').string().optional(),
  formato: require('joi').string().valid('json', 'csv', 'xlsx', 'pdf').default('json')
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
    console.error('Error generating estratto conto:', error);
    res.status(500).json({ error: 'Errore durante la generazione dell\'estratto conto' });
  }
});

// GET /api/reports/movimenti-anagrafica - Movimenti per cliente/fornitore (AGGIORNATO)
router.get('/movimenti-anagrafica', validateQuery(reportFiltersSchema), async (req, res) => {
  try {
    const { data_inizio, data_fine, anagrafica_id, tipologia_id, tipo, formato } = req.query;
    const userId = req.user.id;

    let whereConditions = ['m.user_id = $1', 'm.data >= $2', 'm.data <= $3'];
    let params = [userId, data_inizio, data_fine];
    let paramIndex = 4;

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

    // Informazioni anagrafica/tipologia (AGGIORNATO)
    let infoFiltri = {};
    if (anagrafica_id) {
      infoFiltri.anagrafica = await queryOne(`
        SELECT a.*, ta.nome as tipologia_nome, ta.colore as tipologia_colore
        FROM anagrafiche a
        LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
        WHERE a.id = $1 AND a.user_id = $2
      `, [anagrafica_id, userId]);
    }
    if (tipologia_id) {
      infoFiltri.tipologia = await queryOne(`
        SELECT * FROM tipologie_anagrafiche WHERE id = $1 AND user_id = $2
      `, [tipologia_id, userId]);
    }

    // Movimenti per anagrafica/tipologia (AGGIORNATO)
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
      ORDER BY ta.nome, a.nome, m.data DESC
    `, params);

    // Raggruppamento per anagrafica E tipologia (AGGIORNATO)
    const raggruppamento = {};
    movimenti.forEach(movimento => {
      const tipologiaKey = movimento.tipologia_nome || 'senza_tipologia';
      const anagraficaKey = movimento.anagrafica_id || 'senza_anagrafica';
      const key = `${tipologiaKey}_${anagraficaKey}`;
      
      if (!raggruppamento[key]) {
        raggruppamento[key] = {
          tipologia: {
            nome: movimento.tipologia_nome || 'Senza tipologia',
            colore: movimento.tipologia_colore,
            icona: movimento.tipologia_icona
          },
          anagrafica: {
            id: movimento.anagrafica_id,
            nome: movimento.anagrafica_nome || 'Movimenti senza anagrafica',
            categoria: movimento.anagrafica_categoria
          },
          movimenti: [],
          totali: {
            numero_movimenti: 0,
            totale_entrate: 0,
            totale_uscite: 0,
            saldo_netto: 0
          }
        };
      }
      
      raggruppamento[key].movimenti.push(movimento);
      raggruppamento[key].totali.numero_movimenti++;
      
      if (movimento.tipo === 'Entrata') {
        raggruppamento[key].totali.totale_entrate += parseFloat(movimento.importo);
      } else {
        raggruppamento[key].totali.totale_uscite += parseFloat(movimento.importo);
      }
      
      raggruppamento[key].totali.saldo_netto = 
        raggruppamento[key].totali.totale_entrate - raggruppamento[key].totali.totale_uscite;
    });

    // Totali generali (AGGIORNATO)
    const totaliGenerali = await queryOne(`
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
      tipo_report: 'movimenti_anagrafica',
      periodo: { data_inizio, data_fine },
      filtri: { anagrafica_id, tipologia_id, tipo },
      info_filtri: infoFiltri,
      raggruppamento: Object.values(raggruppamento),
      totali_generali: totaliGenerali,
      generato_il: new Date().toISOString()
    };

    if (formato === 'csv') {
      return exportToCsv(res, movimenti, `movimenti_anagrafica_${data_inizio}_${data_fine}`);
    } else if (formato === 'xlsx') {
      return exportToXlsx(res, movimenti, `movimenti_anagrafica_${data_inizio}_${data_fine}`);
    } else if (formato === 'pdf') {
      return exportToPdf(res, report);
    }

    res.json(report);
  } catch (error) {
    console.error('Error generating movimenti anagrafica:', error);
    res.status(500).json({ error: 'Errore durante la generazione del report movimenti anagrafica' });
  }
});

// GET /api/reports/entrate-vs-uscite - Report entrate vs uscite (AGGIORNATO)
router.get('/entrate-vs-uscite', validateQuery(reportFiltersSchema), async (req, res) => {
  try {
    const { data_inizio, data_fine, conto_id, categoria, tipologia_id, formato } = req.query;
    const userId = req.user.id;

    let whereConditions = ['m.user_id = $1', 'm.data >= $2', 'm.data <= $3'];
    let params = [userId, data_inizio, data_fine];
    let paramIndex = 4;

    if (conto_id) {
      whereConditions.push(`m.conto_id = $${paramIndex}`);
      params.push(conto_id);
      paramIndex++;
    }

    if (categoria) {
      whereConditions.push(`a.categoria ILIKE $${paramIndex}`);
      params.push(`%${categoria}%`);
      paramIndex++;
    }

    // NUOVO: Filtro per tipologia
    if (tipologia_id) {
      whereConditions.push(`a.tipologia_id = $${paramIndex}`);
      params.push(tipologia_id);
      paramIndex++;
    }

    // Andamento mensile (AGGIORNATO)
    const andamentoMensile = await queryAll(`
      SELECT 
        DATE_TRUNC('month', m.data) as mese,
        TO_CHAR(DATE_TRUNC('month', m.data), 'YYYY-MM') as mese_label,
        COUNT(*) as numero_movimenti,
        SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END) as entrate,
        SUM(CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END) as uscite,
        SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE -m.importo END) as saldo_netto
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY DATE_TRUNC('month', m.data)
      ORDER BY mese ASC
    `, params);

    // Distribuzione per tipologia (NUOVO)
    const distribuzioneTipologieEntrate = await queryAll(`
      SELECT 
        COALESCE(ta.nome, 'Senza tipologia') as tipologia,
        ta.colore,
        ta.icona,
        COUNT(*) as numero_movimenti,
        SUM(m.importo) as totale,
        AVG(m.importo) as media,
        MIN(m.importo) as minimo,
        MAX(m.importo) as massimo
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      WHERE ${whereConditions.join(' AND ')} AND m.tipo = 'Entrata'
      GROUP BY ta.nome, ta.colore, ta.icona
      ORDER BY totale DESC
    `, params);

    const distribuzioneTipologieUscite = await queryAll(`
      SELECT 
        COALESCE(ta.nome, 'Senza tipologia') as tipologia,
        ta.colore,
        ta.icona,
        COUNT(*) as numero_movimenti,
        SUM(m.importo) as totale,
        AVG(m.importo) as media,
        MIN(m.importo) as minimo,
        MAX(m.importo) as massimo
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      WHERE ${whereConditions.join(' AND ')} AND m.tipo = 'Uscita'
      GROUP BY ta.nome, ta.colore, ta.icona
      ORDER BY totale DESC
    `, params);

    // Distribuzione per categoria anagrafica (AGGIORNATO)
    const distribuzioneCategorieEntrate = await queryAll(`
      SELECT 
        COALESCE(a.categoria, 'Senza categoria') as categoria,
        COUNT(*) as numero_movimenti,
        SUM(m.importo) as totale,
        AVG(m.importo) as media,
        MIN(m.importo) as minimo,
        MAX(m.importo) as massimo
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      WHERE ${whereConditions.join(' AND ')} AND m.tipo = 'Entrata'
      GROUP BY a.categoria
      ORDER BY totale DESC
    `, params);

    const distribuzioneCategorieUscite = await queryAll(`
      SELECT 
        COALESCE(a.categoria, 'Senza categoria') as categoria,
        COUNT(*) as numero_movimenti,
        SUM(m.importo) as totale,
        AVG(m.importo) as media,
        MIN(m.importo) as minimo,
        MAX(m.importo) as massimo
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      WHERE ${whereConditions.join(' AND ')} AND m.tipo = 'Uscita'
      GROUP BY a.categoria
      ORDER BY totale DESC
    `, params);

    // Totali generali (AGGIORNATO)
    const totaliGenerali = await queryOne(`
      SELECT 
        COUNT(*) as numero_movimenti,
        COUNT(*) FILTER (WHERE m.tipo = 'Entrata') as numero_entrate,
        COUNT(*) FILTER (WHERE m.tipo = 'Uscita') as numero_uscite,
        COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END), 0) as totale_entrate,
        COALESCE(SUM(CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END), 0) as totale_uscite,
        COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE -m.importo END), 0) as saldo_netto,
        COALESCE(AVG(CASE WHEN m.tipo = 'Entrata' THEN m.importo END), 0) as media_entrate,
        COALESCE(AVG(CASE WHEN m.tipo = 'Uscita' THEN m.importo END), 0) as media_uscite
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      WHERE ${whereConditions.join(' AND ')}
    `, params);

    const report = {
      tipo_report: 'entrate_vs_uscite',
      periodo: { data_inizio, data_fine },
      filtri: { conto_id, categoria, tipologia_id },
      andamento_mensile: andamentoMensile,
      // AGGIORNATO: Distribuzione per tipologia + categoria
      distribuzione_tipologie: {
        entrate: distribuzioneTipologieEntrate,
        uscite: distribuzioneTipologieUscite
      },
      distribuzione_categorie: {
        entrate: distribuzioneCategorieEntrate,
        uscite: distribuzioneCategorieUscite
      },
      totali_generali: totaliGenerali,
      generato_il: new Date().toISOString()
    };

    if (formato === 'csv') {
      const dataForCsv = andamentoMensile.map(item => ({
        mese: item.mese_label,
        numero_movimenti: item.numero_movimenti,
        entrate: item.entrate,
        uscite: item.uscite,
        saldo_netto: item.saldo_netto
      }));
      return exportToCsv(res, dataForCsv, `entrate_vs_uscite_${data_inizio}_${data_fine}`);
    } else if (formato === 'xlsx') {
      return exportToXlsx(res, andamentoMensile, `entrate_vs_uscite_${data_inizio}_${data_fine}`);
    } else if (formato === 'pdf') {
      return exportToPdf(res, report);
    }

    res.json(report);
  } catch (error) {
    console.error('Error generating entrate vs uscite:', error);
    res.status(500).json({ error: 'Errore durante la generazione del report entrate vs uscite' });
  }
});

// GET /api/reports/bilancio-mensile - Bilancio mensile dettagliato (AGGIORNATO)
router.get('/bilancio-mensile', async (req, res) => {
  try {
    const { anno = new Date().getFullYear(), conto_id, tipologia_id, formato = 'json' } = req.query;
    const userId = req.user.id;

    let whereCondition = 'm.user_id = $1 AND EXTRACT(YEAR FROM m.data) = $2';
    let params = [userId, anno];
    let paramIndex = 3;

    if (conto_id) {
      whereCondition += ` AND m.conto_id = $${paramIndex}`;
      params.push(conto_id);
      paramIndex++;
    }

    // NUOVO: Filtro per tipologia
    if (tipologia_id) {
      whereCondition += ` AND a.tipologia_id = $${paramIndex}`;
      params.push(tipologia_id);
      paramIndex++;
    }

    // Dati mensili completi (AGGIORNATO)
    const bilancioMensile = await queryAll(`
      SELECT 
        EXTRACT(MONTH FROM m.data) as mese_numero,
        TO_CHAR(DATE_TRUNC('month', m.data), 'Month YYYY') as mese_nome,
        COUNT(*) as numero_movimenti,
        COUNT(*) FILTER (WHERE m.tipo = 'Entrata') as numero_entrate,
        COUNT(*) FILTER (WHERE m.tipo = 'Uscita') as numero_uscite,
        SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END) as entrate,
        SUM(CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END) as uscite,
        SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE -m.importo END) as saldo_netto,
        AVG(CASE WHEN m.tipo = 'Entrata' THEN m.importo END) as media_entrate,
        AVG(CASE WHEN m.tipo = 'Uscita' THEN m.importo END) as media_uscite
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      WHERE ${whereCondition}
      GROUP BY EXTRACT(MONTH FROM m.data), DATE_TRUNC('month', m.data)
      ORDER BY mese_numero
    `, params);

    // Totali annuali (AGGIORNATO)
    const totaliAnnuali = await queryOne(`
      SELECT 
        COUNT(*) as numero_movimenti,
        SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE 0 END) as totale_entrate,
        SUM(CASE WHEN tipo = 'Uscita' THEN importo ELSE 0 END) as totale_uscite,
        SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE -importo END) as saldo_netto
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      WHERE ${whereCondition}
    `, params);

    // Top tipologie per l'anno (NUOVO)
    const topTipologie = await queryAll(`
      SELECT 
        COALESCE(ta.nome, 'Senza tipologia') as tipologia,
        ta.colore,
        ta.icona,
        m.tipo,
        COUNT(*) as numero_movimenti,
        SUM(m.importo) as totale
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      WHERE ${whereCondition}
      GROUP BY ta.nome, ta.colore, ta.icona, m.tipo
      ORDER BY totale DESC
      LIMIT 20
    `, params);

    // Top categorie per l'anno (AGGIORNATO)
    const topCategorie = await queryAll(`
      SELECT 
        COALESCE(a.categoria, 'Senza categoria') as categoria,
        m.tipo,
        COUNT(*) as numero_movimenti,
        SUM(m.importo) as totale
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      WHERE ${whereCondition}
      GROUP BY a.categoria, m.tipo
      ORDER BY totale DESC
      LIMIT 20
    `, params);

    const report = {
      tipo_report: 'bilancio_mensile',
      anno: parseInt(anno),
      filtri: { conto_id, tipologia_id },
      bilancio_mensile: bilancioMensile,
      totali_annuali: totaliAnnuali,
      top_tipologie: topTipologie,
      top_categorie: topCategorie,
      generato_il: new Date().toISOString()
    };

    if (formato === 'csv') {
      return exportToCsv(res, bilancioMensile, `bilancio_mensile_${anno}`);
    } else if (formato === 'xlsx') {
      return exportToXlsx(res, bilancioMensile, `bilancio_mensile_${anno}`);
    } else if (formato === 'pdf') {
      return exportToPdf(res, report);
    }

    res.json(report);
  } catch (error) {
    console.error('Error generating bilancio mensile:', error);
    res.status(500).json({ error: 'Errore durante la generazione del bilancio mensile' });
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
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Errore durante l\'export CSV' });
  }
}

async function exportToXlsx(res, data, filename) {
  try {
    if (!data || data.length === 0) {
      return res.status(400).json({ error: 'Nessun dato da esportare' });
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting XLSX:', error);
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
    console.error('Error exporting PDF:', error);
    res.status(500).json({ error: 'Errore durante l\'export PDF' });
  }
}

// GET /api/reports/template - Template per import CSV (INVARIATO)
router.get('/template', (req, res) => {
  try {
    const template = [
      {
        data: '2024-01-15',
        descrizione: 'Esempio movimento',
        importo: '100.50',
        tipo: 'Entrata',
        note: 'Note opzionali',
        anagrafica_nome: 'Nome Cliente/Fornitore (opzionale)',
        conto_nome: 'Nome Banca'
      }
    ];

    const fields = Object.keys(template[0]);
    let csvContent = fields.join(',') + '\n';
    csvContent += 'Sostituire questa riga con i vostri dati\n';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="template_import_movimenti.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({ error: 'Errore durante la generazione del template' });
  }
});

module.exports = router;