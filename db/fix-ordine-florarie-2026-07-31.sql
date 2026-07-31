-- Ordinea de afisare pentru florarie. Migrarea anterioara a pus `sort_order`
-- doar pe categoria `baloane`, deci florariile ramasesera pe 0 — iar sortarea
-- „recomandat" (`(sort_order = 0), sort_order, name`) le impingea DUPA toate
-- baloanele pe pagina /shop, desi floraria e catalogul principal.
--
-- Blocuri sub cele ale baloanelor (care incep de la 1000), ca florile sa vina
-- primele in listarea generala:
--    100  buchete
--    300  cutii
--    400  cosuri
--    500  lumanari de cununie
--    900  restul / tip nesetat
-- Idempotent: recalculeaza aceleasi valori la fiecare rulare.

BEGIN;

WITH ord AS (
  SELECT p.id,
         CASE p.product_type
           WHEN 'buchet'           THEN 100
           WHEN 'cutie'            THEN 300
           WHEN 'cos'              THEN 400
           WHEN 'lumanari-cununie' THEN 500
           ELSE 900
         END
         + (row_number() OVER (PARTITION BY p.product_type ORDER BY p.name))::int AS so
    FROM products p
    JOIN categories c ON c.id = p.category_id
   WHERE c.slug = 'florarie' AND NOT p.is_addon
)
UPDATE products p SET sort_order = ord.so, updated_at = now()
  FROM ord WHERE ord.id = p.id;

COMMIT;
