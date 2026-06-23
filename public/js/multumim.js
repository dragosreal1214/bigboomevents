/* multumim.js — afișează statusul comenzii pe pagina de mulțumire. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', async () => {
    const { API, esc, fmt } = window.BBE;
    const box = document.querySelector('[data-thankyou]');
    const number = new URLSearchParams(location.search).get('order');

    if (!number) {
      box.innerHTML = '<div style="font-size:54px">🎈</div><h1>Mulțumim!</h1><p class="muted">Comanda ta a fost primită.</p><a class="btn btn-primary" href="/shop">Înapoi la shop</a>';
      return;
    }
    try {
      const { order } = await API.get('/orders/' + encodeURIComponent(number));
      const statusLabel = {
        pending: order.paymentMethod === 'card' ? 'În așteptarea confirmării plății' : 'Înregistrată',
        paid: 'Plătită ✓', processing: 'În pregătire', shipped: 'Expediată',
        delivered: 'Livrată', cancelled: 'Anulată', refunded: 'Rambursată',
      }[order.status] || order.status;
      const items = order.items.map((it) =>
        `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span>${esc(it.name)} × ${it.quantity}</span><span>${fmt(it.lineCents)}</span></div>`).join('');
      box.innerHTML = `
        <div style="font-size:54px">🎈</div>
        <h1>Mulțumim pentru comandă!</h1>
        <p class="muted">Comanda <strong>${esc(order.number)}</strong> · status: <strong>${statusLabel}</strong></p>
        <p class="muted">Ți-am trimis un email de confirmare. Te contactăm în curând pentru detalii.</p>
        <div style="max-width:480px;margin:26px auto;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px">
          ${items}
          <div style="display:flex;justify-content:space-between;padding:12px 0 0;font-weight:700;font-size:18px"><span>Total</span><span>${fmt(order.totalCents)}</span></div>
        </div>
        <a class="btn btn-primary" href="/shop">Continuă cumpărăturile</a>`;
    } catch (e) {
      box.innerHTML = '<div style="font-size:54px">🎈</div><h1>Mulțumim!</h1><p class="muted">Comanda a fost primită, dar nu am putut încărca detaliile.</p><a class="btn btn-primary" href="/shop">Înapoi la shop</a>';
    }
  });
})();
