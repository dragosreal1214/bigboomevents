/* portal.js — ecranul de start de pe homepage.
   NU mai e overlay modal: secțiunea stă în pagină, sub meniu (vezi index.html +
   `.portal` din styles.css), deci meniul și antetul se văd din prima și apare
   la FIECARE intrare pe homepage — inclusiv la navigare internă sau Back.
   Fișierul adaugă doar comportamentul: animația de alegere, parallax-ul discret
   și butonul care coboară la restul paginii. Fără JS, secțiunea funcționează ca
   un set normal de link-uri.
   Încărcat doar pe homepage (înaintea lui app.js, ca elementul LCP să apară imediat). */
(function () {
  var portal = document.getElementById('portal');
  if (!portal) return;

  // Curăță starea animației de alegere (veil + clase). Necesară la Back din
  // bfcache: pagina e restaurată exact cum a fost părăsită, deci cu culoarea
  // categoriei încă întinsă peste ecran.
  function cleanupVeil() {
    var v = portal.querySelector('.portal-veil');
    if (v && v.parentNode) v.parentNode.removeChild(v);
    portal.classList.remove('is-choosing');
    var picked = portal.querySelector('.choice.is-picked');
    if (picked) picked.classList.remove('is-picked');
    busy = false;
  }

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { cleanupVeil(); document.body.classList.remove('menu-open'); }
  });

  var cards = portal.querySelectorAll('.choice');

  // Rescrie link-urile cu URL-urile absolute din BBE (evită un redirect pe prod).
  // portal.js rulează ÎNAINTEA lui app.js, deci la primul apel BBE poate lipsi —
  // reîncercăm după ce app.js rulează (setTimeout 0). Fără BBE, cardurile
  // păstrează href-urile relative, care funcționează ca fallback.
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

  // „Mergi direct la site" nu mai închide un overlay — coboară la restul
  // homepage-ului, care acum e sub secțiune.
  var skip = document.getElementById('portalSkip');
  if (skip) {
    skip.addEventListener('click', function () {
      var next = portal.nextElementSibling;
      if (!next) return;
      try { next.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }
      catch (e) { next.scrollIntoView(); }
    });
  }

  cleanupVeil();
})();
