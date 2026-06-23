/* leadform.js — trimite formularul „cere o ofertă" / contact către /api/leads. */
(function () {
  'use strict';
  const { API } = window.BBE;

  function bindLeadForm(form) {
    const okBox = form.querySelector('[data-lead-ok]');
    const errBox = form.querySelector('[data-lead-error]');
    const submit = form.querySelector('[data-lead-submit]');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      form.querySelectorAll('[data-err]').forEach((el) => (el.textContent = ''));
      form.querySelectorAll('.field.has-error').forEach((el) => el.classList.remove('has-error'));
      if (okBox) okBox.hidden = true;
      if (errBox) errBox.hidden = true;

      const f = (n) => form.elements[n]?.value.trim() || '';
      const payload = {
        name: f('name'), email: f('email'), phone: f('phone'),
        eventDate: f('eventDate'), eventType: f('eventType'),
        message: f('message'), website: f('website'), // honeypot
        acceptTerms: true,
      };

      const original = submit.textContent;
      submit.disabled = true; submit.textContent = 'Se trimite…';
      try {
        await API.post('/leads', payload);
        form.reset();
        if (okBox) { okBox.hidden = false; okBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      } catch (err) {
        if (Array.isArray(err.details)) {
          err.details.forEach((d) => {
            const el = form.querySelector(`[data-err="${CSS.escape(d.field)}"]`);
            if (el) { el.textContent = d.message; el.closest('.field')?.classList.add('has-error'); }
          });
        }
        if (errBox) { errBox.textContent = err.message || 'Eroare la trimitere. Încearcă din nou.'; errBox.hidden = false; }
      } finally {
        submit.disabled = false; submit.textContent = original;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-lead-form]').forEach(bindLeadForm);
  });
})();
