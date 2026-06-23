// Acces la date pentru leads (cereri de ofertă).
import { query } from '../db.js';

export async function createLead(input) {
  const { rows } = await query(
    `INSERT INTO leads (name, email, phone, event_date, event_type, message)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      input.name,
      input.email,
      input.phone || null,
      input.eventDate || null,
      input.eventType || null,
      input.message || '',
    ]
  );
  return rows[0];
}

// ─── ADMIN ───
function mapLead(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    eventDate: row.event_date,
    eventType: row.event_type,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listLeadsAdmin({ status, page = 1, pageSize = 50 } = {}) {
  const where = [];
  const params = [];
  let i = 1;
  if (status) {
    where.push(`status = $${i++}`);
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM leads ${whereSql}`, params);
  const total = countRes.rows[0].total;
  const offset = (page - 1) * pageSize;
  const { rows } = await query(
    `SELECT * FROM leads ${whereSql} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
    [...params, pageSize, offset]
  );
  return {
    items: rows.map(mapLead),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function updateLeadStatus(id, status) {
  const { rowCount } = await query(`UPDATE leads SET status = $2 WHERE id = $1`, [id, status]);
  return rowCount > 0;
}
