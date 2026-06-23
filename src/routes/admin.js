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
  adminOrderUpdateSchema,
  adminLeadStatusSchema,
} from '../validation.js';
import {
  listOrdersAdmin,
  getOrderDetailAdmin,
  updateOrderAdmin,
} from '../models/orders.js';
import { listLeadsAdmin, updateLeadStatus } from '../models/leads.js';
import config from '../config.js';
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
  listCategoriesAdmin,
  createCategory,
  updateCategory,
  deleteCategory,
  getAdminStats,
  getProductFacets,
} from '../models/products.js';

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
// În producție, nginx servește staticul din alt director (ex: /var/www/bigboom).
// UPLOAD_DIR pune pozele urcate direct acolo. Implicit: public/ din aplicație (dev).
const uploadsDir =
  config.uploadsDir || join(__dirname, '..', '..', 'public', 'assets', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// ─── Upload imagini (multer) ───
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']);
const EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/svg+xml': '.svg',
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
    cb(new HttpError(400, 'Tip fișier neacceptat. Folosește JPG, PNG, WEBP, GIF sau SVG.'));
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
//  PRODUSE
// ───────────────────────────────────────────────
router.get(
  '/admin/products',
  asyncHandler(async (req, res) => {
    const { q, category, page, pageSize } = req.query;
    res.json(
      await listAllProducts({
        q: q?.trim() || undefined,
        category: category?.trim() || undefined,
        page: Number(page) || 1,
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
    const product = await getProductById(Number(req.params.id));
    if (!product) throw notFound('Produs inexistent');
    res.json({ product });
  })
);

router.post(
  '/admin/products',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(adminProductSchema, req.body);
    const product = await createProduct(data);
    res.status(201).json({ product });
  })
);

router.put(
  '/admin/products/:id',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(adminProductSchema, req.body);
    const product = await updateProduct(Number(req.params.id), data);
    if (!product) throw notFound('Produs inexistent');
    res.json({ product });
  })
);

// Comută activ/inactiv
router.patch(
  '/admin/products/:id/active',
  asyncHandler(async (req, res) => {
    const isActive = req.body?.isActive === true || req.body?.isActive === 'true';
    const product = await setProductActive(Number(req.params.id), isActive);
    if (!product) throw notFound('Produs inexistent');
    res.json({ product });
  })
);

router.delete(
  '/admin/products/:id',
  asyncHandler(async (req, res) => {
    const result = await deleteProduct(Number(req.params.id));
    res.json(result);
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
    const ok = await updateCategory(Number(req.params.id), data);
    if (!ok) throw notFound('Categorie inexistentă');
    res.json({ ok: true });
  })
);

router.delete(
  '/admin/categories/:id',
  asyncHandler(async (req, res) => {
    try {
      const result = await deleteCategory(Number(req.params.id));
      res.json(result);
    } catch (err) {
      if (err.code === 'CATEGORY_NOT_EMPTY') throw new HttpError(409, err.message);
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
    res.json(
      await listOrdersAdmin({
        status: status?.trim() || undefined,
        q: q?.trim() || undefined,
        page: Number(page) || 1,
        pageSize: Math.min(Number(pageSize) || 50, 100),
      })
    );
  })
);

router.get(
  '/admin/orders/:id',
  asyncHandler(async (req, res) => {
    const order = await getOrderDetailAdmin(req.params.id);
    if (!order) throw notFound('Comandă inexistentă');
    res.json({ order });
  })
);

router.patch(
  '/admin/orders/:id',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(adminOrderUpdateSchema, req.body);
    const order = await updateOrderAdmin(req.params.id, data);
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
    res.json(
      await listLeadsAdmin({
        status: status?.trim() || undefined,
        page: Number(page) || 1,
        pageSize: Math.min(Number(pageSize) || 50, 100),
      })
    );
  })
);

router.patch(
  '/admin/leads/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = parseOrThrow(adminLeadStatusSchema, req.body);
    const ok = await updateLeadStatus(req.params.id, status);
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

export default router;
