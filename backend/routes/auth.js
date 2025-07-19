// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, queryOne } = require('../config/database');
const { validate, schemas } = require('../middleware/validation');
const auth = require('../middleware/auth');

const router = express.Router();

// Registrazione utente
router.post('/register', validate(schemas.user), async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    // Verifica se l'utente esiste già
    const existingUser = await queryOne(
      'SELECT id FROM utenti WHERE username = $1 OR email = $2',
      [username, email]
    );
    
    if (existingUser) {
      return res.status(400).json({ error: 'Username o email già in uso' });
    }
    
    // Hash della password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Inserimento utente
    const result = await query(
      'INSERT INTO utenti (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, hashedPassword, email]
    );
    
    const user = result.rows[0];
    
    // Generazione token JWT
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      message: 'Utente registrato con successo',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Errore durante la registrazione' });
  }
});

// Login utente
router.post('/login', validate(schemas.login), async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Trova l'utente
    const user = await queryOne(
      'SELECT id, username, email, password_hash FROM utenti WHERE username = $1',
      [username]
    );
    
    if (!user) {
      return res.status(400).json({ error: 'Credenziali non valide' });
    }
    
    // Verifica password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Credenziali non valide' });
    }
    
    // Generazione token JWT
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Login effettuato con successo',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Errore durante il login' });
  }
});

// Verifica token
router.get('/verify', auth, async (req, res) => {
  try {
    res.json({
      valid: true,
      user: req.user
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Errore durante la verifica del token' });
  }
});

// Profilo utente
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await queryOne(
      'SELECT id, username, email, created_at FROM utenti WHERE id = $1',
      [req.user.id]
    );
    
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Errore durante il caricamento del profilo' });
  }
});

// Cambio password
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Password corrente e nuova password sono richieste' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La nuova password deve essere di almeno 6 caratteri' });
    }
    
    // Verifica password corrente
    const user = await queryOne(
      'SELECT password_hash FROM utenti WHERE id = $1',
      [req.user.id]
    );
    
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Password corrente non corretta' });
    }
    
    // Hash nuova password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Aggiorna password
    await query(
      'UPDATE utenti SET password_hash = $1 WHERE id = $2',
      [hashedPassword, req.user.id]
    );
    
    res.json({ message: 'Password cambiata con successo' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Errore durante il cambio password' });
  }
});

module.exports = router;
