-- Poza reala pentru extra-optiunea „Punga cadou".
-- Doar UPDATE pe un rand existent — sigur pe productie.
BEGIN;

UPDATE products SET
  description = 'Pungă cadou din carton crem, cu bază pătrată și mânere din șnur textil — potrivită pentru buchete în cutie și aranjamente înalte.',
  images      = ARRAY['/assets/products/addon-punga.webp']::TEXT[],
  updated_at  = now()
WHERE slug = 'addon-punga';

COMMIT;
