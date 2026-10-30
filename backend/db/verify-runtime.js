'use strict';
// C1 READ ONLY readiness verification. Never invokes --apply, DDL, or a
// financial write/probe. Uses DATABASE_URL's already verified runtime pool.
const { loadMigrations, pendingMigrations } = require('./migrate');
const { validateCatalog } = require('./verify-financial-schema');
const FILES = ['001_create_users_table.sql', '002_create_financial_operations_table.sql', '003_create_payments_table.sql',
  '004_create_orders_table.sql', '005_create_auth_session_tables.sql'];
const TABLES = ['schema_migrations', 'users', 'financial_operations', 'payments', 'orders', 'express_sessions', 'application_sessions', 'token_revocations'];
const fail = code => Object.assign(new Error(code), { code });
const FINANCIAL = ['financial_operations', 'payments', 'orders'];
const TYPES = {
  users: { id: 'uuid', username: 'character varying', email: 'text', email_verified: 'boolean', phone: 'text', provider: 'text',
    password_hash: 'text', google_id: 'text', theme: 'smallint', avatar: 'text', role: 'text', account_status: 'text', token_version: 'bigint',
    row_version: 'bigint', balance_cents: 'bigint', balance: 'numeric', login_attempts: 'smallint', two_fa_status: 'text', two_fa_secret: 'text',
    two_fa_attempts: 'integer', last_login: 'timestamp with time zone', activated_at: 'timestamp with time zone',
    created_at: 'timestamp with time zone', updated_at: 'timestamp with time zone' },
  express_sessions: { id: 'uuid', sid_digest: 'text', user_id: 'uuid', session_data: 'jsonb', expires_at: 'timestamp with time zone',
    revoked_at: 'timestamp with time zone', row_version: 'bigint', created_at: 'timestamp with time zone', updated_at: 'timestamp with time zone' },
  application_sessions: { id: 'uuid', session_digest: 'text', user_id: 'uuid', express_session_id: 'uuid', token_digest: 'text', token_version: 'bigint',
    issued_at: 'timestamp with time zone', expires_at: 'timestamp with time zone', revoked_at: 'timestamp with time zone', revocation_reason: 'text' },
  token_revocations: { id: 'uuid', token_digest: 'text', user_id: 'uuid', revoked_at: 'timestamp with time zone', expires_at: 'timestamp with time zone', reason: 'text' }
};
const TRIGGERS = [
  ['users', 'users_metadata_guard', 'users_metadata_guard', 19],
  ['express_sessions', 'express_session_update_guard', 'express_session_guard', 19],
  ['application_sessions', 'application_session_update_guard', 'application_session_guard', 19],
  ['token_revocations', 'token_revocation_row_guard', 'token_revocation_guard', 27],
  ['token_revocations', 'token_revocation_no_truncate', 'token_revocation_guard', 34]
];
function validateRuntime(catalog) {
  const { tables, columns, constraints, triggers, indexes, publicGrants } = catalog;
  if (tables.length !== TABLES.length || TABLES.some(name => !tables.some(t => t.table_name === name && t.table_type === 'BASE TABLE'))) throw fail('PG_BOOTSTRAP_SCHEMA_MISMATCH');
  // Reuse the reviewed financial object verifier WITHOUT any financial route,
  // service initialization, or schema alteration. Auth tables are validated below.
  validateCatalog({ tables: tables.filter(t => !Object.hasOwn(TYPES, t.table_name) || t.table_name === 'users'), columns,
    constraints: constraints.filter(t => FINANCIAL.includes(t.table_name)), triggers, indexes, publicGrants });
  for (const [table, types] of Object.entries(TYPES)) for (const [name, type] of Object.entries(types)) {
    const c = columns.find(c => c.table_name === table && c.column_name === name);
    if (!c || c.data_type !== type || c.is_generated !== (table === 'users' && name === 'balance' ? 'ALWAYS' : 'NEVER')) throw fail('PG_BOOTSTRAP_SCHEMA_MISMATCH');
  }
  const nullable = { users: ['password_hash', 'phone', 'google_id', 'two_fa_secret', 'last_login', 'activated_at'],
    express_sessions: ['user_id', 'revoked_at'], application_sessions: ['revoked_at', 'revocation_reason'], token_revocations: [] };
  for (const [table, types] of Object.entries(TYPES)) for (const name of Object.keys(types)) {
    if (name !== 'balance' && !nullable[table].includes(name) && columns.find(c => c.table_name === table && c.column_name === name).is_nullable !== 'NO') throw fail('PG_BOOTSTRAP_SCHEMA_MISMATCH');
  }
  for (const [table, name, fn, type] of TRIGGERS) {
    const t = triggers.find(t => t.table_name === table && t.trigger_name === name);
    if (!t || t.function_schema !== 'public' || t.function_name !== fn || t.function_security_definer || t.enabled !== 'O' || t.trigger_type !== type) throw fail('PG_BOOTSTRAP_SCHEMA_MISMATCH');
  }
  if (constraints.some(c => !c.validated) || publicGrants.length) throw fail('PG_BOOTSTRAP_SCHEMA_MISMATCH');
  const keys = { users: [['id'], ['username'], ['email'], ['phone'], ['google_id']], express_sessions: [['id'], ['sid_digest'], ['id', 'user_id']],
    application_sessions: [['id'], ['session_digest'], ['token_digest']], token_revocations: [['id'], ['token_digest']] };
  for (const [table, lists] of Object.entries(keys)) for (const cols of lists) {
    if (!indexes.some(i => i.table_name === table && i.is_unique && i.is_ready && i.is_valid && i.predicate === null && JSON.stringify(i.column_names) === JSON.stringify(cols))) throw fail('PG_BOOTSTRAP_SCHEMA_MISMATCH');
  }
  for (const [table, cols, target, refs, action] of [
    ['express_sessions', ['user_id'], 'users', ['id'], 'r'], ['application_sessions', ['user_id'], 'users', ['id'], 'r'],
    ['application_sessions', ['express_session_id', 'user_id'], 'express_sessions', ['id', 'user_id'], 'c'],
    ['token_revocations', ['user_id'], 'users', ['id'], 'r']
  ]) if (!constraints.some(c => c.table_name === table && c.constraint_type === 'f' && c.referenced_schema === 'public' && c.referenced_table === target &&
      c.delete_action === action && !c.deferrable && JSON.stringify(c.column_names) === JSON.stringify(cols) && JSON.stringify(c.referenced_columns) === JSON.stringify(refs))) throw fail('PG_BOOTSTRAP_SCHEMA_MISMATCH');
  for (const [table, name, cols, predicate] of [
    ['express_sessions', 'express_session_expiry', ['expires_at', 'id'], null],
    ['express_sessions', 'express_session_owner', ['user_id', 'id'], 'user_id IS NOT NULL'],
    ['application_sessions', 'application_session_expiry', ['expires_at', 'id'], null],
    ['application_sessions', 'application_session_active_owner', ['user_id', 'id'], 'revoked_at IS NULL'],
    ['application_sessions', 'application_session_express_parent', ['express_session_id', 'id'], null],
    ['token_revocations', 'token_revocation_expiry', ['expires_at', 'id'], null],
    ['token_revocations', 'token_revocation_owner', ['user_id', 'revoked_at', 'id'], null]
  ]) {
    const normalize = s => s?.replace(/[()"\s]/g, '').toLowerCase() ?? null;
    if (!indexes.some(i => i.table_name === table && i.index_name === name && i.is_ready && i.is_valid &&
      JSON.stringify(i.column_names) === JSON.stringify(cols) && normalize(i.predicate) === normalize(predicate))) throw fail('PG_BOOTSTRAP_SCHEMA_MISMATCH');
  }
  for (const name of ['express_session_expiry', 'express_session_revocation', 'application_session_expiry', 'application_session_revocation', 'token_revocation_expiry']) {
    if (!constraints.some(c => c.constraint_type === 'c' && c.constraint_name === name)) throw fail('PG_BOOTSTRAP_SCHEMA_MISMATCH');
  }
}
async function readCatalog(q) {
  const tables = (await q(`SELECT table_schema,table_name,table_type FROM information_schema.tables
    WHERE table_schema='public' AND table_name=ANY($1::TEXT[]) ORDER BY table_name`, [TABLES])).rows;
  const columns = (await q(`SELECT table_name,column_name,data_type,is_nullable,is_generated,generation_expression,column_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::TEXT[])`, [TABLES])).rows;
  const constraints = (await q(`SELECT t.relname AS table_name,c.conname AS constraint_name,c.contype AS constraint_type,
    c.convalidated AS validated,c.condeferrable AS deferrable,c.condeferred AS initially_deferred,c.confdeltype AS delete_action,
    rn.nspname AS referenced_schema,rt.relname AS referenced_table,
    ARRAY(SELECT a.attname::TEXT FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS column_names,
    ARRAY(SELECT a.attname::TEXT FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.ord) AS referenced_columns
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    LEFT JOIN pg_class rt ON rt.oid=c.confrelid LEFT JOIN pg_namespace rn ON rn.oid=rt.relnamespace
    WHERE n.nspname='public' AND t.relname=ANY($1::TEXT[])`, [TABLES])).rows;
  const triggers = (await q(`SELECT t.relname AS table_name,g.tgname AS trigger_name,g.tgenabled AS enabled,g.tgtype AS trigger_type,
    g.tgdeferrable AS deferrable,g.tginitdeferred AS initially_deferred,p.proname AS function_name,pn.nspname AS function_schema,p.prosecdef AS function_security_definer
    FROM pg_trigger g JOIN pg_class t ON t.oid=g.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_proc p ON p.oid=g.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
    WHERE n.nspname='public' AND t.relname=ANY($1::TEXT[]) AND NOT g.tgisinternal`, [TABLES])).rows;
  const indexes = (await q(`SELECT t.relname AS table_name,x.relname AS index_name,i.indisunique AS is_unique,i.indisvalid AS is_valid,i.indisready AS is_ready,
    pg_get_expr(i.indpred,i.indrelid) AS predicate,
    ARRAY(SELECT a.attname::TEXT FROM unnest(i.indkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num WHERE k.ord<=i.indnkeyatts ORDER BY k.ord) AS column_names
    FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_class x ON x.oid=i.indexrelid
    WHERE n.nspname='public' AND t.relname=ANY($1::TEXT[])`, [TABLES])).rows;
  const publicGrants = (await q(`SELECT t.relname AS table_name,a.privilege_type FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace,
    LATERAL aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a WHERE n.nspname='public' AND t.relname=ANY($1::TEXT[]) AND a.grantee=0`, [TABLES])).rows;
  return { tables, columns, constraints, triggers, indexes, publicGrants };
}
async function verifyRuntime({ poolProvider, loadFiles = loadMigrations }) {
  let client, transaction = false, broken = false;
  try {
    const files = await loadFiles();
    if (files.length !== FILES.length || files.some((f, i) => f.version !== i + 1 || f.filename !== FILES[i])) throw fail('PG_BOOTSTRAP_LEDGER_MISMATCH');
    client = await poolProvider().connect();
    if (client.connection?.stream?.encrypted !== true || client.connection.stream.authorized !== true) throw fail('PG_BOOTSTRAP_TLS_UNVERIFIED');
    const q = (text, values = []) => client.query({ text, values, query_timeout: 5000 });
    await q('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); transaction = true;
    await q("SET LOCAL statement_timeout = '5s'"); await q("SET LOCAL lock_timeout = '2s'");
    await q('SET LOCAL search_path = pg_catalog, public');
    await q('SELECT 1 AS connected');
    const ledger = (await q('SELECT version,filename,checksum FROM public.schema_migrations ORDER BY version')).rows;
    try { if (pendingMigrations(files, ledger).length) throw new Error(); } catch (_) { throw fail('PG_BOOTSTRAP_LEDGER_MISMATCH'); }
    const catalog = await readCatalog(q);
    try { validateRuntime(catalog); } catch (_) { throw fail('PG_BOOTSTRAP_SCHEMA_MISMATCH'); }
    await q('COMMIT'); transaction = false;
    return Object.freeze({ verified: true, migrations: files.length });
  } catch (e) {
    if (transaction) { try { await client.query({ text: 'ROLLBACK', query_timeout: 1000 }); } catch (_) { broken = true; } }
    const code = ['PG_BOOTSTRAP_LEDGER_MISMATCH', 'PG_BOOTSTRAP_SCHEMA_MISMATCH', 'PG_BOOTSTRAP_TLS_UNVERIFIED'].includes(e.code) ? e.code : 'PG_BOOTSTRAP_UNAVAILABLE';
    throw fail(code); // No driver target, SQL, credentials, or raw messages.
  } finally { client?.release(broken); }
}
module.exports = { verifyRuntime };
