'use strict';

// Read-only verification of approved migration 001; never invokes --apply or DDL.
const path = require('node:path');
const { connectionOptions } = require('./connection');
const { loadMigrations, pendingMigrations } = require('./migrate');
const failure = code => Object.assign(new Error(code), { code });

async function verifyUsers({ env = process.env, ClientClass, loadFiles = loadMigrations } = {}) {
  const files = await loadFiles();
  if (files.length !== 1 || files[0].filename !== '001_create_users_table.sql') {
    throw failure('PG_VERIFY_ACTIVE_INVENTORY_UNEXPECTED');
  }
  const options = connectionOptions(env, 'DIRECT_URL', { direct: true });
  const Client = ClientClass || require('pg').Client;
  const client = new Client({ ...options, application_name: 'top4cryptoshop-verify-users', query_timeout: 15000 });
  client.on('error', () => {});
  let transaction = false;
  try {
    await client.connect();
    const tls = client.connection?.stream;
    if (tls?.encrypted !== true || tls.authorized !== true) throw failure('PG_VERIFY_TLS_UNVERIFIED');
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transaction = true;
    await client.query("SET LOCAL statement_timeout = '15s'");
    const tables = await client.query(`SELECT table_schema, table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('users', 'schema_migrations')
      ORDER BY table_name`);
    if (tables.rows.length !== 2 || tables.rows.some(row => row.table_type !== 'BASE TABLE')) {
      throw Object.assign(failure('PG_VERIFY_TABLE_MISSING'), { tables: tables.rows });
    }
    const ledger = await client.query(`SELECT version, filename, checksum, applied_at::TEXT AS applied_at
      FROM public.schema_migrations ORDER BY version`);
    if (ledger.rows.length !== 1 || pendingMigrations(files, ledger.rows).length !== 0) {
      throw failure('PG_VERIFY_LEDGER_MISMATCH');
    }
    const columns = await client.query(`SELECT column_name, data_type, is_nullable, is_generated
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name IN ('id', 'balance_cents', 'balance', 'email_verified') ORDER BY column_name`);
    const expected = {
      id: ['uuid', 'NO', 'NEVER'], balance_cents: ['bigint', 'NO', 'NEVER'],
      balance: ['numeric', 'YES', 'ALWAYS'], email_verified: ['boolean', 'NO', 'NEVER']
    };
    if (columns.rows.length !== 4 || columns.rows.some(row => {
      const want = expected[row.column_name];
      return !want || row.data_type !== want[0] || row.is_nullable !== want[1] || row.is_generated !== want[2];
    })) throw failure('PG_VERIFY_COLUMN_MISMATCH');
    await client.query('COMMIT');
    transaction = false;
    return { tables: tables.rows, ledger: ledger.rows, columns: columns.rows,
      localChecksum: files[0].checksum, checksumMatches: true };
  } finally {
    if (transaction) { try { await client.query('ROLLBACK'); } catch (_) {} }
    await client.end();
  }
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: false, quiet: true });
  const result = await verifyUsers();
  console.log(JSON.stringify(result, null, 2));
  console.log('TLS: encrypted and certificate verified');
  console.log('Client closed. Read-only verification; no DDL or application-row writes.');
}

if (require.main === module) {
  main().catch(cause => {
    const code = typeof cause.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(cause.code) ? cause.code : 'PG_VERIFY_ERROR';
    if (code === 'PG_VERIFY_TABLE_MISSING' && Array.isArray(cause.tables)) {
      console.log(JSON.stringify({ tables: cause.tables }, null, 2));
    }
    console.error(`Verification stopped: ${code}`);
    process.exitCode = 1;
  });
}

module.exports = { verifyUsers };
