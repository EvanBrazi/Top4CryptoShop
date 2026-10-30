'use strict';
const { getPool } = require('../../db/pg');
const A = require('../../services/auth/persistence');
const C = require('../../services/financial/contracts');
const P = require('../../services/financial/persistence');
const Page = require('./pagination');
function createReads(kind, { poolProvider = getPool, cursorSecret = process.env.CURSOR_SECRET } = {}) {
  const order = kind === 'order', table = order ? 'orders' : 'payments', key = order ? 'order_id' : 'payment_id';
  const cols = order ? P.ORDER : P.PAYMENT;
  const codec = Page.cursorCodec(cursorSecret);
  function parameters(input, admin, detail = false, pending = false, summary = false) {
    const allowed = ['principal', ...(admin ? ['userId'] : []), ...(detail ? [order ? 'orderId' : 'paymentId'] : summary ? [] : ['limit', 'before', ...(pending ? [] : ['status'])])];
    const required = ['principal', ...(detail ? [order ? 'orderId' : 'paymentId'] : [])];
    A.fields(input, allowed, required); const p = A.principal(input.principal);
    const owner = admin ? input.userId === undefined ? null : A.uuid(input.userId) : p.userId;
    const status = pending ? 'pending' : input.status ?? null;
    if (status !== null && !['pending', 'completed', 'cancelled'].includes(status)) throw A.fail('INVALID_RESOURCE_FILTER', 400);
    const publicId = detail ? input[order ? 'orderId' : 'paymentId'] : null;
    if (detail && !C.matches(C.KEY, publicId)) throw A.fail('INVALID_RESOURCE_ID', 400);
    const binding = JSON.stringify([kind, admin ? 'admin' : 'owner', p.userId, owner, status]);
    const cursor = input.before !== undefined && input.before !== null ? codec.decode(input.before, binding) : null;
    return { p, owner, status, publicId, binding, cursor, n: detail ? 1 : summary ? null : Page.limit(input.limit), admin };
  }
  function sql(x, bounded = true) {
    const selected = `SELECT ${cols.map(c => `r.${c}`).join(', ')} FROM public.${table} r
      WHERE (SELECT authorized FROM actor) AND ($3::UUID IS NULL OR r.user_id = $3::UUID)
      AND ($4::TEXT IS NULL OR r.status = $4) AND ($5::TEXT IS NULL OR r.${key} = $5)
      AND ($6::TIMESTAMPTZ IS NULL OR (r.created_at, r.id) < ($6::TIMESTAMPTZ, $7::UUID))
      ORDER BY r.created_at DESC, r.id DESC ${bounded ? 'LIMIT $8' : ''}`;
    const joins = order ? `LEFT JOIN public.financial_operations d ON d.id = r.debit_operation_id
      LEFT JOIN public.financial_operations f ON f.source_type = 'order' AND f.source_id = r.id AND f.effect = 'refund'`
      : `LEFT JOIN public.financial_operations d ON d.source_type = 'payment' AND d.source_id = r.id AND d.effect = 'credit'`;
    return `WITH actor AS (SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = $1::UUID AND u.account_status = 'active'
      AND u.token_version = $2::BIGINT ${x.admin ? "AND u.role = 'admin'" : ''}) AS authorized), selected AS (${selected})
      SELECT actor.authorized, ${P.projection('r', cols)}, ${P.projection('d', P.JOURNAL)}
      ${order ? ', ' + P.projection('f', P.JOURNAL) : ''}, owner.legacy_mongo_id AS owner_legacy, ${Page.stamp('r')} AS cursor_time
      FROM actor LEFT JOIN selected r ON actor.authorized ${joins} LEFT JOIN public.users owner ON owner.id = r.user_id
      ORDER BY r.created_at DESC, r.id DESC`;
  }
  function values(x, bounded = true) {
    const v = [x.p.userId, x.p.tokenVersion, x.owner, x.status, x.publicId, x.cursor?.time ?? null, x.cursor?.id ?? null];
    if (bounded) v.push(x.n + 1); return v;
  }
  function evidence(row) {
    if (row.authorized !== true) throw A.fail('AUTH_FORBIDDEN', 403);
    const r = P.extract(row, 'r', cols); if (!r) return null;
    const item = { resource: r, debit: P.extract(row, 'd', P.JOURNAL), refund: order ? P.extract(row, 'f', P.JOURNAL) : null, ownerLegacy: row.owner_legacy };
    if (order) C.validateOrder(item); else C.validatePayment(item); return r;
  }
  function dto(r) {
    const common = { _id: r.id, id: r.id, userId: r.user_id, status: r.status, createdAt: r.created_at.toISOString(),
      method: r.method, decisionReason: r.decision_reason, decidedAt: r.decided_at?.toISOString() ?? null };
    return Object.freeze(order ? { ...common, orderId: r.order_id, service: r.service, quantity: Number(r.quantity),
      chargeCurrency: r.charge_currency, chargeCents: r.charge_cents, amount: r.amount, refundAmountCents: r.refund_amount_cents }
      : { ...common, paymentId: r.payment_id, claimedAmountMinor: r.claimed_amount_minor, amount: r.amount, currency: r.currency,
        amountCents: r.amount_cents, amountInUSD: r.amount_in_usd, note: r.note });
  }
  async function read(input, admin, detail = false, pending = false, privateView = false) {
    const x = parameters(input, admin, detail, pending); let result;
    try { result = await poolProvider().query({ text: sql(x), values: values(x), query_timeout: 5000 }); }
    catch (_) { throw A.fail('RESOURCE_READ_UNAVAILABLE', 503); }
    if (!result.rows.length) throw A.fail('AUTH_STATE_INVALID');
    const items = result.rows.map(row => ({ r: evidence(row), time: row.cursor_time })).filter(y => y.r);
    if (detail) {
      if (!items.length) return null; if (items.length > 1) throw A.fail('AUTH_STATE_INVALID');
      const r = items[0].r;
      if (!privateView) return dto(r);
      return C.freeze(order ? { orderId: r.order_id, userId: r.user_id, fulfillmentSnapshot: r.fulfillment_target === null ? null : {
        schema: r.fulfillment_schema, validationVersion: r.fulfillment_validation_version, network: r.fulfillment_network,
        target: { [r.fulfillment_schema]: r.fulfillment_target } } } : { paymentId: r.payment_id, userId: r.user_id,
        receipt: { publicId: r.receipt_public_id, format: r.receipt_format, deliveryType: r.receipt_delivery_type } });
    }
    const more = items.length > x.n, shown = items.slice(0, x.n), last = shown.at(-1);
    return Object.freeze({ items: Object.freeze(shown.map(y => dto(y.r))), nextBefore: more ? codec.encode(last.time, last.r.id, x.binding) : null });
  }
  async function summary(input, admin) {
    const x = parameters(input, admin, false, false, true);
    // Server-side cursor: one statement snapshot, bounded client memory, exact BigInt sums.
    return A.transaction(poolProvider, async q => {
      await q(`DECLARE resource_summary NO SCROLL CURSOR FOR ${sql(x, false)}`, values(x, false));
      const counts = { pending: 0n, completed: 0n, cancelled: 0n }, claimed = { USD: 0n, SYP: 0n, USDT: 0n };
      let charged = 0n, refunded = 0n, approved = 0n;
      for (;;) {
        const batch = await q('FETCH FORWARD 100 FROM resource_summary');
        for (const row of batch.rows) {
          const r = evidence(row); if (!r) continue; counts[r.status]++;
          if (order) { charged += BigInt(r.charge_cents); refunded += BigInt(r.refund_amount_cents ?? '0'); }
          else { claimed[r.currency] += BigInt(r.claimed_amount_minor); approved += BigInt(r.amount_cents ?? '0'); }
        }
        if (batch.rows.length < 100) break;
      }
      await q('CLOSE resource_summary');
      return C.freeze({ counts: Object.fromEntries(Object.entries(counts).map(([k,v]) => [k,v.toString()])),
        ...(order ? { chargedCents: charged.toString(), refundedCents: refunded.toString(), netChargeCents: (charged - refunded).toString() }
          : { approvedUsdCents: approved.toString(), claimedMinorByCurrency: Object.fromEntries(Object.entries(claimed).map(([k,v]) => [k,v.toString()])) }) });
    }, { readOnlySnapshot: true });
  }
  return { read, summary };
}
module.exports = { createReads };
