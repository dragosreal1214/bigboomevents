// Șabloane de email (HTML simplu, inline styles — compatibil cu clienții de mail).
import { formatLei } from '../utils/money.js';
import config from '../config.js';

// Escapare HTML: numele, notele, textul de felicitare și mesajul din formular
// vin de la client — fără asta, oricine putea injecta markup în inboxul adminului.
const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Dată livrare (DATE din pg) → format RO scurt; gol dacă lipsește.
const fmtDate = (d) => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return String(d); }
};

const shell = (title, inner) => `<!DOCTYPE html>
<html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#FBF6F4;font-family:Arial,Helvetica,sans-serif;color:#3B2E3A">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="text-align:center;padding:16px 0 24px">
      <span style="font-size:22px;font-weight:bold;letter-spacing:-.02em">BigBoom<span style="color:#EFB6C8">Events</span></span>
    </div>
    <div style="background:#fff;border:1px solid #ECE1E5;border-radius:16px;padding:28px">
      <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
      ${inner}
    </div>
    <p style="text-align:center;color:#6F6270;font-size:12px;margin-top:20px">
      The Big Boom Events · <a href="${config.publicUrl}" style="color:#6F6270">${config.publicUrl.replace(/^https?:\/\//, '')}</a>
    </p>
  </div>
</body></html>`;

const itemsTable = (items) => `
  <table style="width:100%;border-collapse:collapse;margin:8px 0 16px">
    ${items
      .map(
        (it) => `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #ECE1E5">${esc(it.product_name)} × ${it.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #ECE1E5;text-align:right">${formatLei(it.line_cents)}</td>
        </tr>`
      )
      .join('')}
  </table>`;

