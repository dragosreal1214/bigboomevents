// Scheme de validare (zod) pentru input-ul de la client.
import { z } from 'zod';

// Dată ISO care există cu adevărat în calendar. Regexul singur lasă să treacă
// „2026-02-30", iar Postgres răspundea cu 500 în loc de 400.
const isoDate = (msg = 'Dată invalidă') =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, msg)
    .refine((v) => {
      const d = new Date(v + 'T00:00:00Z');
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, msg);

// ─── Filtre listă produse (query string) ───
export const productQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(40).optional(), // slug categorie
  occasion: z.string().trim().max(40).optional(),
  color: z.string().trim().max(40).optional(),
  type: z.string().trim().max(200).optional(), // tip produs; poate fi listă CSV (categorie principală)
  collection: z.enum(['popular', 'reduceri', 'nou']).optional(), // filtre rapide (colecții)
  minPrice: z.coerce.number().int().min(0).max(1000000).optional(), // în lei
  maxPrice: z.coerce.number().int().min(0).max(1000000).optional(),
  inStock: z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .optional(),
  sort: z.enum(['recomandat', 'nou', 'pret-asc', 'pret-desc', 'nume']).default('recomandat'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
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
    county: z.string().trim().min(2, 'Județ prea scurt').max(60),
    city: z.string().trim().min(2, 'Oraș prea scurt').max(80),
    address: z.string().trim().min(4, 'Adresă prea scurtă').max(240),
    postcode: z.string().trim().max(12, 'Cod poștal prea lung').optional().or(z.literal('')),
  }),
  // Facturare: implicit persoana fizica. Pentru firma, `company` devine
  // obligatoriu — vezi superRefine de la finalul schemei.
  billingType: z.enum(['person', 'company']).default('person'),
  company: z
    .object({
      name: z.string().trim().max(160).optional().or(z.literal('')),
      cui: z.string().trim().max(20).optional().or(z.literal('')),
      regCom: z.string().trim().max(40).optional().or(z.literal('')),
      address: z.string().trim().max(240).optional().or(z.literal('')),
    })
    .optional(),
  paymentMethod: z.enum(['card', 'cod']),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  // cadou & livrare programată (opționale)
  giftMessage: z.string().trim().max(300).optional().or(z.literal('')),
  deliveryDate: isoDate().optional().or(z.literal('')),
  deliverySlot: z.string().trim().max(40).optional().or(z.literal('')),
  // honeypot anti-spam (câmp ascuns în formular): dacă e completat, ruta
  // pretinde succes fără să salveze — la fel ca la leads.
  website: z.string().max(200).optional().or(z.literal('')),
  items: z.array(cartItemSchema).min(1, 'Coșul este gol').max(50),
  // acord obligatoriu cu termenii
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Trebuie să accepți termenii și condițiile.' }),
  }),
})
  // Datele de firmă se cer DOAR când clientul comandă pe firmă. Le validăm aici,
  // nu în obiectul `company`, ca să putem privi `billingType` din același nivel.
  .superRefine((v, ctx) => {
    if (v.billingType !== 'company') return;
    const c = v.company || {};
    if (!c.name || c.name.trim().length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['company', 'name'], message: 'Denumirea firmei e obligatorie.' });
    }
    // CUI RO: 2–10 cifre, cu prefixul RO opțional.
    if (!c.cui || !/^(RO)?\s?\d{2,10}$/i.test(c.cui.trim())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['company', 'cui'], message: 'CUI invalid (ex: RO12345678).' });
    }
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
  eventDate: isoDate().optional().or(z.literal('')),
  eventType: z.string().trim().max(60).optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
  // honeypot anti-spam: îl acceptăm la validare și îl tratăm în rută
  // (răspuns 201 fals-pozitiv), ca botul să nu afle care câmp îl dă de gol.
  website: z.string().max(200).optional().or(z.literal('')),
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
  productType: z.string().trim().max(40).optional().or(z.literal('')).transform((v) => (v ? v : null)),
  // prețuri în LEI (le convertim în bani la salvare)
  price: z.coerce.number().min(0, 'Preț invalid').max(1000000),
  // 0 = „fără preț vechi", la fel ca gol — altfel un 0 rămas în formular ar cădea
  // pe refine-ul de mai jos și ar bloca salvarea fără motiv.
  oldPrice: z
    .union([z.coerce.number().min(0).max(1000000), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' || v == null || v === 0 ? null : v)),
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
  // ─── extra-opțiuni ───
  // isAddon: produsul e o extra-opțiune (felicitare, heliu, bomboane…), nu apare
  // în magazin, ci doar pe pagina altui produs. Fără câmpul ăsta, orice produs
  // creat din panou în categoria „extra" ajungea în grila shop-ului.
  isAddon: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1')
    .default(false),
  // categoriile în care apare extra-opțiunea (gol = doar unde e pusă explicit)
  addonScope: tagList.optional().default([]),
  // extra-opțiunile aplicate EXPLICIT acestui produs (ex. heliul la tariful lui)
  addonSlugs: tagList.optional().default([]),
  // extra-opțiuni de categorie care NU se aplică acestui produs
  addonExcludeSlugs: tagList.optional().default([]),
})
  .refine((d) => d.oldPrice == null || d.oldPrice > d.price, {
    message:
      'Prețul vechi trebuie să fie mai mare decât prețul curent (e prețul tăiat de la reducere). Lasă-l gol dacă produsul nu e la reducere.',
    path: ['oldPrice'],
  });

// ─── ADMIN: categorie (create + update) ───
export const adminCategorySchema = z.object({
  name: z.string().trim().min(2, 'Nume prea scurt').max(80),
  slug: z.string().trim().max(60).optional().or(z.literal('')),
  description: z.string().trim().max(500).optional().or(z.literal('')).default(''),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

const flag = z.union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === 'on' || v === '1');

// ─── ADMIN: tip de produs (sub-categorie) ───
// `slug` e opțional: la creare se derivă din nume. La editare, schimbarea lui
// rescrie și `products.product_type` (vezi models/productTypes.js).
export const adminProductTypeSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2, 'Nume prea scurt').max(60),
  slug: z.string().trim().max(40).optional().or(z.literal('')),
  groupLabel: z.string().trim().max(60).optional().or(z.literal('')).transform((v) => (v ? v : null)),
  // NU z.coerce.boolean(): string-ul "false" ar deveni TRUE (orice string
  // ne-gol e truthy), deci un checkbox debifat trimis ca text ar salva pe dos.
  isQuick: flag.optional().default(false),
  inSidebar: flag.optional().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

export const adminTypeReorderSchema = z.object({
  items: z.array(z.object({
    id: z.coerce.number().int().positive(),
    sortOrder: z.coerce.number().int().min(0).max(9999),
  })).max(200),
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

// Banner promo (capul paginii). Culorile: hex #rgb / #rrggbb.
const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Culoare hex invalidă (ex: #111111)');
export const bannerSchema = z.object({
  enabled: z.coerce.boolean(),
  text: z.string().trim().min(1, 'Textul e obligatoriu').max(300),
  bgColor: hexColor,
  textColor: hexColor,
  speed: z.coerce.number().int().min(5).max(120), // secunde/buclă
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
