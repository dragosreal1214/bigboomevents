-- ═══════════════════════════════════════════════════════════════════
--  BigBoomEvents — sync catalog florărie după Excel (iulie 2026)
--  SIGUR pe prod: atinge DOAR categoria florărie. Nu re-adaugă demo baloane/fun.
--  Rulează: node scripts/run-sql.js db/seed-florarie-2026-07.sql
--  IMPORTANT: rulează întâi schema.sql (adaugă coloana product_type):
--             node scripts/run-sql.js db/schema.sql
--  Conține: cele 20 de produse din Excel (descriere+compoziție, imagini webp,
--           ocazii, preț), tipul aranjamentului și scoaterea restului din florărie.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Catalogul florărie = cele 20 din Excel (upsert idempotent pe slug) ───
INSERT INTO products
  (slug, name, description, category_id, price_cents, old_price_cents, stock, badge, occasions, colors, images, is_active)
VALUES
  ('grand-boom',
   'Grand Boom – Aranjament Floral Premium în Cutie de Catifea Vișinie',
   'Aranjament floral premium în cutie de catifea vișinie, creat pentru momentele care merită celebrate într-un mod special. Design sofisticat cu o combinație armonioasă de flori, transmite rafinament, emoție și bun gust. Impresionează prin volum, textură și aspect luxuriant.

Compoziție:
• 5 trandafiri premium
• 3 bujori eleganți
• 1 hortensie verde
• 2 eustoma
• 2 minirosa
• Gypsophila colorată
• Verdeață decorativă
• Cutie de catifea vișinie premium',
   (SELECT id FROM categories WHERE slug='florarie'), 45000, NULL, 12, 'popular',
   ARRAY['aniversare','lux'], ARRAY['rosu','roz'],
   ARRAY['/assets/products/grand-boom.webp'], TRUE),
  ('royal-boom',
   'Royal Boom - Aranjament floral în cutie',
   'Aranjament floral premium în cutie, creat pentru momente memorabile. Elegant, rafinat și spectaculos, îmbină armonios frumusețea delicată a eustomei, eleganța clasică a trandafirilor și accentele sofisticate de delphinium albastru, completate de hortensie și verdeață decorativă. Impresionează prin volum, textură și combinația cromatică modernă.

Compoziție:
• 7 trandafiri premium
• 4 Delphinium albastru
• 3 Eustoma (Lisianthus)
• 1 Hortensie
• Verdeață decorativă
• Cutie flori',
   (SELECT id FROM categories WHERE slug='florarie'), 34000, NULL, 12, NULL,
   ARRAY['aniversare','indragostiti','corporate'], ARRAY['albastru','alb'],
   ARRAY['/assets/products/royal-boom.webp'], TRUE),
  ('boom-signature',
   'Boom Signature - Aranjament Luxury în Vază',
   'Aranjament spectaculos realizat din flori premium, în vază elegantă. Piesa centrală perfectă pentru evenimente sau cadouri de lux.

Compoziție:
• Trandafiri piersică și albi
• Ranunculus roz
• Hortensie bleu
• Eustoma albă
• Limonium mov
• Gypsophila
• Crenguțe înflorite
• Verdeață decorativă
• Vază premium',
   (SELECT id FROM categories WHERE slug='florarie'), 65000, NULL, 8, 'popular',
   ARRAY['corporate','nunta','lux'], ARRAY['alb','roz','mov'],
   ARRAY['/assets/products/boom-signature.webp'], TRUE),
  ('cos-cu-trandafiri',
   'Coș cu trandafiri',
   'Aranjament floral în coș, ideal pentru cadouri rafinate sau vizite speciale.

Compoziție:
• 15 trandafiri roz
• 15 trandafiri albi
• Verdeață decorativă
• Coș alb premium',
   (SELECT id FROM categories WHERE slug='florarie'), 55000, NULL, 10, NULL,
   ARRAY['aniversare','multumire'], ARRAY['roz','alb'],
   ARRAY['/assets/products/cos-cu-trandafiri.webp'], TRUE),
  ('royal-signature',
   'Royal Signature – Aranjament Floral Luxury',
   'Aranjament floral premium în nuanțe sofisticate de alb ivoire, cu trandafiri premium, flori delicate și texturi atent armonizate într-o prezentare exclusivistă. Creat pentru momente speciale, gesturi memorabile și persoane care apreciază luxul discret. Ideal pentru aniversări, mulțumiri, evenimente elegante sau un cadou care impresionează de la prima vedere.

Compoziție:
• Trandafiri albi și crem premium
• Gerbera albă
• Iris alb
• Hortensie albă
• Ranunculus alb
• Verdeață decorativă',
   (SELECT id FROM categories WHERE slug='florarie'), 45000, NULL, 10, NULL,
   ARRAY['aniversare','multumire','corporate'], ARRAY['alb','crem'],
   ARRAY['/assets/products/royal-signature.webp'], TRUE),
  ('buchet-romantic-trandafiri-rosii',
   'Buchet Romantic Trandafiri Roșii',
   'Buchet spectaculos, creat pentru momente speciale: declarații de dragoste, aniversări sau cereri în căsătorie.

Compoziție:
• 25 trandafiri roșii premium
• Eucalipt',
   (SELECT id FROM categories WHERE slug='florarie'), 45000, NULL, 20, 'popular',
   ARRAY['indragostiti','aniversare','cerere'], ARRAY['rosu'],
   ARRAY['/assets/products/buchet-romantic-trandafiri-rosii.webp'], TRUE),
  ('baby-boy',
   'Baby Boy – Buchet delicat în nuanțe pastelate',
   'Buchet fin și elegant, în nuanțe suave de bleu și alb, perfect pentru a celebra cele mai emoționante momente. Design rafinat și modern care transmite gingășie, iubire și bucuria unui nou început.

Compoziție:
• Hortensie albastră
• Trandafiri albi premium
• Lisianthus alb
• Garofițe albe
• Gypsophila bleu',
   (SELECT id FROM categories WHERE slug='florarie'), 25000, NULL, 15, NULL,
   ARRAY['botez','aniversare'], ARRAY['albastru','alb'],
   ARRAY['/assets/products/baby-boy.webp'], TRUE),
  ('buchet-bujor-elena',
   'Buchet Bujor Elena – Buchet Premium cu Bujori și Eustoma',
   'Delicat, elegant și plin de rafinament, impresionează prin frumusețea spectaculoasă a bujorilor roz și delicatețea eustomei fine. Alegere perfectă pentru aniversări, zile de naștere, surprize romantice sau momente în care vrei să oferi emoție sinceră.

Compoziție:
• 7 bujori premium
• 6 fire de eustoma (Lisianthus)
• Verdeață decorativă și ambalaj elegant premium',
   (SELECT id FROM categories WHERE slug='florarie'), 33000, NULL, 16, 'popular',
   ARRAY['aniversare','indragostiti'], ARRAY['roz','crem'],
   ARRAY['/assets/products/buchet-bujor-elena.webp'], TRUE),
  ('coral-dream',
   'Coral Dream – Buchet Trandafiri Garden Premium',
   'Buchet cu aspect luxuriant și romantic, în nuanțe vibrante de coral. Perfect pentru iubită, aniversări sau momente în care vrei să impresionezi din prima clipă.

Compoziție:
• 35 trandafiri garden coral
• Verdeață decorativă',
   (SELECT id FROM categories WHERE slug='florarie'), 65000, NULL, 8, NULL,
   ARRAY['indragostiti','aniversare'], ARRAY['piersica','roz'],
   ARRAY['/assets/products/coral-dream.webp'], TRUE),
  ('baby-girl',
   'Baby Girl – Buchet Delicat Premium',
   'Buchet floral delicat și elegant, în nuanțe fine de roz pastel și alb, inspirat de cele mai frumoase emoții. Transmite tandrețe, iubire și rafinament. Un buchet care spune fără cuvinte: „Bine ai venit, mică prințesă”.

Compoziție:
• Trandafiri premium roz și albi
• Iriși albi
• Hortensie albă
• Verdeață decorativă',
   (SELECT id FROM categories WHERE slug='florarie'), 25000, NULL, 15, NULL,
   ARRAY['botez','aniversare'], ARRAY['roz','alb'],
   ARRAY['/assets/products/baby-girl.webp'], TRUE),
  ('buchet-majorat-18-trandafiri',
   'Buchet Majorat – 18 Trandafiri Premium',
   'Buchet spectaculos creat special pentru majorat, simbol al noilor începuturi, al emoțiilor intense și al amintirilor care rămân pentru totdeauna. Elegant, impunător și memorabil, exact ca ziua de 18 ani. Perfect pentru fiică, iubită, soră, prietenă sau o surpriză care impresionează instant.

Compoziție:
• 18 trandafiri roșii premium
• Eucalipt',
   (SELECT id FROM categories WHERE slug='florarie'), 35000, NULL, 14, NULL,
   ARRAY['majorat','aniversare'], ARRAY['roz'],
   ARRAY['/assets/products/buchet-majorat-18-trandafiri.webp'], TRUE),
  ('pink-harmony',
   'Pink Harmony – Buchet Romantic Premium',
   'Buchet delicat și feminin, cu hortensie premium, trandafiri parfumați și accente florale atent selecționate. Perfect pentru aniversări, surprize romantice, zile speciale sau pentru a aduce un zâmbet fără un motiv anume. Transmite gingășie, rafinament și emoție.

Compoziție:
• Hortensie albă
• Trandafiri roz și fucsia
• Minirosa
• Eustoma
• Gypsophila roz
• Antirrhinum
• Verdeață decorativă',
   (SELECT id FROM categories WHERE slug='florarie'), 24000, NULL, 20, NULL,
   ARRAY['aniversare','indragostiti','multumire'], ARRAY['roz','alb'],
   ARRAY['/assets/products/pink-harmony.webp'], TRUE),
  ('buchet-deluxe',
   'Buchet Deluxe',
   'Buchet voluminos în nuanțe soft, realizat din flori premium. Alegerea perfectă pentru momente speciale.

Compoziție:
• 25 trandafiri
• Eustoma
• Pistacia
• Ambalaj premium',
   (SELECT id FROM categories WHERE slug='florarie'), 55000, NULL, 12, NULL,
   ARRAY['aniversare','indragostiti'], ARRAY['crem','roz'],
   ARRAY['/assets/products/buchet-deluxe.webp'], TRUE),
  ('pure-white',
   'Pure White – Buchet Elegant Alb Premium',
   'Buchet rafinat în nuanțe delicate de alb și verde, elegant și sofisticat, perfect pentru aniversări, mulțumiri sau surprize speciale. Un gest care transmite rafinament și emoție.

Compoziție:
• Trandafiri albi premium
• Frezii parfumate
• Antirrhinum (gura-leului)
• Garoafe
• Verdeață decorativă',
   (SELECT id FROM categories WHERE slug='florarie'), 45000, NULL, 12, 'nou',
   ARRAY['aniversare','multumire','nunta'], ARRAY['alb'],
   ARRAY['/assets/products/pure-white.webp'], TRUE),
  ('sweet-blush',
   'Sweet Blush – Buchet Pastel Elegant',
   'Mix delicat de trandafiri albi, garoafe fine și accente florale în nuanțe pastel. Potrivit pentru mama, colega, șefa sau o surpriză elegantă care aduce instant zâmbete.

Compoziție:
• Trandafiri albi
• Garoafe roz
• Freezii galbene
• Limonium galben
• Verdeață decorativă',
   (SELECT id FROM categories WHERE slug='florarie'), 19000, NULL, 25, NULL,
   ARRAY['multumire','aniversare'], ARRAY['alb','roz'],
   ARRAY['/assets/products/sweet-blush.webp'], TRUE),
  ('buchet-pastel',
   'Buchet Pastel – Eleganță Delicată',
   'Buchet elegant în nuanțe pastel, delicat, feminin și memorabil. Perfect pentru cadouri rafinate și surprize de impact.

Compoziție:
• 9 trandafiri și eustoma
• Ambalaj premium',
   (SELECT id FROM categories WHERE slug='florarie'), 23000, NULL, 22, NULL,
   ARRAY['aniversare','multumire'], ARRAY['roz','crem'],
   ARRAY['/assets/products/buchet-pastel.webp'], TRUE),
  ('pink-love',
   'Pink Love – Buchet Romantic Premium',
   'O explozie delicată de rozuri pastelate și flori premium într-un aranjament feminin și elegant. Perfect pentru aniversări, surprize romantice sau pentru a spune simplu „Mă gândesc la tine”.

Compoziție:
• Trandafiri roz și crem
• Bujori roz
• Eustoma
• Frezii mov
• Garoafe roz
• Minirosa
• Verdeață decorativă',
   (SELECT id FROM categories WHERE slug='florarie'), 45000, NULL, 18, NULL,
   ARRAY['aniversare','indragostiti'], ARRAY['roz'],
   ARRAY['/assets/products/pink-love.webp'], TRUE),
  ('buchet-pentru-bunica',
   'Buchet pentru Bunica',
   'Buchet delicat și elegant, în nuanțe de roz, crem și bordo, creat pentru a transmite iubire, recunoștință și emoție. Perfect pentru a-i spune „Mulțumesc” celei mai dragi bunici sau pentru a-i face o surpriză din suflet.

Compoziție:
• Trandafiri roșii, roz și albi
• Bujor roz
• Minirosa
• Matthiola mov
• Verdeață decorativă',
   (SELECT id FROM categories WHERE slug='florarie'), 25000, NULL, 15, NULL,
   ARRAY['multumire','aniversare'], ARRAY['roz','crem','rosu'],
   ARRAY['/assets/products/buchet-pentru-bunica.webp'], TRUE),
  ('lady-elegance',
   'Lady Elegance',
   'Buchet delicat și rafinat, în nuanțe elegante de alb și roz pastel, creat pentru a transmite apreciere, feminitate și emoție. Alegerea perfectă pentru aniversări, surprize sau un gest elegant oferit din suflet.

Compoziție:
• Trandafiri albi premium
• Lisianthus
• Garofițe roz
• Verdeață decorativă',
   (SELECT id FROM categories WHERE slug='florarie'), 25000, NULL, 15, NULL,
   ARRAY['aniversare','multumire'], ARRAY['alb','roz'],
   ARRAY['/assets/products/lady-elegance.webp'], TRUE),
  ('poveste-japoneza',
   'Poveste Japoneză',
   'Buchet delicat și poetic, inspirat de frumusețea cireșilor înfloriți din Japonia. În nuanțe pastel de roz, lila și bleu, transmite liniște, rafinament și emoție pură. Perfect pentru surprize speciale, aniversări sau gesturi pline de sensibilitate.

Compoziție:
• Garoafe mov
• Matthiola mov
• Hortensie bleu
• Trandafiri crem
• Gypsophila
• Verdeață decorativă',
   (SELECT id FROM categories WHERE slug='florarie'), 19000, NULL, 20, NULL,
   ARRAY['aniversare','multumire'], ARRAY['roz','mov','albastru'],
   ARRAY['/assets/products/poveste-japoneza.webp'], TRUE)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      category_id = EXCLUDED.category_id,
      price_cents = EXCLUDED.price_cents,
      stock = EXCLUDED.stock,
      badge = EXCLUDED.badge,
      occasions = EXCLUDED.occasions,
      colors = EXCLUDED.colors,
      images = EXCLUDED.images,
      is_active = EXCLUDED.is_active;

