/* portal.js — ecranul de start (overlay) de pe homepage.
   - Apare DOAR la prima vizită; după ce alegi o direcție (sau sari peste),
     nu mai reapare (flag localStorage 'bbe_portal_seen').
   - Linkurile se rescriu din BBE.urls ca să sară corect între site principal
     și magazin în producție (vezi app.js). Local rămân relative.
   Încărcat doar pe homepage (după app.js, deci window.BBE există). */
(function () {
  var KEY = 'bbe_portal_seen';
  var portal = document.getElementById('portal');
  if (!portal) return;

  // Vizită repetată → nu mai arătăm overlay-ul deloc.
  var seen = false;
  try { seen = !!localStorage.getItem(KEY); } catch (e) {}
  if (seen) { portal.remove(); return; }

  // Construiește destinațiile corecte din BBE.urls (fallback: href-ul relativ din HTML).
  var U = (window.BBE && window.BBE.urls) || null;
  var DEST = U ? {
    nunta:    U.evenimente,
    florarie: U.shopCat('florarie'),
    baloane:  U.shopCat('baloane'),
    shop:     U.shop,
  } : null;

  var cards = portal.querySelectorAll('.choice');
  if (DEST) {
    Array.prototype.forEach.call(cards, function (a) {
      var key = a.getAttribute('data-dest');
      if (DEST[key]) a.setAttribute('href', DEST[key]);
    });
  }

  function markSeen() { try { localStorage.setItem(KEY, '1'); } catch (e) {} }

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // Culoarea categoriei pentru „inundarea" ecranului (din variabilele CSS ale brandului).
  var css = getComputedStyle(document.documentElement);
  var COLOR = {
    nunta:    (css.getPropertyValue('--lilac')  || '#CBBCEC').trim(),
    florarie: (css.getPropertyValue('--rose')   || '#EFB6C8').trim(),
    baloane:  (css.getPropertyValue('--sky')    || '#A8CDE9').trim(),
    shop:     (css.getPropertyValue('--butter') || '#F6C99A').trim(),
  };

  var busy = false;

  // ALEGERE: cardul ales rămâne în prim-plan, restul se estompează, iar culoarea
  // categoriei se extinde ca un cerc din centrul cardului, apoi navighează.
  function choose(card, go) {
    if (busy) return; busy = true;
    markSeen();

    if (reduceMotion || !go) { window.location.href = go; return; }

    var r = card.getBoundingClientRect();
    var vx = r.left + r.width / 2;
    var vy = r.top + r.height / 2;
    // rază care acoperă cel mai îndepărtat colț al ecranului
    var vr = Math.hypot(Math.max(vx, window.innerWidth - vx), Math.max(vy, window.innerHeight - vy)) + 4;

    var veil = document.createElement('div');
    veil.className = 'portal-veil';
    veil.style.background = COLOR[card.getAttribute('data-dest')] || COLOR.nunta;
    veil.style.setProperty('--vx', vx + 'px');
    veil.style.setProperty('--vy', vy + 'px');
    veil.style.setProperty('--vr', vr + 'px');
    portal.appendChild(veil);

    portal.classList.add('is-choosing');
    card.classList.add('is-picked');

    // două raf-uri ca tranziția clip-path să pornească din starea inițială (cerc 0)
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { veil.classList.add('go'); });
    });

    setTimeout(function () { window.location.href = go; }, 620);
  }

  function close(go) {
    markSeen();
    portal.classList.add('is-out');
    // doar închide (rămâne pe homepage); ascunde după tranziție
    setTimeout(function () { portal.setAttribute('hidden', ''); }, 520);
  }

  Array.prototype.forEach.call(cards, function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      choose(a, a.getAttribute('href'));
    });
  });

  var skip = document.getElementById('portalSkip');
  if (skip) skip.addEventListener('click', function () { close(null); });

  // ESC închide overlay-ul (accesibilitate)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !portal.classList.contains('is-out')) close(null);
  });

  // Afișează (markup-ul are `hidden` ca să nu pâlpâie / să degradeze fără JS).
  portal.removeAttribute('hidden');
})();
