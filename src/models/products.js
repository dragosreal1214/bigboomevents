// Acces la date pentru produse + categorii.
import { query } from '../db.js';
import { slugify } from '../utils/slug.js';

// Mapează rândul DB în forma trimisă către frontend (prețuri în lei + în cents).
function mapProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category_slug,
    categoryName: row.category_name,
    price: row.price_cents / 100,
    priceCents: row.price_cents,
    oldPrice: row.old_price_cents != null ? row.old_price_cents / 100 : null,
    stock: row.stock,
    inStock: row.stock > 0,
    badge: row.badge,
    occasions: row.occasions || [],
    colors: row.colors || [],
    images: row.images || [],
    isAddon: row.is_addon === true,
  };
}

export async function listCategories() {
  // Doar categoriile cu cel puțin un produs vizibil (activ, non-addon).
  // Astfel categoria ascunsă „extra" (doar add-on-uri) nu apare ca filtru în shop.
  const { rows } = await query(
    `SELECT c.slug, c.name, c.description
     FROM categories c
     WHERE EXISTS (
       SELECT 1 FROM products p
       WHERE p.category_id = c.id AND p.is_active AND NOT p.is_addon
     )
     ORDER BY c.sort_order, c.name`
  );
  return rows;
}

// Extra-opțiunile globale (felicitare, bomboane, șampanie, pungă) — pentru pagina produsului.
export async function listAddons() {
  const { rows } = await query(
    `SELECT p.*, c.slug AS category_slug, c.name AS category_name
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE p.is_addon = TRUE AND p.is_active = TRUE
     ORDER BY p.price_cents, p.name`
  );
  return rows.map(mapProduct);
}

// Listare cu filtre + sortare + paginare. Întoarce { items, total, page, pageSize }.
export async function listProducts(f) {
  const where = ['p.is_active = TRUE', 'p.is_addon = FALSE'];
  const params = [];
  let i = 1;

  if (f.category) {
    where.push(`c.slug = $${i++}`);
    params.push(f.category);
  }
  if (f.q) {
    where.push(
      `(to_tsvector('simple', p.name || ' ' || p.description) @@ plainto_tsquery('simple', $${i}) OR p.name ILIKE $${i + 1})`
    );
    params.push(f.q, `%${f.q}%`);
    i += 2;
  }
  if (f.occasion) {
    where.push(`$${i++} = ANY(p.occasions)`);
    params.push(f.occasion);
  }
  if (f.color) {
    where.push(`$${i++} = ANY(p.colors)`);
    params.push(f.color);
  }
  if (f.minPrice != null) {
    where.push(`p.price_cents >= $${i++}`);
    params.push(f.minPrice * 100);
  }
  if (f.maxPrice != null) {
    where.push(`p.price_cents <= $${i++}`);
    params.push(f.maxPrice * 100);
  }
  if (f.inStock) {
    where.push(`p.stock > 0`);
  }

  const orderBy =
    {
      'pret-asc': 'p.price_cents ASC',
      'pret-desc': 'p.price_cents DESC',
      nume: 'p.name ASC',
      nou: 'p.created_at DESC',
    }[f.sort] || 'p.created_at DESC';

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const base = `FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}`;

  const countRes = await query(`SELECT COUNT(*)::int AS total ${base}`, params);
  const total = countRes.rows[0].total;

  const offset = (f.page - 1) * f.pageSize;
  const { rows } = await query(
    `SELECT p.*, c.slug AS category_slug, c.name AS category_name
     ${base}
     ORDER BY ${orderBy}
     LIMIT $${i++} OFFSET $${i++}`,
    [...params, f.pageSize, offset]
  );

  return {
    items: rows.map(mapProduct),
    total,
    page: f.page,
    pageSize: f.pageSize,
    totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
  };
}

export async function getProductBySlug(slug) {
  const { rows } = await query(
    `SELECT p.*, c.slug AS category_slug, c.name AS category_name
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE p.slug = $1 AND p.is_active = TRUE AND p.is_addon = FALSE`,
    [slug]
  );
  return rows[0] ? mapProduct(rows[0]) : null;
}

