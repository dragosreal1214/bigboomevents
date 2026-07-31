import { Router } from 'express';
import { asyncHandler, notFound } from '../utils/http.js';
import { parseOrThrow, createOrderSchema } from '../validation.js';
import { createOrder, getOrderByNumber } from '../models/orders.js';
import { sendEmail } from '../services/email.js';
import {
  orderConfirmationToCustomer,
  orderNotificationToAdmin,
} from '../services/templates.js';
import { notifyTelegram } from '../services/notify.js';
import { formatLei } from '../utils/money.js';
import config from '../config.js';

const router = Router();

// POST /api/orders — creează comanda (validează prețuri/stoc pe server)
router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(createOrderSchema, req.body);

    // Honeypot: câmpul ascuns „website" e completat doar de boți. Pretindem
    // succes (fără comandă reală), ca botul să nu afle care câmp l-a trădat.
    if (data.website) {
      return res.status(201).json({ ok: true, order: { number: 'BBE-0000', total: 0, totalCents: 0, status: 'pending' } });
    }

    const { order, items } = await createOrder(data);

    // Pentru ramburs (cod) trimitem confirmarea imediat.
    // Pentru card, confirmarea „plătit" vine din webhook — dar tot anunțăm că s-a creat.
    if (order.payment_method === 'cod') {
      const custMail = orderConfirmationToCustomer(order, items);
      const adminMail = orderNotificationToAdmin(order, items);
      Promise.allSettled([
        sendEmail({ to: order.customer_email, ...custMail }),
        sendEmail({ to: config.email.admin, ...adminMail }),
        notifyTelegram(
          `🛒 <b>Comandă nouă (ramburs)</b> ${order.order_number} — ${formatLei(
            order.total_cents
          )}`
        ),
      ]).catch(() => {});
    }

    res.status(201).json({
      ok: true,
      order: {
        number: order.order_number,
        total: order.total_cents / 100,
        totalCents: order.total_cents,
        subtotalCents: order.subtotal_cents,
        shippingCents: order.shipping_cents,
        paymentMethod: order.payment_method,
        status: order.status,
      },
    });
  })
);

// GET /api/orders/:number — status comandă (pentru pagina de mulțumire)
router.get(
  '/orders/:number',
  asyncHandler(async (req, res) => {
    const result = await getOrderByNumber(req.params.number);
    if (!result) throw notFound('Comandă inexistentă');
    const { order, items } = result;
    res.json({
      order: {
        number: order.order_number,
        status: order.status,
        paymentMethod: order.payment_method,
        total: order.total_cents / 100,
        totalCents: order.total_cents,
        subtotalCents: order.subtotal_cents,
        shippingCents: order.shipping_cents,
        createdAt: order.created_at,
        items: items.map((it) => ({
          name: it.product_name,
          quantity: it.quantity,
          unitCents: it.unit_cents,
          lineCents: it.line_cents,
        })),
      },
    });
  })
);

export default router;
