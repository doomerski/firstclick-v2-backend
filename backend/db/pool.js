/**
 * PostgreSQL Connection Pool – Shared Singleton
 *
 * Usage:
 *   const { pool, query } = require('./db/pool');
 *   const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
 *
 * The pool is created once and reused across the application.
 */

const { Pool } = require('pg');
const ENV = require('../config/env');
const logger = require('../lib/logger');

const pool = new Pool({
  connectionString: ENV.databaseUrl,
  max: ENV.pgPoolMax,
  idleTimeoutMillis: ENV.pgIdleTimeoutMs,
  connectionTimeoutMillis: 5000,
  // Enable SSL for managed databases in production
  ssl: ENV.isProduction ? { rejectUnauthorized: false } : false
});

// Log unexpected errors on idle clients
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

// Convenience wrapper for simple queries
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug({ query: text, duration, rows: result.rowCount }, 'Executed query');
    return result;
  } catch (err) {
    logger.error({ err, query: text }, 'Query error');
    throw err;
  }
}

// Graceful shutdown helper
async function closePool() {
  logger.info('Closing PostgreSQL pool...');
  await pool.end();
  logger.info('PostgreSQL pool closed');
}

module.exports = { pool, query, closePool };
