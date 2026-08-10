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
node scripts/run-sql.js db/seed-addons.sql   # DOAR extra-opțiunile (felicitare/bomboane/...) — sigur pe prod
npm start                          # http://localhost:3001
npm run dev                        # cu --watch (reload la modificări)
BASE_URL=http://localhost:3001 PORT=3001 npm run smoke   # test E2E al API-ului
npm run prerender                  # regenerează public/decoratiuni/*.html din decoratiuni-data.js
npm run apply-content              # reaplică în fișiere conținutul editat din panou (vezi Deploy)
```

Nu există suită de unit-test sau linter. `npm run smoke` (`scripts/smoke.js`) e singura verificare automată — lovește endpoint-urile reale; rulează-l după modificări de backend. Pentru verificare UI, încărca paginile în Chrome headless (`/Applications/Google Chrome.app/...`), opțional cu `puppeteer-core` instalat temporar (`npm i --no-save puppeteer-core`).

## Money & order integrity (critic)

- Toate prețurile se stochează ca **integer (bani/cents)** în DB (`price_cents`, `total_cents`...). `src/models/products.js#mapProduct` convertește în lei (`/100`) pentru frontend, care expune și `priceCents`. La scriere se face `Math.round(lei * 100)`.
- Prețul și stocul **nu se cred niciodată din coșul clientului**. `src/models/orders.js#createOrder` reîncarcă produsele din DB, recalculează subtotalul, verifică stocul și **scade stocul atomic într-o tranzacție** (`withTransaction`). Livrare gratuită ≥ **500 lei**, altfel 25 lei (`FREE_SHIPPING_THRESHOLD`/`SHIPPING_FEE`). Pragul e afișat în 5 locuri din frontend (coș, pagina produsului, checkout, Politica de livrare, textul implicit al bannerului) — schimbă-l în toate, altfel promiți altceva decât calculează serverul.
- Plata cu cardul: sursa de adevăr pentru „plătit" e **webhook-ul** (`POST /api/webhooks/payment` → `markPaid`), nu redirectul. Dacă Netopia nu e configurat (`config.netopia.configured`), plata cu cardul intră în **mod simulare** (`checkout-simulare.html`). Rambursul se confirmă imediat.
- **Extra-opțiuni = produse cu `products.is_addon = TRUE`** (felicitare, bomboane, șampanie, pungă), în categoria ascunsă `extra`. Sunt excluse din shop (`listProducts`/`getProductBySlug`/facets) și din `listCategories` (care întoarce doar categorii cu produse vizibile non-addon); se servesc prin `GET /api/addons`. **De ce e safe pe bani:** intră în coș ca linii normale, deci `createOrder` le reîncarcă prețul din DB ca pe orice produs. Sunt scutite de stoc (sar verificarea + scăderea când `is_addon`). Pe pagina de produs se gestionează doar din seed/SQL; nu există încă UI admin pentru ele.
- **Ce add-on apare pe ce produs** se decide din trei coloane, nu dintr-una: `addon_scope` (categoriile în care apare, `NULL` = peste tot), `products.addon_slugs` (add-on-uri legate explicit de UN produs) și `addon_exclude_slugs` (excluderi). Cazul real: heliul are trei trepte de preț (`addon-heliu-simplu` 15, `addon-heliu-forma` 25, `addon-heliu` 50) și se atașează per balon, după mărime — se oferă doar la baloanele de la 45 cm în sus. Prețul afișat al balonului e mereu FĂRĂ heliu.
- **Text felicitare + dată/oră livrare** sunt la nivel de comandă: pe pagina de produs se salvează în `Cart.meta()` (localStorage `bbe_cart_meta_v1`), se pre-completează la checkout și se trimit prin `createOrderSchema` (`giftMessage`/`deliveryDate`/`deliverySlot`) → coloanele `orders.gift_message`/`delivery_date`/`delivery_slot`.
- **Facturare pe firmă**: `orders.billing_type` (`person`/`company`) + `company_name/cui/reg_com/address`, cu CHECK în schemă care garantează denumirea și CUI-ul pe comenzile `company`. Validarea condiționată se face în `createOrderSchema` printr-un `superRefine` la nivelul de sus al schemei — nu în obiectul `company`, ca să poată citi `billingType`.
- **Dreptul de retur nu e uniform.** `src/models/products.js#returnPolicy` derivă `returnable` + `returnNote` pe produs: florăria e perisabilă, pachetele/seturile sunt la comandă, restul se pot returna. Coloana `products.returnable` (nullable) **suprascrie** regula — `NULL` = regula derivată, `TRUE`/`FALSE` = decizie explicită (cazul care a impus-o: lumânările cu flori criogenate stau în `florarie` dar nu sunt perisabile). Pagina de produs afișează promisiunea SAU motivul excepției, niciodată ambele.
- **Ordinea în shop**: `products.sort_order` + sortarea `recomandat`, care e **implicită** (`validation.js`, `listProducts`, `public/js/shop.js` — toate trei). Expresia e `(badge IS DISTINCT FROM 'popular'), (sort_order = 0), sort_order, name`: produsele cu badge-ul `popular` urcă primele (cerință a clientului), restul urmează în ordinea din `sort_order`, iar produsele neordonate (`sort_order = 0`) cad la FINAL, nu la început. `IS DISTINCT FROM`, nu `<>` — badge-ul e NULL la majoritatea produselor, iar `NULL <> 'popular'` dă NULL, nu TRUE, deci ar rupe gruparea. Sortările explicite alese de client (preț, nume, nou) nu sunt afectate. Blocuri: florărie 100–900, baloane 1000+ (cifre 2000, litere 3000, figurine 4000, accesorii 7000+).

