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
  // „Categorii" baloane — 2 niveluri: categorie principală (mai multe sub-tipuri) + sub-categorii.
  // Florăria are chip-uri rapide (buchet/cutie) sus, deci nu are arbore în sidebar.
  const CATEGORY_TREE = {
    baloane: [
      { label: 'Set baloane',
        types: 'pachet-1-an,pachet-18-ani,pachet-30-ani,pachet-50-ani,pachet-80-ani,baby-shower,pachet-bride,pachet-5-ani,pachet-25-ani,set-baloane',
        subs: [['pachet-1-an', 'Pachet 1 An'], ['pachet-18-ani', 'Pachet 18 Ani'], ['pachet-30-ani', 'Pachet 30 Ani'],
               ['pachet-50-ani', 'Pachet 50 Ani'], ['pachet-80-ani', 'Pachet 80 Ani'], ['baby-shower', 'Baby Shower']] },
      { label: 'Baloane folie', types: 'folie-cifra,folie-litera,folie-figurina,folie-ocazii',
        subs: [['folie-cifra', 'Cifră'], ['folie-litera', 'Literă'], ['folie-figurina', 'Figurină'], ['folie-ocazii', 'Ocazii speciale']] },
      { label: 'Baloane latex', types: 'baloane-latex', subs: [] },
    ],
  };
  const treeFor = (cat) => CATEGORY_TREE[cat] || [];

  // Intro afișat sus când e activă o categorie (înlocuiește antetul generic).
  const CATEGORY_INTRO = {
    florarie: {
      eyebrow: 'Florărie',
      title: 'Florărie în Iași — flori proaspete, create cu pasiune',
      paras: [
        'La The Big Boom Events transformăm fiecare buchet într-o emoție. Realizăm buchete de flori, aranjamente florale, cutii cu flori și creații personalizate din flori naturale, pregătite cu atenție la fiecare detaliu.',
        'Oferim livrare rapidă de flori în Iași, produse premium și consultanță pentru alegerea cadoului perfect. Descoperă o florărie în care eleganța, prospețimea și calitatea sunt întotdeauna pe primul loc.',
      ],
      seo: {
        title: 'Florărie Iași — Buchete & aranjamente florale | The Big Boom Events',
        desc: 'Florărie în Iași: buchete de flori, aranjamente florale, cutii cu flori și creații personalizate din flori naturale. Livrare rapidă de flori în Iași, produse premium.',
        keywords: 'florărie Iași, livrare flori Iași, buchete flori Iași, aranjamente florale Iași, flori naturale',
      },
    },
    baloane: {
      eyebrow: 'Baloane & Party Shop',
      title: 'Baloane cu heliu în Iași — tot pentru o petrecere memorabilă',
      paras: [
        'Descoperă o gamă variată de baloane cu heliu, baloane personalizate, cifre, litere, decorațiuni și accesorii pentru petreceri. Fie că organizezi o aniversare, un botez, o nuntă sau un eveniment corporate, la The Big Boom Events găsești produse de calitate și soluții creative pentru orice ocazie.',
        'Pregătim fiecare comandă cu grijă și oferim servicii complete în Iași.',
      ],
      seo: {
        title: 'Baloane cu heliu Iași — Party Shop | The Big Boom Events',
        desc: 'Party shop în Iași: baloane cu heliu, baloane personalizate, cifre, litere, decorațiuni și accesorii pentru petreceri. Produse de calitate pentru aniversări, botezuri, nunți și evenimente corporate.',
        keywords: 'baloane cu heliu Iași, party shop Iași, baloane personalizate, decorațiuni petreceri, accesorii evenimente',
      },
    },
  };
  const DEFAULT_TITLE = document.title;
  const DEFAULT_DESC = (document.querySelector('meta[name="description"]') || {}).content || '';
  function applySeo(seo) {
    document.title = seo ? seo.title : DEFAULT_TITLE;
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); }
    m.setAttribute('content', seo ? seo.desc : DEFAULT_DESC);
    let k = document.querySelector('meta[name="keywords"]');
    if (seo && seo.keywords) {
      if (!k) { k = document.createElement('meta'); k.name = 'keywords'; document.head.appendChild(k); }
      k.setAttribute('content', seo.keywords);
    } else if (k) { k.remove(); }
    // Canonical: /shop?category=florarie și /florarie → aceeași pagină → canonical curat.
    const base = location.origin;
    const canon = state.category === 'florarie' ? base + '/florarie'
      : state.category === 'baloane' ? base + '/baloane'
      : base + '/shop';
    let c = document.querySelector('link[rel="canonical"]');
    if (!c) { c = document.createElement('link'); c.rel = 'canonical'; document.head.appendChild(c); }
    c.setAttribute('href', canon);
  }
  function renderCatIntro() {
    const box = document.querySelector('[data-cat-intro]');
    const head = document.querySelector('[data-shop-head]');
    if (!box) return;
    const intro = CATEGORY_INTRO[state.category];
    applySeo(intro && intro.seo);
    if (intro) {
      box.innerHTML =
        `<span class="eyebrow">${esc(intro.eyebrow)}</span>` +
        `<h1>${esc(intro.title)}</h1>` +
        intro.paras.map((p) => `<p>${esc(p)}</p>`).join('');
      box.hidden = false;
      if (head) head.hidden = true;
    } else {
      box.hidden = true;
      box.innerHTML = '';
      if (head) head.hidden = false;
    }
  }
  // „Categoriile" pe ocazie, în funcție de categoria produsului.
  // Florăria are lista fixă cerută; restul folosesc lista generală.
  const OCCASIONS_BY_CAT = {
    florarie: [
      ['aniversare', 'Aniversări'], ['cerere', 'Cerere în căsătorie'], ['nunta', 'Nuntă'],
      ['botez', 'Botez'], ['majorat', 'Majorat'], ['mama', 'Pentru Mama'],
      ['ghiveci', 'În ghiveci'], ['funerare', 'Funerare'],
    ],
  };
  const OCCASIONS_DEFAULT = [
    ['aniversare', 'Aniversare'], ['indragostiti', 'Îndrăgostiți'], ['cerere', 'Cerere în căsătorie'],
    ['majorat', 'Majorat'], ['botez', 'Naștere & botez'], ['multumire', 'Mulțumire'],
    ['corporate', 'Corporate'], ['nunta', 'Nuntă'], ['lux', 'Cadou de lux'],
  ];
  const occasionsFor = (cat) => OCCASIONS_BY_CAT[cat] || OCCASIONS_DEFAULT;
  const COLORS = [
    ['roz', '#EFB6C8'], ['albastru', '#A8CDE9'], ['mov', '#CBBCEC'],
    ['auriu', '#E4C58B'], ['alb', '#F3EEF0'], ['rosu', '#C75C6E'],
    ['galben', '#F2D98A'], ['crem', '#F2E6D8'],
  ];

  const state = {
    q: '', category: '', type: '', occasion: '', color: '', collection: '',
    minPrice: '', maxPrice: '', inStock: false,
    sort: 'nou', page: 1, pageSize: 9, totalPages: 1, total: 0,
  };

  // ---------- URL SYNC ----------
  // URL-uri curate (SEO): /florarie și /baloane servesc shop.html cu categoria din path.
  const PATH_CATEGORIES = { '/florarie': 'florarie', '/baloane': 'baloane' };
  function pathCategory() {
    const p = location.pathname.replace(/\/$/, '');
    return PATH_CATEGORIES[p] || '';
  }
  function readURL() {
    const u = new URLSearchParams(location.search);
    state.q = u.get('q') || '';
    state.category = pathCategory() || u.get('category') || '';
    state.type = u.get('type') || '';
    state.occasion = u.get('occasion') || '';
    state.color = u.get('color') || '';
    state.collection = u.get('collection') || '';
    state.minPrice = u.get('minPrice') || '';
    state.maxPrice = u.get('maxPrice') || '';
    state.inStock = u.get('inStock') === 'true';
    state.sort = u.get('sort') || 'nou';
  }
  function writeURL() {
    const onPath = pathCategory();
    const u = new URLSearchParams();
    for (const k of ['q', 'category', 'type', 'occasion', 'color', 'collection', 'minPrice', 'maxPrice', 'sort']) {
      // pe /florarie și /baloane categoria e în path, nu în query
      if (k === 'category' && onPath) continue;
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
      if (e.target.name === 'cat') {
        state.category = e.target.value;
        state.type = '';           // tipurile diferă pe categorie — resetează
        state.collection = '';     // colecția se resetează la schimbarea categoriei
        state.occasion = '';       // „categoriile" (ocazii) diferă pe categorie
        buildTypeFilter();         // reconstruiește lista de tipuri pentru noua categorie
        buildQuickFilters();       // chip-uri rapide diferite pe florărie vs. rest
        buildOccasionFilter();     // categoriile-ocazii diferite pe florărie vs. rest
        updatePriceSlider();       // preț maxim mai mare pe florărie (1500)
        renderCatIntro();          // intro-ul de categorie sus (florărie etc.)
        refreshSidebar();          // ascunde selectorul de categorie / ocaziile după caz
        reset();
      }
    });
  }

  function buildTypeFilter() {
    const box = document.querySelector('[data-filter-types]');
    if (!box) return;
    const tree = treeFor(state.category);
    const section = box.closest('[data-filter-section]') || box;
    const head = section.querySelector('h4');
    // Arborele de categorii apare doar la baloane.
    if (!tree.length) { section.hidden = true; box.innerHTML = ''; return; }
    section.hidden = false;
    if (head) head.textContent = 'Categorii';
    const radio = (val, label, cls) =>
      `<label class="checkline ${cls || ''}"><input type="radio" name="typ" value="${esc(val)}" ${state.type === val ? 'checked' : ''}/> ${esc(label)}</label>`;
    let html = radio('', 'Toate');
    tree.forEach((node) => {
      html += radio(node.types, node.label, 'cat-main');
      node.subs.forEach(([v, l]) => { html += radio(v, l, 'cat-sub'); });
    });
    box.innerHTML = html;
    box.onchange = (e) => { if (e.target.name === 'typ') { state.type = e.target.value; reset(); } };
  }

  // Prețul maxim din slider — mai mare pe florărie (buchete premium / TRIO).
  const priceMaxFor = (cat) => (cat === 'florarie' ? 1500 : 500);
  function updatePriceSlider() {
    const slider = document.querySelector('[data-price-slider]');
    const label = document.querySelector('[data-price-slider-label]');
    if (!slider) return;
    const mx = priceMaxFor(state.category);
    slider.max = String(mx);
    const val = state.maxPrice || mx;
    slider.value = String(val);
    if (label) label.textContent = val;
  }

  // Vizibilitatea grupurilor din sidebar în funcție de categorie.
  function refreshSidebar() {
    const catGroup = document.querySelector('[data-cat-group]');
    const occGroup = document.querySelector('[data-occ-group]');
    // Selectorul de categorie (Florărie/Baloane) apare doar pe shop-ul general (vii din meniu altfel).
    if (catGroup) catGroup.hidden = !!state.category;
    // Ocaziile: le ascundem pe baloane (au „Categorii" proprii); rămân pe florărie și shop general.
    if (occGroup) occGroup.hidden = state.category === 'baloane';
  }

  function buildOccasionFilter() {
    const box = document.querySelector('[data-filter-occasions]');
    const list = occasionsFor(state.category);
    const head = document.querySelector('[data-occ-head]');
    if (head) head.textContent = state.category === 'florarie' ? 'Categorii' : 'Ocazie';
    box.innerHTML = list.map(([v, l]) => `
      <label class="checkline"><input type="radio" name="occ" value="${v}" ${state.occasion === v ? 'checked' : ''}/> ${l}</label>`).join('') +
      `<label class="checkline"><input type="radio" name="occ" value="" ${!state.occasion ? 'checked' : ''}/> Toate</label>`;
    box.onchange = (e) => { if (e.target.name === 'occ') { state.occasion = e.target.value; reset(); } };
  }

  function buildColorFilter() {
    const box = document.querySelector('[data-filter-colors]');
    box.innerHTML = COLORS.map(([v, hex]) => `
      <label class="checkline"><input type="radio" name="col" value="${v}" ${state.color === v ? 'checked' : ''}/>
        <span class="swatch" style="background:${hex}"></span> ${v[0].toUpperCase() + v.slice(1)}</label>`).join('') +
      `<label class="checkline"><input type="radio" name="col" value="" ${!state.color ? 'checked' : ''}/> Toate</label>`;
    box.addEventListener('change', (e) => { if (e.target.name === 'col') { state.color = e.target.value; reset(); } });
  }

  // Filtre rapide, în funcție de categorie:
  //  - florărie → Toate / Flori în buchet / Flori în cutie / Flori în coș (filtrează pe tip)
  //  - restul   → Toate / Populare / Reduceri / Noutăți (filtrează pe colecție)
  function buildQuickFilters() {
    const box = document.querySelector('[data-quick-filters]');
    if (!box) return;
    const isFlor = state.category === 'florarie';
    const kind = isFlor ? 'type' : 'collection';
    const items = isFlor
      ? [['', 'Toate'], ['buchet', 'Flori în buchet'], ['cutie', 'Flori în cutie'], ['cos', 'Flori în coș']]
      : [['', 'Toate'], ['popular', 'Populare'], ['reduceri', 'Reduceri'], ['nou', 'Noutăți']];
    const activeVal = () => (kind === 'type' ? state.type : state.collection);
    box.innerHTML = items.map(([v, l]) =>
      `<button type="button" class="chip" data-qf="${esc(v)}" aria-pressed="${activeVal() === v ? 'true' : 'false'}">${esc(l)}</button>`
    ).join('');
    box.onclick = (e) => {
      const btn = e.target.closest('[data-qf]');
      if (!btn) return;
      const val = btn.dataset.qf;
      if (kind === 'type') state.type = val; else state.collection = val;
      box.querySelectorAll('[data-qf]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.qf === val ? 'true' : 'false'));
      reset();
    };
  }

  // ---------- FETCH + RENDER ----------
  function queryString() {
    const u = new URLSearchParams();
    if (state.q) u.set('q', state.q);
    if (state.category) u.set('category', state.category);
    if (state.type) u.set('type', state.type);
    if (state.occasion) u.set('occasion', state.occasion);
    if (state.color) u.set('color', state.color);
    if (state.collection) u.set('collection', state.collection);
    if (state.minPrice) u.set('minPrice', state.minPrice);
    if (state.maxPrice) u.set('maxPrice', state.maxPrice);
    if (state.inStock) u.set('inStock', 'true');
    u.set('sort', state.sort);
    u.set('page', state.page);
    u.set('pageSize', state.pageSize);
    return u.toString();
  }

  // Secvențiere: două filtrări rapide una după alta puteau ajunge în ordine
  // inversă, iar răspunsul vechi suprascria grila (rezultate care nu corespund
  // filtrelor afișate). Scriem în DOM doar răspunsul ultimei cereri.
  let reqId = 0;

  async function load(append = false) {
    const my = ++reqId;
    if (!append) grid.innerHTML = skeletons(state.pageSize);
    loadMoreBtn.hidden = true;
    try {
      const res = await API.get('/products?' + queryString());
      if (my !== reqId) return;
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
    updatePriceSlider();

    const inStock = document.querySelector('[data-in-stock]');
    inStock.checked = state.inStock;
    inStock.addEventListener('change', (e) => { state.inStock = e.target.checked; reset(); });

    document.querySelector('[data-clear-filters]').addEventListener('click', () => {
      Object.assign(state, { q: '', category: '', type: '', occasion: '', color: '', collection: '', minPrice: '', maxPrice: '', inStock: false, sort: 'nou', page: 1 });
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
    buildTypeFilter();
    renderCatIntro();
    buildOccasionFilter();
    buildColorFilter();
    buildQuickFilters();
    refreshSidebar();
    bindControls();
    load(false);
  });
})();
