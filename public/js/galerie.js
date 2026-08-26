/* ═══════════════════════════════════════════════════════════════════
   galerie.js — galeria foto din tabul „Galerie" al paginii
   /decoratiuni-evenimente.
   Pozele vin din `GET /api/gallery` (tabelul `gallery_images`), deci clientul
   le administrează din panou → tabul „Galerie". Filtrarea se face LOCAL, pe
   lista deja descărcată: sunt zeci de poze, nu mii, iar un request la fiecare
   click pe chip ar face filtrele să pară lente degeaba.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var API = (window.BBE && window.BBE.API) || null;
  var esc = (window.BBE && window.BBE.esc) || function (s) { return String(s == null ? '' : s); };

  var grid = document.querySelector('[data-gallery]');
  var filtersBox = document.querySelector('[data-gallery-filters]');
  if (!grid) return;

  // Etichetele sunt slug-uri de eveniment. Numele frumoase le știm pentru cele
  // existente; pentru orice etichetă nouă adăugată din panou, derivăm un nume
  // lizibil din slug, ca să nu fie nevoie de o modificare în cod.
  var NUME = {
    nunta: 'Nuntă', botez: 'Botez', majorat: 'Majorat',
    corporate: 'Corporate', 'gender-reveal': 'Gender Reveal',
  };
  function numeEticheta(tag) {
    if (NUME[tag]) return NUME[tag];
    var t = String(tag || '').replace(/-/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Altele';
  }

  var toate = [];       // toate pozele descărcate
  var vizibile = [];    // ce e afișat acum (contează pentru navigarea din lightbox)
  var filtruActiv = '';

  function itemHTML(img, i) {
    return '<button type="button" class="gallery-item" data-i="' + i + '" aria-label="Deschide poza' +
      (img.alt ? ': ' + esc(img.alt) : '') + '">' +
      '<img src="' + esc(img.url) + '" alt="' + esc(img.alt) + '" loading="lazy" decoding="async" />' +
      '</button>';
  }

  function randeaza() {
    vizibile = filtruActiv ? toate.filter(function (im) { return im.tag === filtruActiv; }) : toate;
    if (!vizibile.length) {
      grid.innerHTML = '<p class="muted gallery-empty">Nu sunt poze în această categorie încă.</p>';
      return;
    }
    grid.innerHTML = vizibile.map(itemHTML).join('');
  }

  function randeazaFiltre(tags) {
    if (!filtersBox || !tags.length) return;
    var items = [{ tag: '', label: 'Toate' }].concat(tags.map(function (t) {
      return { tag: t.tag, label: numeEticheta(t.tag) };
    }));
    filtersBox.innerHTML = items.map(function (it) {
      return '<button type="button" class="chip" data-tag="' + esc(it.tag) + '" aria-pressed="' +
        (filtruActiv === it.tag ? 'true' : 'false') + '">' + esc(it.label) + '</button>';
    }).join('');
    filtersBox.onclick = function (e) {
      var b = e.target.closest('[data-tag]');
      if (!b) return;
      filtruActiv = b.dataset.tag;
      filtersBox.querySelectorAll('[data-tag]').forEach(function (x) {
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      randeaza();
    };
  }

  // ── Lightbox ──────────────────────────────────────────────────────
  // Construit o singură dată, la prima deschidere. Închiderea readuce focusul
  // pe poza din care s-a pornit (altfel, la Escape, focusul sărea la începutul
  // paginii și navigarea cu tastatura o lua de la capăt).
  var box = null, boxImg = null, boxCap = null, idx = 0, deschisDe = null;

  function construieste() {
    box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Galerie foto');
    box.innerHTML =
      '<button type="button" class="lb-close" aria-label="Închide">×</button>' +
      '<button type="button" class="lb-nav lb-prev" aria-label="Poza anterioară">‹</button>' +
      '<figure class="lb-figure"><img alt="" /><figcaption></figcaption></figure>' +
      '<button type="button" class="lb-nav lb-next" aria-label="Poza următoare">›</button>';
    document.body.appendChild(box);
    boxImg = box.querySelector('img');
    boxCap = box.querySelector('figcaption');

    box.querySelector('.lb-close').addEventListener('click', inchide);
    box.querySelector('.lb-prev').addEventListener('click', function () { sari(-1); });
    box.querySelector('.lb-next').addEventListener('click', function () { sari(1); });
    // Click pe fundal (nu pe poză sau butoane) închide.
    box.addEventListener('click', function (e) { if (e.target === box || e.target.tagName === 'FIGURE') inchide(); });
  }

  function arata(i) {
    var im = vizibile[i];
    if (!im) return;
    idx = i;
    boxImg.src = im.url;
    boxImg.alt = im.alt || '';
    boxCap.textContent = im.alt || '';
    boxCap.hidden = !im.alt;
  }

  function sari(d) {
    if (!vizibile.length) return;
    arata((idx + d + vizibile.length) % vizibile.length); // circular: după ultima urmează prima
  }

  function deschide(i, sursa) {
    if (!box) construieste();
    deschisDe = sursa || null;
    arata(i);
    box.classList.add('open');
    document.body.classList.add('menu-open'); // blochează derularea în spate
    box.querySelector('.lb-close').focus();
  }

  function inchide() {
    if (!box) return;
    box.classList.remove('open');
    document.body.classList.remove('menu-open');
    boxImg.src = '';
    if (deschisDe && document.contains(deschisDe)) deschisDe.focus();
  }

  grid.addEventListener('click', function (e) {
    var b = e.target.closest('[data-i]');
    if (!b) return;
    deschide(Number(b.dataset.i), b);
  });

  document.addEventListener('keydown', function (e) {
    if (!box || !box.classList.contains('open')) return;
    if (e.key === 'Escape') inchide();
    else if (e.key === 'ArrowLeft') sari(-1);
    else if (e.key === 'ArrowRight') sari(1);
  });

  // ── Încărcare ─────────────────────────────────────────────────────
  function incarca() {
    if (!API) { grid.innerHTML = ''; return; }
    API.get('/gallery')
      .then(function (d) {
        toate = (d && d.images) || [];
        if (!toate.length) {
          grid.innerHTML = '<p class="muted gallery-empty">Galeria se completează în curând.</p>';
          if (filtersBox) filtersBox.innerHTML = '';
          return;
        }
        randeazaFiltre((d && d.tags) || []);
        randeaza();
      })
      .catch(function () {
        grid.innerHTML = '<p class="muted gallery-empty">Galeria nu a putut fi încărcată.</p>';
      });
  }

  // Galeria stă într-un tab ascuns: nu cerem pozele până nu e deschis. Prima
  // deschidere emite `bbe:galerie` din decoratiuni.js; pe orice altă pagină
  // (panou fără tab-uri) încărcăm direct.
  var incarcata = false;
  function incarcaOData() { if (!incarcata) { incarcata = true; incarca(); } }

  function porneste() {
    var panel = document.querySelector('[data-panel-galerie]');
    if (panel && panel.hidden) document.addEventListener('bbe:galerie', incarcaOData);
    else incarcaOData();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', porneste);
  else porneste();
})();
