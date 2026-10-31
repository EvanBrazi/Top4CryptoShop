'use strict';
// C3.2d1: admin and reserve/restore contracts are credited to the existing
// users/admin suites. These 16 cases add non-admin credential, HEAD and boundary gaps.
const request = require('supertest');
const { createApplication } = require('../services/serverApplication');
const H = require('./helpers/disposablePg');

jest.setTimeout(30000);
const PREFIXES = ['/api/notifications', '/api/backups', '/api/security', '/api/icons',
  '/api/cards', '/dev', '/api/compare-token'];
const UNAVAILABLE = { success: false, code: 'FEATURE_UNAVAILABLE', error: 'FEATURE_UNAVAILABLE' };
const ORIGIN = 'http://localhost:10000';
const TABLES = ['users', 'express_sessions', 'application_sessions', 'token_revocations',
  'financial_operations', 'orders', 'payments'];
let db, runtime, activity;

async function snapshot() {
  const result = {};
  for (const table of TABLES) result[table] = (await db.pool.query(`SELECT * FROM public.${table} ORDER BY id`)).rows;
  return result;
}
function observedProvider() {
  activity = {
    query: jest.fn((...args) => db.pool.query(...args)),
    clientQuery: jest.fn((client, ...args) => client.query(...args)),
    connect: jest.fn(async () => {
      const client = await db.pool.connect();
      return { connection: client.connection, on: (...args) => client.on(...args),
        removeListener: (...args) => client.removeListener(...args), release: broken => client.release(broken),
        query: (...args) => activity.clientQuery(client, ...args) };
    })
  };
  const pool = { query: activity.query, connect: activity.connect };
  activity.provider = jest.fn(() => pool);
  return activity.provider;
}
async function noActivity(work) {
  const before = await snapshot();
  for (const spy of Object.values(activity)) spy.mockClear();
  const result = await work();
  // Stronger than no DML: not even a provider lookup, SELECT or checkout.
  for (const spy of Object.values(activity)) expect(spy).not.toHaveBeenCalled();
  expect(await snapshot()).toEqual(before); // full money, user and session rows, not just counts
  return result;
}
async function logged(username = 'Owner_U') {
  const agent = request.agent(runtime.app);
  const boot = await agent.get('/api/auth/csrf').expect(200);
  await agent.post('/api/auth/login').set('x-csrf-token', boot.body.csrfToken)
    .send({ username, password: H.PASSWORD }).expect(200);
  return agent;
}
function unavailable(response) {
  expect(response.status).toBe(503);
  expect(response.body).toEqual(UNAVAILABLE);
  expect(response.headers['cache-control']).toBe('no-store');
  for (const header of ['set-cookie', 'www-authenticate', 'location', 'expires', 'last-modified']) {
    expect(response.headers[header]).toBeUndefined();
  }
}
beforeAll(async () => { db = await H.open(); });
beforeEach(async () => {
  await db.reset(); await db.seed();
  runtime = createApplication({ poolProvider: observedProvider(), staticFiles: false,
    authOptions: { lookupSecret: H.LOOKUP_SECRET, jwtSecret: H.JWT_SECRET,
      sessionSecret: 'disabled-prefix-session-secret-'.repeat(3), cursorSecret: H.CURSOR_SECRET,
      secureCookies: false, googleConfig: { clientId: 'disabled-test.apps.googleusercontent.com',
        clientSecret: 'test-google-secret', callbackUrl: 'http://localhost/api/auth/google/callback' } } });
  await runtime.initialize();
});
afterEach(async () => { await runtime?.close(); });
afterAll(async () => { await db?.close(); });

test.each(PREFIXES)('disabled %s ignores anonymous active stale and suspended credentials without any SQL or session effects', async prefix => {
  const owner = await logged(), admin = await logged('Admin_A');
  for (const phase of ['active', 'stale/suspended']) {
    if (phase === 'stale/suspended') {
      await db.pool.query('UPDATE public.users SET token_version=token_version+1 WHERE id=$1', [H.OWNER]);
      await db.pool.query("UPDATE public.users SET account_status='suspended' WHERE id=$1", [H.ADMIN]);
    }
    await noActivity(async () => {
      for (const agent of [request(runtime.app), owner, admin]) {
        unavailable(await agent.post(prefix + '/nested').set('Origin', ORIGIN)
          .send({ role: 'admin', tokenVersion: 999, balance: 10, paymentId: 'private-payment' }));
      }
      unavailable(await request(runtime.app).patch(prefix).set('Authorization', 'not-a-bearer')
        .set('x-session-id', 'invalid-session').send({ arbitrary: true }));
    });
  }
});

test.each(PREFIXES)('disabled %s HEAD is bodyless no-store and cannot refresh an authenticated session', async prefix => {
  const owner = await logged();
  await noActivity(async () => {
    for (const agent of [request(runtime.app), owner]) {
      const response = await agent.head(prefix + '/nested').set('Origin', ORIGIN).expect(503);
      expect(response.text ?? '').toBe('');
      expect(response.headers['content-length']).toBe(String(Buffer.byteLength(JSON.stringify(UNAVAILABLE))));
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers.vary).toContain('Origin');
      for (const header of ['set-cookie', 'www-authenticate', 'location', 'expires', 'last-modified']) {
        expect(response.headers[header]).toBeUndefined();
      }
    }
  });
});

test('compare-token composition preflight is handled by CORS before disabled authentication and rejects unapproved origins', async () => {
  const owner = await logged();
  await noActivity(async () => {
    for (const agent of [request(runtime.app), owner]) {
      const response = await agent.options('/api/compare-token/nested').set('Origin', ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Authorization,x-session-id,x-csrf-token').expect(204);
      expect(response.text).toBe('');
      expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-methods'].split(',')).toContain('POST');
      const headers = response.headers['access-control-allow-headers'].toLowerCase().split(',');
      expect(headers).toEqual(expect.arrayContaining(['authorization', 'x-session-id', 'x-csrf-token']));
      expect(response.headers['access-control-max-age']).toBe('86400');
      // Actual composition: CORS ends preflight before the no-store prefix handler.
      expect(response.headers['cache-control']).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers['www-authenticate']).toBeUndefined();
    }
    const forbidden = await request(runtime.app).options('/api/compare-token')
      .set('Origin', 'https://unapproved.example').set('Access-Control-Request-Method', 'POST').expect(403);
    expect(forbidden.body).toEqual({ code: 'CORS_FORBIDDEN', error: 'CORS_FORBIDDEN' });
    expect(forbidden.headers['access-control-allow-origin']).toBeUndefined();
    expect(forbidden.headers['set-cookie']).toBeUndefined();
  });
});

test('disabled mounts match path segments without shadowing adjacent paths or an enabled authenticated route', async () => {
  await noActivity(async () => {
    for (const path of ['/api/notifications-adjacent', '/api/cardsx', '/api/compare-tokenized', '/devtools']) {
      const response = await request(runtime.app).get(path).expect(404);
      expect(response.body).toEqual({ code: 'NOT_FOUND', error: 'NOT_FOUND' });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });
  const owner = await logged();
  await noActivity(async () => unavailable(await owner.get('/api/compare-token')));
  for (const spy of Object.values(activity)) spy.mockClear();
  const enabled = await owner.get('/api/users/me').expect(200);
  expect(enabled.body.id).toBe(H.OWNER);
  expect(activity.provider).toHaveBeenCalled(); // genuine PG-authenticated control, not a fake success
  expect(activity.query.mock.calls.length + activity.clientQuery.mock.calls.length).toBeGreaterThan(0);
  await noActivity(async () => unavailable(await owner.get('/api/notifications')));
});
