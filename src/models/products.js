// Acces la date pentru produse + categorii.
import { query } from '../db.js';
import { slugify } from '../utils/slug.js';

// Mapează rândul DB în forma trimisă către frontend (prețuri în lei + în cents).
// Dreptul de retragere in 14 zile NU se aplica la tot (vezi /retur):
//  - florile si aranjamentele proaspete sunt perisabile;
//  - pachetele si decorul de eveniment sunt prestatii/produse la comanda.
// Baloanele NEUMFLATE se pot returna — de aceea nota le insoteste cu conditia
// ambalajului original; heliul se alege ca extra-optiune, iar odata umflat
// balonul intra la exceptii.
const NERETURNABIL_TIPURI = new Set([
  'pachet-1-an', 'pachet-5-ani', 'pachet-18-ani', 'pachet-25-ani', 'pachet-30-ani',
  'pachet-50-ani', 'pachet-80-ani', 'pachet-bride', 'set-baloane', 'baby-shower',
]);

function returnPolicy(row) {
  // Suprascriere explicita din DB — bate orice regula derivata.
  if (row.returnable === true) {
    return { returnable: true, reason: 'Retur în 14 zile — nefolosit și în ambalajul original.' };
  }
  if (row.returnable === false) {
    return { returnable: false, reason: 'Exceptat de la dreptul de retragere.' };
  }
  if (row.category_slug === 'florarie') {
    return { returnable: false, reason: 'Produs perisabil — exceptat de la dreptul de retragere.' };
  }
  if (NERETURNABIL_TIPURI.has(row.product_type)) {
    return { returnable: false, reason: 'Pregătit la comandă — exceptat de la dreptul de retragere.' };
  }
  // „Neumflat" are sens doar la baloane; la accesorii ar suna aiurea.
  const eBalon = typeof row.product_type === 'string' &&
    (row.product_type.startsWith('folie-') || row.product_type === 'baloane-latex');
  return {
    returnable: true,
    reason: eBalon
      ? 'Retur în 14 zile — neumflat și în ambalajul original.'
      : 'Retur în 14 zile — nefolosit și în ambalajul original.',
  };
}

