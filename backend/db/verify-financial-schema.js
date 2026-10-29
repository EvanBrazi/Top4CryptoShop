'use strict';

// Stage-specific, READ ONLY schema verification after approved migrations 001-004.
// Never activates drafts, applies migrations, or reads/writes application rows.
const path = require('node:path');
const { connectionOptions } = require('./connection');
const { loadMigrations, pendingMigrations } = require('./migrate');
const fail = code => Object.assign(new Error(code), { code });
const FILES = ['001_create_users_table.sql', '002_create_financial_operations_table.sql',
  '003_create_payments_table.sql', '004_create_orders_table.sql'];
const TABLES = ['schema_migrations', 'users', 'financial_operations', 'payments', 'orders'];
const FINANCIAL_TABLES = TABLES.slice(2);

// Key types and generation markers, not an assertion of every expression's semantics.
const COLUMNS = {
  users: { id: ['uuid', false], balance_cents: ['bigint', false], balance: ['numeric', true], email_verified: ['boolean', false] },
  financial_operations: { id: ['uuid', false], actor_id: ['uuid', false], user_id: ['uuid', false],
    before_cents: ['bigint', false], after_cents: ['bigint', false], delta_cents: ['bigint', true],
    source_user_id: ['uuid', true], source_payment_id: ['uuid', true], source_order_id: ['uuid', true],
    result_balance_cents: ['bigint', true], result_balance: ['text', true] },
  payments: { id: ['uuid', false], user_id: ['uuid', false], submission_version: ['smallint', false],
    claimed_amount_minor: ['bigint', false], amount: ['numeric', true], amount_cents: ['bigint', false],
    amount_in_usd: ['numeric', true], decision_operation_id: ['uuid', false], decision_result_balance: ['text', true] },
  orders: { id: ['uuid', false], user_id: ['uuid', false], financial_version: ['smallint', false],
    quantity: ['bigint', false], charge_cents: ['bigint', false], amount: ['numeric', true], method: ['text', true],
    service: ['text', true], debit_operation_id: ['uuid', false], refund_operation_id: ['uuid', false],
    refund_amount_cents: ['bigint', false], fulfillment_target: ['text', false],
    request_result_balance: ['text', true], decision_result_balance: ['text', true] }
};
const REQUIRED_NOT_NULL = {
  users: ['id', 'balance_cents', 'email_verified'],
  financial_operations: ['id', 'actor_id', 'user_id', 'before_cents', 'after_cents'],
  payments: ['id', 'user_id', 'submission_version', 'claimed_amount_minor'],
  orders: ['id', 'user_id', 'financial_version', 'quantity', 'charge_cents', 'debit_operation_id']
};
const CHECKS = {
  financial_operations: ['financial_delta_direction', 'financial_source_contract'],
  payments: ['payment_claim_policy', 'payment_state_evidence'],
  orders: ['order_purchase_actor_is_owner', 'order_catalog_category_file', 'order_quantity_charge_bounds',
    'order_category_limits', 'order_selection_exact_pricing', 'order_fulfillment_policy',
    'order_fulfillment_canonical_shape', 'order_state_evidence']
};
// [table, local column, referenced table, initially deferred]
const FKS = [
  ['financial_operations', 'actor_id', 'users', false], ['financial_operations', 'user_id', 'users', false],
  ['financial_operations', 'source_user_id', 'users', true], ['financial_operations', 'source_payment_id', 'payments', true],
  ['financial_operations', 'source_order_id', 'orders', true], ['payments', 'user_id', 'users', false],
  ['payments', 'decision_actor_id', 'users', false], ['payments', 'decision_operation_id', 'financial_operations', true],
  ['orders', 'user_id', 'users', false], ['orders', 'request_actor_id', 'users', false],
  ['orders', 'decision_actor_id', 'users', false], ['orders', 'debit_operation_id', 'financial_operations', true],
  ['orders', 'refund_operation_id', 'financial_operations', true]
];
// PostgreSQL tgtype bits: ROW=1, BEFORE=2, INSERT=4, DELETE=8, UPDATE=16, TRUNCATE=32.
const TRIGGERS = [
  ['financial_operations', 'financial_no_update_delete', 'financial_append_only_guard', 27, false],
  ['financial_operations', 'financial_no_truncate', 'financial_append_only_guard', 34, false],
  ['payments', 'payment_immutable_rows', 'payment_immutable_guard', 31, false],
  ['payments', 'payment_no_truncate', 'payment_immutable_guard', 34, false],
  ['orders', 'order_immutable_rows', 'order_immutable_guard', 31, false],
  ['orders', 'order_no_truncate', 'order_immutable_guard', 34, false],
  ['payments', 'payment_decision_journal_guard', 'payment_journal_evidence_guard', 21, true],
  ['financial_operations', 'payment_credit_source_guard', 'payment_journal_evidence_guard', 5, true],
  ['orders', 'order_financial_evidence_guard', 'order_journal_evidence_guard', 21, true],
  ['financial_operations', 'order_journal_source_guard', 'order_journal_evidence_guard', 5, true]
];
const UNIQUE_INDEXES = {
  financial_operations: { financial_operations_pkey: ['id'], financial_operations_legacy_mongo_id_key: ['legacy_mongo_id'],
    financial_actor_operation_idempotency: ['actor_id', 'operation_type', 'idempotency_key'],
    financial_source_effect_once: ['source_type', 'source_id', 'effect'] },
  payments: { payments_pkey: ['id'], payments_legacy_mongo_id_key: ['legacy_mongo_id'], payments_payment_id_key: ['payment_id'],
    payments_decision_operation_id_key: ['decision_operation_id'],
    payment_actor_decision_idempotency: ['decision_actor_id', 'decision_type', 'decision_idempotency_key'] },
  orders: { orders_pkey: ['id'], orders_legacy_mongo_id_key: ['legacy_mongo_id'], orders_order_id_key: ['order_id'],
    orders_debit_operation_id_key: ['debit_operation_id'], orders_refund_operation_id_key: ['refund_operation_id'],
    order_actor_purchase_idempotency: ['request_actor_id', 'request_idempotency_key'],
    order_actor_decision_idempotency: ['decision_actor_id', 'decision_type', 'decision_idempotency_key'] }
};
const PREDICATES = {
  financial_source_effect_once: 'source_type IS NOT NULL AND source_id IS NOT NULL AND effect IS NOT NULL',
  payment_actor_decision_idempotency: 'decision_actor_id IS NOT NULL',
  order_actor_decision_idempotency: 'decision_actor_id IS NOT NULL'
};
const normalizePredicate = text => text.replace(/[()"\s]/g, '').toLowerCase();

function validateCatalog({ tables, columns, constraints, triggers, indexes, publicGrants }) {
  if (tables.length !== TABLES.length || TABLES.some(name => !tables.some(row =>
    row.table_schema === 'public' && row.table_name === name && row.table_type === 'BASE TABLE'))) throw fail('PG_FINANCIAL_TABLE_MISMATCH');
  for (const [table, expected] of Object.entries(COLUMNS)) {
    for (const [column, [type, generated]] of Object.entries(expected)) {
      const row = columns.find(item => item.table_name === table && item.column_name === column);
      if (!row || row.data_type !== type || row.is_generated !== (generated ? 'ALWAYS' : 'NEVER') ||
          (REQUIRED_NOT_NULL[table].includes(column) && row.is_nullable !== 'NO')) throw fail('PG_FINANCIAL_COLUMN_MISMATCH');
      if (generated && !row.generation_expression) throw fail('PG_FINANCIAL_GENERATION_MISSING');
      if (['submission_version', 'financial_version'].includes(column) && row.column_default !== null) throw fail('PG_FINANCIAL_VERSION_DEFAULT');
    }
  }
  if (constraints.some(row => row.validated !== true)) throw fail('PG_FINANCIAL_CONSTRAINT_UNVALIDATED');
  for (const [table, names] of Object.entries(CHECKS)) {
    if (names.some(name => !constraints.some(row => row.table_name === table && row.constraint_name === name && row.constraint_type === 'c'))) {
      throw fail('PG_FINANCIAL_CHECK_MISSING');
    }
  }
  for (const [table, column, target, deferred] of FKS) {
    const row = constraints.find(item => item.table_name === table && item.constraint_type === 'f' &&
      item.column_names?.length === 1 && item.column_names[0] === column);
    if (!row || row.referenced_schema !== 'public' || row.referenced_table !== target ||
        row.referenced_columns?.length !== 1 || row.referenced_columns[0] !== 'id' || row.delete_action !== 'r' ||
        row.deferrable !== deferred || row.initially_deferred !== deferred) throw fail('PG_FINANCIAL_FK_MISMATCH');
  }
  for (const [table, name, fn, type, deferred] of TRIGGERS) {
    const row = triggers.find(item => item.table_name === table && item.trigger_name === name);
    if (!row || row.function_schema !== 'public' || row.function_name !== fn || row.function_security_definer !== false ||
        row.enabled !== 'O' || row.trigger_type !== type || row.deferrable !== deferred || row.initially_deferred !== deferred) {
      throw fail('PG_FINANCIAL_TRIGGER_MISMATCH');
    }
  }
  for (const [table, expected] of Object.entries(UNIQUE_INDEXES)) {
    for (const [name, keys] of Object.entries(expected)) {
      const row = indexes.find(item => item.table_name === table && item.index_name === name);
      if (!row || row.is_unique !== true || row.is_valid !== true || row.is_ready !== true ||
          JSON.stringify(row.column_names) !== JSON.stringify(keys)) throw fail('PG_FINANCIAL_UNIQUE_INDEX_MISSING');
      const predicate = PREDICATES[name];
      if (predicate ? (!row.predicate || normalizePredicate(row.predicate) !== normalizePredicate(predicate)) : row.predicate !== null) {
        throw fail('PG_FINANCIAL_PARTIAL_INDEX_MISMATCH');
      }
    }
  }
  if (publicGrants.length) throw fail('PG_FINANCIAL_PUBLIC_TABLE_GRANT');
}

async function verifyFinancialSchema({ env = process.env, ClientClass, loadFiles = loadMigrations } = {}) {
  const files = await loadFiles();
  if (files.length !== FILES.length || files.some((file, i) => file.version !== i + 1 || file.filename !== FILES[i])) {
    throw fail('PG_FINANCIAL_ACTIVE_INVENTORY_UNEXPECTED');
  }
  const options = connectionOptions(env, 'DIRECT_URL', { direct: true });
  const Client = ClientClass || require('pg').Client;
  const client = new Client({ ...options, application_name: 'top4cryptoshop-verify-financial-schema', query_timeout: 15000 });
  client.on('error', () => {});
  let transaction = false;
  try {
    await client.connect();
    const tls = client.connection?.stream;
    if (tls?.encrypted !== true || tls.authorized !== true) throw fail('PG_FINANCIAL_TLS_UNVERIFIED');
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transaction = true;
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query('SET LOCAL search_path = pg_catalog, public');
    const tables = (await client.query(`SELECT table_schema, table_name, table_type FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::TEXT[]) ORDER BY table_name`, [TABLES])).rows;
    if (tables.length !== TABLES.length) throw fail('PG_FINANCIAL_TABLE_MISMATCH');
    const ledger = (await client.query(`SELECT version, filename, checksum, applied_at::TEXT AS applied_at
      FROM public.schema_migrations ORDER BY version`)).rows;
    if (ledger.length !== files.length || pendingMigrations(files, ledger).length) throw fail('PG_FINANCIAL_LEDGER_MISMATCH');
    const columns = (await client.query(`SELECT table_name, column_name, data_type, is_nullable,
      is_generated, generation_expression, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1::TEXT[]) ORDER BY table_name, ordinal_position`, [TABLES.slice(1)])).rows;
    const constraints = (await client.query(`SELECT t.relname AS table_name, c.conname AS constraint_name,
      c.contype AS constraint_type, c.convalidated AS validated, c.condeferrable AS deferrable,
      c.condeferred AS initially_deferred, c.confdeltype AS delete_action,
      rn.nspname AS referenced_schema, rt.relname AS referenced_table,
      ARRAY(SELECT a.attname::TEXT FROM unnest(c.conkey) WITH ORDINALITY k(num, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.num ORDER BY k.ord) AS column_names,
      ARRAY(SELECT a.attname::TEXT FROM unnest(c.confkey) WITH ORDINALITY k(num, ord)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.num ORDER BY k.ord) AS referenced_columns,
      pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
      LEFT JOIN pg_class rt ON rt.oid = c.confrelid LEFT JOIN pg_namespace rn ON rn.oid = rt.relnamespace
      WHERE n.nspname = 'public' AND t.relname = ANY($1::TEXT[]) ORDER BY t.relname, c.conname`, [FINANCIAL_TABLES])).rows;
    const triggers = (await client.query(`SELECT t.relname AS table_name, g.tgname AS trigger_name,
      g.tgenabled AS enabled, g.tgtype AS trigger_type, g.tgdeferrable AS deferrable,
      g.tginitdeferred AS initially_deferred, p.proname AS function_name, pn.nspname AS function_schema,
      p.prosecdef AS function_security_definer, pg_get_triggerdef(g.oid) AS definition
      FROM pg_trigger g JOIN pg_class t ON t.oid = g.tgrelid JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_proc p ON p.oid = g.tgfoid JOIN pg_namespace pn ON pn.oid = p.pronamespace
      WHERE n.nspname = 'public' AND t.relname = ANY($1::TEXT[]) AND NOT g.tgisinternal
      ORDER BY t.relname, g.tgname`, [FINANCIAL_TABLES])).rows;
    const indexes = (await client.query(`SELECT t.relname AS table_name, x.relname AS index_name,
      i.indisunique AS is_unique, i.indisvalid AS is_valid, i.indisready AS is_ready,
      pg_get_expr(i.indpred, i.indrelid) AS predicate, pg_get_indexdef(i.indexrelid) AS definition,
      ARRAY(SELECT a.attname::TEXT FROM unnest(i.indkey) WITH ORDINALITY k(num, ord)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.num
        WHERE k.ord <= i.indnkeyatts ORDER BY k.ord) AS column_names
      FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_class x ON x.oid = i.indexrelid
      WHERE n.nspname = 'public' AND t.relname = ANY($1::TEXT[]) ORDER BY t.relname, x.relname`, [FINANCIAL_TABLES])).rows;
    const publicGrants = (await client.query(`SELECT t.relname AS table_name, a.privilege_type
      FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace,
      LATERAL aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
      WHERE n.nspname = 'public' AND t.relname = ANY($1::TEXT[]) AND a.grantee = 0
      ORDER BY t.relname, a.privilege_type`, [FINANCIAL_TABLES])).rows;
    validateCatalog({ tables, columns, constraints, triggers, indexes, publicGrants });
    await client.query('COMMIT');
    transaction = false;
    return { tables, ledger, checksumMatches: true, catalogChecksPassed: true,
      columns, constraints, triggers, indexes, publicGrants };
  } finally {
    if (transaction) { try { await client.query('ROLLBACK'); } catch (_) {} }
    await client.end();
  }
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: false, quiet: true });
  const result = await verifyFinancialSchema();
  console.log(JSON.stringify(result, null, 2));
  console.log('TLS: encrypted and certificate verified');
  console.log('Client closed. Read-only schema verification; no DDL or application-row access.');
}
if (require.main === module) main().catch(cause => {
  const code = typeof cause.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(cause.code) ? cause.code : 'PG_FINANCIAL_VERIFY_ERROR';
  console.error(`Verification stopped: ${code}`);
  process.exitCode = 1;
});
module.exports = { verifyFinancialSchema, validateCatalog };
