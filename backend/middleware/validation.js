// ==============================================================================
// FILE: backend/middleware/validation.js
// POSIZIONE: backend/middleware/validation.js (SOSTITUISCI COMPLETAMENTE)
// ==============================================================================

const Joi = require('joi');

const schemas = {
  // ============================================================================
  // SCHEMA UTENTI E AUTH
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
    password: Joi.string()
      .min(6)
      .required()
      .messages({
        'string.min': 'Password deve essere di almeno 6 caratteri',
        'any.required': 'Password è richiesta'
      }),
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
  // SCHEMA CONTI BANCARI
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
  // SCHEMA ANAGRAFICHE (AGGIORNATI)
  // ============================================================================
  anagrafica: Joi.object({
    nome: Joi.string().max(100).required(),
    tipo: Joi.string().valid('Cliente', 'Fornitore').required(),
    categoria: Joi.string().max(100).allow('', null).optional(), // ✅ LIBERA
    email: Joi.string().email().allow('', null).optional(),
    telefono: Joi.string().max(20).allow('', null).optional(),
    piva: Joi.string().max(20).allow('', null).optional(),
    indirizzo: Joi.string().allow('', null).optional(),
    attivo: Joi.boolean().default(true)
  }).options({ stripUnknown: true }),

  anagraficaUpdate: Joi.object({
    nome: Joi.string().max(100).optional(),
    tipo: Joi.string().valid('Cliente', 'Fornitore').optional(),
    categoria: Joi.string().max(100).allow('', null).optional(), // ✅ LIBERA
    email: Joi.string().email().allow('', null).optional(),
    telefono: Joi.string().max(20).allow('', null).optional(),
    piva: Joi.string().max(20).allow('', null).optional(),
    indirizzo: Joi.string().allow('', null).optional(),
    attivo: Joi.boolean().optional()
  }).options({ stripUnknown: true }),

  // ============================================================================
  // SCHEMA MOVIMENTI (AGGIORNATI)
  // ============================================================================
  movimento: Joi.object({
    data: Joi.date().required(),
    anagrafica_id: Joi.number().integer().allow(null).optional(),
    conto_id: Joi.number().integer().required(),
    descrizione: Joi.string().max(255).required(),
    categoria: Joi.string().max(100).allow('', null).optional(), // ✅ NUOVO CAMPO
    importo: Joi.number().positive().precision(2).required(),
    tipo: Joi.string().valid('Entrata', 'Uscita').required(),
    note: Joi.string().allow('', null).optional()
  }).options({ stripUnknown: true }),

  movimentoUpdate: Joi.object({
    data: Joi.date().optional(),
    anagrafica_id: Joi.number().integer().allow(null).optional(),
    conto_id: Joi.number().integer().optional(),
    descrizione: Joi.string().max(255).optional(),
    categoria: Joi.string().max(100).allow('', null).optional(), // ✅ NUOVO CAMPO
    importo: Joi.number().positive().precision(2).optional(),
    tipo: Joi.string().valid('Entrata', 'Uscita').optional(),
    note: Joi.string().allow('', null).optional()
  }).options({ stripUnknown: true }),

  // ============================================================================
  // SCHEMA CATEGORIE ANAGRAFICHE (NUOVI)
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
  // SCHEMA CATEGORIE MOVIMENTI (NUOVI)
  // ============================================================================
  categoriaMovimento: Joi.object({
    nome: Joi.string().max(100).required().messages({
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
    nome: Joi.string().max(100).optional().messages({
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
  // SCHEMA UTILITY
  // ============================================================================
  dateRange: Joi.object({
    data_inizio: Joi.date().required(),
    data_fine: Joi.date().required()
  })
};

// Middleware per validazione con debug dettagliato
const validate = (schema) => {
  return (req, res, next) => {
    console.log('🔍 VALIDATION DEBUG:', {
      url: req.url,
      method: req.method,
      body: req.body,
      bodySize: JSON.stringify(req.body).length,
      timestamp: new Date().toISOString()
    });

    const { error, value } = schema.validate(req.body, { 
      stripUnknown: true,
      abortEarly: false,
      allowUnknown: false
    });
    
    if (error) {
      console.log('❌ Validation failed:', {
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
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
    
    console.log('✅ Validation passed:', {
      validatedFields: Object.keys(value),
      cleanedData: value
    });
    
    req.body = value;
    next();
  };
};

// Middleware per validazione parametri query
const validateQuery = (schema) => {
  return (req, res, next) => {
    console.log('🔍 QUERY VALIDATION:', {
      url: req.url,
      query: req.query
    });

    const { error, value } = schema.validate(req.query, {
      stripUnknown: true,
      abortEarly: false
    });
    
    if (error) {
      console.log('❌ Query validation failed:', {
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });

      return res.status(400).json({ 
        error: 'Parametri query non validi', 
        details: error.details.map(detail => detail.message)
      });
    }
    
    console.log('✅ Query validation passed:', value);
    req.query = value;
    next();
  };
};

// Middleware per validazione parametri URL
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
  validate,
  validateQuery,
  validateParams,
  schemas
};