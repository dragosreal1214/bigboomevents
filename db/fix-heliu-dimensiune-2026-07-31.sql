-- Heliul se ofera ca extra-optiune DOAR la baloanele de 45 cm si peste.
-- Preturile afisate raman fara heliu; umflarea e optiune separata.
--
-- Se scoate add-on-ul de la cele de 30 cm: 11 baloane latex + 2 cifre mici.
--
-- NU se ating trei baloane la care regula intra in conflict cu propria voastra
-- lista de preturi din Excel, care le da explicit tarif de heliu:
--   Balon carucior Baby Boy / Baby Girl  — 39x29 cm, heliu 55 lei
--   Balon Minge Fotbal                   — 40 cm,    heliu 35 lei
-- Daca trebuie scoase si ele, adauga-le in filtrul de mai jos.
--
-- Idempotent: rulat de doua ori nu schimba nimic in plus.

BEGIN;

UPDATE products p
   SET addon_slugs = NULL,
       -- descrierea generica promitea „Baloane cu heliu"; fara optiune, ar induce
       -- in eroare exact pe pagina unde heliul nu mai poate fi cumparat
       description = regexp_replace(
         p.description,
         E'\\n+Baloane cu heliu pentru petreceri[^\\n]*', '', 'g'),
       updated_at = now()
  FROM categories c
 WHERE c.id = p.category_id
   AND c.slug = 'baloane'
   AND p.addon_slugs IS NOT NULL
   AND (p.product_type = 'baloane-latex' OR p.slug LIKE 'balon-cifra-1-30cm-%');

COMMIT;
