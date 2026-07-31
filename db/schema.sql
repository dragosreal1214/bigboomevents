-- ═══════════════════════════════════════════════════════════════════
--  BigBoomEvents — schema PostgreSQL
--  Rulează: psql "$DATABASE_URL" -f db/schema.sql   (sau npm run db:schema)
--  Idempotent: poate fi rulat din nou fără erori.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- Extensii utile
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- Funcție comună: actualizează updated_at la fiecare UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
--  categories
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,          -- 'florarie', 'baloane', 'fun'
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_categories_updated ON categories;
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
--  products
--  Prețuri în BANI (integer) ca să evităm erorile de virgulă mobilă.
--  100 lei  => 10000
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id           SERIAL PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  category_id  INT  NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  price_cents  INT  NOT NULL CHECK (price_cents >= 0),
  old_price_cents INT CHECK (old_price_cents IS NULL OR old_price_cents >= 0),
  stock        INT  NOT NULL DEFAULT 0 CHECK (stock >= 0),
  badge        TEXT,                          -- 'nou', 'reducere', 'popular' etc.
  occasions    TEXT[] NOT NULL DEFAULT '{}',  -- ['nunta','botez','aniversare']
  colors       TEXT[] NOT NULL DEFAULT '{}',  -- ['roz','albastru']
  images       TEXT[] NOT NULL DEFAULT '{}',  -- căi/URL-uri imagini
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  is_addon     BOOLEAN NOT NULL DEFAULT FALSE, -- extra-opțiune (felicitare, bomboane...) — nu apare în shop
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotent pentru baze existente (CREATE TABLE IF NOT EXISTS nu adaugă coloane noi):
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_addon BOOLEAN NOT NULL DEFAULT FALSE;
-- Tip aranjament (Bujori, Trandafiri, Aranjamente în cutie/vază, Coșuri, Mixt) — filtru în shop.
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT;
-- Scope add-on: categoriile în care apare extra-opțiunea (ex. heliul doar pe 'baloane').
-- NULL = apare pe toate produsele (comportament vechi pentru felicitare/bomboane...).
ALTER TABLE products ADD COLUMN IF NOT EXISTS addon_scope TEXT[];
-- Extra-opțiuni setate explicit pe un produs anume (slug-uri): heliul la tariful
-- lui (diferă pe tip de balon) sau buchetele oferite lângă seturile baby shower.
ALTER TABLE products ADD COLUMN IF NOT EXISTS addon_slugs TEXT[];
-- Add-on-uri de categorie care NU se aplică produsului (ex. heliul de 50 lei al
-- cifrelor de 100 cm nu are ce căuta pe un balon mic).
ALTER TABLE products ADD COLUMN IF NOT EXISTS addon_exclude_slugs TEXT[];
-- Ordinea de afisare in shop. Fara ea sortarea implicita era `created_at DESC`,
-- care amesteca cifrele si literele (0-9 in trei culori ieseau intercalate, iar
-- literele incepeau de la U). Valoare mica = mai sus; 0 = neordonat, cade la final.
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
-- Suprascrie regula automata de retur (vezi returnPolicy din models/products.js).
-- NULL = se aplica regula derivata din categorie/tip; TRUE/FALSE = decizie explicita.
-- Cazul care a impus-o: lumanarile de cununie cu flori CRIOGENATE stau in
-- categoria `florarie`, dar nu sunt perisabile, deci chiar pot fi returnate.
ALTER TABLE products ADD COLUMN IF NOT EXISTS returnable BOOLEAN;

