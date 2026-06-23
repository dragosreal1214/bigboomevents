// Scheme de validare (zod) pentru input-ul de la client.
import { z } from 'zod';

// ─── Filtre listă produse (query string) ───
export const productQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(40).optional(), // slug categorie
  occasion: z.string().trim().max(40).optional(),
  color: z.string().trim().max(40).optional(),
  minPrice: z.coerce.number().int().min(0).optional(), // în lei
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .optional(),
  sort: z.enum(['nou', 'pret-asc', 'pret-desc', 'nume']).default('nou'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

// ─── Articol din coș (la creare comandă) ───
const cartItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(99),
});

// ─── Creare comandă ───
export const createOrderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2, 'Nume prea scurt').max(120),
    email: z.string().trim().email('Email invalid').max(160),
    phone: z
      .string()
      .trim()
      .min(6, 'Telefon invalid')
      .max(25)
      .regex(/^[0-9+().\s-]+$/, 'Telefon invalid'),
  }),
  shipping: z.object({
    county: z.string().trim().min(2).max(60),
    city: z.string().trim().min(2).max(80),
    address: z.string().trim().min(4).max(240),
    postcode: z.string().trim().max(12).optional().or(z.literal('')),
  }),
  paymentMethod: z.enum(['card', 'cod']),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  // cadou & livrare programată (opționale)
  giftMessage: z.string().trim().max(300).optional().or(z.literal('')),
  deliveryDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dată invalidă')
    .optional()
    .or(z.literal('')),
  deliverySlot: z.string().trim().max(40).optional().or(z.literal('')),
  items: z.array(cartItemSchema).min(1, 'Coșul este gol').max(50),
  // acord obligatoriu cu termenii
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Trebuie să accepți termenii și condițiile.' }),
  }),
});

// ─── Lead (cerere ofertă) ───
export const createLeadSchema = z.object({
  name: z.string().trim().min(2, 'Nume prea scurt').max(120),
  email: z.string().trim().email('Email invalid').max(160),
  phone: z
    .string()
    .trim()
    .max(25)
    .regex(/^[0-9+().\s-]*$/, 'Telefon invalid')
    .optional()
    .or(z.literal('')),
  eventDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dată invalidă')
    .optional()
    .or(z.literal('')),
  eventType: z.string().trim().max(60).optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
  // honeypot anti-spam: trebuie să rămână gol
  website: z.string().max(0).optional().or(z.literal('')),
});

// ─── ADMIN: login ───
export const adminLoginSchema = z.object({
  password: z.string().min(1, 'Parolă necesară').max(200),
});

// Listă de string-uri scurte (ocazii / culori). Acceptă și CSV sau array.
const tagList = z.preprocess(
  (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return v.split(',');
    return [];
  },
  z.array(z.string().trim().min(1).max(40)).max(20).transform((arr) => [...new Set(arr)])
);

// Listă de imagini (căi/URL-uri).
const imageList = z.preprocess(
  (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []),
  z.array(z.string().trim().min(1).max(300)).max(12)
);

// ─── ADMIN: produs (create + update) ───
export const adminProductSchema = z.object({
  name: z.string().trim().min(2, 'Nume prea scurt').max(160),
  slug: z.string().trim().max(80).optional().or(z.literal('')),
  description: z.string().trim().max(4000).optional().or(z.literal('')).default(''),
  categoryId: z.coerce.number().int().positive('Alege o categorie'),
  // prețuri în LEI (le convertim în bani la salvare)
  price: z.coerce.number().min(0, 'Preț invalid').max(1000000),
  oldPrice: z
    .union([z.coerce.number().min(0).max(1000000), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' || v == null ? null : v)),
  stock: z.coerce.number().int().min(0, 'Stoc invalid').max(1000000).default(0),
  badge: z
    .enum(['nou', 'reducere', 'popular', ''])
    .optional()
    .transform((v) => (v ? v : null)),
  occasions: tagList.optional().default([]),
  colors: tagList.optional().default([]),
  images: imageList.optional().default([]),
  isActive: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((v) => (v === undefined ? true : v === true || v === 'true' || v === '1'))
    .default(true),
});

// ─── ADMIN: categorie (create + update) ───
export const adminCategorySchema = z.object({
  name: z.string().trim().min(2, 'Nume prea scurt').max(80),
  slug: z.string().trim().max(60).optional().or(z.literal('')),
  description: z.string().trim().max(500).optional().or(z.literal('')).default(''),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

// ─── ADMIN: actualizare comandă (status / AWB) ───
export const ORDER_STATUSES = [
  'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded',
];
export const adminOrderUpdateSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    awb: z.string().trim().max(60).optional().or(z.literal('')),
  })
  .refine((d) => d.status !== undefined || d.awb !== undefined, {
    message: 'Nimic de actualizat.',
  });

// ─── ADMIN: status lead ───
export const LEAD_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];
export const adminLeadStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
});

// Helper: validează și aruncă HttpError(400) cu detalii prietenoase.
import { HttpError } from './utils/http.js';
export function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    throw new HttpError(400, 'Date invalide', details);
  }
  return result.data;
}
