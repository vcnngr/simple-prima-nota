// services/PreferenzeService.js — tema e aspetto dell'account (blocco U2).
//
// La tabella viene da una mappa fissa, mai dall'input: il tipo e' quello del
// token gia' verificato dal middleware. I valori ammessi stanno anche nei CHECK
// della migrazione 013 e nello schema Joi `preferenze`.
const { queryOne } = require('../config/database');
const { logErrore } = require('../utils/errori');

const TABELLE = { user: 'utenti', commercialista: 'commercialisti' };
const TEMI = ['registro', 'bottega'];
const ASPETTI = ['chiaro', 'scuro', 'automatico'];

function tabella(tipo) {
  const t = TABELLE[tipo];
  if (!t) throw new Error('tipo di account non valido');
  return t;
}

async function leggi(tipo, id) {
  return queryOne(`SELECT tema, aspetto FROM ${tabella(tipo)} WHERE id = $1`, [id]);
}

// Aggiorna solo i campi presenti; restituisce le preferenze dopo la modifica.
async function salva(tipo, id, { tema, aspetto }) {
  return queryOne(
    `UPDATE ${tabella(tipo)}
        SET tema = COALESCE($2, tema), aspetto = COALESCE($3, aspetto)
      WHERE id = $1
      RETURNING tema, aspetto`,
    [id, tema ?? null, aspetto ?? null]
  );
}

// Per login e profilo: le preferenze non devono mai bloccare l'accesso. Se non
// si leggono (schema sotto la 013 dopo un rollback, errore del database) la
// risposta porta `null` e il frontend usa i predefiniti.
async function perRisposta(tipo, id) {
  try {
    return await leggi(tipo, id);
  } catch (error) {
    logErrore('Preferenze non lette', error);
    return null;
  }
}

module.exports = { leggi, salva, perRisposta, TEMI, ASPETTI };