-- ─── 2. Tip produs florărie — buchet vs. cutie vs. coș (ca în shop) ───
UPDATE products SET product_type = 'cutie' WHERE slug IN ('grand-boom','royal-boom');
UPDATE products SET product_type = 'cos' WHERE slug IN ('cos-cu-trandafiri');
UPDATE products SET product_type = 'buchet'
  WHERE category_id = (SELECT id FROM categories WHERE slug='florarie')
    AND is_addon = FALSE AND slug NOT IN ('grand-boom','royal-boom','cos-cu-trandafiri');

-- ─── 3. Florăria = EXACT cele 20 din Excel. Orice alt produs 'florarie'
--        (sezonier/temporar/demo) se scoate. Respectă FK order_items. ───
UPDATE products SET is_active = FALSE
  WHERE category_id = (SELECT id FROM categories WHERE slug='florarie')
    AND slug NOT IN (
      'grand-boom','royal-boom','boom-signature','cos-cu-trandafiri',
      'royal-signature','buchet-romantic-trandafiri-rosii','baby-boy','buchet-bujor-elena',
      'coral-dream','baby-girl','buchet-majorat-18-trandafiri','pink-harmony',
      'buchet-deluxe','pure-white','sweet-blush','buchet-pastel',
      'pink-love','buchet-pentru-bunica','lady-elegance','poveste-japoneza')
    AND id IN (SELECT product_id FROM order_items);
DELETE FROM products
  WHERE category_id = (SELECT id FROM categories WHERE slug='florarie')
    AND slug NOT IN (
      'grand-boom','royal-boom','boom-signature','cos-cu-trandafiri',
      'royal-signature','buchet-romantic-trandafiri-rosii','baby-boy','buchet-bujor-elena',
      'coral-dream','baby-girl','buchet-majorat-18-trandafiri','pink-harmony',
      'buchet-deluxe','pure-white','sweet-blush','buchet-pastel',
      'pink-love','buchet-pentru-bunica','lady-elegance','poveste-japoneza')
    AND id NOT IN (SELECT product_id FROM order_items);

COMMIT;
