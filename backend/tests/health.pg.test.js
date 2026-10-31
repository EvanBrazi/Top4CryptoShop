'use strict';
// Real composition and guarded verified-TLS PostgreSQL. Faults/gates wrap real
// driver calls; no fake readiness verifier, SQL rows, sessions or authentication.
const request = require('supertest');
const { Pool } = require('../node_modules/pg');
const { connectionOptions } = require('../db/connection');
const { createApplication } = require('../server');
const H = require('./helpers/disposablePg');

jest.setTimeout(30000);
const PROBE = { text: 'SELECT 1 AS connected', query_timeout: 2000 };
const UP = { status: 'ok', ready: true, database: 'postgresql' };
const DOWN = { status: 'NOT_READY', ready: false, database: 'postgresql' };
const TABLES = ['users', 'express_sessions', 'application_sessions', 'token_revocations',
  'financial_operations', 'orders', 'payments'];
const PRIVATE = ['health-private-user', 'health-private-password', 'health-private-host.invalid',
  'health-private-database', 'SELECT health_private_sql', 'health-private-driver-error'];
const privateError = () => Object.assign(new Error(PRIVATE.join(' ') +
  ' postgresql://health-private-user:health-private-password@health-private-host.invalid/health-private-database'),
{ database: PRIVATE[3], host: PRIVATE[2], url: 'private-url', password: PRIVATE[1], detail: PRIVATE[4] });
let db, runtime, activity, providerFailure, probeFailure, sessionFailure, connectGate, probeGate;

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function gate() { return { entered: deferred(), release: deferred() }; }
function checked(input) {
  const text = typeof input === 'string' ? input : input.text;
  if (sessionFailure && /\b(express_sessions|application_sessions|token_revocations)\b/.test(text)) throw privateError();
}
function observedProvider() {
  activity = {
    query: jest.fn(async (...args) => {
      if (probeGate) { const held = probeGate; held.entered.resolve(); await held.release.promise; }
      checked(args[0]);
      if (probeFailure) throw privateError();
      return db.pool.query(...args);
    }),
    clientQuery: jest.fn((client, ...args) => { checked(args[0]); return client.query(...args); }),
    connect: jest.fn(async () => {
      if (connectGate) { const held = connectGate; held.entered.resolve(); await held.release.promise; }
      const client = await db.pool.connect();
      return { connection: client.connection, on: (...args) => client.on(...args),
        removeListener: (...args) => client.removeListener(...args), release: broken => client.release(broken),
        query: (...args) => activity.clientQuery(client, ...args) };
    })
  };
  const pool = { query: activity.query, connect: activity.connect };
  activity.provider = jest.fn(() => { if (providerFailure) throw privateError(); return pool; });
  return activity.provider;
}
function options(poolProvider = observedProvider()) {
  return { poolProvider, staticFiles: false, authOptions: {
    lookupSecret: H.LOOKUP_SECRET, jwtSecret: H.JWT_SECRET,
    sessionSecret: 'health-session-secret-'.repeat(4), cursorSecret: H.CURSOR_SECRET, secureCookies: false,
    googleConfig: { clientId: 'health-test.apps.googleusercontent.com', clientSecret: 'test-google-secret',
      callbackUrl: 'http://localhost/api/auth/google/callback' }
  } };
}
function clearActivity() { for (const spy of Object.values(activity)) spy.mockClear(); }
function noActivity() { for (const spy of Object.values(activity)) expect(spy).not.toHaveBeenCalled(); }
function onlyProbes(count = 1) {
  expect(activity.provider).toHaveBeenCalledTimes(count);
  expect(activity.query.mock.calls).toEqual(Array.from({ length: count }, () => [PROBE]));
  expect(activity.connect).not.toHaveBeenCalled(); expect(activity.clientQuery).not.toHaveBeenCalled();
}
function safe(response, ready, head = false) {
  const body = ready ? UP : DOWN;
  expect(response.status).toBe(ready ? 200 : 503);
  if (head) {
    expect(response.text ?? '').toBe('');
    expect(response.headers['content-length']).toBe(String(Buffer.byteLength(JSON.stringify(body))));
  } else {
    expect(response.body).toEqual(body); // exactly three fixed fields; database is the public engine constant only
    expect(Object.keys(response.body).sort()).toEqual(['database', 'ready', 'status']);
    for (const key of ['db', 'host', 'url', 'password', 'error', 'sql', 'credentials', 'databaseName']) {
      expect(response.body).not.toHaveProperty(key);
    }
  }
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['content-type']).toMatch(/^application\/json/);
  for (const header of ['set-cookie', 'www-authenticate', 'location', 'expires', 'last-modified']) {
    expect(response.headers[header]).toBeUndefined();
  }
  const wire = JSON.stringify({ body: response.body, headers: response.headers });
  for (const secret of PRIVATE) expect(wire).not.toContain(secret);
}
async function snapshot() {
  const result = {};
  for (const table of TABLES) result[table] = (await db.pool.query(`SELECT * FROM public.${table} ORDER BY id`)).rows;
  return result;
}
beforeAll(async () => { db = await H.open(); });
beforeEach(async () => {
  await db.reset(); await db.seed();
  providerFailure = false; probeFailure = false; sessionFailure = false; connectGate = null; probeGate = null;
  runtime = createApplication(options());
});
afterEach(async () => {
  connectGate?.release.resolve(); probeGate?.release.resolve();
  await runtime?.close(); jest.restoreAllMocks();
});
afterAll(async () => { await db?.close(); });

