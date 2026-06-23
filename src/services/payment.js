// Serviciu de plată — Netopia Payments (v2 REST).
//
// Notă: API-ul Netopia necesită cont pe firmă (CUI), API key + signature POS și
// pagini legale publicate. Până ai credențialele, serviciul rulează în mod
// „mock" (NETOPIA_API_KEY/SIGNATURE goale) și întoarce un URL local de simulare,
// ca să poți testa tot fluxul de checkout fără bani reali.
//
// Când completezi credențialele în .env, codul lovește endpoint-ul real.
import config from '../config.js';
import { toLei } from '../utils/money.js';

const N = config.netopia;

/**
 * Pornește o sesiune de plată cu cardul.
 * @returns {{ paymentUrl: string, paymentRef: string, mock: boolean }}
 */
export async function startCardPayment({ order, returnUrl, confirmUrl }) {
  // ── Mod mock (fără credențiale) ───────────────────────────────
  if (!N.configured) {
    // Simulăm o referință și trimitem userul către o pagină de simulare
    // care apoi va „confirma" plata prin webhook-ul nostru.
    const paymentRef = `MOCK-${order.order_number}`;
    const paymentUrl = `${config.publicUrl}/checkout-simulare.html?order=${encodeURIComponent(
      order.order_number
    )}&ref=${encodeURIComponent(paymentRef)}`;
    return { paymentUrl, paymentRef, mock: true };
  }

  // ── Mod real (Netopia v2) ─────────────────────────────────────
  // Structura payload-ului urmează documentația Netopia v2 „start".
  const payload = {
    config: {
      emailTemplate: '',
      notifyUrl: confirmUrl, // webhook server-to-server (sursa de adevăr)
      redirectUrl: returnUrl, // unde revine clientul în browser
      language: 'ro',
    },
    payment: {
      options: { installments: 0, bonus: 0 },
      instrument: { type: 'card' },
    },
    order: {
      ntpID: '',
      posSignature: N.posSignature,
      dateTime: new Date().toISOString(),
      description: `Comanda ${order.order_number} BigBoomEvents`,
      orderID: order.order_number,
      amount: toLei(order.total_cents),
      currency: 'RON',
      billing: {
        email: order.customer_email,
        phone: order.customer_phone,
        firstName: order.customer_name,
        lastName: '-',
        city: order.ship_city,
        country: 642, // România (ISO 3166 numeric)
        state: order.ship_county,
        postalCode: order.ship_postcode || '000000',
        details: order.ship_address,
      },
    },
  };

  const res = await fetch(`${N.baseUrl}/payment/card/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: N.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Netopia start ${res.status}: ${body}`);
  }

  const data = await res.json();
  // Răspunsul conține fie un URL de redirect, fie date pentru 3DS.
  const paymentUrl =
    data?.payment?.paymentURL || data?.customerAction?.url || data?.redirectUrl;
  const paymentRef = data?.payment?.ntpID || data?.ntpID || order.order_number;

  if (!paymentUrl) {
    throw new Error('Netopia: lipsește URL-ul de plată din răspuns');
  }
  return { paymentUrl, paymentRef, mock: false };
}

/**
 * Verifică/validează un webhook de la Netopia.
 * În mod real ar trebui verificată semnătura (din header) cu cheia publică Netopia.
 * Întoarce statusul normalizat: 'paid' | 'pending' | 'failed'.
 */
export function interpretWebhook(body) {
  // Mock: body = { ref, orderNumber, status }
  if (!N.configured) {
    const status = body?.status === 'paid' ? 'paid' : body?.status === 'failed' ? 'failed' : 'pending';
    return { orderNumber: body?.orderNumber, paymentRef: body?.ref, status };
  }

  // Real (Netopia v2): structura conține order.orderID și payment.status (cod numeric).
  // Coduri uzuale: 3 = paid/confirmed, 5 = paid, 12 = pending, alt = failed.
  const orderNumber = body?.order?.orderID;
  const paymentRef = body?.payment?.ntpID;
  const code = Number(body?.payment?.status);
  let status = 'pending';
  if ([3, 5].includes(code)) status = 'paid';
  else if (code === 12 || code === 1 || code === 15) status = 'pending';
  else status = 'failed';
  return { orderNumber, paymentRef, status };
}
