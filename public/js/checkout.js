/* checkout.js — sumar coș + plasare comandă + redirect plată/mulțumire. */
(function () {
  'use strict';
  const { API, Cart, esc, fmt, fmtLei, toast } = window.BBE;

  const FREE_SHIPPING = 250; // lei
  const SHIPPING_FEE = 25; // lei

  function shippingCents(subCents) {
    return subCents >= FREE_SHIPPING * 100 ? 0 : SHIPPING_FEE * 100;
  }

  function renderSummary() {
    const items = Cart.items();
    const form = document.querySelector('[data-checkout-form]');
    const empty = document.querySelector('[data-empty]');
    if (!items.length) {
      form.hidden = true; empty.hidden = false; return;
    }
    form.hidden = false; empty.hidden = true;

    document.querySelector('[data-summary-lines]').innerHTML = items.map((it) => `
      <div class="line"><span>${esc(it.name)} × ${it.qty}</span><span>${fmtLei(it.price * it.qty)}</span></div>`).join('');

    const sub = Cart.subtotalCents();
    const ship = shippingCents(sub);
    document.querySelector('[data-subtotal]').textContent = fmt(sub);
    document.querySelector('[data-shipping]').textContent = ship === 0 ? 'Gratuită' : fmt(ship);
    document.querySelector('[data-grand]').textContent = fmt(sub + ship);
  }

  function clearErrors() {
    document.querySelectorAll('[data-err]').forEach((el) => (el.textContent = ''));
    document.querySelectorAll('.field.has-error').forEach((el) => el.classList.remove('has-error'));
    const box = document.querySelector('[data-form-error]');
    box.hidden = true; box.textContent = '';
  }

  function showErrors(details, message) {
    if (Array.isArray(details)) {
      details.forEach((d) => {
        const el = document.querySelector(`[data-err="${CSS.escape(d.field)}"]`);
        if (el) { el.textContent = d.message; el.closest('.field')?.classList.add('has-error'); }
      });
    }
    const box = document.querySelector('[data-form-error]');
    box.textContent = message || 'Verifică datele introduse.';
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function collect(form) {
    const f = (n) => form.elements[n]?.value.trim() || '';
    return {
      customer: { name: f('name'), email: f('email'), phone: f('phone') },
      shipping: { county: f('county'), city: f('city'), address: f('address'), postcode: f('postcode') },
      paymentMethod: form.elements['paymentMethod'].value,
      notes: f('notes'),
      giftMessage: f('giftMessage'),
      deliveryDate: f('deliveryDate'),
      deliverySlot: f('deliverySlot'),
      website: f('website'), // honeypot
      acceptTerms: form.elements['acceptTerms'].checked,
      items: Cart.items().map((it) => ({ productId: it.id, quantity: it.qty })),
    };
  }

  // Prefill felicitare + livrare din opțiunile salvate pe pagina produsului.
  function prefillMeta(form) {
    const meta = Cart.meta();
    if (meta.giftMessage && form.elements['giftMessage']) form.elements['giftMessage'].value = meta.giftMessage;
    if (meta.deliveryDate && form.elements['deliveryDate']) form.elements['deliveryDate'].value = meta.deliveryDate;
    if (meta.deliverySlot && form.elements['deliverySlot']) form.elements['deliverySlot'].value = meta.deliverySlot;
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderSummary();
    document.addEventListener('bbe:cart', renderSummary);

    const form = document.querySelector('[data-checkout-form]');
    prefillMeta(form);

    // stilizare radio selectat
    form.querySelectorAll('[data-pay-option] input').forEach((r) =>
      r.addEventListener('change', () => {
        form.querySelectorAll('[data-pay-option]').forEach((l) =>
          l.classList.toggle('sel', l.querySelector('input').checked));
      })
    );

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();

      if (!form.elements['acceptTerms'].checked) {
        showErrors([{ field: 'acceptTerms', message: 'Trebuie să accepți termenii.' }], 'Acceptă termenii pentru a continua.');
        return;
      }
      if (Cart.count() === 0) { renderSummary(); return; }

      const submit = form.querySelector('[data-submit]');
      submit.disabled = true;
      const original = submit.textContent;
      submit.textContent = 'Se procesează…';

      try {
        const payload = collect(form);
        const res = await API.post('/orders', payload);
        const number = res.order.number;

        if (payload.paymentMethod === 'card') {
          // pornește sesiunea de plată și redirect
          submit.textContent = 'Redirecționare către plată…';
          const pay = await API.post('/payments/create', { orderNumber: number });
          Cart.clear();
          window.location.href = pay.paymentUrl;
        } else {
          Cart.clear();
          window.location.href = `/multumim?order=${encodeURIComponent(number)}`;
        }
      } catch (err) {
        submit.disabled = false;
        submit.textContent = original;
        showErrors(err.details, err.message);
      }
    });
  });
})();
