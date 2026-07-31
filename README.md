# BigBoomEvents 🎈

Site cu **3 secțiuni** (hub · Evenimente · Shop) + backend Node.js + PostgreSQL.
Frontend vanilla (HTML/CSS/JS), API Express, gata de rulat pe VPS Ubuntu 24.04.

Design: **pastel + arcadă** ca semnătură.

---

## Ce conține

```
BoomEvents/
├── public/                 # FRONTEND (static, vanilla)
│   ├── index.html          # hub: hero + 3 direcții + produse populare
│   ├── evenimente.html     # wedding/event planning: servicii, proces, portofoliu, formular ofertă
│   ├── shop.html           # magazin: căutare, filtre (categorie/preț/ocazie/culoare/stoc), sortare, quick view, favorite
│   ├── produs.html         # pagină produs: galerie, opțiuni, cantitate, produse similare
│   ├── checkout.html       # finalizare: date livrare, plată card/ramburs, validare
│   ├── multumim.html       # confirmare + status comandă
│   ├── checkout-simulare.html  # pagină test plată (cât timp Netopia e neconfigurat)
│   ├── termeni.html · confidentialitate.html · retur.html · contact.html  # legal + contact
│   ├── 404.html
│   ├── css/styles.css      # design system complet
│   ├── js/                 # app.js (coș+layout), cards.js, shop.js, produs.js, checkout.js, leadform.js, ...
│   └── assets/             # favicon + imagini produse (placeholder SVG, de înlocuit cu poze reale)
├── src/                    # BACKEND (Express, ESM)
│   ├── server.js           # app + middleware (helmet, cors, rate-limit, compression)
│   ├── config.js           # citește .env
│   ├── db.js               # pool PostgreSQL + tranzacții
│   ├── validation.js       # scheme zod
│   ├── routes/             # products, orders, payments, webhooks, leads, health
│   ├── models/             # acces date: products, orders, leads
│   ├── services/           # email (Resend/Brevo), payment (Netopia), notify (Telegram), templates
│   └── middleware/         # errorHandler
├── db/
│   ├── schema.sql          # categories, products, orders, order_items, leads (+ indexuri, triggers)
│   └── seed.sql            # produse demo
├── scripts/                # run-sql.js (rulează .sql), smoke.js (test API)
├── .env.example            # copiază în .env și completează
└── package.json
```

---

## Cerințe

- **Node.js ≥ 20** (LTS)
- **PostgreSQL ≥ 14**

> Notă: pe mașina de dezvoltare actuală Node/PostgreSQL nu sunt instalate.
> Pașii de mai jos rulează pe VPS sau pe orice mașină cu Node + Postgres.

---

## Pornire locală (pas cu pas)

```bash
# 1. dependențe
npm install

# 2. configurare
cp .env.example .env
#   editează .env: DATABASE_URL / PG*, EMAIL_PROVIDER, etc.
#   pentru început poți lăsa EMAIL_PROVIDER=console și Netopia gol (mod simulare).

# 3. bază de date (creează întâi DB + user în Postgres)
#    createdb bigboomevents   # sau prin psql
npm run db:reset             # rulează schema.sql + seed.sql

# 4. pornește serverul
npm start                    # http://localhost:3000
#   sau, cu reload la modificări:
npm run dev

# 5. (opțional) test rapid API — cu serverul pornit, în alt terminal:
npm run smoke
```

Creare DB + user în PostgreSQL (exemplu):

```sql
CREATE USER bigboom WITH PASSWORD 'PAROLA_PUTERNICA';
CREATE DATABASE bigboomevents OWNER bigboom;
```

---

## Fluxuri implementate

