-- ═══════════════════════════════════════════════════════════════════
--  BigBoomEvents — date produse (catalog real BigBoomEvents)
--  Rulează după schema.sql:  npm run db:reset
--  Idempotent: ON CONFLICT actualizează în loc să dubleze.
--  Florăria = catalogul real (20 produse). Baloane/Fun = demo (servicii BBE).
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Categorii ───
INSERT INTO categories (slug, name, description, sort_order) VALUES
  ('florarie', 'Florărie', 'Buchete și aranjamente premium din flori proaspete, lucrate manual.', 1),
  ('baloane',  'Baloane',  'Arcade organice și compoziții din baloane, pe tema ta.', 2),
  ('fun',      'Fun',      'Accesorii de petrecere, surprize și mici bucurii.', 3)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order;

-- ─── Curățenie: scoatem produsele florale demo vechi (înlocuite de catalogul real) ───
-- Ascundem (nu ștergem) cele cu istoric de comenzi, ca să nu rupem FK-ul order_items
-- și să păstrăm integritatea comenzilor; restul le ștergem efectiv.
UPDATE products SET is_active = FALSE
  WHERE slug IN ('buchet-blush', 'aranjament-cutie-rotunda', 'trandafiri-pastel-9', 'cutie-lalele', 'buchet-eternity-rosu', 'buchet-bujori-sezon', 'aranjament-orhidee')
    AND id IN (SELECT product_id FROM order_items);
DELETE FROM products
  WHERE slug IN ('buchet-blush', 'aranjament-cutie-rotunda', 'trandafiri-pastel-9', 'cutie-lalele', 'buchet-eternity-rosu', 'buchet-bujori-sezon', 'aranjament-orhidee')
    AND id NOT IN (SELECT product_id FROM order_items);

-- ─── Florăria = EXACT catalogul din Excel (20 produse). Orice alt produs din categoria
--     'florarie' (sezonier/temporar/demo rămas) se scoate: ascunde dacă are istoric de
--     comenzi (FK order_items), altfel șterge efectiv. ───
UPDATE products SET is_active = FALSE
  WHERE category_id = (SELECT id FROM categories WHERE slug='florarie')
    AND slug NOT IN (
      'grand-boom','royal-boom','boom-signature','cos-cu-trandafiri','royal-signature',
      'buchet-romantic-trandafiri-rosii','baby-boy','buchet-bujor-elena','coral-dream',
      'baby-girl','buchet-majorat-18-trandafiri','pink-harmony','buchet-deluxe','pure-white',
      'sweet-blush','buchet-pastel','pink-love','buchet-pentru-bunica','lady-elegance','poveste-japoneza')
    AND id IN (SELECT product_id FROM order_items);
DELETE FROM products
  WHERE category_id = (SELECT id FROM categories WHERE slug='florarie')
    AND slug NOT IN (
      'grand-boom','royal-boom','boom-signature','cos-cu-trandafiri','royal-signature',
      'buchet-romantic-trandafiri-rosii','baby-boy','buchet-bujor-elena','coral-dream',
      'baby-girl','buchet-majorat-18-trandafiri','pink-harmony','buchet-deluxe','pure-white',
      'sweet-blush','buchet-pastel','pink-love','buchet-pentru-bunica','lady-elegance','poveste-japoneza')
    AND id NOT IN (SELECT product_id FROM order_items);

-- ─── Produse ───
INSERT INTO products
  (slug, name, description, category_id, price_cents, old_price_cents, stock, badge, occasions, colors, images, is_active)
VALUES
-- ── Florărie: catalog real BigBoomEvents (20 produse) ──
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
   ARRAY['/assets/products/poveste-japoneza.webp'], TRUE),

