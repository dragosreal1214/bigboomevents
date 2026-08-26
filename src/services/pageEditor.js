// ═══════════════════════════════════════════════════════════════════
//  Editor de conținut pentru paginile statice.
//
//  DE CE ASA: paginile sunt HTML static servit direct de nginx, iar
//  pre-randarea (vezi scripts/prerender-decoratiuni.js) depinde de asta —
//  conținutul TREBUIE să rămână în fișier, nu adus prin fetch, altfel pierdem
//  exact avantajul SEO pentru care am pre-randat.
//
//  Dar `rsync public/` de la deploy SUPRASCRIE fișierele. Deci fișierul nu
//  poate fi sursa de adevăr: baza de date e. Salvarea din panou scrie în
//  AMBELE (DB + fișier, ca modificarea să fie live imediat), iar după fiecare
//  deploy se rulează `npm run apply-content`, care rescrie fișierele din DB.
//
//  Elementele editabile se marchează în HTML:
//    <h1 data-cms="hero-title" data-cms-label="Titlul principal"
//        data-cms-group="Antet">…</h1>
//    <img data-cms-img="hero-image" data-cms-label="Poza din antet" …>
//  Eticheta și grupul stau în markup ca să fie evident, chiar lângă element,
//  ce se editează — fără un registru paralel care se desincronizează.
// ═══════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import config from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In productie paginile sunt in directorul servit de nginx (WEB_DIR), NU in
// aplicatie: rsync-ul trimite `public/` in /var/www/bigboom, iar `src/` in
// ~/bigboom-api. Fara asta, editorul citea dintr-un director inexistent.
const publicDir = config.webDir || join(__dirname, '..', '..', 'public');

if (!fs.existsSync(publicDir)) {
  console.warn(
    `[pageEditor] Directorul paginilor nu exista: ${publicDir}\n` +
    `             Seteaza WEB_DIR in .env (in productie: directorul servit de nginx).`
  );
}

// Paginile oferite spre editare, cu nume pe înțelesul clientului.
// `url` = unde se vede pagina (pentru butonul „Vezi pagina").
// `warn` apare ca avertisment în panou pentru paginile cu implicații legale.
// `altHost` = pagina stă pe subdomeniul magazinului. Panoul (de pe domeniul
// principal) NU o poate încărca în iframe: nginx trimite X-Frame-Options
// SAMEORIGIN + frame-ancestors 'self'. N-o slăbim pentru două pagini — panoul
// arată în schimb un mesaj și un buton de deschidere în filă nouă.
export const PAGES = [
  { slug: 'index',        file: 'index.html',        name: 'Prima pagină',            url: '/',              group: 'Site principal' },
  { slug: 'decoratiuni',  file: 'decoratiuni-evenimente.html', name: 'Decorațiuni Evenimente', url: '/decoratiuni-evenimente', group: 'Site principal' },
  { slug: 'wedding',      file: 'wedding.html',      name: 'Wedding Planner',         url: '/wedding',       group: 'Site principal' },
  { slug: 'contact',      file: 'contact.html',      name: 'Contact',                 url: '/contact',       group: 'Site principal' },
  { slug: 'florarie',     file: 'florarie.html',     name: 'Florărie (magazin)',      url: '/florarie',      group: 'Magazin', altHost: true },
  { slug: 'baloane',      file: 'baloane.html',      name: 'Baloane & Party Shop',    url: '/baloane',       group: 'Magazin', altHost: true },
  { slug: 'livrare',      file: 'livrare.html',      name: 'Politica de livrare',     url: '/livrare',       group: 'Pagini legale',
    warn: 'Pagină legală — textul e cerut de ANPC și de Netopia. Modifică doar dacă știi ce schimbi.' },
  { slug: 'anulare',      file: 'anulare.html',      name: 'Politica de anulare',     url: '/anulare',       group: 'Pagini legale',
    warn: 'Pagină legală — textul e cerut de ANPC și de Netopia. Modifică doar dacă știi ce schimbi.' },
  { slug: 'retur',        file: 'retur.html',        name: 'Politica de retur',       url: '/retur',         group: 'Pagini legale',
    warn: 'Pagină legală — excepțiile de la retur sunt prevăzute de lege. Modifică doar dacă știi ce schimbi.' },
];

const pageBySlug = new Map(PAGES.map((p) => [p.slug, p]));
export const getPage = (slug) => pageBySlug.get(slug) || null;

const readFile = (p) => fs.readFileSync(join(publicDir, p.file), 'utf8');

// Atributele se citesc dintr-un tag deja izolat, deci nu ne trebuie parser HTML.
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : '';
}

