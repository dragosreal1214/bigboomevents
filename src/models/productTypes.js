// Tipurile (sub-categoriile) unei categorii: „Figurină", „Cifră", „Pachet 1 An"…
//
// Erau hardcodate în trei fișiere JS (filtrul din panou, arborele de filtre din
// shop, butoanele rapide din capul paginii), deci clientul nu putea adăuga un
// tip nou fără deploy. Acum sunt în DB și se servesc prin API în toate trei.
//
// Legătura cu produsele e pe TEXT (`products.product_type` = `product_types.slug`),
// nu pe cheie străină: un tip șters nu are voie să blocheze sau să șteargă
// produse. Pentru ca legătura să nu se rupă în tăcere, redenumirea slug-ului
// rescrie produsele în aceeași tranzacție, iar ștergerea e refuzată cât timp
// există produse care îl folosesc.
import { query, withTransaction } from '../db.js';
import { slugify } from '../utils/slug.js';

const mapType = (r) => ({
  id: r.id,
  categoryId: r.category_id,
  category: r.category_slug,
  slug: r.slug,
  name: r.name,
  groupLabel: r.group_label || null,
  isQuick: r.is_quick,
  inSidebar: r.in_sidebar,
  sortOrder: r.sort_order,
  ...(r.product_count === undefined ? {} : { productCount: r.product_count }),
});

/** Public: tot ce trebuie shopului ca să-și construiască filtrele. */
export async function listProductTypes(categorySlug = null) {
  const { rows } = await query(
    `SELECT t.*, c.slug AS category_slug
       FROM product_types t
       JOIN categories c ON c.id = t.category_id
      WHERE ($1::text IS NULL OR c.slug = $1)
      ORDER BY c.sort_order, c.name, t.sort_order, t.name`,
    [categorySlug]
  );
  return rows.map(mapType);
}

/** Admin: la fel, dar cu numărul de produse care folosesc fiecare tip. */
export async function listProductTypesAdmin() {
  const { rows } = await query(
    `SELECT t.*, c.slug AS category_slug,
            (SELECT COUNT(*)::int FROM products p
              WHERE p.category_id = t.category_id AND p.product_type = t.slug) AS product_count
       FROM product_types t
       JOIN categories c ON c.id = t.category_id
      ORDER BY c.sort_order, c.name, t.sort_order, t.name`
  );
  return rows.map(mapType);
}

async function uniqueTypeSlug(categoryId, base, excludeId = null) {
  const root = slugify(base) || 'tip';
  let candidate = root;
  let n = 1;
  /* eslint-disable no-await-in-loop */
  while (true) {
    const { rows } = await query(
      `SELECT id FROM product_types
        WHERE category_id = $1 AND slug = $2 ${excludeId ? 'AND id <> $3' : ''} LIMIT 1`,
      excludeId ? [categoryId, candidate, excludeId] : [categoryId, candidate]
    );
    if (!rows.length) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

export async function createProductType(data) {
  const slug = await uniqueTypeSlug(data.categoryId, data.slug || data.name);
  const { rows } = await query(
    `INSERT INTO product_types (category_id, slug, name, group_label, is_quick, in_sidebar, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, slug`,
    [
      data.categoryId, slug, data.name, data.groupLabel || null,
      !!data.isQuick, data.inSidebar !== false, data.sortOrder || 0,
    ]
  );
  return rows[0];
}

export async function updateProductType(id, data) {
  return withTransaction(async (client) => {
    const { rows: current } = await client.query(
      `SELECT id, category_id, slug FROM product_types WHERE id = $1`, [id]
    );
    if (!current.length) return false;
    const row = current[0];
    const categoryId = data.categoryId || row.category_id;

    // Slug nou → produsele care foloseau vechiul slug trebuie rescrise, altfel
    // rămân cu un tip care nu mai există (invizibile în filtre).
    let slug = row.slug;
    if (data.slug && slugify(data.slug) !== row.slug) {
      slug = await uniqueTypeSlug(categoryId, data.slug, id);
    }

    await client.query(
      `UPDATE product_types
          SET category_id = $2, slug = $3, name = $4, group_label = $5,
              is_quick = $6, in_sidebar = $7, sort_order = $8
        WHERE id = $1`,
      [
        id, categoryId, slug, data.name, data.groupLabel || null,
        !!data.isQuick, data.inSidebar !== false, data.sortOrder || 0,
      ]
    );

    if (slug !== row.slug) {
      await client.query(
        `UPDATE products SET product_type = $1 WHERE category_id = $2 AND product_type = $3`,
        [slug, row.category_id, row.slug]
      );
    }
    return true;
  });
}

export async function deleteProductType(id) {
  const { rows } = await query(
    `SELECT t.slug, t.category_id,
            (SELECT COUNT(*)::int FROM products p
              WHERE p.category_id = t.category_id AND p.product_type = t.slug) AS used
       FROM product_types t WHERE t.id = $1`,
    [id]
  );
  if (!rows.length) return { deleted: false };
  if (rows[0].used > 0) {
    const err = new Error(
      `Tipul e folosit de ${rows[0].used} ${rows[0].used === 1 ? 'produs' : 'produse'}. ` +
      'Schimbă-le tipul mai întâi.'
    );
    err.code = 'TYPE_IN_USE';
    throw err;
  }
  const { rowCount } = await query(`DELETE FROM product_types WHERE id = $1`, [id]);
  return { deleted: rowCount > 0 };
}

/** Reordonare în bloc (drag & drop din panou): [{id, sortOrder}, ...]. */
export async function reorderProductTypes(items) {
  if (!items.length) return 0;
  return withTransaction(async (client) => {
    for (const it of items) {
      await client.query(`UPDATE product_types SET sort_order = $2 WHERE id = $1`, [it.id, it.sortOrder]);
    }
    return items.length;
  });
}
