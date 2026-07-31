// Acces la date pentru comenzi — creare tranzacțională, validare server-side.
import crypto from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { getProductsByIds } from './products.js';
import { HttpError } from '../utils/http.js';

// Cost livrare: gratuit peste 500 lei, altfel 25 lei. Rambursul nu schimbă livrarea.
const FREE_SHIPPING_THRESHOLD = 50000; // cents (500 lei)
const SHIPPING_FEE = 2500; // cents

export function computeShipping(subtotalCents) {
  return subtotalCents >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}

// Generează un număr de comandă unic, ușor de citit: BBE-YYYYMMDD-NNNN
async function nextOrderNumber(client) {
  const { rows } = await client.query(`SELECT nextval('order_number_seq') AS n`);
  const seq = String(rows[0].n).padStart(4, '0');
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;
  // Sufix aleator: numerele erau secvențiale (BBE-DATA-0001, 0002…), deci
  // `GET /api/orders/:number` (public, pentru pagina de mulțumire) permitea
  // enumerarea tuturor comenzilor. Cele 4 hex fac numărul neghicibil. Nu
  // conține „_” (separatorul folosit la orderID-ul Netopia), deci nu strică IPN-ul.
  const rnd = crypto.randomBytes(2).toString('hex');
  return `BBE-${ymd}-${seq}-${rnd}`;
}

/**
 * Creează o comandă validând prețuri și stoc PE SERVER (nu se încrede în client).
 * Scade stocul atomic. Întoarce { order, items }.
 */
export async function createOrder(input) {
  const ids = [...new Set(input.items.map((it) => it.productId))];
  const dbProducts = await getProductsByIds(ids);
  const byId = new Map(dbProducts.map((p) => [p.id, p]));

  // Validează fiecare articol cu datele reale din DB.
  const lineItems = [];
  let subtotal = 0;
  for (const it of input.items) {
    const p = byId.get(it.productId);
    if (!p || !p.is_active) {
      throw new HttpError(409, `Produsul #${it.productId} nu mai este disponibil.`);
    }
    // Produs „preț la cerere" (price_cents = 0, non-addon) — nu se poate comanda online.
    // (Add-on-urile pot fi 0, ex. felicitarea gratuită.)
    if (!p.is_addon && p.price_cents <= 0) {
      throw new HttpError(409, `Produsul „${p.name}" este disponibil doar la cerere.`);
    }
    // Extra-opțiunile (felicitare, bomboane...) nu țin stoc — sunt mereu disponibile.
    if (!p.is_addon && p.stock < it.quantity) {
      throw new HttpError(
        409,
        `Stoc insuficient pentru „${p.name}" (disponibil: ${p.stock}).`
      );
    }
    const line = p.price_cents * it.quantity;
    subtotal += line;
    lineItems.push({
      product_id: p.id,
      product_name: p.name,
      unit_cents: p.price_cents,
      quantity: it.quantity,
      line_cents: line,
      is_addon: p.is_addon === true,
    });
  }

  const shipping = computeShipping(subtotal);
  const total = subtotal + shipping;

  return withTransaction(async (client) => {
    // Re-verifică și scade stocul atomic (protecție la curse). Add-on-urile se sar.
    for (const li of lineItems) {
      if (li.is_addon) continue;
      const upd = await client.query(
        `UPDATE products SET stock = stock - $1
         WHERE id = $2 AND stock >= $1
         RETURNING stock`,
        [li.quantity, li.product_id]
      );
      if (upd.rowCount === 0) {
        throw new HttpError(409, `Stoc insuficient pentru „${li.product_name}".`);
      }
    }

    const orderNumber = await nextOrderNumber(client);
    const { rows } = await client.query(
      `INSERT INTO orders
        (order_number, customer_name, customer_email, customer_phone,
         ship_county, ship_city, ship_address, ship_postcode, notes,
         gift_message, delivery_date, delivery_slot,
         payment_method, status, subtotal_cents, shipping_cents, total_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        orderNumber,
        input.customer.name,
        input.customer.email,
        input.customer.phone,
        input.shipping.county,
        input.shipping.city,
        input.shipping.address,
        input.shipping.postcode || null,
        input.notes || null,
        input.giftMessage || null,
        input.deliveryDate || null,
        input.deliverySlot || null,
        input.paymentMethod,
        input.paymentMethod === 'cod' ? 'pending' : 'pending',
        subtotal,
        shipping,
        total,
      ]
    );
    const order = rows[0];

    for (const li of lineItems) {
      await client.query(
        `INSERT INTO order_items
          (order_id, product_id, product_name, unit_cents, quantity, line_cents)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [order.id, li.product_id, li.product_name, li.unit_cents, li.quantity, li.line_cents]
      );
    }

    return { order, items: lineItems };
  });
}