// Folosit la validarea comenzii: ia produsele cu prețul curent (sursa de adevăr).
export async function getProductsByIds(ids) {
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT id, name, price_cents, stock, is_active, is_addon FROM products WHERE id = ANY($1)`,
    [ids]
  );
  return rows;
}

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — citire + scriere (include și produsele inactive)
// ═══════════════════════════════════════════════════════════════════

const SELECT_ADMIN = `
  SELECT p.*, c.slug AS category_slug, c.name AS category_name
  FROM products p JOIN categories c ON c.id = p.category_id`;

// Forma extinsă pentru panou (include id categorie, activ, date).
function mapAdminProduct(row) {
  return {
    ...mapProduct(row),
    categoryId: row.category_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Listare admin: toate produsele (active+inactive), cu căutare + filtru categorie.
export async function listAllProducts({ q, category, page = 1, pageSize = 50 } = {}) {
  const where = [];
  const params = [];
  let i = 1;
  if (q) {
    where.push(`(p.name ILIKE $${i} OR p.slug ILIKE $${i})`);
    params.push(`%${q}%`);
    i++;
  }
  if (category) {
    where.push(`c.slug = $${i++}`);
    params.push(category);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}`,
    params
  );
  const total = countRes.rows[0].total;
  const offset = (page - 1) * pageSize;
  const { rows } = await query(
    `${SELECT_ADMIN} ${whereSql} ORDER BY p.created_at DESC LIMIT $${i++} OFFSET $${i++}`,
    [...params, pageSize, offset]
  );
  return {
    items: rows.map(mapAdminProduct),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getProductById(id) {
  const { rows } = await query(`${SELECT_ADMIN} WHERE p.id = $1`, [id]);
  return rows[0] ? mapAdminProduct(rows[0]) : null;
}

// Generează un slug unic (adaugă -2, -3… dacă există deja). excludeId = la update.
async function uniqueSlug(base, excludeId = null) {
  let slug = slugify(base) || 'produs';
  let candidate = slug;
  let n = 1;
  // caută până găsește unul liber
  /* eslint-disable no-await-in-loop */
  while (true) {
    const { rows } = await query(
      `SELECT id FROM products WHERE slug = $1 ${excludeId ? 'AND id <> $2' : ''} LIMIT 1`,
      excludeId ? [candidate, excludeId] : [candidate]
    );
    if (!rows.length) return candidate;
    n += 1;
    candidate = `${slug}-${n}`;
  }
}

// Convertește datele validate (lei) în rând DB (bani).
function toRow(d) {
  return {
    name: d.name,
    description: d.description || '',
    category_id: d.categoryId,
    price_cents: Math.round(d.price * 100),
    old_price_cents: d.oldPrice != null ? Math.round(d.oldPrice * 100) : null,
    stock: d.stock ?? 0,
    badge: d.badge || null,
    occasions: d.occasions || [],
    colors: d.colors || [],
    images: d.images || [],
    is_active: d.isActive,
  };
}

export async function createProduct(data) {
  const r = toRow(data);
  const slug = await uniqueSlug(data.slug || data.name);
  const { rows } = await query(
    `INSERT INTO products
       (slug, name, description, category_id, price_cents, old_price_cents,
        stock, badge, occasions, colors, images, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      slug, r.name, r.description, r.category_id, r.price_cents, r.old_price_cents,
      r.stock, r.badge, r.occasions, r.colors, r.images, r.is_active,
    ]
  );
  return getProductById(rows[0].id);
}

export async function updateProduct(id, data) {
  const r = toRow(data);
  // Regenerează slug doar dacă utilizatorul a trimis unul explicit.
  const slug = data.slug ? await uniqueSlug(data.slug, id) : null;
  const { rows } = await query(
    `UPDATE products SET
       ${slug ? 'slug = $13,' : ''}
       name = $2, description = $3, category_id = $4, price_cents = $5,
       old_price_cents = $6, stock = $7, badge = $8, occasions = $9,
       colors = $10, images = $11, is_active = $12
     WHERE id = $1
     RETURNING id`,
    slug
      ? [id, r.name, r.description, r.category_id, r.price_cents, r.old_price_cents,
         r.stock, r.badge, r.occasions, r.colors, r.images, r.is_active, slug]
      : [id, r.name, r.description, r.category_id, r.price_cents, r.old_price_cents,
         r.stock, r.badge, r.occasions, r.colors, r.images, r.is_active]
  );
  return rows[0] ? getProductById(id) : null;
}

// Comută activ/inactiv (ascunde din shop fără a șterge).
export async function setProductActive(id, isActive) {
  const { rows } = await query(
    `UPDATE products SET is_active = $2 WHERE id = $1 RETURNING id`,
    [id, isActive]
  );
  return rows[0] ? getProductById(id) : null;
}

// Ștergere: dacă produsul a apărut în comenzi, FK-ul (ON DELETE RESTRICT)
// va bloca ștergerea — în acel caz îl dezactivăm în locul ștergerii.
export async function deleteProduct(id) {
  try {
    const { rowCount } = await query(`DELETE FROM products WHERE id = $1`, [id]);
    return { deleted: rowCount > 0, deactivated: false };
  } catch (err) {
    if (err.code === '23503') {
      // are comenzi asociate → dezactivăm
      await query(`UPDATE products SET is_active = FALSE WHERE id = $1`, [id]);
      return { deleted: false, deactivated: true };
    }
    throw err;
  }
}

// ─── Categorii (admin) ───
export async function listCategoriesAdmin() {
  const { rows } = await query(
    `SELECT c.id, c.slug, c.name, c.description, c.sort_order AS "sortOrder",
            COUNT(p.id)::int AS "productCount"
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id
     GROUP BY c.id
     ORDER BY c.sort_order, c.name`
  );
  return rows;
}

async function uniqueCategorySlug(base, excludeId = null) {
  let slug = slugify(base) || 'categorie';
  let candidate = slug;
  let n = 1;
  /* eslint-disable no-await-in-loop */
  while (true) {
    const { rows } = await query(
      `SELECT id FROM categories WHERE slug = $1 ${excludeId ? 'AND id <> $2' : ''} LIMIT 1`,
      excludeId ? [candidate, excludeId] : [candidate]
    );
    if (!rows.length) return candidate;
    n += 1;
    candidate = `${slug}-${n}`;
  }
}

export async function createCategory(data) {
  const slug = await uniqueCategorySlug(data.slug || data.name);
  const { rows } = await query(
    `INSERT INTO categories (slug, name, description, sort_order)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [slug, data.name, data.description || '', data.sortOrder || 0]
  );
  return rows[0];
}

export async function updateCategory(id, data) {
  const slug = data.slug ? await uniqueCategorySlug(data.slug, id) : null;
  const { rowCount } = await query(
    `UPDATE categories SET
       ${slug ? 'slug = $5,' : ''}
       name = $2, description = $3, sort_order = $4
     WHERE id = $1`,
    slug
      ? [id, data.name, data.description || '', data.sortOrder || 0, slug]
      : [id, data.name, data.description || '', data.sortOrder || 0]
  );
  return rowCount > 0;
}

export async function deleteCategory(id) {
  // ON DELETE RESTRICT pe products.category_id blochează dacă are produse.
  try {
    const { rowCount } = await query(`DELETE FROM categories WHERE id = $1`, [id]);
    return { deleted: rowCount > 0 };
  } catch (err) {
    if (err.code === '23503') {
      const e = new Error('Categoria are produse asociate. Mută-le sau șterge-le mai întâi.');
      e.code = 'CATEGORY_NOT_EMPTY';
      throw e;
    }
    throw err;
  }
}

// Valori distincte folosite în catalog (pentru autocomplete în editor).
export async function getProductFacets() {
  const [occ, col, badges] = await Promise.all([
    query(`SELECT DISTINCT unnest(occasions) AS v FROM products WHERE NOT is_addon ORDER BY v`),
    query(`SELECT DISTINCT unnest(colors) AS v FROM products WHERE NOT is_addon ORDER BY v`),
    query(`SELECT DISTINCT badge AS v FROM products WHERE badge IS NOT NULL AND NOT is_addon ORDER BY v`),
  ]);
  return {
    occasions: occ.rows.map((r) => r.v),
    colors: col.rows.map((r) => r.v),
    badges: badges.rows.map((r) => r.v),
  };
}

// Statistici pentru dashboard.
export async function getAdminStats() {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM products)                         AS products,
      (SELECT COUNT(*)::int FROM products WHERE is_active)         AS products_active,
      (SELECT COUNT(*)::int FROM products WHERE stock = 0)         AS out_of_stock,
      (SELECT COUNT(*)::int FROM categories)                       AS categories,
      (SELECT COUNT(*)::int FROM orders)                           AS orders,
      (SELECT COUNT(*)::int FROM leads WHERE status = 'new')       AS new_leads
  `);
  return rows[0];
}
