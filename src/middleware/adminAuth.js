// Autentificare simplă pentru panoul de administrare.
// Login cu parolă → token semnat HMAC (stateless, fără sesiuni în DB).
import crypto from 'node:crypto';
import config from '../config.js';
import { HttpError } from '../utils/http.js';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function sign(payloadB64) {
  return crypto.createHmac('sha256', config.secret).update(payloadB64).digest('base64url');
}

// Verifică parola introdusă față de cea din config (comparație constantă în timp).
export function checkPassword(password) {
  const a = Buffer.from(String(password || ''));
  const b = Buffer.from(String(config.admin.password));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Creează un token cu expirare.
export function issueToken() {
  const payload = { exp: Date.now() + config.admin.sessionTtlMs };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

// Verifică un token; întoarce true dacă e valid și neexpirat.
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

// Middleware: protejează rutele admin. Acceptă token din header Authorization: Bearer.
export function requireAdmin(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!verifyToken(token)) {
    return next(new HttpError(401, 'Autentificare necesară. Conectează-te din nou.'));
  }
  next();
}
