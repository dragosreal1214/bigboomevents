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
      // O plată eșuată ajunge tot aici (redirect de la procesator) — nu-i putem
      // spune clientului „mulțumim pentru comandă" când comanda e anulată.
      const failed = order.status === 'cancelled' || order.status === 'refunded';
      const row = (lbl, val, bold) =>
        `<div style="display:flex;justify-content:space-between;padding:8px 0${bold ? ';font-weight:700;font-size:18px;border-top:1px solid var(--line);margin-top:6px' : ''}"><span>${lbl}</span><span>${val}</span></div>`;
      box.innerHTML = `
        <div style="font-size:54px">${failed ? '💳' : '🎈'}</div>
        <h1>${failed ? 'Plata nu a fost finalizată' : 'Mulțumim pentru comandă!'}</h1>
        <p class="muted">Comanda <strong>${esc(order.number)}</strong> · status: <strong>${statusLabel}</strong></p>
        <p class="muted">${failed
          ? 'Comanda a fost anulată, iar produsele au fost returnate în stoc. Poți relua comanda oricând sau ne poți suna la 0755 436 904.'
          : 'Te contactăm în curând pentru confirmarea detaliilor.'}</p>
        <div style="max-width:480px;margin:26px auto;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px">
          ${items}
          ${order.subtotalCents != null ? row('Subtotal', fmt(order.subtotalCents)) : ''}
          ${order.shippingCents != null ? row('Livrare', order.shippingCents ? fmt(order.shippingCents) : 'Gratuită') : ''}
          ${row('Total', fmt(order.totalCents), true)}
        </div>
        <a class="btn btn-primary" href="${failed ? '/shop' : '/shop'}">${failed ? 'Înapoi la magazin' : 'Continuă cumpărăturile'}</a>`;
    } catch (e) {
      box.innerHTML = '<div style="font-size:54px">🎈</div><h1>Mulțumim!</h1><p class="muted">Comanda a fost primită, dar nu am putut încărca detaliile.</p><a class="btn btn-primary" href="/shop">Înapoi la shop</a>';
    }
  });
})();