-- ── Baloane & Fun: demo (servicii BBE, neprezente pe Wolt) ──
  ('arcada-organica-pastel',
   'Arcadă organică pastel',
   'Arcadă de baloane în compoziție organică, pe culorile evenimentului. Include montaj în zona Iași.',
   (SELECT id FROM categories WHERE slug='baloane'), 45000, NULL, 8, 'popular',
   ARRAY['nunta','botez','aniversare','corporate'], ARRAY['roz','albastru','mov'],
   ARRAY['/assets/products/baloane.svg'], TRUE),

  ('set-30-baloane-heliu',
   'Set 30 baloane heliu',
   'Treizeci de baloane umflate cu heliu, în culorile alese. Se ridică din locația noastră.',
   (SELECT id FROM categories WHERE slug='baloane'), 22000, NULL, 40, NULL,
   ARRAY['aniversare','botez'], ARRAY['roz','albastru','auriu'],
   ARRAY['/assets/products/baloane.svg'], TRUE),

  ('cifra-folie-baza',
   'Cifră folie + bază baloane',
   'Cifră din folie (la alegere) pe o bază de baloane asortate — vedeta mesei de tort.',
   (SELECT id FROM categories WHERE slug='baloane'), 18000, NULL, 15, 'nou',
   ARRAY['aniversare','botez'], ARRAY['auriu','argintiu','roz'],
   ARRAY['/assets/products/baloane.svg'], TRUE),

  ('confetti-popper-5',
   'Confetti popper · set 5',
   'Cinci tuburi de confetti pentru momentul „surpriză". Confetti din hârtie biodegradabilă.',
   (SELECT id FROM categories WHERE slug='fun'), 4900, NULL, 60, NULL,
   ARRAY['aniversare','revelion','absolvire'], ARRAY['multicolor'],
   ARRAY['/assets/products/fun.svg'], TRUE),

  ('cutie-surpriza-baloane',
   'Cutie surpriză cu baloane',
   'Cutie care, deschisă, eliberează baloane cu heliu și un mesaj personalizat.',
   (SELECT id FROM categories WHERE slug='fun'), 13000, NULL, 12, 'popular',
   ARRAY['indragostiti','aniversare','cerere'], ARRAY['roz','rosu'],
   ARRAY['/assets/products/fun.svg'], TRUE),

  ('banner-la-multi-ani',
   'Banner «La mulți ani»',
   'Banner reutilizabil, carton premium, litere cu folio. Se prinde ușor pe perete.',
   (SELECT id FROM categories WHERE slug='fun'), 3900, NULL, 80, NULL,
   ARRAY['aniversare'], ARRAY['auriu','roz'],
   ARRAY['/assets/products/fun.svg'], TRUE),

  ('coloana-baloane-organica',
   'Coloană baloane organică',
   'Coloană de baloane pe culorile evenimentului, ideală la intrare. Include montaj în Iași.',
   (SELECT id FROM categories WHERE slug='baloane'), 32000, 38000, 6, 'reducere',
   ARRAY['nunta','botez','corporate'], ARRAY['albastru','auriu','alb'],
   ARRAY['/assets/products/baloane.svg'], TRUE),

  ('balon-bubble-personalizat',
   'Balon bubble personalizat',
   'Balon transparent cu mesaj personalizat și baloane mici în interior.',
   (SELECT id FROM categories WHERE slug='baloane'), 9900, NULL, 35, 'popular',
   ARRAY['aniversare','indragostiti','botez'], ARRAY['roz','albastru','auriu'],
   ARRAY['/assets/products/baloane.svg'], TRUE),

  ('set-baloane-cromate',
   'Set baloane cromate · 20',
   'Douăzeci de baloane cromate metalizate, efect oglindă — pentru un decor modern.',
   (SELECT id FROM categories WHERE slug='baloane'), 14000, NULL, 28, 'nou',
   ARRAY['aniversare','revelion','corporate'], ARRAY['auriu','argintiu'],
   ARRAY['/assets/products/baloane.svg'], TRUE),

  ('photo-booth-props',
   'Set accesorii photo-booth',
   'Set de accesorii amuzante pentru poze: ochelari, mustăți, plăcuțe cu mesaje.',
   (SELECT id FROM categories WHERE slug='fun'), 6900, 8900, 45, 'reducere',
   ARRAY['aniversare','nunta','absolvire'], ARRAY['multicolor'],
   ARRAY['/assets/products/fun.svg'], TRUE),

  ('lumanare-cifra-tort',
   'Lumânare cifră pentru tort',
   'Lumânare cifră cu sclipici, la alegere — momentul perfect pentru poza de tort.',
   (SELECT id FROM categories WHERE slug='fun'), 2900, NULL, 90, 'popular',
   ARRAY['aniversare'], ARRAY['auriu','roz','argintiu'],
   ARRAY['/assets/products/fun.svg'], TRUE)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      category_id = EXCLUDED.category_id,
      price_cents = EXCLUDED.price_cents,
      old_price_cents = EXCLUDED.old_price_cents,
      stock = EXCLUDED.stock,
      badge = EXCLUDED.badge,
      occasions = EXCLUDED.occasions,
      colors = EXCLUDED.colors,
      images = EXCLUDED.images,
      is_active = EXCLUDED.is_active;

