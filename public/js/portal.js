/* portal.js — ecranul de start (overlay) de pe homepage.
   - Apare DOAR la prima intrare din exterior (Google / link direct / bookmark),
     o singură dată pe sesiune. NU apare la navigare internă sau la Back.
   - La Back (bfcache) curăță „veil"-ul rămas din animația de alegere și ține
     overlay-ul ascuns (altfel rămânea o culoare plină pe ecran).
   Încărcat doar pe homepage (după app.js, deci window.BBE există). */
(function () {
  var portal = document.getElementById('portal');
  if (!portal) return;

  // Curăță orice stare de animație rămasă (veil + clase), fără a afecta `hidden`.
  function cleanupVeil() {
    var v = portal.querySelector('.portal-veil');
    if (v && v.parentNode) v.parentNode.removeChild(v);
    portal.classList.remove('is-choosing', 'is-out');
    var picked = portal.querySelector('.choice.is-picked');
    if (picked) picked.classList.remove('is-picked');
  }

  // La Back/Forward din bfcache: pagina e restaurată cu veil-ul încă pe ecran →
  // îl curățăm și ținem overlay-ul ascuns (nu-l reafișăm la revenire).
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { cleanupVeil(); portal.setAttribute('hidden', ''); document.body.classList.remove('menu-open'); }
  });

  // Referrer intern? (venim din interiorul site-ului, nu din Google/direct)
  function internalReferrer() {
    var ref = document.referrer;
    if (!ref) return false; // direct / bookmark → nu e intern
    try {
      var rh = new URL(ref).hostname;
      return rh === location.hostname || /(?:^|\.)thebigboomevents\.ro$/i.test(rh);
    } catch (e) { return false; }
  }

  var seen = false;
  try { seen = sessionStorage.getItem('bbe_portal_seen') === '1'; } catch (e) {}

  // Nu-l arăta dacă a fost deja văzut în sesiune sau dacă vii din navigare internă.
  if (seen || internalReferrer()) {
    cleanupVeil();
    portal.setAttribute('hidden', '');
    return;
  }
  try { sessionStorage.setItem('bbe_portal_seen', '1'); } catch (e) {}
  // Overlay-ul e `aria-modal` → fundalul nu trebuie să deruleze sub el.
  document.body.classList.add('menu-open');

  // ─── de aici: setup-ul interactiv + afișarea overlay-ului ───

  var cards = portal.querySelectorAll('.choice');
  // Rescrie link-urile cu URL-urile absolute din BBE (evită un redirect pe prod).
  // portal.js rulează ÎNAINTEA lui app.js (ca portalul să apară repede), deci la
  // primul apel BBE poate lipsi — reîncercăm după ce app.js rulează (setTimeout 0).
  // Fără BBE, cardurile păstrează hrefs relative, care funcționează ca fallback.
  function rewriteLinks() {
    var U = (window.BBE && window.BBE.urls) || null;
    if (!U) return false;
    var DEST = { florarie: U.florarie, baloane: U.baloane, decoratiuni: U.decoratiuni, wedding: U.wedding };
    Array.prototype.forEach.call(cards, function (a) {
      var key = a.getAttribute('data-dest');
      if (DEST[key]) a.setAttribute('href', DEST[key]);
    });
    return true;
  }
  if (!rewriteLinks()) setTimeout(rewriteLinks, 0);

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var css = getComputedStyle(document.documentElement);
  var COLOR = {
    florarie:    (css.getPropertyValue('--rose')   || '#EFB6C8').trim(),
    baloane:     (css.getPropertyValue('--sky')    || '#A8CDE9').trim(),
    decoratiuni: (css.getPropertyValue('--butter') || '#F6C99A').trim(),
    wedding:     (css.getPropertyValue('--lilac')  || '#CBBCEC').trim(),
  };

  var busy = false;

  function choose(card, go) {
    if (busy) return; busy = true;
    if (reduceMotion || !go) { window.location.href = go; return; }

    var r = card.getBoundingClientRect();
    var vx = r.left + r.width / 2;
    var vy = r.top + r.height / 2;
    var vr = Math.hypot(Math.max(vx, window.innerWidth - vx), Math.max(vy, window.innerHeight - vy)) + 4;

    var veil = document.createElement('div');
    veil.className = 'portal-veil';
    veil.style.background = COLOR[card.getAttribute('data-dest')] || COLOR.florarie;
    veil.style.setProperty('--vx', vx + 'px');
    veil.style.setProperty('--vy', vy + 'px');
    veil.style.setProperty('--vr', vr + 'px');
    portal.appendChild(veil);

    portal.classList.add('is-choosing');
    card.classList.add('is-picked');

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { veil.classList.add('go'); });
    });

    setTimeout(function () { window.location.href = go; }, 620);
  }

  function close() {
    portal.classList.add('is-out');
    document.body.classList.remove('menu-open');
    setTimeout(function () { portal.setAttribute('hidden', ''); cleanupVeil(); }, 520);
  }

  // Focus trap: cu Tab se ieșea din overlay direct în nav-ul de dedesubt.
  portal.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = portal.querySelectorAll('a[href], button:not([disabled])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  Array.prototype.forEach.call(cards, function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      choose(a, a.getAttribute('href'));
    });
  });

  // Parallax discret: poza din card se mișcă ușor după cursor.
  if (!reduceMotion) {
    Array.prototype.forEach.call(cards, function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        card.style.setProperty('--px', (dx * 9).toFixed(1) + 'px');
        card.style.setProperty('--py', (dy * 9).toFixed(1) + 'px');
      });
      card.addEventListener('mouseleave', function () {
        card.style.setProperty('--px', '0px');
        card.style.setProperty('--py', '0px');
      });
    });
  }

  var skip = document.getElementById('portalSkip');
  if (skip) skip.addEventListener('click', function () { close(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !portal.classList.contains('is-out')) close();
  });

  cleanupVeil();               // pornim dintr-o stare curată
  portal.removeAttribute('hidden');
})();
