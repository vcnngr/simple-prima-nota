const Joi = require('joi');

const schemas = {
  // Schema per registrazione (rimane uguale)
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

  // ✅ CONTO BANCARIO - CREATE (tutti i campi richiesti)
  contoBancario: Joi.object({
    nome_banca: Joi.string().max(100).required(),
    intestatario: Joi.string().max(100).required(),
    iban: Joi.string().max(34).allow('', null),
    saldo_iniziale: Joi.number().precision(2).default(0),
    attivo: Joi.boolean().default(true)
  }).options({ stripUnknown: true }),

  // ✅ CONTO BANCARIO - UPDATE (tutti i campi opzionali)
  contoBancarioUpdate: Joi.object({
    nome_banca: Joi.string().max(100).optional(),
    intestatario: Joi.string().max(100).optional(),
    iban: Joi.string().max(34).allow('', null).optional(),
    saldo_iniziale: Joi.number().precision(2).optional(),
    attivo: Joi.boolean().optional()
  }).options({ stripUnknown: true }),

  // ✅ ANAGRAFICA - CREATE
  anagrafica: Joi.object({
    nome: Joi.string().max(100).required(),
    tipo: Joi.string().valid('Cliente', 'Fornitore').required(),
    categoria: Joi.string().max(50).allow('', null).optional(),
    email: Joi.string().email().allow('', null).optional(),
    telefono: Joi.string().max(20).allow('', null).optional(),
    piva: Joi.string().max(20).allow('', null).optional(),
    indirizzo: Joi.string().allow('', null).optional(),
    attivo: Joi.boolean().default(true)
  }).options({ stripUnknown: true }),

  // ✅ ANAGRAFICA - UPDATE  
  anagraficaUpdate: Joi.object({
    nome: Joi.string().max(100).optional(),
    tipo: Joi.string().valid('Cliente', 'Fornitore').optional(),
    categoria: Joi.string().max(50).allow('', null).optional(),
    email: Joi.string().email().allow('', null).optional(),
    telefono: Joi.string().max(20).allow('', null).optional(),
    piva: Joi.string().max(20).allow('', null).optional(),
    indirizzo: Joi.string().allow('', null).optional(),
    attivo: Joi.boolean().optional()
  }).options({ stripUnknown: true }),

  // ✅ MOVIMENTO - CREATE
  movimento: Joi.object({
    data: Joi.date().required(),
    anagrafica_id: Joi.number().integer().allow(null).optional(),
    conto_id: Joi.number().integer().required(),
    descrizione: Joi.string().max(255).required(),
    importo: Joi.number().positive().precision(2).required(),
    tipo: Joi.string().valid('Entrata', 'Uscita').required(),
    note: Joi.string().allow('', null).optional()
  }).options({ stripUnknown: true }),

  // ✅ MOVIMENTO - UPDATE
  movimentoUpdate: Joi.object({
    data: Joi.date().optional(),
    anagrafica_id: Joi.number().integer().allow(null).optional(),
    conto_id: Joi.number().integer().optional(),
    descrizione: Joi.string().max(255).optional(),
    importo: Joi.number().positive().precision(2).optional(),
    tipo: Joi.string().valid('Entrata', 'Uscita').optional(),
    note: Joi.string().allow('', null).optional()
  }).options({ stripUnknown: true }),

  // Altri schema
  dateRange: Joi.object({
    data_inizio: Joi.date().required(),
    data_fine: Joi.date().required()
  })
};

// Middleware per validazione con debug
const validate = (schema) => {
  return (req, res, next) => {
    console.log('🔍 VALIDATION DEBUG:', {
      url: req.url,
      method: req.method,
      body: req.body,
      schemaName: schema._ids?._byKey?.get('root')?.id || 'unknown'
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
          value: detail.context?.value
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
    
    console.log('✅ Validation passed:', value);
    req.body = value;
    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({ 
        error: 'Parametri query non validi', 
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

module.exports = {
  validate,
  validateQuery,
  schemas
};