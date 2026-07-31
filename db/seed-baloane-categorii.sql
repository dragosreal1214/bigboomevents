-- ═══════════════════════════════════════════════════════════════════
--  Baloane — 3 categorii principale (folie / latex / set) cu sub-tipuri,
--  + prioritizarea pachetelor (Bride, 1 An, Majorat) sus, recomandate.
--  Rulează: node scripts/run-sql.js db/seed-baloane-categorii.sql
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

-- ─── 1. Re-etichetare product_type în tipuri-frunză ───
-- Baloane folie
UPDATE products SET product_type = 'folie-cifra'
  WHERE product_type IN ('numar-argintiu', 'numar-auriu', 'numar-roz-auriu');
-- (folie-litera și baloane-latex rămân la fel)

-- Set baloane — pachete pe vârstă + Bride + baby shower
UPDATE products SET product_type = 'pachet-1-an'   WHERE slug = 'pachet-baloane-aniversare-1-an';
UPDATE products SET product_type = 'pachet-5-ani'  WHERE slug = 'pachet-baloane-aniversare-5-ani';
UPDATE products SET product_type = 'pachet-18-ani' WHERE slug = 'pachet-baloane-aniversare-18-ani';
UPDATE products SET product_type = 'pachet-25-ani' WHERE slug = 'pachet-baloane-aniversare-25-ani';
UPDATE products SET product_type = 'pachet-bride'  WHERE slug = 'pachet-baloane-bride-petrecere-burlacite';
UPDATE products SET product_type = 'baby-shower'
  WHERE slug IN ('set-baloane-baby-shower-fetita', 'set-baloane-baby-shower-baietel');
-- restul seturilor (frozen, welcome, casa de piatră, la mulți ani) rămân 'set-baloane'

-- ─── 2. Cele 3 pachete populare — badge + sus (created_at eșalonat) ───
UPDATE products SET badge = 'popular', created_at = now()
  WHERE slug = 'pachet-baloane-bride-petrecere-burlacite';
UPDATE products SET badge = 'popular', created_at = now() - interval '2 seconds'
  WHERE slug = 'pachet-baloane-aniversare-1-an';
UPDATE products SET badge = 'popular', created_at = now() - interval '4 seconds'
  WHERE slug = 'pachet-baloane-aniversare-18-ani';

-- ─── 3. Ordine: Set baloane → Baloane folie → Baloane latex (latex ultimul),
--        iar seturile cu personaje (baby shower / Frozen) sus, după cele 3 populare. ───
-- Tier 2: seturi cu personaje — imediat sub cele 3 pachete populare
UPDATE products SET created_at = now() - interval '30 seconds'
  WHERE product_type = 'baby-shower'
     OR slug IN ('set-5-baloane-folie-frozen-elsa', 'set-5-baloane-folie-olaf-frozen');
-- Tier 3: restul pachetelor/seturilor
UPDATE products SET created_at = now() - interval '2 minutes'
  WHERE category_id = (SELECT id FROM categories WHERE slug='baloane') AND is_addon = FALSE
    AND product_type IN ('pachet-5-ani', 'pachet-25-ani', 'set-baloane');
-- Tier 4: baloane folie (cifre + litere) + lumânări
UPDATE products SET created_at = now() - interval '30 minutes'
  WHERE product_type IN ('folie-cifra', 'folie-litera', 'lumanari-tort');
-- Tier 5: baloane latex — cele mai jos (ultima categorie)
UPDATE products SET created_at = now() - interval '2 hours'
  WHERE product_type = 'baloane-latex';

-- ─── 4. Text SEO în descrieri (idempotent — doar dacă lipsește) ───
-- Latex: menționează baloane cu heliu + petreceri + Iași
UPDATE products SET description = description ||
  E'\n\nBaloane cu heliu pentru petreceri, aniversări, botez sau majorat — party shop în Iași. Livrare heliu doar în Iași.'
  WHERE product_type = 'baloane-latex' AND description NOT ILIKE '%cu heliu%';
-- Lumânări tort: accesorii de petrecere
UPDATE products SET description = description ||
  E'\n\nAccesorii de petrecere pentru aniversări și evenimente — party shop Iași.'
  WHERE product_type = 'lumanari-tort' AND description NOT ILIKE '%party shop%';
-- Seturi / baby shower: baloane cu heliu pentru evenimente
UPDATE products SET description = description ||
  E'\n\nSet de baloane cu heliu pentru petreceri, baby shower și evenimente — livrare în Iași.'
  WHERE product_type IN ('baby-shower', 'set-baloane') AND description NOT ILIKE '%cu heliu%';

COMMIT;
