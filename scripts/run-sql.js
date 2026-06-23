// Rulează un fișier .sql pe baza de date configurată în .env
// Folosire: node scripts/run-sql.js db/schema.sql
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import config from '../src/config.js';

const file = process.argv[2];
if (!file) {
  console.error('Folosire: node scripts/run-sql.js <fisier.sql>');
  process.exit(1);
}

const sql = await readFile(resolve(process.cwd(), file), 'utf8');

const pool = new pg.Pool(
  config.db.connectionString
    ? { connectionString: config.db.connectionString, ssl: config.db.ssl }
    : config.db
);

try {
  console.log(`▶  Rulez ${file} pe baza "${config.db.database}"...`);
  await pool.query(sql);
  console.log('✔  Gata.');
} catch (err) {
  console.error('✘  Eroare SQL:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
