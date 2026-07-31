/* home.js — produsele populare + parallax pe cardurile-imagine din „Ce facem". */
(function () {
  'use strict';

  // Parallax discret: poza din card se mișcă ușor după cursor (ca pe ecranul de start).
  function initParallax() {
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    if (reduce) return;
    document.querySelectorAll('#directii .choice').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        card.style.setProperty('--px', (dx * 9).toFixed(1) + 'px');
        card.style.setProperty('--py', (dy * 9).toFixed(1) + 'px');
      });
      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--px', '0px');
        card.style.setProperty('--py', '0px');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    initParallax();
    const { API, cardHTML, skeletons, bindCards } = window.BBE;
    const box = document.querySelector('[data-featured]');
    if (!box) return;
    box.innerHTML = skeletons(3);
    // Un buchet real (cu preț și poză) + două pachete de baloane reprezentative.
    const PINNED = ['pachet-baloane-aniversare-1-an', 'pachet-baloane-bride-petrecere-burlacite'];
    try {
      const [flor, ...pinned] = await Promise.all([
        API.get('/products?category=florarie&sort=nou&pageSize=8').catch(() => ({ items: [] })),
        ...PINNED.map((s) => API.get('/products/' + s).then((r) => r.product).catch(() => null)),
      ]);
      // primul buchet cu preț și poză (sar peste TRIO „preț la cerere" / fără imagine)
      const florItems = flor.items || [];
      const bouquet = florItems.find((p) => p.priceCents > 0 && p.images && p.images.length) || florItems[0];
      let items = [bouquet, ...pinned].filter(Boolean);
      // completează până la 3 dacă vreun produs fixat lipsește (ex. încă inactiv)
      if (items.length < 3) {
        const seen = new Set(items.map((p) => p.id));
        const extra = await API.get('/products?category=baloane&sort=nou&pageSize=6').catch(() => ({ items: [] }));
        for (const p of extra.items || []) {
          if (items.length >= 3) break;
          if (!seen.has(p.id)) { items.push(p); seen.add(p.id); }
        }
      }
      box.innerHTML = items.map(cardHTML).join('') || '<div class="empty-state">Momentan nu sunt produse.</div>';
      bindCards(box);
    } catch (e) {
      box.innerHTML = '<div class="empty-state">Nu am putut încărca produsele. Reîncarcă pagina.</div>';
    }
  });
})();
