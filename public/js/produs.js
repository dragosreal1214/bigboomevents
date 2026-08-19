/* produs.js — pagina de produs: galerie, extra-opțiuni, text felicitare,
   dată/oră livrare, cantitate, related. */
(function () {
  'use strict';
  const { API, esc, fmtLei, Cart, Favs, cardHTML, bindCards, skeletons, toast, urls } = window.BBE;

  // Slug din URL curat /produs/<slug> sau, ca fallback, din ?slug= (linkuri vechi).
  const slug = (function () {
    const m = location.pathname.match(/^\/produs\/([^/?#]+)/);
    if (m) return decodeURIComponent(m[1]);
    return new URLSearchParams(location.search).get('slug');
  })();
  // Canonical + curățare URL: /produs?slug=x → /produs/x (fără reload).
  if (slug) {
    const clean = '/produs/' + encodeURIComponent(slug);
    if (location.pathname !== clean) history.replaceState(null, '', clean);
    let c = document.querySelector('link[rel="canonical"]');
    if (!c) { c = document.createElement('link'); c.rel = 'canonical'; document.head.appendChild(c); }
    c.setAttribute('href', location.origin + clean);
  }
  const box = document.querySelector('[data-product]');

  // intervale orare propuse pentru livrare
  // Programul de livrare e 09:00–18:00; lista trebuie să rămână identică cu
  // cea din <select> din checkout.html, altfel intervalul ales pe pagina de
  // produs nu se mai pre-completează la finalizarea comenzii.
  const SLOTS = ['09:00 – 12:00', '12:00 – 15:00', '15:00 – 18:00'];
  // data minimă selectabilă = azi (YYYY-MM-DD, în fus local)
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function gallery(images, name) {
    const imgs = images && images.length ? images : [''];
    const main = imgs[0]
      ? `<img src="${esc(imgs[0])}" alt="${esc(name)}" data-main-img />`
      : `<div style="font-size:80px" data-main-img>🎈</div>`;
    const thumbs = imgs.length > 1
      ? `<div class="thumbs">${imgs.map((src, i) => `<button data-thumb="${esc(src)}" aria-current="${i === 0}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>`
      : '';
    return `<div class="gallery"><div class="main-img">${main}</div>${thumbs}</div>`;
  }

  function attrs(p) {
    const occ = (p.occasions || []).map((o) => `<span class="pill">${esc(o)}</span>`).join('');
    const col = (p.colors || []).map((c) => `<span class="pill">${esc(c)}</span>`).join('');
    if (!occ && !col) return '';
    return `<div class="attr">${occ}${col}</div>`;
  }

  // Un card de extra-opțiune (felicitare / bomboane / șampanie / pungă).
  function addonCard(a) {
    const img = (a.images && a.images[0])
      ? `<img src="${esc(a.images[0])}" alt="${esc(a.name)}" loading="lazy" />`
      : '🎁';
    const price = a.price > 0 ? `+${fmtLei(a.price)}` : 'Gratuit';
    return `
      <button type="button" class="addon" data-addon-id="${a.id}" aria-pressed="false" title="${esc(a.name)}">
        <span class="addon-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
        </span>
        <span class="addon-img">${img}</span>
        <span class="addon-name">${esc(a.name)}</span>
        <span class="addon-price">${price}</span>
      </button>`;
  }

  // Add-on-ul care schimbă zona de text: la florile funerare nu se scrie o
  // felicitare, ci un mesaj pe panglica aranjamentului. Comutarea se face după
  // extra-opțiunile primite de la server, nu după numele produsului — deci
  // clientul o activează atașând add-on-ul, fără modificări în cod.
  const RIBBON_ADDON = 'addon-mesaj-panglica';

  function optionsHTML(addons, category) {
    const meta = Cart.meta();
    // La party shop (baloane) nu are sens un text de felicitare (buchet) — se ascunde.
    const showGift = category !== 'baloane';
    const ribbon = addons.some((a) => a.slug === RIBBON_ADDON);
    const giftTitle = ribbon ? 'Mesaj pentru panglică' : 'Text pentru felicitare';
    const giftPlaceholder = ribbon
      ? 'Scrie aici mesajul care va fi trecut pe panglică (opțional)…'
      : 'Scrie aici mesajul care va însoți buchetul (opțional)…';
    const addonsBlock = addons.length ? `
      <div class="opt-block">
        <h3 class="opt-title">Adaugă extraopțiuni</h3>
        <div class="addons" data-addons>${addons.map(addonCard).join('')}</div>
        <div class="heliu-notice" data-heliu-notice hidden role="alert">
          <span class="heliu-notice-icon" aria-hidden="true">📍</span>
          <span><strong>Atenție:</strong> baloanele umflate cu heliu se livrează <strong>exclusiv în Iași</strong>. Pentru alte orașe, alege balonul fără heliu.</span>
        </div>
      </div>` : '';

    const slotOpts = SLOTS.map((s) =>
      `<option value="${esc(s)}" ${meta.deliverySlot === s ? 'selected' : ''}>${esc(s)}</option>`
    ).join('');

    return `
      ${addonsBlock}
      ${showGift ? `
      <div class="opt-block">
        <h3 class="opt-title">${esc(giftTitle)}</h3>
        <textarea class="input" data-gift rows="3" maxlength="300"
          placeholder="${esc(giftPlaceholder)}">${esc(meta.giftMessage || '')}</textarea>
      </div>` : ''}
      <div class="opt-block">
        <h3 class="opt-title">Alege data și ora livrării</h3>
        <div class="delivery-row">
          <input type="date" class="input" data-deliv-date min="${todayISO()}" value="${esc(meta.deliveryDate || '')}" aria-label="Data livrării" />
          <select class="input" data-deliv-slot aria-label="Ora livrării">
            <option value="">Selectează ora</option>
            ${slotOpts}
          </select>
        </div>
      </div>`;
  }

  // Actualizează meta SEO + date structurate pentru produsul curent (Google
  // randează JS, deci prinde astea → rezultate îmbogățite: preț, disponibilitate).
  function setProductSeo(p) {
    const url = location.origin + location.pathname;
    const img = (p.images && p.images[0]) ? location.origin + p.images[0] : location.origin + '/assets/og-image.jpg';
    const desc = (p.description || '').replace(/\s+/g, ' ').trim().slice(0, 200) || `${p.name} — The Big Boom Events, Iași.`;
    const setMeta = (sel, attr, val) => {
      let m = document.head.querySelector(sel);
      if (!m) { m = document.createElement('meta'); const [k, v] = attr; m.setAttribute(k, v); document.head.appendChild(m); }
      m.setAttribute('content', val);
    };
    document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
    setMeta('meta[property="og:title"]', ['property', 'og:title'], `${p.name} — The Big Boom Events`);
    setMeta('meta[property="og:description"]', ['property', 'og:description'], desc);
    setMeta('meta[property="og:image"]', ['property', 'og:image'], img);
    setMeta('meta[property="og:url"]', ['property', 'og:url'], url);
    setMeta('meta[property="og:type"]', ['property', 'og:type'], 'product');
    setMeta('meta[name="twitter:image"]', ['name', 'twitter:image'], img);
    setMeta('meta[name="twitter:title"]', ['name', 'twitter:title'], `${p.name} — The Big Boom Events`);
    // JSON-LD Product
    const ld = {
      '@context': 'https://schema.org', '@type': 'Product',
      name: p.name, description: desc, image: [img],
      category: p.categoryName || p.category,
      brand: { '@type': 'Brand', name: 'The Big Boom Events' },
    };
    if (p.priceCents) {
      ld.offers = {
        '@type': 'Offer', url, priceCurrency: 'RON',
        price: (p.priceCents / 100).toFixed(2),
        availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: 'The Big Boom Events' },
      };
    }
    let el = document.getElementById('product-jsonld');
    if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'product-jsonld'; document.head.appendChild(el); }
    el.textContent = JSON.stringify(ld);
  }

  function render(p, addons) {
    document.title = `${p.name} — The Big Boom Events`;
    setProductSeo(p);
    document.querySelector('[data-crumb]').innerHTML =
      `<a href="${urls.home}">Acasă</a> · <a href="${urls.shop}">Magazin</a> · <a href="${urls.shopCat(p.category)}">${esc(p.categoryName)}</a> · ${esc(p.name)}`;

    const old = p.oldPrice ? `<span class="old">${fmtLei(p.oldPrice)}</span>` : '';
    const fav = Favs.has(p.id);
    box.innerHTML = `
      <div class="product cat-${esc(p.category)}">
        ${gallery(p.images, p.name)}
        <div class="info">
          <span class="eyebrow">${esc(p.categoryName)}</span>
          <h1>${esc(p.name)}</h1>
          <div class="price">${!p.priceCents ? '<span class="price-req">Preț la cerere</span>' : old + fmtLei(p.price)}</div>
          ${!p.priceCents ? '' : (p.inStock ? `<p class="muted" style="color:var(--ok);font-weight:600">În stoc${p.stock <= 5 ? ` · doar ${p.stock} bucăți` : ''}</p>` : '<p class="muted" style="color:var(--danger);font-weight:600">Stoc epuizat</p>')}
          <p class="desc">${esc(p.description || '')}</p>
          ${attrs(p)}

          ${optionsHTML(addons, p.category)}

          <div class="buy-row">
            ${!p.priceCents ? `
            <a class="btn btn-primary" href="${urls.contact}">Cere ofertă</a>` : `
            <div class="qty-picker">
              <button data-qd="-1" aria-label="Scade">−</button>
              <span data-qty>1</span>
              <button data-qd="1" aria-label="Crește">+</button>
            </div>
            <button class="btn btn-primary" data-buy ${p.inStock ? '' : 'disabled'}>${p.inStock ? 'Adaugă în coș' : 'Indisponibil'}</button>`}
            <button class="fav" data-fav aria-pressed="${fav}" aria-label="Favorite" style="position:static;width:46px;height:46px;border:1px solid var(--line)">
              <svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
            </button>
          </div>
          <p class="note" style="text-align:left;margin-top:18px">🚚 Livrare gratuită peste 500 lei · plată card sau ramburs.</p>
          <p class="note" style="text-align:left;margin-top:6px">${
            p.returnable
              ? `↩️ <a href="${urls.retur}">${esc(p.returnNote || 'Retur în 14 zile.')}</a>`
              : `ℹ️ ${esc(p.returnNote || 'Exceptat de la dreptul de retragere.')} <a href="${urls.retur}">Detalii</a>`
          }</p>
        </div>
      </div>`;

    // galerie thumbs
    const mainImg = box.querySelector('[data-main-img]');
    box.querySelectorAll('[data-thumb]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (mainImg.tagName === 'IMG') mainImg.src = btn.dataset.thumb;
        box.querySelectorAll('[data-thumb]').forEach((b) => b.setAttribute('aria-current', String(b === btn)));
      });
    });

    // cantitate
    let qty = 1;
    const qtyEl = box.querySelector('[data-qty]');
    box.querySelectorAll('[data-qd]').forEach((b) =>
      // Plafon pe stocul real: clientul nu trebuie să afle abia la checkout.
      b.addEventListener('click', () => {
        const max = Math.max(1, Math.min(99, p.stock || 99));
        qty = Math.max(1, Math.min(max, qty + +b.dataset.qd));
        qtyEl.textContent = qty;
      })
    );

    // extra-opțiuni: toggle selecție
    const addonsById = new Map(addons.map((a) => [String(a.id), a]));
    const selected = new Set();
    const heliuNotice = box.querySelector('[data-heliu-notice]');
    const isHeliu = (id) => String(addonsById.get(id)?.slug || '').startsWith('addon-heliu');
    box.querySelectorAll('.addon').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.addonId;
        const on = !selected.has(id);
        if (on) selected.add(id); else selected.delete(id);
        btn.setAttribute('aria-pressed', String(on));
        btn.classList.toggle('sel', on);
        // Heliul se umflă la noi în atelier → livrare doar în Iași.
        // Notă persistentă cât timp heliul e selectat (nu dispare ca un toast).
        if (heliuNotice) {
          const heliuOn = [...selected].some(isHeliu);
          heliuNotice.hidden = !heliuOn;
        }
      });
    });

    const giftEl = box.querySelector('[data-gift]');
    const dateEl = box.querySelector('[data-deliv-date]');
    const slotEl = box.querySelector('[data-deliv-slot]');

    function saveMeta() {
      Cart.setMeta({
        giftMessage: giftEl ? giftEl.value.trim() : '',
        deliveryDate: dateEl ? dateEl.value : '',
        deliverySlot: slotEl ? slotEl.value : '',
      });
    }

    // adaugă în coș: produs + extra-opțiuni selectate + meta (felicitare/livrare)
    const buy = box.querySelector('[data-buy]');
    if (buy && p.inStock) {
      buy.addEventListener('click', () => {
        Cart.add(p, qty);
        selected.forEach((id) => {
          const a = addonsById.get(id);
          if (!a) return;
          // Heliul se plătește pe fiecare balon; felicitarea/bomboanele sunt
          // per comandă, deci rămân la 1 bucată indiferent de cantitate.
          const perUnit = String(a.slug || '').startsWith('addon-heliu');
          Cart.add(a, perUnit ? qty : 1, { silent: true });
        });
        saveMeta();
        if (selected.size) toast(`Adăugat în coș cu ${selected.size} extra 🎁`);
      });
    }

    // salvează meta și la modificarea câmpurilor (nu se pierde dacă merge direct la coș)
    [giftEl, dateEl, slotEl].forEach((el) => el && el.addEventListener('change', saveMeta));

    // favorite
    const favBtn = box.querySelector('[data-fav]');
    favBtn.addEventListener('click', () => favBtn.setAttribute('aria-pressed', String(Favs.toggle(p.id))));
  }

  async function loadRelated(p) {
    const rel = document.querySelector('[data-related]');
    rel.innerHTML = skeletons(3);
    try {
      const { items } = await API.get(`/products?category=${encodeURIComponent(p.category)}&pageSize=4`);
      const others = items.filter((x) => x.id !== p.id).slice(0, 3);
      rel.innerHTML = others.map(cardHTML).join('') || '<p class="muted">—</p>';
      bindCards(rel);
    } catch { rel.innerHTML = ''; }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (!slug) { box.innerHTML = '<div class="empty-state">Produs inexistent. <a href="/shop">Înapoi la shop</a></div>'; return; }
    box.innerHTML = '<div class="product">' + skeletons(1) + skeletons(1) + '</div>';
    try {
      // întâi produsul, apoi extra-opțiunile scoped pe categoria lui (heliul doar pe baloane)
      const prodRes = await API.get('/products/' + encodeURIComponent(slug));
      const cat = prodRes.product.category;
      const addonsRes = await API
        .get('/addons?category=' + encodeURIComponent(cat) + '&product=' + encodeURIComponent(slug))
        .catch(() => ({ addons: [] }));
      render(prodRes.product, addonsRes.addons || []);
      loadRelated(prodRes.product);
    } catch (e) {
      box.innerHTML = `<div class="empty-state">${e.status === 404 ? 'Produsul nu există.' : 'Eroare la încărcare.'} <a href="/shop">Înapoi la shop</a></div>`;
    }
  });
})();
