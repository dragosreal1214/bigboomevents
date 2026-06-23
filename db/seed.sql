-- ═══════════════════════════════════════════════════════════════════
--  BigBoomEvents — date demo
--  Rulează după schema.sql:  npm run db:seed
--  Idempotent: ON CONFLICT actualizează în loc să dubleze.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Categorii ───
INSERT INTO categories (slug, name, description, sort_order) VALUES
  ('florarie', 'Florărie', 'Buchete și aranjamente proaspete, pentru orice ocazie.', 1),
  ('baloane',  'Baloane',  'Arcade organice și compoziții din baloane, pe tema ta.', 2),
  ('fun',      'Fun',      'Accesorii de petrecere, surprize și mici bucurii.', 3)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order;

-- ─── Produse ───
-- Helper inline: luăm id-ul categoriei după slug.
INSERT INTO products
  (slug, name, description, category_id, price_cents, old_price_cents, stock, badge, occasions, colors, images, is_active)
VALUES
  ('buchet-blush',
   'Buchet «Blush»',
   'Buchet pastel din trandafiri, lisianthus și verdeață fină. Ambalat elegant în hârtie mată.',
   (SELECT id FROM categories WHERE slug='florarie'), 14900, NULL, 25, 'popular',
   ARRAY['aniversare','indragostiti','multumire'], ARRAY['roz','crem'],
   ARRAY['/assets/products/florarie.svg'], TRUE),

  ('aranjament-cutie-rotunda',
   'Aranjament cutie rotundă',
   'Aranjament cochet într-o cutie rotundă, cu spongie florală — ideal de cadou, stă fără vază.',
   (SELECT id FROM categories WHERE slug='florarie'), 19900, 22900, 18, 'reducere',
   ARRAY['aniversare','multumire','corporate'], ARRAY['roz','alb'],
   ARRAY['/assets/products/florarie.svg'], TRUE),

  ('trandafiri-pastel-9',
   'Trandafiri pastel · 9 fire',
   'Nouă trandafiri în nuanțe pastel, legați simplu și elegant.',
   (SELECT id FROM categories WHERE slug='florarie'), 16900, NULL, 30, NULL,
   ARRAY['indragostiti','aniversare'], ARRAY['roz','piersica'],
   ARRAY['/assets/products/florarie.svg'], TRUE),

  ('cutie-lalele',
   'Cutie cu lalele de sezon',
   'Lalele proaspete de sezon, aranjate într-o cutie pastel. Disponibilitate sezonieră.',
   (SELECT id FROM categories WHERE slug='florarie'), 13900, NULL, 0, NULL,
   ARRAY['primavara','multumire'], ARRAY['galben','roz','mov'],
   ARRAY['/assets/products/florarie.svg'], TRUE),

  ('arcada-organica-pastel',
   'Arcadă organică pastel',
   'Arcadă de baloane în compoziție organică, pe culorile evenimentului. Include montaj în zona Iași.',
   (SELECT id FROM categories WHERE slug='baloane'), 45000, NULL, 8, 'popular',
   ARRAY['nunta','botez','aniversare','corporate'], ARRAY['roz','albastru','mov'],
   ARRAY['/assets/products/baloane.svg'], TRUE),

  ('set-30-baloane-heliu',
   'Set 30 baloane heliu',
   'Treizeci de baloane umflate cu heliu, în culorile alese. Se ridică din locația noastră.',
   (SELECT id FROM categories WHERE slug='baloane'), 22000, NULL, 40, NULL,
   ARRAY['aniversare','botez'], ARRAY['roz','albastru','auriu'],
   ARRAY['/assets/products/baloane.svg'], TRUE),

  ('cifra-folie-baza',
   'Cifră folie + bază baloane',
   'Cifră din folie (la alegere) pe o bază de baloane asortate — vedeta mesei de tort.',
   (SELECT id FROM categories WHERE slug='baloane'), 18000, NULL, 15, 'nou',
   ARRAY['aniversare','botez'], ARRAY['auriu','argintiu','roz'],
   ARRAY['/assets/products/baloane.svg'], TRUE),

  ('confetti-popper-5',
   'Confetti popper · set 5',
   'Cinci tuburi de confetti pentru momentul „surpriză". Confetti din hârtie biodegradabilă.',
   (SELECT id FROM categories WHERE slug='fun'), 4900, NULL, 60, NULL,
   ARRAY['aniversare','revelion','absolvire'], ARRAY['multicolor'],
   ARRAY['/assets/products/fun.svg'], TRUE),

  ('cutie-surpriza-baloane',
   'Cutie surpriză cu baloane',
   'Cutie care, deschisă, eliberează baloane cu heliu și un mesaj personalizat.',
   (SELECT id FROM categories WHERE slug='fun'), 13000, NULL, 12, 'popular',
   ARRAY['indragostiti','aniversare','cerere'], ARRAY['roz','rosu'],
   ARRAY['/assets/products/fun.svg'], TRUE),

  ('banner-la-multi-ani',
   'Banner «La mulți ani»',
   'Banner reutilizabil, carton premium, litere cu folio. Se prinde ușor pe perete.',
   (SELECT id FROM categories WHERE slug='fun'), 3900, NULL, 80, NULL,
   ARRAY['aniversare'], ARRAY['auriu','roz'],
   ARRAY['/assets/products/fun.svg'], TRUE)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      category_id = EXCLUDED.category_id,
      price_cents = EXCLUDED.price_cents,
      old_price_cents = EXCLUDED.old_price_cents,
      stock = EXCLUDED.stock,
      badge = EXCLUDED.badge,
      occasions = EXCLUDED.occasions,
      colors = EXCLUDED.colors,
      images = EXCLUDED.images,
      is_active = EXCLUDED.is_active;

