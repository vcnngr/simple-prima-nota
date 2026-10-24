// ==============================================================================
// FILE: backend/middleware/validation.js - VERSIONE FLESSIBILE
// POSIZIONE: backend/middleware/validation.js (SOSTITUISCI COMPLETAMENTE)
// ==============================================================================

const Joi = require('joi');

// Password nuova (cambio e reset, blocco W6). bcrypt considera solo i primi 72
// byte: una password piu' lunga verrebbe troncata in silenzio, quindi si rifiuta.
const passwordNuova = Joi.string().min(8).max(72)
  .custom((v, helpers) => (Buffer.byteLength(v, 'utf8') > 72 ? helpers.error('string.max') : v))
  .required()
  .messages({
    'string.min': 'La nuova password deve essere di almeno 8 caratteri',
    'string.max': 'La nuova password e\' troppo lunga (massimo 72 byte)',
    'any.required': 'La nuova password e\' richiesta'
  });

// Password alla registrazione (blocco K1): stesse regole della password nuova.
const passwordRegistrazione = passwordNuova.messages({
  'string.min': 'La password deve essere di almeno 8 caratteri',
  'string.max': 'La password e\' troppo lunga (massimo 72 byte)',
  'any.required': 'La password e\' richiesta'
});

// Token di reset o di conferma email: 32 byte in esadecimale.
const tokenAccount = Joi.string().pattern(/^[0-9a-f]{64}$/).required()
  .messages({ 'string.pattern.base': 'Link non valido o scaduto', 'any.required': 'Link non valido o scaduto' });

