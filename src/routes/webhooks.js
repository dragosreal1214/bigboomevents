import { Router } from 'express';
import { asyncHandler } from '../utils/http.js';
import { interpretWebhook } from '../services/payment.js';
import { getOrderByNumber, markPaid, markFailed } from '../models/orders.js';
import { sendEmail } from '../services/email.js';
import {
  orderConfirmationToCustomer,
  orderNotificationToAdmin,
} from '../services/templates.js';
import { notifyTelegram } from '../services/notify.js';
import { formatLei } from '../utils/money.js';
import config from '../config.js';

const router = Router();

// POST /api/webhooks/payment — confirmare server-to-server de la procesator.
// SURSA DE ADEVĂR pentru „plătit". Trebuie să răspundă 200 rapid.
router.post(
  '/webhooks/payment',
  asyncHandler(async (req, res) => {
    const { orderNumber, paymentRef, status } = interpretWebhook(req.body);

    if (!orderNumber) {
      return res.status(400).json({ error: 'orderNumber lipsește' });
    }

    if (status === 'paid') {
      const updated = await markPaid(orderNumber, paymentRef);
      if (updated) {
        // Trimite confirmările abia după confirmarea plății (card).
        const full = await getOrderByNumber(orderNumber);
        if (full) {
          const custMail = orderConfirmationToCustomer(full.order, full.items);
          const adminMail = orderNotificationToAdmin(full.order, full.items);
          Promise.allSettled([
            sendEmail({ to: full.order.customer_email, ...custMail }),
            sendEmail({ to: config.email.admin, ...adminMail }),
            notifyTelegram(
              `💳 <b>Plată confirmată</b> ${orderNumber} — ${formatLei(
                full.order.total_cents
              )}`
            ),
          ]).catch(() => {});
        }
      }
    } else if (status === 'failed') {
      await markFailed(orderNumber); // repune stocul, anulează
    }
    // status === 'pending' → nu facem nimic, așteptăm un webhook ulterior.

    // Răspuns scurt — procesatorul vrea doar 200.
    res.status(200).json({ received: true });
  })
);

export default router;
