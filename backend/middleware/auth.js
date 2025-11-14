// middleware/auth.js
const jwt = require('jsonwebtoken');
const { queryOne } = require('../config/database');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Accesso negato. Token non fornito.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verifica se l'utente esiste ancora
    const user = await queryOne(
      'SELECT id, username, email FROM utenti WHERE id = $1',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'Token non valido.' });
    }

    req.user = user;
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check tipo field in token to determine which table to query
    if (decoded.tipo === 'commercialista') {
      // Search only in commercialisti table
      const commercialista = await queryOne(
        'SELECT id, username, email, ragione_sociale FROM commercialisti WHERE id = $1',
        [decoded.id]
      );

      if (commercialista) {
        req.commercialista = commercialista;
        req.userType = 'commercialista';
        return next();
      }
    } else {
      // Search in utenti table (default for tokens without tipo field)
      const user = await queryOne(
        'SELECT id, username, email FROM utenti WHERE id = $1',
        [decoded.id]
      );

      if (user) {
        req.user = user;
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

