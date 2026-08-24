// Importă în galeria de pe pagina Evenimente toate pozele de eveniment care
// există deja pe site: sursa e `public/js/decoratiuni-data.js`, fișierul din
// care se generează și subpaginile /decoratiuni/<slug>.
//
// De ce de acolo și nu din folderul cu imagini: fișierul are pentru fiecare
// poză și textul alternativ scris de om (accesibilitate + SEO) și evenimentul
// din care face parte, deci galeria pornește cu descrieri și filtre corecte.
//
// Idempotent: `gallery_images.url` e UNIQUE, iar inserarea face
// `ON CONFLICT DO UPDATE` — o re-rulare actualizează textele, nu dublează pozele.
// Pozele adăugate ulterior din panou NU sunt atinse.
//
// Rulează:  node scripts/seed-gallery.js
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import config from '../src/config.js';
import { addGalleryImages, listGalleryAdmin } from '../src/models/gallery.js';
import pool from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = config.webDir || join(__dirname, '..', 'public');
const dataFile = join(publicDir, 'js', 'decoratiuni-data.js');

// Fișierul e pentru browser (`window.DECOR_EVENTS = [...]`), nu un modul:
// izolăm literalul JSON dintre primul `[` și ultimul `]` (la fel ca decorEditor.js).
function citesteEvenimente() {
  const src = fs.readFileSync(dataFile, 'utf8');
  const a = src.indexOf('[');
  const b = src.lastIndexOf(']');
  if (a < 0 || b < 0) throw new Error('decoratiuni-data.js: nu găsesc lista de evenimente');
  return JSON.parse(src.slice(a, b + 1));
}

const events = citesteEvenimente();
const existente = new Set((await listGalleryAdmin()).map((g) => g.url));

const items = [];
const vazute = new Set();
for (const ev of events) {
  // Poza mare a evenimentului intră prima, apoi cele din categorii — ordinea
  // din fișier e cea gândită de client pentru paginile de decorațiuni.
  const candidate = [{ img: ev.hero, alt: `Decor ${ev.name}` }];
  for (const cat of ev.categories || []) {
    for (const it of cat.items || []) candidate.push({ img: it.img, alt: it.alt || it.desc || '' });
  }
  for (const c of candidate) {
    if (!c.img || vazute.has(c.img)) continue;
    vazute.add(c.img);
    items.push({ url: c.img, alt: String(c.alt || '').slice(0, 300), tag: ev.slug });
  }
}

const noi = items.filter((i) => !existente.has(i.url));
if (items.length) await addGalleryImages(items);

console.log(`Evenimente citite : ${events.length}`);
console.log(`Poze în fișier    : ${items.length}`);
console.log(`Adăugate acum     : ${noi.length}  (restul existau deja — textele lor s-au actualizat)`);
console.log(`Total în galerie  : ${(await listGalleryAdmin()).length}`);

await pool.end();
