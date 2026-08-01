/* ═══════════════════════════════════════════════════════════════════
   app.js — strat comun pe toate paginile:
   - injectează nav + footer + cart drawer
   - gestionează coșul (localStorage), favoritele, toast-uri
   - expune window.BBE cu helperi pentru paginile individuale
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ---------- CONTEXT URL (separare site principal vs subdomeniu shop) ----------
  // În producție site-ul stă pe thebigboomevents.ro, iar magazinul pe
  // shop.thebigboomevents.ro. Local (localhost/IP) totul e relativ.
  const PROD = /(?:^|\.)thebigboomevents\.ro$/i.test(location.hostname);
  const MAIN = PROD ? 'https://thebigboomevents.ro' : '';
  const SHOP = PROD ? 'https://shop.thebigboomevents.ro' : '';
  const U = {
    home: MAIN + '/',
    evenimente: MAIN + '/evenimente',
    decoratiuni: MAIN + '/decoratiuni',
    wedding: MAIN + '/wedding',
    contact: MAIN + '/contact',
    termeni: MAIN + '/termeni',
    confidentialitate: MAIN + '/confidentialitate',
    cookies: MAIN + '/cookies',
    retur: MAIN + '/retur',
    livrare: MAIN + '/livrare',
    anulare: MAIN + '/anulare',
    // „Politica GDPR" cerută de Netopia = secțiunea de drepturi din politica de
    // confidențialitate; link separat, ancoră în aceeași pagină.
    gdpr: MAIN + '/confidentialitate#gdpr',
    shop: SHOP + '/shop',
    shopCat: (c) => SHOP + '/shop?category=' + encodeURIComponent(c),
    florarie: SHOP + '/florarie',
    baloane: SHOP + '/baloane',
  };
  // Paginile pe care apare coșul (restul site-ului nu are coș).
  const SHOP_PAGES = ['shop', 'produs', 'checkout', 'multumim'];

  // ---------- API CLIENT ----------
  const API = {
    async get(path) {
      const r = await fetch('/api' + path, { headers: { Accept: 'application/json' } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || 'Eroare'), { status: r.status, details: j.details });
      return j;
    },
    async post(path, body) {
      const r = await fetch('/api' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || 'Eroare'), { status: r.status, details: j.details });
      return j;
    },
  };

  // ---------- FORMAT ----------
  const fmt = (cents) => new Intl.NumberFormat('ro-RO').format(Math.round(cents) / 100) + ' lei';
  const fmtLei = (lei) => new Intl.NumberFormat('ro-RO').format(lei) + ' lei';

  // ---------- STORAGE (cart + favorites) ----------
  const CART_KEY = 'bbe_cart_v1';
  const FAV_KEY = 'bbe_fav_v1';
  const META_KEY = 'bbe_cart_meta_v1'; // text felicitare + dată/oră livrare (nivel comandă)

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  // cart = { [productId]: { id, name, price, cat, image, qty } }
  let cart = readJSON(CART_KEY, {});
  let favs = readJSON(FAV_KEY, []);
  // meta = { giftMessage, deliveryDate, deliverySlot } — opțiuni de comandă, nu produse
  let cartMeta = readJSON(META_KEY, {});

  function saveCart() { writeJSON(CART_KEY, cart); renderCart(); updateCount(); }
  function saveFavs() { writeJSON(FAV_KEY, favs); document.dispatchEvent(new CustomEvent('bbe:favs')); }

  const Cart = {
    items: () => Object.values(cart),
    count: () => Object.values(cart).reduce((a, b) => a + b.qty, 0),
    // Banii se adună DOAR în cenți întregi. Cu prețul în lei zecimali,
    // 40,62 + 131,45 + 77,93 dădea 249,999… și pragul de livrare gratuită
    // afișat clientului nu mai coincidea cu cel calculat de server.
    lineCents: (b) => (Number.isFinite(b.priceCents) ? b.priceCents : Math.round(b.price * 100)) * b.qty,
    subtotalCents() { return Object.values(cart).reduce((a, b) => a + this.lineCents(b), 0); },
    add(p, qty = 1, opts = {}) {
      const id = p.id;
      // Produsele „preț la cerere" nu au ce căuta în coș — comanda ar fi respinsă.
      if (!p.isAddon && !(p.priceCents ?? Math.round((p.price || 0) * 100))) return;
      const max = Number.isFinite(p.stock) && !p.isAddon ? Math.max(1, p.stock) : 99;
      if (cart[id]) cart[id].qty = Math.min(max, cart[id].qty + qty);
      else cart[id] = {
        id, name: p.name, price: p.price,
        priceCents: p.priceCents ?? Math.round((p.price || 0) * 100),
        cat: p.category || p.cat, image: (p.images && p.images[0]) || p.image || '',
        qty: Math.min(max, qty), isAddon: !!p.isAddon,
        stock: Number.isFinite(p.stock) ? p.stock : null,
      };
      saveCart();
      if (!opts.silent) toast(`„${p.name}" adăugat în coș 🎈`);
    },
    setQty(id, qty) {
      if (!cart[id]) return;
      const line = cart[id];
      // Plafon pe stocul real: altfel clientul află abia la plasarea comenzii.
      const max = Number.isFinite(line.stock) && !line.isAddon ? Math.max(1, line.stock) : 99;
      if (qty <= 0) delete cart[id];
      else cart[id].qty = Math.min(max, qty);
      saveCart();
    },
    change(id, d) { if (cart[id]) this.setQty(id, cart[id].qty + d); },
    remove(id) { delete cart[id]; saveCart(); },
    clear() { cart = {}; cartMeta = {}; writeJSON(META_KEY, cartMeta); saveCart(); },
    // opțiuni de comandă (text felicitare + dată/oră livrare)
    meta: () => ({ ...cartMeta }),
    setMeta(patch) { cartMeta = { ...cartMeta, ...patch }; writeJSON(META_KEY, cartMeta); },
  };

  const Favs = {
    list: () => favs,
    has: (id) => favs.includes(id),
    toggle(id) {
      const i = favs.indexOf(id);
      if (i >= 0) favs.splice(i, 1); else favs.push(id);
      saveFavs();
      return favs.includes(id);
    },
  };

  // ---------- TOAST ----------
  let toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    requestAnimationFrame(() => toastEl.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  // ---------- LAYOUT INJECTION ----------
  // Nav-ul: link-uri conștiente de context. Coșul apare DOAR pe paginile de shop.
  function navHTML(showCart) {
    const cart = showCart
      ? `<button class="cart-btn" data-open-cart aria-label="Deschide coșul">Coș <span class="cart-count" data-cart-count>0</span></button>`
      : '';
    return `
  <nav class="nav">
    <div class="wrap nav-inner">
      <a href="${U.home}" class="brand" aria-label="The Big Boom Events — Acasă">
        <span class="brand-eyebrow">The Big</span>
        <span class="brand-name">Boom</span>
        <span class="brand-sub">Events</span>
      </a>
      <div class="nav-links">
        <a href="${U.home}" data-nav="index">Acasă</a>
        <a href="${U.florarie}" data-nav="florarie">Florărie</a>
        <a href="${U.baloane}" data-nav="baloane">Baloane &amp; Party Shop</a>
        <a href="${U.decoratiuni}" data-nav="decoratiuni">Decorațiuni Evenimente</a>
        <a href="${U.wedding}" data-nav="wedding">Wedding Planner</a>
        <a href="${U.contact}" data-nav="contact">Contact</a>
      </div>
      <div class="nav-actions">
        ${cart}
        <button class="nav-toggle" aria-label="Meniu" aria-expanded="false">
          <span class="nav-bars" aria-hidden="true"></span>
        </button>
      </div>
    </div>
  </nav>`;
  }

  // Iconuri social (inline, ca să nu iasă din CSP `imgSrc: self,data:` și să
  // preia culoarea textului din footer prin `fill: currentColor`).
  const IG_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.12 1.39C1.35 2.68.93 3.35.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.39 2.12.66.67 1.33 1.09 2.12 1.39.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.3 1.46-.72 2.12-1.39.67-.66 1.09-1.33 1.39-2.12.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.3-.79-.72-1.46-1.39-2.12-.66-.67-1.33-1.09-2.12-1.39-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0z"/><path fill="currentColor" d="M12 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/><circle fill="currentColor" cx="18.41" cy="5.59" r="1.44"/></svg>`;
  const FB_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.96h-1.52c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>`;

  function footerHTML() {
    return `
  <footer>
    <div class="wrap">
      <div class="foot-grid">
        <div>
          <div class="brand"><span class="dot"></span>The Big Boom Events</div>
          <p>Flori, baloane și evenimente. Sărbători gândite simplu, livrate cu grijă.</p>
        </div>
        <div class="foot-col">
          <h4>Magazin</h4>
          <a href="${U.florarie}">Florărie</a>
          <a href="${U.baloane}">Baloane &amp; Accesorii Party</a>
          <a href="${U.shop}">Toate produsele</a>
        </div>
        <div class="foot-col">
          <h4>Servicii</h4>
          <a href="${U.decoratiuni}">Decorațiuni Evenimente</a>
          <a href="${U.wedding}">Wedding Planner</a>
          <a href="${U.contact}">Contact</a>
          <a href="tel:+40755436904">0755 436 904</a>
          <div class="foot-social">
            <a href="https://www.instagram.com/the_big_boom_events/" target="_blank" rel="noopener" aria-label="Instagram">${IG_ICON}</a>
            <a href="https://www.facebook.com/BIGBOOMEVENTS/" target="_blank" rel="noopener" aria-label="Facebook">${FB_ICON}</a>
          </div>
        </div>
        <div class="foot-col">
          <h4>Informații</h4>
          <a href="${U.termeni}">Termeni și condiții</a>
          <a href="${U.confidentialitate}">Politică de confidențialitate</a>
          <a href="${U.gdpr}">Politică GDPR</a>
          <a href="${U.livrare}">Politică de livrare</a>
          <a href="${U.anulare}">Politică de anulare</a>
          <a href="${U.retur}">Politică de retur</a>
          <a href="${U.cookies}">Politică de cookies</a>
          <a href="#" data-open-consent>Setări cookies</a>
        </div>
      </div>

      <!-- Identificarea completă a comerciantului — cerință Netopia/ANPC: nume,
           CUI/CIF, adresă, telefon și e-mail vizibile pe fiecare pagină. -->
      <div class="foot-legal">
        <strong>The Big Boom Events</strong> — denumire comercială a
        <strong>SC RICHES VAMBRO SRL</strong> ·
        CUI <strong>40320845</strong> · Reg. Com. <strong>J2018003495220</strong> ·
        Sediu social: Sat Răducăneni, Com. Răducăneni, Nr. 1284A, Jud. Iași, România ·
        Tel. <a href="tel:+40755436904">0755 436 904</a> ·
        E-mail <a href="mailto:contact@thebigboomevents.ro">contact@thebigboomevents.ro</a> ·
        Societate neplătitoare de TVA · Prețuri în lei (RON).
      </div>
      <div class="foot-anpc">
        <!-- Ordinul ANPC 449/2022, art. 2 (modificat prin Ordinul 270/2026):
             pictograma SAL, 250x50 px, cu link EXTERN fix către platforma
             reclamatiisal.anpc.ro — adresa e prevăzută explicit în ordin, nu e
             la alegere. Pictograma SOL a fost eliminată odată cu abrogarea
             platformei europene ODR (Reg. UE 2024/3228). -->
        <a href="https://reclamatiisal.anpc.ro" target="_blank" rel="noopener">
          <!-- 250 px lățime, cât cere ordinul. Înălțimea e 62, nu 50: fișierul
               oficial din Anexa 2 e 500x124 px (raport 4,03:1), deci la 250 lățime
               nu poate ieși 50 fără să turtească stema ANPC. Atributele trebuie să
               reflecte randarea reală, altfel apare salt de layout (CLS). -->
          <img src="/assets/anpc-sal.png" alt="ANPC — Soluționarea Alternativă a Litigiilor" width="250" height="62" loading="lazy" />
        </a>
        <span data-netopia-slot></span>
      </div>
      <div class="foot-bottom">
        <span>© <span data-year></span> The Big Boom Events. Toate drepturile rezervate.</span>
        <span>Flori · Baloane · Evenimente — Iași</span>
      </div>
    </div>
  </footer>`;
  }

  const DRAWER_HTML = `
  <div class="scrim" data-scrim></div>
  <aside class="drawer" data-drawer aria-label="Coș de cumpărături" aria-hidden="true">
    <div class="drawer-head">
      <h3>Coșul tău</h3>
      <button class="x" data-close-cart aria-label="Închide coșul">×</button>
    </div>
    <div class="drawer-items" data-cart-items></div>
    <div class="drawer-foot">
      <div class="total"><span class="lbl">Subtotal</span><span class="amt" data-cart-total>0 lei</span></div>
      <a class="btn btn-primary btn-block" href="/checkout" data-checkout-link>Finalizează comanda</a>
      <p class="note">Livrare gratuită peste 500 lei · plată card sau ramburs.</p>
    </div>
  </aside>`;

  function injectLayout() {
    const page = document.body.dataset.page || '';
    const showCart = SHOP_PAGES.includes(page);

    const header = document.querySelector('[data-include="nav"]');
    if (header) header.outerHTML = navHTML(showCart);
    const footer = document.querySelector('[data-include="footer"]');
    if (footer) footer.outerHTML = footerHTML();
    // drawer + scrim DOAR pe paginile de shop
    if (showCart) document.body.insertAdjacentHTML('beforeend', DRAWER_HTML);

    // Sigla NETOPIA: `<div data-netopia>` cu scriptul oficial stă în markup-ul
    // static al fiecărei pagini (un <script> venit din `footerHTML()` prin
    // outerHTML NU s-ar executa niciodată). Îl mutăm aici lângă bannerele ANPC
    // cu tot cu <script>, ca `script.parentNode` — de care depinde npId.js ca să
    // insereze imaginea — să rămână valid indiferent de ordinea execuției.
    const netopia = document.querySelector('[data-netopia]');
    const netopiaSlot = document.querySelector('[data-netopia-slot]');
    if (netopia && netopiaSlot) netopiaSlot.appendChild(netopia);

    // anul în footer
    document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

    // marchează pagina curentă în nav
    if (page) {
      const link = document.querySelector(`[data-nav="${page}"]`);
      if (link) link.setAttribute('aria-current', 'page');
    }
    bindLayoutEvents();
    trackNavHeight();
    setupReveal();
    highlightCmsTarget();
    // Link „Setări cookies" din footer → redeschide dialogul de consimțământ.
    document.querySelectorAll('[data-open-consent]').forEach((a) =>
      a.addEventListener('click', (e) => { e.preventDefault(); Consent.open(); })
    );
  }

  // Apariție la scroll. Marcăm <html> abia aici: dacă JS nu rulează sau
  // browserul n-are IntersectionObserver, regula CSS care ascunde elementele
  // nu se aplică deloc și pagina rămâne complet vizibilă.
  function setupReveal() {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const SELECTOR = [
      'main .section-head', 'main .hero-content', 'main .cta-band', 'main .card-block',
      'main .steps > *', 'main .wp-step', 'main .wp-why > *', 'main .decor-shot',
      'main .lead-grid > *', 'main .legal h2', 'main .portfolio > *', 'main .promo-strip',
    ].join(',');

    const els = document.querySelectorAll(SELECTOR);
    if (!els.length) return;
    document.documentElement.classList.add('has-reveal');

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    els.forEach((el) => { el.classList.add('reveal'); io.observe(el); });

    // Plasă de siguranță: dacă ceva nu declanșează observerul (element
    // în afara fluxului, layout întârziat), afișăm oricum după 2 secunde.
    setTimeout(() => document.querySelectorAll('.reveal:not(.in)').forEach((el) => el.classList.add('in')), 2000);
  }

  // Nav-ul e sticky și își schimbă înălțimea (meniul se rupe pe 2 rânduri pe
  // lățimi medii). Publicăm înălțimea reală în `--nav-h`, ca elementele sticky
  // de dedesubt (sidebar shop, sumar checkout) să nu ajungă sub el.
  function trackNavHeight() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const apply = () => document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px');
    // Citirea offsetHeight imediat după ce am injectat layout-ul forța un reflow
    // sincron (blochează firul principal). O amânăm în rAF: browserul face
    // layout-ul o dată, apoi citim — fără reflow forțat pe calea critică.
    requestAnimationFrame(apply);
    if (window.ResizeObserver) new ResizeObserver(apply).observe(nav);
    else window.addEventListener('resize', apply);
  }

  // ---------- DRAWER + NAV EVENTS ----------
  function bindLayoutEvents() {
    // meniul mobil (full-screen) — pe toate paginile
    const toggle = document.querySelector('.nav-toggle');
    const links = document.querySelector('.nav-links');
    if (toggle && links) {
      const setMenu = (open) => {
        links.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Închide meniul' : 'Meniu');
        document.body.classList.toggle('menu-open', open);
      };
      toggle.addEventListener('click', () => setMenu(!links.classList.contains('open')));
      // închide când dai click pe un link sau apeși Escape
      links.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    }

    // restul (coș/drawer) doar dacă drawer-ul există (pagini de shop)
    const drawer = document.querySelector('[data-drawer]');
    if (!drawer) return;
    const scrim = document.querySelector('[data-scrim]');
    const open = () => { drawer.classList.add('open'); scrim.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); };
    const close = () => { drawer.classList.remove('open'); scrim.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); };

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-open-cart]')) open();
      if (e.target.closest('[data-close-cart]')) close();
      if (e.target === scrim) close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    // qty în drawer
    document.querySelector('[data-cart-items]').addEventListener('click', (e) => {
      const q = e.target.closest('button[data-d]');
      if (q) Cart.change(q.dataset.id, +q.dataset.d);
      const rm = e.target.closest('[data-rm]');
      if (rm) Cart.remove(rm.dataset.rm);
    });

    // checkout link: nu lăsa coș gol
    document.querySelector('[data-checkout-link]').addEventListener('click', (e) => {
      if (Cart.count() === 0) { e.preventDefault(); toast('Coșul e gol. Adaugă ceva care face boom 🎈'); open(); }
    });
  }

  // ---------- RENDER CART ----------
  function catClass(cat) { return ['florarie', 'baloane', 'fun'].includes(cat) ? 'cat-' + cat : ''; }

  function renderCart() {
    const box = document.querySelector('[data-cart-items]');
    if (!box) return;
    const items = Cart.items();
    if (!items.length) {
      box.innerHTML = '<div class="empty">Coșul e gol.<br>Adaugă ceva care face boom. 🎈</div>';
    } else {
      box.innerHTML = items.map((it) => `
        <div class="ci">
          <div class="sw ${catClass(it.cat)}" ${it.image ? `style="background-image:url('${esc(it.image)}')"` : ''}></div>
          <div class="info">
            <div class="nm">${esc(it.name)}</div>
            <div class="pr">${fmtLei(it.price)}</div>
            <button class="rm" data-rm="${it.id}">Șterge</button>
          </div>
          <div class="qty">
            <button data-id="${it.id}" data-d="-1" aria-label="Scade">−</button>
            <span>${it.qty}</span>
            <button data-id="${it.id}" data-d="1" aria-label="Crește">+</button>
          </div>
        </div>`).join('');
    }
    const totalEl = document.querySelector('[data-cart-total]');
    if (totalEl) totalEl.textContent = fmt(Cart.subtotalCents());
    document.dispatchEvent(new CustomEvent('bbe:cart'));
  }

  function updateCount() {
    document.querySelectorAll('[data-cart-count]').forEach((el) => (el.textContent = Cart.count()));
  }

  // ---------- HELPERS ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- CONSIMȚĂMÂNT COOKIES (GDPR) ----------
  // Model pe categorii. „Necesare" sunt mereu active (fac site-ul să
  // funcționeze: coș, preferințe, sesiune). „Analiză" și „Marketing" pornesc
  // DOAR cu consimțământ explicit. Alegerea se salvează cu versiune + dată, ca
  // o schimbare a politicii să poată re-cere consimțământul.
  const CONSENT_KEY = 'bbe_consent_v1';
  const CONSENT_VERSION = 1;
  const CATEGORIES = [
    { key: 'necessary', label: 'Strict necesare', locked: true,
      desc: 'Fac site-ul să funcționeze: coșul de cumpărături, preferințele și securitatea. Nu pot fi dezactivate.' },
    { key: 'analytics', label: 'Analiză și statistici', locked: false,
      desc: 'Ne ajută să înțelegem cum e folosit site-ul, ca să-l îmbunătățim. Date agregate, anonime.' },
    { key: 'marketing', label: 'Marketing', locked: false,
      desc: 'Permit personalizarea reclamelor pe alte platforme (ex. Facebook, Google). Momentan nu sunt active.' },
  ];

  function readConsent() {
    const c = readJSON(CONSENT_KEY, null);
    if (!c || c.v !== CONSENT_VERSION) return null;
    return c;
  }
  function saveConsent(prefs) {
    const c = { v: CONSENT_VERSION, date: new Date().toISOString(),
      necessary: true, analytics: !!prefs.analytics, marketing: !!prefs.marketing };
    writeJSON(CONSENT_KEY, c);
    document.dispatchEvent(new CustomEvent('bbe:consent', { detail: c }));
    return c;
  }

  // API public: scripturile de tracking verifică `BBE.Consent.allowed('analytics')`
  // înainte să se încarce, și se pot re-abona la schimbări.
  const Consent = {
    get: () => readConsent(),
    allowed: (cat) => { const c = readConsent(); return cat === 'necessary' ? true : !!(c && c[cat]); },
    open: () => showConsent(true),
    onChange: (fn) => document.addEventListener('bbe:consent', (e) => fn(e.detail)),
  };

  function consentDialogHTML(current) {
    const rows = CATEGORIES.map((cat) => {
      const on = cat.locked ? true : !!(current && current[cat.key]);
      return `<label class="consent-row">
        <span class="consent-row-txt">
          <strong>${esc(cat.label)}</strong>
          <span class="consent-desc">${esc(cat.desc)}</span>
        </span>
        <input type="checkbox" data-consent="${cat.key}" ${on ? 'checked' : ''} ${cat.locked ? 'disabled' : ''} />
      </label>`;
    }).join('');
    return `
      <div class="consent-panel" role="dialog" aria-modal="false" aria-labelledby="consent-h" data-consent-panel>
        <div class="consent-main" data-consent-main>
          <h2 id="consent-h">🍪 Confidențialitatea ta contează</h2>
          <p>Folosim stocare locală și cookie-uri strict necesare ca site-ul să funcționeze. Cu acordul tău, folosim și cookie-uri de analiză și marketing. Poți alege ce accepți. Detalii în <a href="${U.confidentialitate}">politica de confidențialitate</a>.</p>
          <div class="consent-actions">
            <button class="btn btn-primary btn-sm" data-consent-accept>Accept toate</button>
            <button class="btn btn-ghost btn-sm" data-consent-reject>Refuz opționalele</button>
            <button class="btn btn-ghost btn-sm" data-consent-settings>Setări</button>
          </div>
        </div>
        <div class="consent-settings" data-consent-settings-view hidden>
          <h2>Setări cookie-uri</h2>
          <div class="consent-rows">${rows}</div>
          <div class="consent-actions">
            <button class="btn btn-primary btn-sm" data-consent-save>Salvează alegerile</button>
            <button class="btn btn-ghost btn-sm" data-consent-back>Înapoi</button>
          </div>
        </div>
      </div>`;
  }

  function showConsent(force) {
    if (!force && readConsent()) return; // deja a ales
    let host = document.querySelector('[data-consent-host]');
    if (host) host.remove();
    host = document.createElement('div');
    host.setAttribute('data-consent-host', '');
    host.className = 'consent-host';
    host.innerHTML = consentDialogHTML(readConsent());
    document.body.appendChild(host);

    const q = (s) => host.querySelector(s);
    const close = () => host.remove();
    const readToggles = () => ({
      analytics: q('[data-consent="analytics"]').checked,
      marketing: q('[data-consent="marketing"]').checked,
    });

    q('[data-consent-accept]').addEventListener('click', () => { saveConsent({ analytics: true, marketing: true }); close(); });
    q('[data-consent-reject]').addEventListener('click', () => { saveConsent({ analytics: false, marketing: false }); close(); });
    q('[data-consent-settings]').addEventListener('click', () => {
      q('[data-consent-main]').hidden = true;
      q('[data-consent-settings-view]').hidden = false;
    });
    q('[data-consent-back]').addEventListener('click', () => {
      q('[data-consent-settings-view]').hidden = true;
      q('[data-consent-main]').hidden = false;
    });
    q('[data-consent-save]').addEventListener('click', () => { saveConsent(readToggles()); close(); });
  }

  function cookieBanner() { showConsent(false); }

  // ---------- EXPOSE ----------
  // ---------- EVIDENȚIERE PENTRU EDITORUL DIN PANOU ----------
  // Panoul deschide pagina cu ?cms=<cheie>. Găsim elementul marcat, îl aducem
  // în ecran și îl conturăm câteva secunde. Fără asta, clientul ar trebui să
  // ghicească la ce element din pagină corespunde un câmp din formular.
  function highlightCmsTarget() {
    const key = new URLSearchParams(location.search).get('cms');
    if (!key) return;
    const el = document.querySelector(
      `[data-cms="${CSS.escape(key)}"], [data-cms-img="${CSS.escape(key)}"]`
    );
    if (!el) return;
    el.classList.add('cms-highlight');
    // Produsele și recenziile se încarcă DUPĂ acest moment și mută layoutul,
    // deci o singură derulare ajunge în gol. Repetăm până se așază pagina.
    const adu = () => el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    adu();
    window.addEventListener('load', adu, { once: true });
    [400, 1200, 2200].forEach((t) => setTimeout(adu, t));
    setTimeout(() => el.classList.remove('cms-highlight'), 8000);
  }

  window.BBE = { API, Cart, Favs, Consent, toast, fmt, fmtLei, esc, catClass, urls: U, openCart: () => document.querySelector('[data-open-cart]')?.click() };

  // ---------- FAVICON ----------
  function injectFavicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = '/assets/favicon.svg';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  }

  // ---------- BANNER PROMO (marquee infinit) ----------
  // Bara de sus, configurabilă din backoffice. Bucla e seamless: două grupuri
  // identice, translateX(-50%) — când primul grup iese, al doilea îi ia locul.
  //
  // Anti-„pop": banner-ul se cachează în localStorage și se randează SINCRON la
  // încărcare (fără să aștepte API-ul), deci nu mai apare cu întârziere împingând
  // pagina. La prima vizită (fără cache) se rezervă spațiul cu un skeleton, apoi
  // se umple când răspunde API-ul. Fondul se reîmprospătează în fundal.
  const BANNER_KEY = 'bbe_banner_v1';

  function bannerMarkup(b) {
    const text = esc(b.text);
    const seg = `<span class="promo-seg">${text}</span><span class="promo-sep" aria-hidden="true">✦</span>`;
    const group = seg.repeat(12);
    const dur = Math.max(5, Math.min(120, Number(b.speed) || 30));
    return `
      <div class="promo-banner" role="marquee" aria-label="${text}"
           style="--promo-bg:${esc(b.bgColor || '#111')};--promo-fg:${esc(b.textColor || '#fff')};--promo-dur:${dur}s">
        <div class="promo-track">
          <div class="promo-group">${group}</div>
          <div class="promo-group" aria-hidden="true">${group}</div>
        </div>
      </div>`;
  }

  // Umple placeholder-ul [data-include="promo"] (care rezervă deja 30px din CSS,
  // din prima pictare) — deci fără layout shift. Fallback: dacă placeholder-ul
  // lipsește (HTML vechi), inserează la începutul body-ului.
  function renderBanner(b) {
    const host = document.querySelector('[data-include="promo"]');
    const empty = !b || !b.enabled || !b.text;
    if (empty) {
      if (host) { host.innerHTML = ''; host.classList.add('promo-empty'); }
      else { const ex = document.querySelector('.promo-banner'); if (ex) ex.remove(); }
      document.body.classList.remove('has-promo');
      return;
    }
    const html = bannerMarkup(b);
    if (host) { host.innerHTML = html; host.classList.remove('promo-empty'); }
    else {
      const ex = document.querySelector('.promo-banner');
      if (ex) ex.outerHTML = html; else document.body.insertAdjacentHTML('afterbegin', html);
    }
    document.body.classList.add('has-promo');
  }

  function injectBanner() {
    // 1. Sincron din cache → banner-ul apare instant în spațiul deja rezervat.
    const cached = readJSON(BANNER_KEY, null);
    if (cached) renderBanner(cached);
    // (fără cache: placeholder-ul rezervă 30px prin CSS cât timp se încarcă)
    // 2. Reîmprospătează din API și actualizează la loc.
    API.get('/banner')
      .then(({ banner }) => {
        writeJSON(BANNER_KEY, banner || { enabled: false });
        renderBanner(banner);
      })
      .catch(() => {});
  }

  // ---------- INIT ----------
  document.addEventListener('DOMContentLoaded', () => {
    injectFavicon();
    injectLayout();
    injectBanner();
    renderCart();
    updateCount();
    cookieBanner();
  });
})();
