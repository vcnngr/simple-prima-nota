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
    console.error('❌ Database query error', { text, params, error: error.message });
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
