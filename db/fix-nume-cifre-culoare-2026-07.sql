-- Baloanele-cifra pareau duplicate in shop: cifrele 0-9 exista in trei culori
-- (argintiu, auriu, roz-auriu), fiecare cu slug, imagine si stoc propriu, DAR
-- toate trei aveau exact acelasi nume — „Balon Folie Cifra 5". In grila ieseau
-- ca acelasi produs repetat de trei ori.
--
-- NU sunt duplicate: verificat ca niciun produs nu imparte imaginea cu altul si
-- ca fiecare varianta are `colors` propriu. Stergerea ar fi eliminat marfa reala.
-- Solutia e sa punem culoarea in nume.
--
-- Idempotent: nu atinge randurile care au deja culoarea in nume.
-- Slug-urile raman neschimbate, deci URL-urile si istoricul comenzilor sunt intacte.

BEGIN;

UPDATE products p
   SET name = p.name || ' ' || CASE
         WHEN p.slug LIKE '%-roz-auriu' THEN 'Roz-auriu'
         WHEN p.slug LIKE '%-auriu'     THEN 'Auriu'
         WHEN p.slug LIKE '%-argintiu'  THEN 'Argintiu'
       END,
       updated_at = now()
  FROM categories c
 WHERE c.id = p.category_id
   AND c.slug = 'baloane'
   AND p.product_type = 'folie-cifra'
   AND p.name ~ '^Balon Folie Cifra [0-9]+$'          -- doar cele fara culoare in nume
   AND (p.slug LIKE '%-argintiu' OR p.slug LIKE '%-auriu' OR p.slug LIKE '%-roz-auriu');

COMMIT;