// Giorno di calendario (YYYY-MM-DD), lasciato come stringa (U4, review t_34501f24).
// Joi.date() lo trasformava in una Date a mezzanotte UTC e pg la riscriveva nel
// fuso del backend: con TZ a ovest di UTC "2026-10-10" diventava 2026-10-09 nel
// database (e nei filtri). Come stringa arriva a pg cosi' com'e'. Giorni
// impossibili (2026-02-30) -> 400, non 500 da pg. L'anno 0000 esiste per Date
// ma non per pg (dopo l'1 a.C. viene l'1 d.C.): anni da 0001 (review t_5c3ad1c0).
const giorno = () => Joi.string().pattern(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  .custom((v, helpers) => {
    const t = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== v ? helpers.error('any.invalid') : v;
  })
  .messages({ 'string.pattern.base': '{{#label}} deve essere una data YYYY-MM-DD', 'any.invalid': '{{#label}} non e\' una data valida' });

const schemas = {
  // U6c: riepilogo del cliente per lo studio.
  riepilogoCliente: Joi.object({
    mese: Joi.string().pattern(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/).optional()
      .messages({ 'string.pattern.base': '{{#label}} deve essere un mese YYYY-MM' })
  }),
  // ============================================================================
  // SCHEMA UTENTI E AUTH (INVARIATI)
  // ============================================================================
  user: Joi.object({
    username: Joi.string()
      .min(3)
      .max(30)
      .pattern(/^[a-zA-Z0-9_]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Username può contenere solo lettere, numeri e underscore',
        'string.min': 'Username deve essere di almeno 3 caratteri',
        'string.max': 'Username non può superare 30 caratteri',
        'any.required': 'Username è richiesto'
      }),
    password: passwordRegistrazione,
    email: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Email non valida',
        'any.required': 'Email è richiesta'
      })
  }).options({ stripUnknown: true }),

  login: Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required()
  }),

  // ============================================================================
  // SCHEMA CONTI BANCARI (INVARIATI)
  // ============================================================================
  contoBancario: Joi.object({
    nome_banca: Joi.string().max(100).required(),
    intestatario: Joi.string().max(100).required(),
    iban: Joi.string().max(34).allow('', null),
    saldo_iniziale: Joi.number().precision(2).default(0),
    attivo: Joi.boolean().default(true)
  }).options({ stripUnknown: true }),

  contoBancarioUpdate: Joi.object({
    nome_banca: Joi.string().max(100).optional(),
    intestatario: Joi.string().max(100).optional(),
    iban: Joi.string().max(34).allow('', null).optional(),
    saldo_iniziale: Joi.number().precision(2).optional(),
    attivo: Joi.boolean().optional()
  }).options({ stripUnknown: true }),

  // ============================================================================
  // SCHEMA TIPOLOGIE ANAGRAFICHE (NUOVI)
  // ============================================================================
  tipologiaAnagrafica: Joi.object({
    nome: Joi.string().trim().max(100).required().messages({
      'string.max': 'Nome tipologia non può superare 100 caratteri',
      'any.required': 'Nome tipologia è richiesto'
    }),
    descrizione: Joi.string().max(500).allow('', null).optional(),
    tipo_movimento_default: Joi.string().valid('Entrata', 'Uscita', 'Entrambi').default('Entrambi').messages({
      'any.only': 'Tipo movimento deve essere Entrata, Uscita o Entrambi'
    }),
    colore: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional().messages({
      'string.pattern.base': 'Colore deve essere in formato hex (#RRGGBB)'
    }),
    icona: Joi.string().max(50).optional()
  }).options({ stripUnknown: true }),

  tipologiaAnagraficaUpdate: Joi.object({
    nome: Joi.string().trim().max(100).optional().messages({
      'string.max': 'Nome tipologia non può superare 100 caratteri'
    }),
    descrizione: Joi.string().max(500).allow('', null).optional(),
    tipo_movimento_default: Joi.string().valid('Entrata', 'Uscita', 'Entrambi').optional().messages({
      'any.only': 'Tipo movimento deve essere Entrata, Uscita o Entrambi'
    }),
    colore: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional().messages({
      'string.pattern.base': 'Colore deve essere in formato hex (#RRGGBB)'
    }),
    icona: Joi.string().max(50).optional(),
    attiva: Joi.boolean().optional()
  }).options({ stripUnknown: true }),

  // ============================================================================
  // SCHEMA ANAGRAFICHE (AGGIORNATI - TIPOLOGIE FLESSIBILI)
  // ============================================================================
  anagrafica: Joi.object({
    nome: Joi.string().max(100).required(),
    tipologia_id: Joi.number().integer().allow(null).optional(),
    tipo_movimento_preferito: Joi.string().valid('Entrata', 'Uscita', 'Entrambi').allow(null).optional(),
    categoria: Joi.string().max(100).allow('', null).optional(),
    email: Joi.string().email().allow('', null).optional(),
    telefono: Joi.string().max(20).allow('', null).optional(),
    piva: Joi.string().max(20).allow('', null).optional(),
    indirizzo: Joi.string().allow('', null).optional(),
    attivo: Joi.boolean().default(true)
  }).options({ stripUnknown: true }),

  anagraficaUpdate: Joi.object({
    nome: Joi.string().max(100).optional(),
    tipologia_id: Joi.number().integer().allow(null).optional(),
    tipo_movimento_preferito: Joi.string().valid('Entrata', 'Uscita', 'Entrambi').allow(null).optional(),
    categoria: Joi.string().max(100).allow('', null).optional(),
    email: Joi.string().email().allow('', null).optional(),
    telefono: Joi.string().max(20).allow('', null).optional(),
    piva: Joi.string().max(20).allow('', null).optional(),
    indirizzo: Joi.string().allow('', null).optional(),
    attivo: Joi.boolean().optional()
  }).options({ stripUnknown: true }),

  // ============================================================================
  // SCHEMA MOVIMENTI (INVARIATI)
  // ============================================================================
  movimento: Joi.object({
    data: giorno().required(),
    anagrafica_id: Joi.number().integer().allow(null).optional(),
    conto_id: Joi.number().integer().required(),
    descrizione: Joi.string().max(255).required(),
    categoria: Joi.string().max(100).allow('', null).optional(),
    importo: Joi.number().positive().precision(2).required(),
    tipo: Joi.string().valid('Entrata', 'Uscita').required(),
    note: Joi.string().allow('', null).optional()
  }).options({ stripUnknown: true }),

  movimentoUpdate: Joi.object({
    data: giorno().optional(),
    anagrafica_id: Joi.number().integer().allow(null).optional(),
    conto_id: Joi.number().integer().optional(),
    descrizione: Joi.string().max(255).optional(),
    categoria: Joi.string().max(100).allow('', null).optional(),
    importo: Joi.number().positive().precision(2).optional(),
    tipo: Joi.string().valid('Entrata', 'Uscita').optional(),
    note: Joi.string().allow('', null).optional()
  }).options({ stripUnknown: true }),

  // ============================================================================
  // SCHEMA CATEGORIE ANAGRAFICHE (INVARIATI)
  // ============================================================================
  categoriaAnagrafica: Joi.object({
    nome: Joi.string().max(100).required().messages({
      'string.max': 'Nome categoria non può superare 100 caratteri',
      'any.required': 'Nome categoria è richiesto'
    }),
    descrizione: Joi.string().max(500).allow('', null).optional(),
    colore: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional().messages({
      'string.pattern.base': 'Colore deve essere in formato hex (#RRGGBB)'
    })
  }).options({ stripUnknown: true }),

  categoriaAnagraficaUpdate: Joi.object({
    nome: Joi.string().max(100).optional().messages({
      'string.max': 'Nome categoria non può superare 100 caratteri'
    }),
    descrizione: Joi.string().max(500).allow('', null).optional(),
    colore: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional().messages({
      'string.pattern.base': 'Colore deve essere in formato hex (#RRGGBB)'
    }),
    attiva: Joi.boolean().optional()
  }).options({ stripUnknown: true }),

  // ============================================================================
  // SCHEMA CATEGORIE MOVIMENTI (INVARIATI)
  // ============================================================================
  // Categorie delle controparti (U6b): niente tipo, la tabella non lo ha.
  categoriaAnagrafica: Joi.object({
    nome: Joi.string().trim().max(100).required()
      .messages({ 'string.max': 'Nome categoria non può superare 100 caratteri', 'any.required': 'Nome categoria è richiesto' }),
    descrizione: Joi.string().max(500).allow('', null).optional(),
    colore: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional()
      .messages({ 'string.pattern.base': 'Colore deve essere in formato hex (#RRGGBB)' })
  }),
  categoriaAnagraficaUpdate: Joi.object({
    nome: Joi.string().trim().max(100).optional()
      .messages({ 'string.max': 'Nome categoria non può superare 100 caratteri' }),
    descrizione: Joi.string().max(500).allow('', null).optional(),
    colore: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional()
      .messages({ 'string.pattern.base': 'Colore deve essere in formato hex (#RRGGBB)' }),
    attiva: Joi.boolean().optional()
  }).min(1),

  categoriaMovimento: Joi.object({
    nome: Joi.string().trim().max(100).required().messages({
      'string.max': 'Nome categoria non può superare 100 caratteri',
      'any.required': 'Nome categoria è richiesto'
    }),
    tipo: Joi.string().valid('Entrata', 'Uscita', 'Entrambi').default('Entrambi').messages({
      'any.only': 'Tipo deve essere Entrata, Uscita o Entrambi'
    }),
    descrizione: Joi.string().max(500).allow('', null).optional(),
    colore: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional().messages({
      'string.pattern.base': 'Colore deve essere in formato hex (#RRGGBB)'
    })
  }).options({ stripUnknown: true }),

  categoriaMovimentoUpdate: Joi.object({
    nome: Joi.string().trim().max(100).optional().messages({
      'string.max': 'Nome categoria non può superare 100 caratteri'
    }),
    tipo: Joi.string().valid('Entrata', 'Uscita', 'Entrambi').optional().messages({
      'any.only': 'Tipo deve essere Entrata, Uscita o Entrambi'
    }),
    descrizione: Joi.string().max(500).allow('', null).optional(),
    colore: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional().messages({
      'string.pattern.base': 'Colore deve essere in formato hex (#RRGGBB)'
    }),
    attiva: Joi.boolean().optional()
  }).options({ stripUnknown: true }),

  // ============================================================================
  // SCHEMA UTILITY (INVARIATI)
  // ============================================================================
  dateRange: Joi.object({
    data_inizio: giorno().required(),
    data_fine: giorno().required()
  }),

  // ============================================================================
  // SCHEMA COLLEGAMENTO UTENTE <-> COMMERCIALISTA (workflow W1)
  // ============================================================================

  // Ambito che l'utente sceglie quando accetta una richiesta di collegamento.
  // Tutti i campi sono opzionali: assenti = accesso senza limiti.
  collegamentoAccetta: Joi.object({
    ambito_dal: giorno().allow(null).optional(),
    ambito_al: giorno().allow(null).optional(),
    conti_ammessi: Joi.array().items(Joi.number().integer().positive()).max(50).allow(null).optional()
  }).custom((v, helpers) => (v.ambito_dal && v.ambito_al && v.ambito_al < v.ambito_dal
    ? helpers.error('date.min') : v)).messages({
    'date.min': 'La data di fine ambito non puo\' precedere quella di inizio'
  }),

  collegamentoMotivo: Joi.object({
    motivo: Joi.string().max(500).allow('', null).optional()
  }),

  // Richiesta di collegamento avviata dal commercialista: username o email del
  // cliente. Nessun formato imposto oltre alla lunghezza — un username non e'
  // un'email, e scartare a priori quel che non ha la chiocciola escluderebbe meta'
  // dei casi legittimi.
  richiestaCollegamento: Joi.object({
    identificativo_cliente: Joi.string().trim().min(3).max(100).required()
      .messages({
        'string.empty': 'Indica username o email del cliente',
        'any.required': 'Indica username o email del cliente'
      })
  }),

  tokenInvito: Joi.object({
    giorni_validita: Joi.number().integer().min(1).max(30).default(7)
  }),

  // ============================================================================
  // SCHEMA PORTALE COMMERCIALISTI
  // ============================================================================

  // Il token e' generato da gen_random_bytes(32) in esadecimale: 64 caratteri.
  collegaCliente: Joi.object({
    token: Joi.string().trim().length(64).hex().required().messages({
      'string.length': 'Token non valido',
      'string.hex': 'Token non valido'
    })
  }),

  // Fase UX, blocco U1: selettore della controparte e elenco paginato.
  cercaAnagrafiche: Joi.object({
    q: Joi.string().trim().max(100).allow('').default(''),
    tipo: Joi.string().valid('Entrata', 'Uscita').optional(),
    limit: Joi.number().integer().min(1).max(50).default(20),
    solo_attive: Joi.boolean().default(true)
  }),
  elencoAnagrafiche: Joi.object({
    q: Joi.string().trim().max(100).allow('').default(''),
    lettera: Joi.string().pattern(/^([A-Z]|#)$/).optional(),
    tipologia_id: Joi.number().integer().min(1).max(2147483647).optional(),
    attivo: Joi.string().valid('true', 'false', 'tutte').default('tutte'),
    ordina: Joi.string().valid('nome', 'uso', 'recente').default('nome'),
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).max(1000000).default(0)
  }),

  paginazione: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(500).default(50)
  }),

  // Export lato commercialista. I campi personalizzati sono nomi di colonna:
  // vanno confinati a una whitelist, non accettati come stringhe libere.
  exportCommercialista: Joi.object({
    export_type: Joi.string().valid('commercialista', 'semplice', 'entrate', 'uscite', 'custom').required(),
    formato: Joi.string().valid('json', 'csv', 'xlsx', 'pdf').default('json'),
    campi_personalizzati: Joi.array().items(
      Joi.string().valid(
        'data', 'descrizione', 'importo', 'tipo', 'note', 'categoria',
        'anagrafica_nome', 'anagrafica_piva', 'anagrafica_email',
        'tipologia_nome', 'conto_nome'
      )
    ).optional(),
    conto_id: Joi.alternatives().try(Joi.number().integer().positive(), Joi.string().allow('')).optional(),
    data_inizio: giorno().optional(),
    data_fine: giorno().optional(),
    tutto_storico: Joi.boolean().default(false),
    ordina_per: Joi.string().valid('data', 'importo', 'anagrafica').default('data'),
    ordine: Joi.string().valid('asc', 'desc').default('desc')
  }),

  messaggioNuovo: Joi.object({
    messaggio: Joi.string().trim().min(1).max(5000).required().messages({
      'string.empty': 'Messaggio richiesto',
      'any.required': 'Messaggio richiesto'
    }),
    collegamento_id: Joi.number().integer().positive().optional(),
    movimento_id: Joi.number().integer().positive().allow(null).optional(),
    chiarimento: Joi.boolean().default(false)
  }),

  // Campi testuali del multipart di un allegato: il testo e' facoltativo.
  messaggioAllegato: Joi.object({
    messaggio: Joi.string().trim().max(5000).allow('').default(''),
    movimento_id: Joi.number().integer().positive().allow(null, '').optional(),
    chiarimento: Joi.boolean().truthy('1').falsy('0').default(false)
  }),

  chiarimentoStato: Joi.object({
    stato: Joi.string().valid('aperta', 'risolta').required()
  }),

  chiarimentiQuery: Joi.object({
    userId: Joi.number().integer().positive().optional(),
    collegamentoId: Joi.number().integer().positive().optional(),
    stato: Joi.string().valid('aperta', 'risolta').optional()
  }),

  // Account (blocco W6), stessi schemi per utenti e commercialisti
  passwordDimenticata: Joi.object({
    identificativo: Joi.string().trim().min(1).max(100).required()
      .messages({ 'any.required': 'Indica username o email', 'string.empty': 'Indica username o email' })
  }),
  passwordReimposta: Joi.object({
    token: tokenAccount,
    password: passwordNuova
  }),
  cambioPassword: Joi.object({
    currentPassword: Joi.string().max(200).required()
      .messages({ 'any.required': 'La password attuale e\' richiesta', 'string.empty': 'La password attuale e\' richiesta' }),
    newPassword: passwordNuova
  }),
  eliminaAccount: Joi.object({
    password: Joi.string().max(200).required()
      .messages({ 'any.required': 'La password e\' richiesta', 'string.empty': 'La password e\' richiesta' })
  }),
  cambioEmail: Joi.object({
    password: Joi.string().max(200).required()
      .messages({ 'any.required': 'La password e\' richiesta', 'string.empty': 'La password e\' richiesta' }),
    email: Joi.string().trim().email().max(100).required()
      .messages({ 'string.email': 'Email non valida', 'any.required': 'Email richiesta' })
  }),
  confermaEmail: Joi.object({
    token: tokenAccount
  }),
  // Registrazione dello studio (blocco K1): prima nessuna validazione.
  registrazioneCommercialista: Joi.object({
    username: Joi.string().trim().min(3).max(50).pattern(/^[a-zA-Z0-9_.-]+$/).required()
      .messages({ 'string.pattern.base': 'Username: solo lettere, numeri, punto, trattino e underscore',
                  'string.min': 'Username di almeno 3 caratteri', 'any.required': 'Username richiesto' }),
    password: passwordRegistrazione,
    email: Joi.string().trim().email().max(100).required()
      .messages({ 'string.email': 'Email non valida', 'any.required': 'Email richiesta' }),
    ragione_sociale: Joi.string().trim().max(200).allow('', null).optional(),
    partita_iva: Joi.string().trim().pattern(/^[0-9]{11}$/).allow('', null).optional()
      .messages({ 'string.pattern.base': 'La partita IVA ha 11 cifre' }),
    telefono: Joi.string().trim().max(20).pattern(/^[0-9 +().-]*$/).allow('', null).optional()
      .messages({ 'string.pattern.base': 'Telefono non valido' })
  }),

  // Tema e aspetto dell'account (blocco U2): almeno uno dei due, solo i valori
  // della migrazione 013, minuscoli. null e stringa vuota rifiutati.
  preferenze: Joi.object({
    tema: Joi.string().valid('registro', 'bottega')
      .messages({ 'any.only': 'Tema non valido (registro, bottega)' }),
    aspetto: Joi.string().valid('chiaro', 'scuro', 'automatico')
      .messages({ 'any.only': 'Aspetto non valido (chiaro, scuro, automatico)' }),
    vista_estratto: Joi.string().valid('due_righe', 'colonne', 'iniziali', 'mastro')
      .messages({ 'any.only': 'Vista non valida (due_righe, colonne, iniziali, mastro)' })
  }).or('tema', 'aspetto', 'vista_estratto').options({ stripUnknown: true }),

  profiloCommercialista: Joi.object({
    ragione_sociale: Joi.string().trim().max(200).allow('', null).optional(),
    partita_iva: Joi.string().trim().pattern(/^[0-9]{11}$/).allow('', null).optional()
      .messages({ 'string.pattern.base': 'La partita IVA ha 11 cifre' }),
    telefono: Joi.string().trim().max(20).pattern(/^[0-9 +().-]*$/).allow('', null).optional()
      .messages({ 'string.pattern.base': 'Telefono non valido' })
  }).min(1),

  messaggiQuery: Joi.object({
    userId: Joi.number().integer().positive().optional(),
    collegamentoId: Joi.number().integer().positive().optional(),
    limit: Joi.number().integer().min(1).max(200).default(50),
    offset: Joi.number().integer().min(0).default(0)
  })
};

