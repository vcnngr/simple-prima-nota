// routes/movimenti.js - VERSIONE FLESSIBILE CON TIPOLOGIE
const express = require('express');
const { query, queryOne, queryAll, withTransaction } = require('../config/database');
const { auth } = require('../middleware/auth');
const { validate, validateQuery, schemas, giorno, elencoConti } = require('../middleware/validation');
const moment = require('moment');
const UnifiedImportProcessor = require('../services/UnifiedImportProcessor');
const { logErrore } = require('../utils/errori');
const { testoCsv } = require('../utils/csv');
const { cartellaXlsx } = require('../utils/xlsx');

const { idNumerici } = require('../middleware/parametri');
const router = express.Router();
idNumerici(router, 'id'); // 400 per id non interi (U1)

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
  data_inizio: giorno().optional(),
  data_fine: giorno().optional(),
  conto_id: require('joi').number().integer().optional(),
  // U7b: piu' conti insieme ("3,5,9"), in alternativa a conto_id.
  conti: elencoConti().optional(),
  anagrafica_id: require('joi').number().integer().optional(),
  tipologia_id: require('joi').number().integer().optional(), // NUOVO
  // U8a: piu' tipologie della controparte ("2,7") e piu' categorie del movimento
  // (?categorie=Utenze&categorie=Affitto; nomi esatti).
  tipologie: elencoConti().optional(),
  categorie: require('joi').alternatives().try(
    require('joi').array().items(require('joi').string().trim().min(1).max(100)).min(1).max(50).unique(),
    require('joi').string().trim().min(1).max(100)
  ).optional(),
  tipo: require('joi').string().valid('Entrata', 'Uscita').optional(),
  importo_min: require('joi').number().min(0).optional(),
  importo_max: require('joi').number().min(0).optional(),
  search: require('joi').string().max(100).optional(),
  limit: require('joi').number().integer().min(1).max(1000).default(50),
  offset: require('joi').number().integer().min(0).default(0),
  order_by: require('joi').string().valid('data', 'importo', 'created_at').default('data'),
  order_direction: require('joi').string().valid('ASC', 'DESC').default('DESC'),
  // U1: cursore per le liste infinite ("data_id" dell'ultima riga ricevuta), solo
  // con order_by=data. Con il cursore offset si ignora: righe inserite nel
  // frattempo non fanno saltare ne' ripetere righe.
  // U5: solo i movimenti con una richiesta di chiarimento aperta dello studio.
  da_chiarire: require('joi').boolean().optional(),
  dopo: require('joi').string().pattern(/^\d{4}-\d{2}-\d{2}_[1-9]\d{0,9}$/).custom(cursoreValido).optional()
}).oxor('conto_id', 'conti');

// Il pattern non basta: 2025-02-30 e id oltre INTEGER arrivavano a pg (500).
function cursoreValido(v, helpers) {
  const [d, i] = v.split('_');
  const t = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d) return helpers.error('any.invalid');
  if (Number(i) > 2147483647) return helpers.error('any.invalid');
  return v;
}

