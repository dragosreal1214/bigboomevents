-- ═══════════════════════════════════════════════════════════════════
--  Florărie: eticheta „criogenate" pe produsele cu flori criogenate.
--  Rulează: node scripts/run-sql.js db/seed-florarie-criogenate-2026-09.sql
--
--  Contextul: pe /florarie butoanele rapide de sus arată acum, pe lângă
--  tipurile de produs (buchet / cutie / coș), și patru „categorii" cerute de
--  client: Nuntă, Botez, Funerare, Flori criogenate. Ele filtrează pe
--  `products.occasions`, NU pe `product_type` — un produs are un singur tip,
--  dar poate avea mai multe ocazii, deci un buchet de nuntă rămâne și în
--  „Flori în buchet".
--
--  `nunta` / `botez` / `funerare` există deja ca ocazii în catalog; doar
--  `criogenate` e nouă, iar produsele se recunosc după text (nume/descriere).
--  Idempotent: adaugă eticheta doar dacă lipsește. Sigur pe prod — atinge
--  exclusiv coloana `occasions` a produselor din florărie care chiar sunt
--  criogenate. Etichetele puse manual din panou nu se pierd.
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

UPDATE products p
SET occasions = array_append(p.occasions, 'criogenate'), updated_at = now()
FROM categories c
WHERE c.id = p.category_id
  AND c.slug = 'florarie'
  AND p.is_addon = FALSE
  AND NOT ('criogenate' = ANY(p.occasions))
  AND (p.name ILIKE '%criogenat%' OR p.description ILIKE '%criogenat%');

COMMIT;