// Middleware per validazione con debug dettagliato (INVARIATO)
const validate = (schema) => {
  return (req, res, next) => {

    const { error, value } = schema.validate(req.body, { 
      stripUnknown: true,
      abortEarly: false,
      allowUnknown: false
    });
    
    if (error) {
      // Nel log solo campo e tipo di errore: MAI il valore ne' il messaggio di
      // Joi, che per alcune regole (pattern, valid) lo riporta tra virgolette.
      // Un token d'invito malformato finiva qui in chiaro, aggirando l'hash.
      console.log('❌ Validation failed:', {
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          type: detail.type
        }))
      });

      return res.status(400).json({ 
        error: 'Dati non validi', 
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    
    req.body = value;
    next();
  };
};

// Middleware per validazione parametri query (INVARIATO)
const validateQuery = (schema) => {
  return (req, res, next) => {

    const { error, value } = schema.validate(req.query, {
      stripUnknown: true,
      abortEarly: false
    });
    
    if (error) {
      console.log('❌ Query validation failed:', {
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          type: detail.type
        }))
      });

      return res.status(400).json({ 
        error: 'Parametri query non validi', 
        details: error.details.map(detail => detail.message)
      });
    }
    
    req.query = value;
    next();
  };
};

// Middleware per validazione parametri URL (INVARIATO)
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params);
    
    if (error) {
      return res.status(400).json({ 
        error: 'Parametri URL non validi', 
        details: error.details.map(detail => detail.message)
      });
    }
    
    req.params = value;
    next();
  };
};

module.exports = {
  giorno,
  validate,
  validateQuery,
  validateParams,
  schemas
};