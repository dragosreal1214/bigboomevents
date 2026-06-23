# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

BigBoomEvents — flori, baloane și evenimente. Frontend vanilla (HTML/CSS/JS, fără framework) + API Express (ESM) + PostgreSQL. UI și conținut în limba română.

## Commands

Node nu e pe PATH-ul de sistem — încarcă-l prin nvm întâi:
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20
```

PostgreSQL local rulează în Docker (containerul `bigboom-pg`, port host **5433**):
```bash
docker start bigboom-pg            # dacă e oprit
```

Local `.env` rulează serverul pe **portul 3001** (3000 e ocupat de alt proces Docker pe această mașină).

```bash
npm install
npm run db:reset                   # rulează db/schema.sql + db/seed.sql (idempotent)
npm start                          # http://localhost:3001
npm run dev                        # cu --watch (reload la modificări)
BASE_URL=http://localhost:3001 PORT=3001 npm run smoke   # test E2E al API-ului
```

Nu există suită de unit-test sau linter. `npm run smoke` (`scripts/smoke.js`) e singura verificare automată — lovește endpoint-urile reale; rulează-l după modificări de backend. Pentru verificare UI, încărca paginile în Chrome headless (`/Applications/Google Chrome.app/...`), opțional cu `puppeteer-core` instalat temporar (`npm i --no-save puppeteer-core`).

## Money & order integrity (critic)

- Toate prețurile se stochează ca **integer (bani/cents)** în DB (`price_cents`, `total_cents`...). `src/models/products.js#mapProduct` convertește în lei (`/100`) pentru frontend, care expune și `priceCents`. La scriere se face `Math.round(lei * 100)`.
- Prețul și stocul **nu se cred niciodată din coșul clientului**. `src/models/orders.js#createOrder` reîncarcă produsele din DB, recalculează subtotalul, verifică stocul și **scade stocul atomic într-o tranzacție** (`withTransaction`). Livrare gratuită ≥ 250 lei, altfel 25 lei (`FREE_SHIPPING_THRESHOLD`/`SHIPPING_FEE`).
- Plata cu cardul: sursa de adevăr pentru „plătit" e **webhook-ul** (`POST /api/webhooks/payment` → `markPaid`), nu redirectul. Dacă Netopia nu e configurat (`config.netopia.configured`), plata cu cardul intră în **mod simulare** (`checkout-simulare.html`). Rambursul se confirmă imediat.

## Backend architecture (`src/`, ESM)

Flux: `routes → models → db.js (pool pg)`, cu efecte secundare prin `services/`. `server.js` montează totul sub `/api` (helmet CSP, cors pe `config.corsOrigins`, compression, rate-limit general + strict pe scrieri). `config.js` citește `.env` cu valori implicite sigure și e singura sursă de configurare. Erorile se aruncă prin `HttpError` (`utils/http.js`) și se formatează central în `middleware/errorHandler.js`; validarea input-ului se face cu scheme **zod** în `validation.js` via `parseOrThrow`. Banii se manipulează doar prin `utils/money.js` (`toCents`/`toLei`/`formatLei`).

**Notificări & side-effects** (`src/services/`): după ce scrierea în DB reușește, rutele `orders`/`leads`/`webhooks` declanșează efecte secundare **non-blocante** — `Promise.allSettled([...]).catch(()=>{})` — ca un email picat să nu strice răspunsul HTTP. Componente: `email.js` expune o interfață unică `sendEmail({to,subject,html,text})` cu provider comutabil din `.env` (`EMAIL_PROVIDER`: `resend` / `brevo` / `console` în dev — doar loghează); `templates.js` generează HTML-ul cu stiluri inline (client-mail-safe); `notify.js` trimite pe Telegram doar dacă `config.telegram.configured`. Important pentru fluxul de plată: la **ramburs** confirmarea pleacă imediat din ruta `orders`, la **card** sursa de adevăr e webhook-ul (`markPaid` → emailuri + notificare), nu redirectul. `payment.js` (Netopia v2) izolează plata: `startCardPayment` întoarce un URL real sau de simulare (mod mock când lipsesc credențialele), iar `interpretWebhook` normalizează callback-ul pe care îl consumă `markPaid`.