## Backend architecture (`src/`, ESM)

Flux: `routes → models → db.js (pool pg)`, cu efecte secundare prin `services/`. `server.js` montează totul sub `/api` (helmet CSP, cors pe `config.corsOrigins`, compression, rate-limit general + strict pe scrieri). `config.js` citește `.env` cu valori implicite sigure și e singura sursă de configurare. Erorile se aruncă prin `HttpError` (`utils/http.js`) și se formatează central în `middleware/errorHandler.js`; validarea input-ului se face cu scheme **zod** în `validation.js` via `parseOrThrow`. Banii se manipulează doar prin `utils/money.js` (`toCents`/`toLei`/`formatLei`).

**Notificări & side-effects** (`src/services/`): după ce scrierea în DB reușește, rutele `orders`/`leads`/`webhooks` declanșează efecte secundare **non-blocante** — `Promise.allSettled([...]).catch(()=>{})` — ca un email picat să nu strice răspunsul HTTP. Componente: `email.js` expune o interfață unică `sendEmail({to,subject,html,text})` cu provider comutabil din `.env` (`EMAIL_PROVIDER`: `resend` / `brevo` / `console` în dev — doar loghează); `templates.js` generează HTML-ul cu stiluri inline (client-mail-safe); `notify.js` trimite pe Telegram doar dacă `config.telegram.configured`. Important pentru fluxul de plată: la **ramburs** confirmarea pleacă imediat din ruta `orders`, la **card** sursa de adevăr e webhook-ul (`markPaid` → emailuri + notificare), nu redirectul. `payment.js` (Netopia v2) izolează plata: `startCardPayment` întoarce un URL real sau de simulare (mod mock când lipsesc credențialele), iar `interpretWebhook` normalizează callback-ul pe care îl consumă `markPaid`.

**Backoffice** (`/api/admin/*`, frontend în `public/admin/`): autentificare fără sesiuni — login cu parolă (`ADMIN_PASSWORD`) → **token HMAC semnat cu `APP_SECRET`** (`middleware/adminAuth.js`), verificat de `requireAdmin`. Acoperă CRUD produse/categorii, comenzi (status + AWB), leads (status), upload imagini (multer) și `/api/admin/facets` (valori distincte ocazii/culori pentru autocomplete). Slug-urile se generează cu `utils/slug.js` (diacritice RO → ascii, unicizare cu sufix `-2`).

**Căi pe disc — greșeala care a lovit de două ori.** În producție nginx servește staticul din alt director decât aplicația, iar rsync NU copiază `public/` lângă backend. Orice cod care citește/scrie fișiere din site trebuie să folosească `config.webDir` (env `WEB_DIR`), nu o cale relativă la `src/` — au picat așa și `pageEditor.js`, și pre-randarea. Simetric cu `UPLOAD_DIR`.

**`CARD_PAYMENTS_ENABLED`** e separat de `config.netopia.configured`: credențialele pot fi corecte, dar punctul de vânzare neaprobat de Netopia (`400 POS is not approved`). Pe `false`, ruta `/payments/create` refuză explicit și checkout-ul ascunde opțiunea — opțiunea de card pornește **ascunsă** în HTML și se afișează doar dacă `GET /api/payment-methods` o raportează disponibilă, ca un apel picat să lase clientul pe ramburs, nu pe o metodă care ar eșua.

