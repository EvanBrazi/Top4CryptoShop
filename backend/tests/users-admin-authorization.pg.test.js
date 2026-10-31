'use strict';
// C3.2b2: 20 gap cases, not a duplicate of the existing users/auth/avatar suites.
// Real HTTP application, repositories, PG sessions and CAS. Only external
// Cloudinary cleanup/unused upload and Google OAuth transport are controlled.
const request = require('supertest');
const { createHash } = require('node:crypto');
const cloudinary = require('../config/cloudinary');
const { createApplication } = require('../server');
const H = require('./helpers/disposablePg');
const MISSING = '00000000-0000-4000-8000-000000000099';
const CLOUD = 'users-authorization-pg-cloud';
const ASSET = 'payments_receipts/00000000-0000-4000-8000-000000000088';
const AVATAR = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${ASSET}.jpg`;
const GOOGLE = { clientId: 'users-gaps.apps.googleusercontent.com', clientSecret: 'test-google-secret', callbackUrl: 'http://localhost/api/auth/google/callback' };
let db, runtime, oldCloud, uploadSpy, destroySpy, sql, race, raceReady, racePerformed, oauth, exchanges;
const users = async () => (await db.pool.query('SELECT * FROM public.users ORDER BY id')).rows;
const user = async (id = H.OWNER) => (await users()).find(r => r.id === id);
const version = async (id = H.OWNER) => (await user(id)).row_version;
const graph = async () => ({
  parents: (await db.pool.query('SELECT * FROM public.express_sessions ORDER BY id')).rows,
  children: (await db.pool.query('SELECT * FROM public.application_sessions ORDER BY id')).rows,
  revocations: (await db.pool.query('SELECT * FROM public.token_revocations ORDER BY id')).rows
});
const text = input => typeof input === 'string' ? input : input.text;
// Observe real SQL without changing rows. For the password race only, commit a
// separate theme UPDATE after password precheck/hash and before account locking.
function poolProvider() {
  return {
    async query(input, values) {
      sql.push(text(input));
      const result = await db.pool.query(input, values);
      if (race && text(input).startsWith('SELECT provider, password_hash, token_version, row_version FROM public.users')) raceReady = true;
      return result;
    },
    async connect() {
      const raw = await db.pool.connect();
      return { connection: raw.connection, on: (...a) => raw.on(...a), removeListener: (...a) => raw.removeListener(...a), release: broken => raw.release(broken),
        async query(input, values) {
          const statement = text(input); sql.push(statement);
          if (raceReady && statement.includes('FROM public.users WHERE id = ANY') && statement.includes('FOR UPDATE')) {
            raceReady = false; race = false;
            await db.pool.query('UPDATE public.users SET theme=1 WHERE id=$1::UUID', [H.OWNER]);
            racePerformed = true;
          }
          return raw.query(input, values);
        }
      };
    }
  };
}
const googleTransport = Object.freeze({
  authorizationUrl(options) {
    oauth = options;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [k, v] of Object.entries({ client_id: GOOGLE.clientId, redirect_uri: GOOGLE.callbackUrl, response_type: 'code', scope: 'openid email profile', ...options })) url.searchParams.set(k, v);
    return url.href;
  },
  async exchangeAndVerify({ code, codeVerifier }) {
    exchanges++;
    expect(code).toBe('test-google-code');
    expect(createHash('sha256').update(codeVerifier).digest('base64url')).toBe(oauth.code_challenge);
    const now = Math.floor(Date.now() / 1000);
    return { iss: 'https://accounts.google.com', aud: GOOGLE.clientId, sub: 'google-owner', email: 'u@example.test', email_verified: true, iat: now, exp: now + 3600, nonce: oauth.nonce };
  }
});
async function browser(agent, login) {
  const id = login.body.user.id;
  const rows = (await db.pool.query(`SELECT a.id AS child_id, a.user_id, a.express_session_id, e.id AS parent_id, e.user_id AS parent_user, e.session_data
    FROM public.application_sessions a JOIN public.express_sessions e ON e.id=a.express_session_id
    WHERE a.token_digest=$1 AND a.revoked_at IS NULL AND e.revoked_at IS NULL`, [createHash('sha256').update(login.body.token).digest('hex')])).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ user_id: id, parent_user: id, parent_id: rows[0].express_session_id });
  expect(rows[0].session_data.csrfToken).toBe(login.body.csrfToken);
  expect(login.body.user.rowVersion).toBe(await version(id));
  expect(login.body.user.rowVersion).toMatch(/^(0|[1-9][0-9]*)$/);
  return { agent, id, csrf: login.body.csrfToken, parent: rows[0].parent_id, child: rows[0].child_id };
}
async function logged(username = 'Owner_U') {
  const agent = request.agent(runtime.server), boot = await agent.get('/api/auth/csrf').expect(200);
  return browser(agent, await agent.post('/api/auth/login').set('x-csrf-token', boot.body.csrfToken).send({ username, password: H.PASSWORD }).expect(200));
}
async function write(b, method, suffix = '', patch = {}, id = H.OWNER) {
  return b.agent[method](`/api/users/${id}${suffix}`).set('x-csrf-token', b.csrf).send({ expectedRowVersion: await version(id), ...patch });
}
function failure(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ success: false, code, error: code });
  expect(response.headers['cache-control']).toBe('no-store');
}
async function noMoney() {
  expect((await users()).map(r => [r.balance_cents, r.balance])).toEqual([['10000', '100.00'], ['10000', '100.00'], ['10000', '100.00']]);
  for (const table of ['financial_operations', 'orders', 'payments']) expect((await db.pool.query(`SELECT count(*) AS n FROM public.${table}`)).rows[0].n).toBe('0');
}
async function unchanged(accounts, sessions) {
  expect(await users()).toEqual(accounts); expect(await graph()).toEqual(sessions); await noMoney();
  expect(uploadSpy).not.toHaveBeenCalled(); expect(destroySpy).not.toHaveBeenCalled();
}
function noUserWrites() { expect(sql.filter(s => /^(?:UPDATE|INSERT INTO|DELETE FROM) public\.users\b/.test(s))).toEqual([]); }
async function onlyTargetRevoked(before, id, reason, minimum, persistedParent = null) {
  const after = await graph();
  for (const kind of ['parents', 'children']) {
    const target = before[kind].filter(r => r.user_id === id);
    expect(target.length).toBeGreaterThanOrEqual(minimum);
    // Successful non-self lifecycle responses explicitly persist the actor's
    // parent session. Its binding, CSRF, data and revocation state remain fixed;
    // only the ordinary cookie expiry and CAS metadata may advance once.
    const survivors = before[kind].filter(r => r.user_id !== id).map(row => {
      if (kind !== 'parents' || row.id !== persistedParent) return row;
      const touched = after.parents.find(r => r.id === persistedParent);
      expect(touched.expires_at.getTime()).toBeGreaterThanOrEqual(row.expires_at.getTime());
      expect(touched.updated_at.getTime()).toBeGreaterThanOrEqual(row.updated_at.getTime());
      expect(touched.session_data.cookie.expires).toBe(touched.expires_at.toISOString());
      return { ...row, expires_at: touched.expires_at, updated_at: touched.updated_at,
        row_version: (BigInt(row.row_version) + 1n).toString(),
        session_data: { ...row.session_data, cookie: { ...row.session_data.cookie, expires: touched.session_data.cookie.expires } } };
    });
    expect(after[kind].filter(r => r.user_id !== id)).toEqual(survivors);
    expect(after[kind].filter(r => r.user_id === id).map(r => r.id)).toEqual(target.map(r => r.id));
    for (const row of after[kind].filter(r => r.user_id === id)) {
      expect(row.revoked_at).toBeInstanceOf(Date);
      if (kind === 'parents') expect(row.session_data).toEqual({});
      else expect(row.revocation_reason).toBe(reason);
    }
  }
  expect(after.revocations).toEqual(before.revocations);
}
beforeAll(async () => {
  db = await H.open(); oldCloud = { ...cloudinary.config() };
  cloudinary.config({ cloud_name: CLOUD, api_key: 'test-key', api_secret: 'test-secret' });
  uploadSpy = jest.spyOn(cloudinary.uploader, 'upload_stream'); destroySpy = jest.spyOn(cloudinary.uploader, 'destroy');
});
beforeEach(async () => {
  await db.reset(); await db.seed(); sql = []; race = raceReady = racePerformed = false; oauth = {}; exchanges = 0;
  uploadSpy.mockReset().mockImplementation(() => { throw new Error('unexpected external avatar upload'); });
  destroySpy.mockReset().mockResolvedValue({ result: 'ok' });
  runtime = createApplication({ poolProvider, staticFiles: false, authOptions: { lookupSecret: H.LOOKUP_SECRET, jwtSecret: H.JWT_SECRET,
    cursorSecret: H.CURSOR_SECRET, sessionSecret: 'users-authorization-parent-secret-'.repeat(2), secureCookies: false,
    googleConfig: GOOGLE, googleTransport } });
  await runtime.start({ port: 0, host: '127.0.0.1' });
});
afterEach(async () => { await runtime?.close(); });
afterAll(async () => { uploadSpy?.mockRestore(); destroySpy?.mockRestore(); if (oldCloud) cloudinary.config(oldCloud); await db?.close(); });

// Read gap: positive listing and ordinary/demoted-admin denial already exist.
test('anonymous users listing rejects before enumeration or session persistence', async () => {
  const accounts = await users(), sessions = await graph(); sql = [];
  failure(await request(runtime.server).get('/api/users'), 401, 'MISSING_CREDENTIALS');
  expect(sql).toEqual([]); await unchanged(accounts, sessions);
});

// Cross-user gaps: admin profile/theme and both avatar uploads already exist.
test('ordinary cross-user profile and theme mutations cannot write any account', async () => {
  const b = await logged(), accounts = await users(), sessions = await graph(); sql = [];
  for (const [suffix, patch] of [['', { username: 'Changed_Name' }], ['/theme', { theme: 1 }]]) {
    failure(await write(b, 'put', suffix, patch, H.OTHER), 403, 'FORBIDDEN'); await unchanged(accounts, sessions);
  }
  noUserWrites();
});
test.each(['Owner_U', 'Admin_A'])('cross-user avatar removal has no exception for %s', async username => {
  await db.pool.query('UPDATE public.users SET avatar=$2 WHERE id=$1', [H.OTHER, AVATAR]);
  const b = await logged(username), accounts = await users(), sessions = await graph(); sql = [];
  failure(await write(b, 'post', '/avatar/remove', {}, H.OTHER), 403, 'FORBIDDEN');
  await unchanged(accounts, sessions); noUserWrites();
});

// Allowlists/password gaps: related historical variants remain explicit matrices.
test('remaining profile forbidden fields reject the entire otherwise valid patch', async () => {
  const b = await logged(), accounts = await users(), sessions = await graph(); sql = [];
  // balance/role/status/version/avatar are covered by users-server; provider and
  // twoFAStatus also have exact combined-patch coverage in integration-prerequisites.
  for (const field of ['googleId', 'twoFASecret', 'trustedDevices', 'resetPasswordToken', 'loginAttempts', 'unexpected']) {
    failure(await write(b, 'put', '', { username: 'Valid_Name', [field]: 'injected' }), 400, 'INVALID_AUTH_INPUT');
    await unchanged(accounts, sessions);
  }
  noUserWrites();
});
test('null array empty and string profile bodies leave accounts and sessions unchanged', async () => {
  const b = await logged(), accounts = await users(), sessions = await graph(); sql = [];
  for (const body of [null, [], {}, 'invalid']) {
    const r = await b.agent.put(`/api/users/${H.OWNER}`).set('x-csrf-token', b.csrf).set('Content-Type', 'application/json').send(JSON.stringify(body));
    failure(r, 400, 'INVALID_AUTH_INPUT'); await unchanged(accounts, sessions);
  }
  noUserWrites();
});
test('identity CAS changes only allowlisted columns and never rehashes the password', async () => {
  const b = await logged(), accounts = await users(), original = accounts.find(r => r.id === H.OWNER); sql = [];
  const r = await write(b, 'put', '', { username: 'New_Name', email: 'NEW@EXAMPLE.TEST', phone: '+14155552671', theme: 1 });
  expect(r.status).toBe(200); expect(r.body.requiresReauthentication).toBe(true);
  const changed = await user();
  expect(changed).toEqual({ ...original, username: 'New_Name', email: 'new@example.test', email_verified: false, phone: '+14155552671', theme: 1,
    token_version: (BigInt(original.token_version) + 1n).toString(), row_version: (BigInt(original.row_version) + 1n).toString(), updated_at: changed.updated_at });
  expect((await users()).filter(u => u.id !== H.OWNER)).toEqual(accounts.filter(u => u.id !== H.OWNER));
  expect(sql.filter(s => /^UPDATE public\.users SET/.test(s))).toHaveLength(1); await noMoney();
  await b.agent.get('/api/users/me').expect(401);
});
test('password change revokes every owner parent and child but preserves admin and other graphs', async () => {
  const b = await logged(), second = await logged(), admin = await logged('Admin_A'), other = await logged('Other_U');
  const accounts = await users(), sessions = await graph(), original = accounts.find(r => r.id === H.OWNER); sql = [];
  const r = await write(b, 'put', '', { currentPassword: H.PASSWORD, password: 'UpdatedPassword2!' });
  expect(r.status).toBe(200); expect(r.body.requiresReauthentication).toBe(true);
  const changed = await user();
  expect(changed.password_hash).not.toBe(original.password_hash);
  expect(changed).toEqual({ ...original, password_hash: changed.password_hash, token_version: (BigInt(original.token_version) + 1n).toString(),
    row_version: (BigInt(original.row_version) + 1n).toString(), updated_at: changed.updated_at });
  expect((await users()).filter(u => u.id !== H.OWNER)).toEqual(accounts.filter(u => u.id !== H.OWNER));
  await onlyTargetRevoked(sessions, H.OWNER, 'password_change', 2); await noMoney();
  expect(sql.filter(s => /^UPDATE public\.users SET/.test(s))).toHaveLength(1);
  await b.agent.get('/api/users/me').expect(401); await second.agent.get('/api/users/me').expect(401);
  await admin.agent.get('/api/users/me').expect(200); await other.agent.get('/api/users/me').expect(200);
});
test('missing current and empty new passwords fail without account or graph writes', async () => {
  const b = await logged(), accounts = await users(), sessions = await graph(); sql = [];
  // Wrong, weak and current-only inputs already have exact surviving assertions.
  for (const [patch, status, code] of [[{ password: 'UpdatedPassword2!' }, 403, 'CURRENT_PASSWORD_INVALID'],
    [{ password: '', currentPassword: H.PASSWORD }, 400, 'INVALID_PASSWORD']]) {
    failure(await write(b, 'put', '', patch), status, code); await unchanged(accounts, sessions);
  }
  noUserWrites();
});
test('Google-only HTTP authenticated account cannot acquire a local password', async () => {
  await db.pool.query("UPDATE public.users SET provider='google',password_hash=NULL,google_id='google-owner' WHERE id=$1", [H.OWNER]);
  const agent = request.agent(runtime.server), start = await agent.get('/api/auth/google').expect(302);
  const state = new URL(start.headers.location).searchParams.get('state');
  const login = await agent.get('/api/auth/google/callback').query({ state, code: 'test-google-code' }).set('Accept', 'application/json').expect(200);
  const b = await browser(agent, login), accounts = await users(), sessions = await graph(); sql = [];
  expect(exchanges).toBe(1); expect(await user()).toMatchObject({ provider: 'google', password_hash: null });
  failure(await write(b, 'put', '', { currentPassword: H.PASSWORD, password: 'UpdatedPassword2!' }), 403, 'CURRENT_PASSWORD_INVALID');
  await unchanged(accounts, sessions); noUserWrites(); await b.agent.get('/api/users/me').expect(200);
});
test('losing password CAS preserves the hash and graph after a real concurrent theme commit', async () => {
  const b = await logged(), accounts = await users(), sessions = await graph(), original = accounts.find(r => r.id === H.OWNER); sql = []; race = true;
  failure(await write(b, 'put', '', { currentPassword: H.PASSWORD, password: 'UpdatedPassword2!' }), 409, 'USER_VERSION_CONFLICT');
  expect(racePerformed).toBe(true); expect(raceReady).toBe(false);
  const current = await user();
  expect(current).toEqual({ ...original, theme: 1, row_version: (BigInt(original.row_version) + 1n).toString(), updated_at: current.updated_at });
  expect((await users()).filter(u => u.id !== H.OWNER)).toEqual(accounts.filter(u => u.id !== H.OWNER));
  expect(await graph()).toEqual(sessions); noUserWrites(); await noMoney();
  expect(uploadSpy).not.toHaveBeenCalled(); expect(destroySpy).not.toHaveBeenCalled(); await b.agent.get('/api/users/me').expect(200);
});
test('theme and avatar removal require exact parent CSRF before effects', async () => {
  await db.pool.query('UPDATE public.users SET avatar=$2 WHERE id=$1', [H.OWNER, AVATAR]);
  const b = await logged(), accounts = await users(), sessions = await graph(); sql = [];
  for (const [method, suffix, patch] of [['put', '/theme', { theme: 1 }], ['post', '/avatar/remove', {}]]) {
    for (const csrf of [null, 'wrong']) {
      let r = b.agent[method](`/api/users/${H.OWNER}${suffix}`);
      if (csrf !== null) r = r.set('x-csrf-token', csrf);
      failure(await r.send({ expectedRowVersion: await version(), ...patch }), 403, 'CSRF_INVALID'); await unchanged(accounts, sessions);
    }
  }
  noUserWrites();
});
test('theme endpoint rejects extra financial fields and null body without partial mutation', async () => {
  const b = await logged(), accounts = await users(), sessions = await graph(); sql = [];
  failure(await write(b, 'put', '/theme', { theme: 1, balance: 999 }), 400, 'INVALID_AUTH_INPUT'); await unchanged(accounts, sessions);
  failure(await b.agent.put(`/api/users/${H.OWNER}/theme`).set('x-csrf-token', b.csrf).set('Content-Type', 'application/json').send('null'), 400, 'INVALID_AUTH_INPUT');
  await unchanged(accounts, sessions); noUserWrites();
  // Successful theme-only preservation is credited to users-server, not repeated.
});
test('avatar removal rejects injected fields without clearing or deleting the owned asset', async () => {
  await db.pool.query('UPDATE public.users SET avatar=$2 WHERE id=$1', [H.OWNER, AVATAR]);
  const b = await logged(), accounts = await users(), sessions = await graph(); sql = [];
  failure(await write(b, 'post', '/avatar/remove', { avatar: 'injected' }), 400, 'INVALID_AUTH_INPUT');
  await unchanged(accounts, sessions); noUserWrites();
});

// Lifecycle gaps: authority/CSRF/stale CAS/logical DELETE success already exist.
test('activation allowlist and revocation affect only the target session graph', async () => {
  const owner = await logged(), second = await logged(), admin = await logged('Admin_A'), other = await logged('Other_U');
  await db.pool.query("UPDATE public.users SET account_status='suspended',login_attempts=5 WHERE id=$1", [H.OWNER]);
  const accounts = await users(), sessions = await graph(), original = accounts.find(r => r.id === H.OWNER); sql = [];
  failure(await write(admin, 'put', '/activate', { role: 'admin' }), 400, 'INVALID_AUTH_INPUT'); await unchanged(accounts, sessions); noUserWrites();
  const r = await write(admin, 'put', '/activate'); expect(r.status).toBe(200);
  const current = await user(); expect(current.activated_at).toBeInstanceOf(Date);
  expect(current).toEqual({ ...original, account_status: 'active', login_attempts: 0, activated_at: current.activated_at,
    token_version: (BigInt(original.token_version) + 1n).toString(), row_version: (BigInt(original.row_version) + 1n).toString(), updated_at: current.updated_at });
  expect((await users()).filter(u => u.id !== H.OWNER)).toEqual(accounts.filter(u => u.id !== H.OWNER));
  await onlyTargetRevoked(sessions, H.OWNER, 'account_status_change', 2, admin.parent); await noMoney();
  await owner.agent.get('/api/users/me').expect(401); await second.agent.get('/api/users/me').expect(401);
  await admin.agent.get('/api/users/me').expect(200); await other.agent.get('/api/users/me').expect(200);
});
test('DELETE rejects extra financial fields without deleting or deactivating the target', async () => {
  await logged(); const admin = await logged('Admin_A'), accounts = await users(), sessions = await graph(); sql = [];
  failure(await write(admin, 'delete', '', { balance: 0 }), 400, 'INVALID_AUTH_INPUT'); await unchanged(accounts, sessions); noUserWrites();
});
test('missing lifecycle UUIDs return 404 without account or session mutations', async () => {
  await logged(); const admin = await logged('Admin_A'), accounts = await users(), sessions = await graph(); sql = [];
  for (const [method, suffix] of [['delete', ''], ['put', '/activate']]) {
    failure(await admin.agent[method](`/api/users/${MISSING}${suffix}`).set('x-csrf-token', admin.csrf).send({ expectedRowVersion: '0' }), 404, 'USER_NOT_FOUND');
    await unchanged(accounts, sessions);
  }
  noUserWrites();
});
test('lifecycle and disabled balance reject malformed and legacy ObjectId targets before target queries', async () => {
  const admin = await logged('Admin_A'), accounts = await users(), sessions = await graph();
  for (const id of ['not-an-id', 'abcdef0123456789abcdef01']) {
    for (const [method, suffix] of [['delete', ''], ['put', '/activate'], ['put', '/balance']]) {
      sql = [];
      failure(await admin.agent[method](`/api/users/${id}${suffix}`).set('x-csrf-token', admin.csrf).send({ expectedRowVersion: '0', balance: 10 }), 400, 'INVALID_USER_ID');
      expect(sql.some(s => s.includes('FROM public.users WHERE id = ANY'))).toBe(false);
      expect(sql.some(s => /^SELECT .*FROM public\.users WHERE id = \$1/.test(s))).toBe(false);
      await unchanged(accounts, sessions); noUserWrites();
    }
  }
});

// Disabled gaps: approved users balance auth/CSRF and valid 503 already exist.
test('authorized disabled balance ignores every historical body without account or graph writes', async () => {
  const admin = await logged('Admin_A'), accounts = await users(), sessions = await graph(); sql = [];
  for (const body of [null, [], {}, { balance: '10' }, { balance: -1 }, { balance: Infinity }, { balance: NaN },
    { balance: Number.MAX_SAFE_INTEGER + 1 }, { balance: 10, expectedBalance: '100' }, { balance: 10, role: 'admin' }, { balance: 10, tokenVersion: 999 }]) {
    failure(await admin.agent.put(`/api/users/${H.OTHER}/balance`).set('x-csrf-token', admin.csrf).set('Content-Type', 'application/json').send(JSON.stringify(body)), 503, 'FINANCIAL_UNAVAILABLE');
    await unchanged(accounts, sessions);
  }
  noUserWrites();
});
test('exact disabled admin paths and reserve HEAD preflight never consult session or account storage', async () => {
  const owner = await logged(), admin = await logged('Admin_A');
  // Check real anonymous, ordinary and current-admin callers first, then stale
  // ordinary and inactive former-admin credentials. Neither phase may enter
  // legacy authentication, validation or storage at an unavailable prefix.
  for (const phase of ['active', 'stale/inactive']) {
    if (phase === 'stale/inactive') {
      await db.pool.query('UPDATE public.users SET token_version=token_version+1 WHERE id=$1', [H.OWNER]);
      await db.pool.query("UPDATE public.users SET account_status='suspended' WHERE id=$1", [H.ADMIN]);
    }
    const accounts = await users(), sessions = await graph();
    for (const agent of [request(runtime.server), owner.agent, admin.agent]) {
      for (const [method, path] of [['get', '/api/admin/users'], ['get', '/api/admin/panel'], ['put', `/api/admin/update-balance/${H.OTHER}`], ['put', '/api/admin/update-balance/not-an-id']]) {
        for (const body of [null, { balance: 10, expectedBalance: 100 }, { role: 'admin', tokenVersion: 999 }]) {
          sql = [];
          failure(await agent[method](path).set('Content-Type', 'application/json').send(JSON.stringify(body)), 503, 'FEATURE_UNAVAILABLE');
          expect(sql).toEqual([]); await unchanged(accounts, sessions);
        }
      }
    }
  }
  const accounts = await users(), sessions = await graph();
  for (const name of ['reserve', 'restore']) {
    sql = []; const path = `/api/users/${H.OWNER}/${name}`;
    const head = await request(runtime.server).head(path).expect(410);
    expect(head.text).toBeUndefined(); expect(head.headers['cache-control']).toBe('no-store'); expect(head.headers['set-cookie']).toBeUndefined();
    const preflight = await request(runtime.server).options(path).set('Origin', 'http://localhost:10000').set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'x-csrf-token').expect(204);
    expect(preflight.text).toBe(''); expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:10000');
    expect(preflight.headers['access-control-allow-methods']).toContain('POST'); expect(preflight.headers['set-cookie']).toBeUndefined();
    expect(sql).toEqual([]); await unchanged(accounts, sessions);
  }
});
