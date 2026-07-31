-- ═══════════════════════════════════════════════════════════════════
--  Party shop (baloane), corecții 23.07.2026:
--   1. Scoate șervețele / farfurii / pahare din extra-opțiunile party shop-ului
--      (rămân în DB, dar nu mai apar automat pe produsele din categoria baloane).
--   2. Curăță un add-on de test rămas dintr-o sesiune QA.
--  Idempotent: node scripts/run-sql.js db/seed-partyshop-fix-2026-07-23.sql
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

-- Golirea scope-ului = add-on-ul nu mai apare pe nicio categorie (doar dacă e
-- pus explicit pe un produs, prin addon_slugs). Îl dezactivăm și, ca să nu se
-- vadă nici dacă cineva îl referențiază greșit, îl marcăm inactiv.
UPDATE products
  SET addon_scope = ARRAY[]::text[], is_active = FALSE
  WHERE slug IN ('addon-servetele-party', 'addon-farfurie-party', 'addon-pahar-party');

-- Add-on de test rămas (nu e din catalogul real). Șterge doar dacă n-a fost comandat.
UPDATE products SET is_active = FALSE
  WHERE slug = 'qa-addon-test' AND id IN (SELECT product_id FROM order_items);
DELETE FROM products
  WHERE slug = 'qa-addon-test' AND id NOT IN (SELECT product_id FROM order_items);

COMMIT;
