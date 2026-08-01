// Rescrie in fisierele din public/ continutul salvat din panou.
//
// DE CE: `rsync public/` de la deploy suprascrie fisierele, deci ar sterge
// modificarile facute de client din panou. Baza de date e sursa de adevar;
// scriptul asta o reaplica. RULEAZA-L DUPA FIECARE DEPLOY.
import { PAGES, getPage, writePage } from '../src/services/pageEditor.js';
import { getAllOverrides } from '../src/models/pageContent.js';
import { close } from '../src/db.js';

const all = await getAllOverrides();
let pagini = 0, campuri = 0;

for (const [slug, values] of Object.entries(all)) {
  const page = getPage(slug);
  if (!page) {
    console.warn(`  ⚠ pagina "${slug}" nu mai exista in registru — sar peste`);
    continue;
  }
  const applied = writePage(page, values);
  const lipsa = Object.keys(values).filter((k) => !applied.includes(k));
  console.log(`  ${page.file}: ${applied.length} campuri reaplicate` +
    (lipsa.length ? `  ⚠ negasite in pagina: ${lipsa.join(', ')}` : ''));
  pagini += 1;
  campuri += applied.length;
}

if (!pagini) console.log('  Nicio modificare salvata din panou — nimic de reaplicat.');
else console.log(`\n${campuri} campuri reaplicate in ${pagini} pagini (din ${PAGES.length} editabile).`);

await close();
