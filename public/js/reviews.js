/* reviews.js — carusel cu recenzii Google pe homepage, afișate în seturi.
   ÎNLOCUIEȘTE array-ul REVIEWS cu recenziile reale (nume + text + stele).
   Sunt statice (CSP interzice widget-uri externe); se editează aici. */
(function () {
  'use strict';

  // Link către profilul Google al afacerii (butonul „Vezi pe Google").
  var PROFILE_URL = 'https://share.google/hiVFwCbRzxBA02Scu';
  var SET_SIZE = 3; // câte recenzii pe un set/slide

  // Recenzii reale de pe Google (THE BIG BOOM EVENTS).
  var REVIEWS = [
    { name: 'Andrei Ungureanu', stars: 5, text: 'Foarte amabilă și profesionistă Oana. M-a rezolvat în 2 zile cu cererea de sistem de baloane pentru evenimentul brandului soției. Mulțumim Oana! O recomandăm și pe consultanța de evenimente!' },
    { name: 'Carmen Zaharia', stars: 5, text: 'Vrei să-i vibreze sufletul de bucurie și emoție? Mergeți la FLORĂRIA BOOM BOOM, aici timpul se oprește ca să ai timp să trăiești frumusețea!' },
    { name: 'NTS', stars: 5, text: 'Am apelat destul de din scurt pentru ajutor cu cererea în căsătorie și totul a ieșit perfect, mulțumim pentru profesionalism și promptitudine, recomandăm cu drag!' },
    { name: 'Pastramă Ștefan Claudiu', stars: 5, text: 'Una dintre cele mai bune și serioase firme de decorațiuni pentru evenimente din Iași! Recomand cu încredere!' },
    { name: 'Daniela Cojocaru', stars: 5, text: 'Cochet, îngrijit, personal prietenos și receptiv.' },
  ];

  var root = document.querySelector('[data-reviews]');
  if (!root || !REVIEWS.length) { var b = document.querySelector('.reviews-band'); if (b) b.hidden = true; return; }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function stars(n) {
    return '<span class="rv-stars" aria-label="' + n + ' din 5">' +
      '★★★★★'.slice(0, n) + '<span class="rv-star-empty">' + '☆☆☆☆☆'.slice(0, 5 - n) + '</span></span>';
  }
  function card(r) {
    return '<figure class="rv-card">' + stars(r.stars || 5) +
      '<blockquote class="rv-text">“' + esc(r.text) + '”</blockquote>' +
      '<figcaption class="rv-name">' + esc(r.name) + ' <span class="rv-src">· Google</span></figcaption></figure>';
  }

  // împarte în seturi
  var sets = [];
  for (var i = 0; i < REVIEWS.length; i += SET_SIZE) sets.push(REVIEWS.slice(i, i + SET_SIZE));

  root.innerHTML =
    '<div class="rv-track">' +
    sets.map(function (grp, i) {
      return '<div class="rv-set' + (i === 0 ? ' is-active' : '') + '">' + grp.map(card).join('') + '</div>';
    }).join('') +
    '</div>' +
    (sets.length > 1 ? '<div class="rv-dots">' + sets.map(function (_, i) {
      return '<button class="rv-dot' + (i === 0 ? ' is-active' : '') + '" type="button" data-go="' + i + '" aria-label="Setul ' + (i + 1) + '"></button>';
    }).join('') + '</div>' : '') +
    '<a class="rv-more" href="' + PROFILE_URL + '" target="_blank" rel="noopener">Vezi recenziile pe Google →</a>';

  var slides = root.querySelectorAll('.rv-set');
  var dots = root.querySelectorAll('.rv-dot');
  var cur = 0;
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function show(i) {
    slides[cur].classList.remove('is-active');
    if (dots[cur]) dots[cur].classList.remove('is-active');
    cur = (i + slides.length) % slides.length;
    slides[cur].classList.add('is-active');
    if (dots[cur]) dots[cur].classList.add('is-active');
  }

  dots.forEach(function (d) { d.addEventListener('click', function () { show(Number(d.dataset.go)); restart(); }); });

  var timer = null;
  function restart() {
    if (reduce || slides.length < 2) return;
    clearInterval(timer);
    timer = setInterval(function () { show(cur + 1); }, 6000);
  }
  restart();
})();
