'use strict';

const { EventEmitter } = require('node:events');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { smoke } = require('../db/smoke');
const { connectionOptions } = require('../db/connection');
const env = { DIRECT_URL: 'postgresql://owned:owned-password@db.example.test/owned_db?sslmode=verify-full' };

function isolated(behavior = {}) {
  const client = Object.assign(new EventEmitter(), {
    connection: { stream: { encrypted: true, authorized: true, ...behavior.tls } },
    release: jest.fn(),
    query: jest.fn(async sql => {
      if (behavior.queryError) throw behavior.queryError;
      return { rows: [sql.includes('current_database') ? { current_database: 'owned_db' } : { version: 'owned PostgreSQL fixture' }] };
    })
  });
  const pool = { on: jest.fn(), end: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn(async () => { if (behavior.connectError) throw behavior.connectError; return client; }) };
  return { pool, client, PoolClass: jest.fn().mockImplementation(() => pool) };
}

afterEach(() => { jest.restoreAllMocks(); });

test('smoke uses strict DIRECT_URL, only the two SELECTs, and closes its isolated pool', async () => {
  const fixture = isolated();
  await expect(smoke({ env, PoolClass: fixture.PoolClass })).resolves.toEqual({ version: 'owned PostgreSQL fixture', database: 'owned_db' });
  expect(fixture.PoolClass).toHaveBeenCalledWith(expect.objectContaining({ max: 1, application_name: 'top4cryptoshop-smoke',
    ssl: expect.objectContaining({ rejectUnauthorized: true, minVersion: 'TLSv1.2' }) }));
  expect(fixture.client.query.mock.calls).toEqual([['SELECT version();'], ['SELECT current_database();']]);
  expect(fixture.client.release).toHaveBeenCalledTimes(1); expect(fixture.pool.end).toHaveBeenCalledTimes(1);
});

test.each([{ encrypted: false }, { authorized: false }])('does not query an unverified transport %j', async tls => {
  const fixture = isolated({ tls });
  await expect(smoke({ env, PoolClass: fixture.PoolClass })).rejects.toThrow('PG_SMOKE_TLS_UNVERIFIED');
  expect(fixture.client.query).not.toHaveBeenCalled();
  expect(fixture.client.release).toHaveBeenCalledTimes(1); expect(fixture.pool.end).toHaveBeenCalledTimes(1);
});

test('query failure still releases the client and closes the pool', async () => {
  const fixture = isolated({ queryError: new Error('owned query failure') });
  await expect(smoke({ env, PoolClass: fixture.PoolClass })).rejects.toThrow('owned query failure');
  expect(fixture.client.release).toHaveBeenCalledTimes(1); expect(fixture.pool.end).toHaveBeenCalledTimes(1);
});

test('connection failure still closes the pool', async () => {
  const fixture = isolated({ connectError: new Error('owned connection failure') });
  await expect(smoke({ env, PoolClass: fixture.PoolClass })).rejects.toThrow('owned connection failure');
  expect(fixture.client.release).not.toHaveBeenCalled(); expect(fixture.pool.end).toHaveBeenCalledTimes(1);
});

test('missing DIRECT_URL never falls back to DATABASE_URL or constructs a pool', async () => {
  const fixture = isolated();
  await expect(smoke({ env: { DATABASE_URL: env.DIRECT_URL }, PoolClass: fixture.PoolClass })).rejects.toThrow('PG_URL_REQUIRED');
  expect(fixture.PoolClass).not.toHaveBeenCalled();
});

test('actual pg keeps safe BIGINT and NUMERIC parsers unchanged', () => {
  const pg = require('pg');
  expect(require('pg/package.json').version).toBe('8.23.1');
  expect(pg.types.getTypeParser(20)('9007199254740991')).toBe('9007199254740991');
  expect(pg.types.getTypeParser(1700)('90071992547409.91')).toBe('90071992547409.91');
});

test('actual pg refuses an owned server that declines TLS, without sending startup credentials', async () => {
  const sockets = new Set(); let received = Buffer.alloc(0); let rejected = false;
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.on('data', chunk => {
      received = Buffer.concat([received, chunk]);
      if (!rejected && received.length >= 8) { rejected = true; socket.end('N'); }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { Pool } = require('pg');
  const pool = new Pool({ ...connectionOptions(env, 'DIRECT_URL', { direct: true }), host: '127.0.0.1',
    port: server.address().port, max: 1, connectionTimeoutMillis: 2000 });
  pool.on('error', () => {});
  try {
    await expect(pool.connect()).rejects.toThrow('does not support SSL');
    expect(received.length).toBe(8); expect(received.readInt32BE(0)).toBe(8); expect(received.readInt32BE(4)).toBe(80877103);
    expect(received.toString()).not.toContain('owned-password');
  } finally {
    await pool.end(); for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});

test('users migration includes explicit unverified-email default without choosing JWT subjects', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../db/migrations/001_create_users_table.sql'), 'utf8');
  expect(sql).toContain('email_verified BOOLEAN NOT NULL DEFAULT FALSE');
  expect(sql).toContain('legacy_mongo_id VARCHAR(24)');
  expect(sql).toContain('does not choose either authentication policy');
});