// Filtri di GET /movimenti, uguali per l'export (U8c): condizioni su m (movimenti)
// e a (anagrafiche), parametri da $1 (user_id). idsConti: i conti scelti o null.
function filtriMovimenti(userId, f) {
  const { data_inizio, data_fine, conto_id, conti, anagrafica_id, tipologia_id, tipologie, categorie,
    tipo, importo_min, importo_max, search, da_chiarire } = f;
        let whereConditions = ['m.user_id = $1'];
        let params = [userId];
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
        
        // Conti scelti (U7b): uno (conto_id) o piu' (conti); nessuno = tutti.
        const idsConti = conto_id ? [conto_id] : (conti || null);
        if (idsConti) {
          whereConditions.push(`m.conto_id = ANY($${paramIndex}::int[])`);
          params.push(idsConti);
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

        // U8a: tipologie della controparte e categorie del movimento, piu' d'una.
        if (tipologie) {
          whereConditions.push(`a.tipologia_id = ANY($${paramIndex}::int[])`);
          params.push(tipologie);
          paramIndex++;
        }
        if (categorie) {
          whereConditions.push(`m.categoria = ANY($${paramIndex}::text[])`);
          params.push([].concat(categorie));
          paramIndex++;
        }
        
        if (tipo) {
          whereConditions.push(`m.tipo = $${paramIndex}`);
          params.push(tipo);
          paramIndex++;
        }
        
        if (importo_min !== undefined) {
          whereConditions.push(`m.importo >= $${paramIndex}`);
          params.push(importo_min);
          paramIndex++;
        }
        
        if (importo_max !== undefined) {
          whereConditions.push(`m.importo <= $${paramIndex}`);
          params.push(importo_max);
          paramIndex++;
        }
        
        if (da_chiarire !== undefined) {
          whereConditions.push(`${da_chiarire ? '' : 'NOT '}EXISTS (SELECT 1 FROM messaggi_commercialista mc
            JOIN collegamenti_commercialista cl ON cl.id = mc.collegamento_id
            WHERE mc.movimento_id = m.id AND cl.user_id = m.user_id AND cl.stato = 'attiva'
              AND mc.chiarimento_stato = 'aperta')`);
        }

        if (search) {
          whereConditions.push(`(m.descrizione ILIKE $${paramIndex} OR m.note ILIKE $${paramIndex} OR a.nome ILIKE $${paramIndex})`);
          params.push(`%${search}%`);
          paramIndex++;
        }
        
  return { whereConditions, params, idsConti };
}

// GET /api/movimenti/export?formato=csv|xlsx - Export dei movimenti con gli
// stessi filtri del Registro (U8c): periodo, conti, controparte, tipologie,
// categorie, tipo, importo, ricerca, da chiarire. In ordine di data; il saldo e'
// quello vero dei conti scelti (come in GET /movimenti), non dei soli filtrati.
// Date e importi come testo dal database (niente slittamenti di fuso, niente
// virgola mobile). Al massimo 20.000 righe: oltre, 400 con il numero.
const ESPORTA_MAX = 20000;
const exportSchema = movimentiFiltersSchema.fork(['limit', 'offset', 'order_by', 'order_direction', 'dopo'], x => x.strip())
  .keys({ formato: require('joi').string().valid('csv', 'xlsx').default('csv') });
router.get('/export', validateQuery(exportSchema), async (req, res) => {
  try {
    const { whereConditions, params, idsConti } = filtriMovimenti(req.user.id, req.query);
    const tot = await queryOne(`
      SELECT count(*)::int AS n,
             coalesce(sum(m.importo) FILTER (WHERE m.tipo = 'Entrata'), 0.00)::text AS entrate,
             coalesce(sum(m.importo) FILTER (WHERE m.tipo = 'Uscita'), 0.00)::text AS uscite
      FROM movimenti m LEFT JOIN anagrafiche a ON a.id = m.anagrafica_id
      WHERE ${whereConditions.join(' AND ')}`, params);
    if (tot.n > ESPORTA_MAX) {
      return res.status(400).json({ error: `Troppi movimenti da esportare (${tot.n}): restringi il periodo, al massimo ${ESPORTA_MAX}` });
    }
    const pp = [...params];
    let soloConti = '', soloMovimenti = '';
    if (idsConti) {
      pp.push(idsConti);
      soloConti = ` AND cc3.id = ANY($${pp.length}::int[])`;
      soloMovimenti = ` AND m2.conto_id = ANY($${pp.length}::int[])`;
    }
    const righe = await queryAll(`
      SELECT to_char(m.data, 'DD/MM/YYYY') AS "Data",
             to_char(m.data, 'YYYY-MM-DD') AS giorno,
             coalesce(cc.nome_banca, '') AS "Conto",
             coalesce(a.nome, '') AS "Controparte",
             coalesce(ta.nome, '') AS "Tipologia",
             coalesce(m.categoria, '') AS "Categoria",
             m.descrizione AS "Descrizione",
             CASE WHEN m.tipo = 'Entrata' THEN m.importo::text ELSE '' END AS "Entrate",
             CASE WHEN m.tipo = 'Uscita' THEN m.importo::text ELSE '' END AS "Uscite",
             sp.saldo::text AS "Saldo",
             coalesce(m.note, '') AS "Note"
      FROM movimenti m
      LEFT JOIN anagrafiche a ON a.id = m.anagrafica_id AND a.user_id = m.user_id
      LEFT JOIN tipologie_anagrafiche ta ON ta.id = a.tipologia_id AND ta.user_id = m.user_id
      LEFT JOIN conti_correnti cc ON cc.id = m.conto_id AND cc.user_id = m.user_id
      LEFT JOIN (
        SELECT m2.id,
               (SELECT coalesce(sum(cc3.saldo_iniziale), 0) FROM conti_correnti cc3 WHERE cc3.user_id = $1${soloConti})
               + sum(CASE WHEN m2.tipo = 'Entrata' THEN m2.importo ELSE -m2.importo END) OVER (ORDER BY m2.data, m2.id) AS saldo
        FROM movimenti m2
        JOIN conti_correnti cc2 ON cc2.id = m2.conto_id AND cc2.user_id = $1
        WHERE m2.user_id = $1${soloMovimenti}
      ) sp ON sp.id = m.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY m.data, m.id
    `, pp);
    const COLONNE = ['Data', 'Conto', 'Controparte', 'Tipologia', 'Categoria', 'Descrizione', 'Entrate', 'Uscite', 'Saldo', 'Note'];
    const oggi = new Date().toISOString().slice(0, 10);

    if (req.query.formato === 'xlsx') {
      // Excel: date vere (mezzanotte locale, nessuno slittamento) e importi come numeri.
      const num = v => (v === '' || v == null ? '' : Number(v));
      const xl = righe.map(r => {
        const [y, mm, d] = r.giorno.split('-').map(Number);
        return { Data: new Date(y, mm - 1, d), Conto: r.Conto, Controparte: r.Controparte, Tipologia: r.Tipologia,
          Categoria: r.Categoria, Descrizione: r.Descrizione, Entrate: num(r.Entrate), Uscite: num(r.Uscite), Saldo: num(r.Saldo), Note: r.Note };
      });
      const riepilogo = [{ Movimenti: tot.n, Entrate: Number(tot.entrate), Uscite: Number(tot.uscite),
        Netto: Number((Number(tot.entrate) - Number(tot.uscite)).toFixed(2)), Filtri: descriviFiltri(req.query) }];
      const buffer = cartellaXlsx([{ nome: 'Prima Nota', righe: xl, larghezze: true }, { nome: 'Riepilogo', righe: riepilogo, larghezze: true }]);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="prima_nota_${oggi}.xlsx"`);
      return res.send(buffer);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="prima_nota_${oggi}.csv"`);
    res.send(testoCsv(COLONNE, righe));
  } catch (error) {
    logErrore('Error exporting movimenti', error);
    res.status(500).json({ error: 'Errore durante l\'export dei movimenti' });
  }
});

// Testo leggibile dei filtri dell'export (foglio Riepilogo).
function descriviFiltri(f) {
  const v = [];
  if (f.data_inizio || f.data_fine) v.push(`periodo ${f.data_inizio || '…'} – ${f.data_fine || '…'}`);
  if (f.conto_id || f.conti) v.push(`conti ${[].concat(f.conto_id || f.conti).join(', ')}`);
  if (f.tipo) v.push(f.tipo === 'Entrata' ? 'solo entrate' : 'solo uscite');
  if (f.anagrafica_id) v.push(`controparte ${f.anagrafica_id}`);
  if (f.tipologie) v.push(`tipologie ${[].concat(f.tipologie).join(', ')}`);
  if (f.categorie) v.push(`categorie ${[].concat(f.categorie).join(', ')}`);
  if (f.importo_min !== undefined || f.importo_max !== undefined) v.push(`importo ${f.importo_min ?? '…'} – ${f.importo_max ?? '…'}`);
  if (f.search) v.push(`ricerca «${f.search}»`);
  if (f.da_chiarire) v.push('da chiarire');
  return v.join('; ') || 'nessuno: tutti i movimenti';
}

// GET /api/movimenti/template - Template con tipologie (AGGIORNATO)
// GET /api/movimenti/categorie?tipo= - Categorie dei movimenti (U8a): quelle
// dell'elenco (categorie_movimenti, attive) e quelle scritte sui movimenti, con
// quante volte sono usate. Con tipo: prima le piu' usate per quel tipo.
router.get('/categorie', validateQuery(require('joi').object({
  tipo: require('joi').string().valid('Entrata', 'Uscita').optional()
})), async (req, res) => {
  try {
    const righe = await queryAll(`
      WITH usate AS (
        SELECT m.categoria AS nome, count(*)::int AS n,
               count(*) FILTER (WHERE m.tipo = $2)::int AS n_tipo
        FROM movimenti m
        WHERE m.user_id = $1 AND nullif(trim(m.categoria), '') IS NOT NULL
        GROUP BY m.categoria
      ), elenco AS (
        SELECT nome, colore, tipo FROM categorie_movimenti WHERE user_id = $1 AND attiva = true
      )
      SELECT coalesce(u.nome, e.nome) AS nome, e.colore, e.tipo,
             coalesce(u.n, 0) AS utilizzi, coalesce(u.n_tipo, 0) AS utilizzi_tipo
      FROM usate u FULL JOIN elenco e ON e.nome = u.nome
      ORDER BY coalesce(u.n_tipo, 0) DESC, coalesce(u.n, 0) DESC, lower(coalesce(u.nome, e.nome))
    `, [req.user.id, req.query.tipo ?? null]);
    res.json({ categorie: righe });
  } catch (error) {
    logErrore('Error fetching categorie usate', error);
    res.status(500).json({ error: 'Errore durante il caricamento delle categorie' });
  }
});

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
    logErrore('Errore generazione template', error);
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
    logErrore('Errore info import', error);
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
    
    // Una transazione per tutto il file (U6b). Con ?anteprima=1 si fa lo
    // stesso lavoro e si annulla: l'utente vede cosa succederebbe.
    const anteprima = req.query.anteprima === '1';
    const ANNULLA = Symbol('anteprima');
    let result;
    try {
      result = await withTransaction(async (client) => {
        const r = await new UnifiedImportProcessor(userId, client).processCSV(csvData);
        if (anteprima || r.stats.movimenti_importati === 0) throw Object.assign(new Error('annulla'), { [ANNULLA]: r });
        return r;
      });
    } catch (e) {
      if (!e[ANNULLA]) throw e;
      result = e[ANNULLA];
    }
    result.anteprima = anteprima;
    
    console.log('✅ Import completato con successo per utente:', userId, { ...result.stats, warnings: result.stats?.warnings?.length });
    
    res.json(result);
    
  } catch (error) {
    logErrore(`💥 Errore import per utente ${req.user?.id}`, error);

    // Solo gli errori scritti da noi (UnifiedImportProcessor, erroreImport)
    // arrivano al client col loro testo; gli altri sono guasti: messaggio generico.
    if (!error.applicativo) {
      return res.status(500).json({ error: 'Errore durante l\'import del CSV' });
    }

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
          conti,
          anagrafica_id,
          tipologia_id, // NUOVO
          tipologie,
          categorie,
          tipo,
          importo_min,
          importo_max,
          search,
          limit,
          offset,
          order_by,
          order_direction,
          dopo,
          da_chiarire
        } = req.query;
        
        const { whereConditions, params, idsConti } = filtriMovimenti(req.user.id, req.query);
        
        const validOrderBy = ['data', 'importo', 'created_at'];
        const validDirection = ['ASC', 'DESC'];
        const safeOrderBy = validOrderBy.includes(order_by) ? order_by : 'data';
        const safeDirection = validDirection.includes(order_direction) ? order_direction : 'DESC';

        // U1: il cursore vale solo per l'ordine per data (data, id).
        if (dopo && safeOrderBy !== 'data') {
          return res.status(400).json({ error: 'Il cursore vale solo con order_by=data' });
        }
        const pagina = [...whereConditions];
        const paramsPagina = [...params];
        if (dopo) {
          const [d, i] = dopo.split('_');
          paramsPagina.push(d, parseInt(i, 10));
          const n = paramsPagina.length;
          pagina.push(`(m.data, m.id) ${safeDirection === 'DESC' ? '<' : '>'} ($${n - 1}::date, $${n})`);
        }
        // Saldo progressivo (saldo dopo il movimento, in ordine data, id) dei conti
        // scelti: somma dei loro saldi iniziali + i loro movimenti. Senza conti (U7):
        // tutti i conti dell'utente, anche disattivati; con uno: il saldo di quel
        // conto (U1). Si calcola su tutti i movimenti di quei conti, poi si filtra:
        // con altri filtri resta il saldo vero.
        const saldoCol = ',\n        sp.saldo_progressivo';
        let soloConti = '';
        let soloMovimenti = '';
        if (idsConti) {
          paramsPagina.push(idsConti);
          const c = paramsPagina.length;
          soloConti = ` AND cc3.id = ANY($${c}::int[])`;
          soloMovimenti = ` AND m2.conto_id = ANY($${c}::int[])`;
        }
        const saldoJoin = `
      LEFT JOIN (
        SELECT m2.id,
               (SELECT coalesce(sum(cc3.saldo_iniziale), 0) FROM conti_correnti cc3
                 WHERE cc3.user_id = $1${soloConti})
               + sum(CASE WHEN m2.tipo = 'Entrata' THEN m2.importo ELSE -m2.importo END)
                 OVER (ORDER BY m2.data, m2.id) AS saldo_progressivo
        FROM movimenti m2
        JOIN conti_correnti cc2 ON cc2.id = m2.conto_id AND cc2.user_id = $1
        WHERE m2.user_id = $1${soloMovimenti}
      ) sp ON sp.id = m.id`;
        paramsPagina.push(limit + 1, dopo ? 0 : offset);
        const nLim = paramsPagina.length - 1;
        
        // Query principale con tipologie (AGGIORNATA)
        // `giorno`: la data come testo (YYYY-MM-DD). `data` resta un Date di pg,
        // serializzato in UTC a partire dalla mezzanotte del fuso del server: con
        // un fuso diverso da UTC slitta al giorno prima (U4).
        const movimenti = await queryAll(`
      SELECT 
        m.*,
        to_char(m.data, 'YYYY-MM-DD') AS giorno,
        a.nome as anagrafica_nome,
        -- U5: etichetta «da chiarire» (W5, richieste aperte su un collegamento attivo).
        EXISTS (SELECT 1 FROM messaggi_commercialista mc
                JOIN collegamenti_commercialista cl ON cl.id = mc.collegamento_id
                WHERE mc.movimento_id = m.id AND cl.user_id = m.user_id AND cl.stato = 'attiva'
                  AND mc.chiarimento_stato = 'aperta') AS da_chiarire,
        ta.nome as tipologia_nome,
        ta.tipo_movimento_default,
        ta.colore as tipologia_colore,
        ta.icona as tipologia_icona,
        cc.nome_banca,
        cc.intestatario${saldoCol}
      FROM movimenti m
      LEFT JOIN anagrafiche a ON m.anagrafica_id = a.id
      LEFT JOIN tipologie_anagrafiche ta ON a.tipologia_id = ta.id
      LEFT JOIN conti_correnti cc ON m.conto_id = cc.id${saldoJoin}
      WHERE ${pagina.join(' AND ')}
      ORDER BY m.${safeOrderBy} ${safeDirection}, m.id ${safeDirection}
      LIMIT $${nLim} OFFSET $${nLim + 1}
    `, paramsPagina);
        // Una riga in piu' dice se ce ne sono altre (vale anche col cursore).
        const altri = movimenti.length > limit;
        if (altri) movimenti.pop();
        const ultima = movimenti[movimenti.length - 1];
          
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
                  hasMore: altri,
                  // "data_id" dell'ultima riga, da ripassare come `dopo` (solo order_by=data)
                  cursore: altri && safeOrderBy === 'data' && ultima
                    ? `${moment(ultima.data).format('YYYY-MM-DD')}_${ultima.id}` : null
                },
                totali
              });
            } catch (error) {
              logErrore('Error fetching movimenti', error);
              res.status(500).json({ error: 'Errore durante il caricamento dei movimenti' });
            }
});
          
