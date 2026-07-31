/* prerender-decoratiuni.js — generează HTML static pentru /decoratiuni/<slug>.
 *
 * De ce: paginile de decor erau randate integral din `js/decoratiuni.js`, deci
 * HTML-ul servit conținea ~250 de caractere de text și titlul generic al
 * șablonului. Google trebuia să ruleze JS ca să vadă conținutul, iar interogări
 * ca „decor nunta iasi" stăteau pe poziția ~7 și „aranjamente florale nunta
 * iasi" pe ~14. Aici scoatem același markup pe care îl produce `renderEvent()`,
 * dar în fișier, ca titlul/H1/galeria să existe fără JavaScript.
 *
 * Rulează după orice modificare în `public/js/decoratiuni-data.js`:
 *   npm run prerender
 * Fișierele rezultate (`public/decoratiuni/*.html`) sunt generate — nu le edita
 * manual, se suprascriu.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const SITE = 'https://thebigboomevents.ro';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** `decoratiuni-data.js` e un fișier de browser (`window.DECOR_EVENTS = [...]`),
 *  nu un modul — extragem literalul JSON dintre primul `[` și ultimul `]`. */
function loadEvents() {
  const src = readFileSync(join(publicDir, 'js', 'decoratiuni-data.js'), 'utf8');
  const start = src.indexOf('[');
  const end = src.lastIndexOf(']');
  if (start < 0 || end < 0) throw new Error('decoratiuni-data.js: nu găsesc array-ul DECOR_EVENTS');
  return JSON.parse(src.slice(start, end + 1));
}

const ARROW =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

// Trebuie să producă exact ce produce `renderEvent()` din js/decoratiuni.js,
// altfel conținutul „sare" vizibil la hidratare (JS-ul rescrie același nod).
function submenuHTML(events, activeSlug) {
  return (
    '<div class="wrap decor-submenu-inner">' +
    `<a href="/decoratiuni"${activeSlug ? '' : ' class="is-active"'}>Toate</a>` +
    events
      .map(
        (e) =>
          `<a href="/decoratiuni/${e.slug}"${activeSlug === e.slug ? ' class="is-active"' : ''}>${esc(e.name)}</a>`
      )
      .join('') +
    '</div>'
  );
}

function eventHTML(e) {
  let html =
    '<header class="hero decor-ev-hero"><div class="wrap hero-content">' +
    '<span class="eyebrow">Decorațiuni Evenimente</span>' +
    `<h1>Decor ${esc(e.name)} Iași</h1>` +
    `<p class="lead">${esc(e.description)}</p>` +
    '<div class="hero-cta"><a href="/contact" class="btn btn-primary">Cere o ofertă</a></div>' +
    '</div></header>';

  e.categories.forEach((cat, i) => {
    html +=
      `<section class="section"${i % 2 ? ' style="background:linear-gradient(180deg, transparent, color-mix(in srgb, var(--rose) 8%, transparent))"' : ''}>` +
      `<div class="wrap wide"><div class="section-head"><h2>${esc(cat.name)}</h2></div>` +
      '<div class="decor-gallery">' +
      cat.items
        .map(
          (it) =>
            `<figure class="decor-shot${it.portrait ? ' is-portrait' : ''}">` +
            `<div class="decor-shot-img"><img src="${esc(it.img)}" alt="${esc(it.alt)}" loading="lazy" /></div>` +
            (it.desc ? `<figcaption>${esc(it.desc)}</figcaption>` : '') +
            '</figure>'
        )
        .join('') +
      '</div></div></section>';
  });

  html +=
    '<section class="section-sm"><div class="wrap"><div class="cta-band">' +
    '<h2>Îți place ce vezi?</h2><p>Hai să discutăm despre decorul evenimentului tău — creăm ceva unic pentru voi.</p>' +
    '<a href="/contact" class="btn btn-primary">Cere o ofertă</a></div></div></section>';

  return html;
}

/** Breadcrumb + serviciul propriu-zis, ca Google să lege pagina de localitate. */
function jsonLd(e) {
  const url = `${SITE}/decoratiuni/${e.slug}`;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Acasă', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Decorațiuni Evenimente', item: `${SITE}/decoratiuni` },
          { '@type': 'ListItem', position: 3, name: `Decor ${e.name}`, item: url },
        ],
      },
      {
        '@type': 'Service',
        name: `Decor ${e.name} Iași`,
        serviceType: `Decorațiuni ${e.name}`,
        description: e.description,
        url,
        image: SITE + e.hero,
        areaServed: [
          { '@type': 'City', name: 'Iași' },
          { '@type': 'AdministrativeArea', name: 'Județul Iași' },
        ],
        provider: { '@type': 'LocalBusiness', '@id': `${SITE}/#business`, name: 'The Big Boom Events' },
      },
    ],
  });
}

