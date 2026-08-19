// ═══════════════════════════════════════════════════════════════════
//  Backoffice — rute /api/admin/*
//  Login cu parolă + CRUD produse / categorii + upload imagini.
//  Toate rutele (mai puțin /login) cer token admin (requireAdmin).
// ═══════════════════════════════════════════════════════════════════
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import fs from 'node:fs';

import { asyncHandler, notFound, HttpError } from '../utils/http.js';
import {
  parseOrThrow,
  adminLoginSchema,
  adminProductSchema,
  adminCategorySchema,
  adminProductTypeSchema,
  adminTypeReorderSchema,
  adminOrderUpdateSchema,
  adminLeadStatusSchema,
  bannerSchema,
  ORDER_STATUSES,
  LEAD_STATUSES,
} from '../validation.js';
import { getBanner, setSetting } from '../models/settings.js';
import {
  listOrdersAdmin,
  getOrderDetailAdmin,
  updateOrderAdmin,
} from '../models/orders.js';
import { listLeadsAdmin, updateLeadStatus } from '../models/leads.js';
import config from '../config.js';
import { PAGES, getPage, scanPage, writePage } from '../services/pageEditor.js';
import { getPageOverrides, savePageOverrides, resetPageKey } from '../models/pageContent.js';
import { listDecorPages, scanDecorPage, writeDecorPage } from '../services/decorEditor.js';
import { prerenderDecor } from '../services/decorPrerender.js';
import {
  requireAdmin,
  checkPassword,
  issueToken,
} from '../middleware/adminAuth.js';
import {
  listAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  setProductActive,
  deleteProduct,
  bulkDeleteProducts,
  listCategoriesAdmin,
  createCategory,
  updateCategory,
  deleteCategory,
  getAdminStats,
  getProductFacets,
} from '../models/products.js';
import {
  listProductTypesAdmin,
  createProductType,
  updateProductType,
  deleteProductType,
  reorderProductTypes,
} from '../models/productTypes.js';

const router = Router();

// ID-urile din URL trebuie validate ÎNAINTE de query: altfel `Number('abc')`
// ajunge NaN în Postgres și primim 500 (cu mesaj de schemă) în loc de 400.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function intId(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'ID invalid');
  return n;
}
function uuidId(raw) {
  const v = String(raw || '');
  if (!UUID_RE.test(v)) throw new HttpError(400, 'ID invalid');
  return v;
}
const pageNum = (v) => Math.max(1, Number(v) || 1);

const __dirname = dirname(fileURLToPath(import.meta.url));
// În producție, nginx servește staticul din alt director (ex: /var/www/bigboom).
// UPLOAD_DIR pune pozele urcate direct acolo. Implicit: public/ din aplicație (dev).
const uploadsDir =
  config.uploadsDir || join(__dirname, '..', '..', 'public', 'assets', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// ─── Upload imagini (multer) ───
// SVG intenționat exclus: poate purta <script> (XSS stocat dacă e deschis direct).
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = EXT[file.mimetype] || extname(file.originalname) || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 12 }, // 5MB / fișier, max 12
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(new HttpError(400, 'Tip fișier neacceptat. Folosește JPG, PNG, WEBP sau GIF.'));
  },
});

// ───────────────────────────────────────────────
//  LOGIN  (fără auth)
// ───────────────────────────────────────────────
// POST /api/admin/login  { password }
router.post(
  '/admin/login',
  asyncHandler(async (req, res) => {
    const { password } = parseOrThrow(adminLoginSchema, req.body);
    if (!checkPassword(password)) {
      throw new HttpError(401, 'Parolă incorectă.');
    }
    res.json({ token: issueToken() });
  })
);

// GET /api/admin/me — verifică dacă token-ul e încă valid
router.get('/admin/me', requireAdmin, (_req, res) => res.json({ ok: true }));

// De aici încolo, totul cere admin.
router.use('/admin', requireAdmin);

// ───────────────────────────────────────────────
//  STATS
// ───────────────────────────────────────────────
router.get(
  '/admin/stats',
  asyncHandler(async (_req, res) => {
    res.json({ stats: await getAdminStats() });
  })
);

