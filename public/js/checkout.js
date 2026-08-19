/* checkout.js — sumar coș + plasare comandă + redirect plată/mulțumire. */
(function () {
  'use strict';
  const { API, Cart, esc, fmt, toast, catClass } = window.BBE;

  const FREE_SHIPPING = 500; // lei — trebuie să rămână egal cu FREE_SHIPPING_THRESHOLD din src/models/orders.js
  const SHIPPING_FEE = 25; // lei

  function shippingCents(subCents) {
    return subCents >= FREE_SHIPPING * 100 ? 0 : SHIPPING_FEE * 100;
  }

  const unitCents = (it) => (Number.isFinite(it.priceCents) ? it.priceCents : Math.round(it.price * 100));
  const findLine = (id) => Cart.items().find((it) => String(it.id) === String(id));

  // O linie de cos in sumar: poza, pret unitar, cantitate si stergere.
  // ATENTIE: butoanele au OBLIGATORIU type="button". Sumarul e INAUNTRUL
  // formularului de comanda, iar un <button> fara type e implicit `submit` —
  // fara el, un click pe „+" ar plasa comanda.
  function lineHTML(it) {
    const unit = unitCents(it);
    return `
      <div class="ci ci-sum">
        <div class="sw ${catClass(it.cat)}" ${it.image ? `style="background-image:url('${esc(it.image)}')"` : ''}></div>
        <div class="info">
          <div class="nm">${esc(it.name)}</div>
          <div class="pr">${fmt(unit)} / buc</div>
          <button class="rm" type="button" data-rm="${it.id}">Șterge</button>
        </div>
        <div class="ci-right">
          <div class="ci-total">${fmt(unit * it.qty)}</div>
          <div class="qty">
            <button type="button" data-id="${it.id}" data-d="-1" aria-label="Scade cantitatea">−</button>
            <span>${it.qty}</span>
            <button type="button" data-id="${it.id}" data-d="1" aria-label="Crește cantitatea">+</button>
          </div>
        </div>
      </div>`;
  }

  // Delegare pe container: se leaga o singura data, supravietuieste re-randarii.
  // Modificarile trec prin Cart, care salveaza in localStorage si emite
  // `bbe:cart` — deci sumarul, cosul din drawer si contorul din nav raman
  // sincronizate fara cod suplimentar aici.
  function bindSummaryEdit() {
    const box = document.querySelector('[data-summary-lines]');
    if (!box) return;
    box.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) {
        const line = findLine(rm.dataset.rm);
        Cart.remove(rm.dataset.rm);
        if (line) toast(`„${line.name}" a fost scos din coș.`);
        return;
      }
      const q = e.target.closest('button[data-d]');
      if (!q) return;
      const delta = Number(q.dataset.d);
      const before = findLine(q.dataset.id);
      Cart.change(q.dataset.id, delta);
      const after = findLine(q.dataset.id);
      if (before && !after) { toast(`„${before.name}" a fost scos din coș.`); return; }
      // Cart.setQty plafoneaza pe stocul real in tacere; fara mesaj, clientul
      // apasa „+" si nu intelege de ce nu creste cantitatea.
      if (before && after && before.qty === after.qty && delta > 0) {
        toast(`Atât mai avem pe stoc: ${after.qty} buc.`);
      }
    });
  }

  function renderSummary() {
    const items = Cart.items();
    const form = document.querySelector('[data-checkout-form]');
    const empty = document.querySelector('[data-empty]');
    if (!items.length) {
      form.hidden = true; empty.hidden = false;
      document.querySelector('[data-summary-lines]').innerHTML = '';
      return;
    }
    form.hidden = false; empty.hidden = true;

    document.querySelector('[data-summary-lines]').innerHTML = items.map(lineHTML).join('');

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
      billingType: form.elements['billingType']?.value || 'person',
      company: {
        name: f('companyName'), cui: f('companyCui'),
        regCom: f('companyRegCom'), address: f('companyAddress'),
      },
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

  // Plata cu cardul se afiseaza DOAR daca serverul o raporteaza disponibila.
  // Porneste ascunsa in HTML: daca apelul pica, clientul vede doar ramburs —
  // mai bine decat sa aleaga cardul si sa primeasca eroare dupa ce comanda
  // a fost deja creata.
  async function revealCardOption() {
    const box = document.querySelector('[data-pay-card]');
    if (!box) return;
    try {
      const m = await API.get('/payment-methods');
      if (m && m.card) box.hidden = false;
    } catch { /* ramane ascunsa */ }
  }

  // Comutator facturare: câmpurile de firmă apar doar la „Firmă". Marcăm și
  // `required` dinamic, ca validarea nativă a browserului să nu blocheze
  // trimiterea când blocul e ascuns.
  function bindBillingToggle(form) {
    const box = form.querySelector('[data-company-fields]');
    if (!box) return;
    const apply = () => {
      const isCompany = form.elements['billingType']?.value === 'company';
      box.hidden = !isCompany;
      ['companyName', 'companyCui'].forEach((n) => {
        const el = form.elements[n];
        if (el) el.required = isCompany;
      });
      form.querySelectorAll('[data-bill-option]').forEach((l) =>
        l.classList.toggle('sel', l.querySelector('input').checked)
      );
    };
    form.querySelectorAll('[data-bill-option] input').forEach((r) => r.addEventListener('change', apply));
    apply();
  }

  document.addEventListener('DOMContentLoaded', () => {
    revealCardOption();
    renderSummary();
    bindSummaryEdit();
    document.addEventListener('bbe:cart', renderSummary);

    const form = document.querySelector('[data-checkout-form]');
    prefillMeta(form);

    // stilizare radio selectat
    bindBillingToggle(form);
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
