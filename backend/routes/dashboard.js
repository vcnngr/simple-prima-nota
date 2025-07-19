// routes/dashboard.js
const express = require('express');
const { queryOne, queryAll } = require('../config/database');
const auth = require('../middleware/auth');
const moment = require('moment');

const router = express.Router();

// Middleware di autenticazione
router.use(auth);

// GET /api/dashboard - Dashboard completa
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Saldi conti correnti
    const saldi = await queryAll(`
      SELECT 
        cc.id,
        cc.nome_banca,
        cc.intestatario,
        cc.saldo_iniziale,
        calcola_saldo_conto(cc.id) as saldo_corrente,
        cc.attivo
      FROM conti_correnti cc 
      WHERE cc.user_id = $1 AND cc.attivo = true
      ORDER BY cc.nome_banca
    `, [userId]);

    // 2. Totali generali
    const totaliGenerali = await queryOne(`
      SELECT 
        COUNT(DISTINCT cc.id) as numero_conti,
        COUNT(DISTINCT a.id) as numero_anagrafiche,
        COUNT(m.id) as numero_movimenti,
        COALESCE(SUM(CASE WHEN m.tipo = 'Entrata' THEN m.importo ELSE 0 END), 0) as totale_entrate,
        COALESCE(SUM(CASE WHEN m.tipo = 'Uscita' THEN m.importo ELSE 0 END), 0) as totale_uscite
      FROM conti_correnti cc
      LEFT JOIN movimenti m ON cc.id = m.conto_id
      LEFT JOIN anagrafiche a ON a.user_id = cc.user_id AND a.attivo = true
      WHERE cc.user_id = $1 AND cc.attivo = true
    `, [userId]);

    // 3. Movimenti recenti (ultimi 10)
    const movimentiRecenti = await queryAll(`
      SELECT 
        m.*,
        a.nome as anagrafica_nome,
        a.tipo as anagrafica_tipo,
        cc.nome_banca
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id
      WHERE m.user_id = $1
      ORDER BY m.data DESC, m.created_at DESC
      LIMIT 10
    `, [userId]);

    // 4. Statistiche mese corrente vs mese precedente
    const currentMonth = moment().format('YYYY-MM');
    const previousMonth = moment().subtract(1, 'month').format('YYYY-MM');

    const statisticheMensili = await queryAll(`
      SELECT 
        TO_CHAR(DATE_TRUNC('month', data), 'YYYY-MM') as mese,
        COUNT(*) as numero_movimenti,
        SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE 0 END) as entrate,
        SUM(CASE WHEN tipo = 'Uscita' THEN importo ELSE 0 END) as uscite,
        SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE -importo END) as saldo_netto
      FROM movimenti 
      WHERE user_id = $1 
        AND DATE_TRUNC('month', data) IN (
          DATE_TRUNC('month', CURRENT_DATE),
          DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        )
      GROUP BY DATE_TRUNC('month', data)
      ORDER BY mese DESC
    `, [userId]);

    // 5. Top 5 clienti per entrate (ultimi 3 mesi)
    const topClienti = await queryAll(`
      SELECT 
        a.id,
        a.nome,
        a.categoria,
        COUNT(m.id) as numero_movimenti,
        SUM(m.importo) as totale_entrate
      FROM anagrafiche a
      JOIN movimenti m ON a.id = m.anagrafica_id
      WHERE a.user_id = $1 
        AND a.tipo = 'Cliente' 
        AND a.attivo = true
        AND m.tipo = 'Entrata'
        AND m.data >= CURRENT_DATE - INTERVAL '3 months'
      GROUP BY a.id, a.nome, a.categoria
      ORDER BY totale_entrate DESC
      LIMIT 5
    `, [userId]);

    // 6. Top 5 fornitori per uscite (ultimi 3 mesi)
    const topFornitori = await queryAll(`
      SELECT 
        a.id,
        a.nome,
        a.categoria,
        COUNT(m.id) as numero_movimenti,
        SUM(m.importo) as totale_uscite
      FROM anagrafiche a
      JOIN movimenti m ON a.id = m.anagrafica_id
      WHERE a.user_id = $1 
        AND a.tipo = 'Fornitore' 
        AND a.attivo = true
        AND m.tipo = 'Uscita'
        AND m.data >= CURRENT_DATE - INTERVAL '3 months'
      GROUP BY a.id, a.nome, a.categoria
      ORDER BY totale_uscite DESC
      LIMIT 5
    `, [userId]);

    // 7. Andamento ultimi 6 mesi
    const andamentoMensile = await queryAll(`
      SELECT 
        TO_CHAR(DATE_TRUNC('month', data), 'YYYY-MM') as mese,
        TO_CHAR(DATE_TRUNC('month', data), 'Mon YYYY') as mese_label,
        COUNT(*) as numero_movimenti,
        SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE 0 END) as entrate,
        SUM(CASE WHEN tipo = 'Uscita' THEN importo ELSE 0 END) as uscite,
        SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE -importo END) as saldo_netto
      FROM movimenti 
      WHERE user_id = $1 
        AND data >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', data)
      ORDER BY mese ASC
    `, [userId]);

    // 8. Distribuzione per categoria (ultimi 3 mesi)
    const categorieEntrate = await queryAll(`
      SELECT 
        COALESCE(a.categoria, 'Senza categoria') as categoria,
        COUNT(m.id) as numero_movimenti,
        SUM(m.importo) as totale
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      WHERE m.user_id = $1 
        AND m.tipo = 'Entrata'
        AND m.data >= CURRENT_DATE - INTERVAL '3 months'
      GROUP BY a.categoria
      ORDER BY totale DESC
    `, [userId]);

    const categorieUscite = await queryAll(`
      SELECT 
        COALESCE(a.categoria, 'Senza categoria') as categoria,
        COUNT(m.id) as numero_movimenti,
        SUM(m.importo) as totale
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      WHERE m.user_id = $1 
        AND m.tipo = 'Uscita'
        AND m.data >= CURRENT_DATE - INTERVAL '3 months'
      GROUP BY a.categoria
      ORDER BY totale DESC
    `, [userId]);

    // Calcola il saldo totale
    const saldoTotale = saldi.reduce((sum, conto) => sum + parseFloat(conto.saldo_corrente || 0), 0);

    // Prepara le statistiche comparative
    const meseCorrente = statisticheMensili.find(s => s.mese === currentMonth) || {
      numero_movimenti: 0, entrate: 0, uscite: 0, saldo_netto: 0
    };
    const mesePrecedente = statisticheMensili.find(s => s.mese === previousMonth) || {
      numero_movimenti: 0, entrate: 0, uscite: 0, saldo_netto: 0
    };

    const variazioni = {
      movimenti: mesePrecedente.numero_movimenti > 0 
        ? ((meseCorrente.numero_movimenti - mesePrecedente.numero_movimenti) / mesePrecedente.numero_movimenti * 100).toFixed(1)
        : meseCorrente.numero_movimenti > 0 ? 100 : 0,
      entrate: mesePrecedente.entrate > 0 
        ? ((meseCorrente.entrate - mesePrecedente.entrate) / mesePrecedente.entrate * 100).toFixed(1)
        : meseCorrente.entrate > 0 ? 100 : 0,
      uscite: mesePrecedente.uscite > 0 
        ? ((meseCorrente.uscite - mesePrecedente.uscite) / mesePrecedente.uscite * 100).toFixed(1)
        : meseCorrente.uscite > 0 ? 100 : 0,
      saldo_netto: mesePrecedente.saldo_netto !== 0 
        ? ((meseCorrente.saldo_netto - mesePrecedente.saldo_netto) / Math.abs(mesePrecedente.saldo_netto) * 100).toFixed(1)
        : meseCorrente.saldo_netto > 0 ? 100 : meseCorrente.saldo_netto < 0 ? -100 : 0
    };

    const dashboard = {
      riassunto: {
        saldo_totale: saldoTotale,
        numero_conti: parseInt(totaliGenerali.numero_conti),
        numero_anagrafiche: parseInt(totaliGenerali.numero_anagrafiche),
        numero_movimenti: parseInt(totaliGenerali.numero_movimenti),
        totale_entrate: parseFloat(totaliGenerali.totale_entrate),
        totale_uscite: parseFloat(totaliGenerali.totale_uscite)
      },
      saldi_conti: saldi,
      movimenti_recenti: movimentiRecenti,
      statistiche_mensili: {
        mese_corrente: meseCorrente,
        mese_precedente: mesePrecedente,
        variazioni: variazioni
      },
      top_clienti: topClienti,
      top_fornitori: topFornitori,
      andamento_mensile: andamentoMensile,
      distribuzione_categorie: {
        entrate: categorieEntrate,
        uscite: categorieUscite
      },
      last_update: new Date().toISOString()
    };

    res.json(dashboard);
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Errore durante il caricamento della dashboard' });
  }
});