// ───────────────────────────────────────────────
//  BANNER PROMO (setări site)
// ───────────────────────────────────────────────
router.get(
  '/admin/banner',
  asyncHandler(async (_req, res) => {
    res.json({ banner: await getBanner() });
  })
);

router.put(
  '/admin/banner',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(bannerSchema, req.body);
    const banner = await setSetting('banner', data);
    res.json({ banner });
  })
);

// ───────────────────────────────────────────────
//  PRODUSE
// ───────────────────────────────────────────────
router.get(
  '/admin/products',
  asyncHandler(async (req, res) => {
    const { q, category, type, active, page, pageSize } = req.query;
    res.json(
      await listAllProducts({
        q: q?.trim() || undefined,
        category: category?.trim() || undefined,
        type: type?.trim() || undefined,
        active: active === 'active' || active === 'hidden' ? active : undefined,
        page: pageNum(page),
        pageSize: Math.min(Number(pageSize) || 50, 100),
      })
    );
  })
);

// Valori distincte (ocazii, culori, badge-uri) pentru autocomplete în editor.
router.get(
  '/admin/facets',
  asyncHandler(async (_req, res) => {
    res.json(await getProductFacets());
  })
);

router.get(
  '/admin/products/:id',
  asyncHandler(async (req, res) => {
    const product = await getProductById(intId(req.params.id));
    if (!product) throw notFound('Produs inexistent');
    res.json({ product });
  })
);

// FK pe categorie: fără asta, un categoryId inexistent ieșea ca 500 cu mesaj SQL.
function rethrowFk(err) {
  if (err?.code === '23503') throw new HttpError(400, 'Categoria selectată nu există.');
  throw err;
}

router.post(
  '/admin/products',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(adminProductSchema, req.body);
    const product = await createProduct(data).catch(rethrowFk);
    res.status(201).json({ product });
  })
);

router.put(
  '/admin/products/:id',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(adminProductSchema, req.body);
    const product = await updateProduct(intId(req.params.id), data).catch(rethrowFk);
    if (!product) throw notFound('Produs inexistent');
    res.json({ product });
  })
);

// Comută activ/inactiv
router.patch(
  '/admin/products/:id/active',
  asyncHandler(async (req, res) => {
    const raw = req.body?.isActive;
    if (raw !== true && raw !== false && raw !== 'true' && raw !== 'false') {
      throw new HttpError(400, 'Câmpul isActive lipsește sau e invalid.');
    }
    const isActive = raw === true || raw === 'true';
    const product = await setProductActive(intId(req.params.id), isActive);
    if (!product) throw notFound('Produs inexistent');
    res.json({ product });
  })
);

router.delete(
  '/admin/products/:id',
  asyncHandler(async (req, res) => {
    const result = await deleteProduct(intId(req.params.id));
    res.json(result);
  })
);

// Ștergere în masă: { ids: [1,2,3] }
router.post(
  '/admin/products/bulk-delete',
  asyncHandler(async (req, res) => {
    const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = raw.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
    if (!ids.length) throw new HttpError(400, 'Niciun produs selectat.');
    res.json(await bulkDeleteProducts(ids));
  })
);

// ───────────────────────────────────────────────
//  CATEGORII
// ───────────────────────────────────────────────
router.get(
  '/admin/categories',
  asyncHandler(async (_req, res) => {
    res.json({ categories: await listCategoriesAdmin() });
  })
);

router.post(
  '/admin/categories',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(adminCategorySchema, req.body);
    const category = await createCategory(data);
    res.status(201).json({ category });
  })
);

router.put(
  '/admin/categories/:id',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(adminCategorySchema, req.body);
    const ok = await updateCategory(intId(req.params.id), data);
    if (!ok) throw notFound('Categorie inexistentă');
    res.json({ ok: true });
  })
);

router.delete(
  '/admin/categories/:id',
  asyncHandler(async (req, res) => {
    try {
      const result = await deleteCategory(intId(req.params.id));
      res.json(result);
    } catch (err) {
      if (err.code === 'CATEGORY_NOT_EMPTY') throw new HttpError(409, err.message);
      throw err;
    }
  })
);