- **Catalog**: `GET /api/products` cu filtre (categorie, căutare full-text, ocazie, culoare, preț, stoc), sortare și paginare; `GET /api/products/:slug`.
- **Coș**: în browser (localStorage). La checkout, prețurile și stocul se **revalidează pe server**.
- **Comandă**: `POST /api/orders` — validare zod + verificare preț/stoc + scădere atomică a stocului în tranzacție; generează `BBE-AAAALLZZ-NNNN`.
- **Plată card**: `POST /api/payments/create` → Netopia (sau pagină de **simulare** când nu e configurat) → confirmarea reală vine prin **webhook** `POST /api/webhooks/payment` (sursa de adevăr pentru „plătit").
- **Ramburs**: confirmare imediată + email.
- **Lead (ofertă)**: `POST /api/leads` din pagina Evenimente / Contact, cu honeypot anti-spam.
- **Email**: confirmare client + notificare admin (Resend / Brevo / `console` în dev). Opțional alertă Telegram.

---

## Backoffice (panou de administrare)

Panou la **`/admin`** pentru gestionarea catalogului — fără să atingi baza de date manual.

```
http://localhost:3001/admin
```

- **Login** cu parolă din `.env` → `ADMIN_PASSWORD` (sesiune pe token, valabilă 12h).
- **Produse**: adăugare / editare / ștergere, stoc, etichete (badge), ocazii și culori,
  activare/dezactivare (ascunde din shop fără ștergere). Slug-ul se generează automat din nume.
  Câmpurile **Ocazii** și **Culori** au **autocomplete**: caută printre valorile deja folosite în
  catalog (din `GET /api/admin/facets`) sau adaugă una nouă — ca să rămână consistente.
- **Reduceri**: setezi „preț" + „preț vechi" (tăiat în magazin) sau folosești helper-ul **„Aplică −%"**
  care calculează automat prețul redus și pune badge-ul `reducere`.
- **Categorii**: CRUD complet, cu reordonare și număr de produse per categorie.
- **Poze**: upload direct din panou (JPG/PNG/WEBP/GIF/SVG, max 5MB), prima poză = principală;
  fișierele se salvează în `public/assets/uploads/`. Se pot adăuga și prin URL.
- Un produs care apare deja în comenzi nu poate fi șters (integritate) → e **ascuns** automat.
- **Comenzi**: apar **automat** după ce un client finalizează o comandă. Listă cu căutare și filtru
  pe status; detaliu complet (client, adresă, produse, totaluri); schimbare status
  (în așteptare → plătită → în pregătire → expediată → livrată / anulată / rambursată) și câmp **AWB**.
  Trecerea în „plătită" setează automat data plății.
- **Cereri (leads)**: cererile din formularul „cere o ofertă" apar aici; vezi mesajul complet,
  contactezi clientul (email/telefon) și schimbi statusul (nouă → contactat → ofertat → câștigat/pierdut).

API-ul (sub `/api/admin/*`, protejat cu `Authorization: Bearer <token>`): `login`, `me`, `stats`,
`products` (CRUD + `/:id/active`), `categories` (CRUD), `uploads`,
`orders` (listă + detaliu + `PATCH` status/AWB), `leads` (listă + `PATCH` status).

> ⚠️ Schimbă `ADMIN_PASSWORD` în `.env` cu o parolă puternică înainte de lansare.

---

## Configurări de completat înainte de lansare

- [ ] Date firmă în paginile legale (denumire, CUI, J, sediu, IBAN) — caută `[de completat]` / `[CUI]`.
- [ ] Telefon, email, Instagram în footer și pagina Contact.
- [ ] Credențiale **Netopia** în `.env` (`NETOPIA_API_KEY`, `NETOPIA_POS_SIGNATURE`) → trece automat din simulare în plată reală.
- [ ] `EMAIL_PROVIDER=resend` sau `brevo` + cheia API + email pe domeniu (SPF/DKIM).
- [ ] Poze reale de produs (înlocuiesc SVG-urile din `public/assets/products/`).
- [ ] Catalog real (editează `db/seed.sql` sau adaugă produse în DB).

---

## Decizii presupuse (din planul de implementare)

| Decizie | Ales | Notă |
|---|---|---|
| Framework backend | **Express** | „simplu", conform planului |
| Procesator plăți | **Netopia** | cu mod simulare până la credențiale |
| Prag livrare gratuită | **250 lei** | taxă 25 lei sub prag (în `src/models/orders.js`) |
| Bani în DB | **integer (bani)** | evită erorile de virgulă mobilă |

Aceste valori se schimbă ușor dintr-un singur loc.

---

## Deploy — PRODUCȚIE (live, HTTPS)

Site-ul rulează pe un VPS Ubuntu, live pe **https://thebigboomevents.ro**
(+ `www`) și magazinul pe **https://shop.thebigboomevents.ro**. Panou: **/admin**.
Arhitectură: `Cloudflare DNS → nginx (static + proxy /api, redirect HTTP→HTTPS) → Node/pm2 (127.0.0.1:3000) → PostgreSQL`.

- **DNS**: Cloudflare, 3× A record (`@`, `www`, `shop`) → IP-ul de origine al VPS-ului.
- **SSL**: Let's Encrypt (certbot), reînnoire automată prin `certbot.timer`. Re-rulează `~/enable-ssl.sh` pentru subdomenii noi.
- **Routing**: URL-uri curate (fără `.html`). Magazinul stă pe subdomeniu; paginile de shop pe domeniul principal → 301 spre subdomeniu (și invers pentru paginile de brand). Nav-ul e conștient de domeniu (`app.js`).
- **Coș**: apare doar pe paginile de magazin (`data-page="shop"`).
- **Securitate**: `server_tokens off`, headere HSTS/CSP/X-Frame-Options/nosniff/Referrer/Permissions (snippets în `/etc/nginx/snippets/`), rate-limit la `/api/admin/login`, `unattended-upgrades` activ.

**Layout pe server**
- Frontend static: `$WEB_DIR` (servit de nginx)
- Backend Node: `$APP_DIR` (pm2, proces `bigboom-api`)
- Config nginx: `/etc/nginx/sites-available/bigboom` (`client_max_body_size 6m` pentru upload)
- Bază de date: PostgreSQL local, DB `bigboomevents`, user `bigboom`
- Poze urcate din panou: `UPLOAD_DIR=$WEB_DIR/assets/uploads` (servite de nginx)
- Secrete: doar în `$APP_DIR/.env` (chmod 600) — NU în git.

**Re-deploy.** Valorile reale (host, user, cale către cheie, directoare) sunt în
`DEPLOY.local.md` — fișier negitat, ține-l doar local.
```bash
SSH="ssh -i $SSH_KEY"; TARGET="$DEPLOY_USER@$DEPLOY_HOST"
# backend
rsync -az -e "$SSH" --exclude node_modules --exclude .env --exclude .git \
  src db scripts package.json "$TARGET:$APP_DIR/"
# frontend
rsync -az -e "$SSH" public/ "$TARGET:$WEB_DIR/"
# repornire backend
$SSH "$TARGET" "cd $APP_DIR && npm install --omit=dev && pm2 restart bigboom-api"
```
pm2 e configurat să pornească la boot (`pm2 startup` + `pm2 save`); Postgres și nginx sunt servicii systemd.

**Rămas de făcut** (depinde de decizii/conturi externe):
- Domeniu (`.ro` vs `.com`) → DNS A `@`/`www` → IP-ul de origine → apoi `server_name` + `certbot --nginx` (SSL).
- Email pe domeniu (MX + SPF/DKIM) + `EMAIL_PROVIDER=resend|brevo`.
- Credențiale Netopia (sandbox→live) + pagini legale completate.
