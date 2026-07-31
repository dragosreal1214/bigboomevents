-- Doua lumanari de cununie in categoria `florarie`, ocazia `nunta`.
-- Pret 390 lei BUCATA (nu pereche) — precizat si in descriere, ca sa nu existe
-- confuzie: mirii cumpara de obicei doua.
--
-- Diferenta care conteaza la retur:
--   flori CRIOGENATE  -> nu sunt perisabile -> returnable = TRUE (suprascriere)
--   flori NATURALE    -> perisabile -> returnable = NULL -> cade pe regula
--                        categoriei `florarie`, deci exceptat de la retragere.
--
-- Idempotent: upsert pe slug.

BEGIN;

INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, sort_order, returnable, is_active)
VALUES (
  'lumanare-cununie-flori-criogenate',
  'Lumânare cununie cu flori criogenate',
  'Lumânare de cununie cu aranjament din flori criogenate: hortensie și trandafiri albi stabilizați, frunziș auriu, accente de perle și inimă aurie, pe lumânare canelată albă. Florile criogenate nu se ofilesc — aranjamentul rămâne intact și după eveniment. Preț pe bucată.',
  (SELECT id FROM categories WHERE slug = 'florarie'), 39000, 10,
  'lumanari-cununie', ARRAY['nunta']::TEXT[], ARRAY['alb','auriu']::TEXT[],
  ARRAY['/assets/products/lumanare-cununie-flori-criogenate.webp']::TEXT[],
  501, TRUE, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, sort_order = EXCLUDED.sort_order, returnable = EXCLUDED.returnable,
  is_active = TRUE, updated_at = now();

INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, sort_order, returnable, is_active)
VALUES (
  'lumanare-cununie-mov-flori-naturale',
  'Lumânare cununie mov cu flori naturale',
  'Lumânare de cununie cu aranjament din flori naturale, în nuanțe de mov și roz pal: lavandă, mini-rosa și eustoma, legate cu panglici de mătase. Se pregătește proaspăt pentru ziua evenimentului. Preț pe bucată.',
  (SELECT id FROM categories WHERE slug = 'florarie'), 39000, 10,
  'lumanari-cununie', ARRAY['nunta']::TEXT[], ARRAY['mov','roz']::TEXT[],
  ARRAY['/assets/products/lumanare-cununie-mov-flori-naturale.webp']::TEXT[],
  502, NULL, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, sort_order = EXCLUDED.sort_order, returnable = EXCLUDED.returnable,
  is_active = TRUE, updated_at = now();

COMMIT;