-- Facturare pe firma (B2B). Clientul poate comanda ca persoana fizica (implicit)
-- sau in numele unei firme, caz in care avem nevoie de datele de facturare.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_type    TEXT NOT NULL DEFAULT 'person';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS company_name    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS company_cui     TEXT;   -- CUI / CIF
ALTER TABLE orders ADD COLUMN IF NOT EXISTS company_reg_com TEXT;   -- Nr. Reg. Comertului (J..)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS company_address TEXT;   -- sediul social
-- Datele de firma exista DOAR pe comenzile de tip 'company'.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_billing_type_chk;
ALTER TABLE orders ADD CONSTRAINT orders_billing_type_chk CHECK (
  billing_type IN ('person', 'company')
  AND (billing_type = 'person' OR (company_name IS NOT NULL AND company_cui IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS products_sort_idx ON products (category_id, sort_order, name);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_addon    ON products(is_addon);
CREATE INDEX IF NOT EXISTS idx_products_type     ON products(product_type);
CREATE INDEX IF NOT EXISTS idx_products_active   ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_price    ON products(price_cents);
CREATE INDEX IF NOT EXISTS idx_products_occasions ON products USING GIN (occasions);
CREATE INDEX IF NOT EXISTS idx_products_colors    ON products USING GIN (colors);
-- Căutare full-text simplă pe nume + descriere
CREATE INDEX IF NOT EXISTS idx_products_search ON products
  USING GIN (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'')));

DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
--  orders
-- ─────────────────────────────────────────────────────────────
-- Tipuri ENUM (idempotent — CREATE TYPE nu suportă IF NOT EXISTS)
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pending',     -- creată, plată neîncepută / în așteptare
    'paid',        -- confirmată plătită (card) sau acceptată (ramburs)
    'processing',  -- în pregătire
    'shipped',     -- expediată (AWB emis)
    'delivered',   -- livrată
    'cancelled',   -- anulată
    'refunded'     -- rambursată
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('card', 'cod'); -- cod = ramburs (cash on delivery)
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    TEXT NOT NULL UNIQUE,        -- ex: BBE-20260620-0001
  -- date client
  customer_name   TEXT NOT NULL,
  customer_email  TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  -- livrare
  ship_county     TEXT NOT NULL,               -- județ
  ship_city       TEXT NOT NULL,
  ship_address    TEXT NOT NULL,
  ship_postcode   TEXT,
  notes           TEXT,
  -- cadou & livrare programată
  gift_message    TEXT,                        -- text felicitare (opțional)
  delivery_date   DATE,                        -- data dorită de livrare (opțional)
  delivery_slot   TEXT,                        -- interval orar dorit (opțional)
  -- plată & status
  payment_method  payment_method NOT NULL,
  status          order_status NOT NULL DEFAULT 'pending',
  subtotal_cents  INT NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents  INT NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  total_cents     INT NOT NULL CHECK (total_cents >= 0),
  -- plată (Netopia)
  payment_ref     TEXT,                        -- id-ul sesiunii/tranzacției la procesator
  paid_at         TIMESTAMPTZ,
  -- curier
  awb             TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent pentru baze existente:
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_message  TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_slot TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_email    ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at DESC);

DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
--  order_items  (preț „înghețat" la momentul comenzii)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id            BIGSERIAL PRIMARY KEY,
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INT  NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name  TEXT NOT NULL,                 -- snapshot nume
  unit_cents    INT  NOT NULL CHECK (unit_cents >= 0),
  quantity      INT  NOT NULL CHECK (quantity > 0),
  line_cents    INT  NOT NULL CHECK (line_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ─────────────────────────────────────────────────────────────
--  leads  (cereri de ofertă — pagina Evenimente)
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'quoted', 'won', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  event_date  DATE,
  event_type  TEXT,                            -- nunta, botez, aniversare, corporate...
  message     TEXT NOT NULL DEFAULT '',
  status      lead_status NOT NULL DEFAULT 'new',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status  ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

DROP TRIGGER IF EXISTS trg_leads_updated ON leads;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
--  Setări site (cheie → JSON). Ex: bannerul promo din capul paginii.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_settings_updated ON settings;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Banner implicit (dezactivat), doar dacă nu există deja — nu suprascrie configul.
INSERT INTO settings (key, value) VALUES
  ('banner', '{"enabled": false, "text": "Livrare gratuită la comenzi peste 250 lei", "bgColor": "#111111", "textColor": "#ffffff", "speed": 30}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
--  Secvență pentru numere de comandă (per zi)
-- ─────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_number_seq;

COMMIT;