const events = loadEvents();
const template = readFileSync(join(publicDir, 'decoratiuni-eveniment.html'), 'utf8');
const OLD_TITLE = 'Decorațiuni Evenimente — The Big Boom Events';
const OLD_DESC =
  'Decorațiuni personalizate pentru evenimente în Iași — flori naturale, baloane, photo corner și decor de sală.';

mkdirSync(join(publicDir, 'decoratiuni'), { recursive: true });

for (const e of events) {
  const url = `${SITE}/decoratiuni/${e.slug}`;
  let s = template;

  s = s.split(esc(OLD_TITLE)).join(esc(e.seoTitle));
  s = s.split(OLD_TITLE).join(esc(e.seoTitle));
  s = s.split(OLD_DESC).join(esc(e.description));
  s = s.replace(
    `<meta property="og:url" content="${SITE}/" />`,
    `<meta property="og:url" content="${url}" />`
  );
  s = s.replace(
    `<meta property="og:image" content="${SITE}/assets/og-image.jpg" />`,
    `<meta property="og:image" content="${SITE}${esc(e.hero)}" />`
  );
  s = s.replace(
    `<meta name="twitter:image" content="${SITE}/assets/og-image.jpg" />`,
    `<meta name="twitter:image" content="${SITE}${esc(e.hero)}" />`
  );
  // canonical + keywords + date structurate, imediat înainte de </head>
  s = s.replace(
    '</head>',
    `<link rel="canonical" href="${url}" />\n` +
      `<meta name="keywords" content="${esc(e.seoKeywords)}" />\n` +
      `<script type="application/ld+json">${jsonLd(e)}</script>\n</head>`
  );
  // conținutul, pre-randat (JS-ul îl rescrie identic la hidratare)
  s = s.replace(
    '<nav class="decor-submenu" data-decor-submenu aria-label="Tipuri de evenimente" hidden></nav>',
    `<nav class="decor-submenu" data-decor-submenu aria-label="Tipuri de evenimente">${submenuHTML(events, e.slug)}</nav>`
  );
  s = s.replace('<main data-decor-event></main>', `<main data-decor-event>${eventHTML(e)}</main>`);

  writeFileSync(join(publicDir, 'decoratiuni', `${e.slug}.html`), s);
  console.log(`✔ /decoratiuni/${e.slug}  — ${e.seoTitle}`);
}

// Pagina-listă /decoratiuni: grila era și ea randată din JS, deci HTML-ul servit
// nu conținea niciun link către subpagini — crawlerul nu avea pe unde intra.
{
  const p = join(publicDir, 'decoratiuni.html');
  const src = readFileSync(p, 'utf8');
  const grid = events
    .map(
      (e) =>
        `<a class="decor-tile" href="/decoratiuni/${e.slug}">` +
        `<img src="${esc(e.hero)}" alt="Decor ${esc(e.name)}" loading="lazy" />` +
        `<span class="decor-tile-body"><span class="decor-tile-name">${esc(e.name)}</span>` +
        `<span class="decor-tile-go">Vezi ${ARROW}</span></span></a>`
    )
    .join('');
  // Spre deosebire de subpagini, aici scriem înapoi în fișierul sursă — deci
  // tiparele trebuie să prindă și varianta deja pre-randată, altfel a doua
  // rulare ar crăpa. Nici tile-urile, nici submeniul nu conțin <div>/<nav>
  // imbricate, așa că potrivirea lacomă-minimal e sigură.
  let out = src.replace(
    /<div class="decor-grid" data-decor-grid>[\s\S]*?<\/div>/,
    `<div class="decor-grid" data-decor-grid>${grid}</div>`
  );
  out = out.replace(
    /<nav class="decor-submenu" data-decor-submenu aria-label="Tipuri de evenimente"[^>]*>[\s\S]*?<\/nav>/,
    `<nav class="decor-submenu" data-decor-submenu aria-label="Tipuri de evenimente">${submenuHTML(events, '')}</nav>`
  );
  if (!/decor-tile/.test(out) || !/decor-submenu-inner/.test(out)) {
    throw new Error('decoratiuni.html: nu găsesc grila/submeniul de pre-randat');
  }
  writeFileSync(p, out);
  console.log('✔ /decoratiuni (pagina-listă)');
}

console.log(`\n${events.length} pagini pre-randate în public/decoratiuni/.`);
