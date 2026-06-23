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

import config from './config.js';
import api from './routes/index.js';
import { apiNotFound, errorHandler } from './middleware/errorHandler.js';
import { close as closeDb } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

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
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
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
      cb(new Error('Origine nepermisă de CORS'));
    },
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

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

app.use('/api', apiLimiter);
app.use(['/api/orders', '/api/leads', '/api/payments'], writeLimiter);

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

// SPA-ish fallback: orice rută necunoscută → index.html (paginile sunt totuși fișiere).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(join(publicDir, 'index.html'));
});

app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(
    `\n🎈 BigBoomEvents pornit pe http://localhost:${config.port}  (env: ${config.env})`
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
