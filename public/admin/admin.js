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
  let facets = { occasions: [], colors: [], badges: [] };
  let facetsLoaded = false;

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
    if (r.status === 401) {
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
    searchTimer = setTimeout(loadProducts, 250);
  });
  $('#product-cat-filter').addEventListener('change', loadProducts);

  async function loadProducts() {
    const wrap = $('#products-list');
    if (!categories.length) await fetchCategories().catch(() => {});
    wrap.innerHTML = '<div class="spinner">Se încarcă…</div>';
    const q = $('#product-search').value.trim();
    const cat = $('#product-cat-filter').value;
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (cat) params.set('category', cat);
      params.set('pageSize', '100');
      const data = await api('/admin/products?' + params.toString());
      products = data.items;
      if (!products.length) {
        wrap.innerHTML = '<table class="admin-table"><tr class="muted-row"><td>Niciun produs găsit.</td></tr></table>';
        return;
      }
      wrap.innerHTML = `
        <table class="admin-table">
          <thead><tr><th></th><th>Produs</th><th>Categorie</th><th>Preț</th><th>Stoc</th><th>Activ</th><th></th></tr></thead>
          <tbody>${products.map(productRow).join('')}</tbody>
        </table>`;
      bindProductRows(wrap);
    } catch (err) {
      wrap.innerHTML = `<p class="muted" style="padding:20px">${esc(err.message)}</p>`;
    }
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
    $$('[data-edit]', wrap).forEach((b) =>
      b.addEventListener('click', async () => {
        await ensureProductMeta();
        openProductEditor(products.find((p) => p.id == b.dataset.edit));
      })
    );
    $$('[data-del]', wrap).forEach((b) =>
      b.addEventListener('click', () => deleteProduct(products.find((p) => p.id == b.dataset.del)))
    );
    $$('[data-toggle]', wrap).forEach((b) =>
      b.addEventListener('change', async () => {
        try {
          await api('/admin/products/' + b.dataset.toggle + '/active', {
            method: 'PATCH',
            body: { isActive: b.checked },
          });
          toast(b.checked ? 'Produs activat ✓' : 'Produs ascuns ✓');
        } catch (err) {
          b.checked = !b.checked;
          toast(err.message, true);
        }
      })
    );
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
    const occ = makeTagInput($('[data-tags="occasions"]'), p?.occasions || [], facets.occasions);
    const col = makeTagInput($('[data-tags="colors"]'), p?.colors || [], facets.colors);

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
        price: Number(fd.get('price')),
        oldPrice: fd.get('oldPrice') === '' ? null : Number(fd.get('oldPrice')),
        stock: Number(fd.get('stock')) || 0,
        badge: fd.get('badge') || '',
        occasions: occ.get(),
        colors: col.get(),
        images,
        isActive: fd.get('isActive') === 'on',
      };
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        if (isEdit) await api('/admin/products/' + p.id, { method: 'PUT', body });
        else await api('/admin/products', { method: 'POST', body });
        closeDrawer();
        toast(isEdit ? 'Produs salvat ✓' : 'Produs adăugat ✓');
        loadProducts();
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
      <div class="od-section">
        <h4>Livrare</h4>
        <div class="od-row"><span>Adresă</span><b>${esc(o.address.address)}</b></div>
        <div class="od-row"><span>Oraș / Județ</span><b>${esc(o.address.city)}, ${esc(o.address.county)}</b></div>
        ${o.address.postcode ? `<div class="od-row"><span>Cod poștal</span><b>${esc(o.address.postcode)}</b></div>` : ''}
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
