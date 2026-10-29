'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { verifyUsers } = require('../db/verify-users');
const env = { DIRECT_URL: 'postgresql://owned:owned-password@db.example.test/owned_db?sslmode=verify-full' };
const checksum = createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../db/migrations/001_create_users_table.sql'))).digest('hex');
// Unit fixtures remain stage-001-only even after later files are activated.
const ownedFiles = [{ version: 1, filename: '001_create_users_table.sql', checksum }];
const verifyOwnedUsers = options => verifyUsers({ ...options, loadFiles: async () => ownedFiles });

function fixture(behavior = {}) {
  const ledger = [{ version: 1, filename: '001_create_users_table.sql', checksum, applied_at: 'owned fixture timestamp' }];
  const tables = ['schema_migrations', 'users'].map(table_name => ({ table_schema: 'public', table_name, table_type: 'BASE TABLE' }));
  const columns = [
    ['balance', 'numeric', 'YES', 'ALWAYS'], ['balance_cents', 'bigint', 'NO', 'NEVER'],
    ['email_verified', 'boolean', 'NO', 'NEVER'], ['id', 'uuid', 'NO', 'NEVER']
  ].map(([column_name, data_type, is_nullable, is_generated]) => ({ column_name, data_type, is_nullable, is_generated }));
  const client = {
    on: jest.fn(), connection: { stream: { encrypted: true, authorized: true, ...behavior.tls } },
    connect: jest.fn(async () => { if (behavior.connectError) throw behavior.connectError; }),
    end: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(async sql => {
      if (sql.includes('information_schema.tables')) return { rows: behavior.tables ?? tables };
      if (sql.includes('public.schema_migrations')) {
        if (behavior.queryError) throw behavior.queryError;
        return { rows: behavior.ledger ?? ledger };
      }
      if (sql.includes('information_schema.columns')) return { rows: behavior.columns ?? columns };
      return { rows: [] };
    })
  };
  return { client, ClientClass: jest.fn().mockImplementation(() => client) };
}

test('verifies metadata and exact ledger prefix in a strict TLS read-only transaction', async () => {
  const f = fixture();
  const result = await verifyOwnedUsers({ env, ClientClass: f.ClientClass });
  expect(result).toMatchObject({ localChecksum: checksum, checksumMatches: true, ledger: [{ version: 1, checksum }] });
  expect(f.ClientClass).toHaveBeenCalledWith(expect.objectContaining({ ssl: expect.objectContaining({ rejectUnauthorized: true }),
    application_name: 'top4cryptoshop-verify-users' }));
  const sql = f.client.query.mock.calls.map(([text]) => text);
  expect(sql[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  expect(sql.at(-1)).toBe('COMMIT');
  expect(sql.some(text => /\b(CREATE|INSERT|UPDATE|DELETE|TRUNCATE|ALTER|GRANT|REVOKE)\b/.test(text))).toBe(false);
  expect(sql.filter(text => text.startsWith('SELECT'))).toHaveLength(3);
  expect(f.client.end).toHaveBeenCalledTimes(1);
});

test.each([{ encrypted: false }, { authorized: false }])('rejects unverified transport %j before queries', async tls => {
  const f = fixture({ tls });
  await expect(verifyOwnedUsers({ env, ClientClass: f.ClientClass })).rejects.toThrow('PG_VERIFY_TLS_UNVERIFIED');
  expect(f.client.query).not.toHaveBeenCalled(); expect(f.client.end).toHaveBeenCalledTimes(1);
});

test('missing tables are reported without creating a table or querying its rows', async () => {
  const f = fixture({ tables: [] });
  await expect(verifyOwnedUsers({ env, ClientClass: f.ClientClass })).rejects.toMatchObject({ code: 'PG_VERIFY_TABLE_MISSING', tables: [] });
  expect(f.client.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
  expect(f.client.query.mock.calls.some(([sql]) => sql.includes('FROM public.schema_migrations'))).toBe(false);
  expect(f.client.end).toHaveBeenCalledTimes(1);
});

test.each([
  [], [{ version: 1, filename: '001_create_users_table.sql', checksum: 'f'.repeat(64) }],
  [{ version: 1, filename: '001_renamed.sql', checksum }],
  [{ version: 1, filename: '001_create_users_table.sql', checksum }, { version: 2, filename: '002_unapproved.sql', checksum }]
].map(ledger => [ledger]))('rejects incomplete, changed or extra migration history %j', async ledger => {
  const f = fixture({ ledger });
  await expect(verifyOwnedUsers({ env, ClientClass: f.ClientClass })).rejects.toThrow(/PG_VERIFY_LEDGER_MISMATCH|PG_MIGRATION_HISTORY_MISMATCH/);
  expect(f.client.query.mock.calls.at(-1)).toEqual(['ROLLBACK']); expect(f.client.end).toHaveBeenCalledTimes(1);
});

test('checks UUID, integer cents, generated balance and email flag types', async () => {
  const f = fixture({ columns: [] });
  await expect(verifyOwnedUsers({ env, ClientClass: f.ClientClass })).rejects.toThrow('PG_VERIFY_COLUMN_MISMATCH');
  expect(f.client.query.mock.calls.at(-1)).toEqual(['ROLLBACK']); expect(f.client.end).toHaveBeenCalledTimes(1);
});

test('query failure rolls back and closes the client', async () => {
  const f = fixture({ queryError: new Error('owned query failure') });
  await expect(verifyOwnedUsers({ env, ClientClass: f.ClientClass })).rejects.toThrow('owned query failure');
  expect(f.client.query.mock.calls.at(-1)).toEqual(['ROLLBACK']); expect(f.client.end).toHaveBeenCalledTimes(1);
});

test('connect failure still closes the client', async () => {
  const f = fixture({ connectError: new Error('owned connection failure') });
  await expect(verifyOwnedUsers({ env, ClientClass: f.ClientClass })).rejects.toThrow('owned connection failure');
  expect(f.client.query).not.toHaveBeenCalled(); expect(f.client.end).toHaveBeenCalledTimes(1);
});

test('stage-001 CLI verifier rejects later active files before connecting', async () => {
  const f = fixture();
  await expect(verifyUsers({ env, ClientClass: f.ClientClass,
    loadFiles: async () => [...ownedFiles, { version: 2, filename: '002_owned.sql', checksum }] }))
    .rejects.toThrow('PG_VERIFY_ACTIVE_INVENTORY_UNEXPECTED');
  expect(f.ClientClass).not.toHaveBeenCalled();
});

test('never falls back to the pooled application URL', async () => {
  const f = fixture();
  await expect(verifyOwnedUsers({ env: { DATABASE_URL: env.DIRECT_URL }, ClientClass: f.ClientClass })).rejects.toThrow('PG_URL_REQUIRED');
  expect(f.ClientClass).not.toHaveBeenCalled();
});
