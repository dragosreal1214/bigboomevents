-- ═══════════════════════════════════════════════════════════════════
--  BigBoomEvents — seed DOAR pentru extra-opțiuni (is_addon)
--  Sigur în producție: NU atinge produsele existente, doar inserează/
--  actualizează categoria ascunsă „extra" și cele 4 add-on-uri.
--  Rulează după schema.sql:  node scripts/run-sql.js db/seed-addons.sql
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- Categorie ascunsă pentru extra-opțiuni (nu apare ca filtru în shop).
INSERT INTO categories (slug, name, description, sort_order) VALUES
  ('extra', 'Extra opțiuni', 'Felicitări, bomboane, șampanie și ambalaje — adăugate pe pagina produsului.', 99)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

-- Extra-opțiuni (stoc mare: nu blochează comanda; prețul vine din DB).
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