// ───────────────────────────────────────────────
//  TIPURI DE PRODUS (sub-categorii)
// ───────────────────────────────────────────────
router.get(
  '/admin/product-types',
  asyncHandler(async (_req, res) => {
    res.json({ types: await listProductTypesAdmin() });
  })
);

router.post(
  '/admin/product-types',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(adminProductTypeSchema, req.body);
    res.status(201).json({ type: await createProductType(data) });
  })
);

router.put(
  '/admin/product-types/:id',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(adminProductTypeSchema, req.body);
    const ok = await updateProductType(intId(req.params.id), data);
    if (!ok) throw notFound('Tip inexistent');
    res.json({ ok: true });
  })
);

// Reordonare în bloc (drag & drop din panou). Cale separată, cu cratimă, nu
// `/product-types/reorder` — aceea ar fi fost prinsă de ruta cu `:id`.
router.put(
  '/admin/product-types-order',
  asyncHandler(async (req, res) => {
    const { items } = parseOrThrow(adminTypeReorderSchema, req.body);
    res.json({ updated: await reorderProductTypes(items) });
  })
);

router.delete(
  '/admin/product-types/:id',
  asyncHandler(async (req, res) => {
    try {
      res.json(await deleteProductType(intId(req.params.id)));
    } catch (err) {
      if (err.code === 'TYPE_IN_USE') throw new HttpError(409, err.message);
      throw err;
    }
  })
);

// ───────────────────────────────────────────────
//  COMENZI
// ───────────────────────────────────────────────
router.get(
  '/admin/orders',
  asyncHandler(async (req, res) => {
    const { status, q, page, pageSize } = req.query;
    // Validează statusul contra enum-ului (coloană ENUM în DB): o valoare
    // străină ajungea în query și producea 500 cu mesaj SQL. Necunoscut → ignoră filtrul.
    const st = ORDER_STATUSES.includes(status?.trim()) ? status.trim() : undefined;
    res.json(
      await listOrdersAdmin({
        status: st,
        q: q?.trim() || undefined,
        page: pageNum(page),
        pageSize: Math.min(Number(pageSize) || 50, 100),
      })
    );
  })
);

router.get(
  '/admin/orders/:id',
  asyncHandler(async (req, res) => {
    const order = await getOrderDetailAdmin(uuidId(req.params.id));
    if (!order) throw notFound('Comandă inexistentă');
    res.json({ order });
  })
);

router.patch(
  '/admin/orders/:id',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(adminOrderUpdateSchema, req.body);
    const order = await updateOrderAdmin(uuidId(req.params.id), data);
    if (!order) throw notFound('Comandă inexistentă');
    res.json({ order });
  })
);

// ───────────────────────────────────────────────
//  CERERI (leads)
// ───────────────────────────────────────────────
router.get(
  '/admin/leads',
  asyncHandler(async (req, res) => {
    const { status, page, pageSize } = req.query;
    const st = LEAD_STATUSES.includes(status?.trim()) ? status.trim() : undefined;
    res.json(
      await listLeadsAdmin({
        status: st,
        page: pageNum(page),
        pageSize: Math.min(Number(pageSize) || 50, 100),
      })
    );
  })
);

router.patch(
  '/admin/leads/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = parseOrThrow(adminLeadStatusSchema, req.body);
    const ok = await updateLeadStatus(uuidId(req.params.id), status);
    if (!ok) throw notFound('Cerere inexistentă');
    res.json({ ok: true });
  })
);

// ───────────────────────────────────────────────
//  UPLOAD IMAGINI
// ───────────────────────────────────────────────
// POST /api/admin/uploads  (multipart, câmp "images")  → { urls: [...] }
router.post(
  '/admin/uploads',
  requireAdmin,
  upload.array('images', 12),
  (req, res) => {
    const urls = (req.files || []).map((f) => `/assets/uploads/${f.filename}`);
    res.status(201).json({ urls });
  }
);

// ═══ Editor de pagini (mini-CMS) ═══════════════════════════════════
// GET /api/admin/pages — lista paginilor editabile, grupate pentru meniu
router.get('/admin/pages', requireAdmin, (_req, res) => {
  res.json({
    pages: [
      ...PAGES.map(({ slug, name, url, group, warn, altHost }) => ({ slug, name, url, group, warn, altHost: !!altHost })),
      // Subpaginile de decor sunt generate din decoratiuni-data.js — vin din
      // alt editor, dar clientul nu trebuie sa stie asta: apar ca orice pagina.
      ...listDecorPages(),
    ],
  });
});

