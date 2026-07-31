/* category-landing.js — încarcă produsele reprezentative pe paginile de categorie
   (/florarie, /baloane). Categoria vine din <body data-category="...">. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', async () => {
    const { API, cardHTML, skeletons, bindCards } = window.BBE;
    const box = document.querySelector('[data-featured]');
    if (!box) return;
    const cat = document.body.dataset.category || '';
    box.innerHTML = skeletons(3);
    try {
      const { items } = await API.get(
        `/products?category=${encodeURIComponent(cat)}&sort=nou&pageSize=6`
      );
      box.innerHTML =
        items.map(cardHTML).join('') ||
        '<div class="empty-state">Momentan nu sunt produse.</div>';
      bindCards(box);
    } catch (e) {
      box.innerHTML =
        '<div class="empty-state">Nu am putut încărca produsele. Reîncarcă pagina.</div>';
    }
  });
})();
