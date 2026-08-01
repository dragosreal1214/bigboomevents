// ═══════════════════════════════════════════════════════════════════
//  Editor pentru subpaginile /decoratiuni/<slug>.
//
//  DE CE SEPARAT de pageEditor.js: paginile astea NU sunt scrise de mână.
//  `scripts/prerender-decoratiuni.js` le generează din `public/js/decoratiuni-data.js`.
//  Dacă am edita HTML-ul rezultat, prima re-randare ar șterge tot. Deci edităm
//  SURSA (fișierul de date) și re-randăm imediat după salvare.
//
//  Avantaj față de editarea HTML: aici lucrăm cu JSON, nu cu regex pe markup.
// ═══════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import config from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = config.webDir || join(__dirname, '..', '..', 'public');
const dataFile = () => join(publicDir, 'js', 'decoratiuni-data.js');

// Fișierul e pentru browser (`window.DECOR_EVENTS = [...]`), nu un modul:
// izolăm literalul JSON dintre primul `[` și ultimul `]`.
function citeste() {
  const src = fs.readFileSync(dataFile(), 'utf8');
  const a = src.indexOf('[');
  const b = src.lastIndexOf(']');
  if (a < 0 || b < 0) throw new Error('decoratiuni-data.js: nu găsesc lista de evenimente');
  return { prefix: src.slice(0, a), events: JSON.parse(src.slice(a, b + 1)), sufix: src.slice(b + 1) };
}

function scrie({ prefix, events, sufix }) {
  fs.writeFileSync(dataFile(), prefix + JSON.stringify(events, null, 1) + sufix);
}

/** Lista subpaginilor, pentru registrul din panou. */
export function listDecorPages() {
  return citeste().events.map((e) => ({
    slug: `decor-${e.slug}`,
    name: `Decor ${e.name}`,
    url: `/decoratiuni/${e.slug}`,
    group: 'Decorațiuni Evenimente',
    kind: 'decor',
  }));
}

const evSlug = (slug) => String(slug).replace(/^decor-/, '');

/**
 * Câmpurile editabile ale unei subpagini. Cheile codifică poziția în date
 * (`poza-<categorie>-<index>-desc`), ca salvarea să știe exact unde scrie.
 */
export function scanDecorPage(slug) {
  const { events } = citeste();
  const e = events.find((x) => x.slug === evSlug(slug));
  if (!e) return null;

  const items = [
    {
      key: 'descriere', type: 'text', multiline: true,
      label: 'Textul de prezentare (sub titlu)',
      group: 'Antet', value: e.description || '',
    },
    {
      key: 'hero', type: 'image',
      label: 'Poza principală (apare pe pagina Decorațiuni)',
      group: 'Antet', value: e.hero || '',
    },
  ];

  e.categories.forEach((c, ci) => {
    const grup = `Galeria „${c.name}”`;
    items.push({
      key: `categorie-${ci}-nume`, type: 'text',
      label: 'Titlul galeriei', group: grup, value: c.name || '',
    });
    c.items.forEach((it, ii) => {
      items.push({
        key: `poza-${ci}-${ii}-img`, type: 'image',
        label: `Poza ${ii + 1}`, group: grup, value: it.img || '',
      });
      items.push({
        key: `poza-${ci}-${ii}-desc`, type: 'text', multiline: true,
        label: `Textul de sub poza ${ii + 1}`, group: grup, value: it.desc || '',
      });
    });
  });

  return { event: e, items };
}

/** Scrie valorile în fișierul de date. Întoarce cheile aplicate. */
export function writeDecorPage(slug, values) {
  const doc = citeste();
  const e = doc.events.find((x) => x.slug === evSlug(slug));
  if (!e) throw new Error('Subpagină inexistentă');
  const applied = [];

  for (const [key, raw] of Object.entries(values)) {
    const val = String(raw == null ? '' : raw).trim();
    if (key === 'descriere') { e.description = val; applied.push(key); continue; }
    if (key === 'hero') { e.hero = val; applied.push(key); continue; }

    let m = key.match(/^categorie-(\d+)-nume$/);
    if (m) {
      const c = e.categories[+m[1]];
      if (c) { c.name = val; applied.push(key); }
      continue;
    }
    m = key.match(/^poza-(\d+)-(\d+)-(img|desc)$/);
    if (m) {
      const it = e.categories[+m[1]]?.items[+m[2]];
      if (it) { it[m[3]] = val; applied.push(key); }
    }
  }

  if (applied.length) scrie(doc);
  return applied;
}