// GET /api/admin/pages/:slug — elementele editabile, cu valoarea CURENTA.
// Valoarea curenta = suprascrierea din DB daca exista, altfel textul din fisier.
// `isEdited` spune panoului ce a fost modificat fata de original, ca sa poata
// oferi „Revino la textul initial".
router.get(
  '/admin/pages/:slug',
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (req.params.slug.startsWith('decor-')) {
      const d = scanDecorPage(req.params.slug);
      if (!d) throw notFound('Subpagină inexistentă');
      const ov = await getPageOverrides(req.params.slug);
      return res.json({
        page: {
          slug: req.params.slug, name: `Decor ${d.event.name}`,
          url: `/decoratiuni/${d.event.slug}`, kind: 'decor',
        },
        items: d.items.map((it) => ({
          ...it, original: it.value, isEdited: it.key in ov,
        })),
      });
    }
    const page = getPage(req.params.slug);
    if (!page) throw notFound('Pagină inexistentă');
    const overrides = await getPageOverrides(page.slug);
    const items = scanPage(page).map((it) => ({
      ...it,
      original: it.value,
      value: it.key in overrides ? overrides[it.key] : it.value,
      isEdited: it.key in overrides,
    }));
    res.json({
      page: { slug: page.slug, name: page.name, url: page.url, warn: page.warn, altHost: !!page.altHost },
      items,
    });
  })
);

// PUT /api/admin/pages/:slug — salveaza in DB (sursa de adevar) SI in fisier,
// ca modificarea sa fie vizibila imediat pe site, nu dupa urmatorul deploy.
router.put(
  '/admin/pages/:slug',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const values = req.body && typeof req.body.values === 'object' ? req.body.values : null;
    if (!values) throw new HttpError(400, 'Lipsesc valorile de salvat.');

    if (req.params.slug.startsWith('decor-')) {
      const applied = writeDecorPage(req.params.slug, values);
      // Fisierul de date e sursa; paginile statice trebuie regenerate imediat,
      // altfel clientul salveaza si nu vede nicio schimbare pe site.
      prerenderDecor();
      const dupa = Object.fromEntries(scanDecorPage(req.params.slug).items.map((i) => [i.key, i.value]));
      await savePageOverrides(req.params.slug, Object.fromEntries(applied.map((k) => [k, dupa[k]])));
      return res.json({ saved: applied.length, keys: applied });
    }

    const page = getPage(req.params.slug);
    if (!page) throw notFound('Pagină inexistentă');

    const known = new Set(scanPage(page).map((i) => i.key));
    const clean = {};
    for (const [k, v] of Object.entries(values)) {
      if (known.has(k) && typeof v === 'string') clean[k] = v;
    }
    if (!Object.keys(clean).length) throw new HttpError(400, 'Nicio valoare validă de salvat.');

    const applied = writePage(page, clean);
    // Salvam in DB exact ce a ajuns in fisier (sanitizat), nu ce a trimis clientul.
    const afterWrite = Object.fromEntries(scanPage(page).map((i) => [i.key, i.value]));
    await savePageOverrides(page.slug, Object.fromEntries(applied.map((k) => [k, afterWrite[k]])));
    res.json({ saved: applied.length, keys: applied });
  })
);

// DELETE /api/admin/pages/:slug/:key — revine la textul din fisierul original
router.delete(
  '/admin/pages/:slug/:key',
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (req.params.slug.startsWith('decor-')) {
      // Suprascrierea dispare, dar fisierul de date ramane cum e — nu avem
      // varianta „originala" a lui in cod. Il schimba clientul inapoi manual.
      await resetPageKey(req.params.slug, req.params.key);
      return res.json({ ok: true });
    }
    const page = getPage(req.params.slug);
    if (!page) throw notFound('Pagină inexistentă');
    await resetPageKey(page.slug, req.params.key);
    res.json({ ok: true });
  })
);

export default router;
