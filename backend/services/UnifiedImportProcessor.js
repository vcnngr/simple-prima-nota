// ==============================================================================
// FILE: backend/services/UnifiedImportProcessor.js
// NUOVO SISTEMA IMPORT CSV UNIFICATO
// Sostituisce la logica di import in routes/movimenti.js
// ==============================================================================

const { query, queryOne } = require('../config/database');

/**
* Processore unificato per import CSV con creazione automatica entità
* Gestisce un singolo file CSV che può contenere tutte le informazioni necessarie
*/
class UnifiedImportProcessor {
  constructor(userId) {
    this.userId = userId;
    this.stats = {
      movimenti_importati: 0,
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
        throw new Error('Il file CSV non contiene dati da importare');
      }
      
      // 2. Pre-caricamento cache per performance
      await this.preloadCache();
      
      // 3. Processing di ogni riga
      const processedRows = [];
      for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 1;
        
        try {
          const result = await this.processRow(rows[i], rowNumber);
          processedRows.push(result);
          this.stats.movimenti_importati++;
          
          // Log progresso ogni 100 righe
          if (rowNumber % 100 === 0) {
            console.log(`⏳ Processate ${rowNumber}/${rows.length} righe...`);
          }
          
        } catch (error) {
          this.stats.errori++;
          this.stats.warnings.push(`Riga ${rowNumber}: ${error.message}`);
          console.error(`❌ Errore riga ${rowNumber}:`, error.message);
          
          // Continua con le altre righe invece di fermarsi
          // Limite errori per evitare spam log
          if (this.stats.errori > 100) {
            this.stats.warnings.push('Troppi errori, alcune righe potrebbero essere state saltate');
            break;
          }
        }
      }
      