// HC-001
test('health ready response requires real verification and one bounded live PostgreSQL probe', async () => {
  expect(runtime.ready).toBe(false);
  const result = await runtime.initialize();
  expect(result).toEqual({ verified: true, migrations: 5 });
  expect(activity.clientQuery.mock.calls.at(-1)[1].text).toBe('COMMIT');
  expect(activity.clientQuery.mock.calls.some(([, input]) => input.text.includes('pg_trigger'))).toBe(true);
  const files = Object.keys(require.cache);
  for (const forbidden of ['/models/', '/mongoose/', '/mongodb/']) {
    expect(files.some(file => file.includes(forbidden))).toBe(false);
  }
  clearActivity();
  safe(await request(runtime.app).get('/health'), true); onlyProbes();
});

// HC-002
test('health before initialization is fixed PostgreSQL 503 without a provider lookup or session', async () => {
  expect(runtime.ready).toBe(false); expect(runtime.server.listening).toBe(false);
  safe(await request(runtime.app).get('/health'), false); noActivity();
});

// HC-003
test('health during pending startup stays 503 until real readiness verification commits before listen', async () => {
  connectGate = gate();
  const held = connectGate, listen = jest.spyOn(runtime.server, 'listen');
  const starting = runtime.start({ port: 0 });
  try {
    await held.entered.promise;
    expect(runtime.ready).toBe(false); expect(listen).not.toHaveBeenCalled();
    clearActivity(); safe(await request(runtime.app).get('/health'), false); noActivity();
    held.release.resolve(); await starting; connectGate = null;
    expect(listen).toHaveBeenCalledTimes(1); expect(runtime.ready).toBe(true);
    expect(activity.clientQuery.mock.calls.at(-1)[1].text).toBe('COMMIT');
    clearActivity(); safe(await request(runtime.server).get('/health'), true); onlyProbes();
  } finally { held.release.resolve(); await starting; }
});

// HC-004
test('health cannot report ready merely because PostgreSQL answers when migration verification failed', async () => {
  const original = (await db.pool.query('SELECT checksum FROM public.schema_migrations WHERE version=5')).rows[0].checksum;
  try {
    await db.pool.query("UPDATE public.schema_migrations SET checksum=repeat('0',64) WHERE version=5");
    await expect(runtime.initialize()).rejects.toMatchObject({ code: 'PG_BOOTSTRAP_LEDGER_MISMATCH' });
    expect((await db.pool.query(PROBE)).rows).toEqual([{ connected: 1 }]);
    clearActivity(); safe(await request(runtime.app).get('/health'), false); noActivity();
  } finally { await db.pool.query('UPDATE public.schema_migrations SET checksum=$1 WHERE version=5', [original]); }
  await runtime.initialize(); clearActivity(); safe(await request(runtime.app).get('/health'), true); onlyProbes();
});