function mapProduct(row) {
  const ret = returnPolicy(row);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category_slug,
    categoryName: row.category_name,
    type: row.product_type || null,
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
    returnable: ret.returnable,
    returnNote: ret.reason,
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
// Add-on-urile aplicabile unui produs. `category` = slug categorie produs (ex. 'baloane').
// addon_scope NULL => apare peste tot (comportament vechi); altfel doar dacă include categoria.
// `productSlug` = produsul deschis: pe lângă add-on-urile categoriei, primește
// și lista lui explicită `products.addon_slugs` (ex. heliu la tariful lui, sau
// buchetele baby boy/girl la seturile de baby shower). Excluderile din listă
// (`addon_exclude_slugs`) scot add-on-urile de categorie care nu i se potrivesc
// — un balon mic nu trebuie să arate heliul de 50 lei al cifrelor de 100 cm.
export async function listAddons(category, productSlug) {
  const params = [];
  const conds = [];
  if (category) {
    params.push(category);
    conds.push(`(p.is_addon = TRUE AND (p.addon_scope IS NULL OR $${params.length} = ANY(p.addon_scope))
                 AND NOT (p.slug = ANY(COALESCE(src.addon_exclude_slugs, ARRAY[]::text[]))))`);
  }
  if (productSlug) {
    params.push(productSlug);
    conds.push(`p.slug = ANY(COALESCE(src.addon_slugs, ARRAY[]::text[]))`);
  }
  if (!conds.length) conds.push('p.is_addon = TRUE');

  // `src` = produsul curent. Sub-select-urile garantează exact un rând (cu NULL-uri)
  // și când slug-ul lipsește sau nu există — altfel CROSS JOIN ar goli rezultatul.
  const srcSlugParam = productSlug ? `$${params.length}` : 'NULL';
  const { rows } = await query(
    `WITH src AS (
       SELECT (SELECT addon_slugs         FROM products WHERE slug = ${srcSlugParam}) AS addon_slugs,
              (SELECT addon_exclude_slugs FROM products WHERE slug = ${srcSlugParam}) AS addon_exclude_slugs
     )
     SELECT DISTINCT p.*, c.slug AS category_slug, c.name AS category_name
     FROM products p
     JOIN categories c ON c.id = p.category_id
     CROSS JOIN src
     WHERE p.is_active = TRUE AND (${conds.join(' OR ')})
     ORDER BY p.price_cents, p.name`,
    params
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
  if (f.type) {
    // `type` poate fi o listă CSV (o categorie principală = mai multe sub-tipuri).
    const types = String(f.type).split(',').map((t) => t.trim()).filter(Boolean);
    if (types.length === 1) {
      where.push(`p.product_type = $${i++}`);
      params.push(types[0]);
    } else if (types.length > 1) {
      where.push(`p.product_type = ANY($${i++})`);
      params.push(types);
    }
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
  // Colecții (filtre rapide). „reduceri" se deduce din preț (sursa de adevăr),
  // „popular"/„nou" din badge.
  if (f.collection === 'reduceri') {
    where.push(`p.old_price_cents IS NOT NULL AND p.old_price_cents > p.price_cents`);
  } else if (f.collection === 'popular') {
    where.push(`p.badge = 'popular'`);
  } else if (f.collection === 'nou') {
    where.push(`p.badge = 'nou'`);
  }

  // `recomandat` = produsele cu badge-ul `popular` primele, apoi restul in ordinea
  // curata din `sort_order` (cifre 0-9, litere A-Z, apoi figurine/ocazii/accesorii).
  // `IS DISTINCT FROM` (nu `<>`) pentru ca badge-ul e NULL la majoritatea produselor,
  // iar `NULL <> 'popular'` ar da NULL, nu TRUE. Boolean ASC = false inainte de true,
  // deci populare -> false -> primele. Produsele neordonate au sort_order 0 si trebuie
  // sa cada la FINAL, nu la inceput — de aici al doilea criteriu boolean. Ordonarea
  // dupa sort_order se aplica si in interiorul grupului `popular`.
  const recomandat =
    `(p.badge IS DISTINCT FROM 'popular'), (p.sort_order = 0), p.sort_order, p.name`;
  const orderBy =
    {
      recomandat,
      'pret-asc': 'p.price_cents ASC',
      'pret-desc': 'p.price_cents DESC',
      nume: 'p.name ASC',
      nou: 'p.created_at DESC',
    }[f.sort] || recomandat;

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

// Slug-urile tuturor produselor vizibile (non-addon), pentru sitemap.
export async function getSitemapProducts() {
  const { rows } = await query(
    `SELECT slug, updated_at FROM products
     WHERE is_active = TRUE AND is_addon = FALSE
     ORDER BY updated_at DESC`
  );
  return rows;
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
    isAddon: row.is_addon === true,
    addonScope: row.addon_scope || [],
    addonSlugs: row.addon_slugs || [],
    addonExcludeSlugs: row.addon_exclude_slugs || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Listare admin: toate produsele (active+inactive), cu căutare + filtru categorie.
export async function listAllProducts({ q, category, type, active, page = 1, pageSize = 50 } = {}) {
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
  if (type) {
    where.push(`p.product_type = $${i++}`);
    params.push(type);
  }
  if (active === 'active') where.push(`p.is_active = TRUE`);
  else if (active === 'hidden') where.push(`p.is_active = FALSE`);
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
    product_type: d.productType ? d.productType : null,
    is_addon: d.isAddon === true,
    addon_scope: d.addonScope || [],
    addon_slugs: d.addonSlugs || [],
    addon_exclude_slugs: d.addonExcludeSlugs || [],
  };
}

export async function createProduct(data) {
  const r = toRow(data);
  const slug = await uniqueSlug(data.slug || data.name);
  const { rows } = await query(
    `INSERT INTO products
       (slug, name, description, category_id, price_cents, old_price_cents,
        stock, badge, occasions, colors, images, is_active, product_type,
        is_addon, addon_scope, addon_slugs, addon_exclude_slugs)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [
      slug, r.name, r.description, r.category_id, r.price_cents, r.old_price_cents,
      r.stock, r.badge, r.occasions, r.colors, r.images, r.is_active, r.product_type,
      r.is_addon, r.addon_scope, r.addon_slugs, r.addon_exclude_slugs,
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
       ${slug ? 'slug = $18,' : ''}
       name = $2, description = $3, category_id = $4, price_cents = $5,
       old_price_cents = $6, stock = $7, badge = $8, occasions = $9,
       colors = $10, images = $11, is_active = $12, product_type = $13,
       is_addon = $14, addon_scope = $15, addon_slugs = $16, addon_exclude_slugs = $17
     WHERE id = $1
     RETURNING id`,
    (() => {
      const base = [id, r.name, r.description, r.category_id, r.price_cents, r.old_price_cents,
        r.stock, r.badge, r.occasions, r.colors, r.images, r.is_active, r.product_type,
        r.is_addon, r.addon_scope, r.addon_slugs, r.addon_exclude_slugs];
      return slug ? [...base, slug] : base;
    })()
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

// Ștergere în masă. Produsele cu istoric de comenzi se dezactivează (nu se pot șterge).
// Întoarce ce s-a șters efectiv și ce s-a dezactivat.
export async function bulkDeleteProducts(ids) {
  const deletedIds = [];
  const deactivatedIds = [];
  for (const id of ids) {
    const r = await deleteProduct(id);
    if (r.deleted) deletedIds.push(id);
    else if (r.deactivated) deactivatedIds.push(id);
  }
  return { deletedIds, deactivatedIds };
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
  const [occ, col, badges, addons] = await Promise.all([
    query(`SELECT DISTINCT unnest(occasions) AS v FROM products WHERE NOT is_addon ORDER BY v`),
    query(`SELECT DISTINCT unnest(colors) AS v FROM products WHERE NOT is_addon ORDER BY v`),
    query(`SELECT DISTINCT badge AS v FROM products WHERE badge IS NOT NULL AND NOT is_addon ORDER BY v`),
    // slug-urile extra-opțiunilor — sugestii în editor pentru `addon_slugs`
    query(`SELECT slug AS v FROM products WHERE is_addon AND is_active ORDER BY slug`),
  ]);
  return {
    occasions: occ.rows.map((r) => r.v),
    colors: col.rows.map((r) => r.v),
    badges: badges.rows.map((r) => r.v),
    addonSlugs: addons.rows.map((r) => r.v),
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
