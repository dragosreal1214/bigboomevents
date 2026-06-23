// Configurare centralizată — citește din mediu cu valori implicite sigure.
import 'dotenv/config';

const bool = (v, def = false) =>
  v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

const num = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

const list = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: num(process.env.PORT, 3000),
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',
  corsOrigins: list(process.env.CORS_ORIGINS),

  db: {
    // Dacă există DATABASE_URL îl folosim; altfel componente separate.
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST || 'localhost',
    port: num(process.env.PGPORT, 5432),
    user: process.env.PGUSER || 'bigboom',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'bigboomevents',
    ssl: bool(process.env.PGSSL, false) ? { rejectUnauthorized: false } : false,
    max: num(process.env.PGPOOL_MAX, 10),
  },

  email: {
    provider: (process.env.EMAIL_PROVIDER || 'console').toLowerCase(),
    from: process.env.EMAIL_FROM || 'BigBoomEvents <contact@bigboomevents.ro>',
    admin: process.env.EMAIL_ADMIN || 'contact@bigboomevents.ro',
    resendKey: process.env.RESEND_API_KEY || '',
    brevoKey: process.env.BREVO_API_KEY || '',
  },

  netopia: {
    mode: (process.env.NETOPIA_MODE || 'sandbox').toLowerCase(),
    apiKey: process.env.NETOPIA_API_KEY || '',
    posSignature: process.env.NETOPIA_POS_SIGNATURE || '',
    baseUrl:
      (process.env.NETOPIA_MODE || 'sandbox').toLowerCase() === 'live'
        ? process.env.NETOPIA_BASE_URL_LIVE || 'https://secure.netopia-payments.com'
        : process.env.NETOPIA_BASE_URL_SANDBOX ||
          'https://secure.sandbox.netopia-payments.com',
    get configured() {
      return Boolean(this.apiKey && this.posSignature);
    },
  },

  // Director unde se salvează pozele urcate din panou.
  // În producție = directorul servit de nginx (ex: /var/www/bigboom/assets/uploads).
  uploadsDir: process.env.UPLOAD_DIR || '',

  admin: {
    // Parola pentru panoul de administrare (/admin). Schim-o în .env!
    password: process.env.ADMIN_PASSWORD || 'admin',
    // Durata de valabilitate a sesiunii admin (ms). Implicit 12 ore.
    sessionTtlMs: num(process.env.ADMIN_SESSION_TTL_MS, 12 * 60 * 60 * 1000),
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    get configured() {
      return Boolean(this.botToken && this.chatId);
    },
  },

  secret: process.env.APP_SECRET || 'dev-secret-change-me',
};

export default config;
