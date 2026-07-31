-- ═══════════════════════════════════════════════════════════════════
--  Florărie, corecții 22.07.2026:
--   1. Scoate cele 3 „TRIO FESTIV" (fără poze / preț la cerere) din shop.
--   2. Tip nou 'cos' → chip-ul „Flori în coș" din filtrele rapide.
--  Idempotent: node scripts/run-sql.js db/seed-florarie-fix-2026-07-22.sql
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

-- 1. TRIO FESTIV — șterge; produsele comandate vreodată nu pot fi șterse
--    (FK order_items ON DELETE RESTRICT), deci pe acelea doar le dezactivăm.
UPDATE products SET is_active = FALSE
  WHERE slug IN ('trio-festiv', 'trio-festiv-premium', 'trio-festiv-deluxe')
    AND id IN (SELECT product_id FROM order_items);

DELETE FROM products
  WHERE slug IN ('trio-festiv', 'trio-festiv-premium', 'trio-festiv-deluxe')
    AND id NOT IN (SELECT product_id FROM order_items);

-- 2. Aranjamentele în coș primesc tipul propriu.
UPDATE products SET product_type = 'cos' WHERE slug IN ('cos-cu-trandafiri');

COMMIT;
