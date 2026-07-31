// Serviciu de plată — NETOPIA Payments API v2 (REST, „hosted page").
//
// Fluxul ales: NU atingem datele cardului. Trimitem doar `instrument.type`,
// primim `payment.paymentURL` și redirecționăm clientul pe pagina Netopia,
// care face inclusiv 3-D Secure. Așa nu intrăm sub incidența PCI DSS.
//
// Sursa de adevăr pentru „plătit" este notificarea server-to-server (IPN) pe
// `notifyUrl`, NU redirectul din browser — redirectul poate fi închis, refăcut
// sau falsificat de client.
//
// Fără credențiale în .env (NETOPIA_API_KEY + NETOPIA_POS_SIGNATURE) serviciul
// rulează în mod „mock": întoarce o pagină locală de simulare, ca fluxul de
// checkout să fie testabil integral fără bani reali.
import crypto from 'node:crypto';
import config from '../config.js';
import { toLei } from '../utils/money.js';

const N = config.netopia;

// ─────────────────────────────────────────────────────────────
//  Token propriu pe notifyUrl (apărare suplimentară)
// ─────────────────────────────────────────────────────────────
/**
 * Token HMAC legat de o singură comandă. Îl punem în `notifyUrl`-ul trimis
 * procesatorului; el ni-l dă înapoi la callback. În mod mock e singura dovadă
 * că notificarea e legitimă (numerele de comandă sunt secvențiale, deci fără
 * el oricine putea marca orice comandă drept plătită).
 */
export function webhookToken(orderNumber) {
  return crypto.createHmac('sha256', config.secret).update(`wh:${orderNumber}`).digest('hex').slice(0, 32);
}

