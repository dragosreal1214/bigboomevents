// Smoke test minimal: pornește presupune serverul deja pornit pe PORT.
// Verifică /api/health, /api/products, creează un lead și o comandă ramburs.
// Folosire: npm run smoke   (cu serverul pornit separat: npm start)
import config from '../src/config.js';

const BASE = `http://localhost:${config.port}`;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✘ ${name}: ${err.message}`);
  }
}

const get = async (p) => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${p} → ${r.status}`);
  return r.json();
};
const post = async (p, body) => {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
};

await check('GET /api/health', async () => {
  const h = await get('/api/health');
  if (!h.ok) throw new Error('health.ok fals');
});

let firstProductId = null;
await check('GET /api/products', async () => {
  const p = await get('/api/products?pageSize=3');
  if (!Array.isArray(p.items) || p.items.length === 0) throw new Error('fără produse');
  firstProductId = p.items.find((x) => x.inStock)?.id || p.items[0].id;
});

await check('GET /api/products?category=florarie', async () => {
  const p = await get('/api/products?category=florarie');
  if (p.items.some((x) => x.category !== 'florarie')) throw new Error('filtru categorie greșit');
});

await check('GET /api/products exclude add-on-uri', async () => {
  const p = await get('/api/products?pageSize=48');
  if (p.items.some((x) => x.isAddon)) throw new Error('add-on apare în shop');
});

let firstAddonId = null;
await check('GET /api/addons', async () => {
  const a = await get('/api/addons');
  if (!Array.isArray(a.addons) || a.addons.length === 0) throw new Error('fără add-on-uri');
  if (a.addons.some((x) => !x.isAddon)) throw new Error('add-on fără is_addon');
  firstAddonId = a.addons[0].id;
});

await check('POST /api/leads', async () => {
  const r = await post('/api/leads', {
    name: 'Test Ionescu',
    email: 'test@example.com',
    phone: '0712345678',
    eventType: 'nunta',
    message: 'smoke test',
    acceptTerms: true,
  });
  if (r.status !== 201) throw new Error(`status ${r.status}: ${JSON.stringify(r.body)}`);
});

await check('POST /api/orders (ramburs)', async () => {
  if (!firstProductId) throw new Error('nu am product id');
  const r = await post('/api/orders', {
    customer: { name: 'Test Client', email: 'client@example.com', phone: '0712345678' },
    shipping: { county: 'Iași', city: 'Iași', address: 'Str. Test 1', postcode: '700000' },
    paymentMethod: 'cod',
    items: [{ productId: firstProductId, quantity: 1 }],
    acceptTerms: true,
  });
  if (r.status !== 201) throw new Error(`status ${r.status}: ${JSON.stringify(r.body)}`);
});

await check('POST /api/orders cu extra-opțiune + livrare', async () => {
  if (!firstProductId || !firstAddonId) throw new Error('lipsesc id-uri');
  const r = await post('/api/orders', {
    customer: { name: 'Test Client', email: 'client@example.com', phone: '0712345678' },
    shipping: { county: 'Iași', city: 'Iași', address: 'Str. Test 1', postcode: '700000' },
    paymentMethod: 'cod',
    giftMessage: 'La mulți ani! 🎈',
    deliveryDate: '2099-12-24',
    deliverySlot: '12:00 – 15:00',
    items: [
      { productId: firstProductId, quantity: 1 },
      { productId: firstAddonId, quantity: 1 },
    ],
    acceptTerms: true,
  });
  if (r.status !== 201) throw new Error(`status ${r.status}: ${JSON.stringify(r.body)}`);
});

await check('POST /api/orders validare (coș gol)', async () => {
  const r = await post('/api/orders', {
    customer: { name: 'X', email: 'bad', phone: '1' },
    shipping: { county: 'a', city: 'b', address: 'c' },
    paymentMethod: 'cod',
    items: [],
    acceptTerms: true,
  });
  if (r.status !== 400) throw new Error(`așteptat 400, primit ${r.status}`);
});

console.log(failed ? `\n${failed} test(e) eșuat(e).` : '\nToate testele au trecut. 🎈');
process.exit(failed ? 1 : 0);
