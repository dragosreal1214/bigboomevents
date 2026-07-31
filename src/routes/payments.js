import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, notFound, badRequest } from '../utils/http.js';
import { parseOrThrow } from '../validation.js';
import { getOrderByNumber, setPaymentRef } from '../models/orders.js';
import { startCardPayment, webhookToken } from '../services/payment.js';
import config from '../config.js';

const router = Router();

const createSchema = z.object({
  orderNumber: z.string().trim().min(3).max(40),
});

// POST /api/payments/create — pornește sesiunea de plată pentru o comandă existentă
router.post(
  '/payments/create',
  asyncHandler(async (req, res) => {
    const { orderNumber } = parseOrThrow(createSchema, req.body);
    const result = await getOrderByNumber(orderNumber);
    if (!result) throw notFound('Comandă inexistentă');
    const { order, items } = result;

    if (order.payment_method !== 'card') {
      throw badRequest('Comanda nu este cu plată card.');
    }
    if (order.status !== 'pending') {
      throw badRequest('Comanda nu mai poate fi plătită.');
    }

    // URL-uri curate, pe host-ul magazinului (acolo e pagina de mulțumire).
    const returnUrl = `${config.shopUrl}/multumim?order=${encodeURIComponent(order.order_number)}`;
    const cancelUrl = `${config.shopUrl}/checkout`;
    // Tokenul din notifyUrl ne apără suplimentar în modul mock; în modul real,
    // sursa de adevăr e semnătura JWT a Netopia peste body.
    const confirmUrl = `${config.publicUrl}/api/webhooks/payment?t=${webhookToken(order.order_number)}`;

    const { paymentUrl, paymentRef, mock } = await startCardPayment({
      order,
      items,
      returnUrl,
      cancelUrl,
      confirmUrl,
      browser: {
        userAgent: req.get('user-agent') || '',
        ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim(),
      },
    });

    // ntpID-ul Netopia (referința tranzacției) — util pentru reconciliere/suport.
    await setPaymentRef(order.order_number, paymentRef);

    res.json({ paymentUrl, mock });
  })
);

export default router;
