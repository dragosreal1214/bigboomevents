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
    contact: MAIN + '/contact',
    termeni: MAIN + '/termeni',
    confidentialitate: MAIN + '/confidentialitate',
    retur: MAIN + '/retur',
    shop: SHOP + '/shop',
    shopCat: (c) => SHOP + '/shop?category=' + encodeURIComponent(c),
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
    subtotalCents: () => Object.values(cart).reduce((a, b) => a + b.price * 100 * b.qty, 0),
    add(p, qty = 1, opts = {}) {
      const id = p.id;
      if (cart[id]) cart[id].qty += qty;
      else cart[id] = { id, name: p.name, price: p.price, cat: p.category || p.cat, image: (p.images && p.images[0]) || p.image || '', qty, isAddon: !!p.isAddon };
      saveCart();
      if (!opts.silent) toast(`„${p.name}" adăugat în coș 🎈`);
    },
    setQty(id, qty) {
      if (!cart[id]) return;
      if (qty <= 0) delete cart[id];
      else cart[id].qty = qty;
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
      <a href="${U.home}" class="brand"><span class="dot"></span>BigBoomEvents</a>
      <div class="nav-links">
        <a href="${U.home}" data-nav="index">Acasă</a>
        <a href="${U.evenimente}" data-nav="evenimente">Evenimente</a>
        <a href="${U.shop}" data-nav="shop">Magazin</a>
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

  function footerHTML() {
    return `
  <footer>
    <div class="wrap">
      <div class="foot-grid">
        <div>
          <div class="brand"><span class="dot"></span>BigBoomEvents</div>
          <p>Flori, baloane și evenimente. Sărbători gândite simplu, livrate cu grijă.</p>
        </div>
        <div class="foot-col">
          <h4>Magazin</h4>
          <a href="${U.shop}">Toate produsele</a>
          <a href="${U.shopCat('florarie')}">Florărie</a>
          <a href="${U.shopCat('baloane')}">Baloane</a>
          <a href="${U.shopCat('fun')}">Fun</a>
        </div>
        <div class="foot-col">
          <h4>Companie</h4>
          <a href="${U.evenimente}">Evenimente</a>
          <a href="${U.contact}">Contact</a>
          <a href="tel:+40">Telefon · de completat</a>
          <a href="mailto:contact@thebigboomevents.ro">contact@thebigboomevents.ro</a>
        </div>
        <div class="foot-col">
          <h4>Informații</h4>
          <a href="${U.termeni}">Termeni și condiții</a>
          <a href="${U.confidentialitate}">Confidențialitate</a>
          <a href="${U.retur}">Politică de retur</a>
          <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener">ANPC · SOL/SAL</a>
        </div>
      </div>
      <div class="foot-bottom">
        <span>© <span data-year></span> BigBoomEvents. Toate drepturile rezervate.</span>
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
      <p class="note">Livrare gratuită peste 250 lei · plată card sau ramburs.</p>
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

    // anul în footer
    document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

    // marchează pagina curentă în nav
    if (page) {
      const link = document.querySelector(`[data-nav="${page}"]`);
      if (link) link.setAttribute('aria-current', 'page');
    }
    bindLayoutEvents();
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
          <div class="sw ${catClass(it.cat)}" ${it.image ? `style="background-image:url('${it.image}')"` : ''}></div>
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

  // ---------- EXPOSE ----------
  window.BBE = { API, Cart, Favs, toast, fmt, fmtLei, esc, catClass, urls: U, openCart: () => document.querySelector('[data-open-cart]')?.click() };

  // ---------- COOKIE BANNER ----------
  function cookieBanner() {
    if (localStorage.getItem('bbe_cookie_ok')) return;
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;left:16px;right:16px;bottom:16px;max-width:520px;margin:0 auto;background:var(--ink);color:#fff;border-radius:16px;padding:18px 20px;z-index:80;box-shadow:var(--shadow);font-size:14.5px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:center';
    el.innerHTML =
      '<span style="flex:1;min-width:200px">Folosim un minim de stocare locală pentru coș și preferințe. Vezi <a href="' + U.confidentialitate + '" style="color:var(--butter)">politica de confidențialitate</a>.</span>' +
      '<button class="btn btn-primary btn-sm" data-cookie-ok>Am înțeles</button>';
    document.body.appendChild(el);
    el.querySelector('[data-cookie-ok]').addEventListener('click', () => {
      localStorage.setItem('bbe_cookie_ok', '1');
      el.remove();
    });
  }

  // ---------- FAVICON ----------
  function injectFavicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = '/assets/favicon.svg';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  }

  // ---------- INIT ----------
  document.addEventListener('DOMContentLoaded', () => {
    injectFavicon();
    injectLayout();
    renderCart();
    updateCount();
    cookieBanner();
  });
})();
