'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { connectionOptions } = require('../db/connection');
const { loadMigrations, pendingMigrations, applyMigrations, main } = require('../db/migrate');

// No installed pg dependency, DNS, socket, credentials or database is used.
jest.mock('pg', () => ({ Pool: jest.fn().mockImplementation(options => ({
  options, on: jest.fn(), end: jest.fn().mockResolvedValue(undefined)
})) }), { virtual: true });
const { getPool, closePool } = require('../db/pg');
const URL = 'postgresql://owned%40test:owned%3Apassword@db.example.test/owned_db?sslmode=require';
const env = () => ({ DATABASE_URL: URL, DIRECT_URL: URL });

class FakeClient extends EventEmitter {
  static instances = [];
  static behavior = {};
  constructor(options) {
    super(); this.options = options; this.queries = []; this.behavior = FakeClient.behavior;
    FakeClient.instances.push(this);
  }
  async connect() { this.connected = true; if (this.behavior.connectFailure) throw new Error('private transport context'); }
  async query(sql, values) {
    this.queries.push({ sql, values });
    if (sql.startsWith('SELECT pg_try_advisory_lock')) return { rows: [{ acquired: !this.behavior.busy }] };
    if (sql.startsWith('SELECT version,')) return { rows: this.behavior.history || [] };
    if (sql === 'COMMIT' && this.behavior.commitFailure) throw new Error('private commit context');
    if (sql.startsWith('CREATE TABLE owned') && this.behavior.ddlFailure) throw new Error('private DDL context');
    if (sql.startsWith('INSERT INTO public.schema_migrations') && this.behavior.ledgerFailure) throw new Error('private ledger context');
    return { rows: [] };
  }
  async end() { this.ended = true; }
}

let directory, savedUrl;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'top4-pg-draft-test-'));
  await fs.writeFile(path.join(directory, '001_owned.sql'), 'CREATE TABLE owned (id INTEGER);');
  FakeClient.instances = []; FakeClient.behavior = {};
  savedUrl = process.env.DATABASE_URL;
});
afterEach(async () => {
  await closePool();
  if (savedUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = savedUrl;
  await fs.rm(directory, { recursive: true, force: true });
  jest.restoreAllMocks(); jest.clearAllMocks();
});

function apply() { return applyMigrations({ env: env(), ClientClass: FakeClient, directory }); }
function queries() { return FakeClient.instances[0].queries.map(query => query.sql); }

describe('review-draft PostgreSQL configuration', () => {
  test('decodes credentials, forces certificate/host verification and does not forward the URL', () => {
    const options = connectionOptions(env(), 'DATABASE_URL');
    expect(options).toMatchObject({ host: 'db.example.test', database: 'owned_db', user: 'owned@test', password: 'owned:password',
      port: 5432, ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: 'db.example.test' }, enableChannelBinding: true });
    expect(options).not.toHaveProperty('connectionString');
  });
  test.each(['disable', 'allow', 'prefer', 'no-verify', 'verify-ca'])('rejects weaker sslmode=%s', mode => {
    expect(() => connectionOptions({ DATABASE_URL: URL.replace('require', mode) }, 'DATABASE_URL')).toThrow('PG_SSLMODE_UNSUPPORTED');
  });
  test('rejects globally disabled TLS verification', () => {
    expect(() => connectionOptions({ ...env(), NODE_TLS_REJECT_UNAUTHORIZED: '0' }, 'DATABASE_URL')).toThrow('PG_TLS_VERIFICATION_DISABLED');
  });
  test.each(['sslrootcert=/tmp/test', 'ssl=false', 'uselibpqcompat=true', 'options=unsafe', 'sslmode=require'])('rejects unsupported/duplicate URL option %s', option => {
    expect(() => connectionOptions({ DATABASE_URL: `${URL}&${option}` }, 'DATABASE_URL')).toThrow('PG_URL_OPTION_UNSUPPORTED');
  });
  test('does not pretend pg enforces mandatory channel binding', () => {
    expect(() => connectionOptions({ DATABASE_URL: `${URL}&channel_binding=require` }, 'DATABASE_URL')).toThrow('PG_CHANNEL_BINDING_UNSUPPORTED');
    expect(connectionOptions({ DATABASE_URL: `${URL}&channel_binding=prefer` }, 'DATABASE_URL').enableChannelBinding).toBe(true);
  });
  test('uses only DIRECT_URL for migration configuration and rejects Neon pooler hosts', () => {
    expect(() => connectionOptions({ DATABASE_URL: URL }, 'DIRECT_URL', { direct: true })).toThrow('PG_URL_REQUIRED');
    const pooled = URL.replace('db.example.test', 'ep-owned-pooler.us-east-2.aws.neon.tech');
    expect(() => connectionOptions({ DIRECT_URL: pooled }, 'DIRECT_URL', { direct: true })).toThrow('PG_DIRECT_URL_IS_POOLED');
    expect(connectionOptions({ DATABASE_URL: pooled }, 'DATABASE_URL').host).toContain('-pooler.');
  });
  test.each(['not-a-url-with-private-password', 'http://owned:password@db.example.test/db',
    'postgres://owned:password@db.example.test/', 'postgres://owned:%ZZ@db.example.test/db',
    'postgres://owned:password@db.example.test:70000/db', 'post\ngres://owned:password@db.example.test/db'])('sanitizes malformed URL errors', value => {
    let failure; try { connectionOptions({ DATABASE_URL: value }, 'DATABASE_URL'); } catch (cause) { failure = cause; }
    expect(failure).toBeInstanceOf(Error); expect(failure.message).toMatch(/^PG_/); expect(failure.message).not.toContain('password');
  });
  test('constructs one lazy five-connection pool and closes it without any database access', async () => {
    const { Pool } = require('pg');
    expect(Pool).not.toHaveBeenCalled();
    process.env.DATABASE_URL = URL;
    const first = getPool(); expect(getPool()).toBe(first);
    expect(Pool).toHaveBeenCalledTimes(1);
    expect(first.options).toMatchObject({ max: 5, idleTimeoutMillis: 30000, ssl: { rejectUnauthorized: true } });
    expect(first).not.toHaveProperty('query');
    await closePool(); expect(first.end).toHaveBeenCalledTimes(1);
  });
});