// ─── Confirmare comandă pentru client ───
export function orderConfirmationToCustomer(order, items) {
  const payLabel = order.payment_method === 'card' ? 'Card online' : 'Ramburs (la livrare)';
  const inner = `
    <p>Salut, ${esc(order.customer_name)}! Îți mulțumim pentru comandă. 🎈</p>
    <p>Comanda <strong>${order.order_number}</strong> a fost înregistrată.</p>
    ${itemsTable(items)}
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:4px 0;color:#6F6270">Subtotal</td><td style="text-align:right">${formatLei(order.subtotal_cents)}</td></tr>
      <tr><td style="padding:4px 0;color:#6F6270">Livrare</td><td style="text-align:right">${order.shipping_cents ? formatLei(order.shipping_cents) : 'Gratuită'}</td></tr>
      <tr><td style="padding:8px 0;font-weight:bold;font-size:18px">Total</td><td style="text-align:right;font-weight:bold;font-size:18px">${formatLei(order.total_cents)}</td></tr>
    </table>
    <p style="margin-top:16px">Metodă de plată: <strong>${payLabel}</strong></p>
    <p>Livrare la: ${esc(order.ship_address)}, ${esc(order.ship_city)}, ${esc(order.ship_county)}</p>
    ${order.delivery_date ? `<p>Livrare dorită: <strong>${fmtDate(order.delivery_date)}${order.delivery_slot ? ` · ${esc(order.delivery_slot)}` : ''}</strong></p>` : ''}
    ${order.gift_message ? `<p>Mesaj felicitare: „${esc(order.gift_message)}"</p>` : ''}
    ${companyBlock(order)}
    <p style="color:#6F6270;font-size:13px">Te contactăm în curând pentru confirmarea detaliilor.</p>
    <p style="color:#9A8E98;font-size:12px;margin-top:18px">Acesta este un mesaj automat — te rugăm să nu răspunzi la acest email. Pentru orice întrebare, sună-ne la <a href="tel:+40755436904" style="color:#9A8E98">0755 436 904</a>.</p>`;
  return {
    subject: `Comanda ${order.order_number} · The Big Boom Events`,
    html: shell('Comanda ta a fost primită', inner),
    text: `Comanda ${order.order_number} primită. Total ${formatLei(order.total_cents)}.`,
  };
}

// Datele de facturare, doar pentru comenzile pe firmă (altfel string gol).
// Ies în ambele emailuri: clientul vede pe ce firmă se emite factura, iar
// contabilitatea are CUI-ul fără să mai intre în panou.
function companyBlock(order) {
  if (order.billing_type !== 'company' || !order.company_name) return '';
  const line = [
    `<strong>${esc(order.company_name)}</strong>`,
    `CUI ${esc(order.company_cui || '')}`,
    order.company_reg_com ? `Reg. Com. ${esc(order.company_reg_com)}` : '',
    order.company_address ? esc(order.company_address) : '',
  ].filter(Boolean).join(' · ');
  return `<p style="margin-top:12px">🧾 Factură pe firmă: ${line}</p>`;
}

// ─── Notificare comandă nouă pentru admin ───
export function orderNotificationToAdmin(order, items) {
  const inner = `
    <p><strong>Comandă nouă:</strong> ${order.order_number}</p>
    <p>${esc(order.customer_name)} · ${esc(order.customer_phone)} · ${esc(order.customer_email)}</p>
    ${itemsTable(items)}
    <p><strong>Total: ${formatLei(order.total_cents)}</strong> · ${order.payment_method === 'card' ? 'Card' : 'Ramburs'}</p>
    <p>Adresă: ${esc(order.ship_address)}, ${esc(order.ship_city)}, ${esc(order.ship_county)} ${order.ship_postcode || ''}</p>
    ${order.delivery_date ? `<p><strong>Livrare dorită: ${fmtDate(order.delivery_date)}${order.delivery_slot ? ` · ${esc(order.delivery_slot)}` : ''}</strong></p>` : ''}
    ${order.gift_message ? `<p>📝 Felicitare: „${esc(order.gift_message)}"</p>` : ''}
    ${companyBlock(order)}
    ${order.notes ? `<p>Mențiuni: ${esc(order.notes)}</p>` : ''}`;
  return {
    subject: `🛒 Comandă nouă ${order.order_number} — ${formatLei(order.total_cents)}`,
    html: shell('Comandă nouă', inner),
    text: `Comandă nouă ${order.order_number}, total ${formatLei(order.total_cents)}.`,
  };
}

// ─── Confirmare lead pentru client ───
export function leadConfirmationToCustomer(lead) {
  const inner = `
    <p>Salut, ${esc(lead.name)}!</p>
    <p>Am primit cererea ta de ofertă și revenim cu un răspuns cât de curând.</p>
    ${lead.event_date ? `<p>Data evenimentului: <strong>${lead.event_date}</strong></p>` : ''}
    ${lead.event_type ? `<p>Tip eveniment: <strong>${esc(lead.event_type)}</strong></p>` : ''}
    <p style="color:#6F6270;font-size:13px">Dacă e ceva urgent, ne poți suna direct.</p>`;
  return {
    subject: 'Am primit cererea ta · The Big Boom Events',
    html: shell('Mulțumim pentru cerere', inner),
    text: 'Am primit cererea ta de ofertă. Revenim curând.',
  };
}

// ─── Notificare lead nou pentru admin ───
export function leadNotificationToAdmin(lead) {
  const inner = `
    <p><strong>Lead nou (cerere ofertă)</strong></p>
    <p>${esc(lead.name)} · ${esc(lead.email)} ${lead.phone ? '· ' + lead.phone : ''}</p>
    ${lead.event_date ? `<p>Data: ${lead.event_date}</p>` : ''}
    ${lead.event_type ? `<p>Tip: ${esc(lead.event_type)}</p>` : ''}
    ${lead.message ? `<p>Mesaj: ${esc(lead.message)}</p>` : ''}`;
  return {
    subject: `✨ Lead nou — ${esc(lead.name)}`,
    html: shell('Lead nou', inner),
    text: `Lead nou de la ${esc(lead.name)} (${esc(lead.email)}).`,
  };
}
