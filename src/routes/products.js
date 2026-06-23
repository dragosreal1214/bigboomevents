import { Router } from 'express';
import { asyncHandler, notFound } from '../utils/http.js';
import { parseOrThrow, productQuerySchema } from '../validation.js';
import { listProducts, getProductBySlug, listCategories, listAddons } from '../models/products.js';

const router = Router();

// GET /api/categories
router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    res.json({ categories: await listCategories() });
  })
);

// GET /api/addons — extra-opțiunile globale pentru pagina produsului
router.get(
  '/addons',
  asyncHandler(async (_req, res) => {
    res.json({ addons: await listAddons() });
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
    const product = await getProductBySlug(req.params.slug);
    if (!product) throw notFound('Produs inexistent');
    res.json({ product });
  })
);

export default router;
