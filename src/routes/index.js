import { Router } from 'express';
import products from './products.js';
import orders from './orders.js';
import payments from './payments.js';
import webhooks from './webhooks.js';
import leads from './leads.js';
import admin from './admin.js';
import { healthCheck } from '../db.js';
import { asyncHandler } from '../utils/http.js';

const api = Router();

// Health check (pentru pm2 / monitorizare / load balancer)
api.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const db = await healthCheck().catch(() => false);
    res.json({ ok: true, db, ts: new Date().toISOString() });
  })
);

api.use(products);
api.use(orders);
api.use(payments);
api.use(webhooks);
api.use(leads);
api.use(admin);

export default api;
