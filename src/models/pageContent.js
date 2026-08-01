// ═══════════════════════════════════════════════════════════════════
//  Conținutul editabil al paginilor statice (tabelul `page_content`).
//  Sursa de adevăr; fișierele din public/ sunt rescrise din ea.
//  Vezi src/services/pageEditor.js pentru motivul acestei separări.
// ═══════════════════════════════════════════════════════════════════
import { query } from '../db.js';

/** Suprascrierile salvate pentru o pagină: { key: value }. */
export async function getPageOverrides(page) {
  const { rows } = await query('SELECT key, value FROM page_content WHERE page = $1', [page]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Toate suprascrierile, grupate pe pagină — pentru `npm run apply-content`. */
export async function getAllOverrides() {
  const { rows } = await query('SELECT page, key, value FROM page_content ORDER BY page, key');
  const out = {};
  for (const r of rows) (out[r.page] ||= {})[r.key] = r.value;
  return out;
}

/** Upsert pe (page, key). `values` = { key: value }. */
export async function savePageOverrides(page, values) {
  const entries = Object.entries(values);
  if (!entries.length) return 0;
  for (const [key, value] of entries) {
    await query(
      `INSERT INTO page_content (page, key, value) VALUES ($1, $2, $3)
       ON CONFLICT (page, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [page, key, value]
    );
  }
  return entries.length;
}

/** Șterge suprascrierea → pagina revine la textul din fișierul original. */
export async function resetPageKey(page, key) {
  const { rowCount } = await query('DELETE FROM page_content WHERE page = $1 AND key = $2', [page, key]);
  return rowCount;
}