// GET /api/dashboard/kpi - KPI principali
router.get('/kpi', async (req, res) => {
  try {
    const userId = req.user.id;
    const { periodo = '30' } = req.query; // giorni

    const kpi = await queryOne(`
      SELECT 
        COUNT(*) as movimenti_periodo,
        COUNT(*) FILTER (WHERE tipo = 'Entrata') as entrate_count,
        COUNT(*) FILTER (WHERE tipo = 'Uscita') as uscite_count,
        COALESCE(SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE 0 END), 0) as totale_entrate,
        COALESCE(SUM(CASE WHEN tipo = 'Uscita' THEN importo ELSE 0 END), 0) as totale_uscite,
        COALESCE(SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE -importo END), 0) as saldo_netto,
        COALESCE(AVG(CASE WHEN tipo = 'Entrata' THEN importo END), 0) as media_entrate,
        COALESCE(AVG(CASE WHEN tipo = 'Uscita' THEN importo END), 0) as media_uscite
      FROM movimenti 
      WHERE user_id = $1 
        AND data >= CURRENT_DATE - INTERVAL '${parseInt(periodo)} days'
    `, [userId]);

    // Movimento più alto e più basso del periodo
    const movimentiEstremi = await queryAll(`
      (SELECT 'max_entrata' as tipo, descrizione, importo, data, 'Entrata' as movimento_tipo
       FROM movimenti 
       WHERE user_id = $1 AND tipo = 'Entrata' 
         AND data >= CURRENT_DATE - INTERVAL '${parseInt(periodo)} days'
       ORDER BY importo DESC LIMIT 1)
      UNION ALL
      (SELECT 'max_uscita' as tipo, descrizione, importo, data, 'Uscita' as movimento_tipo
       FROM movimenti 
       WHERE user_id = $1 AND tipo = 'Uscita' 
         AND data >= CURRENT_DATE - INTERVAL '${parseInt(periodo)} days'
       ORDER BY importo DESC LIMIT 1)
    `, [userId]);

    // Saldo totale corrente
    const saldoTotale = await queryOne(`
      SELECT COALESCE(SUM(calcola_saldo_conto(id)), 0) as saldo_totale
      FROM conti_correnti 
      WHERE user_id = $1 AND attivo = true
    `, [userId]);

    res.json({
      periodo_giorni: parseInt(periodo),
      kpi: {
        ...kpi,
        saldo_totale_corrente: parseFloat(saldoTotale.saldo_totale)
      },
      movimenti_estremi: movimentiEstremi,
      calcolato_il: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching KPI:', error);
    res.status(500).json({ error: 'Errore durante il caricamento dei KPI' });
  }
});

// GET /api/dashboard/alerts - Alerts e notifiche
router.get('/alerts', async (req, res) => {
  try {
    const userId = req.user.id;
    const alerts = [];

    // 1. Conti con saldo negativo
    const contiNegativi = await queryAll(`
      SELECT id, nome_banca, intestatario, calcola_saldo_conto(id) as saldo
      FROM conti_correnti 
      WHERE user_id = $1 AND attivo = true AND calcola_saldo_conto(id) < 0
    `, [userId]);

    contiNegativi.forEach(conto => {
      alerts.push({
        tipo: 'warning',
        categoria: 'saldo_negativo',
        titolo: 'Saldo negativo',
        messaggio: `Il conto ${conto.nome_banca} ha un saldo negativo di €${Math.abs(conto.saldo).toFixed(2)}`,
        data: new Date().toISOString(),
        conto_id: conto.id
      });
    });

    // 2. Nessun movimento negli ultimi 30 giorni
    const contiInattivi = await queryAll(`
      SELECT cc.id, cc.nome_banca, cc.intestatario
      FROM conti_correnti cc
      WHERE cc.user_id = $1 AND cc.attivo = true
        AND NOT EXISTS (
          SELECT 1 FROM movimenti m 
          WHERE m.conto_id = cc.id 
            AND m.data >= CURRENT_DATE - INTERVAL '30 days'
        )
    `, [userId]);

    contiInattivi.forEach(conto => {
      alerts.push({
        tipo: 'info',
        categoria: 'conto_inattivo',
        titolo: 'Conto inattivo',
        messaggio: `Nessun movimento sul conto ${conto.nome_banca} negli ultimi 30 giorni`,
        data: new Date().toISOString(),
        conto_id: conto.id
      });
    });

    // 3. Uscite elevate questo mese
    const usciteMensili = await queryOne(`
      SELECT SUM(importo) as uscite_mese
      FROM movimenti 
      WHERE user_id = $1 
        AND tipo = 'Uscita'
        AND DATE_TRUNC('month', data) = DATE_TRUNC('month', CURRENT_DATE)
    `, [userId]);

    const usciteMeseScorso = await queryOne(`
      SELECT SUM(importo) as uscite_mese_scorso
      FROM movimenti 
      WHERE user_id = $1 
        AND tipo = 'Uscita'
        AND DATE_TRUNC('month', data) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    `, [userId]);

    if (usciteMensili.uscite_mese && usciteMeseScorso.uscite_mese_scorso) {
      const incremento = ((usciteMensili.uscite_mese - usciteMeseScorso.uscite_mese_scorso) / usciteMeseScorso.uscite_mese_scorso * 100);
      
      if (incremento > 20) {
        alerts.push({
          tipo: 'warning',
          categoria: 'uscite_elevate',
          titolo: 'Uscite in aumento',
          messaggio: `Le uscite di questo mese sono aumentate del ${incremento.toFixed(1)}% rispetto al mese scorso`,
          data: new Date().toISOString(),
          dettagli: {
            uscite_correnti: usciteMensili.uscite_mese,
            uscite_precedenti: usciteMeseScorso.uscite_mese_scorso,
            incremento_percentuale: incremento.toFixed(1)
          }
        });
      }
    }

    // 4. Anagrafiche duplicate (stesso nome)
    const anagraficheDuplicate = await queryAll(`
      SELECT nome, COUNT(*) as count
      FROM anagrafiche 
      WHERE user_id = $1 AND attivo = true
      GROUP BY LOWER(nome)
      HAVING COUNT(*) > 1
    `, [userId]);

    anagraficheDuplicate.forEach(dup => {
      alerts.push({
        tipo: 'info',
        categoria: 'anagrafiche_duplicate',
        titolo: 'Possibili duplicati',
        messaggio: `Trovate ${dup.count} anagrafiche con nome simile a "${dup.nome}"`,
        data: new Date().toISOString()
      });
    });

    res.json({
      alerts: alerts.sort((a, b) => {
        const order = { 'error': 0, 'warning': 1, 'info': 2 };
        return order[a.tipo] - order[b.tipo];
      }),
      totale: alerts.length,
      per_tipo: {
        error: alerts.filter(a => a.tipo === 'error').length,
        warning: alerts.filter(a => a.tipo === 'warning').length,
        info: alerts.filter(a => a.tipo === 'info').length
      }
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Errore durante il caricamento degli alerts' });
  }
});

// GET /api/dashboard/quick-stats - Statistiche rapide per widget
router.get('/quick-stats', async (req, res) => {
  try {
    const userId = req.user.id;

    const quickStats = await queryOne(`
      SELECT 
        (SELECT COUNT(*) FROM conti_correnti WHERE user_id = $1 AND attivo = true) as conti_attivi,
        (SELECT COUNT(*) FROM anagrafiche WHERE user_id = $1 AND attivo = true) as anagrafiche_attive,
        (SELECT COUNT(*) FROM movimenti WHERE user_id = $1 AND data = CURRENT_DATE) as movimenti_oggi,
        (SELECT COUNT(*) FROM movimenti WHERE user_id = $1 AND DATE_TRUNC('week', data) = DATE_TRUNC('week', CURRENT_DATE)) as movimenti_settimana,
        (SELECT SUM(calcola_saldo_conto(id)) FROM conti_correnti WHERE user_id = $1 AND attivo = true) as saldo_totale
    `, [userId]);

    res.json(quickStats);
  } catch (error) {
    console.error('Error fetching quick stats:', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle statistiche rapide' });
  }
});

module.exports = router;
