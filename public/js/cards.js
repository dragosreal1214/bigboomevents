/* ═══════════════════════════════════════════════════════════════════
   cards.js — renderer comun pentru carduri produs + quick view.
   Depinde de app.js (window.BBE). Extinde BBE cu:
   cardHTML, skeletons, bindCards, openQuickView
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const { esc, fmtLei, Cart, Favs, catClass } = window.BBE;

  const heartSVG = '<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';

  function thumb(p) {
    const img = (p.images && p.images[0]) || '';
    if (img) return `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" />`;
    return `<div style="font-family:Fraunces;font-size:42px;color:#3B2E3A88">🎈</div>`;
  }

  function priceHTML(p) {
    const old = p.oldPrice ? `<span class="old">${fmtLei(p.oldPrice)}</span>` : '';
    return `<span class="price">${old}${fmtLei(p.price)}</span>`;
  }

  function cardHTML(p) {
    const out = !p.inStock;
    const badge = p.badge ? `<span class="badge ${esc(p.badge)}">${esc(p.badge)}</span>` : '';
    const fav = Favs.has(p.id);
    return `
    <article class="card cat-${esc(p.category)} ${out ? 'out' : ''}" data-id="${p.id}" data-slug="${esc(p.slug)}">
      <div class="thumb">
        ${badge}
        <button class="fav" data-fav="${p.id}" aria-pressed="${fav}" aria-label="Adaugă la favorite">${heartSVG}</button>
        <a href="/produs?slug=${esc(p.slug)}" aria-label="${esc(p.name)}">${thumb(p)}</a>
        <button class="quickview-btn" data-quickview="${esc(p.slug)}">Vezi rapid</button>
      </div>
      <div class="body">
        <span class="tag">${esc(p.categoryName || p.category)}</span>
        <h3><a href="/produs?slug=${esc(p.slug)}" style="text-decoration:none">${esc(p.name)}</a></h3>
        <div class="row">
          ${priceHTML(p)}
          <button class="add" data-add="${p.id}" ${out ? 'disabled' : ''}>${out ? 'Indisponibil' : 'Adaugă'}</button>
        </div>
      </div>
    </article>`;
  }

  function skeletons(n) {
    return Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');
  }

  // Cache produse randate, ca să avem datele la add/quickview fără un nou fetch.
  const productCache = new Map();
  function cacheProducts(items) {
    items.forEach((p) => productCache.set(String(p.id), p));
  }

  function bindCards(container) {
    if (container.__bound) return;
    container.__bound = true;
    container.addEventListener('click', async (e) => {
      const add = e.target.closest('[data-add]');
      if (add && !add.disabled) {
        const p = productCache.get(add.dataset.add);
        if (p) {
          Cart.add(p, 1);
          add.textContent = 'Adăugat ✓';
          add.classList.add('added');
          setTimeout(() => { add.textContent = 'Adaugă'; add.classList.remove('added'); }, 1100);
        }
        return;
      }
      const fav = e.target.closest('[data-fav]');
      if (fav) {
        const on = Favs.toggle(+fav.dataset.fav);
        fav.setAttribute('aria-pressed', String(on));
        return;
      }
      const qv = e.target.closest('[data-quickview]');
      if (qv) {
        e.preventDefault();
        openQuickView(qv.dataset.quickview);
      }
    });
  }

  // ---------- QUICK VIEW MODAL ----------
  let modal;
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = '<div class="modal-box"><button class="x-abs" data-qv-close aria-label="Închide">×</button><div data-qv-body></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-qv-close]')) closeQuickView();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeQuickView(); });
    return modal;
  }
  function closeQuickView() { if (modal) modal.classList.remove('open'); }

  async function openQuickView(slug) {
    ensureModal();
    const body = modal.querySelector('[data-qv-body]');
    body.innerHTML = '<div class="qv"><div class="skeleton" style="height:300px"></div><div class="skeleton" style="height:300px"></div></div>';
    modal.classList.add('open');
    try {
      let p = [...productCache.values()].find((x) => x.slug === slug);
      if (!p) { const r = await window.BBE.API.get('/products/' + encodeURIComponent(slug)); p = r.product; productCache.set(String(p.id), p); }
      const img = (p.images && p.images[0]) || '';
      body.innerHTML = `
        <div class="qv">
          <div class="img cat-${esc(p.category)}" style="background:color-mix(in srgb, var(--rose) 30%, #fff)">
            ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" style="width:100%;height:100%;object-fit:cover">` : ''}
          </div>
          <div>
            <span class="tag">${esc(p.categoryName || p.category)}</span>
            <h2 style="font-size:26px;margin:6px 0 10px">${esc(p.name)}</h2>
            ${priceHTML(p)}
            <p class="muted" style="margin:14px 0">${esc(p.description || '')}</p>
            <div class="buy-row">
              <button class="btn btn-primary" data-qv-add="${p.id}" ${p.inStock ? '' : 'disabled'}>${p.inStock ? 'Adaugă în coș' : 'Indisponibil'}</button>
              <a class="btn btn-ghost" href="/produs?slug=${esc(p.slug)}">Detalii</a>
            </div>
          </div>
        </div>`;
      const addBtn = body.querySelector('[data-qv-add]');
      if (addBtn) addBtn.addEventListener('click', () => { Cart.add(p, 1); closeQuickView(); });
    } catch {
      body.innerHTML = '<div class="qv"><p class="empty-state">Nu am putut încărca produsul.</p></div>';
    }
  }

  // Patch BBE.cardHTML să cacheze automat când e folosit prin renderGrid helper.
  Object.assign(window.BBE, {
    cardHTML: (p) => { productCache.set(String(p.id), p); return cardHTML(p); },
    skeletons,
    bindCards,
    cacheProducts,
    openQuickView,
  });
})();
