import { Router } from 'express';
import { asyncHandler, notFound } from '../utils/http.js';
import { parseOrThrow, productQuerySchema } from '../validation.js';
import { listProducts, getProductBySlug, listCategories, listAddons } from '../models/products.js';
import { getBanner } from '../models/settings.js';

const router = Router();

// GET /api/banner — configul bannerului promo (public; frontend îl afișează dacă enabled)
router.get(
  '/banner',
  asyncHandler(async (_req, res) => {
    res.json({ banner: await getBanner() });
  })
);

// GET /api/categories
router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    res.json({ categories: await listCategories() });
  })
);

// GET /api/addons?category=&product= — extra-opțiunile pentru pagina produsului:
// cele ale categoriei + cele setate explicit pe produs (products.addon_slugs).
router.get(
  '/addons',
  asyncHandler(async (req, res) => {
    // Un parametru repetat (?category=a&category=b) ajunge array — luăm prima
    // valoare, altfel `typeof !== 'string'` golea filtrul și întorcea toate add-on-urile.
    const first = (v) => (Array.isArray(v) ? v[0] : v);
    const cat = first(req.query.category);
    const prod = first(req.query.product);
    const category = typeof cat === 'string' ? cat.trim().slice(0, 40) : undefined;
    const product = typeof prod === 'string' ? prod.trim().slice(0, 120) : undefined;
    res.json({ addons: await listAddons(category || undefined, product || undefined) });
  })
);

// GET /api/products?category=&q=&occasion=&color=&minPrice=&maxPrice=&inStock=&sort=&page=&pageSize=
router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const filters = parseOrThrow(productQuerySchema, req.query);
    const result = await listProducts(filters);
    res.json(result);
  })
);

// GET /api/products/:slug
router.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    // Byte-ul NUL face Postgres să arunce (500); slug-urile reale n-au așa ceva.
    const slug = String(req.params.slug || '').replace(/\u0000/g, '').slice(0, 200);
    const product = slug ? await getProductBySlug(slug) : null;
    if (!product) throw notFound('Produs inexistent');
    res.json({ product });
  })
);

export default router;
