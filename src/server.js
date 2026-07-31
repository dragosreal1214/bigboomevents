// ═══════════════════════════════════════════════════════════════════
//  BigBoomEvents — server Express
//  - servește API-ul sub /api
//  - servește frontend-ul static din ../public (util în dev; în prod o face nginx)
// ═══════════════════════════════════════════════════════════════════
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

import config from './config.js';
import api from './routes/index.js';
import { apiNotFound, errorHandler } from './middleware/errorHandler.js';
import { close as closeDb } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

// Guard de producție: nu porni cu secrete implicite. Un APP_SECRET default ar
// permite forjarea tokenurilor de admin; o parolă default = acces liber la panou.
if (config.isProd) {
  const problems = [];
  if (!process.env.APP_SECRET || process.env.APP_SECRET === 'dev-secret-change-me') {
    problems.push('APP_SECRET lipsește sau e valoarea implicită');
  }
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'admin') {
    problems.push('ADMIN_PASSWORD lipsește sau e valoarea implicită');
  }
  if (problems.length) {
    console.error('❌ Refuz pornirea în producție cu secrete nesigure:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}

const app = express();

// În spatele nginx (un singur proxy) — pentru IP-uri reale la rate limit.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Securitate. CSP setat permisiv pentru fonturile Google folosite de frontend.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // `mny.ro` = scriptul oficial NETOPIA pentru siglă (obligatoriu pentru
        // aprobarea punctului de vânzare) + SVG-ul siglei, servit tot de acolo.
        scriptSrc: ["'self'", 'https://mny.ro'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://mny.ro'],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(compression());

// CORS doar pentru originile configurate (în prod). Permite cereri same-origin/no-origin.
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || !config.corsOrigins.length || config.corsOrigins.includes(origin)) {
        return cb(null, true);
      }
      // `false`, nu Error: altfel orice cerere cross-origin devine 500 în loc
      // să primească pur și simplu răspuns fără headerul CORS.
      cb(null, false);
    },
  })
);

// Webhook-ul de plată are nevoie de body-ul BRUT (semnătura Netopia se verifică
// pe bytes-ii originali), deci sare peste parserele globale de JSON.
const RAW_BODY_PATHS = ['/api/webhooks/payment'];
const skipRaw = (mw) => (req, res, next) =>
  RAW_BODY_PATHS.includes(req.path) ? next() : mw(req, res, next);
app.use(skipRaw(express.json({ limit: '100kb' })));
app.use(skipRaw(express.urlencoded({ extended: true, limit: '100kb' })));

// Rate limit general pe /api
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Prea multe cereri. Încearcă din nou într-un minut.' },
});

// Rate limit strict pentru scrieri (comenzi, leads) — anti-abuz.
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Prea multe încercări. Așteaptă un minut.' },
});

// Login-ul de admin: brute-force-ul nu trebuie oprit doar de nginx.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Prea multe încercări de autentificare. Încearcă mai târziu.' },
});

app.use('/api', apiLimiter);
// Doar SCRIERILE sunt limitate strict: `GET /api/orders/:number` (pagina de
// mulțumire, reîncărcată de client) nu trebuie să consume din aceeași cotă.
const writesOnly = (req, res, next) =>
  req.method === 'GET' ? next() : writeLimiter(req, res, next);
app.use(['/api/orders', '/api/leads', '/api/payments', '/api/webhooks'], writesOnly);
app.use('/api/admin/login', loginLimiter);

