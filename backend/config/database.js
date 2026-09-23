// config/database.js
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'prima_nota',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password123',
  max: 20, // max number of clients in the pool
  min: 2, // minimum number of clients in the pool
  idleTimeoutMillis: 600000, // close idle clients after 10 minutes (not 30 seconds)
  connectionTimeoutMillis: 10000, // return an error after 10 seconds (not 2)
  keepAlive: true, // keep connections alive
  keepAliveInitialDelayMillis: 10000, // delay before first keepalive
});

// Test connection
pool.on('connect', (client) => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle client', err);
  // Don't exit - let the pool handle reconnection
});

// Helper function for transactions
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Forma dei parametri, non valori: tipo e lunghezza bastano a capire quale
// chiamata e' fallita senza scrivere in chiaro cio' che stiamo proteggendo.
const descriviParametri = (params) => {
  if (!Array.isArray(params)) return params === undefined ? [] : ['<non-array>'];
  return params.map((v) => {
    if (v === null || v === undefined) return 'null';
    if (Array.isArray(v)) return `array(${v.length})`;
    if (v instanceof Date) return 'date';
    const t = typeof v;
    if (t === 'string') return `string(${v.length})`;
    return t;
  });
};

// Helper function for queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Query executed', { text, duration, rows: res.rowCount });
    }
    
    return res;
  } catch (error) {
    // I parametri NON si stampano. Qui passano segreti in chiaro: il token di
    // invito arriva come $1 di usa_token_invito, e ogni token rifiutato
    // (revocato, gia' usato, scaduto) fa sollevare un'eccezione. Stampandoli,
    // il valore in chiaro finiva nei log e ci restava: l'hash in tabella non
    // serviva piu' a niente. Si tiene solo la forma degli argomenti.
    console.error('❌ Database query error', {
      text,
      params: descriviParametri(params),
      error: error.message
    });
    throw error;
  }
};

// Helper function to get single row
const queryOne = async (text, params) => {
  const res = await query(text, params);
  return res.rows[0] || null;
};

// Helper function to get all rows
const queryAll = async (text, params) => {
  const res = await query(text, params);
  return res.rows;
};

module.exports = {
  pool,
  query,
  queryOne,
  queryAll,
  withTransaction
};
