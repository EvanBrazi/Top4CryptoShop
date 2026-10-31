'use strict';

// Fake catalog fixtures only: these tests never execute the financial SQL.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { verifyFinancialSchema, validateCatalog } = require('../db/verify-financial-schema');
const env = { DIRECT_URL: 'postgresql://owned:owned-password@db.example.test/owned_db?sslmode=verify-full' };
const names = ['001_create_users_table.sql', '002_create_financial_operations_table.sql', '003_create_payments_table.sql', '004_create_orders_table.sql'];
const files = names.map((filename, i) => {
  const active = path.join(__dirname, '../db/migrations', filename);
  const draft = path.join(__dirname, '../db/drafts', filename);
  const sql = fs.readFileSync(fs.existsSync(active) ? active : draft, 'utf8');
  return { version: i + 1, filename, checksum: createHash('sha256').update(sql).digest('hex'), sql };
});

function catalog() {
  const tables = ['schema_migrations', 'users', 'financial_operations', 'payments', 'orders']
    .map(table_name => ({ table_schema: 'public', table_name, table_type: 'BASE TABLE' }));
  const columns = [], constraints = [], triggers = [], indexes = [];
  const typeNames = { UUID: 'uuid', BIGINT: 'bigint', SMALLINT: 'smallint', INTEGER: 'integer', BOOLEAN: 'boolean',
    TEXT: 'text', VARCHAR: 'character varying', NUMERIC: 'numeric' };
  files.forEach(({ sql }, i) => {
    const table = ['users', 'financial_operations', 'payments', 'orders'][i];
    const start = sql.indexOf(`CREATE TABLE public.${table} (`);
    const body = sql.slice(start).split('\n);')[0];
    const fields = [...body.matchAll(/^    ([a-z][a-z0-9_]+) (UUID|BIGINT|SMALLINT|INTEGER|BOOLEAN|TEXT|VARCHAR|NUMERIC)\b/gm)];
    const firstConstraint = body.indexOf('\n    CONSTRAINT');
    fields.forEach((match, n) => {
      const end = fields[n + 1]?.index ?? (firstConstraint >= 0 ? firstConstraint : body.length);
      const declaration = body.slice(match.index, end);
      const generated = declaration.includes('GENERATED ALWAYS AS');
      columns.push({ table_name: table, column_name: match[1], data_type: typeNames[match[2]],
        is_nullable: declaration.includes('NOT NULL') || declaration.includes('PRIMARY KEY') ? 'NO' : 'YES',
        is_generated: generated ? 'ALWAYS' : 'NEVER', generation_expression: generated ? 'owned expression fixture' : null,
        column_default: null });
      if (i && /\b(PRIMARY KEY|UNIQUE)\b/.test(declaration)) indexes.push({ table_name: table,
        index_name: declaration.includes('PRIMARY KEY') ? `${table}_pkey` : `${table}_${match[1]}_key`,
        is_unique: true, is_valid: true, is_ready: true, predicate: null, column_names: [match[1]] });
    });
    if (i) {
      for (const match of body.matchAll(/CONSTRAINT ([a-z_]+)\s+CHECK/g)) constraints.push({
        table_name: table, constraint_name: match[1], constraint_type: 'c', validated: true });
      for (const match of body.matchAll(/CONSTRAINT ([a-z_]+)\s+UNIQUE\s*\(([^)]+)\)/g)) indexes.push({
        table_name: table, index_name: match[1], is_unique: true, is_valid: true, is_ready: true,
        predicate: null, column_names: match[2].split(',').map(key => key.trim()) });
      for (const match of sql.matchAll(/CREATE UNIQUE INDEX ([a-z_]+)\s+ON public\.([a-z_]+)\s*\(([^)]+)\)(?:\s+WHERE ([\s\S]*?))?;/g)) indexes.push({
        table_name: match[2], index_name: match[1], is_unique: true, is_valid: true, is_ready: true,
        predicate: match[4] ?? null, column_names: match[3].split(',').map(key => key.trim()) });
      for (const match of sql.matchAll(/CREATE(?: CONSTRAINT)? TRIGGER ([a-z_]+)\s+(BEFORE|AFTER) ([\s\S]*?)\s+ON public\.([a-z_]+)([\s\S]*?)FOR EACH (ROW|STATEMENT)\s+EXECUTE FUNCTION public\.([a-z_]+)\(\);/g)) {
        const bits = { INSERT: 4, DELETE: 8, UPDATE: 16, TRUNCATE: 32 };
        const type = (match[2] === 'BEFORE' ? 2 : 0) + (match[6] === 'ROW' ? 1 : 0) +
          match[3].trim().split(/\s+OR\s+/).reduce((sum, event) => sum + bits[event], 0);
        const deferred = match[5].includes('DEFERRABLE INITIALLY DEFERRED');
        triggers.push({ table_name: match[4], trigger_name: match[1], function_schema: 'public', function_name: match[7],
          function_security_definer: false, enabled: 'O', trigger_type: type, deferrable: deferred, initially_deferred: deferred });
      }
    }
  });
  const fks = [
    ['financial_operations', 'actor_id', 'users', false], ['financial_operations', 'user_id', 'users', false],
    ['financial_operations', 'source_user_id', 'users', true], ['financial_operations', 'source_payment_id', 'payments', true],
    ['financial_operations', 'source_order_id', 'orders', true], ['payments', 'user_id', 'users', false],
    ['payments', 'decision_actor_id', 'users', false], ['payments', 'decision_operation_id', 'financial_operations', true],
    ['orders', 'user_id', 'users', false], ['orders', 'request_actor_id', 'users', false],
    ['orders', 'decision_actor_id', 'users', false], ['orders', 'debit_operation_id', 'financial_operations', true],
    ['orders', 'refund_operation_id', 'financial_operations', true]
  ];
  for (const [table_name, column, referenced_table, deferred] of fks) constraints.push({ table_name,
    constraint_name: `${table_name}_${column}_fkey`, constraint_type: 'f', validated: true, column_names: [column],
    referenced_schema: 'public', referenced_table, referenced_columns: ['id'], delete_action: 'r',
    deferrable: deferred, initially_deferred: deferred });
  return { tables, columns, constraints, triggers, indexes, publicGrants: [] };
}