export function verifyWebhookToken(orderNumber, token) {
  if (!orderNumber || typeof token !== 'string') return false;
  const expected = Buffer.from(webhookToken(orderNumber));
  const got = Buffer.from(token);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

// ─────────────────────────────────────────────────────────────
//  Start plată
// ─────────────────────────────────────────────────────────────

// `orderID` e irevocabil unic per POS la Netopia: o comandă respinsă nu poate
// fi reîncercată cu același ID (eroare 56). Adăugăm un sufix aleator și
// recuperăm numărul intern la IPN, tăind după `_` (numerele noastre de comandă
// nu conțin niciodată `_`). Acesta e pattern-ul din plugin-ul oficial.
export function buildNetopiaOrderId(orderNumber) {
  return `${orderNumber}_${crypto.randomBytes(4).toString('hex')}`;
}

export function orderNumberFromNetopiaId(netopiaOrderId) {
  return String(netopiaOrderId || '').split('_')[0];
}

/** Împarte numele complet în prenume + nume (Netopia le cere separat). */
function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  if (parts.length < 2) return { firstName: parts[0] || '-', lastName: '-' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * Pornește o sesiune de plată cu cardul.
 * @returns {{ paymentUrl: string, paymentRef: string, netopiaOrderId: string, mock: boolean }}
 */
export async function startCardPayment({ order, items = [], returnUrl, cancelUrl, confirmUrl, browser = {} }) {
  // ── Mod mock (fără credențiale) ───────────────────────────────
  if (!N.configured) {
    const paymentRef = `MOCK-${order.order_number}`;
    const paymentUrl = `${config.shopUrl}/checkout-simulare.html?order=${encodeURIComponent(
      order.order_number
    )}&ref=${encodeURIComponent(paymentRef)}&t=${webhookToken(order.order_number)}`;
    return { paymentUrl, paymentRef, netopiaOrderId: order.order_number, mock: true };
  }

  // ── Mod real (Netopia v2) ─────────────────────────────────────
  const { firstName, lastName } = splitName(order.customer_name);
  const netopiaOrderId = buildNetopiaOrderId(order.order_number);

  // ATENȚIE: `amount` e în LEI ZECIMALI (float), nu în bani. Noi ținem tot în
  // cenți, deci convertim explicit și rotunjim la 2 zecimale.
  const amount = Number(toLei(order.total_cents).toFixed(2));

  const address = {
    email: order.customer_email,
    phone: order.customer_phone,
    firstName,
    lastName,
    city: order.ship_city,
    country: 642, // România, ISO 3166-1 numeric
    countryName: 'Romania',
    state: order.ship_county,
    postalCode: order.ship_postcode || '000000',
    details: order.ship_address,
  };

  const payload = {
    config: {
      emailTemplate: '',
      emailSubject: '',
      notifyUrl: confirmUrl, // IPN server-to-server (sursa de adevăr)
      redirectUrl: returnUrl, // unde revine clientul în browser
      cancelUrl: cancelUrl || returnUrl,
      language: 'ro',
    },
    payment: {
      options: { installments: 0, bonus: 0 },
      // Fără date de card → Netopia procesează pe pagina ei (fără PCI DSS la noi).
      instrument: { type: 'card' },
      data: {
        BROWSER_USER_AGENT: browser.userAgent || '',
        OS: '',
        OS_VERSION: '',
        MOBILE: 'false',
        SCREEN_POINT: 'false',
        BROWSER_COLOR_DEPTH: '24',
        BROWSER_SCREEN_HEIGHT: '1080',
        BROWSER_SCREEN_WIDTH: '1920',
        BROWSER_PLUGINS: '',
        BROWSER_JAVA_ENABLED: 'false',
        BROWSER_LANGUAGE: 'ro-RO',
        BROWSER_TZ: 'Europe/Bucharest',
        BROWSER_TZ_OFFSET: '-180',
        IP_ADDRESS: browser.ip || '',
      },
    },
    order: {
      ntpID: '',
      posSignature: N.posSignature,
      dateTime: new Date().toISOString(),
      description: `Comanda ${order.order_number} The Big Boom Events`,
      orderID: netopiaOrderId,
      amount,
      currency: 'RON',
      billing: address,
      shipping: { ...address, countryName: undefined },
      products: items.map((it) => ({
        name: it.product_name,
        code: String(it.product_id),
        category: 'bigboomevents',
        price: Number(toLei(it.unit_cents).toFixed(2)),
        vat: 0,
      })),
      data: { platform: 'bigboomevents', api: '2.0' },
    },
  };

  const res = await fetch(`${N.baseUrl}/payment/card/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Cheia BRUTĂ, fără „Bearer" — cu prefix primim 401.
      Authorization: N.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = null; }

  if (!res.ok || !data) {
    const detail = data?.message || data?.error?.message || raw.slice(0, 300);
    throw new Error(`Netopia start ${res.status}: ${detail}`);
  }

  const paymentUrl = data?.payment?.paymentURL || data?.customerAction?.url;
  const paymentRef = data?.payment?.ntpID || netopiaOrderId;

  if (!paymentUrl) {
    // `error.message` poate fi „Approved" chiar și când plata NU e finalizată,
    // deci ne uităm la cod, nu la mesaj.
    const code = data?.error?.code;
    throw new Error(`Netopia: lipsește URL-ul de plată (cod ${code || '?'} — ${data?.error?.message || 'necunoscut'})`);
  }

  return { paymentUrl, paymentRef, netopiaOrderId, mock: false };
}

// ─────────────────────────────────────────────────────────────
//  IPN — verificare semnătură + interpretare
// ─────────────────────────────────────────────────────────────

/** base64url → Buffer (JWT-ul Netopia e semnat RS512). */
const b64url = (str) => Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const JWT_ALGOS = { RS512: 'RSA-SHA512', RS384: 'RSA-SHA384', RS256: 'RSA-SHA256' };

/**
 * Verifică headerul `Verification-token` (JWT semnat de Netopia) împotriva
 * body-ului BRUT. Pașii sunt cei din SDK-urile oficiale:
 *   1. JWT valid, semnat cu cheia publică Netopia
 *   2. iss === 'NETOPIA Payments'
 *   3. aud === posSignature-ul nostru (poate veni string sau array)
 *   4. sub === base64(sha512(body brut))  → payload-ul nu a fost modificat
 *
 * IMPORTANT: hash-ul se face pe bytes-ii bruți. Dacă body-ul e parsat și
 * re-serializat de express.json(), hash-ul nu se va potrivi NICIODATĂ.
 *
 * @returns {{ ok: boolean, reason?: string, errorCode?: number }}
 */
export function verifyIpnSignature(rawBody, token) {
  if (!N.publicKey) return { ok: false, reason: 'Cheia publică Netopia nu e configurată', errorCode: 0x10000101 };
  if (!token || typeof token !== 'string') return { ok: false, reason: 'Lipsește Verification-token', errorCode: 0x10000101 };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'Token malformat', errorCode: 0x10000102 };

  let header, claims;
  try {
    header = JSON.parse(b64url(parts[0]).toString('utf8'));
    claims = JSON.parse(b64url(parts[1]).toString('utf8'));
  } catch {
    return { ok: false, reason: 'Token nedecodabil', errorCode: 0x10000102 };
  }
  if (header.typ && header.typ !== 'JWT') return { ok: false, reason: 'typ != JWT', errorCode: 0x10000102 };

  const algo = JWT_ALGOS[header.alg] || JWT_ALGOS.RS512;
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  let sigOk = false;
  try {
    sigOk = crypto.createVerify(algo).update(signed).verify(N.publicKey, b64url(parts[2]));
  } catch (err) {
    return { ok: false, reason: `Verificare semnătură eșuată: ${err.message}`, errorCode: 0x10000102 };
  }
  if (!sigOk) return { ok: false, reason: 'Semnătură invalidă', errorCode: 0x10000102 };

  if (claims.iss !== 'NETOPIA Payments') return { ok: false, reason: 'Emitent necunoscut', errorCode: 0x10000105 };

  const aud = Array.isArray(claims.aud) ? claims.aud[0] : claims.aud;
  if (aud && N.posSignature && aud !== N.posSignature) {
    return { ok: false, reason: 'Audience diferit de POS-ul nostru', errorCode: 0x10000105 };
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && now > Number(claims.exp) + 300) return { ok: false, reason: 'Token expirat', errorCode: 0x10000104 };

  const hash = crypto.createHash('sha512').update(rawBody).digest('base64');
  if (claims.sub && hash !== claims.sub) {
    return { ok: false, reason: 'Payload modificat', errorCode: 0x10000106 };
  }

  return { ok: true };
}

// Coduri de status Netopia v2. Plătit înseamnă DOAR 3 (capturat) sau 5
// (confirmat) — status 1 („new") NU e plată, deși unele SDK-uri sugerează asta.
export const NETOPIA_STATUS = {
  NEW: 1, OPENED: 2, PAID: 3, CANCELED: 4, CONFIRMED: 5, PENDING: 6, SCHEDULED: 7,
  CREDIT: 8, CHARGEBACK_INIT: 9, CHARGEBACK_ACCEPT: 10, ERROR: 11, DECLINED: 12,
  FRAUD: 13, PENDING_AUTH: 14, THREEDS: 15, REVERSED: 17, EXPIRED: 23,
};

/**
 * Normalizează notificarea în { orderNumber, paymentRef, status, amountCents }.
 * status: 'paid' | 'pending' | 'failed' | 'refunded'
 */
export function interpretWebhook(body) {
  // Mod mock: body = { orderNumber, ref, status }
  if (!N.configured) {
    const status = body?.status === 'paid' ? 'paid' : body?.status === 'failed' ? 'failed' : 'pending';
    return { orderNumber: body?.orderNumber, paymentRef: body?.ref, status, amountCents: null };
  }

  const orderNumber = orderNumberFromNetopiaId(body?.order?.orderID);
  const paymentRef = body?.payment?.ntpID;
  const code = Number(body?.payment?.status);
  // `amount` vine în lei zecimali; îl aducem în cenți pentru reconciliere.
  const amountCents =
    body?.payment?.amount != null ? Math.round(Number(body.payment.amount) * 100) : null;

  const S = NETOPIA_STATUS;
  let status = 'pending';
  if (code === S.PAID || code === S.CONFIRMED) status = 'paid';
  else if (code === S.CREDIT || code === S.CHARGEBACK_ACCEPT || code === S.REVERSED) status = 'refunded';
  else if ([S.NEW, S.OPENED, S.PENDING, S.SCHEDULED, S.PENDING_AUTH, S.THREEDS, S.FRAUD].includes(code)) status = 'pending';
  else status = 'failed';

  return { orderNumber, paymentRef, status, amountCents, statusCode: code };
}