// Tutti gli altri endpoint (recenti, :id, POST, PUT, DELETE, bulk, statistiche) 
// rimangono INVARIATI tranne le query che ora includono tipologie nelle JOIN
          
            
// GET /api/movimenti/:id - Dettaglio singolo movimento (AGGIORNATO)
router.get('/:id', async (req, res) => {
              try {
                const { id } = req.params;
                
                const movimento = await queryOne(`
      SELECT 
        m.*,
        to_char(m.data, 'YYYY-MM-DD') AS giorno,
        a.nome as anagrafica_nome,
        ta.nome as tipologia_nome,
        ta.tipo_movimento_default,
        ta.colore as tipologia_colore,
        ta.icona as tipologia_icona,
        EXISTS (SELECT 1 FROM messaggi_commercialista mc
                JOIN collegamenti_commercialista cl ON cl.id = mc.collegamento_id
                WHERE mc.movimento_id = m.id AND cl.user_id = m.user_id AND cl.stato = 'attiva'
                  AND mc.chiarimento_stato = 'aperta') AS da_chiarire,
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
                  logErrore('Error fetching movimento detail', error);
                  res.status(500).json({ error: 'Errore durante il caricamento del movimento' });
                }
});
              
// POST /api/movimenti - Crea nuovo movimento (INVARIATO - usa schema esistente)
router.post('/', validate(schemas.movimento), async (req, res) => {
                try {
                  const { data, anagrafica_id, conto_id, descrizione, categoria, importo, tipo, note } = req.body;
                  
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
      (data, anagrafica_id, conto_id, descrizione, importo, tipo, note, user_id, categoria) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING *
    `, [
data,
anagrafica_id || null,
conto_id,
descrizione,
importo,
tipo,
note || null,
req.user.id,
// U8a: la categoria si salvava solo in modifica (PUT), mai alla registrazione.
(categoria && categoria.trim()) || null
                  ]);
                  
                  const newMovimento = result.rows[0];
                  
                  // Recupera i dettagli completi con tipologie (AGGIORNATO)
                  const movimentoCompleto = await queryOne(`
      SELECT 
        m.*,
        to_char(m.data, 'YYYY-MM-DD') AS giorno,
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
logErrore('Error creating movimento', error);
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
      RETURNING *, to_char(data, 'YYYY-MM-DD') AS giorno
    `;

const result = await queryOne(updateQuery, values);

res.json({
  success: true,
  message: 'Movimento aggiornato con successo',
  data: result
});

                  } catch (error) {
logErrore('Error updating movimento', error);
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
logErrore('Error deleting movimento', error);
res.status(500).json({ error: 'Errore durante l\'eliminazione del movimento' });
                  }
});
                


module.exports = router;