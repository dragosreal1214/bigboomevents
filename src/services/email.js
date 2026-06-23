// Serviciu email tranzacțional — Resend, Brevo sau "console" (dev).
// Interfață unică: sendEmail({ to, subject, html, text }).
import config from '../config.js';

const { provider, from, resendKey, brevoKey } = config.email;

function parseFrom(str) {
  // "Nume <email@dom.ro>" -> { name, email }
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(str);
  if (m) return { name: m[1] || undefined, email: m[2] };
  return { email: str.trim() };
}

async function sendViaResend({ to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return res.json();
}

async function sendViaBrevo({ to, subject, html, text }) {
  const sender = parseFrom(from);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': brevoKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo ${res.status}: ${body}`);
  }
  return res.json();
}

export async function sendEmail({ to, subject, html, text }) {
  try {
    if (provider === 'resend') {
      if (!resendKey) throw new Error('RESEND_API_KEY lipsește');
      return await sendViaResend({ to, subject, html, text });
    }
    if (provider === 'brevo') {
      if (!brevoKey) throw new Error('BREVO_API_KEY lipsește');
      return await sendViaBrevo({ to, subject, html, text });
    }
    // provider === 'console' (dev): loghează, nu trimite.
    console.log(`\n📧 [email:console] → ${to}\n   subiect: ${subject}\n   ${text || ''}\n`);
    return { id: 'console', skipped: true };
  } catch (err) {
    // Nu blocăm fluxul comenzii/lead-ului dacă email-ul eșuează — doar logăm.
    console.error('[email] eșec trimitere:', err.message);
    return { error: err.message };
  }
}