Upload-urile se salvează în `config.uploadsDir` (env `UPLOAD_DIR`) dacă e setat, altfel în `public/assets/uploads/`. În producție `UPLOAD_DIR` = directorul servit de nginx, ca pozele urcate din panou să fie servite ca static. **CSP `imgSrc: ['self', 'data:']`** (helmet în `server.js`): toate imaginile de produs trebuie servite same-origin — nu pune URL-uri remote în `products.images`; descarcă imaginea local (în `public/assets/products/` sau uploads) și referențiază calea relativă.

## Editor de pagini (mini-CMS)

Tabul **„Pagini"** din panou lasă clientul să schimbe textele și pozele paginilor statice. Arhitectura e dictată de o constrângere: conținutul trebuie să rămână **în HTML-ul servit** (altfel pierdem pre-randarea SEO din `scripts/prerender-decoratiuni.js`), dar `rsync public/` de la deploy **suprascrie fișierele**. Deci:

- **Sursa de adevăr = tabelul `page_content`** (`page`, `key`, `value`). Salvarea din panou scrie în DB **și** în fișier, ca schimbarea să fie live imediat.
- **După deploy se rulează `npm run apply-content`**, care rescrie fișierele din DB. Fără el, editările clientului dispar.
- Elementele editabile se marchează în HTML cu `data-cms="cheie"` + `data-cms-label` + `data-cms-group` (sau `data-cms-img` la imagini). Eticheta stă lângă element ca să nu existe un registru paralel care se desincronizează. `src/services/pageEditor.js` le scanează și le rescrie.
- **Nu marca elemente care conțin alt tag de același fel** (`<p>` în `<p>`) — înlocuirea se face pe potrivire non-lacomă până la primul tag de închidere; scanner-ul detectează cazul și îl raportează în loc să strice pagina.
- Textul e sanitizat la salvare: se păstrează doar `strong/b/em/i/br/small/a`, se elimină `script`/handlerele `on*` și `href`-urile `javascript:`. Altfel panoul ar fi o cale directă de XSS stocat.
- **Subpaginile `/decoratiuni/<slug>` se editează altfel**: ele NU sunt scrise de mână, ci generate de `prerenderDecor()` din `public/js/decoratiuni-data.js`. Editarea HTML-ului s-ar pierde la prima re-randare, deci `src/services/decorEditor.js` scrie în **fișierul de date** (JSON, nu regex pe markup), iar ruta re-randează imediat după salvare. În panou apar ca pagini normale, cu slug `decor-<eveniment>`.
- **`decorPrerender.js` și `public/js/decoratiuni.js` trebuie să producă markup IDENTIC**, inclusiv atributele `data-cms*`. Randarea din browser înlocuiește nodul pre-randat la hidratare; dacă marcajele diferă, editorul nu mai găsește elementele în previzualizare.
- Butonul „Vezi pe pagină" deschide `<url>?cms=<cheie>`; `app.js` derulează la element și îl conturează. Derularea se repetă (`load` + 400/1200/2200 ms) pentru că produsele și recenziile se încarcă după și mută layoutul.

## Conformare (ANPC / Netopia) — constrângeri externe

Reguli impuse din afara codului; se strică ușor fără să se vadă.

- **Pictograma ANPC** (footer, `app.js#footerHTML`): Ordinul 449/2022 art. 2, modificat prin Ordinul 270/2026, cere link **exact** către `https://reclamatiisal.anpc.ro` — nu către pagina de prezentare ANPC. Pictograma SOL a fost **eliminată** odată cu abrogarea Reg. UE 524/2013 (platforma europeană s-a închis pe 20 iulie 2025); nu o readuce. Ordinul spune 250×50 px, dar fișierul oficial e 500×124 (raport 4,03:1) — respectăm lățimea și lăsăm înălțimea 62, cu `width`/`height` egale cu randarea reală ca să nu apară layout shift.
- **Sigla NETOPIA**: scriptul extern trebuie să stea în markup **static** în fiecare pagină — un `<script>` injectat prin `outerHTML` (cum se injectează footerul) nu se execută niciodată. `app.js` mută `<div data-netopia>` întreg în footer, cu tot cu tag-ul `<script>`, pentru că `npId.js` face `script.parentNode.insertBefore(...)`. `mny.ro` trebuie în CSP la `script-src` **și** `img-src`, în helmet **și** în nginx (în producție nginx servește HTML-ul, deci doar helmet nu ajunge).
- Paginile legale (`/livrare`, `/anulare`, `/retur`, `/termeni`, `/confidentialitate`) sunt cerute de checklist-ul Netopia; identificarea completă a comerciantului (nume, CUI, Reg. Com., sediu, telefon, e-mail) stă în `.foot-legal`, deci apare pe fiecare pagină.