describe('offline migration planning and checksum history', () => {
  test('plans actual users SQL without driver construction or a database-status claim', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await main(['--plan']);
    expect(FakeClient.instances).toHaveLength(0);
    expect(require('pg').Pool).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain('no database connection');
    expect(log.mock.calls[1][0]).toMatch(/^001_create_users_table\.sql [a-f0-9]{64}$/);
  });
  test('loads a numerically ordered, contiguous sequence and hashes exact bytes', async () => {
    await fs.writeFile(path.join(directory, '002_owned.sql'), 'SELECT 2;\n');
    const files = await loadMigrations(directory);
    expect(files.map(file => file.version)).toEqual([1, 2]); expect(files[0].checksum).toMatch(/^[a-f0-9]{64}$/);
    await fs.appendFile(path.join(directory, '001_owned.sql'), '\n');
    expect((await loadMigrations(directory))[0].checksum).not.toBe(files[0].checksum);
  });
  test.each(['003_gap.sql', '0001_duplicate.sql', '002_Bad.sql', '002_bad.SQL'])('rejects invalid sequence or filename %s', filename => {
    return fs.writeFile(path.join(directory, filename), 'SELECT 2;').then(() => expect(loadMigrations(directory)).rejects.toThrow(/^PG_MIGRATION_/));
  });
  test('rejects an empty migration', async () => {
    await fs.writeFile(path.join(directory, '001_owned.sql'), ' \n');
    await expect(loadMigrations(directory)).rejects.toThrow('PG_MIGRATION_EMPTY');
  });
  test('rejects a symlink migration', async () => {
    await fs.symlink(path.join(directory, '001_owned.sql'), path.join(directory, '002_link.sql'));
    await expect(loadMigrations(directory)).rejects.toThrow('PG_MIGRATION_FILENAME_INVALID');
  });
  test('detects modified, renamed, gapped and missing applied history', async () => {
    const files = await loadMigrations(directory); const { sql, ...row } = files[0];
    expect(pendingMigrations(files, [row])).toEqual([]);
    for (const patch of [{ checksum: '0'.repeat(64) }, { filename: '001_renamed.sql' }, { version: 2 }]) {
      expect(() => pendingMigrations(files, [{ ...row, ...patch }])).toThrow('PG_MIGRATION_HISTORY_MISMATCH');
    }
    expect(() => pendingMigrations([], [row])).toThrow('PG_MIGRATION_HISTORY_MISMATCH');
  });
  test('rejects unsupported CLI arguments before any connection', async () => {
    await expect(main(['--force'])).rejects.toThrow('PG_MIGRATION_ARGUMENT_INVALID');
    expect(FakeClient.instances).toHaveLength(0);
  });
});

