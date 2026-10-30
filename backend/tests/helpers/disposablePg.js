'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const bcrypt = require('../../node_modules/bcryptjs');
const URL = 'postgresql://top4_test:Top4_Local_Test_Only_18@localhost:5433/top4_financial_test?sslmode=require';
const HASHES = ['dcad707a0db33d20fafcbc0d936eb7e473daadc2a43a80b99de2bba5d51e8147','b5d596e09e1cafc777d9ae9805658e507625113306ae01d5d6f80232a49ad05f','b9b3534d65d9b1115a6055f5940017470f49c52bf29f95e23067fb2d17f58210','0e5b70f44cd832bc6b671109bf4aeead465f0edff498da75bcd5ba0f24b1ed70','2b14cb8e91faff6c53ce0f54f9f917b8b0678b070c9c3659a8c3b2b6e69f580c'];
const FUNCTIONS = ['express_session_guard()', 'application_session_guard()', 'token_revocation_guard()', 'users_metadata_guard()', 'financial_append_only_guard()', 'payment_immutable_guard()', 'payment_journal_evidence_guard()', 'order_immutable_guard()', 'order_journal_evidence_guard()', 'usd_cents_text(BIGINT)', 'receipt_reference_matches(TEXT, UUID, TEXT)'];
const ADMIN = '00000000-0000-4000-8000-000000000001', OWNER = '00000000-0000-4000-8000-000000000003', OTHER = '00000000-0000-4000-8000-000000000004';
const PASSWORD = 'Correct1!pass', LOOKUP_SECRET = 'lookup-test-secret-'.repeat(4), JWT_SECRET = 'jwt-test-secret-'.repeat(4), CURSOR_SECRET = 'cursor-test-secret-'.repeat(4);
function guardEnvironment() {
  if (process.env.TOP4_PG_TEST_ALLOW_RESET !== 'YES_DISPOSABLE_LOCAL_PG18' || process.env.DATABASE_URL !== URL || process.env.DIRECT_URL !== URL || !process.env.NODE_EXTRA_CA_CERTS) throw new Error('PG_TEST_CONFIGURATION_REFUSED');
}
guardEnvironment();
async function open() {
  const { Pool } = require('../../node_modules/pg');
  const { connectionOptions } = require('../../db/connection');
  const { loadMigrations } = require('../../db/migrate');
  const migrations = await loadMigrations();
  assert.deepEqual(migrations.map(m => m.checksum), HASHES);
  const pool = new Pool({ ...connectionOptions(process.env, 'DATABASE_URL'), max: 10, query_timeout: 10000 }); pool.on('error', () => {});
  let client, locked = false, verified = false;
  try {
    client = await pool.connect(); assert.equal(client.connection.stream.encrypted, true); assert.equal(client.connection.stream.authorized, true);
    const identity = (await client.query("SELECT current_database() AS db, current_user AS usr, current_setting('server_version_num')::INTEGER AS version")).rows[0];
    assert.equal(identity.db, 'top4_financial_test'); assert.equal(identity.usr, 'top4_test'); assert.ok(identity.version >= 180000 && identity.version < 190000);
    assert.deepEqual((await client.query('SELECT version, filename, checksum FROM public.schema_migrations ORDER BY version')).rows,
      migrations.map(({ version, filename, checksum }) => ({ version, filename, checksum })));
    locked = (await client.query('SELECT pg_try_advisory_lock(74382601, 733) AS acquired')).rows[0].acquired; assert.equal(locked, true); verified = true;
  } catch (e) { client?.release(); await pool.end(); throw e; }
  async function reset() {
    if (!verified || !locked) throw new Error('PG_TEST_RESET_REFUSED');
    const c = await pool.connect();
    try {
      await c.query('BEGIN'); await c.query("SET LOCAL lock_timeout = '2s'");
      await c.query('DROP TABLE public.application_sessions, public.token_revocations, public.express_sessions, public.orders, public.payments, public.financial_operations, public.users CASCADE');
      for (const f of FUNCTIONS) await c.query(`DROP FUNCTION IF EXISTS public.${f} CASCADE`);
      for (const m of migrations) await c.query(m.sql);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  async function seed() {
    const hash = await bcrypt.hash(PASSWORD, 4);
    await pool.query(`INSERT INTO public.users (id, username, email, email_verified, provider, password_hash, role, token_version, balance_cents)
      VALUES ($1::UUID,'Admin_A','a@example.test',TRUE,'local',$4,'admin',1,10000),
      ($2::UUID,'Owner_U','u@example.test',TRUE,'local',$4,'user',1,10000), ($3::UUID,'Other_U','other@example.test',TRUE,'local',$4,'user',1,10000)`, [ADMIN, OWNER, OTHER, hash]);
  }
  async function close() { verified = false; if (locked) await client.query('SELECT pg_advisory_unlock(74382601, 733)'); locked = false; client.release(); await pool.end(); }
  return { pool, reset, seed, close };
}
const principal = (userId = OWNER, tokenVersion = '1') => ({ userId, tokenVersion });
const callback = (store, method, ...args) => new Promise((resolve, reject) => store[method](...args, (e, x) => e ? reject(e) : resolve(x)));
const sid = () => randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
const sessionData = () => ({ cookie: { expires: new Date(Date.now() + 3600000).toISOString(), originalMaxAge: 3600000, httpOnly: true }, csrfToken: 'anonymous-csrf', value: 1 });
module.exports = { open, guardEnvironment, ADMIN, OWNER, OTHER, PASSWORD, LOOKUP_SECRET, JWT_SECRET, CURSOR_SECRET, principal, callback, sid, sessionData };