export async function getOrderByNumber(orderNumber) {
  const { rows } = await query(`SELECT * FROM orders WHERE order_number = $1`, [orderNumber]);
  if (!rows[0]) return null;
  const order = rows[0];
  const itemsRes = await query(
    `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`,
    [order.id]
  );
  return { order, items: itemsRes.rows };
}

export async function setPaymentRef(orderNumber, paymentRef) {
  await query(`UPDATE orders SET payment_ref = $1 WHERE order_number = $2`, [
    paymentRef,
    orderNumber,
  ]);
}

// Marchează plătit (din webhook). Idempotent: nu re-procesează dacă e deja paid.
export async function markPaid(orderNumber, paymentRef) {
  const { rows } = await query(
    `UPDATE orders
     SET status = 'paid', paid_at = now(), payment_ref = COALESCE($2, payment_ref)
     WHERE order_number = $1 AND status = 'pending'
     RETURNING *`,
    [orderNumber, paymentRef]
  );
  return rows[0] || null; // null dacă nu era pending (deja procesată) → idempotent
}

// Ramburs de card (refund din panoul Netopia → IPN status 8) sau chargeback.
// Repune stocul o singură dată (nu și pentru add-on-uri) și trece în „refunded".
export async function markRefunded(orderNumber, paymentRef) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM orders WHERE order_number = $1 FOR UPDATE`,
      [orderNumber]
    );
    const order = rows[0];
    if (!order || order.status === 'refunded') return null;
    const items = await client.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [order.id]
    );
    for (const it of items.rows) {
      await client.query(
        `UPDATE products SET stock = stock + $1 WHERE id = $2 AND is_addon = FALSE`,
        [it.quantity, it.product_id]
      );
    }
    await client.query(
      `UPDATE orders SET status = 'refunded', payment_ref = COALESCE($2, payment_ref) WHERE id = $1`,
      [order.id, paymentRef]
    );
    return order;
  });
}

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — listare comenzi, detaliu, schimbare status
// ═══════════════════════════════════════════════════════════════════

function mapOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
    },
    address: {
      county: row.ship_county,
      city: row.ship_city,
      address: row.ship_address,
      postcode: row.ship_postcode,
    },
    notes: row.notes,
    giftMessage: row.gift_message,
    deliveryDate: row.delivery_date,
    deliverySlot: row.delivery_slot,
    paymentMethod: row.payment_method,
    status: row.status,
    subtotal: row.subtotal_cents / 100,
    shippingCost: row.shipping_cents / 100,
    total: row.total_cents / 100,
    paymentRef: row.payment_ref,
    paidAt: row.paid_at,
    awb: row.awb,
    createdAt: row.created_at,
    itemCount: row.item_count != null ? Number(row.item_count) : undefined,
  };
}

function mapItem(row) {
  return {
    productId: row.product_id,
    productName: row.product_name,
    unit: row.unit_cents / 100,
    quantity: row.quantity,
    line: row.line_cents / 100,
  };
}

export async function listOrdersAdmin({ status, q, page = 1, pageSize = 50 } = {}) {
  const where = [];
  const params = [];
  let i = 1;
  if (status) {
    where.push(`o.status = $${i++}`);
    params.push(status);
  }
  if (q) {
    where.push(
      `(o.order_number ILIKE $${i} OR o.customer_name ILIKE $${i} OR o.customer_email ILIKE $${i})`
    );
    params.push(`%${q}%`);
    i++;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM orders o ${whereSql}`, params);
  const total = countRes.rows[0].total;
  const offset = (page - 1) * pageSize;
  const { rows } = await query(
    `SELECT o.*, COALESCE(SUM(oi.quantity), 0)::int AS item_count
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     ${whereSql}
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...params, pageSize, offset]
  );
  return {
    items: rows.map(mapOrder),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getOrderDetailAdmin(id) {
  const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  const itemsRes = await query(
    `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`,
    [id]
  );
  return { ...mapOrder(rows[0]), items: itemsRes.rows.map(mapItem) };
}

// Actualizează status și/sau AWB. La trecerea în „paid" setează paid_at dacă lipsește.
// La anulare/rambursare repune stocul (o singură dată — doar dacă nu era deja
// într-un status de anulare), ca marfa să nu rămână blocată în rezervă.
const RESTOCK_STATUSES = ['cancelled', 'refunded'];

export async function updateOrderAdmin(id, { status, awb }) {
  return withTransaction(async (client) => {
    const { rows: cur } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [id]);
    const order = cur[0];
    if (!order) return null;

    const sets = [];
    const params = [id];
    let i = 2;
    if (status !== undefined) {
      sets.push(`status = $${i++}`);
      params.push(status);
      if (status === 'paid') sets.push(`paid_at = COALESCE(paid_at, now())`);
    }
    if (awb !== undefined) {
      sets.push(`awb = $${i++}`);
      params.push(awb || null);
    }
    if (sets.length) {
      await client.query(`UPDATE orders SET ${sets.join(', ')} WHERE id = $1`, params);
    }

    const goesToRestock =
      status !== undefined &&
      RESTOCK_STATUSES.includes(status) &&
      !RESTOCK_STATUSES.includes(order.status);
    if (goesToRestock) {
      const items = await client.query(
        `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
        [id]
      );
      for (const it of items.rows) {
        // Add-on-urile nu consumă stoc la creare, deci nu li se repune nici aici.
        await client.query(
          `UPDATE products SET stock = stock + $1 WHERE id = $2 AND is_addon = FALSE`,
          [it.quantity, it.product_id]
        );
      }
    }

    // Citim prin `client`, nu prin pool: în interiorul tranzacției, UPDATE-ul
    // de mai sus nu e încă vizibil pentru alte conexiuni (am fi întors starea veche).
    const { rows: fresh } = await client.query(`SELECT * FROM orders WHERE id = $1`, [id]);
    const { rows: freshItems } = await client.query(
      `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`,
      [id]
    );
    return { ...mapOrder(fresh[0]), items: freshItems.map(mapItem) };
  });
}

// Comandă eșuată la plată: repune stocul și anulează.
// Doar comenzile cu CARDUL pot fi anulate pe ruta asta — un ramburs nu are ce
// căuta într-un callback de procesator.
export async function markFailed(orderNumber) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM orders
       WHERE order_number = $1 AND status = 'pending' AND payment_method = 'card'
       FOR UPDATE`,
      [orderNumber]
    );
    const order = rows[0];
    if (!order) return null;
    const items = await client.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [order.id]
    );
    for (const it of items.rows) {
      // Add-on-urile nu consumă stoc la creare (vezi createOrder), deci nici la
      // anulare nu li se repune — altfel stocul lor ar crește la infinit.
      await client.query(
        `UPDATE products SET stock = stock + $1 WHERE id = $2 AND is_addon = FALSE`,
        [it.quantity, it.product_id]
      );
    }
    await client.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [order.id]);
    return order;
  });
}
