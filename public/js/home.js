/* home.js — încarcă produsele populare pe pagina principală. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', async () => {
    const { API, cardHTML, skeletons, bindCards } = window.BBE;
    const box = document.querySelector('[data-featured]');
    if (!box) return;
    box.innerHTML = skeletons(3);
    try {
      const { items } = await API.get('/products?sort=nou&pageSize=3');
      box.innerHTML = items.map(cardHTML).join('') || '<div class="empty-state">Momentan nu sunt produse.</div>';
      bindCards(box);
    } catch (e) {
      box.innerHTML = '<div class="empty-state">Nu am putut încărca produsele. Reîncarcă pagina.</div>';
    }
  });
})();
