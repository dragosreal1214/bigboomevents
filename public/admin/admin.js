/* ═══════════════════════════════════════════════════════════════════
   admin.js — logica backoffice (vanilla JS, fără framework).
   Login → token în localStorage → CRUD produse/categorii + upload poze.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const TOKEN_KEY = 'bbe_admin_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let categories = [];
  let products = [];
  let facets = { occasions: [], colors: [], badges: [], addonSlugs: [] };
  let facetsLoaded = false;
  let productPage = 1;
  const PRODUCT_PAGE_SIZE = 24;
  const selectedIds = new Set(); // produse bifate pentru ștergere în masă

  // Tipuri (product_type) pe categorie — pentru filtrul din lista de produse.
  const TYPES_BY_CAT = {
    florarie: [
      ['buchet', 'Flori în buchet'], ['cutie', 'Flori în cutie'], ['cos', 'Flori în coș'],
    ],
    baloane: [
      ['folie-cifra', 'Folie · Cifră'], ['folie-litera', 'Folie · Literă'],
      ['folie-figurina', 'Folie · Figurină'], ['folie-ocazii', 'Folie · Ocazii speciale'],
      ['baloane-latex', 'Baloane latex'],
      ['pachet-1-an', 'Set · Pachet 1 An'], ['pachet-18-ani', 'Set · Pachet 18 Ani'],
      ['pachet-30-ani', 'Set · Pachet 30 Ani'], ['pachet-50-ani', 'Set · Pachet 50 Ani'],
      ['pachet-80-ani', 'Set · Pachet 80 Ani'], ['baby-shower', 'Set · Baby Shower'],
      ['pachet-bride', 'Set · Pachet Bride'], ['pachet-5-ani', 'Set · Pachet 5 Ani'],
      ['pachet-25-ani', 'Set · Pachet 25 Ani'], ['set-baloane', 'Set · Altele'],
      ['lumanari-tort', 'Lumânări tort'],
    ],
  };

  // Încarcă categoriile + valorile disponibile (ocazii/culori) înainte de editor.
  async function ensureProductMeta() {
    if (!categories.length) await fetchCategories().catch(() => {});
    if (!facetsLoaded) {
      try {
        facets = await api('/admin/facets');
        facetsLoaded = true;
      } catch {
        /* dacă pică, mergem fără sugestii */
      }
    }
  }

  // ---------- utils ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  const fmtLei = (lei) => new Intl.NumberFormat('ro-RO').format(lei) + ' lei';
  const fmtDate = (iso, dateOnly) => {
    if (!iso) return '';
    const d = new Date(iso);
    return dateOnly
      ? d.toLocaleDateString('ro-RO')
      : d.toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
  };

  // Statusuri comenzi / cereri: etichetă RO + clasă de culoare.
  const ORDER_STATUS = {
    pending: { label: 'În așteptare', cls: 'st-pending' },
    paid: { label: 'Plătită', cls: 'st-paid' },
    processing: { label: 'În pregătire', cls: 'st-processing' },
    shipped: { label: 'Expediată', cls: 'st-shipped' },
    delivered: { label: 'Livrată', cls: 'st-delivered' },
    cancelled: { label: 'Anulată', cls: 'st-cancelled' },
    refunded: { label: 'Rambursată', cls: 'st-refunded' },
  };
  const LEAD_STATUS = {
    new: { label: 'Nouă', cls: 'st-pending' },
    contacted: { label: 'Contactat', cls: 'st-shipped' },
    quoted: { label: 'Ofertat', cls: 'st-processing' },
    won: { label: 'Câștigat', cls: 'st-delivered' },
    lost: { label: 'Pierdut', cls: 'st-cancelled' },
  };
  const statusOptions = (map, current) =>
    Object.entries(map)
      .map(([v, m]) => `<option value="${v}" ${v === current ? 'selected' : ''}>${m.label}</option>`)
      .join('');

  let toastTimer;
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'admin-toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2800);
  }

  // ---------- API ----------
  async function api(path, opts = {}) {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    let body = opts.body;
    if (body !== undefined && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const r = await fetch('/api' + path, { method: opts.method || 'GET', headers, body });
    if (r.status === 401 && path !== '/admin/login') {
      // 401 pe login înseamnă „parolă greșită", nu sesiune expirată — altfel
      // utilizatorul primea un mesaj derutant chiar la prima încercare.
      logout();
      throw new Error('Sesiune expirată. Conectează-te din nou.');
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = data.details?.map((d) => d.message).join(', ');
      throw new Error(detail || data.error || 'Eroare necunoscută');
    }
    return data;
  }

  // ---------- AUTH ----------
  function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#login-password').focus();
  }
  function showApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    switchTab('dashboard');
  }
  function logout() {
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-submit');
    const errEl = $('#login-error');
    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Se conectează…';
    try {
      const { token: tk } = await api('/admin/login', {
        method: 'POST',
        body: { password: $('#login-password').value },
      });
      token = tk;
      localStorage.setItem(TOKEN_KEY, tk);
      $('#login-password').value = '';
      showApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Intră în panou';
    }
  });

  $('#logout').addEventListener('click', logout);

  // ---------- TABS ----------
  function switchTab(name) {
    $$('.tab').forEach((t) => t.setAttribute('aria-current', String(t.dataset.tab === name)));
    $$('.view').forEach((v) => (v.hidden = v.dataset.view !== name));
    if (name === 'dashboard') loadDashboard();
    if (name === 'products') loadProducts();
    if (name === 'categories') loadCategories();
    if (name === 'orders') loadOrders();
    if (name === 'leads') loadLeads();
    if (name === 'pages') loadPages();
    if (name === 'banner') loadBanner();
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.go)));
  $$('[data-new-product]').forEach((b) =>
    b.addEventListener('click', async () => {
      await ensureProductMeta();
      openProductEditor(null);
    })
  );

  // ---------- DASHBOARD ----------
  async function loadDashboard() {
    const grid = $('#stat-grid');
    grid.innerHTML = '<div class="spinner">Se încarcă…</div>';
    try {
      const { stats } = await api('/admin/stats');
      const cards = [
        { n: stats.products, l: 'Produse', },
        { n: stats.products_active, l: 'Active' },
        { n: stats.out_of_stock, l: 'Fără stoc', warn: stats.out_of_stock > 0 },
        { n: stats.categories, l: 'Categorii' },
        { n: stats.orders, l: 'Comenzi' },
        { n: stats.new_leads, l: 'Cereri noi' },
      ];
      grid.innerHTML = cards
        .map(
          (c) =>
            `<div class="stat ${c.warn ? 'warn' : ''}"><div class="n">${c.n}</div><div class="l">${c.l}</div></div>`
        )
        .join('');
    } catch (err) {
      grid.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    }
  }

  // ---------- CATEGORIES (shared) ----------
  async function fetchCategories() {
    const { categories: cats } = await api('/admin/categories');
    categories = cats;
    // populează filtrul din pagina produse
    const filter = $('#product-cat-filter');
    if (filter) {
      const cur = filter.value;
      filter.innerHTML =
        '<option value="">Toate categoriile</option>' +
        categories.map((c) => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join('');
      filter.value = cur;
    }
    return categories;
  }

  async function loadCategories() {
    const wrap = $('#categories-list');
    wrap.innerHTML = '<div class="spinner">Se încarcă…</div>';
    try {
      await fetchCategories();
      if (!categories.length) {
        wrap.innerHTML = '<table class="admin-table"><tr class="muted-row"><td>Nicio categorie. Adaugă una.</td></tr></table>';
        return;
      }
      wrap.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Nume</th><th>Slug</th><th>Produse</th><th>Ordine</th><th></th></tr></thead>
          <tbody>
            ${categories
              .map(
                (c) => `
              <tr data-id="${c.id}">
                <td class="cell-name">${esc(c.name)}<small>${esc(c.description || '')}</small></td>
                <td><code>${esc(c.slug)}</code></td>
                <td>${c.productCount}</td>
                <td>${c.sortOrder}</td>
                <td><div class="row-actions">
                  <button class="icon-btn" data-edit-cat="${c.id}">Editează</button>
                  <button class="icon-btn danger" data-del-cat="${c.id}">Șterge</button>
                </div></td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`;
      $$('[data-edit-cat]', wrap).forEach((b) =>
        b.addEventListener('click', () => openCategoryEditor(categories.find((c) => c.id == b.dataset.editCat)))
      );
      $$('[data-del-cat]', wrap).forEach((b) =>
        b.addEventListener('click', () => deleteCategory(categories.find((c) => c.id == b.dataset.delCat)))
      );
    } catch (err) {
      wrap.innerHTML = `<p class="muted" style="padding:20px">${esc(err.message)}</p>`;
    }
  }

  $('#new-category').addEventListener('click', () => openCategoryEditor(null));

  function openCategoryEditor(cat) {
    const isEdit = !!cat;
    openDrawer(isEdit ? 'Editează categorie' : 'Categorie nouă', `
      <form id="cat-form">
        <div class="field">
          <label>Nume *</label>
          <input class="input" name="name" value="${esc(cat?.name || '')}" required />
        </div>
        <div class="field">
          <label>Descriere</label>
          <textarea class="textarea" name="description">${esc(cat?.description || '')}</textarea>
        </div>
        <div class="grid-2">
          <div class="field">
            <label>Slug (URL)</label>
            <input class="input" name="slug" value="${esc(cat?.slug || '')}" placeholder="auto din nume" />
            <div class="hint">Lasă gol → se generează din nume.</div>
          </div>
          <div class="field">
            <label>Ordine afișare</label>
            <input class="input" type="number" name="sortOrder" value="${cat?.sortOrder ?? 0}" min="0" />
          </div>
        </div>
        <div class="drawer-actions">
          <button type="button" class="btn btn-ghost" data-drawer-close>Anulează</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Salvează' : 'Adaugă'}</button>
        </div>
      </form>
    `);
    bindDrawerClose();
    $('#cat-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        name: fd.get('name'),
        description: fd.get('description'),
        slug: fd.get('slug'),
        sortOrder: Number(fd.get('sortOrder')) || 0,
      };
      try {
        if (isEdit) await api('/admin/categories/' + cat.id, { method: 'PUT', body });
        else await api('/admin/categories', { method: 'POST', body });
        closeDrawer();
        toast(isEdit ? 'Categorie actualizată ✓' : 'Categorie adăugată ✓');
        loadCategories();
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  async function deleteCategory(cat) {
    if (!confirm(`Ștergi categoria „${cat.name}"?`)) return;
    try {
      await api('/admin/categories/' + cat.id, { method: 'DELETE' });
      toast('Categorie ștearsă ✓');
      loadCategories();
    } catch (err) {
      toast(err.message, true);
    }
  }

  // ---------- PRODUCTS ----------
  let searchTimer;
  $('#product-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { productPage = 1; clearSelection(); loadProducts(); }, 250);
  });
  $('#product-cat-filter').addEventListener('change', () => {
    productPage = 1; clearSelection(); populateTypeFilter(); loadProducts();
  });
  $('#product-type-filter')?.addEventListener('change', () => { productPage = 1; clearSelection(); loadProducts(); });
  $('#product-status-filter')?.addEventListener('change', () => { productPage = 1; clearSelection(); loadProducts(); });
  $('#bulk-delete')?.addEventListener('click', bulkDeleteSelected);
  $('#bulk-clear')?.addEventListener('click', clearSelection);

  async function loadProducts(opts = {}) {
    const wrap = $('#products-list');
    if (!categories.length) await fetchCategories().catch(() => {});
    // „silent" = nu arăta spinner-ul (evită flash-ul după salvare); altfel spinner.
    if (!opts.silent) wrap.innerHTML = '<div class="spinner">Se încarcă…</div>';
    const q = $('#product-search').value.trim();
    const cat = $('#product-cat-filter').value;
    const type = $('#product-type-filter')?.value || '';
    const status = $('#product-status-filter')?.value || '';
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (cat) params.set('category', cat);
      if (type) params.set('type', type);
      if (status) params.set('active', status);
      params.set('page', String(productPage));
      params.set('pageSize', String(PRODUCT_PAGE_SIZE));
      const data = await api('/admin/products?' + params.toString());
      products = data.items;
      renderProductCount(data.total);
      if (!products.length) {
        wrap.innerHTML = '<table class="admin-table"><tr class="muted-row"><td>Niciun produs găsit.</td></tr></table>';
        renderPager(data);
        return;
      }
      wrap.innerHTML = `
        <table class="admin-table">
          <thead><tr><th class="col-check"><input type="checkbox" data-select-all aria-label="Selectează tot"></th><th></th><th>Produs</th><th>Categorie</th><th>Preț</th><th>Stoc</th><th>Activ</th><th></th></tr></thead>
          <tbody>${products.map(productRow).join('')}</tbody>
        </table>`;
      bindProductRows(wrap);
      bindSelection(wrap);
      renderPager(data);
    } catch (err) {
      wrap.innerHTML = `<p class="muted" style="padding:20px">${esc(err.message)}</p>`;
    }
  }

  function renderProductCount(total) {
    const el = $('#product-count');
    if (el) el.textContent = total === 1 ? '1 produs' : `${total} produse`;
  }

  function renderPager(data) {
    const el = $('#products-pager');
    if (!el) return;
    const { page, totalPages } = data;
    if (!totalPages || totalPages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <button class="btn btn-ghost btn-sm" data-page-prev ${page <= 1 ? 'disabled' : ''}>← Înapoi</button>
      <span class="pager-info">Pagina ${page} / ${totalPages}</span>
      <button class="btn btn-ghost btn-sm" data-page-next ${page >= totalPages ? 'disabled' : ''}>Înainte →</button>`;
    const prev = el.querySelector('[data-page-prev]');
    const next = el.querySelector('[data-page-next]');
    // clearSelection și la paginare: altfel bara arăta „1 selectat" pentru un
    // produs invizibil de pe pagina anterioară, iar Șterge l-ar fi șters orbește.
    if (prev) prev.addEventListener('click', () => { if (productPage > 1) { productPage--; clearSelection(); loadProducts(); scrollProductsTop(); } });
    if (next) next.addEventListener('click', () => { if (productPage < totalPages) { productPage++; clearSelection(); loadProducts(); scrollProductsTop(); } });
  }

  function scrollProductsTop() {
    $('#products-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Populează filtrul de tip în funcție de categoria selectată (ascuns dacă nu are tipuri).
  function populateTypeFilter() {
    const sel = $('#product-type-filter');
    if (!sel) return;
    const cat = $('#product-cat-filter').value;
    const types = TYPES_BY_CAT[cat] || [];
    if (!types.length) { sel.hidden = true; sel.value = ''; return; }
    sel.hidden = false;
    sel.innerHTML = '<option value="">Toate tipurile</option>' +
      types.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  }

  function productRow(p) {
    const img = p.images?.[0];
    const thumb = img
      ? `<img src="${esc(img)}" alt="" />`
      : '🎈';
    const price = `${p.oldPrice ? `<span class="price-old">${fmtLei(p.oldPrice)}</span>` : ''}<span class="price-now">${fmtLei(p.price)}</span>`;
    const badge = p.badge ? `<span class="badge-mini">${esc(p.badge)}</span>` : '';
    return `
      <tr data-id="${p.id}">
        <td class="col-check"><input type="checkbox" data-select="${p.id}" ${selectedIds.has(p.id) ? 'checked' : ''} aria-label="Selectează"></td>
        <td><div class="row-thumb">${thumb}</div></td>
        <td class="cell-name">${esc(p.name)} ${badge}<small>${esc(p.slug)}${p.isActive ? '' : ' · <span class="inactive-tag">ascuns</span>'}</small></td>
        <td><span class="tag-mini">${esc(p.categoryName)}</span></td>
        <td>${price}</td>
        <td>${p.stock > 0 ? p.stock : '<span class="inactive-tag">0</span>'}</td>
        <td><label class="switch"><input type="checkbox" data-toggle="${p.id}" ${p.isActive ? 'checked' : ''}><span class="slider"></span></label></td>
        <td><div class="row-actions">
          <button class="icon-btn" data-edit="${p.id}">Editează</button>
          <button class="icon-btn danger" data-del="${p.id}">Șterge</button>
        </div></td>
      </tr>`;
  }

  function bindProductRows(wrap) {
    $$('tr[data-id]', wrap).forEach(bindOneRow);
  }

  // ---------- SELECȚIE MULTIPLĂ / ȘTERGERE ÎN MASĂ ----------
  function bindSelection(wrap) {
    $$('[data-select]', wrap).forEach((cb) =>
      cb.addEventListener('change', () => {
        const id = Number(cb.dataset.select);
        if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
        updateBulkBar();
      })
    );
    const all = wrap.querySelector('[data-select-all]');
    if (all) all.addEventListener('change', () => {
      $$('[data-select]', wrap).forEach((cb) => {
        cb.checked = all.checked;
        const id = Number(cb.dataset.select);
        if (all.checked) selectedIds.add(id); else selectedIds.delete(id);
      });
      updateBulkBar();
    });
    updateBulkBar();
  }

  function updateBulkBar() {
    const bar = $('#bulk-bar');
    const count = $('#bulk-count');
    if (count) count.textContent = selectedIds.size === 1 ? '1 selectat' : `${selectedIds.size} selectate`;
    if (bar) bar.hidden = selectedIds.size === 0;
    // sincronizează „selectează tot" pe pagina curentă
    const all = document.querySelector('#products-list [data-select-all]');
    if (all) {
      const boxes = $$('#products-list [data-select]');
      const checked = boxes.filter((b) => b.checked).length;
      all.checked = boxes.length > 0 && checked === boxes.length;
      all.indeterminate = checked > 0 && checked < boxes.length;
    }
  }

  function clearSelection() {
    selectedIds.clear();
    $$('#products-list [data-select]').forEach((b) => (b.checked = false));
    updateBulkBar();
  }

  async function bulkDeleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!confirm(`Ștergi ${ids.length} ${ids.length === 1 ? 'produs' : 'produse'}? Cele cu comenzi vor fi ascunse în loc de șterse.`)) return;
    const btn = $('#bulk-delete');
    if (btn) btn.disabled = true;
    try {
      const res = await api('/admin/products/bulk-delete', { method: 'POST', body: { ids } });
      const del = res.deletedIds || [];
      const deact = res.deactivatedIds || [];
      // scoate din DOM rândurile șterse
      del.forEach((id) => {
        document.querySelector(`#products-list tr[data-id="${id}"]`)?.remove();
        const i = products.findIndex((p) => p.id === id);
        if (i !== -1) products.splice(i, 1);
      });
      // marchează ca ascunse rândurile dezactivate (au comenzi)
      deact.forEach((id) => {
        const p = products.find((x) => x.id === id);
        if (p) { p.isActive = false; const tr = document.querySelector(`#products-list tr[data-id="${id}"]`); if (tr) { tr.outerHTML = productRow(p); const nt = document.querySelector(`#products-list tr[data-id="${id}"]`); if (nt) bindOneRow(nt); } }
      });
      clearSelection();
      let msg = del.length ? `${del.length} șterse` : '';
      if (deact.length) msg += (msg ? ', ' : '') + `${deact.length} ascunse (au comenzi)`;
      toast(msg || 'Gata');
      // reîncarcă discret dacă pagina a rămas goală
      if (!$$('#products-list tr[data-id]').length) loadProducts({ silent: true });
    } catch (err) {
      toast(err.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bindOneRow(tr) {
    const edit = tr.querySelector('[data-edit]');
    if (edit) edit.addEventListener('click', async () => {
      await ensureProductMeta();
      openProductEditor(products.find((p) => p.id == edit.dataset.edit));
    });
    const del = tr.querySelector('[data-del]');
    if (del) del.addEventListener('click', () => deleteProduct(products.find((p) => p.id == del.dataset.del)));
    const tog = tr.querySelector('[data-toggle]');
    if (tog) tog.addEventListener('change', async () => {
      try {
        await api('/admin/products/' + tog.dataset.toggle + '/active', {
          method: 'PATCH',
          body: { isActive: tog.checked },
        });
        toast(tog.checked ? 'Produs activat ✓' : 'Produs ascuns ✓');
      } catch (err) {
        tog.checked = !tog.checked;
        toast(err.message, true);
      }
    });
  }

  // Actualizează tabelul după salvare, fără reîncărcare (fără flash/scroll jump).
  function applyProductRow(saved, isEdit) {
    if (isEdit) {
      const idx = products.findIndex((p) => p.id === saved.id);
      if (idx !== -1) products[idx] = saved;
      const oldTr = document.querySelector(`#products-list tr[data-id="${saved.id}"]`);
      if (oldTr) {
        oldTr.outerHTML = productRow(saved);
        const newTr = document.querySelector(`#products-list tr[data-id="${saved.id}"]`);
        if (newTr) { bindOneRow(newTr); flashRow(newTr); }
        return;
      }
    } else {
      products.unshift(saved);
      const tbody = document.querySelector('#products-list tbody');
      if (tbody) {
        tbody.insertAdjacentHTML('afterbegin', productRow(saved));
        const newTr = tbody.querySelector(`tr[data-id="${saved.id}"]`);
        if (newTr) { bindOneRow(newTr); flashRow(newTr); }
        return;
      }
    }
    // fallback dacă rândul/tabelul nu există (ex. lista goală) — reîncarcă discret
    loadProducts({ silent: true });
  }

  function flashRow(tr) {
    tr.classList.add('row-saved');
    setTimeout(() => tr.classList.remove('row-saved'), 1400);
  }

  async function deleteProduct(p) {
    if (!confirm(`Ștergi produsul „${p.name}"?`)) return;
    try {
      const res = await api('/admin/products/' + p.id, { method: 'DELETE' });
      toast(res.deactivated ? 'Produsul are comenzi — a fost ascuns în loc de șters.' : 'Produs șters ✓');
      loadProducts();
    } catch (err) {
      toast(err.message, true);
    }
  }

  // ---------- PRODUCT EDITOR ----------
  function openProductEditor(p) {
    const isEdit = !!p;
    let images = p?.images ? [...p.images] : [];
    const catOptions = categories
      .map((c) => `<option value="${c.id}" ${p && p.categoryId == c.id ? 'selected' : ''}>${esc(c.name)}</option>`)
      .join('');

    openDrawer(isEdit ? 'Editează produs' : 'Produs nou', `
      <form id="prod-form">
        <div class="field">
          <label>Nume *</label>
          <input class="input" name="name" value="${esc(p?.name || '')}" required />
        </div>
        <div class="field">
          <label>Categorie *</label>
          <select class="select" name="categoryId" required>
            <option value="">— alege —</option>${catOptions}
          </select>
        </div>
        <div class="field" id="type-field" hidden>
          <label>Tip produs</label>
          <select class="select" name="productType" id="f-type"></select>
        </div>
        <div class="field">
          <label>Descriere</label>
          <textarea class="textarea" name="description">${esc(p?.description || '')}</textarea>
        </div>

        <div class="discount-row">
          <div class="field">
            <label>Preț (lei) *</label>
            <input class="input" type="number" step="0.01" min="0" name="price" id="f-price" value="${p?.price ?? ''}" required />
          </div>
          <div class="field">
            <label>Preț vechi (lei)</label>
            <input class="input" type="number" step="0.01" min="0" name="oldPrice" id="f-oldprice" value="${p?.oldPrice ?? ''}" />
          </div>
        </div>
        <div class="discount-helper">
          <span class="muted">Reducere rapidă:</span>
          <input class="input" type="number" id="disc-pct" min="0" max="99" placeholder="%" />
          <button type="button" class="btn btn-ghost btn-sm" id="apply-disc">Aplică −%</button>
          <button type="button" class="btn btn-ghost btn-sm" id="clear-disc">Fără reducere</button>
        </div>

        <div class="grid-2">
          <div class="field">
            <label>Stoc</label>
            <input class="input" type="number" min="0" name="stock" value="${p?.stock ?? 0}" />
          </div>
          <div class="field">
            <label>Etichetă (badge)</label>
            <select class="select" name="badge">
              ${['', 'nou', 'reducere', 'popular'].map((b) => `<option value="${b}" ${p?.badge === b ? 'selected' : ''}>${b || '— niciuna —'}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="field">
          <label>Ocazii</label>
          <div class="taginput" data-tags="occasions"></div>
          <div class="hint">Caută printre cele existente sau scrie una nouă și apasă Enter.</div>
        </div>
        <div class="field">
          <label>Culori</label>
          <div class="taginput" data-tags="colors"></div>
          <div class="hint">Caută printre cele existente sau scrie una nouă și apasă Enter.</div>
        </div>

        <div class="field">
          <label>Poze</label>
          <div class="img-grid" id="img-grid"></div>
          <div class="uploader">
            <input type="file" id="file-input" accept="image/*" multiple hidden />
            <button type="button" class="btn btn-dark btn-sm" id="upload-btn">📷 Încarcă poze</button>
            <button type="button" class="btn btn-ghost btn-sm" id="url-btn">+ Adaugă din URL</button>
            <span class="muted" id="upload-status"></span>
          </div>
        </div>

        <div class="field">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" name="isActive" ${!p || p.isActive ? 'checked' : ''} style="width:18px;height:18px" />
            Vizibil în magazin
          </label>
        </div>

        <div class="field">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" name="isAddon" id="f-isaddon" ${p?.isAddon ? 'checked' : ''} style="width:18px;height:18px" />
            Este extra-opțiune (nu apare în magazin)
          </label>
          <div class="hint">Ex.: felicitare, umflare cu heliu, cutie bomboane. Apare doar pe pagina altui produs.</div>
        </div>
        <div class="field" id="addon-scope-field" ${p?.isAddon ? '' : 'hidden'}>
          <label>Apare automat la categoriile</label>
          <div class="taginput" data-tags="addonScope"></div>
          <div class="hint">Slug-uri de categorie (ex. <code>baloane</code>). Gol = apare doar unde e pusă explicit pe produs.</div>
        </div>
        <div class="field" id="addon-slugs-field" ${p?.isAddon ? 'hidden' : ''}>
          <label>Extra-opțiuni pentru acest produs</label>
          <div class="taginput" data-tags="addonSlugs"></div>
          <div class="hint">Slug-uri de extra-opțiuni afișate DOAR la acest produs (ex. <code>addon-heliu-forma</code>, <code>baby-girl</code>).</div>
        </div>
        <div class="field" id="addon-excl-field" ${p?.isAddon ? 'hidden' : ''}>
          <label>Extra-opțiuni excluse</label>
          <div class="taginput" data-tags="addonExcludeSlugs"></div>
          <div class="hint">Extra-opțiuni de categorie care NU se aplică acestui produs.</div>
        </div>

        <div class="field">
          <label>Slug (URL)</label>
          <input class="input" name="slug" value="${esc(p?.slug || '')}" placeholder="auto din nume" />
          <div class="hint">Lasă gol la creare → se generează automat.</div>
        </div>

        <div class="drawer-actions">
          <button type="button" class="btn btn-ghost" data-drawer-close>Anulează</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Salvează' : 'Adaugă produs'}</button>
        </div>
      </form>
    `);
    bindDrawerClose();

    // tag inputs cu autocomplete din valorile existente
    // Sugestii ocazii: valorile din catalog + „categoriile" florăriei (ca să folosești slug-ul corect).
    const CANON_OCCASIONS = ['aniversare', 'cerere', 'nunta', 'botez', 'majorat', 'mama', 'ghiveci', 'funerare'];
    const occSuggestions = [...new Set([...(facets.occasions || []), ...CANON_OCCASIONS])];
    const occ = makeTagInput($('[data-tags="occasions"]'), p?.occasions || [], occSuggestions);
    const col = makeTagInput($('[data-tags="colors"]'), p?.colors || [], facets.colors);
    // Extra-opțiuni: sugestii = slug-urile add-on-urilor existente.
    const addonSuggestions = (facets.addonSlugs || []);
    const aScope = makeTagInput($('[data-tags="addonScope"]'), p?.addonScope || [], categories.map((c) => c.slug));
    const aSlugs = makeTagInput($('[data-tags="addonSlugs"]'), p?.addonSlugs || [], addonSuggestions);
    const aExcl = makeTagInput($('[data-tags="addonExcludeSlugs"]'), p?.addonExcludeSlugs || [], addonSuggestions);
    // Un add-on își are propriul scope; un produs normal are liste de extra-opțiuni.
    const isAddonBox = $('#f-isaddon');
    function refreshAddonFields() {
      const on = isAddonBox.checked;
      $('#addon-scope-field').hidden = !on;
      $('#addon-slugs-field').hidden = on;
      $('#addon-excl-field').hidden = on;
    }
    isAddonBox.addEventListener('change', refreshAddonFields);
    refreshAddonFields();

    // „Tip produs" — opțiuni în funcție de categorie; ascuns dacă nu are tipuri.
    const catSel = $('[name="categoryId"]');
    const typeField = $('#type-field');
    const typeSel = $('#f-type');
    function refreshTypeOptions(selected) {
      const cat = categories.find((c) => String(c.id) === String(catSel.value));
      const types = (cat && TYPES_BY_CAT[cat.slug]) || [];
      if (!types.length) { typeField.hidden = true; typeSel.innerHTML = ''; return; }
      typeField.hidden = false;
      typeSel.innerHTML = '<option value="">— alege —</option>' +
        types.map(([v, l]) => `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
    }
    refreshTypeOptions(p?.type || '');
    catSel.addEventListener('change', () => refreshTypeOptions(''));

    // images
    function renderImages() {
      const grid = $('#img-grid');
      if (!images.length) {
        grid.innerHTML = '<p class="muted" style="grid-column:1/-1;font-size:13px;margin:0">Nicio poză încă.</p>';
        return;
      }
      grid.innerHTML = images
        .map(
          (src, idx) => `
        <div class="img-cell ${idx === 0 ? 'is-main' : ''}" data-idx="${idx}">
          ${idx === 0 ? '<span class="main-flag">principală</span>' : ''}
          <img src="${esc(src)}" alt="" />
          <button type="button" class="img-x" data-rm="${idx}" title="Șterge">×</button>
          <button type="button" class="set-main" data-main="${idx}">Fă principală</button>
        </div>`
        )
        .join('');
      $$('[data-rm]', grid).forEach((b) =>
        b.addEventListener('click', () => {
          images.splice(Number(b.dataset.rm), 1);
          renderImages();
        })
      );
      $$('[data-main]', grid).forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.main);
          const [m] = images.splice(i, 1);
          images.unshift(m);
          renderImages();
        })
      );
    }
    renderImages();

    $('#upload-btn').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      const status = $('#upload-status');
      status.textContent = 'Se încarcă…';
      try {
        const fd = new FormData();
        files.forEach((f) => fd.append('images', f));
        const { urls } = await api('/admin/uploads', { method: 'POST', body: fd });
        images.push(...urls);
        renderImages();
        status.textContent = `${urls.length} poză(e) adăugate ✓`;
      } catch (err) {
        status.textContent = '';
        toast(err.message, true);
      } finally {
        e.target.value = '';
      }
    });
    $('#url-btn').addEventListener('click', () => {
      const url = prompt('Lipește URL-ul imaginii:');
      if (url && url.trim()) {
        images.push(url.trim());
        renderImages();
      }
    });

    // discount helpers
    $('#apply-disc').addEventListener('click', () => {
      const price = parseFloat($('#f-price').value);
      const pct = parseFloat($('#disc-pct').value);
      if (!price || !pct || pct <= 0 || pct >= 100) {
        toast('Completează prețul și un procent valid (1–99).', true);
        return;
      }
      $('#f-oldprice').value = price.toFixed(2);
      $('#f-price').value = (price * (1 - pct / 100)).toFixed(2);
      $('[name="badge"]').value = 'reducere';
      toast(`Reducere −${pct}% aplicată.`);
    });
    $('#clear-disc').addEventListener('click', () => {
      $('#f-oldprice').value = '';
      if ($('[name="badge"]').value === 'reducere') $('[name="badge"]').value = '';
    });

    // submit
    $('#prod-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        name: fd.get('name'),
        slug: fd.get('slug'),
        description: fd.get('description'),
        categoryId: Number(fd.get('categoryId')),
        productType: fd.get('productType') || '',
        price: Number(fd.get('price')),
        oldPrice: fd.get('oldPrice') === '' ? null : Number(fd.get('oldPrice')),
        stock: Number(fd.get('stock')) || 0,
        badge: fd.get('badge') || '',
        occasions: occ.get(),
        colors: col.get(),
        images,
        isActive: fd.get('isActive') === 'on',
        isAddon: fd.get('isAddon') === 'on',
        addonScope: aScope.get(),
        addonSlugs: aSlugs.get(),
        addonExcludeSlugs: aExcl.get(),
      };
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const res = isEdit
          ? await api('/admin/products/' + p.id, { method: 'PUT', body })
          : await api('/admin/products', { method: 'POST', body });
        closeDrawer();
        toast(isEdit ? 'Produs salvat ✓' : 'Produs adăugat ✓');
        // Async, fără flash: actualizează doar rândul editat / adaugă rândul nou în tabel.
        if (res && res.product) applyProductRow(res.product, isEdit);
        else loadProducts({ silent: true });
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
      }
    });
  }

  // tag input cu autocomplete → { get() }
  // `suggestions` = valori existente din catalog; se filtrează pe măsură ce scrii,
  // poți alege din listă (mouse/tastatură) sau adăuga una nouă.
  function makeTagInput(container, initial, suggestions = []) {
    let tags = initial.map((t) => String(t).toLowerCase());
    const sugg = [...new Set(suggestions.map((s) => String(s).toLowerCase()))];
    let opts = [];
    let active = -1;

    const input = document.createElement('input');
    input.placeholder = 'caută sau adaugă…';
    input.setAttribute('autocomplete', 'off');
    const dropdown = document.createElement('div');
    dropdown.className = 'tag-suggest';
    dropdown.hidden = true;

    function renderChips() {
      container.querySelectorAll('.chip-tag').forEach((c) => c.remove());
      tags.forEach((t, i) => {
        const chip = document.createElement('span');
        chip.className = 'chip-tag';
        chip.innerHTML = `${esc(t)} <button type="button" aria-label="Șterge">×</button>`;
        chip.querySelector('button').addEventListener('click', () => {
          tags.splice(i, 1);
          renderChips();
        });
        container.insertBefore(chip, input);
      });
    }
    function add(val) {
      val = val.trim().toLowerCase();
      if (val && !tags.includes(val)) tags.push(val);
    }
    function computeOpts() {
      const q = input.value.trim().toLowerCase();
      const list = sugg.filter((s) => !tags.includes(s) && (!q || s.includes(q)));
      opts = list.map((v) => ({ value: v, isNew: false }));
      if (q && !sugg.includes(q) && !tags.includes(q)) opts.push({ value: q, isNew: true });
    }
    function renderDropdown() {
      computeOpts();
      if (!opts.length) {
        dropdown.hidden = true;
        active = -1;
        return;
      }
      if (active >= opts.length) active = opts.length - 1;
      dropdown.innerHTML = opts
        .map(
          (o, i) =>
            `<button type="button" data-i="${i}" class="${i === active ? 'active' : ''} ${o.isNew ? 'new-tag' : ''}">${o.isNew ? '+ adaugă „' + esc(o.value) + '"' : esc(o.value)}</button>`
        )
        .join('');
      dropdown.hidden = false;
      // mousedown (nu click) ca selecția să se facă înainte de blur-ul input-ului
      dropdown.querySelectorAll('[data-i]').forEach((b) =>
        b.addEventListener('mousedown', (e) => {
          e.preventDefault();
          choose(Number(b.dataset.i));
        })
      );
    }
    function choose(i) {
      const o = opts[i];
      if (!o) return;
      add(o.value);
      input.value = '';
      active = -1;
      renderChips();
      renderDropdown();
      input.focus();
    }

    input.addEventListener('input', () => {
      active = -1;
      renderDropdown();
    });
    input.addEventListener('focus', renderDropdown);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (dropdown.hidden) renderDropdown();
        active = Math.min(active + 1, opts.length - 1);
        renderDropdown();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        active = Math.max(active - 1, 0);
        renderDropdown();
      } else if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        if (active >= 0 && opts[active]) choose(active);
        else if (input.value.trim()) {
          add(input.value);
          input.value = '';
          renderChips();
          renderDropdown();
        }
      } else if (e.key === 'Backspace' && !input.value && tags.length) {
        tags.pop();
        renderChips();
      } else if (e.key === 'Escape') {
        dropdown.hidden = true;
        active = -1;
      }
    });
    input.addEventListener('blur', () => {
      // închide dropdown-ul; nu adăugăm automat (alegerea se face cu Enter/click)
      setTimeout(() => {
        dropdown.hidden = true;
        active = -1;
      }, 120);
    });

    container.appendChild(input);
    container.appendChild(dropdown);
    renderChips();
    return { get: () => tags };
  }

  // ---------- ORDERS ----------
  let orders = [];
  let orderFiltersInit = false;
  let orderSearchTimer;

  function initOrderFilters() {
    if (orderFiltersInit) return;
    orderFiltersInit = true;
    $('#order-status-filter').innerHTML =
      '<option value="">Toate statusurile</option>' + statusOptions(ORDER_STATUS, null);
    $('#order-status-filter').addEventListener('change', loadOrders);
    $('#order-search').addEventListener('input', () => {
      clearTimeout(orderSearchTimer);
      orderSearchTimer = setTimeout(loadOrders, 250);
    });
  }

  async function loadOrders() {
    initOrderFilters();
    const wrap = $('#orders-list');
    wrap.innerHTML = '<div class="spinner">Se încarcă…</div>';
    const q = $('#order-search').value.trim();
    const status = $('#order-status-filter').value;
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      params.set('pageSize', '100');
      const data = await api('/admin/orders?' + params.toString());
      orders = data.items;
      if (!orders.length) {
        wrap.innerHTML =
          '<table class="admin-table"><tr class="muted-row"><td>Nicio comandă încă. Comenzile apar aici automat după ce un client finalizează o comandă.</td></tr></table>';
        return;
      }
      wrap.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Comandă</th><th>Client</th><th>Produse</th><th>Total</th><th>Plată</th><th>Status</th><th></th></tr></thead>
          <tbody>${orders.map(orderRow).join('')}</tbody>
        </table>`;
      $$('[data-view-order]', wrap).forEach((b) =>
        b.addEventListener('click', () => openOrderDetail(b.dataset.viewOrder))
      );
    } catch (err) {
      wrap.innerHTML = `<p class="muted" style="padding:20px">${esc(err.message)}</p>`;
    }
  }

  function orderRow(o) {
    const st = ORDER_STATUS[o.status] || { label: o.status, cls: '' };
    return `
      <tr data-id="${o.id}">
        <td class="cell-name">${esc(o.orderNumber)}<small>${fmtDate(o.createdAt)}</small></td>
        <td class="cell-name">${esc(o.customer.name)}<small>${esc(o.customer.email)}</small></td>
        <td>${o.itemCount} buc.</td>
        <td class="price-now">${fmtLei(o.total)}</td>
        <td>${o.paymentMethod === 'card' ? 'Card' : 'Ramburs'}</td>
        <td><span class="status-badge ${st.cls}">${st.label}</span></td>
        <td><div class="row-actions"><button class="icon-btn" data-view-order="${o.id}">Detalii</button></div></td>
      </tr>`;
  }

  async function openOrderDetail(id) {
    openDrawer('Comandă', '<div class="spinner">Se încarcă…</div>');
    let o;
    try {
      o = (await api('/admin/orders/' + id)).order;
    } catch (err) {
      $('#drawer-body').innerHTML = `<p class="muted">${esc(err.message)}</p>`;
      return;
    }
    const itemsRows = o.items
      .map(
        (it) =>
          `<tr><td>${esc(it.productName)}</td><td>${it.quantity} ×</td><td>${fmtLei(it.unit)}</td><td class="price-now">${fmtLei(it.line)}</td></tr>`
      )
      .join('');
    $('#drawer-title').textContent = o.orderNumber;
    $('#drawer-body').innerHTML = `
      <div class="od-section">
        <h4>Client</h4>
        <div class="od-row"><span>Nume</span><b>${esc(o.customer.name)}</b></div>
        <div class="od-row"><span>Email</span><a href="mailto:${esc(o.customer.email)}">${esc(o.customer.email)}</a></div>
        <div class="od-row"><span>Telefon</span><a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a></div>
      </div>
      ${o.company ? `
      <div class="od-section">
        <h4>Facturare pe firmă</h4>
        <div class="od-row"><span>Denumire</span><b>${esc(o.company.name || '')}</b></div>
        <div class="od-row"><span>CUI</span><b>${esc(o.company.cui || '')}</b></div>
        ${o.company.regCom ? `<div class="od-row"><span>Reg. Com.</span><b>${esc(o.company.regCom)}</b></div>` : ''}
        ${o.company.address ? `<div class="od-row"><span>Sediu social</span><b>${esc(o.company.address)}</b></div>` : ''}
      </div>` : ''}
      <div class="od-section">
        <h4>Livrare</h4>
        <div class="od-row"><span>Adresă</span><b>${esc(o.address.address)}</b></div>
        <div class="od-row"><span>Oraș / Județ</span><b>${esc(o.address.city)}, ${esc(o.address.county)}</b></div>
        ${o.address.postcode ? `<div class="od-row"><span>Cod poștal</span><b>${esc(o.address.postcode)}</b></div>` : ''}
        ${o.deliveryDate ? `<div class="od-row"><span>Data livrării</span><b>${esc(fmtDate(o.deliveryDate))}${o.deliverySlot ? ' · ' + esc(o.deliverySlot) : ''}</b></div>` : ''}
        ${o.giftMessage ? `<div class="od-row"><span>Text felicitare</span><b>${esc(o.giftMessage)}</b></div>` : ''}
        ${o.notes ? `<div class="od-row"><span>Observații</span><b>${esc(o.notes)}</b></div>` : ''}
      </div>
      <div class="od-section">
        <h4>Produse</h4>
        <table class="od-items"><tbody>${itemsRows}</tbody></table>
        <div class="od-row"><span>Subtotal</span><b>${fmtLei(o.subtotal)}</b></div>
        <div class="od-row"><span>Livrare</span><b>${o.shippingCost ? fmtLei(o.shippingCost) : 'Gratuit'}</b></div>
        <div class="od-row od-total"><span>Total</span><b>${fmtLei(o.total)}</b></div>
      </div>
      <div class="od-section">
        <h4>Status & livrare</h4>
        <div class="field">
          <label>Status comandă</label>
          <select class="select" id="od-status">${statusOptions(ORDER_STATUS, o.status)}</select>
        </div>
        <div class="field">
          <label>AWB (număr urmărire curier)</label>
          <input class="input" id="od-awb" value="${esc(o.awb || '')}" placeholder="ex: 1234567890" />
        </div>
        <div class="hint">Plată: ${o.paymentMethod === 'card' ? 'Card' : 'Ramburs'}${o.paidAt ? ' · plătită ' + fmtDate(o.paidAt) : ''}</div>
        <div class="drawer-actions">
          <button type="button" class="btn btn-ghost" data-drawer-close>Închide</button>
          <button type="button" class="btn btn-primary" id="od-save">Salvează</button>
        </div>
      </div>`;
    bindDrawerClose();
    $('#od-save').addEventListener('click', async () => {
      const btn = $('#od-save');
      btn.disabled = true;
      try {
        await api('/admin/orders/' + id, {
          method: 'PATCH',
          body: { status: $('#od-status').value, awb: $('#od-awb').value.trim() },
        });
        closeDrawer();
        toast('Comandă actualizată ✓');
        loadOrders();
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
      }
    });
  }

  // ---------- LEADS ----------
  let leadsFiltersInit = false;
  async function loadLeads() {
    if (!leadsFiltersInit) {
      leadsFiltersInit = true;
      $('#lead-status-filter').innerHTML =
        '<option value="">Toate statusurile</option>' + statusOptions(LEAD_STATUS, null);
      $('#lead-status-filter').addEventListener('change', loadLeads);
    }
    const wrap = $('#leads-list');
    wrap.innerHTML = '<div class="spinner">Se încarcă…</div>';
    const status = $('#lead-status-filter').value;
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      params.set('pageSize', '100');
      const data = await api('/admin/leads?' + params.toString());
      const leads = data.items;
      if (!leads.length) {
        wrap.innerHTML =
          '<table class="admin-table"><tr class="muted-row"><td>Nicio cerere încă. Cererile din formularul „cere o ofertă" apar aici.</td></tr></table>';
        return;
      }
      wrap.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Client</th><th>Contact</th><th>Eveniment</th><th>Mesaj</th><th>Status</th></tr></thead>
          <tbody>${leads.map(leadRow).join('')}</tbody>
        </table>`;
      $$('[data-lead-status]', wrap).forEach((sel) =>
        sel.addEventListener('change', async () => {
          try {
            await api('/admin/leads/' + sel.dataset.leadStatus + '/status', {
              method: 'PATCH',
              body: { status: sel.value },
            });
            toast('Status actualizat ✓');
          } catch (err) {
            toast(err.message, true);
          }
        })
      );
      $$('[data-lead-msg]', wrap).forEach((b) =>
        b.addEventListener('click', () => {
          const l = leads.find((x) => x.id === b.dataset.leadMsg);
          openLeadDetail(l);
        })
      );
    } catch (err) {
      wrap.innerHTML = `<p class="muted" style="padding:20px">${esc(err.message)}</p>`;
    }
  }

  function leadRow(l) {
    const ev = [l.eventType, l.eventDate ? fmtDate(l.eventDate, true) : ''].filter(Boolean).join(' · ');
    const msg = l.message || '';
    const snippet = msg.length > 50 ? msg.slice(0, 50) + '…' : msg || '—';
    return `
      <tr data-id="${l.id}">
        <td class="cell-name">${esc(l.name)}<small>${fmtDate(l.createdAt)}</small></td>
        <td class="cell-name"><a href="mailto:${esc(l.email)}">${esc(l.email)}</a><small>${esc(l.phone || '')}</small></td>
        <td>${esc(ev || '—')}</td>
        <td>${msg ? `<button class="link-btn" data-lead-msg="${l.id}">${esc(snippet)}</button>` : '—'}</td>
        <td><select class="select select-sm" data-lead-status="${l.id}">${statusOptions(LEAD_STATUS, l.status)}</select></td>
      </tr>`;
  }

  function openLeadDetail(l) {
    const ev = [l.eventType, l.eventDate ? fmtDate(l.eventDate, true) : ''].filter(Boolean).join(' · ');
    openDrawer('Cerere de la ' + l.name, `
      <div class="od-section">
        <div class="od-row"><span>Nume</span><b>${esc(l.name)}</b></div>
        <div class="od-row"><span>Email</span><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></div>
        ${l.phone ? `<div class="od-row"><span>Telefon</span><a href="tel:${esc(l.phone)}">${esc(l.phone)}</a></div>` : ''}
        ${ev ? `<div class="od-row"><span>Eveniment</span><b>${esc(ev)}</b></div>` : ''}
        <div class="od-row"><span>Primită</span><b>${fmtDate(l.createdAt)}</b></div>
      </div>
      <div class="od-section">
        <h4>Mesaj</h4>
        <p style="white-space:pre-wrap;margin:0">${esc(l.message || '(fără mesaj)')}</p>
      </div>
      <div class="drawer-actions">
        <button type="button" class="btn btn-ghost" data-drawer-close>Închide</button>
        <a class="btn btn-primary" href="mailto:${esc(l.email)}">Răspunde pe email</a>
      </div>
    `);
    bindDrawerClose();
  }

  // ---------- DRAWER ----------
  const drawerEl = $('#drawer');
  let drawerOpenedAt = 0;
  let backdropPressed = false;

  function openDrawer(title, html) {
    $('#drawer-title').textContent = title;
    $('#drawer-body').innerHTML = html;
    drawerEl.hidden = false;
    document.body.style.overflow = 'hidden';
    drawerOpenedAt = Date.now();
    backdropPressed = false;
  }
  function closeDrawer() {
    drawerEl.hidden = true;
    $('#drawer-body').innerHTML = '';
    document.body.style.overflow = '';
  }
  function bindDrawerClose() {
    $$('[data-drawer-close]').forEach((b) => b.addEventListener('click', closeDrawer));
  }

  // Închidere la click pe fundal — DOAR dacă atât apăsarea cât și eliberarea
  // au fost pe fundal (nu pe panou). Asta previne „click-through"-ul de la touch,
  // unde click-ul sintetic ce deschide drawer-ul ar cădea pe overlay-ul nou apărut.
  drawerEl.addEventListener('pointerdown', (e) => {
    backdropPressed = e.target === drawerEl;
  });
  drawerEl.addEventListener('click', (e) => {
    if (e.target === drawerEl && backdropPressed && Date.now() - drawerOpenedAt > 250) {
      closeDrawer();
    }
    backdropPressed = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawerEl.hidden) closeDrawer();
  });

  // ---------- EDITOR PAGINI (mini-CMS) ----------
  // UX în doi pași: întâi alegi pagina dintr-o listă grupată (Site / Magazin /
  // Legale), apoi editezi câmpurile grupate pe secțiuni, în ordinea în care
  // apar pe pagină. Fiecare câmp are „Vezi pe pagină", care deschide site-ul
  // și evidențiază exact acel element — asta răspunde la „unde e chestia asta?"
  // fără să ceară clientului să caute prin pagină.
  let pgSlug = null;
  let pgItems = [];
  let pgDirty = new Map();

  function pgMarkDirty() {
    const btn = $('#pg-save');
    btn.disabled = pgDirty.size === 0;
    btn.textContent = pgDirty.size ? `Salvează (${pgDirty.size})` : 'Salvează';
  }

  async function loadPages() {
    const wrap = $('#pages-list');
    $('#page-editor').hidden = true;
    wrap.hidden = false;
    wrap.innerHTML = '<div class="spinner">Se încarcă…</div>';
    try {
      const { pages } = await api('/admin/pages');
      const groups = {};
      pages.forEach((p) => (groups[p.group] = groups[p.group] || []).push(p));
      wrap.innerHTML = Object.entries(groups)
        .map(([g, list]) => `
          <div class="pg-group">
            <h3 class="pg-group-title">${esc(g)}</h3>
            <div class="pg-cards">
              ${list.map((p) => `
                <button class="pg-card" data-page="${esc(p.slug)}">
                  <span class="pg-card-name">${esc(p.name)}</span>
                  <span class="pg-card-url">${esc(p.url)}</span>
                  ${p.warn ? '<span class="pg-card-warn">pagină legală</span>' : ''}
                </button>`).join('')}
            </div>
          </div>`).join('');
      $$('#pages-list .pg-card').forEach((b) =>
        b.addEventListener('click', () => openPage(b.dataset.page))
      );
    } catch (err) {
      wrap.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    }
  }

  async function openPage(slug) {
    pgSlug = slug;
    pgDirty = new Map();
    $('#pages-list').hidden = true;
    $('#page-editor').hidden = false;
    $('#pg-fields').innerHTML = '<div class="spinner">Se încarcă…</div>';
    $('#pg-status').hidden = true;
    try {
      const { page, items } = await api('/admin/pages/' + encodeURIComponent(slug));
      pgItems = items;
      $('#pg-name').textContent = page.name;
      $('#pg-view').href = page.url;
      const warn = $('#pg-warn');
      warn.hidden = !page.warn;
      if (page.warn) warn.textContent = page.warn;
      renderPageFields(page, items);
    } catch (err) {
      $('#pg-fields').innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    }
  }

  function renderPageFields(page, items) {
    const groups = [];
    items.forEach((it) => {
      let g = groups.find((x) => x.name === it.group);
      if (!g) groups.push((g = { name: it.group, items: [] }));
      g.items.push(it);
    });

    $('#pg-fields').innerHTML = groups.map((g) => `
      <section class="pg-section">
        <h4 class="pg-section-title">${esc(g.name)}</h4>
        ${g.items.map((it) => fieldHTML(page, it)).join('')}
      </section>`).join('');

    $$('#pg-fields [data-cms-input]').forEach((el) =>
      el.addEventListener('input', () => {
        const key = el.dataset.cmsInput;
        const orig = pgItems.find((i) => i.key === key);
        if (el.value === orig.value) pgDirty.delete(key);
        else pgDirty.set(key, el.value);
        el.closest('.pg-field').classList.toggle('is-dirty', pgDirty.has(key));
        pgMarkDirty();
      })
    );
    $$('#pg-fields [data-upload-for]').forEach((btn) =>
      btn.addEventListener('click', () => uploadForField(btn.dataset.uploadFor))
    );
    pgMarkDirty();
  }

  function fieldHTML(page, it) {
    if (it.error) {
      return `<div class="pg-field"><label>${esc(it.label)}</label>
        <p class="muted">${esc(it.error)}</p></div>`;
    }
    const see = `<a class="pg-see" href="${esc(page.url)}?cms=${encodeURIComponent(it.key)}"
        target="_blank" rel="noopener" title="Deschide pagina și evidențiază acest element">Vezi pe pagină</a>`;
    const edited = it.isEdited
      ? '<span class="pg-edited" title="Modificat față de textul original">modificat</span>' : '';

    if (it.type === 'image') {
      return `<div class="pg-field pg-field-img">
        <div class="pg-field-head"><label>${esc(it.label)}</label>${edited}${see}</div>
        <div class="pg-img-row">
          <img src="${esc(it.value)}" alt="" class="pg-img-preview" />
          <div class="pg-img-actions">
            <input class="input" data-cms-input="${esc(it.key)}" value="${esc(it.value)}" readonly />
            <button type="button" class="btn btn-ghost btn-sm" data-upload-for="${esc(it.key)}">Schimbă poza…</button>
          </div>
        </div>
      </div>`;
    }
    const input = it.multiline
      ? `<textarea class="textarea" rows="3" data-cms-input="${esc(it.key)}">${esc(it.value)}</textarea>`
      : `<input class="input" data-cms-input="${esc(it.key)}" value="${esc(it.value)}" />`;
    return `<div class="pg-field">
      <div class="pg-field-head"><label>${esc(it.label)}</label>${edited}${see}</div>
      ${input}
    </div>`;
  }

  // Reutilizează /admin/uploads — același endpoint ca la pozele de produs.
  function uploadForField(key) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/jpeg,image/png,image/webp,image/gif';
    inp.addEventListener('change', async () => {
      if (!inp.files || !inp.files.length) return;
      const fd = new FormData();
      fd.append('images', inp.files[0]);
      try {
        const { urls } = await api('/admin/uploads', { method: 'POST', body: fd });
        const field = $(`[data-cms-input="${CSS.escape(key)}"]`);
        field.value = urls[0];
        field.closest('.pg-field').querySelector('.pg-img-preview').src = urls[0];
        field.closest('.pg-field').classList.add('is-dirty');
        pgDirty.set(key, urls[0]);
        pgMarkDirty();
      } catch (err) {
        toast(err.message);
      }
    });
    inp.click();
  }

  $('#pg-back').addEventListener('click', () => {
    if (pgDirty.size && !confirm('Ai modificări nesalvate. Le pierzi dacă ieși acum. Continui?')) return;
    loadPages();
  });

  $('#pg-save').addEventListener('click', async () => {
    if (!pgDirty.size) return;
    const btn = $('#pg-save');
    btn.disabled = true;
    btn.textContent = 'Se salvează…';
    try {
      const values = Object.fromEntries(pgDirty);
      const { saved } = await api('/admin/pages/' + encodeURIComponent(pgSlug), {
        method: 'PUT', body: { values },
      });
      const st = $('#pg-status');
      st.hidden = false;
      st.textContent = `Salvat. ${saved} ${saved === 1 ? 'modificare aplicată' : 'modificări aplicate'} pe site.`;
      await openPage(pgSlug);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      pgMarkDirty();
    }
  });

  // ---------- BANNER PROMO ----------
  function renderBannerPreview() {
    const prev = $('#banner-preview');
    if (!prev) return;
    const text = $('#banner-text').value.trim() || '(fără text)';
    const bg = $('#banner-bg').value;
    const fg = $('#banner-fg').value;
    prev.style.background = bg;
    prev.style.color = fg;
    prev.textContent = text + '   ✦   ' + text + '   ✦   ' + text;
  }

  async function loadBanner() {
    try {
      const { banner } = await api('/admin/banner');
      $('#banner-enabled').checked = !!banner.enabled;
      $('#banner-text').value = banner.text || '';
      $('#banner-bg').value = banner.bgColor || '#111111';
      $('#banner-fg').value = banner.textColor || '#ffffff';
      $('#banner-speed').value = banner.speed || 30;
      renderBannerPreview();
    } catch (e) {
      toast(e.message, true);
    }
  }

  ['#banner-text', '#banner-bg', '#banner-fg'].forEach((sel) => {
    const el = $(sel);
    if (el) el.addEventListener('input', renderBannerPreview);
  });

  const bannerForm = $('#banner-form');
  if (bannerForm) {
    bannerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = $('#banner-status');
      const payload = {
        enabled: $('#banner-enabled').checked,
        text: $('#banner-text').value.trim(),
        bgColor: $('#banner-bg').value,
        textColor: $('#banner-fg').value,
        speed: Number($('#banner-speed').value) || 30,
      };
      try {
        await api('/admin/banner', { method: 'PUT', body: payload });
        if (status) { status.textContent = 'Salvat ✓'; setTimeout(() => (status.textContent = ''), 2500); }
        toast('Banner actualizat');
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  // ---------- BOOT ----------
  (async function boot() {
    if (!token) return showLogin();
    try {
      await api('/admin/me');
      showApp();
    } catch {
      showLogin();
    }
  })();
})();
