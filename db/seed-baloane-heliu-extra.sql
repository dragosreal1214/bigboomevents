-- ═══════════════════════════════════════════════════════════════════
--  Baloane: heliu tarifat pe tip de balon + extra-opțiuni la baby shower.
--
--  De ce: heliul nu costă la fel peste tot. Baloanele simple (latex, stele,
--  inimi) = +15 lei, formele/figurinele/seturile folie = +25 lei, iar cifrele
--  și literele de 100 cm rămân +50 lei. Un singur add-on global „heliu 50 lei"
--  ar fi mințit prețul pe majoritatea produselor.
--
--  Mecanism: `products.addon_slugs` (per produs) — vezi listAddons() în
--  src/models/products.js. Add-on-urile de heliu au addon_scope = ARRAY[]
--  (adică NU apar automat pe categorie), deci se văd doar unde sunt puse
--  explicit. Banii rămân în siguranță: liniile de add-on își iau prețul din DB
--  la createOrder, ca orice produs.
--
--  Rulează întâi schema.sql (adaugă addon_slugs), apoi:
--    node scripts/run-sql.js db/seed-baloane-heliu-extra.sql
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS addon_slugs TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS addon_exclude_slugs TEXT[];

-- ─── 1. Cele trei tarife de heliu ───
INSERT INTO products
  (slug, name, description, category_id, price_cents, stock, is_addon, is_active, addon_scope)
VALUES
  ('addon-heliu-simplu', 'Umflare cu heliu',
   'Balonul se livrează umflat cu heliu (balon simplu). Atenție: livrare doar în Iași.',
   (SELECT id FROM categories WHERE slug='extra'), 1500, 100000, TRUE, TRUE, ARRAY[]::text[]),
  ('addon-heliu-forma', 'Umflare cu heliu',
   'Balonul se livrează umflat cu heliu (formă/figurină). Atenție: livrare doar în Iași.',
   (SELECT id FROM categories WHERE slug='extra'), 2500, 100000, TRUE, TRUE, ARRAY[]::text[])
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents, addon_scope = EXCLUDED.addon_scope,
  is_active = EXCLUDED.is_active;

-- Heliul „mare" (50 lei) nu mai apare automat pe toată categoria baloane;
-- rămâne doar pe cifrele/literele de 100 cm, prin addon_slugs (pasul 2).
UPDATE products SET addon_scope = ARRAY[]::text[] WHERE slug = 'addon-heliu';

-- ─── 2. Ce tarif de heliu primește fiecare tip de balon ───
UPDATE products SET addon_slugs = ARRAY['addon-heliu']
  WHERE product_type IN ('folie-cifra', 'folie-litera');

UPDATE products SET addon_slugs = ARRAY['addon-heliu-simplu']
  WHERE product_type = 'baloane-latex';

UPDATE products SET addon_slugs = ARRAY['addon-heliu-forma']
  WHERE product_type IN ('folie-figurina', 'folie-ocazii', 'set-baloane');

-- Lumânările de tort și pachetele gata făcute (heliul e deja inclus în preț)
-- nu primesc opțiunea de heliu.
UPDATE products SET addon_slugs = NULL
  WHERE product_type = 'lumanari-tort' OR product_type LIKE 'pachet-%';

-- ─── 3. Baby shower: heliu (formă) + buchetul asortat + bomboane ───
UPDATE products SET addon_slugs = ARRAY['addon-heliu-forma', 'baby-girl', 'addon-bomboane']
  WHERE slug = 'set-baloane-baby-shower-fetita';
UPDATE products SET addon_slugs = ARRAY['addon-heliu-forma', 'baby-boy', 'addon-bomboane']
  WHERE slug = 'set-baloane-baby-shower-baietel';

COMMIT;
