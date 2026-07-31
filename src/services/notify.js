// Notificare instant opțională prin Telegram.
import config from '../config.js';

// Escapare pentru parse_mode HTML. Valorile venite de la client (nume, email
// din lead) trebuie escapate, altfel un lead poate injecta linkuri în mesaj sau
// îl poate face malformat (Telegram îl respinge → notificare pierdută).
export const tgEscape = (v) =>
  String(v == null ? '' : v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export async function notifyTelegram(text) {
  if (!config.telegram.configured) return { skipped: true };
  try {
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) throw new Error(`Telegram ${res.status}`);
    return { ok: true };
  } catch (err) {
    console.error('[telegram] eșec:', err.message);
    return { error: err.message };
  }
}
