/* decoratiuni.js — pagina Decorațiuni Evenimente.
   - /decoratiuni: grilă cu carduri-imagine pentru fiecare eveniment.
   - /decoratiuni/<slug>: subpagina evenimentului (hero + galerii pe categorii).
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

  function renderSubmenu(activeSlug) {
    var el = document.querySelector('[data-decor-submenu]');
    if (!el) return;
    el.innerHTML = '<div class="wrap decor-submenu-inner">' +
      '<a href="/decoratiuni"' + (activeSlug ? '' : ' class="is-active"') + '>Toate</a>' +
      events.map(function (e) {
        return '<a href="/decoratiuni/' + e.slug + '"' + (activeSlug === e.slug ? ' class="is-active"' : '') + '>' + esc(e.name) + '</a>';
      }).join('') + '</div>';
    el.hidden = false;
  }

  function renderLanding() {
    var grid = document.querySelector('[data-decor-grid]');
    if (!grid) return;
    grid.innerHTML = events.map(function (e) {
      return '<a class="decor-tile" href="/decoratiuni/' + e.slug + '">' +
        '<img src="' + esc(e.hero) + '" alt="Decor ' + esc(e.name) + '" loading="lazy" />' +
        '<span class="decor-tile-body"><span class="decor-tile-name">' + esc(e.name) + '</span>' +
        '<span class="decor-tile-go">Vezi ' + ARROW + '</span></span></a>';
    }).join('');
    renderSubmenu('');
  }

  function renderEvent() {
    var box = document.querySelector('[data-decor-event]');
    if (!box) return;
    var m = location.pathname.match(/\/decoratiuni\/([^/?#]+)/);
    var slug = m ? decodeURIComponent(m[1]) : '';
    var e = events.filter(function (x) { return x.slug === slug; })[0];
    if (!e) {
      box.innerHTML = '<section class="section"><div class="wrap"><div class="empty-state">Eveniment inexistent. <a href="/decoratiuni">Înapoi la decorațiuni</a></div></div></section>';
      renderSubmenu('');
      return;
    }
    document.title = e.seoTitle;
    setMeta('description', e.description);
    setMeta('keywords', e.seoKeywords);
    setCanonical('/decoratiuni/' + e.slug);

    var html = '<header class="hero decor-ev-hero"><div class="wrap hero-content">' +
      '<span class="eyebrow">Decorațiuni Evenimente</span>' +
      '<h1>Decor ' + esc(e.name) + ' Iași</h1>' +
      '<p class="lead">' + esc(e.description) + '</p>' +
      '<div class="hero-cta"><a href="/contact" class="btn btn-primary">Cere o ofertă</a></div>' +
      '</div></header>';

    e.categories.forEach(function (cat, i) {
      html += '<section class="section"' + (i % 2 ? ' style="background:linear-gradient(180deg, transparent, color-mix(in srgb, var(--rose) 8%, transparent))"' : '') + '>' +
        '<div class="wrap wide"><div class="section-head"><h2>' + esc(cat.name) + '</h2></div>' +
        '<div class="decor-gallery">' + cat.items.map(function (it) {
          return '<figure class="decor-shot' + (it.portrait ? ' is-portrait' : '') + '">' +
            '<div class="decor-shot-img"><img src="' + esc(it.img) + '" alt="' + esc(it.alt) + '" loading="lazy" /></div>' +
            (it.desc ? '<figcaption>' + esc(it.desc) + '</figcaption>' : '') +
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
