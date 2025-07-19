// middleware/validation.js
const Joi = require('joi');

// Schema di validazione comuni
const schemas = {
  user: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(6).required(),
    email: Joi.string().email().required()
  }),

  login: Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required()
  }),

  contoBancario: Joi.object({
    nome_banca: Joi.string().max(100).required(),
    intestatario: Joi.string().max(100).required(),
    iban: Joi.string().max(34).allow(''),
    saldo_iniziale: Joi.number().precision(2).default(0),
    attivo: Joi.boolean().default(true)
  }),

  anagrafica: Joi.object({
    nome: Joi.string().max(100).required(),
    tipo: Joi.string().valid('Cliente', 'Fornitore').required(),
    categoria: Joi.string().max(50).allow(''),
    email: Joi.string().email().allow(''),
    telefono: Joi.string().max(20).allow(''),
    piva: Joi.string().max(20).allow(''),
    indirizzo: Joi.string().allow(''),
    attivo: Joi.boolean().default(true)
  }),

  movimento: Joi.object({
    data: Joi.date().required(),
    anagrafica_id: Joi.number().integer().allow(null),
    conto_id: Joi.number().integer().required(),
    descrizione: Joi.string().required(),
    importo: Joi.number().positive().precision(2).required(),
    tipo: Joi.string().valid('Entrata', 'Uscita').required(),
    note: Joi.string().allow('')
  }),

  movimentoUpdate: Joi.object({
    data: Joi.date(),
    anagrafica_id: Joi.number().integer().allow(null),
    conto_id: Joi.number().integer(),
    descrizione: Joi.string(),
    importo: Joi.number().positive().precision(2),
    tipo: Joi.string().valid('Entrata', 'Uscita'),
    note: Joi.string().allow('')
  }),

  dateRange: Joi.object({
    data_inizio: Joi.date().required(),
    data_fine: Joi.date().required()
  })
};

// Middleware per validazione
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Dati non validi', 
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

// Middleware per validazione parametri query
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
