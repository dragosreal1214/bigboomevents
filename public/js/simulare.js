/* simulare.js — pagina de simulare plată (mod mock, fără Netopia configurat). */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const { API } = window.BBE;
    const u = new URLSearchParams(location.search);
    const order = u.get('order');
    const ref = u.get('ref');
    document.querySelector('[data-order]').textContent = order || '—';

    async function finish(status) {
      try {
        await API.post('/webhooks/payment', { orderNumber: order, ref, status });
      } catch {}
      window.location.href = `/multumim?order=${encodeURIComponent(order)}`;
    }
    document.querySelector('[data-pay-success]').addEventListener('click', () => finish('paid'));
    document.querySelector('[data-pay-fail]').addEventListener('click', () => finish('failed'));
  });
})();
