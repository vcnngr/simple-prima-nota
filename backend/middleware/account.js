// middleware/account.js
// Reset della password (blocco W6): tetto per IP e risposta uniforme.
const rateLimit = require('express-rate-limit');
const account = require('../services/AccountService');

// Chi prova a indovinare account o a far partire mail a raffica si ferma qui.
// Il tetto per account (una mail ogni ACCOUNT_MAIL_ATTESA_SEC) e' nel servizio.
const limiteResetPassword = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RESET_PASSWORD_LIMITE, 10) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Troppe richieste di reimpostazione. Riprova piu\' tardi.' }
});

// Si risponde prima di cercare l'account: stessa risposta e stessi tempi che
// l'account esista o no. Token e mail si fanno dopo, e un errore resta nei log.
const rispondiResetAccolto = (tipo) => (req, res) => {
  res.status(202).json({
    success: true,
    message: 'Se l\'account esiste, riceverai una mail con le istruzioni per reimpostare la password.'
  });
  setImmediate(() => {
    account.richiediReset(tipo, req.body.identificativo)
      .catch(err => console.error(`reset password ${tipo}: errore (${err.code || 'ERRORE'})`));
  });
};

module.exports = { limiteResetPassword, rispondiResetAccolto };
