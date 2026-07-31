// Cache-busting: adaugă/actualizează ?v=<versiune> pe toate referințele locale
// de CSS/JS din paginile HTML. Rulează ÎNAINTE de fiecare deploy de frontend, ca
// Cloudflare (care cache-uiește /js și /css) să servească mereu versiunea nouă.
// HTML-ul nu e cache-uit de CF, deci noile URL-uri versionate au efect instant.
//
//   node scripts/stamp-assets.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const V = Math.floor(Date.now() / 1000).toString(36);
let n = 0;

for (const f of fs.readdirSync(publicDir).filter((f) => f.endsWith('.html'))) {
  const p = path.join(publicDir, f);
  const before = fs.readFileSync(p, 'utf8');
  const after = before
    .replace(/(href="\/css\/[a-zA-Z0-9_\-/]+\.css)(\?v=[a-z0-9]+)?"/g, `$1?v=${V}"`)
    .replace(/(src="\/js\/[a-zA-Z0-9_\-/]+\.js)(\?v=[a-z0-9]+)?"/g, `$1?v=${V}"`);
  if (after !== before) { fs.writeFileSync(p, after); n++; }
}
console.log(`Versiune assets: ${V} — actualizată în ${n} fișiere HTML.`);
