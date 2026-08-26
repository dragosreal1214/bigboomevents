/* decoratiuni.js — pagina Decorațiuni Evenimente.
   - /decoratiuni: grilă cu carduri-imagine pentru fiecare eveniment.
   - /decoratiuni-evenimente/<slug>: subpagina evenimentului (hero + galerii pe categorii).
   - Submeniu (sub nav-ul principal) cu toate evenimentele, doar aici.
   Date: window.DECOR_EVENTS (decoratiuni-data.js). */
(function () {
  'use strict';
  var events = window.DECOR_EVENTS || [];
  var esc = (window.BBE && window.BBE.esc) || function (s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  };
  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  function setMeta(name, val) {
    if (!val) return;
    var m = document.querySelector('meta[name="' + name + '"]');
    if (!m) { m = document.createElement('meta'); m.name = name; document.head.appendChild(m); }
    m.setAttribute('content', val);
  }
  function setCanonical(path) {
    var c = document.querySelector('link[rel="canonical"]');
    if (!c) { c = document.createElement('link'); c.rel = 'canonical'; document.head.appendChild(c); }
    c.setAttribute('href', location.origin + path);
  }

  // Tab-urile secțiunii. „Galerie" e ultimul: nu e un tip de eveniment, ci o
  // vedere peste toate. Trăiește pe pagina-listă, comutată din `?vezi=galerie`,
  // ca să nu fie nevoie de încă o pagină pre-randată doar pentru ea.
  // ATENȚIE: markup-ul trebuie să fie IDENTIC cu `submenuHTML` din
  // src/services/decorPrerender.js, altfel submeniul „sare" la hidratare.
  function renderSubmenu(activeSlug) {
    var el = document.querySelector('[data-decor-submenu]');
    if (!el) return;
    el.innerHTML = '<div class="wrap decor-submenu-inner">' +
      '<a href="/decoratiuni-evenimente"' + (activeSlug ? '' : ' class="is-active"') + '>Toate</a>' +
      events.map(function (e) {
        return '<a href="/decoratiuni-evenimente/' + e.slug + '"' + (activeSlug === e.slug ? ' class="is-active"' : '') + '>' + esc(e.name) + '</a>';
      }).join('') +
      '<a href="/decoratiuni-evenimente?vezi=galerie"' + (activeSlug === 'galerie' ? ' class="is-active"' : '') + '>Galerie</a>' +
      '</div>';
    el.hidden = false;
  }

  // Comută între panoul cu tipuri de evenimente și cel cu galeria. Panourile
  // sunt amândouă în HTML (deci pre-randate, vizibile pentru crawler); aici doar
  // se ascunde unul. Fără JS rămân ambele, una sub alta — degradare acceptabilă.
  function showPanel(galerie) {
    var tipuri = document.querySelector('[data-panel-tipuri]');
    var gal = document.querySelector('[data-panel-galerie]');
    if (!tipuri || !gal) return;
    tipuri.hidden = galerie;
    gal.hidden = !galerie;
    if (galerie) document.dispatchEvent(new CustomEvent('bbe:galerie'));
  }

  function renderLanding() {
    var grid = document.querySelector('[data-decor-grid]');
    if (!grid) return;
    grid.innerHTML = events.map(function (e) {
      return '<a class="decor-tile" href="/decoratiuni-evenimente/' + e.slug + '">' +
        '<img src="' + esc(e.hero) + '" alt="Decor ' + esc(e.name) + '" loading="lazy" />' +
        '<span class="decor-tile-body"><span class="decor-tile-name">' + esc(e.name) + '</span>' +
        '<span class="decor-tile-go">Vezi ' + ARROW + '</span></span></a>';
    }).join('');
    var vrea = /(?:^|[?&])vezi=galerie(?:&|$)/.test(location.search);
    showPanel(vrea);
    renderSubmenu(vrea ? 'galerie' : '');
  }

  function renderEvent() {
    var box = document.querySelector('[data-decor-event]');
    if (!box) return;
    var m = location.pathname.match(/\/decoratiuni-evenimente\/([^/?#]+)/);
    var slug = m ? decodeURIComponent(m[1]) : '';
    var e = events.filter(function (x) { return x.slug === slug; })[0];
    if (!e) {
      box.innerHTML = '<section class="section"><div class="wrap"><div class="empty-state">Eveniment inexistent. <a href="/decoratiuni-evenimente">Înapoi la decorațiuni</a></div></div></section>';
      renderSubmenu('');
      return;
    }
    document.title = e.seoTitle;
    setMeta('description', e.description);
    setMeta('keywords', e.seoKeywords);
    setCanonical('/decoratiuni-evenimente/' + e.slug);

    var html = '<header class="hero decor-ev-hero"><div class="wrap hero-content">' +
      '<span class="eyebrow">Decorațiuni Evenimente</span>' +
      '<h1>Decor ' + esc(e.name) + ' Iași</h1>' +
      '<p class="lead" data-cms="descriere">' + esc(e.description) + '</p>' +
      '<div class="hero-cta"><a href="/contact" class="btn btn-primary">Cere o ofertă</a></div>' +
      '</div></header>';

    e.categories.forEach(function (cat, i) {
      html += '<section class="section"' + (i % 2 ? ' style="background:linear-gradient(180deg, transparent, color-mix(in srgb, var(--rose) 8%, transparent))"' : '') + '>' +
        '<div class="wrap wide"><div class="section-head"><h2 data-cms="categorie-' + i + '-nume">' + esc(cat.name) + '</h2></div>' +
        '<div class="decor-gallery">' + cat.items.map(function (it, j) {
          // Marcajele data-cms* trebuie sa fie IDENTICE cu cele din
          // src/services/decorPrerender.js — altfel, dupa hidratare, editorul
          // din panou nu mai gaseste elementele pe care le pre-randasem.
          return '<figure class="decor-shot' + (it.portrait ? ' is-portrait' : '') + '">' +
            '<div class="decor-shot-img"><img data-cms-img="poza-' + i + '-' + j + '-img" src="' + esc(it.img) + '" alt="' + esc(it.alt) + '" loading="lazy" /></div>' +
            (it.desc ? '<figcaption data-cms="poza-' + i + '-' + j + '-desc">' + esc(it.desc) + '</figcaption>' : '') +
            '</figure>';
        }).join('') + '</div></div></section>';
    });

    html += '<section class="section-sm"><div class="wrap"><div class="cta-band">' +
      '<h2>Îți place ce vezi?</h2><p>Hai să discutăm despre decorul evenimentului tău — creăm ceva unic pentru voi.</p>' +
      '<a href="/contact" class="btn btn-primary">Cere o ofertă</a></div></div></section>';

    box.innerHTML = html;
    renderSubmenu(e.slug);
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderLanding();
    renderEvent();
  });
})();