// Scoate `<tag ... data-cms="k" ...>continut</tag>`. Elementele marcate sunt
// simple (h1/h2/p/span) și NU conțin alt tag de același fel, deci potrivirea
// non-lacomă până la primul tag de închidere e corectă. `scanPage` verifică
// asta și semnalează dacă cineva marchează un element imbricat.
const TEXT_RX = /<(h1|h2|h3|p|span|div|li|a)\b([^>]*\bdata-cms\s*=\s*"[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g;
const IMG_RX = /<img\b([^>]*\bdata-cms-img\s*=\s*"[^"]*"[^>]*)>/g;
// Unele poze sunt fundaluri CSS, nu <img> (cardurile din portal). URL-ul stă
// inline in `style="--portal-img:url('...')"`, ca sa poata fi editat de aici.
const BG_RX = /<(a|div|section|header)\b([^>]*\bdata-cms-bg\s*=\s*"[^"]*"[^>]*)>/g;
const BG_URL_RX = /--portal-img\s*:\s*url\(\s*['\"]?([^'\")]+)['\"]?\s*\)/;

// Textele pot conține formatare simplă (unele paragrafe legale au deja
// <strong>), deci nu escapăm tot — dar orice altceva e scos. Fără asta,
// panoul ar fi o cale directă de XSS stocat în paginile publice.
const TAGURI_PERMISE = /^(strong|b|em|i|br|small|a)$/i;

export function sanitize(input) {
  let out = String(input == null ? '' : input);
  // elimină complet elementele periculoase, cu tot cu conținut
  out = out.replace(/<(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\1\s*>/gi, '');
  out = out.replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, '');
  // păstrează doar tagurile din listă; restul devin text
  out = out.replace(/<\/?([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (full, tag, attrs) => {
    if (!TAGURI_PERMISE.test(tag)) return full.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (/^a$/i.test(tag) && !full.startsWith('</')) {
      const href = (attrs.match(/\bhref\s*=\s*"([^"]*)"/) || [])[1] || '';
      // javascript:/data: în href = XSS; permitem doar linkuri normale
      const safe = /^(https?:\/\/|\/|mailto:|tel:|#)/i.test(href) ? href : '#';
      return `<a href="${safe}">`;
    }
    return full.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  });
  return out.trim();
}

/** Elementele editabile dintr-o pagină, în ordinea din document. */
export function scanPage(page) {
  const html = readFile(page);
  const items = [];

  for (const m of html.matchAll(TEXT_RX)) {
    const [, tag, attrs, inner] = m;
    const key = attr(attrs, 'data-cms');
    if (!key) continue;
    if (new RegExp(`<${tag}\\b`, 'i').test(inner)) {
      // Ar rupe înlocuirea: sări peste element și spune de ce.
      items.push({ key, type: 'text', label: attr(attrs, 'data-cms-label') || key,
        group: attr(attrs, 'data-cms-group') || 'Conținut', value: '', error: `Element <${tag}> imbricat — nu poate fi editat automat.` });
      continue;
    }
    items.push({
      key, type: 'text',
      label: attr(attrs, 'data-cms-label') || key,
      group: attr(attrs, 'data-cms-group') || 'Conținut',
      multiline: /^(p|div|li)$/i.test(tag) || inner.length > 90,
      value: inner.trim(),
    });
  }

  for (const m of html.matchAll(IMG_RX)) {
    const attrs = m[1];
    const key = attr(attrs, 'data-cms-img');
    if (!key) continue;
    items.push({
      key, type: 'image',
      label: attr(attrs, 'data-cms-label') || key,
      group: attr(attrs, 'data-cms-group') || 'Imagini',
      value: attr(attrs, 'src'),
      alt: attr(attrs, 'alt'),
    });
  }

  for (const m of html.matchAll(BG_RX)) {
    const attrs = m[2];
    const key = attr(attrs, 'data-cms-bg');
    if (!key) continue;
    const style = attr(attrs, 'style');
    const url = (style.match(BG_URL_RX) || [])[1] || '';
    items.push({
      key, type: 'image',
      label: attr(attrs, 'data-cms-label') || key,
      group: attr(attrs, 'data-cms-group') || 'Imagini',
      value: url,
    });
  }

  return items;
}

/**
 * Scrie valorile în fișierul paginii. `values` = { key: value }.
 * Întoarce cheile aplicate efectiv (ca ruta să poată raporta ce n-a găsit).
 */
export function writePage(page, values) {
  const path = join(publicDir, page.file);
  let html = fs.readFileSync(path, 'utf8');
  const applied = [];

  html = html.replace(TEXT_RX, (full, tag, attrs, inner) => {
    const key = attr(attrs, 'data-cms');
    if (!(key in values)) return full;
    if (new RegExp(`<${tag}\\b`, 'i').test(inner)) return full;
    applied.push(key);
    return `<${tag}${attrs}>${sanitize(values[key])}</${tag}>`;
  });

  html = html.replace(IMG_RX, (full, attrs) => {
    const key = attr(attrs, 'data-cms-img');
    if (!(key in values)) return full;
    applied.push(key);
    // înlocuim DOAR src, restul atributelor (alt, width, loading) rămân
    const next = attrs.replace(/\bsrc\s*=\s*"[^"]*"/, `src="${values[key]}"`);
    return `<img${next}>`;
  });

  html = html.replace(BG_RX, (full, tag, attrs) => {
    const key = attr(attrs, 'data-cms-bg');
    if (!(key in values)) return full;
    applied.push(key);
    const style = attr(attrs, 'style');
    const next = style.match(BG_URL_RX)
      ? style.replace(BG_URL_RX, `--portal-img:url('${values[key]}')`)
      : `--portal-img:url('${values[key]}');${style}`;
    return `<${tag}${attrs.replace(/\bstyle\s*=\s*"[^"]*"/, `style="${next}"`)}>`;
  });

  fs.writeFileSync(path, html);
  return applied;
}
