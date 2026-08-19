-- ═══════════════════════════════════════════════════════════════════
--  Tipurile de produs pe categorie (product_types)
--  Idempotent (upsert pe category_id + slug) — SIGUR de rulat pe prod:
--  atinge DOAR tabelul product_types, nimic din catalog sau comenzi.
--
--  Valorile de aici sunt exact cele care erau hardcodate în admin.js și
--  shop.js. `sort_order` dictează ordinea în panou, în bara de filtre ȘI
--  ordinea blocurilor de produse în shop (sortarea implicită „recomandat").
--  Ordinea cerută de client la baloane: figurine → ocazii speciale → cifre
--  → litere, imediat după blocul „populare".
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

INSERT INTO product_types (category_id, slug, name, group_label, is_quick, in_sidebar, sort_order)
SELECT c.id, v.slug, v.name, v.group_label, v.is_quick, v.in_sidebar, v.sort_order
FROM (VALUES
  -- ── FLORĂRIE ──
  ('florarie', 'buchet',            'Flori în buchet',        NULL,                  TRUE,  TRUE,  10),
  ('florarie', 'cutie',             'Flori în cutie',         NULL,                  TRUE,  TRUE,  20),
  ('florarie', 'cos',               'Flori în coș',           NULL,                  TRUE,  TRUE,  30),

  -- ── BALOANE ── figurinele primele, imediat după blocul „populare"
  ('baloane',  'folie-figurina',    'Figurină',               'Baloane folie',       TRUE,  TRUE,  10),
  ('baloane',  'folie-ocazii',      'Ocazii speciale',        'Baloane folie',       TRUE,  TRUE,  20),
  ('baloane',  'folie-cifra',       'Cifră',                  'Baloane folie',       TRUE,  TRUE,  30),
  ('baloane',  'folie-litera',      'Literă',                 'Baloane folie',       TRUE,  TRUE,  40),
  ('baloane',  'baloane-latex',     'Baloane latex',          NULL,                  TRUE,  TRUE,  50),
  ('baloane',  'lumanari-tort',     'Lumânări tort',          NULL,                  TRUE,  TRUE,  60),

  ('baloane',  'pachet-1-an',       'Pachet 1 An',            'Set baloane',         FALSE, TRUE,  70),
  ('baloane',  'pachet-5-ani',      'Pachet 5 Ani',           'Set baloane',         FALSE, TRUE,  75),
  ('baloane',  'pachet-18-ani',     'Pachet 18 Ani',          'Set baloane',         FALSE, TRUE,  80),
  ('baloane',  'pachet-25-ani',     'Pachet 25 Ani',          'Set baloane',         FALSE, TRUE,  85),
  ('baloane',  'pachet-30-ani',     'Pachet 30 Ani',          'Set baloane',         FALSE, TRUE,  90),
  ('baloane',  'pachet-50-ani',     'Pachet 50 Ani',          'Set baloane',         FALSE, TRUE,  95),
  ('baloane',  'pachet-80-ani',     'Pachet 80 Ani',          'Set baloane',         FALSE, TRUE, 100),
  ('baloane',  'baby-shower',       'Baby Shower',            'Set baloane',         FALSE, TRUE, 105),
  ('baloane',  'pachet-bride',      'Pachet Bride',           'Set baloane',         FALSE, TRUE, 110),
  ('baloane',  'set-baloane',       'Altele',                 'Set baloane',         FALSE, FALSE, 115),

  ('baloane',  'acc-cake-topper',   'Cake topper',            'Accesorii petrecere', FALSE, TRUE, 200),
  ('baloane',  'acc-farfurii',      'Farfurii',               'Accesorii petrecere', FALSE, TRUE, 205),
  ('baloane',  'acc-pahare',        'Pahare',                 'Accesorii petrecere', FALSE, TRUE, 210),
  ('baloane',  'acc-servetele',     'Șervețele',              'Accesorii petrecere', FALSE, TRUE, 215),
  ('baloane',  'acc-coifuri',       'Coifuri',                'Accesorii petrecere', FALSE, TRUE, 220),
  ('baloane',  'acc-photo-props',   'Photo props',            'Accesorii petrecere', FALSE, TRUE, 225),
  ('baloane',  'acc-ghirlande',     'Ghirlande',              'Accesorii petrecere', FALSE, TRUE, 230),
  ('baloane',  'acc-gender-reveal', 'Gender reveal',          'Accesorii petrecere', FALSE, TRUE, 235),
  ('baloane',  'acc-placute',       'Plăcuțe cadou',          'Accesorii petrecere', FALSE, TRUE, 240),
  ('baloane',  'acc-tablite',       'Tăblițe Groom & Bride',  'Accesorii petrecere', FALSE, TRUE, 245),
  ('baloane',  'acc-pungi',         'Pungi cadou',            'Accesorii petrecere', FALSE, TRUE, 250),
  ('baloane',  'accesorii-party',   'Altele',                 'Accesorii petrecere', FALSE, FALSE, 255)
) AS v(cat_slug, slug, name, group_label, is_quick, in_sidebar, sort_order)
JOIN categories c ON c.slug = v.cat_slug
ON CONFLICT (category_id, slug) DO UPDATE SET
  name        = EXCLUDED.name,
  group_label = EXCLUDED.group_label,
  sort_order  = EXCLUDED.sort_order;
  -- is_quick / in_sidebar NU se suprascriu: sunt alegeri făcute de client din
  -- panou, iar o re-rulare a seed-ului nu are voie să i le anuleze.

COMMIT;
