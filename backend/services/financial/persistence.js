'use strict';
// Private fixed SQL, never imported by routes. All identifiers below are constants.
const { assert } = require('./contracts');
const JOURNAL = `id legacy_mongo_id actor_id user_id operation_type currency idempotency_key payload_hash before_cents after_cents delta_cents
 source_type source_id effect reason result_balance_cents result_balance result_resource_id created_at`.split(/\s+/);
const ORDER = `id legacy_mongo_id order_id user_id financial_version catalog_category catalog_product_id catalog_product_name catalog_source_file catalog_revision
 catalog_pricing_version catalog_mode catalog_price_cents catalog_base_quantity catalog_min_quantity catalog_max_quantity catalog_min_charge_cents catalog_max_charge_cents
 catalog_requires_fulfillment_target catalog_fulfillment_schema catalog_fulfillment_validation_version catalog_fulfillment_network selection_package_index selection_quantity quantity
 charge_cents charge_currency amount method service debit_operation_id request_actor_id request_idempotency_key request_payload_hash request_result_user_reference
 request_result_operation_reference request_result_balance_cents request_result_balance fulfillment_schema fulfillment_validation_version fulfillment_network fulfillment_target
 status decision_actor_id decision_type decision_idempotency_key decision_payload_hash decision_reason decided_at decision_result_user_reference decision_result_operation_reference
 decision_result_balance_cents decision_result_balance refund_operation_id refund_amount_cents refunded_at created_at`.split(/\s+/);
const PAYMENT = `id legacy_mongo_id payment_id user_id submission_version claimed_amount_minor amount currency amount_cents amount_in_usd method note receipt_public_id
 receipt_format receipt_delivery_type status decision_actor_id decision_type decision_idempotency_key decision_payload_hash decision_reason decided_at decision_operation_id
 decision_result_user_reference decision_result_operation_reference decision_result_balance_cents decision_result_balance created_at`.split(/\s+/);
