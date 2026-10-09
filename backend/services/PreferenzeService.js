// services/PreferenzeService.js — tema, aspetto (blocco U2) e vista dell'Estratto
// (blocco U4) dell'account.
//
// La tabella viene da una mappa fissa, mai dall'input: il tipo e' quello del
// token gia' verificato dal middleware. I valori ammessi stanno anche nei CHECK
// delle migrazioni 013 e 014 e nello schema Joi `preferenze`.
const { queryOne } = require('../config/database');
const { logErrore } = require('../utils/errori');

const TABELLE = { user: 'utenti', commercialista: 'commercialisti' };
const TEMI = ['registro', 'bottega'];
const ASPETTI = ['chiaro', 'scuro', 'automatico'];
const VISTE = ['due_righe', 'colonne', 'iniziali', 'mastro'];

function tabella(tipo) {
  const t = TABELLE[tipo];
  if (!t) throw new Error('tipo di account non valido');
  return t;
}

async function leggi(tipo, id) {
  return queryOne(`SELECT tema, aspetto, vista_estratto FROM ${tabella(tipo)} WHERE id = $1`, [id]);
}

// Aggiorna solo i campi presenti; restituisce le preferenze dopo la modifica.
async function salva(tipo, id, { tema, aspetto, vista_estratto }) {
  return queryOne(
    `UPDATE ${tabella(tipo)}
        SET tema = COALESCE($2, tema), aspetto = COALESCE($3, aspetto),
            vista_estratto = COALESCE($4, vista_estratto)
      WHERE id = $1
      RETURNING tema, aspetto, vista_estratto`,
    [id, tema ?? null, aspetto ?? null, vista_estratto ?? null]
  );
}

// Per login e profilo: le preferenze non devono mai bloccare l'accesso. Se non
// si leggono (schema sotto la 013 o la 014 dopo un rollback, errore del database) la
// risposta porta `null` e il frontend usa i predefiniti.
async function perRisposta(tipo, id) {
  try {
    return await leggi(tipo, id);
  } catch (error) {
    logErrore('Preferenze non lette', error);
    return null;
  }
}

module.exports = { leggi, salva, perRisposta, TEMI, ASPETTI, VISTE };
