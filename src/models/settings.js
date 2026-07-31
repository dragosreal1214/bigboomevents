// ═══════════════════════════════════════════════════════════════════
//  Setări site (tabelul `settings`: cheie TEXT → value JSONB).
//  Folosit pentru bannerul promo din capul paginii (cheia 'banner').
// ═══════════════════════════════════════════════════════════════════
import { query } from '../db.js';

// Config implicit pentru banner (dacă rândul lipsește din DB).
export const BANNER_DEFAULT = {
  enabled: false,
  text: 'Livrare gratuită la comenzi peste 500 lei',
  bgColor: '#111111',
  textColor: '#ffffff',
  speed: 30, // secunde pentru o buclă completă (mai mic = mai rapid)
};

export async function getSetting(key, fallback = null) {
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : fallback;
}

export async function setSetting(key, value) {
  const { rows } = await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
     RETURNING value`,
    [key, JSON.stringify(value)]
  );
  return rows[0].value;
}

// Bannerul, cu valorile implicite completate peste ce e în DB.
export async function getBanner() {
  const stored = await getSetting('banner', {});
  return { ...BANNER_DEFAULT, ...(stored || {}) };
}
