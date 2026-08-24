import { Router } from 'express';
import { asyncHandler, notFound } from '../utils/http.js';
import { parseOrThrow, productQuerySchema } from '../validation.js';
import { listProducts, getProductBySlug, listCategories, listAddons } from '../models/products.js';
import { listProductTypes } from '../models/productTypes.js';
import { listGallery, listGalleryTags } from '../models/gallery.js';
import { getBanner } from '../models/settings.js';
import config from '../config.js';

const router = Router();

// GET /api/banner — configul bannerului promo (public; frontend îl afișează dacă enabled)
router.get(
  '/banner',
  asyncHandler(async (_req, res) => {
    res.json({ banner: await getBanner() });
  })
);

// GET /api/payment-methods — ce metode de plata sunt disponibile acum (public).
// Frontendul ascunde optiunea de card cand e dezactivata, ca sa nu lase clientul
// sa ajunga la checkout cu o metoda care ar esua.
router.get('/payment-methods', (_req, res) => {
  res.json({ card: Boolean(config.netopia.cardEnabled), cod: true });
});

// GET /api/categories
router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    res.json({ categories: await listCategories() });
  })
);

// GET /api/gallery?tag= — galeria foto de pe pagina Evenimente.
// Întoarce și etichetele disponibile, ca pagina să-și construiască filtrele
// dintr-un singur apel (fără al doilea request doar pentru chip-uri).
router.get(
  '/gallery',
  asyncHandler(async (req, res) => {
    const tag = typeof req.query.tag === 'string' ? req.query.tag.trim().slice(0, 40) : '';
    const [images, tags] = await Promise.all([listGallery(tag || null), listGalleryTags()]);
    res.json({ images, tags });
  })
);

// GET /api/product-types?category=slug — tipurile (sub-categoriile) definite în
// panou. Shopul își construiește din ele arborele de filtre din bara laterală
// și butoanele rapide din capul paginii, deci un tip adăugat de client apare
// fără deploy.
router.get(
  '/product-types',
  asyncHandler(async (req, res) => {
    const cat = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 40) : '';
    res.json({ types: await listProductTypes(cat || null) });
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