      console.log('✅ Import completato:', this.stats);
      return this.generateReport();
      
    } catch (error) {
      console.error('💥 Errore generale import:', error);
      throw new Error(`Errore durante l'import: ${error.message}`);
    }
  }
  
  /**
  * Parse CSV con formato flessibile e intelligente
  * Supporta commenti, header variabili, mapping automatico
  */
  parseCSV(csvData) {
    const lines = csvData.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length < 2) {
      throw new Error('File CSV deve contenere almeno header e una riga dati');
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
      throw new Error('Header CSV non trovato. La prima riga deve contenere i nomi delle colonne');
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
      throw new Error(`Campi obbligatori mancanti nel CSV: ${missingFields.join(', ')}`);
    }
    
    // Parse righe dati
    const rows = [];
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim();
      
      // Salta righe vuote e commenti
      if (!line || line.startsWith('#')) continue;
      
      const values = line.split(';').map(v => v.trim());
      
      if (values.length !== headers.length) {
        throw new Error(`Riga ${i + headerIndex + 2}: numero colonne non corrispondente (attese ${headers.length}, trovate ${values.length})`);
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
        console.log(`  ${header} → ${mappedField}: "${value}"`);
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
      const contiResult = await query(
        'SELECT id, nome_banca FROM conti_correnti WHERE user_id = $1 AND attivo = true ORDER BY nome_banca',
        [this.userId]
      );
      contiResult.rows.forEach(c => {
        this.cache.conti.set(c.nome_banca.toLowerCase(), c);
      });
      
      // Cache tipologie anagrafiche
      const tipologieResult = await query(
        'SELECT id, nome, tipo_movimento_default FROM tipologie_anagrafiche WHERE user_id = $1 ORDER BY nome',
        [this.userId]
      );
      tipologieResult.rows.forEach(t => {
        this.cache.tipologie.set(t.nome.toLowerCase(), t);
      });
      
      // Cache categorie anagrafiche
      const catAnagraficheResult = await query(
        'SELECT id, nome FROM categorie_anagrafiche WHERE user_id = $1 ORDER BY nome',
        [this.userId]
      );
      catAnagraficheResult.rows.forEach(c => {
        this.cache.categorieAnagrafiche.set(c.nome.toLowerCase(), c);
      });
      
      // Cache categorie movimenti
      const catMovimentiResult = await query(
        'SELECT id, nome, tipo FROM categorie_movimenti WHERE user_id = $1 ORDER BY nome, tipo',
        [this.userId]
      );
      catMovimentiResult.rows.forEach(c => {
        const key = `${c.nome.toLowerCase()}_${c.tipo}`;
        this.cache.categorieMovimenti.set(key, c);
      });
      
      // Cache anagrafiche
      const anagraficheResult = await query(
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
      console.error('❌ Errore pre-caricamento cache:', error);
      throw new Error(`Errore caricamento dati esistenti: ${error.message}`);
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
    
    // DEBUG - Aggiungi temporaneamente per vedere cosa succede
    console.log(`🔍 Debug Riga ${rowNumber}:`);
    console.log(`  • Tipo originale: "${rowData.tipo}" (length: ${rowData.tipo?.length})`);
    console.log(`  • Tipo pulito: "${cleanedData.tipo}" (length: ${cleanedData.tipo?.length})`);
    console.log(`  • Char codes originale:`, rowData.tipo ? Array.from(rowData.tipo).map(c => c.charCodeAt(0)) : 'undefined');
    console.log(`  • Char codes pulito:`, cleanedData.tipo ? Array.from(cleanedData.tipo).map(c => c.charCodeAt(0)) : 'undefined');
    
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
        console.log(`❌ Tipo non riconosciuto: "${cleanedData.tipo}" → "${tipoNormalizzato}"`);
        errors.push(`Tipo deve essere "Entrata" o "Uscita" (trovato: "${cleanedData.tipo}")`);
      } else {
        console.log(`✅ Tipo valido: "${cleanedData.tipo}" → "${tipoNormalizzato}"`);
      }
    }
    
    // =====================================================
    // VALIDAZIONI FORMATO (INVARIATE)
    // =====================================================
    
    if (cleanedData.data && !this.isValidDate(cleanedData.data)) {
      errors.push('Data non valida (formato richiesto: YYYY-MM-DD)');
    }
    
    // Validazione importo
    let importo = 0;
    if (cleanedData.importo) {
      try {
        importo = this.parseImporto(cleanedData.importo);
        if (importo <= 0) {
          errors.push('Importo deve essere maggiore di zero');
        }
      } catch (error) {
        errors.push(`Importo non valido: ${error.message}`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }
    
    // =====================================================
    // PARSING E NORMALIZZAZIONE (AGGIORNATO)
    // =====================================================
    
    return {
      data: this.parseDate(cleanedData.data),
      descrizione: (cleanedData.descrizione || '').trim() || 'Movimento importato',
      importo: importo,
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

  // Cerca match parziale in cache
  for (const [cachedKey, conto] of this.cache.conti) {
    if (cachedKey.includes(key) || key.includes(cachedKey)) {
      this.cache.conti.set(key, conto);
      return conto;
    }
  }

  // Verifica esistenza nel DB prima di creare
  try {
    const existing = await queryOne(
      'SELECT id, nome_banca FROM conti_correnti WHERE user_id = $1 AND LOWER(nome_banca) = $2 AND attivo = true',
      [this.userId, key]
    );

    if (existing) {
      this.cache.conti.set(key, existing);
      return existing;
    }
  } catch (error) {
    console.warn('⚠️ Errore ricerca conto esistente:', error.message);
  }

  // Crea nuovo conto con gestione duplicati
  console.log(`➕ Creazione nuovo conto: ${nomeConto}`);
  
  try {
    const result = await query(`
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
    console.warn('⚠️ Errore creazione conto, tentativo recupero:', error.message);
    
    try {
      const fallback = await queryOne(
        'SELECT id, nome_banca FROM conti_correnti WHERE user_id = $1 AND LOWER(nome_banca) = $2',
        [this.userId, key]
      );
      
      if (fallback) {
        this.cache.conti.set(key, fallback);
        return fallback;
      }
    } catch (fallbackError) {
      console.error('❌ Fallback conto fallito:', fallbackError.message);
    }
    
    throw new Error(`Impossibile creare/recuperare conto "${nomeConto}": ${error.message}`);
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
    const existing = await queryOne(
      'SELECT id, nome, tipo_movimento_default FROM tipologie_anagrafiche WHERE user_id = $1 AND LOWER(nome) = $2',
      [this.userId, nomeTipologia.toLowerCase()]
    );

    if (existing) {
      // Aggiorna cache e ritorna
      this.cache.tipologie.set(nomeTipologia.toLowerCase(), existing);
      return existing;
    }
  } catch (error) {
    console.warn('⚠️ Errore ricerca tipologia esistente:', error.message);
  }

  // 3. TERZO: Crea nuova tipologia con ON CONFLICT
  console.log(`➕ Creazione nuova tipologia: ${nomeTipologia} (${tipoMovimento})`);
  
  try {
    const result = await query(`
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
    console.warn('⚠️ Errore creazione tipologia, tentativo recupero finale:', error.message);
    
    try {
      const fallback = await queryOne(
        'SELECT id, nome, tipo_movimento_default FROM tipologie_anagrafiche WHERE user_id = $1 AND LOWER(nome) = $2',
        [this.userId, nomeTipologia.toLowerCase()]
      );
      
      if (fallback) {
        this.cache.tipologie.set(nomeTipologia.toLowerCase(), fallback);
        return fallback;
      }
    } catch (fallbackError) {
      console.error('❌ Fallback tipologia fallito:', fallbackError.message);
    }
    
    // Se tutto fallisce, rilancia l'errore originale
    throw new Error(`Impossibile creare/recuperare tipologia "${nomeTipologia}": ${error.message}`);
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
    const existing = await queryOne(
      'SELECT id, nome FROM categorie_anagrafiche WHERE user_id = $1 AND LOWER(nome) = $2',
      [this.userId, key]
    );

    if (existing) {
      this.cache.categorieAnagrafiche.set(key, existing);
      return existing;
    }
  } catch (error) {
    console.warn('⚠️ Errore ricerca categoria anagrafica:', error.message);
  }

  // Crea nuova categoria con gestione duplicati
  console.log(`➕ Creazione nuova categoria anagrafica: ${nomeCategoria}`);
  
  try {
    const result = await query(`
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
    console.warn('⚠️ Errore categoria anagrafica, tentativo recupero:', error.message);
    
    try {
      // Fallback recovery
      const fallback = await queryOne(
        'SELECT id, nome FROM categorie_anagrafiche WHERE user_id = $1 AND LOWER(nome) = $2',
        [this.userId, key]
      );
      
      if (fallback) {
        this.cache.categorieAnagrafiche.set(key, fallback);
        return fallback;
      }
    } catch (fallbackError) {
      console.warn('⚠️ Fallback categoria anagrafica fallito:', fallbackError.message);
    }
    
    // Categoria opzionale, ritorna null se tutto fallisce
    console.warn(`⚠️ Impossibile creare categoria anagrafica "${nomeCategoria}", continuo senza`);
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
    const existing = await queryOne(
      'SELECT id, nome, tipo FROM categorie_movimenti WHERE user_id = $1 AND LOWER(nome) = $2',
      [this.userId, nomeCategoria.toLowerCase()]
    );

    if (existing) {
      this.cache.categorieMovimenti.set(nomeCategoria.toLowerCase(), existing);
      return existing;
    }
  } catch (error) {
    console.warn('⚠️ Errore ricerca categoria movimento:', error.message);
  }

  // Crea nuova categoria con ON CONFLICT corretto per il tuo schema
  console.log(`➕ Creazione nuova categoria movimento: ${nomeCategoria} (${tipoMovimento})`);
  
  try {
    const result = await query(`
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
    console.warn('⚠️ Errore categoria movimento, tentativo recupero:', error.message);
    
    try {
      // Fallback recovery
      const fallback = await queryOne(
        'SELECT id, nome, tipo FROM categorie_movimenti WHERE user_id = $1 AND LOWER(nome) = $2',
        [this.userId, nomeCategoria.toLowerCase()]
      );
      
      if (fallback) {
        this.cache.categorieMovimenti.set(nomeCategoria.toLowerCase(), fallback);
        return fallback;
      }
    } catch (fallbackError) {
      console.warn('⚠️ Fallback categoria movimento fallito:', fallbackError.message);
    }
    
    // Categoria opzionale, ritorna null se tutto fallisce
    console.warn(`⚠️ Impossibile creare categoria movimento "${nomeCategoria}", continuo senza`);
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
            console.log(`➕ Creazione nuova anagrafica: ${nomeAnagrafica} (${tipologia.nome})`);
            const result = await query(`
      INSERT INTO anagrafiche (nome, tipologia_id, categoria, user_id, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING id, nome, tipologia_id
    `, [nomeAnagrafica, tipologia.id, categoriaAnagrafica?.nome || null, this.userId]);
              
              const newAnagrafica = result.rows[0];
              this.cache.anagrafiche.set(key, newAnagrafica);
              this.stats.anagrafiche_create++;
              
              return newAnagrafica;
  }
            
  /**
  * Crea movimento finale con tutte le relazioni
  */
  async createMovimento(movimentoData) {
              const result = await query(`
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
            
  isValidDate(dateString) {
              if (!dateString) return false;
              const regex = /^\d{4}-\d{2}-\d{2}$/;
              if (!regex.test(dateString)) return false;
              
              const date = new Date(dateString);
              return date instanceof Date && !isNaN(date.getTime());
  }
            
  parseDate(dateString) {
              if (!dateString) return null;
              
              // Supporta diversi formati
              let date;
              if (dateString.includes('-')) {
                date = new Date(dateString);
              } else if (dateString.includes('/')) {
                // Converte DD/MM/YYYY in YYYY-MM-DD
                const parts = dateString.split('/');
                if (parts.length === 3) {
                  date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                }
              }
              
              if (!date || isNaN(date.getTime())) {
                throw new Error(`Data non valida: ${dateString}`);
              }
              
              return date.toISOString().split('T')[0];
  }
            
  parseImporto(importoString) {
              if (!importoString) return 0;
              
              // Normalizza: rimuovi simboli e spazi, sostituisci virgola con punto
              let cleaned = importoString.toString()
              .replace(/[€$£¥\s]/g, '')  // Rimuovi simboli valuta e spazi
              .replace(',', '.');         // Virgola -> punto decimale
              
              // Gestisci formato italiano con punti migliaia: 1.234,56 -> 1234.56
              const parts = cleaned.split('.');
              if (parts.length > 2) {
                // Più di un punto: considera l'ultimo come decimale
                const decimalPart = parts.pop();
                const integerPart = parts.join('');
                cleaned = `${integerPart}.${decimalPart}`;
              }
              
              const importo = parseFloat(cleaned);
              
              if (isNaN(importo)) {
                throw new Error(`Formato importo non riconosciuto: ${importoString}`);
              }
              
              if (importo < 0) {
                throw new Error(`Importo non può essere negativo: ${importoString}`);
              }
              
              return Math.round(importo * 100) / 100; // Arrotonda a 2 decimali
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