// HC-005
test('health after a real verified PostgreSQL pool ends is sanitized PostgreSQL 503', async () => {
  const pool = new Pool({ ...connectionOptions(process.env, 'DATABASE_URL'), max: 2 });
  pool.on('error', () => {});
  const owned = createApplication(options(() => pool));
  let ended = false;
  try {
    await owned.initialize(); safe(await request(owned.app).get('/health'), true);
    await pool.end(); ended = true;
    expect(owned.ready).toBe(true); // verification success alone does not make a failed live probe healthy
    safe(await request(owned.app).get('/health'), false);
  } finally { await owned.close(); if (!ended) await pool.end(); }
});

// HC-006
test('health hides hostile provider and query errors and recovers only after a new real live probe', async () => {
  await runtime.initialize();
  for (const mode of ['provider', 'query']) {
    providerFailure = mode === 'provider'; probeFailure = mode === 'query'; clearActivity();
    safe(await request(runtime.app).get('/health'), false);
    expect(runtime.ready).toBe(true);
    expect(activity.provider).toHaveBeenCalledTimes(1);
    expect(activity.query).toHaveBeenCalledTimes(mode === 'query' ? 1 : 0);
    expect(activity.connect).not.toHaveBeenCalled(); expect(activity.clientQuery).not.toHaveBeenCalled();
    providerFailure = false; probeFailure = false; clearActivity();
    safe(await request(runtime.app).get('/health'), true); onlyProbes();
  }
});

// HC-007
test('health cannot publish stale success if shutdown clears readiness during an in-flight live probe', async () => {
  await runtime.initialize(); clearActivity(); probeGate = gate();
  const held = probeGate, pending = request(runtime.app).get('/health').then(response => response);
  try {
    await held.entered.promise; await runtime.close(); expect(runtime.ready).toBe(false);
    held.release.resolve(); safe(await pending, false); onlyProbes(); probeGate = null;
    clearActivity(); safe(await request(runtime.app).get('/health'), false); noActivity();
  } finally { held.release.resolve(); await pending; }
});

// HC-008
test('anonymous health creates no session rows and leaves full user session and financial snapshots unchanged', async () => {
  await runtime.initialize(); const before = await snapshot(); clearActivity();
  for (const table of ['express_sessions', 'application_sessions', 'token_revocations']) expect(before[table]).toEqual([]);
  safe(await request(runtime.app).get('/health'), true); onlyProbes();
  expect(await snapshot()).toEqual(before);
});

// HC-009
test('health ignores signed and malformed credentials even when the real session store is unavailable', async () => {
  await runtime.initialize();
  const agent = request.agent(runtime.app), boot = await agent.get('/api/auth/csrf').expect(200);
  await agent.post('/api/auth/login').set('x-csrf-token', boot.body.csrfToken)
    .send({ username: 'Owner_U', password: H.PASSWORD }).expect(200);
  const before = await snapshot(); expect(before.express_sessions.length).toBeGreaterThan(0);
  expect(before.application_sessions.length).toBeGreaterThan(0);
  sessionFailure = true; clearActivity();
  safe(await agent.get('/health'), true);
  safe(await request(runtime.app).get('/health').set('Cookie', 'sessionId=s:malformed.signature')
    .set('Authorization', 'Bearer unverified-private-token').set('x-session-id', 'unverified-session'), true);
  safe(await request(runtime.app).get('/health'), true); onlyProbes(3);
  expect(await snapshot()).toEqual(before);
  clearActivity();
  const control = await agent.get('/api/auth/session-info').expect(503);
  expect(control.body.code).toBe('SESSION_UNAVAILABLE');
  expect(activity.query.mock.calls.some(([input]) => input.text.includes('express_sessions'))).toBe(true);
});

// HC-010
test('health HEAD preserves status fixed JSON length and no-store without body or session effects', async () => {
  safe(await request(runtime.app).head('/health'), false, true); noActivity();
  await runtime.initialize(); const before = await snapshot(); clearActivity();
  safe(await request(runtime.app).head('/health'), true, true);
  probeFailure = true; safe(await request(runtime.app).head('/health'), false, true); onlyProbes(2);
  expect(await snapshot()).toEqual(before);
});
