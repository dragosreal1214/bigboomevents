import { Router } from 'express';
import express from 'express';
import { asyncHandler } from '../utils/http.js';
import {
  interpretWebhook,
  verifyWebhookToken,
  verifyIpnSignature,
} from '../services/payment.js';
import {
  getOrderByNumber,
  markPaid,
  markFailed,
  markRefunded,
} from '../models/orders.js';
import { sendEmail } from '../services/email.js';
import {
  orderConfirmationToCustomer,
  orderNotificationToAdmin,
} from '../services/templates.js';
import { notifyTelegram } from '../services/notify.js';
import { formatLei } from '../utils/money.js';
import config from '../config.js';

const router = Router();

// Netopia semnează IPN-ul cu un JWT peste body-ul BRUT. Dacă express.json()
// îl parsează și re-serializează, hash-ul din semnătură nu se mai potrivește.
// De aceea ruta primește body-ul ca Buffer (express.raw), montat DOAR aici.
const rawJson = express.raw({ type: '*/*', limit: '100kb' });

// Răspunsul cerut de Netopia. errorType 1 = eroare temporară → Netopia
// retrimite IPN-ul; 2 = permanentă, nu retrimite; 0 = OK.
function netopiaAck(res, { errorType = 0, errorCode = null, errorMessage = '' } = {}) {
  return res.status(200).json({ errorType, errorCode, errorMessage });
}

// POST /api/webhooks/payment — confirmare server-to-server de la procesator.
// SURSA DE ADEVĂR pentru „plătit". Trebuie să răspundă 200 rapid și să fie idempotent.
router.post(
  '/webhooks/payment',
  rawJson,
  asyncHandler(async (req, res) => {
    const netopiaMode = config.netopia.configured;

    // Body-ul e Buffer (din express.raw). Îl parsăm o singură dată.
    const rawBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    let body;
    try { body = JSON.parse(rawBuf.toString('utf8') || '{}'); } catch { body = {}; }

    // ── Autentificare ──────────────────────────────────────────
    if (netopiaMode) {
      // Real: JWT semnat de Netopia peste body-ul brut (semnătura RSA).
      const sig = verifyIpnSignature(rawBuf, req.get('Verification-token'));
      if (!sig.ok) {
        // 200 + errorType 2 (nu retrimite) — plugin-ul oficial răspunde tot 200.
        return netopiaAck(res, { errorType: 2, errorCode: sig.errorCode, errorMessage: sig.reason });
      }
    } else {
      // Mock: tokenul HMAC legat de comandă, pus în notifyUrl la pornirea plății.
      const token = req.query.t || body?.t || req.get('x-webhook-token');
      const orderNo = body?.orderNumber;
      if (!verifyWebhookToken(orderNo, Array.isArray(token) ? token[0] : token)) {
        return res.status(401).json({ error: 'Neautorizat' });
      }
    }

    const { orderNumber, paymentRef, status, amountCents } = interpretWebhook(body);

    if (!orderNumber || typeof orderNumber !== 'string' || orderNumber.length > 64) {
      return netopiaMode
        ? netopiaAck(res, { errorType: 2, errorCode: 0x10000107, errorMessage: 'orderID lipsă' })
        : res.status(400).json({ error: 'orderNumber lipsește' });
    }

    // ── Reconciliere sumă: nu marcăm plătit dacă suma diferă de comandă ──
    if (status === 'paid' && amountCents != null) {
      const existing = await getOrderByNumber(orderNumber);
      if (existing && existing.order.total_cents !== amountCents) {
        return netopiaAck(res, {
          errorType: 2,
          errorCode: 0x10000107,
          errorMessage: `Sumă diferită: IPN ${amountCents} vs comandă ${existing.order.total_cents}`,
        });
      }
    }

    // ── Aplicare status ────────────────────────────────────────
    if (status === 'paid') {
      const updated = await markPaid(orderNumber, paymentRef);
      if (updated) {
        // Confirmările pleacă abia după confirmarea plății (card).
        const full = await getOrderByNumber(orderNumber);
        if (full) {
          const custMail = orderConfirmationToCustomer(full.order, full.items);
          const adminMail = orderNotificationToAdmin(full.order, full.items);
          Promise.allSettled([
            sendEmail({ to: full.order.customer_email, ...custMail }),
            sendEmail({ to: config.email.admin, ...adminMail }),
            notifyTelegram(
              `💳 <b>Plată confirmată</b> ${orderNumber} — ${formatLei(full.order.total_cents)}`
            ),
          ]).catch(() => {});
        }
      }
    } else if (status === 'refunded') {
      await markRefunded(orderNumber, paymentRef);
    } else if (status === 'failed') {
      await markFailed(orderNumber); // repune stocul, anulează (doar comenzi card)
    }
    // status === 'pending' → încă nu facem nimic, așteptăm un IPN ulterior.

    return netopiaMode ? netopiaAck(res) : res.status(200).json({ received: true });
  })
);

export default router;