describe('migration control flow with an isolated fake transport', () => {
  test('executes DDL and ledger insertion on one direct client in one transaction', async () => {
    await expect(apply()).resolves.toEqual({ applied: ['001_owned.sql'] });
    expect(FakeClient.instances).toHaveLength(1);
    const client = FakeClient.instances[0]; expect(client.ended).toBe(true);
    expect(client.options).toMatchObject({ application_name: 'top4cryptoshop-migrations', ssl: { rejectUnauthorized: true } });
    const q = queries(); expect(q.indexOf('BEGIN')).toBeLessThan(q.indexOf('CREATE TABLE owned (id INTEGER);'));
    expect(q.at(-2)).toBe('COMMIT'); expect(q.at(-1)).toContain('pg_advisory_unlock');
    expect(client.queries.find(query => query.sql.startsWith('INSERT INTO public.schema_migrations')).values)
      .toEqual([1, '001_owned.sql', expect.stringMatching(/^[a-f0-9]{64}$/)]);
  });
  test('does not repeat an already recorded migration', async () => {
    const { sql, ...row } = (await loadMigrations(directory))[0]; FakeClient.behavior = { history: [row] };
    await expect(apply()).resolves.toEqual({ applied: [] });
    expect(queries()).not.toContain('CREATE TABLE owned (id INTEGER);');
  });
  test('fails before BEGIN if another runner owns the lock', async () => {
    FakeClient.behavior = { busy: true };
    await expect(apply()).rejects.toThrow('PG_MIGRATION_LOCK_BUSY');
    expect(queries()).not.toContain('BEGIN'); expect(FakeClient.instances[0].ended).toBe(true);
  });
  test.each(['ddlFailure', 'ledgerFailure'])('rolls back %s and releases the owned lock', async key => {
    FakeClient.behavior = { [key]: true };
    await expect(apply()).rejects.toThrow();
    expect(queries()).toContain('ROLLBACK'); expect(queries()).not.toContain('COMMIT');
    expect(queries().at(-1)).toContain('pg_advisory_unlock'); expect(FakeClient.instances[0].ended).toBe(true);
  });
  test('checksum mismatch rolls back without executing migration SQL', async () => {
    const { sql, ...row } = (await loadMigrations(directory))[0]; FakeClient.behavior = { history: [{ ...row, checksum: '0'.repeat(64) }] };
    await expect(apply()).rejects.toThrow('PG_MIGRATION_HISTORY_MISMATCH');
    expect(queries()).toContain('ROLLBACK'); expect(queries()).not.toContain(sql);
  });
  test('lost commit acknowledgement is unknown, never automatically retried', async () => {
    FakeClient.behavior = { commitFailure: true };
    await expect(apply()).rejects.toThrow('PG_MIGRATION_OUTCOME_UNKNOWN');
    expect(queries().filter(query => query === 'COMMIT')).toHaveLength(1);
    expect(FakeClient.instances).toHaveLength(1); expect(FakeClient.instances[0].ended).toBe(true);
  });
  test('connection failure closes its client without issuing SQL', async () => {
    FakeClient.behavior = { connectFailure: true };
    await expect(apply()).rejects.toThrow();
    expect(queries()).toHaveLength(0); expect(FakeClient.instances[0].ended).toBe(true);
  });
});