## Frontend architecture (`public/`)

Pagini statice multiple; **`js/app.js` e stratul comun** încărcat peste tot. La `DOMContentLoaded` injectează nav + footer (+ cart drawer doar pe paginile de shop), gestionează coșul/favoritele în `localStorage` și expune obiectul global **`window.BBE`** (`API`, `Cart`, `Favs`, `fmtLei`, `esc`, `urls`, ...) folosit de scripturile per-pagină (`shop.js`, `produs.js`, `cards.js`, `checkout.js`, `leadform.js`...).

`js/portal.js` (doar pe homepage) injectează ecranul de start „portal" (overlay full-screen cu 4 direcții) — se afișează la **fiecare** încărcare a homepage-ului (fără flag de „văzut"); markup-ul e în `index.html` cu `hidden` (degradează curat fără JS, CSP `scriptSrc 'self'` interzice inline). `Cart.meta()`/`Cart.setMeta()` din `app.js` țin opțiunile de comandă (felicitare/livrare) separat de produse și se golesc la `Cart.clear()`.

**Cache-busting — include ȘI panoul.** Fișierele `public/admin/admin.js` și `admin.css` sunt referite din `public/admin/index.html` și au nevoie de același `?v=` ca restul. nginx + Cloudflare le cachează 4 ore; fără bump, panoul rulează cod vechi în timp ce HTML-ul e nou — simptomul e o funcție care „nu face nimic" (ex. previzualizarea a rămas goală pentru că `admin.js` cachează versiunea dinaintea iframe-ului). Un `sed` peste `public/*.html` NU atinge `public/admin/index.html`.

Atributul HTML `hidden` se folosește pentru a ascunde/afișa elemente din JS (`loadMoreBtn`, portal, drawer). **Regulă critică:** `styles.css` are `[hidden] { display: none !important; }` — fără `!important`, o clasă care setează `display` (ex. `.btn`) învinge regula UA `[hidden]` și elementul rămâne vizibil. Nu seta `display` inline peste `hidden`.

Convenții care necesită mai multe fișiere pentru a fi înțelese:
- **`<body data-page="...">`** controlează nav-ul activ ȘI dacă apare coșul: coșul (buton + drawer) apare **doar** pe paginile cu `data-page="shop"` (shop, produs, checkout, multumim). Restul site-ului nu are coș.
- **URL-uri curate**, fără `.html` (vezi nginx). Link-uri tot fără `.html`.
- **Separare site principal vs magazin**: în producție site-ul e pe `thebigboomevents.ro`, magazinul pe `shop.thebigboomevents.ro`. `app.js` detectează contextul (`PROD` = host se termină în `thebigboomevents.ro`) și construiește link-uri absolute corecte (`U`/`BBE.urls`); local (localhost/IP) totul e relativ. Când adaugi link-uri cross-secțiune din JS, folosește `BBE.urls`, nu căi relative.
- **Filtre rapide shop (colecții)**: param `collection` (`popular`/`reduceri`/`nou`) trece prin tot stratul — `validation.js` (enum în `productQuerySchema`) → `listProducts` (`src/models/products.js`) → chips în `shop.js`/`shop.html`. „reduceri" se deduce din preț (`old_price_cents > price_cents`, sursa de adevăr), „popular"/„nou" din coloana `badge`. Orice filtru nou de listare se adaugă în toate cele trei locuri.
- **`badge` — enum la scriere, text liber la randare**: `cards.js` randează *orice* valoare `badge` ca `<span class="badge {badge}">` (stiluri dedicate doar pentru `.reducere`/`.nou`, restul cad pe stilul default). DAR `validation.js#productInputSchema` acceptă la edit din admin doar `['nou','reducere','popular','']`. Deci în seed poți pune un badge arbitrar, însă un edit ulterior din panou l-ar respinge — ține-te de cele trei valori ca să eviți friction.

