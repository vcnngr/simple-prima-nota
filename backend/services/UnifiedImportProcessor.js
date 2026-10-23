// ==============================================================================
// FILE: backend/services/UnifiedImportProcessor.js
// NUOVO SISTEMA IMPORT CSV UNIFICATO
// Sostituisce la logica di import in routes/movimenti.js
// ==============================================================================

const { logErrore, motivoRiga } = require('../utils/errori');

// Errori dell'import scritti da noi (blocco K3): il testo si puo' mostrare
// all'utente, che vede i propri dati. Ogni altro errore (driver, bug) resta
// fuori dalla risposta: se ne mostra solo un motivo generico.
function erroreImport(messaggio) {
  const e = new Error(messaggio);
  e.applicativo = true;
  return e;
}

// Centesimi -> testo per il database ("1234.50").
function inTesto(c) {
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

// "2026-02-28" | "28/02/2026" -> "2026-02-28"; null se non e' un giorno vero.
function giornoDa(v) {
  const t = String(v ?? '').trim();
  let a, m, g, x;
  if ((x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) [, a, m, g] = x;
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) [, g, m, a] = x;
  else return null;
  const s = `${a}-${m.padStart(2, '0')}-${g.padStart(2, '0')}`;
  if (a === '0000') return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/**
* Processore unificato per import CSV con creazione automatica entità
* Gestisce un singolo file CSV che può contenere tutte le informazioni necessarie
*/
class UnifiedImportProcessor {
  // db: il client della transazione (U6b). L'import intero e' una transazione;
  // ogni riga un savepoint: una riga sbagliata non lascia mezze scritture.
  constructor(userId, db) {
    this.userId = userId;
    this.db = db;
    this.stats = {
      movimenti_importati: 0,
      // Somme delle righe importate, in centesimi interi (U6b).
      entrate_centesimi: 0,
      uscite_centesimi: 0,
      anagrafiche_create: 0,
      tipologie_create: 0,
      categorie_anagrafiche_create: 0,
      categorie_movimenti_create: 0,
      conti_creati: 0,
      errori: 0,
      warnings: []
    };
    
    // Cache per evitare query ripetute e migliorare performance
    this.cache = {
      conti: new Map(),           // nome_banca -> {id, nome_banca}
      tipologie: new Map(),       // nome -> {id, nome, tipo_movimento_default}
      categorieAnagrafiche: new Map(), // nome -> {id, nome}
      categorieMovimenti: new Map(),   // nome_tipo -> {id, nome, tipo}
      anagrafiche: new Map()      // nome -> {id, nome, tipologia_id}
    };
  }
  
  async uno(text, params) {
    return (await this.db.query(text, params)).rows[0] || null;
  }

  // Fotografia di cache e contatori: una riga annullata non lascia in cache
  // entita' che il savepoint ha tolto dal database.
  fotografia() {
    const cache = {};
    for (const [k, m] of Object.entries(this.cache)) cache[k] = new Map(m);
    const { warnings, errori, ...contatori } = this.stats;
    return { cache, contatori };
  }

  ripristina(f) {
    this.cache = f.cache;
    Object.assign(this.stats, f.contatori);
  }

  /**
  * METODO PRINCIPALE: Processa il CSV e importa tutti i dati
  * @param {string} csvData - Contenuto del file CSV
  * @returns {Object} Risultato dell'import con statistiche
  */
  async processCSV(csvData) {
    try {
      console.log('🚀 Avvio import unificato per utente:', this.userId);
      
      // 1. Parse e validazione CSV
      const rows = this.parseCSV(csvData);
      console.log(`📊 Trovate ${rows.length} righe da processare`);
      
      if (rows.length === 0) {
        throw erroreImport('Il file CSV non contiene dati da importare');
      }
      if (rows.length > 10000) {
        throw erroreImport(`Troppe righe: ${rows.length} (al massimo 10000 per file)`);
      }
      
      // 2. Un import alla volta per utente, fino al commit (review U6b bis):
      // il secondo legge la cache dopo che il primo ha scritto, quindi ritrova
      // le controparti create anche con maiuscole diverse (UNIQUE(user_id, nome)
      // distingue le maiuscole) e due import non si bloccano a vicenda riga per riga.
      await this.db.query("SELECT pg_advisory_xact_lock(hashtext('import_csv'), $1)", [this.userId]);

      // 3. Pre-caricamento cache per performance
      await this.preloadCache();
      
      // 4. Processing di ogni riga
      const processedRows = [];
      for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 1;
        
        const prima = this.fotografia();
        await this.db.query('SAVEPOINT riga');
        try {
          const result = await this.processRow(rows[i], rowNumber);
          await this.db.query('RELEASE SAVEPOINT riga');
          processedRows.push(result);
          this.stats.movimenti_importati++;
          
          // Log progresso ogni 100 righe
          if (rowNumber % 100 === 0) {
            console.log(`⏳ Processate ${rowNumber}/${rows.length} righe...`);
          }
          
        } catch (error) {
          await this.db.query('ROLLBACK TO SAVEPOINT riga');
          this.ripristina(prima);
          this.stats.errori++;
          this.stats.warnings.push(`Riga ${rowNumber}: ${error.applicativo ? error.message : motivoRiga(error)}`);
          logErrore(`❌ Errore riga ${rowNumber}`, error);
          
          // Continua con le altre righe invece di fermarsi
          // Limite errori per evitare spam log
          if (this.stats.errori > 100) {
            this.stats.warnings.push('Troppi errori, alcune righe potrebbero essere state saltate');
            break;
          }
        }
      }
      
      console.log('✅ Import completato:', { ...this.stats, warnings: this.stats.warnings.length }); // i warning citano i dati delle righe
      return this.generateReport();
      
    } catch (error) {
      logErrore('💥 Errore generale import', error);
      if (!error.applicativo) throw error; // la route risponde con un messaggio generico
      throw erroreImport(`Errore durante l'import: ${error.message}`);
    }
  }
  
  /**
  * Parse CSV con formato flessibile e intelligente
  * Supporta commenti, header variabili, mapping automatico
  */
  parseCSV(csvData) {
    const lines = csvData.replace(/^\uFEFF/, '').split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length < 2) {
      throw erroreImport('File CSV deve contenere almeno header e una riga dati');
    }
    
    // Trova header (prima riga non vuota che non inizia con #)
    let headerIndex = 0;
    while (headerIndex < lines.length && (
      lines[headerIndex] === '' || 
      lines[headerIndex].startsWith('#')
    )) {
      headerIndex++;
    }
    
    if (headerIndex >= lines.length) {
      throw erroreImport('Header CSV non trovato. La prima riga deve contenere i nomi delle colonne');
    }
    
    const headers = lines[headerIndex].split(';').map(h => h.trim());
    const dataLines = lines.slice(headerIndex + 1);
    
    console.log('📋 Headers CSV trovati:', headers);
    
    // Verifica headers minimi obbligatori
    const requiredFields = ['data', 'descrizione', 'importo', 'tipo'];
    const fieldMapping = this.createFieldMapping(headers);
    const mappedFields = Object.values(fieldMapping);
    
    const missingFields = requiredFields.filter(field => !mappedFields.includes(field));
    if (missingFields.length > 0) {
      throw erroreImport(`Campi obbligatori mancanti nel CSV: ${missingFields.join(', ')}`);
    }
    
    // Parse righe dati
    const rows = [];
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim();
      
      // Salta righe vuote e commenti
      if (!line || line.startsWith('#')) continue;
      
      const values = line.split(';').map(v => v.trim());
      
      if (values.length !== headers.length) {
        throw erroreImport(`Riga ${i + headerIndex + 2}: numero colonne non corrispondente (attese ${headers.length}, trovate ${values.length})`);
      }
      
      // Crea oggetto riga mappato
      const rowData = {};
      headers.forEach((header, index) => {
        const fieldName = fieldMapping[header] || header.toLowerCase();
        rowData[fieldName] = values[index] || null;
      });
      
      rows.push(rowData);
    }
    
    return rows;
  }
  
  /**
  * Crea mapping intelligente da headers CSV a campi standardizzati
  */
  createFieldMapping(headers) {
    const mapping = {};
    
    headers.forEach(header => {
      const normalized = header.toLowerCase().trim();
      
      // =====================================================
      // MAPPING ESATTO E PRIORITARIO (NUOVO)
      // =====================================================
      
      // Prima controlla match esatti per evitare confusione
      if (header === 'Data') {
        mapping[header] = 'data';
      } else if (header === 'Descrizione') {
        mapping[header] = 'descrizione';
      } else if (header === 'Importo') {
        mapping[header] = 'importo';
      } else if (header === 'Tipo') {
        mapping[header] = 'tipo';
      } else if (header === 'Anagrafica') {
        mapping[header] = 'anagrafica';
      } else if (header === 'Tipologia_Anagrafica') {
        mapping[header] = 'tipologia_anagrafica';
      } else if (header === 'Categoria_Anagrafica') {
        mapping[header] = 'categoria_anagrafica';
      } else if (header === 'Conto') {
        mapping[header] = 'conto';
      } else if (header === 'Categoria_Movimento') {
        mapping[header] = 'categoria_movimento';
      } else if (header === 'Note') {
        mapping[header] = 'note';
      }
      
      // =====================================================
      // MAPPING INTELLIGENTE FALLBACK (MIGLIORATO)
      // =====================================================
      
      else if (normalized.match(/^data/)) {
        mapping[header] = 'data';
      } else if (normalized.match(/descrizione|operazione|causale/) && !normalized.includes('tipologia')) {
        mapping[header] = 'descrizione';
      } else if (normalized.match(/importo|amount/) && !normalized.includes('tipo')) {
        mapping[header] = 'importo';
      } else if (normalized === 'tipo' || normalized === 'type') {
        // Solo match esatto per "tipo" per evitare confusione con "tipologia"
        mapping[header] = 'tipo';
      } else if (normalized.match(/^anagrafica$|^cliente$|^fornitore$/) && !normalized.includes('tipologia') && !normalized.includes('categoria')) {
        mapping[header] = 'anagrafica';
      } else if (normalized.includes('tipologia') && normalized.includes('anagrafica')) {
        mapping[header] = 'tipologia_anagrafica';
      } else if (normalized.includes('categoria') && normalized.includes('anagrafica')) {
        mapping[header] = 'categoria_anagrafica';
      } else if (normalized.match(/^conto$|^banca$|^bank$/)) {
        mapping[header] = 'conto';
      } else if (normalized.includes('categoria') && normalized.includes('movimento')) {
        mapping[header] = 'categoria_movimento';
      } else if (normalized.match(/^note$|^notes$|^memo$/)) {
        mapping[header] = 'note';
      } else {
        // Default: usa header normalizzato
        mapping[header] = normalized.replace(/[^a-z0-9_]/g, '_');
      }
    });
    
    return mapping;
  }
  
  // =====================================================
  // AGGIUNGI ANCHE QUESTO METODO DI DEBUG
  // =====================================================
  
  /**
  * Debug mapping colonne - aggiungi questo metodo per verificare
  */
  debugColumnMapping(headers, firstRowData) {
    console.log('🔍 DEBUG MAPPING COLONNE:');
    console.log('📋 Headers trovati:', headers);
    
    const mapping = this.createFieldMapping(headers);
    console.log('🗺️ Mapping generato:', mapping);
    
    if (firstRowData) {
      console.log('📊 Prima riga mappata:');
      headers.forEach((header, index) => {
        const mappedField = mapping[header];
        const value = firstRowData[index];
        console.log(`  ${header} → ${mappedField}`); // mai il valore della riga
      });
    }
    
    // Verifica che i campi obbligatori siano mappati correttamente
    const mappedFields = Object.values(mapping);
    const requiredFields = ['data', 'descrizione', 'importo', 'tipo'];
    const missingFields = requiredFields.filter(field => !mappedFields.includes(field));
    
    if (missingFields.length > 0) {
      console.log('❌ Campi obbligatori mancanti nel mapping:', missingFields);
    } else {
      console.log('✅ Tutti i campi obbligatori mappati correttamente');
    }
    
    return mapping;
  }
  
  /**
  * Pre-caricamento cache con dati esistenti per ottimizzare performance
  */
  async preloadCache() {
    console.log('🔄 Pre-caricamento cache...');
    
    try {
      // Cache conti correnti
      const contiResult = await this.db.query(
        'SELECT id, nome_banca FROM conti_correnti WHERE user_id = $1 AND attivo = true ORDER BY nome_banca',
        [this.userId]
      );
      contiResult.rows.forEach(c => {
        this.cache.conti.set(c.nome_banca.toLowerCase(), c);
      });
      
      // Cache tipologie anagrafiche
      const tipologieResult = await this.db.query(
        'SELECT id, nome, tipo_movimento_default FROM tipologie_anagrafiche WHERE user_id = $1 ORDER BY nome',
        [this.userId]
      );
      tipologieResult.rows.forEach(t => {
        this.cache.tipologie.set(t.nome.toLowerCase(), t);
      });
      
      // Cache categorie anagrafiche
      const catAnagraficheResult = await this.db.query(
        'SELECT id, nome FROM categorie_anagrafiche WHERE user_id = $1 ORDER BY nome',
        [this.userId]
      );
      catAnagraficheResult.rows.forEach(c => {
        this.cache.categorieAnagrafiche.set(c.nome.toLowerCase(), c);
      });
      
      // Cache categorie movimenti
      const catMovimentiResult = await this.db.query(
        'SELECT id, nome, tipo FROM categorie_movimenti WHERE user_id = $1 ORDER BY nome, tipo',
        [this.userId]
      );
      catMovimentiResult.rows.forEach(c => {
        const key = `${c.nome.toLowerCase()}_${c.tipo}`;
        this.cache.categorieMovimenti.set(key, c);
      });
      
      // Cache anagrafiche
      const anagraficheResult = await this.db.query(
        'SELECT id, nome, tipologia_id FROM anagrafiche WHERE user_id = $1 ORDER BY nome',
        [this.userId]
      );
      anagraficheResult.rows.forEach(a => {
        this.cache.anagrafiche.set(a.nome.toLowerCase(), a);
      });
      
      console.log('✅ Cache caricata:', {
        conti: this.cache.conti.size,
        tipologie: this.cache.tipologie.size,
        categorieAnagrafiche: this.cache.categorieAnagrafiche.size,
        categorieMovimenti: this.cache.categorieMovimenti.size,
        anagrafiche: this.cache.anagrafiche.size
      });
      
    } catch (error) {
      logErrore('❌ Errore pre-caricamento cache', error);
      throw erroreImport('Errore caricamento dati esistenti');
    }
  }
  
  /**
  * Processa una singola riga CSV creando tutte le entità necessarie
  */
  async processRow(rowData, rowNumber) {
    // 1. Validazione e parsing dati base
    const parsed = this.validateAndParseRow(rowData, rowNumber);
    
    // 2. Risoluzione entità in ordine di dipendenza
    const conto = await this.resolveConto(parsed.conto);
    const tipologia = await this.resolveTipologia(parsed.tipologia_anagrafica, parsed.tipo);
    const categoriaAnagrafica = await this.resolveCategoriaAnagrafica(parsed.categoria_anagrafica);
    const categoriaMovimento = await this.resolveCategoriaMovimento(parsed.categoria_movimento, parsed.tipo);
    const anagrafica = await this.resolveAnagrafica(parsed.anagrafica, tipologia, categoriaAnagrafica);
    
    // 3. Creazione movimento finale
    const movimento = await this.createMovimento({
      data: parsed.data,
      descrizione: parsed.descrizione,
      importo: parsed.importo,
      tipo: parsed.tipo,
      note: parsed.note,
      anagrafica_id: anagrafica.id,
      conto_id: conto.id,
      categoria: categoriaMovimento?.nome || null
    });
    this.stats[parsed.tipo === 'Entrata' ? 'entrate_centesimi' : 'uscite_centesimi'] += parsed.centesimi;
    
    return movimento;
  }
  
  /**
  * Validazione e parsing dati riga con controlli robusti
  */
  validateAndParseRow(rowData, rowNumber) {
    const errors = [];
    
    // =====================================================
    // PULIZIA PREVENTIVA DEI DATI (NUOVO)
    // =====================================================
    
    // Pulisci tutti i campi da caratteri invisibili
    const cleanedData = {};
    Object.keys(rowData).forEach(key => {
      if (rowData[key] && typeof rowData[key] === 'string') {
        cleanedData[key] = rowData[key]
        .trim()                           // Spazi normali
        .replace(/[\u00A0\u2000-\u200F]/g, '') // Spazi Unicode
        .replace(/[""'']/g, '')          // Virgolette curve
        .replace(/^\uFEFF/, '')          // BOM residuo
        .normalize('NFC');               // Normalizza Unicode
      } else {
        cleanedData[key] = rowData[key];
      }
    });
    
    
    // =====================================================
    // VALIDAZIONE CAMPI OBBLIGATORI (AGGIORNATO)
    // =====================================================
    
    if (!cleanedData.data) errors.push('Data mancante');
    if (!cleanedData.descrizione) errors.push('Descrizione mancante');
    if (!cleanedData.importo) errors.push('Importo mancante');
    if (!cleanedData.tipo) errors.push('Tipo mancante');
    
    // =====================================================
    // VALIDAZIONE TIPO CON MAPPING FLESSIBILE (NUOVO)
    // =====================================================
    
    let tipoNormalizzato = null;
    if (cleanedData.tipo) {
      const tipoLower = cleanedData.tipo.toLowerCase();
      
      // Mapping flessibile per il tipo
      const tipoMapping = {
        'entrata': 'Entrata',
        'uscita': 'Uscita',
        'income': 'Entrata',
        'expense': 'Uscita',
        'ricavo': 'Entrata',
        'costo': 'Uscita',
        'credito': 'Entrata',
        'debito': 'Uscita',
        '+': 'Entrata',
        '-': 'Uscita'
      };
      
      tipoNormalizzato = tipoMapping[tipoLower] || cleanedData.tipo;
      
      // Controllo finale con valori esatti
      if (!['Entrata', 'Uscita'].includes(tipoNormalizzato)) {
        errors.push(`Tipo deve essere "Entrata" o "Uscita" (trovato: "${cleanedData.tipo}")`);
      }
    }
    
    // =====================================================
    // VALIDAZIONI FORMATO (INVARIATE)
    // =====================================================
    
    if (cleanedData.data && !this.isValidDate(cleanedData.data)) {
      errors.push('Data non valida (AAAA-MM-GG o GG/MM/AAAA, giorno esistente)');
    }
    
    // Validazione importo
    let importo = 0;
    if (cleanedData.importo) {
      try {
        importo = this.parseImporto(cleanedData.importo);
        if (importo === 0) {
          errors.push('Importo deve essere maggiore di zero');
        }
      } catch (error) {
        errors.push(error.applicativo ? `Importo non valido: ${error.message}` : 'Importo non valido');
      }
    }
    
    if (errors.length > 0) {
      throw erroreImport(errors.join(', '));
    }
    
    // =====================================================
    // PARSING E NORMALIZZAZIONE (AGGIORNATO)
    // =====================================================
    
    return {
      data: this.parseDate(cleanedData.data),
      descrizione: (cleanedData.descrizione || '').trim() || 'Movimento importato',
      importo: inTesto(importo),
      centesimi: importo,
      tipo: tipoNormalizzato, // Usa il tipo normalizzato
      anagrafica: (cleanedData.anagrafica || '').trim() || null,
      tipologia_anagrafica: (cleanedData.tipologia_anagrafica || '').trim() || null,
      categoria_anagrafica: (cleanedData.categoria_anagrafica || '').trim() || null,
      conto: (cleanedData.conto || '').trim() || null,
      categoria_movimento: (cleanedData.categoria_movimento || '').trim() || null,
      note: (cleanedData.note || '').trim() || null
    };
  }
  
  /**
  * Risolve o crea conto corrente
  * Se non esiste, crea automaticamente
  */
  async resolveConto(nomeConto) {
  // Default se non specificato
  if (!nomeConto) {
    nomeConto = 'Conto Principale';
  }

  const key = nomeConto.toLowerCase();

  // Cerca in cache
  if (this.cache.conti.has(key)) {
    return this.cache.conti.get(key);
  }

  // Niente corrispondenze parziali (U6b): «Cassa» non e' «Cassa Rurale», e un
  // movimento sul conto sbagliato sposta i saldi di due conti.

  // Verifica esistenza nel DB prima di creare
  try {
    const existing = await this.uno(
      'SELECT id, nome_banca FROM conti_correnti WHERE user_id = $1 AND LOWER(nome_banca) = $2 AND attivo = true',
      [this.userId, key]
    );

    if (existing) {
      this.cache.conti.set(key, existing);
      return existing;
    }
  } catch (error) {
    logErrore('⚠️ Errore ricerca conto esistente', error);
  }

  // Crea nuovo conto con gestione duplicati
  console.log('➕ Creazione nuovo conto');
  
  try {
    const result = await this.db.query(`
      INSERT INTO conti_correnti (nome_banca, intestatario, saldo_iniziale, user_id, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, nome_banca) 
      DO UPDATE SET 
        attivo = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, nome_banca
    `, [nomeConto, 'Auto-creato da import', 0, this.userId]);

    const newConto = result.rows[0];
    this.cache.conti.set(key, newConto);
    this.stats.conti_creati++;

    return newConto;
    
  } catch (error) {
    // Fallback di recupero
    logErrore('⚠️ Errore creazione conto, tentativo recupero', error);
    
    try {
      const fallback = await this.uno(
        'SELECT id, nome_banca FROM conti_correnti WHERE user_id = $1 AND LOWER(nome_banca) = $2',
        [this.userId, key]
      );
      
      if (fallback) {
        this.cache.conti.set(key, fallback);
        return fallback;
      }
    } catch (fallbackError) {
      logErrore('❌ Fallback conto fallito', fallbackError);
    }
    
    throw erroreImport(`Impossibile creare/recuperare conto "${nomeConto}"`);
  }
  }
    
  /**
  * Risolve o crea tipologia anagrafica
  * Gestisce compatibilità con tipo movimento
  */
  async resolveTipologia(nomeTipologia, tipoMovimento) {
  // Default intelligente basato su tipo movimento
  if (!nomeTipologia) {
    nomeTipologia = tipoMovimento === 'Entrata' ? 'Cliente' : 'Fornitore';
  }

  const key = nomeTipologia.toLowerCase();

  // 1. PRIMA: Cerca in cache
  if (this.cache.tipologie.has(key)) {
    const tipologia = this.cache.tipologie.get(key);
    
    // Verifica compatibilità tipo movimento
    if (this.isTipologiaCompatibile(tipologia.tipo_movimento_default, tipoMovimento)) {
      return tipologia;
    }
    
    // Se non compatibile, crea variante specifica
    const nomeVariante = `${nomeTipologia} (${tipoMovimento})`;
    const keyVariante = nomeVariante.toLowerCase();
    
    // Controlla se la variante è già in cache
    if (this.cache.tipologie.has(keyVariante)) {
      return this.cache.tipologie.get(keyVariante);
    }
    
    nomeTipologia = nomeVariante;
  }

  // 2. SECONDO: Verifica esistenza nel DATABASE (evita race condition)
  try {
    const existing = await this.uno(
      'SELECT id, nome, tipo_movimento_default FROM tipologie_anagrafiche WHERE user_id = $1 AND LOWER(nome) = $2',
      [this.userId, nomeTipologia.toLowerCase()]
    );

    if (existing) {
      // Aggiorna cache e ritorna
      this.cache.tipologie.set(nomeTipologia.toLowerCase(), existing);
      return existing;
    }
  } catch (error) {
    logErrore('⚠️ Errore ricerca tipologia esistente', error);
  }

  // 3. TERZO: Crea nuova tipologia con ON CONFLICT
  console.log(`➕ Creazione nuova tipologia (${tipoMovimento})`);
  
  try {
    const result = await this.db.query(`
      INSERT INTO tipologie_anagrafiche (user_id, nome, tipo_movimento_default, descrizione, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, nome) 
      DO UPDATE SET 
        tipo_movimento_default = EXCLUDED.tipo_movimento_default,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, nome, tipo_movimento_default
    `, [this.userId, nomeTipologia, tipoMovimento, 'Auto-creata da import']);

    const newTipologia = result.rows[0];
    
    // Aggiorna cache con chiave normalizzata
    this.cache.tipologie.set(nomeTipologia.toLowerCase(), newTipologia);
    
    // Incrementa stats solo se è realmente nuova (non un conflitto risolto)
    this.stats.tipologie_create++;
    
    return newTipologia;
    
  } catch (error) {
    // FALLBACK FINALE: Se anche ON CONFLICT fallisce, cerca nel DB
    logErrore('⚠️ Errore creazione tipologia, tentativo recupero finale', error);
    
    try {
      const fallback = await this.uno(
        'SELECT id, nome, tipo_movimento_default FROM tipologie_anagrafiche WHERE user_id = $1 AND LOWER(nome) = $2',
        [this.userId, nomeTipologia.toLowerCase()]
      );
      
      if (fallback) {
        this.cache.tipologie.set(nomeTipologia.toLowerCase(), fallback);
        return fallback;
      }
    } catch (fallbackError) {
      logErrore('❌ Fallback tipologia fallito', fallbackError);
    }
    
    // Se tutto fallisce, rilancia l'errore originale
    throw erroreImport(`Impossibile creare/recuperare tipologia "${nomeTipologia}"`);
  }
  }
      
  /**
  * Risolve o crea categoria anagrafica
  */
  async resolveCategoriaAnagrafica(nomeCategoria) {
  if (!nomeCategoria) return null;

  const key = nomeCategoria.toLowerCase();

  // Cerca in cache
  if (this.cache.categorieAnagrafiche.has(key)) {
    return this.cache.categorieAnagrafiche.get(key);
  }

  // Verifica esistenza nel DB
  try {
    const existing = await this.uno(
      'SELECT id, nome FROM categorie_anagrafiche WHERE user_id = $1 AND LOWER(nome) = $2',
      [this.userId, key]
    );

    if (existing) {
      this.cache.categorieAnagrafiche.set(key, existing);
      return existing;
    }
  } catch (error) {
    logErrore('⚠️ Errore ricerca categoria anagrafica', error);
  }

  // Crea nuova categoria con gestione duplicati
  console.log('➕ Creazione nuova categoria anagrafica');
  
  try {
    const result = await this.db.query(`
      INSERT INTO categorie_anagrafiche (user_id, nome, descrizione, created_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, nome) 
      DO UPDATE SET updated_at = CURRENT_TIMESTAMP
      RETURNING id, nome
    `, [this.userId, nomeCategoria, 'Auto-creata da import']);

    const newCategoria = result.rows[0];
    this.cache.categorieAnagrafiche.set(key, newCategoria);
    this.stats.categorie_anagrafiche_create++;
    
    return newCategoria;
    
  } catch (error) {
    logErrore('⚠️ Errore categoria anagrafica, tentativo recupero', error);
    
    try {
      // Fallback recovery
      const fallback = await this.uno(
        'SELECT id, nome FROM categorie_anagrafiche WHERE user_id = $1 AND LOWER(nome) = $2',
        [this.userId, key]
      );
      
      if (fallback) {
        this.cache.categorieAnagrafiche.set(key, fallback);
        return fallback;
      }
    } catch (fallbackError) {
      logErrore('⚠️ Fallback categoria anagrafica fallito', fallbackError);
    }
    
    // Categoria opzionale, ritorna null se tutto fallisce
    console.warn('⚠️ Impossibile creare la categoria anagrafica, continuo senza');
    return null;
  }
  }
        
  /**
  * Risolve o crea categoria movimento
  * Gestisce compatibilità con tipo movimento
  */
  async resolveCategoriaMovimento(nomeCategoria, tipoMovimento) {
  if (!nomeCategoria) return null;

  const key = nomeCategoria.toLowerCase();

  // Cerca in cache per nome (non per nome+tipo perché il constraint è solo su nome)
  if (this.cache.categorieMovimenti.has(key)) {
    const categoria = this.cache.categorieMovimenti.get(key);
    
    // Verifica compatibilità tipo
    if (categoria.tipo === tipoMovimento || categoria.tipo === 'Entrambi') {
      return categoria;
    }
    
    // Se esiste ma tipo incompatibile, crea variante con nome diverso
    const nomeVariante = `${nomeCategoria} (${tipoMovimento})`;
    const keyVariante = nomeVariante.toLowerCase();
    
    if (this.cache.categorieMovimenti.has(keyVariante)) {
      return this.cache.categorieMovimenti.get(keyVariante);
    }
    
    nomeCategoria = nomeVariante;
  }

  // Verifica esistenza nel DB
  try {
    const existing = await this.uno(
      'SELECT id, nome, tipo FROM categorie_movimenti WHERE user_id = $1 AND LOWER(nome) = $2',
      [this.userId, nomeCategoria.toLowerCase()]
    );

    if (existing) {
      this.cache.categorieMovimenti.set(nomeCategoria.toLowerCase(), existing);
      return existing;
    }
  } catch (error) {
    logErrore('⚠️ Errore ricerca categoria movimento', error);
  }

  // Crea nuova categoria con ON CONFLICT corretto per il tuo schema
  console.log(`➕ Creazione nuova categoria movimento (${tipoMovimento})`);
  
  try {
    const result = await this.db.query(`
      INSERT INTO categorie_movimenti (user_id, nome, tipo, descrizione, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, nome) 
      DO UPDATE SET 
        tipo = EXCLUDED.tipo,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, nome, tipo
    `, [this.userId, nomeCategoria, tipoMovimento, 'Auto-creata da import']);

    const newCategoria = result.rows[0];
    this.cache.categorieMovimenti.set(nomeCategoria.toLowerCase(), newCategoria);
    this.stats.categorie_movimenti_create++;

    return newCategoria;
    
  } catch (error) {
    logErrore('⚠️ Errore categoria movimento, tentativo recupero', error);
    
    try {
      // Fallback recovery
      const fallback = await this.uno(
        'SELECT id, nome, tipo FROM categorie_movimenti WHERE user_id = $1 AND LOWER(nome) = $2',
        [this.userId, nomeCategoria.toLowerCase()]
      );
      
      if (fallback) {
        this.cache.categorieMovimenti.set(nomeCategoria.toLowerCase(), fallback);
        return fallback;
      }
    } catch (fallbackError) {
      logErrore('⚠️ Fallback categoria movimento fallito', fallbackError);
    }
    
    // Categoria opzionale, ritorna null se tutto fallisce
    console.warn('⚠️ Impossibile creare la categoria movimento, continuo senza');
    return null;
  }
  }
          
  /**
  * Risolve o crea anagrafica
  * Assegna tipologia e categoria
  */
  async resolveAnagrafica(nomeAnagrafica, tipologia, categoriaAnagrafica) {
            // Default se non specificato
            if (!nomeAnagrafica) {
              nomeAnagrafica = 'Non specificato';
            }
            
            const key = nomeAnagrafica.toLowerCase();
            
            // Cerca in cache
            if (this.cache.anagrafiche.has(key)) {
              return this.cache.anagrafiche.get(key);
            }
            
            // Crea nuova anagrafica
            console.log(`➕ Creazione nuova anagrafica (tipologia ${tipologia.id})`);
            // ON CONFLICT: un altro import (o la pagina) puo' averla appena creata.
            // Senza, il secondo import violava UNIQUE(user_id, nome) e scartava la
            // riga (review U6b). Si conta solo se l'INSERT l'ha creata davvero.
            const result = await this.db.query(`
      INSERT INTO anagrafiche (nome, tipologia_id, categoria, user_id, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, nome) DO NOTHING
      RETURNING id, nome, tipologia_id
    `, [nomeAnagrafica, tipologia.id, categoriaAnagrafica?.nome || null, this.userId]);

              let anagrafica = result.rows[0];
              if (anagrafica) {
                this.stats.anagrafiche_create++;
              } else {
                anagrafica = (await this.db.query(
                  'SELECT id, nome, tipologia_id FROM anagrafiche WHERE user_id = $1 AND LOWER(nome) = $2 ORDER BY id LIMIT 1',
                  [this.userId, key])).rows[0];
              }
              this.cache.anagrafiche.set(key, anagrafica);

              return anagrafica;
  }
            
  /**
  * Crea movimento finale con tutte le relazioni
  */
  async createMovimento(movimentoData) {
              const result = await this.db.query(`
      INSERT INTO movimenti 
      (data, anagrafica_id, conto_id, descrizione, categoria, importo, tipo, note, user_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      RETURNING id
    `, [
                movimentoData.data,
                movimentoData.anagrafica_id,
                movimentoData.conto_id,
                movimentoData.descrizione,
                movimentoData.categoria,
                movimentoData.importo,
                movimentoData.tipo,
                movimentoData.note,
                this.userId
              ]);
              
              return result.rows[0];
  }
            
  // =============================================================================
  // UTILITY FUNCTIONS
  // =============================================================================
            
  // Date: AAAA-MM-GG o GG/MM/AAAA, giorni del calendario veri (U6b: prima il
  // 30 febbraio diventava il 2 marzo e GG/MM/AAAA era rifiutata).
  isValidDate(dateString) {
    return giornoDa(dateString) !== null;
  }

  parseDate(dateString) {
    const g = giornoDa(dateString);
    if (!g) throw erroreImport(`Data non valida: ${dateString}`);
    return g;
  }

  // Importo -> centesimi interi, senza virgola mobile (U6b). Accetta 1234,50,
  // 1.234,50, 1234.50, 1.234.567; rifiuta 1.234 (mille o uno virgola due?),
  // piu' di due decimali, lettere, negativi, oltre 9.999.999.999,99.
  parseImporto(importoString) {
    const t = String(importoString ?? '').replace(/[€$£¥\s]/g, '');
    if (t.startsWith('-')) throw erroreImport(`Importo non può essere negativo: ${importoString}`);
    let intera, dec;
    let m;
    if ((m = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/.exec(t)) || (m = /^(\d{1,3}(?:\.\d{3})+|\d+)$/.exec(t))) {
      intera = m[1]; dec = m[2] || '';
      if (/^\d{1,3}\.\d{3}$/.test(intera) && !t.includes(',')) {
        throw erroreImport(`${importoString} e' ambiguo: per mille euro scrivi 1.234,00`);
      }
      intera = intera.replace(/\./g, '');
    } else if ((m = /^(\d+)\.(\d{1,2})$/.exec(t))) {
      intera = m[1]; dec = m[2];
    } else {
      throw erroreImport(`formato non riconosciuto: ${importoString}`);
    }
    intera = intera.replace(/^0+(?=\d)/, '');
    if (intera.length > 10) throw erroreImport(`troppo grande: ${importoString}`);
    return Number(intera) * 100 + Number(dec.padEnd(2, '0'));
  }

  isTipologiaCompatibile(tipoTipologia, tipoMovimento) {
              return tipoTipologia === 'Entrambi' || tipoTipologia === tipoMovimento;
  }
            
  /**
  * Genera report finale con statistiche complete
  */
  generateReport() {
              const success = this.stats.movimenti_importati > 0;
              
              return {
                success,
                message: success 
                ? `Import completato: ${this.stats.movimenti_importati} movimenti importati${this.stats.errori > 0 ? ` (${this.stats.errori} errori)` : ''}`
                : `Import fallito: ${this.stats.errori} errori`,
                stats: this.stats,
                totali: { entrate: inTesto(this.stats.entrate_centesimi), uscite: inTesto(this.stats.uscite_centesimi) },
                dettagli: {
                  movimenti_importati: this.stats.movimenti_importati,
                  entità_create: {
                    anagrafiche: this.stats.anagrafiche_create,
                    tipologie: this.stats.tipologie_create,
                    categorie_anagrafiche: this.stats.categorie_anagrafiche_create,
                    categorie_movimenti: this.stats.categorie_movimenti_create,
                    conti: this.stats.conti_creati
                  },
                  errori: this.stats.errori,
                  warnings: this.stats.warnings
                }
              };
  }
}
          
module.exports = UnifiedImportProcessor;