-- ─── Categorie ascunsă pentru extra-opțiuni ───
-- Nu apare ca filtru în shop (listCategories întoarce doar categoriile cu produse vizibile).
INSERT INTO categories (slug, name, description, sort_order) VALUES
  ('extra', 'Extra opțiuni', 'Felicitări, bomboane, șampanie și ambalaje — adăugate pe pagina produsului.', 99)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

-- ─── Extra-opțiuni (is_addon = TRUE) ───
-- Stoc mare: nu blochează comanda. Prețul vine din DB (sursa de adevăr la checkout).
INSERT INTO products
  (slug, name, description, category_id, price_cents, old_price_cents, stock, badge, occasions, colors, images, is_active, is_addon)
VALUES
  ('addon-felicitare',
   'Felicitare',
   'Felicitare elegantă cu mesajul tău personalizat scris de mână.',
   (SELECT id FROM categories WHERE slug='extra'), 0, NULL, 100000, NULL,
   '{}', '{}', ARRAY['/assets/products/felicitare.svg'], TRUE, TRUE),

  ('addon-bomboane',
   'Cutie bomboane',
   'Cutie de praline asortate, ambalată cadou.',
   (SELECT id FROM categories WHERE slug='extra'), 13500, NULL, 100000, NULL,
   '{}', '{}', ARRAY['/assets/products/bomboane.svg'], TRUE, TRUE),

  ('addon-sampanie',
   'Sticlă de șampanie',
   'O sticlă de vin spumant, alături de buchet.',
   (SELECT id FROM categories WHERE slug='extra'), 9000, NULL, 100000, NULL,
   '{}', '{}', ARRAY['/assets/products/sampanie.svg'], TRUE, TRUE),

  ('addon-punga',
   'Pungă cadou',
   'Pungă cadou premium, pentru un transport elegant.',
   (SELECT id FROM categories WHERE slug='extra'), 1200, NULL, 100000, NULL,
   '{}', '{}', ARRAY['/assets/products/punga.svg'], TRUE, TRUE)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      category_id = EXCLUDED.category_id,
      price_cents = EXCLUDED.price_cents,
      stock = EXCLUDED.stock,
      images = EXCLUDED.images,
      is_active = EXCLUDED.is_active,
      is_addon = EXCLUDED.is_addon;

COMMIT;