## Production deployment

Live: **https://thebigboomevents.ro** + **https://shop.thebigboomevents.ro**. VPS Ubuntu; datele de acces (host, user, cheie SSH) sunt în `DEPLOY.local.md`, negitat. Topologie: `Cloudflare DNS → nginx (static + proxy /api, HTTP→HTTPS) → Node/pm2 (127.0.0.1:3000) → PostgreSQL`.

- Backend: `$APP_DIR` (pm2 `bigboom-api`, pornește la boot). Frontend: `$WEB_DIR`. Secrete doar în `$APP_DIR/.env` (chmod 600) — NU în git.
- nginx: `/etc/nginx/sites-available/bigboom` + snippets în `/etc/nginx/snippets/` (securitate, proxy) + `/etc/nginx/conf.d/bigboom-global.conf`. Headere securitate (HSTS/CSP/X-Frame-Options/nosniff), `server_tokens off`, rate-limit pe `/api/admin/login`. CSP-ul din nginx trebuie să rămână aliniat cu CSP-ul helmet din `server.js`.
- Re-deploy: rsync `src db scripts package.json` → `$APP_DIR/` (exclude `node_modules .env .git`) și `public/` → `$WEB_DIR/` (FĂRĂ `--delete` — ar șterge `assets/uploads`), apoi `cd $APP_DIR && npm install --omit=dev && pm2 restart bigboom-api`.
- **După fiecare deploy: `npm run apply-content`.** rsync-ul suprascrie `public/*.html`, deci șterge textele și pozele pe care clientul le-a schimbat din panoul „Pagini". Sursa de adevăr e tabelul `page_content`; scriptul o reaplică în fișiere. Fără pasul ăsta, modificările clientului dispar la primul deploy.
- **Migrări DB pe prod:** `schema.sql` e idempotent (`ALTER ... ADD COLUMN IF NOT EXISTS`) — sigur de rulat (`node scripts/run-sql.js db/schema.sql`). **NU rula `seed.sql` întreg pe prod** — re-adaugă produsele demo `baloane`/`fun` și ar suprascrie orice ai schimbat din admin; folosește `seed-addons.sql` (atinge doar categoria `extra` + add-on-urile).
- **Catalogul e real acum**, nu demo: ~21 produse în `florarie`, ~147 în `baloane` (import din Excel-ul clientului, vezi `db/seed-baloane-*.sql`). `seed.sql` a rămas idempotent (upsert pe `slug`), dar nu mai e sursa catalogului — produsele se administrează din panou. `fun` e goală.
- **Import de catalog din Excel**: pozele sunt ancorate în celulă (`oneCellAnchor` în `xl/drawings/*.xml`) și **openpyxl nu le vede** — se parsează XML-ul direct pentru maparea rând→imagine. Diferențiază întotdeauna față de catalogul existent înainte de import: fișierele clientului se suprapun masiv cu ce e deja în magazin.
- **Ștergerea produselor respectă FK-ul `order_items_product_id_fkey` (`ON DELETE RESTRICT`):** un produs care a fost vreodată comandat NU poate fi `DELETE`-uit. Pattern sigur (vezi cleanup-ul demo din `seed.sql`): `UPDATE ... SET is_active=FALSE WHERE id IN (SELECT product_id FROM order_items)` (ascunde din shop, păstrează istoricul) + `DELETE ... WHERE id NOT IN (SELECT product_id FROM order_items)`.
- SSL: Let's Encrypt, auto-renew via `certbot.timer`; `~/enable-ssl.sh` adaugă SSL pentru subdomenii noi.
- **Cod versionat în git** (de la 2026-06): repo **public** `github.com/dragosreal1214/bigboomevents` (`gh` logat ca `dragosreal1214`). Fiind public, în fișierele versionate NU intră IP-ul de origine, userul SSH, numele cheii sau căile de pe server — sunt în `DEPLOY.local.md` (gitignored). Originea e ascunsă în spatele Cloudflare (proxy activ); expunerea IP-ului ar permite ocolirea lui. `.env` e gitignored; doar `.env.example` (placeholdere) e urcat. `.git` nu se transferă pe server (rsync îl exclude).

Detalii suplimentare de stare (ce e încă de făcut: email pe domeniu, credențiale Netopia, date firmă în paginile legale) sunt în `~/.claude/.../memory/deploy-state.md` și în secțiunea Deploy din `README.md`.