function projection(alias, cols) { return cols.map(c => `${alias}.${c} AS ${alias}_${c}`).join(', '); }
function extract(row, alias, cols) { return row[`${alias}_id`] === null || row[`${alias}_id`] === undefined ? null : Object.fromEntries(cols.map(c => [c, row[`${alias}_${c}`]])); }
function one(result) { assert(result && Array.isArray(result.rows) && result.rows.length <= 1); return result.rows[0] || null; }
function shape(row, cols) {
  if (!row) return null;
  return { journal: extract(row, 'j', JOURNAL), resource: cols ? extract(row, 'r', cols) : null,
    debit: cols ? extract(row, 'd', JOURNAL) : null, refund: cols === ORDER ? extract(row, 'f', JOURNAL) : null,
    ownerLegacy: row.owner_legacy, actorLegacy: row.actor_legacy };
}
function resourceSpec(input) {
  return ['approve', 'reject'].includes(input.kind) ? { table: 'payments', cols: PAYMENT, key: 'payment_id', id: input.paymentId }
    : { table: 'orders', cols: ORDER, key: 'order_id', id: input.orderId };
}
function createPersistence(query) {
  async function readReplay(input) {
    const values = [input.actorId, input.operationType, input.idempotencyKey];
    if (input.kind === 'adjust') {
      return shape(one(await query(`/* financial:replay:adjust */ SELECT ${projection('j', JOURNAL)}, owner.legacy_mongo_id AS owner_legacy,
        actor.legacy_mongo_id AS actor_legacy FROM public.financial_operations j
        LEFT JOIN public.users owner ON owner.id = j.user_id LEFT JOIN public.users actor ON actor.id = j.actor_id
        WHERE j.actor_id = $1::UUID AND j.operation_type = $2 AND j.idempotency_key = $3`, values)));
    }
    const { table, cols } = resourceSpec(input);
    const predicate = input.kind === 'purchase' ? 'r.request_actor_id = $1::UUID AND r.request_idempotency_key = $3'
      : 'r.decision_actor_id = $1::UUID AND r.decision_type = $4 AND r.decision_idempotency_key = $3';
    if (input.kind !== 'purchase') values.push(input.kind);
    const evidenceJoins = cols === ORDER
      ? `LEFT JOIN public.financial_operations d ON d.id = r.debit_operation_id
         LEFT JOIN public.financial_operations f ON f.source_type = 'order' AND f.source_id = r.id AND f.effect = 'refund'`
      : `LEFT JOIN public.financial_operations d ON d.source_type = 'payment' AND d.source_id = r.id AND d.effect = 'credit'`;
    const sql = `/* financial:replay:${input.kind} */ WITH wanted_journal AS (
      SELECT ${JOURNAL.join(', ')} FROM public.financial_operations WHERE actor_id = $1::UUID AND operation_type = $2 AND idempotency_key = $3),
      wanted_resource AS (SELECT ${cols.map(c => `r.${c}`).join(', ')} FROM public.${table} r WHERE ${predicate})
      SELECT ${projection('j', JOURNAL)}, ${projection('r', cols)}, ${projection('d', JOURNAL)}${cols === ORDER ? ', ' + projection('f', JOURNAL) : ''},
      owner.legacy_mongo_id AS owner_legacy, actor.legacy_mongo_id AS actor_legacy
      FROM wanted_resource r FULL JOIN wanted_journal j ON TRUE ${evidenceJoins}
      LEFT JOIN public.users owner ON owner.id = coalesce(r.user_id, j.user_id)
      LEFT JOIN public.users actor ON actor.id = $1::UUID`;
    return shape(one(await query(sql, values)), cols);
  }
  async function findOwner(input) {
    if (input.kind === 'adjust') return input.userId;
    if (input.kind === 'purchase') return input.actorId;
    const { table, key, id } = resourceSpec(input);
    const row = one(await query(`/* financial:owner */ SELECT id, user_id FROM public.${table} WHERE ${key} = $1`, [id]));
    return row?.user_id || null;
  }
  async function prelock(ids) {
    const result = await query(`/* financial:accounts */ SELECT id, role, account_status, token_version FROM public.users
      WHERE id = ANY($1::UUID[]) ORDER BY id FOR UPDATE`, [[...new Set(ids)].sort()]);
    assert(result && Array.isArray(result.rows)); return result.rows;
  }
  async function lockResource(input) {
    const { table, cols, key, id } = resourceSpec(input);
    const joins = cols === ORDER ? `LEFT JOIN public.financial_operations d ON d.id = r.debit_operation_id
      LEFT JOIN public.financial_operations f ON f.source_type = 'order' AND f.source_id = r.id AND f.effect = 'refund'`
      : `LEFT JOIN public.financial_operations d ON d.source_type = 'payment' AND d.source_id = r.id AND d.effect = 'credit'`;
    const row = one(await query(`/* financial:resource */ SELECT ${projection('r', cols)}, ${projection('d', JOURNAL)}
      ${cols === ORDER ? ', ' + projection('f', JOURNAL) : ''}, owner.legacy_mongo_id AS owner_legacy
      FROM public.${table} r ${joins} LEFT JOIN public.users owner ON owner.id = r.user_id WHERE r.${key} = $1 FOR UPDATE OF r`, [id]));
    return shape(row, cols);
  }
  async function insertJournal(input, { id, ownerId, before, after, hash, resourceId = null, publicId = null }) {
    const source = input.kind === 'purchase' || input.kind === 'cancel' ? 'order' : input.kind === 'approve' ? 'payment' : null;
    const effect = { purchase: 'debit', cancel: 'refund', approve: 'credit' }[input.kind] || null;
    const row = one(await query(`/* financial:journal */ INSERT INTO public.financial_operations
      (id, actor_id, user_id, operation_type, currency, idempotency_key, payload_hash, before_cents, after_cents, source_type, source_id, effect, reason, result_resource_id)
      VALUES ($1::UUID,$2::UUID,$3::UUID,$4,'USD',$5,$6,$7::BIGINT,$8::BIGINT,$9,$10::UUID,$11,$12,$13) RETURNING id`,
    [id, input.actorId, ownerId, input.operationType, input.idempotencyKey, hash, before, after, source, resourceId, effect, input.reason, publicId]));
    assert(row?.id === id);
  }
  async function insertOrder(input, prepared, ids, balance) {
    const s = prepared.snapshot, f = prepared.fulfillment;
    const columns = ['id','order_id','user_id','financial_version','catalog_category','catalog_product_id','catalog_product_name','catalog_source_file','catalog_revision',
      'catalog_pricing_version','catalog_mode','catalog_price_cents','catalog_base_quantity','catalog_min_quantity','catalog_max_quantity','catalog_min_charge_cents','catalog_max_charge_cents',
      'catalog_requires_fulfillment_target','catalog_fulfillment_schema','catalog_fulfillment_validation_version','catalog_fulfillment_network','selection_package_index','selection_quantity',
      'quantity','charge_cents','charge_currency','debit_operation_id','request_actor_id','request_idempotency_key','request_payload_hash','request_result_user_reference',
      'request_result_operation_reference','request_result_balance_cents','fulfillment_schema','fulfillment_validation_version','fulfillment_network','fulfillment_target','status'];
    const values = [ids.resource, ids.publicOrder, input.actorId, 1, s.category, String(s.productId), s.productName, s.sourceFile, s.catalogRevision, s.pricingVersion, s.mode,
      String(s.priceCents), String(s.baseQuantity), String(s.minQuantity), String(s.maxQuantity), String(s.minChargeCents), String(s.maxChargeCents), s.requiresFulfillmentTarget,
      s.fulfillmentSchema, s.fulfillmentValidationVersion, s.fulfillmentNetwork, Object.hasOwn(input,'packageIndex') ? String(input.packageIndex) : null,
      Object.hasOwn(input,'quantity') ? String(input.quantity) : null, String(prepared.quantity), String(prepared.chargeCents), 'USD', ids.operation, input.actorId,
      input.idempotencyKey, prepared.hash, input.actorId, ids.operation, balance, f?.schema || null, f?.validationVersion || null, f?.network || null, f ? f.target[f.schema] : null, 'pending'];
    const row = one(await query(`/* financial:order */ INSERT INTO public.orders (${columns.join(', ')})
      VALUES (${values.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id`, values)); assert(row?.id === ids.resource);
  }
  async function decide(
  input,
  resource,
  ids,
  hash,
  balance = null
) {
  const payment = ['approve', 'reject'].includes(input.kind);
  const table = payment ? 'payments' : 'orders';
  const monetary =
    input.kind === 'approve' || input.kind === 'cancel';

  const values = [
    input.kind === 'approve' || input.kind === 'complete'
      ? 'completed'
      : 'cancelled',
    input.actorId,
    input.kind,
    input.idempotencyKey,
    hash,
    input.reason,
    resource.user_id,
    monetary ? ids.operation : null,
    balance
  ];

  const set = [
    'status = $1',
    'decision_actor_id = $2::UUID',
    'decision_type = $3',
    'decision_idempotency_key = $4',
    'decision_payload_hash = $5',
    'decision_reason = $6',
    'decided_at = statement_timestamp()',

    // New decisions store canonical UUID receipt references as text.
    'decision_result_user_reference = $7::UUID::TEXT',

    // Parameter $8 is consistently UUID-typed wherever it appears.
    // Only its historical receipt representation is converted to text.
    'decision_result_operation_reference = $8::UUID::TEXT',

    'decision_result_balance_cents = $9::BIGINT'
  ];

  if (payment) {
    values.push(
      input.kind === 'approve'
        ? input.approvedAmountCents
        : null
    );

    set.push(
      'decision_operation_id = $8::UUID',
      'amount_cents = $10::BIGINT'
    );
  } else {
    values.push(
      input.kind === 'cancel'
        ? resource.charge_cents
        : null
    );

    set.push(
      'refund_operation_id = $8::UUID',
      'refund_amount_cents = $10::BIGINT',
      `refunded_at = CASE
         WHEN $8::UUID IS NULL THEN NULL
         ELSE statement_timestamp()
       END`
    );
  }

  values.push(resource.id, resource.user_id);

  const row = one(
    await query(
      `/* financial:decision */
       UPDATE public.${table}
       SET ${set.join(', ')}
       WHERE id = $11::UUID
         AND user_id = $12::UUID
         AND status = 'pending'
         AND ${
           payment ? 'submission_version' : 'financial_version'
         } = 1
       RETURNING id`,
      values
    )
  );

  assert(
    row?.id === resource.id,
    payment
      ? 'PAYMENT_ALREADY_DECIDED'
      : 'ORDER_ALREADY_DECIDED'
  );
}
  async function verifyBalance(ownerId, updated) {
    const row = one(await query('/* financial:final-balance */ SELECT balance_cents, row_version FROM public.users WHERE id = $1::UUID', [ownerId]));
    assert(row?.balance_cents === updated.balanceCents && row?.row_version === updated.rowVersion, 'BALANCE_RECONCILIATION_REQUIRED');
  }
  return Object.freeze({ readReplay, findOwner, prelock, lockResource, insertJournal, insertOrder, decide, verifyBalance });
}
// Shared only with private read persistence; never expose a query/write facade.
module.exports = { createPersistence, JOURNAL: Object.freeze(JOURNAL), ORDER: Object.freeze(ORDER), PAYMENT: Object.freeze(PAYMENT), projection, extract };
