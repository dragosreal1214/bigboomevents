import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, notFound, badRequest } from '../utils/http.js';
import { parseOrThrow } from '../validation.js';
import { getOrderByNumber, setPaymentRef } from '../models/orders.js';
import { startCardPayment } from '../services/payment.js';
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
    const { order } = result;

    if (order.payment_method !== 'card') {
      throw badRequest('Comanda nu este cu plată card.');
    }
    if (order.status !== 'pending') {
      throw badRequest('Comanda nu mai poate fi plătită.');
    }

    const returnUrl = `${config.publicUrl}/multumim.html?order=${encodeURIComponent(
      order.order_number
    )}`;
    const confirmUrl = `${config.publicUrl}/api/webhooks/payment`;

    const { paymentUrl, paymentRef, mock } = await startCardPayment({
      order,
      returnUrl,
      confirmUrl,
    });

    await setPaymentRef(order.order_number, paymentRef);

    res.json({ paymentUrl, mock });
  })
);

export default router;