-- ─── Tip aranjament (product_type) — mapare din coloana „Categorie" a Excel-ului ───
UPDATE products SET product_type = 'bujori' WHERE slug IN ('buchet-bujor-elena');
UPDATE products SET product_type = 'trandafiri' WHERE slug IN ('buchet-romantic-trandafiri-rosii','coral-dream','buchet-majorat-18-trandafiri','buchet-deluxe','pure-white','buchet-pastel');
UPDATE products SET product_type = 'cutie' WHERE slug IN ('grand-boom','royal-boom');
UPDATE products SET product_type = 'vaza' WHERE slug IN ('boom-signature','royal-signature');
UPDATE products SET product_type = 'cosuri' WHERE slug IN ('cos-cu-trandafiri');
UPDATE products SET product_type = 'mixt' WHERE slug IN ('baby-boy','baby-girl','pink-harmony','sweet-blush','pink-love','buchet-pentru-bunica','lady-elegance','poveste-japoneza');

-- ─── Categorie ascunsă pentru extra-opțiuni ───
-- Nu apare ca filtru în shop (listCategories întoarce doar categoriile cu produse vizibile).
INSERT INTO categories (slug, name, description, sort_order) VALUES
  ('extra', 'Extra opțiuni', 'Felicitări, bomboane, șampanie și ambalaje — adăugate pe pagina produsului.', 99)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

-- ─── Extra-opțiuni (is_addon = TRUE) ───
-- Stoc mare: nu blochează comanda. Prețul vine din DB (sursa de adevăr la checkout).
INSERT INTO products
  (slug, name, description, category_id, price_cents, old_price_cents, stock, badge, occasions, colors, images, is_active, is_addon)
VALUES
  ('addon-felicitare',
   'Felicitare',
   'Felicitare elegantă cu mesajul tău personalizat scris de mână.',
   (SELECT id FROM categories WHERE slug='extra'), 0, NULL, 100000, NULL,
   '{}', '{}', ARRAY['/assets/products/felicitare.svg'], TRUE, TRUE),

  ('addon-bomboane',
   'Cutie bomboane',
   'Cutie de praline asortate, ambalată cadou.',
   (SELECT id FROM categories WHERE slug='extra'), 13500, NULL, 100000, NULL,
   '{}', '{}', ARRAY['/assets/products/bomboane.svg'], TRUE, TRUE),

  ('addon-sampanie',
   'Sticlă de șampanie',
   'O sticlă de vin spumant, alături de buchet.',
   (SELECT id FROM categories WHERE slug='extra'), 9000, NULL, 100000, NULL,
   '{}', '{}', ARRAY['/assets/products/sampanie.svg'], TRUE, TRUE),

  ('addon-punga',
   'Pungă cadou',
   'Pungă cadou premium, pentru un transport elegant.',
   (SELECT id FROM categories WHERE slug='extra'), 1200, NULL, 100000, NULL,
   '{}', '{}', ARRAY['/assets/products/punga.svg'], TRUE, TRUE)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      category_id = EXCLUDED.category_id,
      price_cents = EXCLUDED.price_cents,
      stock = EXCLUDED.stock,
      images = EXCLUDED.images,
      is_active = EXCLUDED.is_active,
      is_addon = EXCLUDED.is_addon;

COMMIT;
