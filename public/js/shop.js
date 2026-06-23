/* ═══════════════════════════════════════════════════════════════════
   shop.js — pagina Shop: filtre, sortare, căutare, paginare „load more".
   Sincronizează filtrele cu URL-ul (shareable links).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const { API, esc, cardHTML, skeletons, bindCards } = window.BBE;

  const grid = document.querySelector('[data-grid]');
  const countEl = document.querySelector('[data-count]');
  const loadMoreBtn = document.querySelector('[data-load-more]');

  // Liste de filtre (statice — pot fi extinse din date).
  const OCCASIONS = [
    ['nunta', 'Nuntă'], ['botez', 'Botez'], ['aniversare', 'Aniversare'],
    ['indragostiti', 'Îndrăgostiți'], ['corporate', 'Corporate'], ['absolvire', 'Absolvire'],
  ];
  const COLORS = [
    ['roz', '#EFB6C8'], ['albastru', '#A8CDE9'], ['mov', '#CBBCEC'],
    ['auriu', '#E4C58B'], ['alb', '#F3EEF0'], ['rosu', '#C75C6E'],
    ['galben', '#F2D98A'], ['crem', '#F2E6D8'],
  ];

  const state = {
    q: '', category: '', occasion: '', color: '',
    minPrice: '', maxPrice: '', inStock: false,
    sort: 'nou', page: 1, pageSize: 9, totalPages: 1, total: 0,
  };

  // ---------- URL SYNC ----------
  function readURL() {
    const u = new URLSearchParams(location.search);
    state.q = u.get('q') || '';
    state.category = u.get('category') || '';
    state.occasion = u.get('occasion') || '';
    state.color = u.get('color') || '';
    state.minPrice = u.get('minPrice') || '';
    state.maxPrice = u.get('maxPrice') || '';
    state.inStock = u.get('inStock') === 'true';
    state.sort = u.get('sort') || 'nou';
  }
  function writeURL() {
    const u = new URLSearchParams();
    for (const k of ['q', 'category', 'occasion', 'color', 'minPrice', 'maxPrice', 'sort']) {
      if (state[k]) u.set(k, state[k]);
    }
    if (state.inStock) u.set('inStock', 'true');
    history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : ''));
  }

  // ---------- BUILD FILTER UI ----------
  async function buildCategoryFilter() {
    const box = document.querySelector('[data-filter-categories]');
    let cats = [];
    try { cats = (await API.get('/categories')).categories; } catch {}
    const all = [['', 'Toate']].concat(cats.map((c) => [c.slug, c.name]));
    box.innerHTML = all.map(([slug, name]) => `
      <label class="checkline">
        <input type="radio" name="cat" value="${esc(slug)}" ${state.category === slug ? 'checked' : ''}/> ${esc(name)}
      </label>`).join('');
    box.addEventListener('change', (e) => {
      if (e.target.name === 'cat') { state.category = e.target.value; reset(); }
    });
  }

  function buildOccasionFilter() {
    const box = document.querySelector('[data-filter-occasions]');
    box.innerHTML = OCCASIONS.map(([v, l]) => `
      <label class="checkline"><input type="radio" name="occ" value="${v}" ${state.occasion === v ? 'checked' : ''}/> ${l}</label>`).join('') +
      `<label class="checkline"><input type="radio" name="occ" value="" ${!state.occasion ? 'checked' : ''}/> Toate</label>`;
    box.addEventListener('change', (e) => { if (e.target.name === 'occ') { state.occasion = e.target.value; reset(); } });
  }

  function buildColorFilter() {
    const box = document.querySelector('[data-filter-colors]');
    box.innerHTML = COLORS.map(([v, hex]) => `
      <label class="checkline"><input type="radio" name="col" value="${v}" ${state.color === v ? 'checked' : ''}/>
        <span class="swatch" style="background:${hex}"></span> ${v[0].toUpperCase() + v.slice(1)}</label>`).join('') +
      `<label class="checkline"><input type="radio" name="col" value="" ${!state.color ? 'checked' : ''}/> Toate</label>`;
    box.addEventListener('change', (e) => { if (e.target.name === 'col') { state.color = e.target.value; reset(); } });
  }

  // ---------- FETCH + RENDER ----------
  function queryString() {
    const u = new URLSearchParams();
    if (state.q) u.set('q', state.q);
    if (state.category) u.set('category', state.category);
    if (state.occasion) u.set('occasion', state.occasion);
    if (state.color) u.set('color', state.color);
    if (state.minPrice) u.set('minPrice', state.minPrice);
    if (state.maxPrice) u.set('maxPrice', state.maxPrice);
    if (state.inStock) u.set('inStock', 'true');
    u.set('sort', state.sort);
    u.set('page', state.page);
    u.set('pageSize', state.pageSize);
    return u.toString();
  }

  async function load(append = false) {
    if (!append) grid.innerHTML = skeletons(state.pageSize);
    loadMoreBtn.hidden = true;
    try {
      const res = await API.get('/products?' + queryString());
      state.totalPages = res.totalPages;
      state.total = res.total;
      const html = res.items.map(cardHTML).join('');
      if (append) grid.insertAdjacentHTML('beforeend', html);
      else grid.innerHTML = html || '<div class="empty-state">Niciun produs nu se potrivește filtrelor. Încearcă să le resetezi.</div>';
      bindCards(grid);
      countEl.textContent = res.total ? `${res.total} produs${res.total === 1 ? '' : 'e'}` : '';
      loadMoreBtn.hidden = state.page >= state.totalPages;
    } catch (e) {
      grid.innerHTML = '<div class="empty-state">Nu am putut încărca produsele. Reîncarcă pagina.</div>';
    }
  }

  function reset() { state.page = 1; writeURL(); load(false); }

  // ---------- DEBOUNCE ----------
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // ---------- BIND CONTROLS ----------
  function bindControls() {
    const search = document.querySelector('[data-search]');
    search.value = state.q;
    search.addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); reset(); }, 350));

    const sort = document.querySelector('[data-sort]');
    sort.value = state.sort;
    sort.addEventListener('change', (e) => { state.sort = e.target.value; reset(); });

    const min = document.querySelector('[data-min-price]');
    const max = document.querySelector('[data-max-price]');
    const slider = document.querySelector('[data-price-slider]');
    const sliderLabel = document.querySelector('[data-price-slider-label]');
    min.value = state.minPrice; max.value = state.maxPrice;
    const onPrice = debounce(() => { state.minPrice = min.value; state.maxPrice = max.value; reset(); }, 400);
    min.addEventListener('input', onPrice);
    max.addEventListener('input', onPrice);
    slider.addEventListener('input', (e) => { sliderLabel.textContent = e.target.value; });
    slider.addEventListener('change', (e) => { max.value = e.target.value; state.maxPrice = e.target.value; reset(); });

    const inStock = document.querySelector('[data-in-stock]');
    inStock.checked = state.inStock;
    inStock.addEventListener('change', (e) => { state.inStock = e.target.checked; reset(); });

    document.querySelector('[data-clear-filters]').addEventListener('click', () => {
      Object.assign(state, { q: '', category: '', occasion: '', color: '', minPrice: '', maxPrice: '', inStock: false, sort: 'nou', page: 1 });
      location.search = '';
    });

    loadMoreBtn.addEventListener('click', () => { state.page++; load(true); });

    // mobile filtre
    const toggle = document.querySelector('[data-toggle-filters]');
    const sidebar = document.querySelector('[data-sidebar]');
    toggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
  }

  // ---------- INIT ----------
  document.addEventListener('DOMContentLoaded', async () => {
    readURL();
    await buildCategoryFilter();
    buildOccasionFilter();
    buildColorFilter();
    bindControls();
    load(false);
  });
})();
