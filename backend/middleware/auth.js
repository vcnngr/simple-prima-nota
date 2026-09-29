// middleware/auth.js
const { queryOne } = require('../config/database');
const { versioneValida, verificaJwt } = require('../services/AccountService');

// La versione delle credenziali serve solo al confronto con il claim `cv`: un
// cambio o reset della password la incrementa e chiude le altre sessioni.
function senzaVersione(riga) {
  const { versione_credenziali, ...resto } = riga;
  return resto;
}

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Accesso negato. Token non fornito.' });
    }

    const decoded = verificaJwt(token);
    // Il token di uno studio non apre le rotte dell'utente con lo stesso id.
    if (decoded.tipo !== 'user') {
      return res.status(401).json({ error: 'Token non valido.' });
    }

    // Verifica se l'utente esiste ancora
    const user = await queryOne(
      'SELECT id, username, email, versione_credenziali FROM utenti WHERE id = $1',
      [decoded.id]
    );

    if (!user || !versioneValida(decoded, user)) {
      return res.status(401).json({ error: 'Token non valido.' });
    }

    req.user = senzaVersione(user);
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Token non valido.' });
  }
};

// Auth middleware that accepts both users and commercialisti
const authEither = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Accesso negato. Token non fornito.' });
    }

    const decoded = verificaJwt(token);

    // Il tipo del token decide la tabella: mai l'una al posto dell'altra.
    if (decoded.tipo === 'commercialista') {
      // Search only in commercialisti table
      const commercialista = await queryOne(
        'SELECT id, username, email, ragione_sociale, versione_credenziali FROM commercialisti WHERE id = $1 AND eliminato_il IS NULL',
        [decoded.id]
      );

      if (commercialista && versioneValida(decoded, commercialista)) {
        req.commercialista = senzaVersione(commercialista);
        req.userType = 'commercialista';
        return next();
      }
    } else {
      // tipo === 'user'
      const user = await queryOne(
        'SELECT id, username, email, versione_credenziali FROM utenti WHERE id = $1',
        [decoded.id]
      );

      if (user && versioneValida(decoded, user)) {
        req.user = senzaVersione(user);
        req.userType = 'user';
        return next();
      }
    }

    return res.status(401).json({ error: 'Token non valido.' });
  } catch (error) {
    console.error('AuthEither middleware error:', error);
    res.status(401).json({ error: 'Token non valido.' });
  }
};

module.exports = { auth, authEither };

