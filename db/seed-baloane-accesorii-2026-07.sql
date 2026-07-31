-- Generat din „accesorii party (1).xlsx" (4 sheet-uri, 75 randuri).
-- Adauga DOAR produsele care nu existau deja in magazin: 60 din 75.
--   8 sarite  — existau deja (pachetele, baby shower, „Casa de Piatra").
--   7 sarite  — n-au pret in Excel (4 seturi de litere/Frozen + 3 farfurii simple).
-- Pune si ORDINEA de afisare (`sort_order`) pentru catalogul existent: fara ea
-- sortarea implicita era `created_at DESC`, care scotea cifrele 0-9 intercalate
-- pe cele trei culori si literele incepand de la U.
-- Idempotent: upsert pe slug. Sigur de rulat pe productie.

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- ── Ordinea pentru produsele care exista deja ─────────────────────────────
-- Cifrele: 0..9, iar in interiorul fiecarei cifre argintiu -> auriu -> roz-auriu.
UPDATE products p SET sort_order = 2000
     + (COALESCE(NULLIF(regexp_replace(p.name, '\D', '', 'g'), ''), '0'))::int * 10
     + CASE WHEN p.slug LIKE '%roz-auriu%' THEN 3
            WHEN p.slug LIKE '%auriu%'     THEN 2
            WHEN p.slug LIKE '%argintiu%'  THEN 1 ELSE 4 END
  FROM categories c
 WHERE c.id = p.category_id AND c.slug = 'baloane' AND p.product_type = 'folie-cifra'
   -- strict cifrele mari de 100cm: „Balon cifra 1, 30cm" ar da „130" din regexp
   -- si ar ateriza peste blocul literelor.
   AND p.name ~ '^Balon Folie Cifra [0-9]+$';

-- Literele: A..Z, aceeasi ordine de culori in interiorul fiecarei litere.
UPDATE products p SET sort_order = 3000
     + (ascii(upper(substring(p.name from 'Litera ([A-Za-z])'))) - 65) * 10
     + CASE WHEN p.slug LIKE '%roz-auriu%' THEN 3
            WHEN p.slug LIKE '%auriu%'     THEN 2
            WHEN p.slug LIKE '%argintiu%'  THEN 1 ELSE 4 END
  FROM categories c
 WHERE c.id = p.category_id AND c.slug = 'baloane' AND p.product_type = 'folie-litera'
   AND p.name ~ 'Litera [A-Za-z]';

-- Restul tipurilor existente: bloc fix + alfabetic in interiorul blocului.
WITH ord AS (
  SELECT p.id, 1000 + (row_number() OVER (ORDER BY p.name))::int AS so
    FROM products p JOIN categories c ON c.id = p.category_id
   WHERE c.slug = 'baloane' AND p.product_type = 'set-baloane'
) UPDATE products p SET sort_order = ord.so FROM ord WHERE ord.id = p.id;
WITH ord AS (
  SELECT p.id, 1100 + (row_number() OVER (ORDER BY p.name))::int AS so
    FROM products p JOIN categories c ON c.id = p.category_id
   WHERE c.slug = 'baloane' AND p.product_type = 'baby-shower'
) UPDATE products p SET sort_order = ord.so FROM ord WHERE ord.id = p.id;
WITH ord AS (
  SELECT p.id, 1200 + (row_number() OVER (ORDER BY p.name))::int AS so
    FROM products p JOIN categories c ON c.id = p.category_id
   WHERE c.slug = 'baloane' AND p.product_type = 'pachet-1-an'
) UPDATE products p SET sort_order = ord.so FROM ord WHERE ord.id = p.id;
WITH ord AS (
  SELECT p.id, 1210 + (row_number() OVER (ORDER BY p.name))::int AS so
    FROM products p JOIN categories c ON c.id = p.category_id
   WHERE c.slug = 'baloane' AND p.product_type = 'pachet-5-ani'
) UPDATE products p SET sort_order = ord.so FROM ord WHERE ord.id = p.id;
WITH ord AS (
  SELECT p.id, 1220 + (row_number() OVER (ORDER BY p.name))::int AS so
    FROM products p JOIN categories c ON c.id = p.category_id
   WHERE c.slug = 'baloane' AND p.product_type = 'pachet-18-ani'
) UPDATE products p SET sort_order = ord.so FROM ord WHERE ord.id = p.id;
WITH ord AS (
  SELECT p.id, 1230 + (row_number() OVER (ORDER BY p.name))::int AS so
    FROM products p JOIN categories c ON c.id = p.category_id
   WHERE c.slug = 'baloane' AND p.product_type = 'pachet-25-ani'
) UPDATE products p SET sort_order = ord.so FROM ord WHERE ord.id = p.id;
WITH ord AS (
  SELECT p.id, 1300 + (row_number() OVER (ORDER BY p.name))::int AS so
    FROM products p JOIN categories c ON c.id = p.category_id
   WHERE c.slug = 'baloane' AND p.product_type = 'pachet-bride'
) UPDATE products p SET sort_order = ord.so FROM ord WHERE ord.id = p.id;
WITH ord AS (
  SELECT p.id, 6000 + (row_number() OVER (ORDER BY p.name))::int AS so
    FROM products p JOIN categories c ON c.id = p.category_id
   WHERE c.slug = 'baloane' AND p.product_type = 'baloane-latex'
) UPDATE products p SET sort_order = ord.so FROM ord WHERE ord.id = p.id;
WITH ord AS (
  SELECT p.id, 6500 + (row_number() OVER (ORDER BY p.name))::int AS so
    FROM products p JOIN categories c ON c.id = p.category_id
   WHERE c.slug = 'baloane' AND p.product_type = 'lumanari-tort'
) UPDATE products p SET sort_order = ord.so FROM ord WHERE ord.id = p.id;

-- ── Produsele noi din Excel ───────────────────────────────────────────────

INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-cifra-1-30cm-baiat-albastru', 'Balon cifra 1, 30cm, Băiat (albastru)', 'Balon folie cifra 1, 30cm, albastru. Preț cu heliu: 25 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-cifra', '{}'::TEXT[], ARRAY['albastru']::TEXT[],
        ARRAY['/assets/products/balon-cifra-1-30cm-baiat-albastru.webp']::TEXT[], ARRAY['addon-heliu-simplu']::TEXT[], 2901, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-cifra-1-30cm-fata-roz', 'Balon cifra 1, 30cm, Fată (roz)', 'Balon folie cifra 1, 30cm, roz. Preț cu heliu: 25 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-cifra', '{}'::TEXT[], ARRAY['roz']::TEXT[],
        ARRAY['/assets/products/balon-cifra-1-30cm-fata-roz.webp']::TEXT[], ARRAY['addon-heliu-simplu']::TEXT[], 2902, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-barbie-cap-silueta', 'Balon Barbie cap (siluetă)', 'Balon folie siluetă cap Barbie, roz, 78cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['roz']::TEXT[],
        ARRAY['/assets/products/balon-barbie-cap-silueta.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4001, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-barbie-logo', 'Balon Barbie logo', 'Balon folie cu scrisul "Barbie", roz, 70x30cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['roz']::TEXT[],
        ARRAY['/assets/products/balon-barbie-logo.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4002, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-barbie-masina', 'Balon Barbie mașină', 'Balon folie Barbie cu mașină roz, 80x55cm. Preț cu heliu: 55 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['roz']::TEXT[],
        ARRAY['/assets/products/balon-barbie-masina.webp']::TEXT[], ARRAY['addon-heliu']::TEXT[], 4003, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-barbie-pantof', 'Balon Barbie pantof', 'Balon folie pantof cu toc Barbie, roz, 90cm. Preț cu heliu: 55 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['roz']::TEXT[],
        ARRAY['/assets/products/balon-barbie-pantof.webp']::TEXT[], ARRAY['addon-heliu']::TEXT[], 4004, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-floare-margareta', 'Balon Floare (margaretă)', 'Balon folie floare, alb cu mijloc galben, 90cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['alb']::TEXT[],
        ARRAY['/assets/products/balon-floare-margareta.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4005, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-lilo', 'Balon Lilo', 'Balon folie figurină Lilo (roz), 52x49cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['roz']::TEXT[],
        ARRAY['/assets/products/balon-lilo.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4006, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-luna-aurie', 'Balon Lună Aurie', 'Balon folie lună, auriu, 80cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['auriu']::TEXT[],
        ARRAY['/assets/products/balon-luna-aurie.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4007, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-minge-fotbal', 'Balon Minge Fotbal', 'Balon folie rotund, imprimeu minge de fotbal alb-negru, 40cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['alb','negru']::TEXT[],
        ARRAY['/assets/products/balon-minge-fotbal.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4008, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-nor', 'Balon Nor', 'Balon folie nor, crem/ivoriu, 48x45cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['crem']::TEXT[],
        ARRAY['/assets/products/balon-nor.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4009, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-ruj', 'Balon Ruj', 'Balon folie ruj, roșu/roz, 40x95cm. Preț cu heliu: 55 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', ARRAY['indragostiti']::TEXT[], ARRAY['rosu','roz']::TEXT[],
        ARRAY['/assets/products/balon-ruj.webp']::TEXT[], ARRAY['addon-heliu']::TEXT[], 4010, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-stea-3d-argintiu', 'Balon Stea 3D Argintiu', 'Balon folie stea 3D (explozie), argintiu, 66cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['argintiu']::TEXT[],
        ARRAY['/assets/products/balon-stea-3d-argintiu.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4011, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-stea-3d-auriu', 'Balon Stea 3D Auriu', 'Balon folie stea 3D (explozie), auriu, 66cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['auriu']::TEXT[],
        ARRAY['/assets/products/balon-stea-3d-auriu.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4012, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-stea-albastru-deschis-bleu', 'Balon Stea Albastru deschis (Bleu)', 'Balon folie stea simplă, albastru deschis (bleu), 45cm. Preț cu heliu: 25 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['albastru']::TEXT[],
        ARRAY['/assets/products/balon-stea-albastru-deschis-bleu.webp']::TEXT[], ARRAY['addon-heliu-simplu']::TEXT[], 4013, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-stea-albastru-inchis', 'Balon Stea Albastru închis', 'Balon folie stea simplă, albastru închis, 45cm. Preț cu heliu: 25 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['albastru']::TEXT[],
        ARRAY['/assets/products/balon-stea-albastru-inchis.webp']::TEXT[], ARRAY['addon-heliu-simplu']::TEXT[], 4014, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-stea-auriu', 'Balon Stea Auriu', 'Balon folie stea simplă, auriu, 45cm. Preț cu heliu: 25 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['auriu']::TEXT[],
        ARRAY['/assets/products/balon-stea-auriu.webp']::TEXT[], ARRAY['addon-heliu-simplu']::TEXT[], 4015, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-stitch', 'Balon Stitch', 'Balon folie figurină Stitch (albastru), 75x46cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['albastru']::TEXT[],
        ARRAY['/assets/products/balon-stitch.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4016, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-aniversar-mickey-tort', 'Balon aniversar Mickey (tort)', 'Balon folie tort aniversar Mickey Mouse, 80cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', ARRAY['aniversare']::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/balon-aniversar-mickey-tort.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4017, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-cap-mickey', 'Balon cap Mickey', 'Balon folie cap Mickey Mouse, 60cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/balon-cap-mickey.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4018, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-cap-minnie', 'Balon cap Minnie', 'Balon folie cap Minnie Mouse, funda roz cu buline, 60cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['roz']::TEXT[],
        ARRAY['/assets/products/balon-cap-minnie.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4019, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-cap-unicorn', 'Balon cap Unicorn', 'Balon folie cap unicorn, roz/alb, 118x50cm. Preț cu heliu: 55 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], ARRAY['alb','roz']::TEXT[],
        ARRAY['/assets/products/balon-cap-unicorn.webp']::TEXT[], ARRAY['addon-heliu']::TEXT[], 4020, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-carucior-baby-boy', 'Balon cărucior Baby Boy', 'Balon folie cărucior, imprimeu "Baby Boy" albastru, 39x29cm. Preț cu heliu: 55 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', ARRAY['botez']::TEXT[], ARRAY['albastru']::TEXT[],
        ARRAY['/assets/products/balon-carucior-baby-boy.webp']::TEXT[], ARRAY['addon-heliu']::TEXT[], 4021, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-carucior-baby-girl', 'Balon cărucior Baby Girl', 'Balon folie cărucior, imprimeu "Baby Girl" roz, 39x29cm. Preț cu heliu: 55 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', ARRAY['botez']::TEXT[], ARRAY['roz']::TEXT[],
        ARRAY['/assets/products/balon-carucior-baby-girl.webp']::TEXT[], ARRAY['addon-heliu']::TEXT[], 4022, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-figurina-albinuta', 'Balon figurină Albinuță', 'Balon folie figurină albinuță, 75x48cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/balon-figurina-albinuta.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4023, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-figurina-ambulanta', 'Balon figurină Ambulanță', 'Balon folie figurină ambulanță, 78x53cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/balon-figurina-ambulanta.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4024, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-inima-alb', 'Balon inimă Alb', 'Balon folie inimă, alb, 45cm. Preț cu heliu: 25 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', ARRAY['indragostiti']::TEXT[], ARRAY['alb']::TEXT[],
        ARRAY['/assets/products/balon-inima-alb.webp']::TEXT[], ARRAY['addon-heliu-simplu']::TEXT[], 4025, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-inima-auriu', 'Balon inimă Auriu', 'Balon folie inimă, auriu, 45cm. Preț cu heliu: 25 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', ARRAY['indragostiti']::TEXT[], ARRAY['auriu']::TEXT[],
        ARRAY['/assets/products/balon-inima-auriu.webp']::TEXT[], ARRAY['addon-heliu-simplu']::TEXT[], 4026, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-inima-crem', 'Balon inimă Crem', 'Balon folie inimă, crem, 45cm. Preț cu heliu: 25 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', ARRAY['indragostiti']::TEXT[], ARRAY['crem']::TEXT[],
        ARRAY['/assets/products/balon-inima-crem.webp']::TEXT[], ARRAY['addon-heliu-simplu']::TEXT[], 4027, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-inima-rosu', 'Balon inimă Roșu', 'Balon folie inimă, roșu, 45cm. Preț cu heliu: 25 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', ARRAY['indragostiti']::TEXT[], ARRAY['rosu']::TEXT[],
        ARRAY['/assets/products/balon-inima-rosu.webp']::TEXT[], ARRAY['addon-heliu-simplu']::TEXT[], 4028, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-rotund-45cm-1-an-baiat', 'Balon rotund 45cm "1 an" Băiat', 'Balon rotund 45cm, imprimeu "1 an" albastru, pentru băiat. Preț cu heliu: 25 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', ARRAY['aniversare']::TEXT[], ARRAY['albastru']::TEXT[],
        ARRAY['/assets/products/balon-rotund-45cm-1-an-baiat.webp']::TEXT[], ARRAY['addon-heliu-simplu']::TEXT[], 4029, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-rotund-45cm-1-an-fata', 'Balon rotund 45cm "1 an" Fată', 'Balon rotund 45cm, imprimeu "1 an" roz, pentru fată. Preț cu heliu: 25 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', ARRAY['aniversare']::TEXT[], ARRAY['roz']::TEXT[],
        ARRAY['/assets/products/balon-rotund-45cm-1-an-fata.webp']::TEXT[], ARRAY['addon-heliu-simplu']::TEXT[], 4030, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-rotund-avengers', 'Balon rotund Avengers', 'Balon folie rotund, imprimeu Avengers, 45cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/balon-rotund-avengers.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4031, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-rotund-lilo-stitch', 'Balon rotund Lilo & Stitch', 'Balon folie rotund, imprimeu Lilo & Stitch, 46cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-figurina', '{}'::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/balon-rotund-lilo-stitch.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 4032, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-inel', 'Balon Inel', 'Balon folie inel cu piatră, auriu/multicolor, 67x61cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-ocazii', ARRAY['nunta']::TEXT[], ARRAY['auriu']::TEXT[],
        ARRAY['/assets/products/balon-inel.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 5001, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-masina-just-married', 'Balon Mașină "Just Married"', 'Balon folie mașină argintie, text "Just Married / Mr & Mrs", 60cm. Preț cu heliu: 55 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-ocazii', ARRAY['nunta']::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/balon-masina-just-married.webp']::TEXT[], ARRAY['addon-heliu']::TEXT[], 5002, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-porumbel', 'Balon Porumbel', 'Balon folie porumbel, alb, 78x45cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-ocazii', ARRAY['nunta']::TEXT[], ARRAY['alb']::TEXT[],
        ARRAY['/assets/products/balon-porumbel.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 5003, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-trofeu-congrats-grad', 'Balon Trofeu "Congrats Grad"', 'Balon folie cupă/trofeu auriu, text "Congrats Grad", 72x65cm. Preț cu heliu: 35 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-ocazii', ARRAY['absolvire']::TEXT[], ARRAY['auriu']::TEXT[],
        ARRAY['/assets/products/balon-trofeu-congrats-grad.webp']::TEXT[], ARRAY['addon-heliu-forma']::TEXT[], 5004, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('balon-sticla-sampanie', 'Balon sticlă Șampanie', 'Balon folie sticlă șampanie, verde/auriu, 100x50cm. Preț cu heliu: 55 lei (umflarea se adaugă ca opțiune; heliu doar în Iași).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'folie-ocazii', '{}'::TEXT[], ARRAY['auriu','verde']::TEXT[],
        ARRAY['/assets/products/balon-sticla-sampanie.webp']::TEXT[], ARRAY['addon-heliu']::TEXT[], 5005, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('cake-topper-happy-birthday', 'Cake Topper "Happy Birthday"', 'Topper tort "Happy Birthday", auriu (oglindă), 17cm.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'acc-cake-topper', ARRAY['aniversare']::TEXT[], ARRAY['auriu']::TEXT[],
        ARRAY['/assets/products/cake-topper-happy-birthday.webp']::TEXT[], NULL, 7001, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('farfurie-inima-happy-birthday-roz', 'Farfurie inimă Happy Birthday (roz)', 'Farfurie carton formă inimă, roz, imprimeu "Happy Birthday", set de 10 buc.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 900, 25,
        'acc-farfurii', ARRAY['aniversare']::TEXT[], ARRAY['roz']::TEXT[],
        ARRAY['/assets/products/farfurie-inima-happy-birthday-roz.webp']::TEXT[], NULL, 7101, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('farfurie-inima-happy-birthday-turcoaz', 'Farfurie inimă Happy Birthday (turcoaz)', 'Farfurie carton formă inimă, turcoaz, imprimeu "Happy Birthday", set de 10 buc.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 900, 25,
        'acc-farfurii', ARRAY['aniversare']::TEXT[], ARRAY['turcoaz']::TEXT[],
        ARRAY['/assets/products/farfurie-inima-happy-birthday-turcoaz.webp']::TEXT[], NULL, 7102, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('pahare-frozen', 'Pahare Frozen', 'Pahare carton, imprimeu Frozen, 8.5cm, set de 10 buc.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 900, 25,
        'acc-pahare', '{}'::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/pahare-frozen.webp']::TEXT[], NULL, 7201, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('servetele-frozen', 'Șervețele Frozen', 'Șervețele hârtie, imprimeu Frozen, set de 10 buc.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 900, 25,
        'acc-servetele', '{}'::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/servetele-frozen.webp']::TEXT[], NULL, 7301, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('servetele-happy-birthday', 'Șervețele Happy Birthday', 'Șervețele hârtie, imprimeu "Happy Birthday" multicolor, set de 10 buc.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 900, 25,
        'acc-servetele', ARRAY['aniversare']::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/servetele-happy-birthday.webp']::TEXT[], NULL, 7302, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('coif-petrecere-frozen', 'Coif petrecere Frozen', 'Coif petrecere carton, imprimeu Frozen (Elsa & Anna), set de 10 buc.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 900, 25,
        'acc-coifuri', '{}'::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/coif-petrecere-frozen.webp']::TEXT[], NULL, 7401, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('coif-petrecere-patrula-catelusilor', 'Coif petrecere Patrula Cățelușilor', 'Coif petrecere carton, imprimeu Patrula Cățelușilor, set de 10 buc.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 900, 25,
        'acc-coifuri', '{}'::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/coif-petrecere-patrula-catelusilor.webp']::TEXT[], NULL, 7402, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('pachet-photo-props-1', 'Pachet Photo Props 1', 'Set 12 accesorii foto pe băț (baloane, ochelari, măști, mustăți).',
        (SELECT id FROM categories WHERE slug = 'baloane'), 3500, 25,
        'acc-photo-props', '{}'::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/pachet-photo-props-1.webp']::TEXT[], NULL, 7501, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('pachet-photo-props-2', 'Pachet Photo Props 2', 'Photo Booth Kit, 12 deghizări/accesorii pe băț + set "Legend".',
        (SELECT id FROM categories WHERE slug = 'baloane'), 3500, 25,
        'acc-photo-props', '{}'::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/pachet-photo-props-2.webp']::TEXT[], NULL, 7502, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('ghirlanda-hawaiana', 'Ghirlandă Hawaiană', 'Ghirlandă hawaiană textilă, roz.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 900, 25,
        'acc-ghirlande', '{}'::TEXT[], ARRAY['roz']::TEXT[],
        ARRAY['/assets/products/ghirlanda-hawaiana.webp']::TEXT[], NULL, 7601, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('cutie-gender-reveal-baiat', 'Cutie Gender Reveal Băiat', 'Cutie cadou "It''s a Boy", bleu, 30x30x30cm.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 3500, 25,
        'acc-gender-reveal', ARRAY['gender-reveal']::TEXT[], ARRAY['albastru']::TEXT[],
        ARRAY['/assets/products/cutie-gender-reveal-baiat.webp']::TEXT[], NULL, 7701, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('cutie-gender-reveal-fata', 'Cutie Gender Reveal Fată', 'Cutie cadou "It''s a Girl", roz, 30x30x30cm.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 3500, 25,
        'acc-gender-reveal', ARRAY['gender-reveal']::TEXT[], ARRAY['roz']::TEXT[],
        ARRAY['/assets/products/cutie-gender-reveal-fata.webp']::TEXT[], NULL, 7702, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('placuta-pentru-cea-mai-buna-nasa', 'Plăcuță "Pentru cea mai bună nașă"', 'Plăcuță lemn formă inimă, imprimeu lavandă, text "Pentru cea mai bună nașă!".',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'acc-placute', ARRAY['nunta']::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/placuta-pentru-cea-mai-buna-nasa.webp']::TEXT[], NULL, 7801, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('placuta-pentru-cea-mai-buna-sotie', 'Plăcuță "Pentru cea mai bună soție"', 'Plăcuță lemn formă inimă, imprimeu trandafiri roșii, text "Pentru cea mai bună soție!".',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'acc-placute', ARRAY['nunta']::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/placuta-pentru-cea-mai-buna-sotie.webp']::TEXT[], NULL, 7802, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('placuta-pentru-cel-mai-bun-nas', 'Plăcuță "Pentru cel mai bun naș"', 'Plăcuță lemn formă inimă, imprimeu lavandă, text "Pentru cel mai bun naș!".',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'acc-placute', ARRAY['nunta']::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/placuta-pentru-cel-mai-bun-nas.webp']::TEXT[], NULL, 7803, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('placuta-pentru-cel-mai-bun-sot', 'Plăcuță "Pentru cel mai bun soț"', 'Plăcuță lemn formă inimă, imprimeu floarea-soarelui, text "Pentru cel mai bun soț!".',
        (SELECT id FROM categories WHERE slug = 'baloane'), 1500, 25,
        'acc-placute', ARRAY['nunta']::TEXT[], '{}'::TEXT[],
        ARRAY['/assets/products/placuta-pentru-cel-mai-bun-sot.webp']::TEXT[], NULL, 7804, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('tablite-groom-bride-alb', 'Tăblițe Groom & Bride - Alb', 'Set 2 tăblițe decorative "Groom" și "Bride", fundal alb, text negru.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 2500, 25,
        'acc-tablite', ARRAY['nunta']::TEXT[], ARRAY['alb','negru']::TEXT[],
        ARRAY['/assets/products/tablite-groom-bride-alb.webp']::TEXT[], NULL, 7901, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('tablite-groom-bride-negru', 'Tăblițe Groom & Bride - Negru', 'Set 2 tăblițe decorative "Groom" și "Bride", fundal negru, text alb.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 2500, 25,
        'acc-tablite', ARRAY['nunta']::TEXT[], ARRAY['alb','negru']::TEXT[],
        ARRAY['/assets/products/tablite-groom-bride-negru.webp']::TEXT[], NULL, 7902, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('punga-cadou-valentine-s-day-model-1', 'Pungă cadou Valentine''s Day - model 1', 'Pungă cadou hârtie, imprimeu păsărele și inimioare, roz/mov.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 900, 25,
        'acc-pungi', ARRAY['indragostiti']::TEXT[], ARRAY['mov','roz']::TEXT[],
        ARRAY['/assets/products/punga-cadou-valentine-s-day-model-1.webp']::TEXT[], NULL, 8001, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();
INSERT INTO products (slug, name, description, category_id, price_cents, stock,
       product_type, occasions, colors, images, addon_slugs, sort_order, is_active)
VALUES ('punga-cadou-valentine-s-day-model-2', 'Pungă cadou Valentine''s Day - model 2', 'Pungă cadou hârtie, imprimeu păsărele și inimă, turcoaz.',
        (SELECT id FROM categories WHERE slug = 'baloane'), 900, 25,
        'acc-pungi', ARRAY['indragostiti']::TEXT[], ARRAY['turcoaz']::TEXT[],
        ARRAY['/assets/products/punga-cadou-valentine-s-day-model-2.webp']::TEXT[], NULL, 8002, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
  product_type = EXCLUDED.product_type, occasions = EXCLUDED.occasions, colors = EXCLUDED.colors,
  images = EXCLUDED.images, addon_slugs = EXCLUDED.addon_slugs, sort_order = EXCLUDED.sort_order,
  is_active = TRUE, updated_at = now();

COMMIT;
