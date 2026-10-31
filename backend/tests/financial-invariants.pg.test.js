'use strict';

// C3.2c2: real SQL invariants, not Mongoose hydration/casting/save middleware.
// H verifies disposable PG18 identity, TLS, five checksums and reset authority.
const H = require('./helpers/disposablePg');
const { randomUUID } = require('node:crypto');
const { verifyRuntime } = require('../db/verify-runtime');
const { createFinancialCoordinator } = require('../services/financialCoordinator');

jest.setTimeout(30000);
let db;
const MAX = '9007199254740991';
const HASH = 'a'.repeat(64);
const query = (text, values = []) => db.pool.query(text, values);

beforeAll(async () => { db = await H.open(); });
beforeEach(async () => { await db.reset(); await db.seed(); });
afterAll(async () => { await db?.close(); });

async function snapshot() {
  const rows = {};
  for (const table of ['users', 'financial_operations', 'orders', 'payments']) {
    rows[table] = (await query(`SELECT * FROM public.${table} ORDER BY id`)).rows;
  }
  return rows;
}

// Column identifiers come only from literal test fixtures below, never input.
async function insert(q, table, fields) {
  const names = Object.keys(fields);
  return (await q(`INSERT INTO public.${table} (${names.join(', ')})
    VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, Object.values(fields))).rows[0];
}
async function user(q, extra = {}) {
  const id = randomUUID();
  return insert(q, 'users', { id, username: `U_${id.replaceAll('-', '').slice(0, 20)}`,
    email: `${id}@example.test`, provider: 'google', ...extra });
}
async function journal(q, extra = {}) {
  return insert(q, 'financial_operations', {
    id: randomUUID(), actor_id: H.ADMIN, user_id: H.OWNER,
    operation_type: 'balance_adjustment', idempotency_key: randomUUID(), payload_hash: HASH,
    before_cents: '10000', after_cents: '12500', reason: 'Reviewed adjustment', ...extra
  });
}
async function commit(work) {
  const c = await db.pool.connect();
  const q = (text, values = []) => c.query(text, values);
  try {
    await q('BEGIN');
    const value = await work(q);
    await q('SET CONSTRAINTS ALL IMMEDIATE');
    await q('COMMIT');
    return value;
  } catch (e) { await q('ROLLBACK'); throw e; } finally { c.release(); }
}
async function rejects(work, expected) {
  const before = await snapshot();
  const c = await db.pool.connect();
  const q = (text, values = []) => c.query(text, values);
  let error;
  try {
    await q('BEGIN');
    try { await work(q); await q('SET CONSTRAINTS ALL IMMEDIATE'); } catch (e) { error = e; }
  } finally { await q('ROLLBACK'); c.release(); }
  expect(error).toBeDefined();
  expect(error).toMatchObject(expected);
  expect(await snapshot()).toEqual(before);
}

// Every order/payment negative starts from a complete, otherwise valid pair.
// Deferred checks see real final rows, with existing users and valid UUID FKs.
async function orderPair(q, options = {}) {
  const id = options.id || randomUUID();
  const orderId = `order-${id}`;
  const key = randomUUID();
  const j = await journal(q, {
    actor_id: H.OWNER, operation_type: 'order_debit', before_cents: '10000', after_cents: '9000',
    source_type: 'order', source_id: id, effect: 'debit', result_resource_id: orderId,
    idempotency_key: key, reason: null, ...options.journal
  });
  const o = await insert(q, 'orders', {
    id, order_id: orderId, user_id: H.OWNER, financial_version: 1,
    catalog_category: 'apps', catalog_product_id: '1', catalog_product_name: 'Invariant fixture',
    catalog_source_file: 'apps.json', catalog_revision: HASH, catalog_pricing_version: 1,
    catalog_mode: 'proportional', catalog_price_cents: '1000', catalog_base_quantity: '100',
    catalog_min_quantity: '1', catalog_max_quantity: '1000000', catalog_min_charge_cents: '50',
    catalog_max_charge_cents: '100000', catalog_requires_fulfillment_target: true,
    catalog_fulfillment_schema: 'accountId', catalog_fulfillment_validation_version: 1,
    selection_quantity: '100', quantity: '100', charge_cents: '1000', debit_operation_id: j.id,
    request_actor_id: H.OWNER, request_idempotency_key: key, request_payload_hash: HASH,
    request_result_user_reference: H.OWNER, request_result_operation_reference: j.id,
    request_result_balance_cents: '9000', fulfillment_schema: 'accountId',
    fulfillment_validation_version: 1, fulfillment_target: 'valid_target_123', status: 'pending',
    ...options.order
  });
  return { o, j };
}
async function pendingPayment(q, id = randomUUID()) {
  return insert(q, 'payments', { id, payment_id: `pay-${id}`, user_id: H.OWNER,
    submission_version: 1, claimed_amount_minor: '1000', currency: 'USD', method: 'visa',
    receipt_public_id: `private_payment_receipts/${id}`, receipt_format: 'jpg',
    receipt_delivery_type: 'authenticated', status: 'pending' });
}
async function approvePair(q, options = {}) {
  const p = await pendingPayment(q, options.id);
  const key = randomUUID();
  const j = await journal(q, {
    operation_type: 'payment_credit', before_cents: '10000', after_cents: '11500',
    source_type: 'payment', source_id: p.id, effect: 'credit', result_resource_id: p.payment_id,
    idempotency_key: key, reason: 'Reviewed payment', ...options.journal
  });
  const decision = { status: 'completed', amount_cents: '1500', decision_actor_id: H.ADMIN,
    decision_type: 'approve', decision_idempotency_key: key, decision_payload_hash: HASH,
    decision_reason: 'Reviewed payment', decided_at: new Date('2026-01-01T00:00:00Z'),
    decision_operation_id: j.id, decision_result_user_reference: H.OWNER,
    decision_result_operation_reference: j.id, decision_result_balance_cents: '11500', ...options.decision };
  const names = Object.keys(decision);
  const updated = (await q(`UPDATE public.payments SET ${names.map((n, i) => `${n}=$${i + 1}`).join(', ')}
    WHERE id=$${names.length + 1}::UUID RETURNING *`, [...Object.values(decision), p.id])).rows[0];
  return { p: updated, j };
}

// USER BALANCE CONSTRAINTS — 6 registrations / cases.
test('zero registration and exact cents generate the required NUMERIC balance mirror', async () => {
  const zero = await user(query);
  expect(zero).toMatchObject({ balance_cents: '0', balance: '0.00', row_version: '0' });
  for (const [cents, balance] of [['0', '0.00'], ['1', '0.01'], ['29', '0.29'], ['100', '1.00'], ['12345', '123.45']]) {
    expect(await user(query, { balance_cents: cents })).toMatchObject({ balance_cents: cents, balance });
  }
});

test('negative user cents fail the balance constraint on insert and update without side effects', async () => {
  const expected = { code: '23514', constraint: 'users_balance_cents_check' };
  await rejects(q => user(q, { balance_cents: '-1' }), expected);
  await rejects(q => q('UPDATE public.users SET balance_cents=-1 WHERE id=$1::UUID', [H.OWNER]), expected);
});

test('MAX_SAFE_INTEGER cents retain an exact SQL mirror and the next cent is rejected', async () => {
  expect(await user(query, { balance_cents: MAX })).toMatchObject({ balance_cents: MAX, balance: '90071992547409.91' });
  const expected = { code: '23514', constraint: 'users_balance_cents_check' };
  await rejects(q => user(q, { balance_cents: '9007199254740992' }), expected);
  await rejects(q => q('UPDATE public.users SET balance_cents=$1::BIGINT WHERE id=$2::UUID',
    ['9007199254740992', H.OWNER]), expected);
});

test('generated user balance cannot be supplied or independently overwritten', async () => {
  for (const balance of ['1.00', '1.005', '0.30000000000000004']) {
    await rejects(q => user(q, { balance_cents: '101', balance }), { code: '428C9' });
    await rejects(q => q('UPDATE public.users SET balance=$1::NUMERIC WHERE id=$2::UUID', [balance, H.OWNER]), { code: '428C9' });
  }
});

test('authoritative user cents reject NULL on insertion and removal', async () => {
  const expected = { code: '23502', table: 'users', column: 'balance_cents' };
  await rejects(q => user(q, { balance_cents: null }), expected);
  await rejects(q => q('UPDATE public.users SET balance_cents=NULL WHERE id=$1::UUID', [H.OWNER]), expected);
});

test('exhausted row_version freezes money and metadata while caller overrides cannot reset versions', async () => {
  const frozen = await user(query, { balance_cents: '29', row_version: MAX });
  for (const set of ['balance_cents=30', 'theme=1', 'row_version=0, balance_cents=30']) {
    await rejects(q => q(`UPDATE public.users SET ${set} WHERE id=$1::UUID`, [frozen.id]),
      { code: '23514', message: 'Row version exhausted' });
  }
  const changed = (await query('UPDATE public.users SET row_version=999, theme=1 WHERE id=$1::UUID RETURNING *', [H.OWNER])).rows[0];
  expect(changed).toMatchObject({ row_version: '1', balance_cents: '10000', balance: '100.00', theme: 1 });
});

// JOURNAL CONTRACTS / GENERATED EVIDENCE — 6 registrations / cases.
test('source-free journal generates exact signed deltas and canonical replay evidence without writable metadata', async () => {
  for (const [before, after, delta, balance] of [
    ['10000', '12500', '2500', '125.00'], ['29', '29', '0', '0.29'],
    [MAX, '0', '-9007199254740991', '0.00'], ['0', MAX, MAX, '90071992547409.91']
  ]) {
    expect(await journal(query, { before_cents: before, after_cents: after })).toMatchObject({
      currency: 'USD', before_cents: before, after_cents: after, delta_cents: delta,
      source_type: null, source_id: null, effect: null, result_balance_cents: after, result_balance: balance
    });
  }
  for (const [field, value] of [['delta_cents', '2499'], ['result_balance_cents', '12499'],
    ['result_balance', '125'], ['source_user_id', H.OTHER], ['source_payment_id', H.OWNER], ['source_order_id', H.OWNER]]) {
    await rejects(q => journal(q, { [field]: value }), { code: '428C9' });
  }
  for (const field of ['extra', 'result']) {
    await rejects(q => q(`INSERT INTO public.financial_operations (${field}) VALUES ($1)`, ['unbounded metadata']),
      { code: '42703' });
  }
});

test('journal before and after cents enforce mandatory integer and safe bounds independently', async () => {
  for (const field of ['before_cents', 'after_cents']) {
    await rejects(q => journal(q, { [field]: null }), { code: '23502', table: 'financial_operations', column: field });
    for (const value of ['-1', '9007199254740992']) {
      await rejects(q => journal(q, { [field]: value }), { code: '23514', constraint: `financial_operations_${field}_check` });
    }
    // pg BIGINT transport strings are intentional; public JS coercion is covered
    // independently by money-contracts, not misrepresented as SQL type policy.
    for (const value of ['0.5', 'NaN', 'Infinity', 'true']) {
      await rejects(q => journal(q, { [field]: value }), { code: '22P02' });
    }
  }
});

test('journal keys hashes currency and reasons reject malformed evidence with valid actors and owners', async () => {
  for (const key of ['', 'bad key', 'value\n', '_bad']) {
    await rejects(q => journal(q, { idempotency_key: key }), { code: '23514', constraint: 'financial_operations_idempotency_key_check' });
  }
  await rejects(q => journal(q, { idempotency_key: 'x'.repeat(129) }), { code: '22001' });
  for (const hash of ['', 'bad key', 'value\n', 'A'.repeat(64), 'a'.repeat(63)]) {
    await rejects(q => journal(q, { payload_hash: hash }), { code: '23514', constraint: 'financial_operations_payload_hash_check' });
  }
  for (const reason of ['', '   ', ' padded ']) {
    await rejects(q => journal(q, { reason }), { code: '23514', constraint: 'financial_operations_reason_check' });
  }
  await rejects(q => journal(q, { currency: 'USDT' }), { code: '23514', constraint: 'financial_operations_currency_check' });
});

test('journal source groups type effect owner and delta direction cannot contradict valid source fixtures', async () => {
  const { o } = await commit(q => orderPair(q));
  const p = await pendingPayment(query);
  const invalid = [
    { source_type: 'adjustment' }, { source_id: H.OWNER }, { effect: 'adjustment' }, { reason: null },
    { source_type: 'adjustment', source_id: H.OWNER, effect: 'credit' },
    { operation_type: 'payment_credit', source_type: 'payment', effect: 'credit', result_resource_id: p.payment_id },
    { operation_type: 'payment_credit', source_type: 'payment', source_id: p.id, effect: 'debit', result_resource_id: p.payment_id },
    { operation_type: 'order_debit', actor_id: H.OWNER, before_cents: '12500', after_cents: '10000', source_type: 'payment', source_id: p.id, effect: 'debit', result_resource_id: o.order_id },
    { operation_type: 'order_debit', actor_id: H.OTHER, before_cents: '12500', after_cents: '10000', source_type: 'order', source_id: o.id, effect: 'debit', result_resource_id: o.order_id }
  ];
  for (const extra of invalid) {
    await rejects(q => journal(q, extra), { code: '23514', constraint: 'financial_source_contract' });
  }
  for (const extra of [
    { operation_type: 'order_debit', actor_id: H.OWNER, source_type: 'order', source_id: o.id, effect: 'debit', result_resource_id: o.order_id },
    { operation_type: 'payment_credit', before_cents: '12500', after_cents: '10000', source_type: 'payment', source_id: p.id, effect: 'credit', result_resource_id: p.payment_id },
    { operation_type: 'order_refund', before_cents: '10000', after_cents: '10000', source_type: 'order', source_id: o.id, effect: 'refund', result_resource_id: o.order_id }
  ]) {
    await rejects(q => journal(q, extra), { code: '23514', constraint: 'financial_delta_direction' });
  }
});

test('migration-shaped journal evidence preserves value and identifies the actual existing target', async () => {
  const migration = { operation_type: 'balance_migration', source_type: 'user', source_id: H.OWNER,
    effect: 'migration', before_cents: MAX, after_cents: MAX };
  expect(await journal(query, migration)).toMatchObject({ delta_cents: '0', source_user_id: H.OWNER,
    result_balance_cents: MAX, result_balance: '90071992547409.91' });
  await rejects(q => journal(q, { ...migration, source_id: H.OTHER }), { code: '23514', constraint: 'financial_source_contract' });
  await rejects(q => journal(q, { ...migration, after_cents: '0' }), { code: '23514', constraint: 'financial_delta_direction' });
});

test('journal rejects identity and evidence rewrites deletion and cascading truncation while retaining every row', async () => {
  const j = await journal(query);
  // Existing coordinator :1392 covers reason UPDATE. These are other immutable
  // columns and the previously unexecuted DELETE / statement TRUNCATE paths.
  for (const [column, value] of [['id', randomUUID()], ['actor_id', H.OTHER], ['user_id', H.OTHER],
    ['idempotency_key', 'replacement'], ['payload_hash', 'b'.repeat(64)], ['before_cents', '9999'],
    ['after_cents', '12501'], ['result_resource_id', 'replacement'], ['created_at', '2025-01-01T00:00:00Z']]) {
    await rejects(q => q(`UPDATE public.financial_operations SET ${column}=$1 WHERE id=$2::UUID`, [value, j.id]),
      { code: '23514', message: 'FINANCIAL_JOURNAL_APPEND_ONLY' });
  }
  await rejects(q => q('DELETE FROM public.financial_operations WHERE id=$1::UUID', [j.id]),
    { code: '23514', message: 'FINANCIAL_JOURNAL_APPEND_ONLY' });
  // Include actual referencing rows so CASCADE cannot replace the append guard
  // with an unrelated "referenced in a foreign key" error.
  await commit(q => orderPair(q));
  await commit(q => approvePair(q));
  await rejects(q => q('TRUNCATE public.financial_operations CASCADE'),
    { code: '23514', message: 'FINANCIAL_JOURNAL_APPEND_ONLY' });
});

// UNIQUENESS / RESOURCE EVIDENCE — 5 registrations / cases.
test('journal idempotency is scoped by actor operation and case-sensitive key while source-free rows coexist', async () => {
  await journal(query, { idempotency_key: 'Scope-Key' });
  for (const payload_hash of [HASH, 'b'.repeat(64)]) {
    await rejects(q => journal(q, { idempotency_key: 'Scope-Key', payload_hash }),
      { code: '23505', constraint: 'financial_actor_operation_idempotency' });
  }
  const history = (await indexCatalog()).find(x => x.index_name === 'financial_user_history');
  expect(history).toMatchObject({ table_name: 'financial_operations', is_unique: false, is_valid: true, is_ready: true, predicate: null });
  expect(history.definition).toContain('(user_id, created_at DESC, id DESC)');
  await journal(query, { actor_id: H.OTHER, idempotency_key: 'Scope-Key' });
  await journal(query, { idempotency_key: 'scope-key' });
  await journal(query, { idempotency_key: 'Scope-Key', operation_type: 'balance_migration',
    source_type: 'user', source_id: H.OWNER, effect: 'migration', before_cents: '10000', after_cents: '10000' });
  const rows = (await query('SELECT * FROM public.financial_operations ORDER BY id')).rows;
  expect(rows).toHaveLength(4);
  expect(rows.filter(x => x.source_type === null)).toHaveLength(3);
});

test('source-effect uniqueness spans actors but separates source types and original debit from refund', async () => {
  const source = H.OWNER; // Same UUID is valid in each independent resource table.
  await journal(query, { source_type: 'adjustment', source_id: source, effect: 'adjustment' });
  await rejects(q => journal(q, { actor_id: H.OTHER, source_type: 'adjustment', source_id: source, effect: 'adjustment' }),
    { code: '23505', constraint: 'financial_source_effect_once' });
  await journal(query, { operation_type: 'balance_migration', source_type: 'user', source_id: source,
    effect: 'migration', before_cents: '10000', after_cents: '10000' });
  const { o } = await commit(q => orderPair(q, { id: source }));
  await commit(q => approvePair(q, { id: source }));
  const coordinator = createFinancialCoordinator({ poolProvider: () => db.pool });
  await coordinator.cancelOrder({ principal: H.principal(H.ADMIN), orderId: o.order_id,
    idempotencyKey: 'scope-refund', reason: 'Reviewed full refund' });
  const rows = (await query('SELECT source_type,effect FROM public.financial_operations WHERE source_id=$1::UUID ORDER BY source_type,effect', [source])).rows;
  expect(rows).toEqual([{ source_type: 'adjustment', effect: 'adjustment' }, { source_type: 'order', effect: 'debit' },
    { source_type: 'order', effect: 'refund' }, { source_type: 'payment', effect: 'credit' }, { source_type: 'user', effect: 'migration' }]);
});

test('order cross-table evidence rejects mismatched receipts and unpaired refunds and rolls back account writes', async () => {
  const prior = await commit(q => orderPair(q));
  for (const options of [
    { journal: { after_cents: '8950' } }, { journal: { idempotency_key: 'other-key' } },
    { journal: { payload_hash: 'b'.repeat(64) } }, { journal: { result_resource_id: 'other-order' } },
    { order: { request_result_balance_cents: '8999' } },
    { order: { request_result_operation_reference: prior.j.id } }
  ]) {
    await rejects(async q => {
      await q('UPDATE public.users SET balance_cents=9000 WHERE id=$1::UUID', [H.OWNER]);
      await orderPair(q, options);
    }, { code: '23514', message: 'ORDER_DEBIT_EVIDENCE_MISMATCH' });
  }
  await rejects(q => orderPair(q, { order: { request_result_user_reference: H.OTHER } }),
    { code: '23514', message: 'ORDER_RECEIPT_OWNER_MISMATCH' });
  await rejects(q => journal(q, { operation_type: 'order_refund', source_type: 'order', source_id: prior.o.id,
    effect: 'refund', result_resource_id: prior.o.order_id, before_cents: '9000', after_cents: '10000' }),
    { code: '23514', message: 'UNCANCELLED_ORDER_CANNOT_HAVE_REFUND' });
  // A real, existing journal FK (not a nonexistent UUID) with the wrong kind.
  const unrelated = await journal(query);
  await rejects(q => q(`UPDATE public.orders SET status='cancelled',decision_actor_id=$1::UUID,
    decision_type='cancel',decision_idempotency_key='bad-refund',decision_payload_hash=$2,
    decision_reason='Reviewed refund',decided_at=CURRENT_TIMESTAMP,decision_result_user_reference=$3,
    decision_result_operation_reference=$4::UUID::TEXT,decision_result_balance_cents=10000,
    refund_operation_id=$4::UUID,refund_amount_cents=charge_cents,refunded_at=CURRENT_TIMESTAMP WHERE id=$5::UUID`,
  [H.ADMIN, HASH, H.OWNER, unrelated.id, prior.o.id]), { code: '23514', message: 'ORDER_REFUND_EVIDENCE_MISMATCH' });
});

test('payment cross-table evidence rejects mismatched credits and pending-source credits with complete fixtures', async () => {
  const prior = await commit(q => approvePair(q));
  expect(prior.p).toMatchObject({ amount: '10.00', amount_in_usd: '15.00', decision_result_balance: '115.00' });
  for (const options of [
    { journal: { after_cents: '11501' } }, { journal: { actor_id: H.OTHER } },
    { journal: { user_id: H.OTHER } }, { journal: { idempotency_key: 'other-key' } },
    { journal: { payload_hash: 'b'.repeat(64) } }, { journal: { reason: 'Other reason' } },
    { journal: { result_resource_id: 'other-payment' } },
    { decision: { decision_result_balance_cents: '11501' } },
    { decision: { decision_result_operation_reference: prior.j.id } }
  ]) {
    await rejects(async q => {
      await q('UPDATE public.users SET balance_cents=11500 WHERE id=$1::UUID', [H.OWNER]);
      await approvePair(q, options);
    }, { code: '23514', message: 'PAYMENT_JOURNAL_EVIDENCE_MISMATCH' });
  }
  await rejects(q => approvePair(q, { decision: { decision_result_user_reference: H.OTHER } }),
    { code: '23514', message: 'PAYMENT_RECEIPT_OWNER_MISMATCH' });
  const pending = await pendingPayment(query);
  await rejects(q => journal(q, { operation_type: 'payment_credit', source_type: 'payment', source_id: pending.id,
    effect: 'credit', result_resource_id: pending.payment_id, before_cents: '10000', after_cents: '11500' }),
    { code: '23514', message: 'UNAPPROVED_PAYMENT_CANNOT_HAVE_CREDIT' });
});

test('resource guards retain immutable claims snapshots and terminal decisions across update delete and truncate', async () => {
  const { p } = await commit(q => approvePair(q));
  const { o } = await commit(q => orderPair(q));
  for (const [field, value] of [['claimed_amount_minor', '1100'], ['receipt_public_id', `private_payment_receipts/${randomUUID()}`],
    ['user_id', H.OTHER], ['decision_reason', 'Replacement reason'], ['status', 'pending']]) {
    await rejects(q => q(`UPDATE public.payments SET ${field}=$1 WHERE id=$2::UUID`, [value, p.id]),
      { code: '23514', message: 'UNSAFE_PAYMENT_UPDATE' });
  }
  for (const [field, value] of [['catalog_product_name', 'Replacement snapshot'], ['request_payload_hash', 'b'.repeat(64)],
    ['charge_cents', '1100'], ['user_id', H.OTHER]]) {
    await rejects(q => q(`UPDATE public.orders SET status='completed',decision_actor_id=$1::UUID,
      decision_type='complete',decision_idempotency_key='immutable-test',decision_payload_hash=$2,
      decision_reason='Reviewed completion',decided_at=CURRENT_TIMESTAMP,decision_result_user_reference=$3,
      ${field}=$4 WHERE id=$5::UUID`, [H.ADMIN, HASH, H.OWNER, value, o.id]),
    { code: '23514', message: 'UNSAFE_ORDER_UPDATE' });
  }
  for (const [table, id, message] of [['orders', o.id, 'ORDER_DELETE_OR_TRUNCATE_DISABLED'],
    ['payments', p.id, 'PAYMENT_DELETE_OR_TRUNCATE_DISABLED']]) {
    await rejects(q => q(`DELETE FROM public.${table} WHERE id=$1::UUID`, [id]), { code: '23514', message });
    await rejects(q => q(`TRUNCATE public.${table} CASCADE`), { code: '23514', message });
  }
});

// REAL INDEX READINESS — 11 expanded cases. No constraint/trigger is disabled
// or weakened: rename the original guard, retain its enforcement, and (except
// missing-name variants) add an incompatible same-named shadow index. Runtime
// must refuse the catalog READ ONLY and must never repair it. Finally restore
// the exact original names. Migrations and their ledger remain untouched.
async function indexCatalog() {
  return (await query(`SELECT t.relname AS table_name,x.relname AS index_name,i.indisunique AS is_unique,
    i.indisvalid AS is_valid,i.indisready AS is_ready,pg_get_expr(i.indpred,i.indrelid) AS predicate,
    pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i
    JOIN pg_class t ON t.oid=i.indrelid JOIN pg_class x ON x.oid=i.indexrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY x.relname`)).rows;
}
async function readinessDrift({ index, replacement }) {
  const before = await snapshot();
  const original = await indexCatalog();
  const migrations = (await query('SELECT * FROM public.schema_migrations ORDER BY version')).rows;
  expect(await verifyRuntime({ poolProvider: () => db.pool })).toEqual({ verified: true, migrations: 5 });
  const retained = `${index}_retained`;
  await commit(async q => {
    await q(`ALTER INDEX public.${index} RENAME TO ${retained}`);
    if (replacement) await q(replacement);
  });
  try {
    const drifted = await indexCatalog();
    const guard = drifted.find(x => x.index_name === retained);
    expect(guard).toMatchObject({ is_unique: true, is_valid: true, is_ready: true });
    const approved = original.find(x => x.index_name === index);
    expect(guard.predicate).toBe(approved.predicate);
    expect(guard.definition.replace(retained, index)).toBe(approved.definition);
    const shadow = drifted.find(x => x.index_name === index);
    if (!replacement) expect(shadow).toBeUndefined();
    else expect(shadow).toBeDefined();
    const events = [], releases = [];
    const poolProvider = () => ({ connect: async () => {
      const c = await db.pool.connect();
      return { connection: c.connection, query: config => { events.push(config.text); return c.query(config); },
        release: broken => { releases.push(Boolean(broken)); c.release(broken); } };
    } });
    await expect(verifyRuntime({ poolProvider })).rejects.toMatchObject({
      code: 'PG_BOOTSTRAP_SCHEMA_MISMATCH', message: 'PG_BOOTSTRAP_SCHEMA_MISMATCH'
    });
    expect(events[0]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(events.at(-1)).toBe('ROLLBACK');
    expect(events).not.toContain('COMMIT');
    expect(events.every(text => /^(BEGIN|SET LOCAL|SELECT|ROLLBACK)/.test(text))).toBe(true);
    expect(releases).toEqual([false]);
    expect(await indexCatalog()).toEqual(drifted); // no automatic repair
    expect(await snapshot()).toEqual(before);
    expect((await query('SELECT * FROM public.schema_migrations ORDER BY version')).rows).toEqual(migrations);
  } finally {
    await commit(async q => {
      if (replacement) await q(`DROP INDEX public.${index}`); // only the test-created shadow
      await q(`ALTER INDEX public.${retained} RENAME TO ${index}`);
    });
  }
  expect(await indexCatalog()).toEqual(original);
  expect(await verifyRuntime({ poolProvider: () => db.pool })).toEqual({ verified: true, migrations: 5 });
}

// Exact historical obligations: FS-013, FS-014, FS-015, FS-017 / D191.
test.each([
  ['missing', { index: 'financial_actor_operation_idempotency' }],
  ['notUnique', { index: 'financial_actor_operation_idempotency', replacement: 'CREATE INDEX financial_actor_operation_idempotency ON public.financial_operations (actor_id,operation_type,idempotency_key)' }],
  ['wrongPartial', { index: 'financial_source_effect_once', replacement: "CREATE UNIQUE INDEX financial_source_effect_once ON public.financial_operations (source_type,source_id,effect) WHERE source_type='order' AND source_id IS NOT NULL AND effect IS NOT NULL" }],
  ['wrongKeyOrder', { index: 'financial_actor_operation_idempotency', replacement: 'CREATE UNIQUE INDEX financial_actor_operation_idempotency ON public.financial_operations (operation_type,actor_id,idempotency_key)' }]
])('journal index readiness rejects %s without weakening enforcement or repairing schema', async (_, spec) => {
  await readinessDrift(spec);
});

// Exact historical obligations: FS-020, FS-021, FS-022 / D192.
test.each([
  ['missing', { index: 'payment_actor_decision_idempotency' }],
  ['notUnique', { index: 'payment_actor_decision_idempotency', replacement: 'CREATE INDEX payment_actor_decision_idempotency ON public.payments (decision_actor_id,decision_type,decision_idempotency_key) WHERE decision_actor_id IS NOT NULL' }],
  ['wrongPartial', { index: 'payment_actor_decision_idempotency', replacement: "CREATE UNIQUE INDEX payment_actor_decision_idempotency ON public.payments (decision_actor_id,decision_type,decision_idempotency_key) WHERE decision_actor_id IS NOT NULL AND decision_type='approve'" }]
])('payment decision index readiness rejects %s without weakening enforcement or repairing schema', async (_, spec) => {
  await readinessDrift(spec);
});

// Exact historical obligations: FS-026, FS-027, FS-028, FS-030 / D193.
// Purchase uniqueness is unconditional SQL. The partial-index counterpart is
// the actual order DECISION index, not an invented partial purchase constraint.
test.each([
  ['missing', { index: 'order_actor_purchase_idempotency' }],
  ['notUnique', { index: 'order_actor_purchase_idempotency', replacement: 'CREATE INDEX order_actor_purchase_idempotency ON public.orders (request_actor_id,request_idempotency_key)' }],
  ['wrongPartial', { index: 'order_actor_decision_idempotency', replacement: "CREATE UNIQUE INDEX order_actor_decision_idempotency ON public.orders (decision_actor_id,decision_type,decision_idempotency_key) WHERE decision_actor_id IS NOT NULL AND decision_type='cancel'" }],
  ['wrongKeyOrder', { index: 'order_actor_purchase_idempotency', replacement: 'CREATE UNIQUE INDEX order_actor_purchase_idempotency ON public.orders (request_idempotency_key,request_actor_id)' }]
])('order replay index readiness rejects %s without weakening enforcement or repairing schema', async (_, spec) => {
  await readinessDrift(spec);
});