function fixture(behavior = {}) {
  const data = catalog();
  const ledger = files.map(({ version, filename, checksum }) => ({ version, filename, checksum, applied_at: 'owned fixture timestamp' }));
  const client = {
    on: jest.fn(), connection: { stream: { encrypted: true, authorized: true, ...behavior.tls } },
    connect: jest.fn(async () => { if (behavior.connectError) throw behavior.connectError; }), end: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(async sql => {
      if (sql.includes('information_schema.tables')) return { rows: behavior.tables ?? data.tables };
      if (sql.includes('FROM public.schema_migrations')) return { rows: behavior.ledger ?? ledger };
      if (sql.includes('information_schema.columns')) return { rows: data.columns };
      if (sql.includes('FROM pg_constraint')) return { rows: data.constraints };
      if (sql.includes('FROM pg_trigger')) return { rows: data.triggers };
      if (sql.includes('FROM pg_index')) return { rows: data.indexes };
      if (sql.includes('aclexplode')) return { rows: data.publicGrants };
      return { rows: [] };
    })
  };
  return { client, ClientClass: jest.fn().mockImplementation(() => client) };
}
const run = f => verifyFinancialSchema({ env, ClientClass: f.ClientClass, loadFiles: async () => files });

test('verifies four checksums and catalog guards with metadata-only SELECTs in a read-only transaction', async () => {
  const f = fixture();
  await expect(run(f)).resolves.toMatchObject({ checksumMatches: true, catalogChecksPassed: true, ledger: expect.any(Array) });
  const sql = f.client.query.mock.calls.map(([text]) => text);
  expect(sql[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  expect(sql.at(-1)).toBe('COMMIT');
  expect(sql.filter(text => text.startsWith('SELECT'))).toHaveLength(7);
  expect(sql.some(text => /\b(CREATE|INSERT|UPDATE|DELETE|TRUNCATE|ALTER|GRANT|REVOKE)\b/.test(text))).toBe(false);
  expect(sql.some(text => /FROM public\.(users|orders|payments|financial_operations)\b/.test(text))).toBe(false);
  expect(f.ClientClass).toHaveBeenCalledWith(expect.objectContaining({ ssl: expect.objectContaining({ rejectUnauthorized: true }) }));
  expect(f.client.end).toHaveBeenCalledTimes(1);
});

test('001-only inventory is rejected offline without activating drafts or connecting', async () => {
  const f = fixture();
  await expect(verifyFinancialSchema({ env, ClientClass: f.ClientClass, loadFiles: async () => files.slice(0, 1) })).rejects.toThrow('PG_FINANCIAL_ACTIVE_INVENTORY_UNEXPECTED');
  expect(f.ClientClass).not.toHaveBeenCalled();
});

test.each([{ encrypted: false }, { authorized: false }])('rejects unverified transport %j before queries', async tls => {
  const f = fixture({ tls }); await expect(run(f)).rejects.toThrow('PG_FINANCIAL_TLS_UNVERIFIED');
  expect(f.client.query).not.toHaveBeenCalled(); expect(f.client.end).toHaveBeenCalledTimes(1);
});

test('rejects missing tables without reading ledger or application rows', async () => {
  const f = fixture({ tables: [] }); await expect(run(f)).rejects.toThrow('PG_FINANCIAL_TABLE_MISMATCH');
  expect(f.client.query.mock.calls.at(-1)).toEqual(['ROLLBACK']); expect(f.client.end).toHaveBeenCalledTimes(1);
});

test('rejects a changed ledger checksum and rolls back', async () => {
  const f = fixture({ ledger: files.map(file => ({ ...file, checksum: 'f'.repeat(64) })) });
  await expect(run(f)).rejects.toThrow('PG_MIGRATION_HISTORY_MISMATCH');
  expect(f.client.query.mock.calls.at(-1)).toEqual(['ROLLBACK']); expect(f.client.end).toHaveBeenCalledTimes(1);
});

test('connect failure still closes the direct client', async () => {
  const f = fixture({ connectError: new Error('owned connection failure') });
  await expect(run(f)).rejects.toThrow('owned connection failure'); expect(f.client.end).toHaveBeenCalledTimes(1);
});

test('never uses DATABASE_URL as a migration-verification fallback', async () => {
  const f = fixture();
  await expect(verifyFinancialSchema({ env: { DATABASE_URL: env.DIRECT_URL }, ClientClass: f.ClientClass, loadFiles: async () => files })).rejects.toThrow('PG_URL_REQUIRED');
  expect(f.ClientClass).not.toHaveBeenCalled();
});

test.each([
  ['wrong integer type', data => { data.columns.find(c => c.column_name === 'charge_cents').data_type = 'numeric'; }, 'PG_FINANCIAL_COLUMN_MISMATCH'],
  ['nullable version', data => { data.columns.find(c => c.column_name === 'financial_version').is_nullable = 'YES'; }, 'PG_FINANCIAL_COLUMN_MISMATCH'],
  ['hydration version default', data => { data.columns.find(c => c.column_name === 'submission_version').column_default = '1'; }, 'PG_FINANCIAL_VERSION_DEFAULT'],
  ['missing generated expression', data => { data.columns.find(c => c.column_name === 'delta_cents').generation_expression = null; }, 'PG_FINANCIAL_GENERATION_MISSING'],
  ['unvalidated constraint', data => { data.constraints[0].validated = false; }, 'PG_FINANCIAL_CONSTRAINT_UNVALIDATED'],
  ['missing state check', data => { data.constraints = data.constraints.filter(c => c.constraint_name !== 'order_state_evidence'); }, 'PG_FINANCIAL_CHECK_MISSING'],
  ['wrong FK target', data => { data.constraints.find(c => c.constraint_type === 'f').referenced_table = 'payments'; }, 'PG_FINANCIAL_FK_MISMATCH'],
  ['cascading financial FK', data => { data.constraints.find(c => c.constraint_type === 'f').delete_action = 'c'; }, 'PG_FINANCIAL_FK_MISMATCH'],
  ['wrong deferred FK', data => { data.constraints.find(c => c.initially_deferred).initially_deferred = false; }, 'PG_FINANCIAL_FK_MISMATCH'],
  ['disabled trigger', data => { data.triggers[0].enabled = 'D'; }, 'PG_FINANCIAL_TRIGGER_MISMATCH'],
  ['wrong trigger function', data => { data.triggers[0].function_name = 'owned_wrong_function'; }, 'PG_FINANCIAL_TRIGGER_MISMATCH'],
  ['wrong trigger event', data => { data.triggers[0].trigger_type = 5; }, 'PG_FINANCIAL_TRIGGER_MISMATCH'],
  ['immediate evidence trigger', data => { data.triggers.find(t => t.deferrable).initially_deferred = false; }, 'PG_FINANCIAL_TRIGGER_MISMATCH'],
  ['invalid unique index', data => { data.indexes[0].is_valid = false; }, 'PG_FINANCIAL_UNIQUE_INDEX_MISSING'],
  ['wrong idempotency keys', data => { data.indexes.find(i => i.index_name === 'order_actor_purchase_idempotency').column_names = ['user_id']; }, 'PG_FINANCIAL_UNIQUE_INDEX_MISSING'],
  ['wrong partial predicate', data => { data.indexes.find(i => i.index_name === 'financial_source_effect_once').predicate = 'source_type IS NOT NULL'; }, 'PG_FINANCIAL_PARTIAL_INDEX_MISMATCH'],
  ['PUBLIC write grant', data => { data.publicGrants.push({ table_name: 'orders', privilege_type: 'INSERT' }); }, 'PG_FINANCIAL_PUBLIC_TABLE_GRANT']
])('rejects %s', (_name, change, code) => {
  const data = catalog(); change(data); expect(() => validateCatalog(data)).toThrow(code);
});
