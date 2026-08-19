-- ═══════════════════════════════════════════════════════════════════
--  Extra-opțiuni pentru florile funerare
--  Sigur în producție: adaugă un add-on nou și configurează DOAR produsele
--  cu ocazia „funerare". Nu atinge prețuri, stocuri sau alte produse.
--  Rulează: node scripts/run-sql.js db/seed-funerare.sql
--
--  Cerința: la florile funerare nu se oferă șampanie, pungă sau bomboane, iar
--  felicitarea e înlocuită de un mesaj scris pe panglică — tot gratuit.
--  Mecanismul e cel existent (vezi CLAUDE.md): `addon_exclude_slugs` scoate
--  add-on-urile de categorie, `addon_slugs` adaugă unul specific produsului.
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

INSERT INTO products
  (slug, name, description, category_id, price_cents, old_price_cents, stock, badge,
   occasions, colors, images, is_active, is_addon, addon_scope)
VALUES
  ('addon-mesaj-panglica',
   'Mesaj pe panglică',
   'Mesajul tău de omagiu, scris pe panglica aranjamentului. Gratuit.',
   (SELECT id FROM categories WHERE slug='extra'), 0, NULL, 100000, NULL,
   '{}', '{}', ARRAY['/assets/products/mesaj-panglica.svg'], TRUE, TRUE,
   -- scope gol = nu apare singur nicăieri; se atașează explicit, pe produs.
   ARRAY[]::TEXT[])
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents, images = EXCLUDED.images,
  is_active = TRUE, is_addon = TRUE, addon_scope = EXCLUDED.addon_scope;

-- Produsele funerare: fără șampanie / pungă / bomboane / felicitare, cu mesajul pe panglică.
UPDATE products SET
  addon_exclude_slugs = ARRAY['addon-felicitare','addon-bomboane','addon-sampanie','addon-punga'],
  addon_slugs         = ARRAY['addon-mesaj-panglica']
WHERE 'funerare' = ANY(occasions) AND is_addon = FALSE;

COMMIT;