// Sitemap dinamic — mereu la zi cu produsele din DB (se auto-actualizează când
// adaugi/ștergi produse din panou). Include site-ul principal + magazinul.
app.get('/sitemap.xml', async (_req, res) => {
  const MAIN = 'https://thebigboomevents.ro';
  const SHOP = 'https://shop.thebigboomevents.ro';
  const urls = [
    [`${MAIN}/`, '1.0'],
    [`${SHOP}/florarie`, '0.9'], [`${SHOP}/baloane`, '0.9'], [`${SHOP}/shop`, '0.8'],
    [`${MAIN}/decoratiuni`, '0.8'], [`${MAIN}/wedding`, '0.8'], [`${MAIN}/evenimente`, '0.7'],
    [`${MAIN}/decoratiuni/botez`, '0.6'], [`${MAIN}/decoratiuni/nunta`, '0.6'],
    [`${MAIN}/decoratiuni/corporate`, '0.6'], [`${MAIN}/decoratiuni/majorat`, '0.6'],
    [`${MAIN}/decoratiuni/gender-reveal`, '0.6'],
    [`${MAIN}/contact`, '0.5'],
    [`${MAIN}/termeni`, '0.3'], [`${MAIN}/confidentialitate`, '0.3'],
    [`${MAIN}/retur`, '0.3'], [`${MAIN}/cookies`, '0.3'],
    [`${MAIN}/livrare`, '0.3'], [`${MAIN}/anulare`, '0.3'],
  ];
  try {
    const { getSitemapProducts } = await import('./models/products.js');
    const products = await getSitemapProducts();
    for (const p of products) urls.push([`${SHOP}/produs/${encodeURIComponent(p.slug)}`, '0.7', p.updated_at]);
  } catch { /* dacă DB pică, trimitem doar paginile statice */ }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = urls.map(([loc, prio, mod]) =>
    `  <url><loc>${esc(loc)}</loc>${mod ? `<lastmod>${new Date(mod).toISOString().slice(0, 10)}</lastmod>` : ''}<priority>${prio}</priority></url>`
  ).join('\n');
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
  );
});

// Montează API-ul
app.use('/api', api);
app.use('/api', apiNotFound);

// Frontend static (în producție îl servește nginx, dar e util la dev/fallback).
app.use(
  express.static(publicDir, {
    extensions: ['html'],
    maxAge: config.isProd ? '1h' : 0,
  })
);

// URL-uri curate (aliniate cu nginx pe prod): categorie/produs/eveniment → pagina corectă.
// /florarie și /baloane au pagini proprii, cu <title>/<h1> în HTML-ul servit
// (înainte titlul se punea doar din shop.js, deci Google vedea „Shop —…").
app.get('/florarie', (_req, res) => res.sendFile(join(publicDir, 'florarie.html')));
app.get('/baloane', (_req, res) => res.sendFile(join(publicDir, 'baloane.html')));
app.get('/produs/:slug', (_req, res) => res.sendFile(join(publicDir, 'produs.html')));
// Paginile de decor sunt pre-randate (`npm run prerender`) ca titlul/H1/galeria
// să existe în HTML fără JS; dacă un slug nu are fișier, cade pe șablonul
// randat client-side.
app.get('/decoratiuni/:slug', (req, res) => {
  const slug = req.params.slug;
  const file = join(publicDir, 'decoratiuni', `${slug}.html`);
  if (/^[a-z0-9-]+$/.test(slug) && existsSync(file)) return res.sendFile(file);
  return res.sendFile(join(publicDir, 'decoratiuni-eveniment.html'));
});

// SPA-ish fallback: orice rută necunoscută → index.html (paginile sunt totuși fișiere).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(join(publicDir, 'index.html'));
});

app.use(errorHandler);

// Ascultă DOAR pe loopback: aplicația e mereu în spatele nginx (reverse proxy),
// deci portul Node nu trebuie expus pe interfața publică. Suprascrii cu HOST în
// .env dacă e nevoie (ex. 0.0.0.0 în containere unde proxy-ul e alt host).
const server = app.listen(config.port, config.host, () => {
  console.log(
    `\n🎈 The Big Boom Events pornit pe http://localhost:${config.port}  (env: ${config.env})`
  );
  console.log(`   API:      http://localhost:${config.port}/api/health`);
  console.log(`   Email:    ${config.email.provider}`);
  console.log(
    `   Plăți:    Netopia ${config.netopia.configured ? config.netopia.mode : 'mock (neconfigurat)'}\n`
  );
});

// Oprire curată (pm2 restart / SIGTERM)
async function shutdown(signal) {
  console.log(`\n${signal} primit — opresc serverul...`);
  server.close(async () => {
    await closeDb().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
