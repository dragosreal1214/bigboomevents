// Pool PostgreSQL + helperi de interogare.
import pg from 'pg';
import config from './config.js';

// Prețurile sunt INT (bani) — evităm parsarea ca string.
const pool = new pg.Pool(
  config.db.connectionString
    ? {
        connectionString: config.db.connectionString,
        ssl: config.db.ssl,
        max: config.db.max,
      }
    : { ...config.db }
);

pool.on('error', (err) => {
  // Nu lăsa o eroare de pe un client idle să dărâme procesul.
  console.error('[db] eroare client idle:', err.message);
});

export const query = (text, params) => pool.query(text, params);

// Rulează o funcție într-o tranzacție; face rollback automat la eroare.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignoră eroarea de rollback */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function healthCheck() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

export async function close() {
  await pool.end();
}

export default pool;
