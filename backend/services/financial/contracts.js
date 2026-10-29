'use strict';
// Private coordinator contracts. No database access or mutation capabilities.
const { createHash } = require('node:crypto');
const { MAX_CENTS, formatMoney, parseMoney } = require('../../utils/money');
const { purchaseHash } = require('../../utils/orderInput');
const { normalizeTarget } = require('../../utils/fulfillmentTarget');
const MAX = BigInt(MAX_CENTS);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;
function matches(re, value) { return typeof value === 'string' && re.exec(value)?.[0] === value; }
class FinancialCoordinatorError extends Error {
  constructor(status, code, retryWithSameKey = false) {
    super(code === 'FINANCIAL_OUTCOME_UNKNOWN'
      ? 'The financial outcome could not be confirmed. Retry the identical request with the same idempotency key.' : code);
    this.name = 'FinancialCoordinatorError'; this.status = status; this.code = code;
    if (retryWithSameKey) this.retryWithSameKey = true;
  }
}
const fail = (code, status = 409, retry = false) => new FinancialCoordinatorError(status, code, retry);
function assert(ok, code = 'FINANCIAL_RECONCILIATION_REQUIRED') { if (!ok) throw fail(code); }
function uuid(value, code = 'INVALID_FINANCIAL_INPUT') { if (!matches(UUID, value)) throw fail(code, 400); return value; }
function fields(value, allowed, required = allowed) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail('INVALID_FINANCIAL_INPUT', 400);
  const keys = Reflect.ownKeys(value);
  if (required.some(key => !keys.includes(key)) || keys.some(key => typeof key !== 'string' || !allowed.includes(key) ||
      !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) throw fail('INVALID_FINANCIAL_INPUT', 400);
}
function cents(value, code = 'INVALID_CENTS') {
  if (!matches(/^(0|[1-9][0-9]{0,15})$/, value) || BigInt(value) > MAX) throw fail(code, code.startsWith('INVALID') ? 400 : 409);
  return BigInt(value);
}
function numeric(value) { assert(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)); return value; }
function storedNumber(value, positive = true) {
  const n = Number(cents(value, 'FINANCIAL_RECONCILIATION_REQUIRED')); assert(!positive || n > 0); return n;
}
function money(value) { return formatMoney(Number(cents(value, 'FINANCIAL_RECONCILIATION_REQUIRED'))); }
function compatible(value) {
  const n = cents(value); const text = formatMoney(Number(n));
  try { if (parseMoney(Number(text)) !== Number(n)) throw new Error(); }
  catch (_) { throw fail('MONEY_MIRROR_UNREPRESENTABLE', 400); }
  return text;
}
function checked(value) {
  if (value < 0n) throw fail('INSUFFICIENT_FUNDS');
  if (value > MAX) throw fail('MONEY_OVERFLOW', 400);
  compatible(value.toString()); return value.toString();
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function normalize(raw, kind) {
  const extra = kind === 'adjust' ? ['userId', 'newBalanceCents', 'expectedBalanceCents'] : kind === 'purchase'
    ? ['category', 'productId', 'packageIndex', 'quantity', 'fulfillmentTarget']
    : [kind === 'approve' || kind === 'reject' ? 'paymentId' : 'orderId', ...(kind === 'approve' ? ['approvedAmountCents'] : [])];
  const allowed = ['principal', 'idempotencyKey', ...(kind === 'purchase' ? [] : ['reason']), ...extra];
  const required = kind === 'purchase' ? ['principal', 'idempotencyKey', 'category', 'productId'] : allowed;
  fields(raw, allowed, required); fields(raw.principal, ['userId', 'tokenVersion']);
  const actorId = uuid(raw.principal.userId); cents(raw.principal.tokenVersion, 'INVALID_TOKEN_VERSION');
  if (!matches(KEY, raw.idempotencyKey)) throw fail('INVALID_IDEMPOTENCY_KEY', 400);
  if (kind !== 'purchase' && (typeof raw.reason !== 'string' || raw.reason.length > 500 || !raw.reason.trim() ||
      ['complete', 'cancel'].includes(kind) && /[\x00-\x1f\x7f<>&'"`]/.test(raw.reason))) throw fail('INVALID_FINANCIAL_REASON', 400);
  const input = { ...raw, principal: { ...raw.principal }, actorId, kind, reason: kind === 'purchase' ? 'Catalog purchase' : raw.reason.trim(),
    operationType: { adjust: 'balance_adjustment', purchase: 'order_debit', approve: 'payment_credit', cancel: 'order_refund' }[kind] || null };
  if (kind === 'adjust') { uuid(raw.userId); compatible(raw.newBalanceCents); cents(raw.expectedBalanceCents); }
  else if (kind === 'purchase') {
    if (!['apps', 'games', 'cryptos', 'balances'].includes(raw.category) || !Number.isSafeInteger(raw.productId) || raw.productId <= 0 ||
        Object.hasOwn(raw, 'packageIndex') === Object.hasOwn(raw, 'quantity') ||
        Object.hasOwn(raw, 'packageIndex') && (!Number.isSafeInteger(raw.packageIndex) || raw.packageIndex < 0 || Object.is(raw.packageIndex, -0)) ||
        Object.hasOwn(raw, 'quantity') && (!Number.isSafeInteger(raw.quantity) || raw.quantity <= 0)) throw fail('INVALID_PURCHASE_INPUT', 400);
    if (Object.hasOwn(raw, 'fulfillmentTarget')) {
      fields(raw.fulfillmentTarget, ['accountId', 'playerId', 'walletAddress', 'email', 'phone'], []);
      input.fulfillmentTarget = { ...raw.fulfillmentTarget };
    }
  } else {
    if (!matches(KEY, raw.paymentId || raw.orderId)) throw fail('INVALID_FINANCIAL_INPUT', 400);
    if (kind === 'approve' && (cents(raw.approvedAmountCents) === 0n || !compatible(raw.approvedAmountCents))) throw fail('INVALID_APPROVED_AMOUNT', 400);
  }
  return freeze(input);
}
function fingerprint(input, fulfillment, actor = input.actorId, owner = input.userId) {
  if (input.kind === 'purchase') return purchaseHash(actor, input, fulfillment);
  const parts = input.kind === 'adjust' ? [1, 'balance_adjustment', 'USD', actor, owner, Number(input.newBalanceCents), Number(input.expectedBalanceCents), input.reason]
    : ['approve', 'reject'].includes(input.kind) ? [1, 'payment_decision', 'USD', actor, input.paymentId, input.kind, input.kind === 'approve' ? Number(input.approvedAmountCents) : null, input.reason]
    : [1, 'order_decision', 'USD', actor, input.orderId, input.kind, input.reason];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
function reference(value, id, legacy) { return value === id || legacy !== null && legacy !== undefined && value === legacy; }
function journal(j, code) {
  assert(j && matches(UUID, j.id) && matches(UUID, j.actor_id) && matches(UUID, j.user_id) && j.currency === 'USD' && matches(KEY, j.idempotency_key) && matches(HASH, j.payload_hash), code);
  const before = cents(j.before_cents, code), after = cents(j.after_cents, code);
  assert(matches(/^(0|-?[1-9][0-9]*)$/, j.delta_cents) && BigInt(j.delta_cents) === after - before && j.result_balance_cents === j.after_cents && j.result_balance === money(j.after_cents), code);
  return j;
}
function evidence(j, r, { type, effect, actor, key, hash, amount, balance, operation, reason, resourceType }, ownerLegacy, code) {
  journal(j, code);
  assert(j.operation_type === type && j.effect === effect && j.source_type === resourceType && j.source_id === r.id && j.user_id === r.user_id &&
    j.actor_id === actor && j.idempotency_key === key && j.payload_hash === hash && BigInt(j.delta_cents) === amount && j.after_cents === balance &&
    j.result_resource_id === (r.order_id || r.payment_id) && reference(operation, j.id, j.legacy_mongo_id) && (reason === undefined || j.reason === reason), code);
}
function orderSnapshot(r, code = 'ORDER_RECONCILIATION_REQUIRED') {
  assert(r.financial_version === 1 && r.charge_currency === 'USD' && r.request_actor_id === r.user_id && matches(HASH, r.request_payload_hash), code);
  const s = { category: r.catalog_category, productId: storedNumber(r.catalog_product_id), productName: r.catalog_product_name,
    sourceFile: r.catalog_source_file, catalogRevision: r.catalog_revision, pricingVersion: r.catalog_pricing_version, mode: r.catalog_mode,
    priceCents: storedNumber(r.catalog_price_cents), baseQuantity: storedNumber(r.catalog_base_quantity),
    minQuantity: storedNumber(r.catalog_min_quantity), maxQuantity: storedNumber(r.catalog_max_quantity),
    minChargeCents: storedNumber(r.catalog_min_charge_cents), maxChargeCents: storedNumber(r.catalog_max_charge_cents),
    requiresFulfillmentTarget: r.catalog_requires_fulfillment_target, fulfillmentSchema: r.catalog_fulfillment_schema,
    fulfillmentValidationVersion: r.catalog_fulfillment_validation_version, fulfillmentNetwork: r.catalog_fulfillment_network };
  const files = { 'cryptos.json': ['cryptos', 'walletAddress'], 'payments.json': ['cryptos', 'accountId'], 'mobile-payments.json': ['cryptos', 'phone'],
    'apps.json': ['apps', 'accountId'], 'games.json': ['games', 'playerId'], 'balances.json': ['balances', 'playerId'] };
  assert(Object.hasOwn(files, s.sourceFile) && files[s.sourceFile][0] === s.category && s.pricingVersion === 1 && matches(HASH, s.catalogRevision) &&
    typeof s.productName === 'string' && s.productName.length >= 1 && s.productName.length <= 200 && (!s.requiresFulfillmentTarget || files[s.sourceFile][1] === s.fulfillmentSchema), code);
  const quantity = storedNumber(r.quantity), charge = cents(r.charge_cents, code);
  assert(quantity >= s.minQuantity && quantity <= s.maxQuantity && charge >= BigInt(s.minChargeCents) && charge <= BigInt(s.maxChargeCents) &&
    r.amount === money(r.charge_cents) && r.method === s.category && r.service === s.productName, code);
  assert(s.category !== 'apps' || s.minQuantity === 1 && s.maxQuantity === 1000000 && s.minChargeCents === 50 && s.maxChargeCents === 100000, code);
  assert(s.category !== 'games' || s.mode === 'package' && s.minChargeCents === 1 && s.maxChargeCents === 50000, code);
  assert(!['cryptos', 'balances'].includes(s.category) || s.minChargeCents === 1 && s.maxChargeCents === MAX_CENTS, code);
  if (s.mode === 'package') assert(r.selection_quantity === null && storedNumber(r.selection_package_index, false) >= 0 && quantity === s.baseQuantity && charge === BigInt(s.priceCents), code);
  else {
    assert(s.mode === 'proportional' && r.selection_package_index === null && storedNumber(r.selection_quantity) === quantity, code);
    const divisor = BigInt(s.baseQuantity), product = BigInt(s.priceCents) * BigInt(quantity);
    assert(charge === product / divisor + (product % divisor * 2n >= divisor ? 1n : 0n), code);
  }
  try {
    const target = r.fulfillment_target === null ? undefined : { [r.fulfillment_schema]: r.fulfillment_target };
    const f = normalizeTarget(target, s);
    assert(f ? f.schema === r.fulfillment_schema && f.validationVersion === r.fulfillment_validation_version && f.network === r.fulfillment_network &&
      f.target[f.schema] === r.fulfillment_target : [r.fulfillment_schema, r.fulfillment_validation_version, r.fulfillment_network, r.fulfillment_target].every(v => v === null), code);
  } catch (_) { throw fail(code); }
  return s;
}
function validateOrder(row) {
  const { resource: r, debit: d, refund: f, ownerLegacy } = row, code = 'ORDER_RECONCILIATION_REQUIRED';
  assert(r && d && d.id === r.debit_operation_id && reference(r.request_result_user_reference, r.user_id, ownerLegacy), code);
  const snapshot = orderSnapshot(r, code);
  evidence(d, r, { type: 'order_debit', effect: 'debit', actor: r.request_actor_id, key: r.request_idempotency_key, hash: r.request_payload_hash,
    amount: -cents(r.charge_cents, code), balance: r.request_result_balance_cents, operation: r.request_result_operation_reference, resourceType: 'order' }, ownerLegacy, code);
  assert(r.request_result_balance === money(r.request_result_balance_cents), code);
  const decision = ['decision_actor_id', 'decision_type', 'decision_idempotency_key', 'decision_payload_hash', 'decision_reason', 'decided_at', 'decision_result_user_reference'];
  const monetary = ['decision_result_operation_reference', 'decision_result_balance_cents', 'refund_operation_id', 'refund_amount_cents', 'refunded_at'];
  if (r.status === 'pending') assert(!f && [...decision, ...monetary].every(k => r[k] === null), code);
  else {
    assert(['completed', 'cancelled'].includes(r.status) && decision.every(k => r[k] !== null) && matches(HASH, r.decision_payload_hash) &&
      reference(r.decision_result_user_reference, r.user_id, ownerLegacy) && r.decided_at instanceof Date, code);
    if (r.status === 'completed') assert(r.decision_type === 'complete' && !f && monetary.every(k => r[k] === null), code);
    else {
      assert(r.decision_type === 'cancel' && f && f.id === r.refund_operation_id && r.refund_amount_cents === r.charge_cents && r.refunded_at instanceof Date, code);
      evidence(f, r, { type: 'order_refund', effect: 'refund', actor: r.decision_actor_id, key: r.decision_idempotency_key, hash: r.decision_payload_hash,
        amount: cents(r.charge_cents, code), balance: r.decision_result_balance_cents, operation: r.decision_result_operation_reference,
        reason: r.decision_reason, resourceType: 'order' }, ownerLegacy, code);
      assert(r.decision_result_balance === money(r.decision_result_balance_cents), code);
    }
  }
  return snapshot;
}
function validatePayment(row) {
  const { resource: r, debit: credit, ownerLegacy } = row, code = 'PAYMENT_RECONCILIATION_REQUIRED';
  assert(r && r.submission_version === 1 && ['pending', 'completed', 'cancelled'].includes(r.status), code);
  const limits = { visa: ['USD', 1000n, 10000n], shamcashdol: ['USD', 1000n, 20000000n], shamcash: ['SYP', 1000000n, 20000000000n],
    syriatel: ['SYP', 500000n, 55000000n], mtn: ['SYP', 500000n, 55000000n], bank: ['USD', 5000n, 100000n],
    webmoney: ['USD', 2000n, 20000000n], usdt: ['USDT', 1000n, 20000000000n] };
  assert(Object.hasOwn(limits, r.method), code); const [currency, min, max] = limits[r.method], claimed = cents(r.claimed_amount_minor, code);
  assert(r.currency === currency && claimed >= min && claimed <= max && r.amount === money(r.claimed_amount_minor) &&
    matches(/^private_payment_receipts\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, r.receipt_public_id) &&
    r.receipt_format === 'jpg' && r.receipt_delivery_type === 'authenticated', code);
  const decision = ['decision_actor_id', 'decision_type', 'decision_idempotency_key', 'decision_payload_hash', 'decision_reason', 'decided_at', 'decision_result_user_reference'];
  const monetary = ['amount_cents', 'decision_operation_id', 'decision_result_operation_reference', 'decision_result_balance_cents'];
  if (r.status === 'pending') assert(!credit && [...decision, ...monetary].every(k => r[k] === null) && r.amount_in_usd === '0.00', code);
  else {
    assert(decision.every(k => r[k] !== null) && matches(HASH, r.decision_payload_hash) && r.decided_at instanceof Date && reference(r.decision_result_user_reference, r.user_id, ownerLegacy), code);
    if (r.status === 'cancelled') assert(r.decision_type === 'reject' && !credit && monetary.every(k => r[k] === null) && r.amount_in_usd === '0.00', code);
    else {
      assert(r.decision_type === 'approve' && credit && credit.id === r.decision_operation_id && cents(r.amount_cents, code) > 0n && r.amount_in_usd === money(r.amount_cents), code);
      evidence(credit, r, { type: 'payment_credit', effect: 'credit', actor: r.decision_actor_id, key: r.decision_idempotency_key, hash: r.decision_payload_hash,
        amount: cents(r.amount_cents, code), balance: r.decision_result_balance_cents, operation: r.decision_result_operation_reference,
        reason: r.decision_reason, resourceType: 'payment' }, ownerLegacy, code);
      assert(r.decision_result_balance === money(r.decision_result_balance_cents), code);
    }
  }
}
function receipt(input, row, replayed) {
  if (!row) return null;
  const { resource: r, journal: j } = row;
  let snapshot, fulfillment;
  if (input.kind === 'adjust') {
    journal(j, 'BALANCE_RECONCILIATION_REQUIRED');
    assert(j.operation_type === 'balance_adjustment' && j.source_type === null && j.source_id === null && j.effect === null && j.result_resource_id === null, 'BALANCE_RECONCILIATION_REQUIRED');
  } else if (['approve', 'reject'].includes(input.kind)) {
    validatePayment(row);
    assert(input.kind !== 'approve' || j && row.debit?.id === j.id, 'PAYMENT_RECONCILIATION_REQUIRED');
  } else {
    snapshot = validateOrder(row);
    assert(input.kind !== 'purchase' || j && row.debit.id === j.id, 'ORDER_RECONCILIATION_REQUIRED');
    assert(input.kind !== 'cancel' || j && row.refund?.id === j.id, 'ORDER_RECONCILIATION_REQUIRED');
  }
  if (input.kind === 'purchase') {
    if (r.catalog_category !== input.category || storedNumber(r.catalog_product_id) !== input.productId ||
        (Object.hasOwn(input, 'packageIndex') ? r.selection_package_index !== String(input.packageIndex) : r.selection_quantity !== String(input.quantity))) throw fail('IDEMPOTENCY_CONFLICT');
    try { fulfillment = normalizeTarget(input.fulfillmentTarget, snapshot); } catch (_) { throw fail('IDEMPOTENCY_CONFLICT'); }
  }
  // Imported verified evidence retains its original actor/owner fingerprint spelling.
  const legacy = j ? j.legacy_mongo_id !== null && j.legacy_mongo_id !== undefined
    : r.legacy_mongo_id !== null && row.ownerLegacy != null && r.decision_result_user_reference === row.ownerLegacy;
  assert(!legacy || row.actorLegacy != null, 'FINANCIAL_RECONCILIATION_REQUIRED');
  const expectedHash = fingerprint(input, fulfillment, legacy ? row.actorLegacy : input.actorId, legacy && input.kind === 'adjust' ? row.ownerLegacy : input.userId);
  const actualHash = input.kind === 'adjust' ? j.payload_hash : input.kind === 'purchase' ? r.request_payload_hash : r.decision_payload_hash;
  if (actualHash !== expectedHash) throw fail('IDEMPOTENCY_CONFLICT');
  if (j) assert(j.actor_id === input.actorId && j.idempotency_key === input.idempotencyKey && j.operation_type === input.operationType);
  if (r && input.kind !== 'purchase') {
    assert((r.payment_id || r.order_id) === (input.paymentId || input.orderId) && r.decision_actor_id === input.actorId &&
      r.decision_type === input.kind && r.decision_idempotency_key === input.idempotencyKey && r.decision_reason === input.reason);
    if (input.kind === 'approve') assert(r.amount_cents === input.approvedAmountCents, 'PAYMENT_RECONCILIATION_REQUIRED');
  }
  if (input.kind === 'adjust') {
    assert(j.user_id === input.userId && j.after_cents === input.newBalanceCents && j.before_cents === input.expectedBalanceCents && j.reason === input.reason, 'BALANCE_RECONCILIATION_REQUIRED');
    return freeze({ operationId: j.legacy_mongo_id || j.id, userId: row.ownerLegacy && legacy ? row.ownerLegacy : j.user_id,
      currency: 'USD', balanceCents: j.after_cents, balance: j.result_balance, replayed });
  }
  const result = { [r.order_id ? 'orderId' : 'paymentId']: r.order_id || r.payment_id,
    userId: input.kind === 'purchase' ? r.request_result_user_reference : r.decision_result_user_reference,
    status: input.kind === 'purchase' ? 'pending' : r.status, replayed };
  if (['purchase', 'cancel'].includes(input.kind)) Object.assign(result, { chargeCurrency: 'USD', chargeCents: r.charge_cents, charge: money(r.charge_cents), quantity: storedNumber(r.quantity) });
  if (input.kind === 'approve') Object.assign(result, { currency: 'USD', amountCents: r.amount_cents });
  if (j) Object.assign(result, { balanceCents: j.after_cents, balance: j.result_balance,
    operationId: input.kind === 'purchase' ? r.request_result_operation_reference : r.decision_result_operation_reference });
  return freeze(result);
}
module.exports = { FinancialCoordinatorError, fail, assert, uuid, fields, cents, numeric, money, compatible, checked, freeze, normalize, fingerprint,
  matches, KEY, journal, validateOrder, validatePayment, receipt };
