-- Actualizeaza cele doua extra-optiuni cu produsele reale si preturile noi.
-- Doar UPDATE pe randuri existente (nu creeaza add-on-uri noi), deci sigur pe prod.
BEGIN;

UPDATE products SET
  name        = 'Cutie bomboane The Belgian',
  description = 'Cutie de trufe de ciocolată The Belgian, Cocoa Dusted Truffles Original, 200 g. Se livrează alături de comandă, ambalată cadou.',
  price_cents = 4500,
  images      = ARRAY['/assets/products/addon-bomboane.webp']::TEXT[],
  is_active   = TRUE,
  updated_at  = now()
WHERE slug = 'addon-bomboane';

UPDATE products SET
  name        = 'Vin spumant Cava Brut Pupitre 0.75l',
  description = 'Vin spumant Cava Brut Pupitre, metodă tradițională, 0.75 l. Se livrează alături de comandă.',
  price_cents = 9500,
  images      = ARRAY['/assets/products/addon-sampanie.webp']::TEXT[],
  is_active   = TRUE,
  updated_at  = now()
WHERE slug = 'addon-sampanie';

COMMIT;
