import { Router } from 'express';
import { asyncHandler } from '../utils/http.js';
import { parseOrThrow, createLeadSchema } from '../validation.js';
import { createLead } from '../models/leads.js';
import { sendEmail } from '../services/email.js';
import {
  leadConfirmationToCustomer,
  leadNotificationToAdmin,
} from '../services/templates.js';
import { notifyTelegram, tgEscape } from '../services/notify.js';
import config from '../config.js';

const router = Router();

// POST /api/leads — formularul „cere o ofertă"
router.post(
  '/leads',
  asyncHandler(async (req, res) => {
    const data = parseOrThrow(createLeadSchema, req.body);

    // Honeypot: dacă „website" e completat, e bot → pretindem succes, nu salvăm.
    if (data.website) {
      return res.status(201).json({ ok: true });
    }

    const lead = await createLead(data);

    // Email-uri + notificare (nu blochează răspunsul dacă pică).
    const adminMail = leadNotificationToAdmin(lead);
    const custMail = leadConfirmationToCustomer(lead);
    Promise.allSettled([
      sendEmail({ to: config.email.admin, ...adminMail }),
      sendEmail({ to: lead.email, ...custMail }),
      notifyTelegram(`✨ <b>Lead nou</b>: ${tgEscape(lead.name)} (${tgEscape(lead.email)})`),
    ]).catch(() => {});

    res.status(201).json({ ok: true, id: lead.id });
  })
);

export default router;
