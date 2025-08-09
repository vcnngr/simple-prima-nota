// ==============================================================================
// FILE: backend/middleware/validation.js - VERSIONE FLESSIBILE
// POSIZIONE: backend/middleware/validation.js (SOSTITUISCI COMPLETAMENTE)
// ==============================================================================

const Joi = require('joi');

const schemas = {
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
    nome: Joi.string().max(100).required().messages({
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
    nome: Joi.string().max(100).optional().messages({
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
    data: Joi.date().required(),
    anagrafica_id: Joi.number().integer().allow(null).optional(),
    conto_id: Joi.number().integer().required(),
    descrizione: Joi.string().max(255).required(),
    categoria: Joi.string().max(100).allow('', null).optional(),
    importo: Joi.number().positive().precision(2).required(),
    tipo: Joi.string().valid('Entrata', 'Uscita').required(),
    note: Joi.string().allow('', null).optional()
  }).options({ stripUnknown: true }),

  movimentoUpdate: Joi.object({
    data: Joi.date().optional(),
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
  // SCHEMA UTILITY (INVARIATI)
  // ============================================================================
  dateRange: Joi.object({
    data_inizio: Joi.date().required(),
    data_fine: Joi.date().required()
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
          message: detail.message
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
  validate,
  validateQuery,
  validateParams,
  schemas
};