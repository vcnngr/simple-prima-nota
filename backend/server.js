// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const contiBancariRoutes = require('./routes/contiBancari');
const anagraficheRoutes = require('./routes/anagrafiche');
const movimentiRoutes = require('./routes/movimenti');
const dashboardRoutes = require('./routes/dashboard');
const reportsRoutes = require('./routes/reports');
const categorieAnagraficheRoutes = require('./routes/categorieAnagrafiche');
const categorieMovimentiRoutes = require('./routes/categorieMovimenti');
const alertsRoutes = require('./routes/alerts');
const exportRoutes = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1); // Trust first proxy

// Crea la directory logs se non esiste
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Configurazione logging
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, 'access.log'), 
  { flags: 'a' }
);

// Formato di log personalizzato simile a nginx
morgan.token('real-ip', (req) => {
  return req.headers['x-forwarded-for'] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null);
});

const logFormat = ':real-ip - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';

// Logging middleware
if (process.env.NODE_ENV === 'production') {
  // In produzione, logga solo su file
  app.use(morgan(logFormat, { stream: accessLogStream }));
} else {
  // In sviluppo, logga sia su console che su file
  app.use(morgan('dev')); // Console: formato colorato e conciso
  app.use(morgan(logFormat, { stream: accessLogStream })); // File: formato completo
}

// Middleware di sicurezza
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 100, // max 100 richieste per IP ogni 15 minuti
  message: 'Troppe richieste da questo IP, riprova più tardi.'
});
app.use('/api/', limiter);

// Middleware per parsing JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/conti-bancari', contiBancariRoutes);
app.use('/api/anagrafiche', anagraficheRoutes);
app.use('/api/movimenti', movimentiRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/categorie-anagrafiche', categorieAnagraficheRoutes);
app.use('/api/categorie-movimenti', categorieMovimentiRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/export', exportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  // Log degli errori
  const errorLog = `${new Date().toISOString()} - ERROR: ${err.stack}\n`;
  fs.appendFileSync(path.join(logsDir, 'error.log'), errorLog);
  
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Errore interno del server',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Si è verificato un errore'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint non trovato' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  accessLogStream.end(); // Chiudi il stream dei log
  server.close(() => {
    console.log('HTTP server closed');
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
  console.log(`📝 Logs saved to: ${path.join(logsDir, 'access.log')}`);
});

module.exports = app;