**Backoffice** (`/api/admin/*`, frontend în `public/admin/`): autentificare fără sesiuni — login cu parolă (`ADMIN_PASSWORD`) → **token HMAC semnat cu `APP_SECRET`** (`middleware/adminAuth.js`), verificat de `requireAdmin`. Acoperă CRUD produse/categorii, comenzi (status + AWB), leads (status), upload imagini (multer) și `/api/admin/facets` (valori distincte ocazii/culori pentru autocomplete). Slug-urile se generează cu `utils/slug.js` (diacritice RO → ascii, unicizare cu sufix `-2`).

Upload-urile se salvează în `config.uploadsDir` (env `UPLOAD_DIR`) dacă e setat, altfel în `public/assets/uploads/`. În producție `UPLOAD_DIR` = directorul servit de nginx, ca pozele urcate din panou să fie servite ca static.

## Frontend architecture (`public/`)

Pagini statice multiple; **`js/app.js` e stratul comun** încărcat peste tot. La `DOMContentLoaded` injectează nav + footer (+ cart drawer doar pe paginile de shop), gestionează coșul/favoritele în `localStorage` și expune obiectul global **`window.BBE`** (`API`, `Cart`, `Favs`, `fmtLei`, `esc`, `urls`, ...) folosit de scripturile per-pagină (`shop.js`, `produs.js`, `cards.js`, `checkout.js`, `leadform.js`...).

Convenții care necesită mai multe fișiere pentru a fi înțelese:
- **`<body data-page="...">`** controlează nav-ul activ ȘI dacă apare coșul: coșul (buton + drawer) apare **doar** pe paginile cu `data-page="shop"` (shop, produs, checkout, multumim). Restul site-ului nu are coș.
- **URL-uri curate**, fără `.html` (vezi nginx). Link-uri tot fără `.html`.
- **Separare site principal vs magazin**: în producție site-ul e pe `thebigboomevents.ro`, magazinul pe `shop.thebigboomevents.ro`. `app.js` detectează contextul (`PROD` = host se termină în `thebigboomevents.ro`) și construiește link-uri absolute corecte (`U`/`BBE.urls`); local (localhost/IP) totul e relativ. Când adaugi link-uri cross-secțiune din JS, folosește `BBE.urls`, nu căi relative.

## Production deployment

Live: **https://thebigboomevents.ro** + **https://shop.thebigboomevents.ro** (panou `/admin`). VPS SiteBunker (Ubuntu 24.04), `ssh -i $SSH_KEY $DEPLOY_USER@$DEPLOY_HOST` . Topologie: `Cloudflare DNS → nginx (static + proxy /api, HTTP→HTTPS) → Node/pm2 (127.0.0.1:3000) → PostgreSQL`.

- Backend: `$APP_DIR` (pm2 `bigboom-api`, pornește la boot). Frontend: `$WEB_DIR`. Secrete doar în `$APP_DIR/.env` (chmod 600) — NU în git.
- nginx: `/etc/nginx/sites-available/bigboom` + snippets în `/etc/nginx/snippets/` (securitate, proxy) + `/etc/nginx/conf.d/bigboom-global.conf`. Headere securitate (HSTS/CSP/X-Frame-Options/nosniff), `server_tokens off`, rate-limit pe `/api/admin/login`. CSP-ul din nginx trebuie să rămână aliniat cu CSP-ul helmet din `server.js`.
- Re-deploy: rsync `src db scripts package.json` → `$APP_DIR/` (exclude `node_modules .env .git`) și `public/` → `$WEB_DIR/` (FĂRĂ `--delete` — ar șterge `assets/uploads`), apoi `cd $APP_DIR && npm install --omit=dev && pm2 restart bigboom-api`.
- SSL: Let's Encrypt, auto-renew via `certbot.timer`; `~/enable-ssl.sh` adaugă SSL pentru subdomenii noi.

Detalii suplimentare de stare (ce e încă de făcut: email pe domeniu, credențiale Netopia, date firmă în paginile legale) sunt în `~/.claude/.../memory/deploy-state.md` și în secțiunea Deploy din `README.md`.
