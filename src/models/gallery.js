// Galeria foto de pe pagina Evenimente.
//
// Pozele nu sunt legate de produse sau de paginile de decorațiuni: sunt o listă
// proprie, administrată din panou (tabul „Galerie"). Cele inițiale se importă
// din `public/js/decoratiuni-data.js` cu `scripts/seed-gallery.js`, ca pagina
// să pornească plină, nu goală.
//
// `url` e UNIQUE în DB: adăugarea aceleiași poze de două ori (re-rularea
// importului, sau clientul care încarcă din nou același fișier) nu duplică
// rândul, ci actualizează textul alternativ.
import { query, withTransaction } from '../db.js';

const mapImage = (r) => ({
  id: r.id,
  url: r.url,
  alt: r.alt || '',
  tag: r.tag || null,
  sortOrder: r.sort_order,
  isActive: r.is_active,
});

/** Public: doar pozele active, în ordinea din panou. */
export async function listGallery(tag = null) {
  const { rows } = await query(
    `SELECT * FROM gallery_images
      WHERE is_active = TRUE AND ($1::text IS NULL OR tag = $1)
      ORDER BY sort_order, id`,
    [tag]
  );
  return rows.map(mapImage);
}

/** Etichetele folosite efectiv (pentru filtrele din pagină), cu numărul de poze. */
export async function listGalleryTags() {
  const { rows } = await query(
    `SELECT tag, COUNT(*)::int AS n
       FROM gallery_images
      WHERE is_active = TRUE AND tag IS NOT NULL AND tag <> ''
      GROUP BY tag ORDER BY MIN(sort_order), tag`
  );
  return rows.map((r) => ({ tag: r.tag, count: r.n }));
}

/** Admin: tot, inclusiv pozele ascunse. */
export async function listGalleryAdmin() {
  const { rows } = await query(`SELECT * FROM gallery_images ORDER BY sort_order, id`);
  return rows.map(mapImage);
}

/**
 * Adaugă poze. Pozele noi se pun la FINALUL galeriei (nu la început): altfel
 * fiecare încărcare ar rearanja pagina pe care clientul tocmai a ordonat-o.
 * @param {Array<{url:string, alt?:string, tag?:string}>} items
 */
export async function addGalleryImages(items) {
  if (!items.length) return [];
  const { rows: last } = await query(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM gallery_images`);
  let next = Number(last[0].m) || 0;
  return withTransaction(async (client) => {
    const added = [];
    for (const it of items) {
      next += 10;
      const { rows } = await client.query(
        `INSERT INTO gallery_images (url, alt, tag, sort_order)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (url) DO UPDATE SET alt = EXCLUDED.alt, tag = EXCLUDED.tag
         RETURNING id, url`,
        [it.url, it.alt || '', it.tag || null, next]
      );
      added.push(rows[0]);
    }
    return added;
  });
}

export async function updateGalleryImage(id, data) {
  const { rowCount } = await query(
    `UPDATE gallery_images
        SET alt = $2, tag = $3, is_active = $4, sort_order = $5
      WHERE id = $1`,
    [id, data.alt || '', data.tag || null, data.isActive !== false, data.sortOrder || 0]
  );
  return rowCount > 0;
}

// Ștergem doar rândul, nu și fișierul de pe disc: aceeași poză poate fi folosită
// și de un produs sau de o pagină de decorațiuni, iar un `unlink` ar lăsa acolo
// o imagine ruptă.
export async function deleteGalleryImage(id) {
  const { rowCount } = await query(`DELETE FROM gallery_images WHERE id = $1`, [id]);
  return { deleted: rowCount > 0 };
}

export async function reorderGallery(items) {
  if (!items.length) return 0;
  return withTransaction(async (client) => {
    for (const it of items) {
      await client.query(`UPDATE gallery_images SET sort_order = $2 WHERE id = $1`, [it.id, it.sortOrder]);
    }
    return items.length;
  });
}
