'use strict';
// Real Supertest/Express/session/JWT/TOTP/repositories + guarded verified-TLS PG18.
// ONLY Google's external exchange/verification transport is controlled. Driver
// fault tests wrap REAL pg calls; no mock database or disabled constraints.
const request = require('supertest');
const express = require('../node_modules/express');
const cookieParser = require('../node_modules/cookie-parser');
const signature = require('../node_modules/cookie-signature');
const jwt = require('../node_modules/jsonwebtoken');
const speakeasy = require('../node_modules/speakeasy');
const { createHash, createHmac } = require('node:crypto');
const H = require('./helpers/disposablePg');
const { createAuthContext } = require('../services/auth/httpContext');
const { createAuthRouter } = require('../routes/auth');
const SECRET = 'http-session-signing-test-secret-'.repeat(2), TOTP = 'JBSWY3DPEHPK3PXP';
const CONFIG = { clientId: 'http-tests.apps.googleusercontent.com', clientSecret: 'test-only-google-secret', callbackUrl: 'http://localhost/api/auth/google/callback' };
let db, app, ctx, transport, oauth, payloadPatch, fault;
function build(options = {}) {
  const context = createAuthContext({ poolProvider: options.poolProvider || (() => db.pool), lookupSecret: H.LOOKUP_SECRET,
    jwtSecret: H.JWT_SECRET, sessionSecret: SECRET, googleConfig: CONFIG, googleTransport: transport, ...options });
  const application = express(); application.disable('x-powered-by');
  application.use(cookieParser()); application.use(context.sessionMiddleware);
  application.use('/api/auth', createAuthRouter(context));
  const finish = async (req, res) => { const principal = req.auth.principal; await context.adapter.persistResponse(req, res); res.json({ principal, role: req.auth.role }); };
  application.get('/probe/admin', context.auth.verifyToken, context.auth.checkAdmin, finish);
  application.get('/probe/self/:id', context.auth.verifyToken, context.auth.requireSelf(), finish);
  application.get('/probe/self-or-admin/:id', context.auth.verifyToken, context.auth.requireSelfOrAdmin(), finish);
  application.get('/probe/forged', (req, res, next) => { req.user = { role: 'admin' }; req.auth = { principal: H.principal(H.ADMIN), role: 'admin' }; next(); }, context.auth.checkAdmin, finish);
  application.use(context.errorMiddleware);
  return { app: application, ctx: context };
}
function responseCookies(response) {
  return Object.fromEntries((response.headers['set-cookie'] || []).map(c => {
    const pair = c.split(';')[0], i = pair.indexOf('='); return [pair.slice(0, i), decodeURIComponent(pair.slice(i + 1))];
  }));
}
function cookieHeader(cookies) { return Object.entries(cookies).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('; '); }
function expressSid(response) { return signature.unsign(responseCookies(response).sessionId.slice(2), SECRET); }
const digest = (domain, value) => createHmac('sha256', H.LOOKUP_SECRET).update(domain + ':v1\0').update(value).digest('hex');
async function boot(agent = request.agent(app)) {
  const response = await agent.get('/api/auth/csrf').expect(200);
  return { agent, csrf: response.body.csrfToken, response };
}
function login(agent, csrf, username = 'Owner_U', password = H.PASSWORD) {
  return agent.post('/api/auth/login').set('x-csrf-token', csrf).send({ username, password });
}
async function logged(username = 'Owner_U') {
  const browser = await boot(); browser.login = await login(browser.agent, browser.csrf, username); expect(browser.login.status).toBe(200);
  browser.csrf = browser.login.body.csrfToken; return browser;
}
async function state(userId = H.OWNER) { return (await db.pool.query('SELECT * FROM public.users WHERE id=$1', [userId])).rows[0]; }
async function enable(userId = H.OWNER) { await db.pool.query("UPDATE public.users SET two_fa_status='enabled',two_fa_secret=$2 WHERE id=$1", [userId, TOTP]); }
const code = () => speakeasy.totp({ secret: TOTP, encoding: 'base32' });
async function begin2fa() { await enable(); return logged(); }
function complete(browser, candidate = code()) {
  return browser.agent.post('/api/auth/verify-2fa-login').set('x-csrf-token', browser.csrf).send({ challengeId: browser.login.body.challengeId, code: candidate });
}
async function beginGoogle(agent = request.agent(app)) {
  const response = await agent.get('/api/auth/google').expect(302);
  return { agent, response, state: new URL(response.headers.location).searchParams.get('state') };
}
function callbackGoogle(browser, extra = {}, json = true) {
  let r = browser.agent.get('/api/auth/google/callback').query({ state: browser.state, code: 'test-provider-code', ...extra });
  if (json) r = r.set('Accept', 'application/json'); return r;
}
async function googleOwner() {
  await db.pool.query("UPDATE public.users SET provider='google',password_hash=NULL,google_id='google-owner' WHERE id=$1", [H.OWNER]);
  payloadPatch = { sub: 'google-owner', email: 'u@example.test' };
}
async function applicationCount() { return Number((await db.pool.query('SELECT count(*) AS n FROM public.application_sessions')).rows[0].n); }
function noSecrets(value) {
  for (const field of ['password', 'password_hash', 'twoFASecret', 'two_fa_secret', 'trustedDevices', 'resetPasswordToken', 'tokenVersion', '__top4StoreRevision', 'expressSid', 'expressSession']) expect(value).not.toHaveProperty(field);
}
// Owned real-driver fault wrapper. Only the requested request transaction is
// faulted; fixtures and all successful queries still use the actual pg driver.
function faultProvider() {
  return { query: (...args) => { if (fault === 'read') throw new Error('private connection target/password'); return db.pool.query(...args); },
    async connect() {
      const c = await db.pool.connect(); let matched = false;
      return { on: (...a) => c.on(...a), removeListener: (...a) => c.removeListener(...a), release: broken => c.release(broken),
        async query(input) {
          const sql = typeof input === 'string' ? input : input.text;
          if (fault === 'issue-unknown' && sql.includes('INSERT INTO public.application_sessions')) matched = true;
          if (fault === 'logout-unknown' && sql.includes('INSERT INTO public.token_revocations')) matched = true;
          if (fault === 'oauth-unknown' && sql.includes('UPDATE public.express_sessions SET session_data=$1::JSONB')) matched = true;
          const result = await c.query(input);
          if (matched && sql === 'COMMIT') { fault = null; throw new Error('private lost COMMIT acknowledgement'); }
          return result;
        } };
    } };
}
beforeAll(async () => { db = await H.open(); });
beforeEach(async () => {
  await db.reset(); await db.seed(); payloadPatch = {}; fault = null; oauth = {};
  transport = Object.freeze({ authorizationUrl: jest.fn(options => {
    oauth = options; const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [key, value] of Object.entries({ client_id: CONFIG.clientId, redirect_uri: CONFIG.callbackUrl, response_type: 'code', scope: 'openid email profile', ...options })) url.searchParams.set(key, value);
    return url.href;
  }), exchangeAndVerify: jest.fn(async ({ code: providerCode, codeVerifier }) => {
    expect(providerCode).toBe('test-provider-code');
    expect(createHash('sha256').update(codeVerifier).digest('base64url')).toBe(oauth.code_challenge);
    const now = Math.floor(Date.now() / 1000);
    return { iss: 'https://accounts.google.com', aud: CONFIG.clientId, sub: 'google-new-user', email: 'google@example.test', email_verified: true, iat: now, exp: now + 3600, nonce: oauth.nonce, ...payloadPatch };
  }) });
  ({ app, ctx } = build());
});
afterAll(async () => { await db?.close(); });

test('anonymous bootstrap persists signed Express cookie and stable CSRF, without SID leakage', async () => {
  const b = await boot(); expect(b.csrf).toMatch(/^[a-f0-9]{64}$/); expect(b.response.headers['x-session-id']).toBeUndefined();
  const sid = expressSid(b.response); expect(sid).toBeTruthy(); expect(JSON.stringify(b.response.body)).not.toContain(sid);
  const parent = (await db.pool.query('SELECT * FROM public.express_sessions WHERE sid_digest=$1', [digest('express', sid)])).rows[0];
  expect(parent.user_id).toBeNull(); expect(parent.session_data.csrfToken).toBe(b.csrf);
  const again = await b.agent.get('/api/auth/csrf').expect(200); expect(again.body.csrfToken).toBe(b.csrf);
  expect(responseCookies(again).sessionId).toBe(responseCookies(b.response).sessionId); expect(await applicationCount()).toBe(0);
});
test.each(['register', 'login'])('%s requires durable anonymous CSRF before writes', async endpoint => {
  const r = await request(app).post('/api/auth/' + endpoint).send({ username: 'New_User', email: 'new@example.test', password: H.PASSWORD });
  expect(r.status).toBe(403); expect(await applicationCount()).toBe(0); expect((await db.pool.query('SELECT count(*) AS n FROM public.users')).rows[0].n).toBe('3');
});
test('registration uses repository cost-12 hash and no authentication/binding', async () => {
  const b = await boot(); const r = await b.agent.post('/api/auth/register').set('x-csrf-token', b.csrf).send({ username: 'New_User', email: 'NEW@EXAMPLE.TEST', password: H.PASSWORD }).expect(201);
  noSecrets(r.body.user); expect(r.body.user).toMatchObject({ provider: 'local', role: 'user', email: 'new@example.test', balanceCents: '0', emailVerified: false });
  const saved = (await db.pool.query('SELECT * FROM public.users WHERE id=$1', [r.body.user.id])).rows[0]; expect(saved.password_hash).toMatch(/^\$2[aby]\$12\$/);
  expect(responseCookies(r).session_token).toBeUndefined(); expect(await applicationCount()).toBe(0);
  expect((await db.pool.query('SELECT user_id FROM public.express_sessions WHERE sid_digest=$1', [digest('express', expressSid(r))])).rows[0].user_id).toBeNull();
  await b.agent.get('/api/auth/check-session').expect(401);
});
test.each(['role', 'balance', 'balanceCents', 'provider', 'tokenVersion', 'userId', 'twoFASecret', 'unexpected'])('registration rejects injected %s', async field => {
  const b = await boot(); await b.agent.post('/api/auth/register').set('x-csrf-token', b.csrf).send({ username: 'New_User', email: 'new@example.test', password: H.PASSWORD, [field]: 'injected' }).expect(400);
  expect((await db.pool.query('SELECT count(*) AS n FROM public.users')).rows[0].n).toBe('3');
});
test('registration email collision is a sanitized conflict', async () => {
  const b = await boot(); const r = await b.agent.post('/api/auth/register').set('x-csrf-token', b.csrf).send({ username: 'New_User', email: 'u@example.test', password: H.PASSWORD }).expect(409);
  expect(r.body.code).toBe('USER_EMAIL_TAKEN'); expect(JSON.stringify(r.body)).not.toContain('u@example.test');
});
test.each(['Owner_U', 'owner_u', 'u@EXAMPLE.TEST'])('local login by %s authenticates exact JWT/application pair and fresh profile', async identifier => {
  const b = await boot(), oldSid = expressSid(b.response);
  const r = await b.agent.post('/api/auth/login').set('x-csrf-token', b.csrf).send({ identifier, password: H.PASSWORD }).expect(200);
  const claims = jwt.verify(r.body.token, H.JWT_SECRET); expect(claims).toMatchObject({ userId: H.OWNER, tokenVersion: '1', role: 'user', iss: 'your-app-api' });
  noSecrets(r.body.user); expect(r.body.user.lastLogin).not.toBeNull(); expect(r.body.user.rowVersion).toBe((await state()).row_version);
  expect(expressSid(r)).not.toBe(oldSid); expect(expressSid(r)).not.toBe(r.body.sessionId);
  expect(r.body.csrfToken).not.toBe(b.csrf); expect(r.headers['x-session-id']).toBeUndefined();
  expect((await db.pool.query('SELECT revoked_at,session_data FROM public.express_sessions WHERE sid_digest=$1', [digest('express', oldSid)])).rows[0]).toMatchObject({ session_data: {} });
  const parent = (await db.pool.query('SELECT * FROM public.express_sessions WHERE sid_digest=$1', [digest('express', expressSid(r))])).rows[0]; expect(parent.user_id).toBe(H.OWNER);
  const stored = (await db.pool.query('SELECT * FROM public.application_sessions')).rows[0]; expect(stored.express_session_id).toBe(parent.id); expect(stored.token_digest).toBe(createHash('sha256').update(r.body.token).digest('hex'));
  await b.agent.get('/api/auth/check-session').expect(200); const info = await b.agent.get('/api/auth/session-info').expect(200);
  expect(info.body).toEqual({ success: true, isAuthenticated: true, userId: H.OWNER, expiresAt: claims.exp * 1000 }); noSecrets(info.body); expect(info.headers['cache-control']).toBe('no-store');
});
test.each(['0', '9007199254740991'])('issued JWT preserves canonical BIGINT token version %s', async version => {
  // Registration deliberately starts at version 1. Boundary fixtures must use
  // their intended version at INSERT, never decrease an existing version or
  // alter registration policy. Reuse the real fixture hash with guards enabled.
  const user = (await db.pool.query(`INSERT INTO public.users (username,email,password_hash,provider,token_version)
    SELECT 'Version_U','version@example.test',password_hash,'local',$2::BIGINT
    FROM public.users WHERE id=$1::UUID RETURNING id,username`, [H.OWNER, version])).rows[0];
  const b = await logged(user.username); expect(jwt.verify(b.login.body.token, H.JWT_SECRET).tokenVersion).toBe(version);
  expect((await b.agent.get('/api/auth/session-info').expect(200)).body.userId).toBe(user.id);
  expect((await state(user.id)).token_version).toBe(version);
});
test('failed passwords commit attempt count; fifth suspends and issues nothing', async () => {
  const b = await boot();
  for (let n = 1; n <= 5; n++) { const r = await login(b.agent, b.csrf, 'Owner_U', 'Wrong1!pass'); expect(r.status).toBe(401); expect(responseCookies(r).session_token).toBeUndefined(); expect((await state()).login_attempts).toBe(n); }
  expect((await state()).account_status).toBe('suspended'); expect((await state()).token_version).toBe('2'); expect(await applicationCount()).toBe(0);
  await login(b.agent, b.csrf).expect(403);
});
test('successful password issuance never logs JWT, application secret or signed Express SID', async () => {
  const spies = ['log', 'warn', 'error'].map(name => jest.spyOn(console, name).mockImplementation(() => {}));
  try {
    const b = await logged(), output = spies.flatMap(spy => spy.mock.calls.flat()).map(String).join(' ');
    for (const secret of [b.login.body.token, b.login.body.sessionId, expressSid(b.login)]) expect(output).not.toContain(secret);
  } finally { spies.forEach(spy => spy.mockRestore()); }
});
test('JWT and application secrets from two live sessions cannot be mixed, even for the same owner', async () => {
  const a = await logged(), b = await logged();
  const cookies = { ...responseCookies(a.login), customSessionId: b.login.body.sessionId };
  await request(app).get('/api/auth/session-info').set('Cookie', cookieHeader(cookies)).expect(401);
  await a.agent.get('/api/auth/session-info').expect(200); await b.agent.get('/api/auth/session-info').expect(200);
});
test('tampered signed Express cookie cannot authorize a CSRF-protected logout', async () => {
  const b = await logged(), cookies = { ...responseCookies(b.login), sessionId: 's:' + 'tampered-signature-'.repeat(4) };
  await request(app).post('/api/auth/logout').set('Cookie', cookieHeader(cookies)).set('x-csrf-token', b.csrf).expect(403);
  await b.agent.get('/api/auth/session-info').expect(200);
});
test.each(['malformed', 'oversized'])('login rejects %s JSON without credentials or user writes', async kind => {
  const b = await boot(), before = await state();
  const body = kind === 'malformed' ? '{' : JSON.stringify({ username: 'Owner_U', password: 'x'.repeat(17000) });
  const r = await b.agent.post('/api/auth/login').set('x-csrf-token', b.csrf).set('Content-Type', 'application/json').send(body).expect(400);
  expect(r.body.code).toBe('INVALID_AUTH_INPUT'); expect(await state()).toEqual(before); expect(await applicationCount()).toBe(0);
});
test('positive login resets counters only during committed issuance', async () => {
  await db.pool.query('UPDATE public.users SET login_attempts=3,two_fa_attempts=2 WHERE id=$1', [H.OWNER]);
  await logged(); expect(await state()).toMatchObject({ login_attempts: 0, two_fa_attempts: 0 });
});
test.each(['role', 'tokenVersion', 'userId', 'deviceId', 'rememberDevice', 'trustedDevices'])('login rejects untrusted %s rather than a device/role bypass', async field => {
  await enable(); const b = await boot(); await b.agent.post('/api/auth/login').set('x-csrf-token', b.csrf).send({ username: 'Owner_U', password: H.PASSWORD, [field]: 'injected' }).expect(400); expect(await applicationCount()).toBe(0);
});
test('Google users cannot be suspended through local-password attempts', async () => {
  await googleOwner(); const b = await boot(); await login(b.agent, b.csrf).expect(401); expect((await state()).login_attempts).toBe(0);
});
test('logout revokes parent/child/whole-token digest, clears every cookie and cannot resurrect', async () => {
  const b = await logged(), retained = responseCookies(b.login);
  await b.agent.post('/api/auth/logout').set('x-csrf-token', b.csrf).expect(200).then(r => {
    const cleared = responseCookies(r); for (const name of ['sessionId', 'session_token', 'customSessionId', 'x-csrf-token', 'pending2faChallenge']) expect(cleared[name]).toBe('');
  });
  await b.agent.get('/api/auth/session-info').expect(401);
  await request(app).get('/api/auth/session-info').set('Cookie', cookieHeader(retained)).expect(401);
  const a = (await db.pool.query('SELECT * FROM public.application_sessions')).rows[0]; expect(a.revoked_at).not.toBeNull();
  const e = (await db.pool.query('SELECT * FROM public.express_sessions WHERE id=$1', [a.express_session_id])).rows[0]; expect(e.revoked_at).not.toBeNull(); expect(e.session_data).toEqual({});
  expect((await db.pool.query('SELECT token_digest FROM public.token_revocations')).rows[0].token_digest).toBe(createHash('sha256').update(b.login.body.token).digest('hex'));
});
test.each([undefined, 'bad', 'x'.repeat(257), 'é'.repeat(64)])('logout rejects invalid CSRF %p without revoking or clearing credentials', async candidate => {
  const b = await logged(); let r = b.agent.post('/api/auth/logout'); if (candidate !== undefined) r = r.set('x-csrf-token', candidate);
  const denied = await r.expect(403); expect(responseCookies(denied).session_token).toBeUndefined();
  await b.agent.get('/api/auth/session-info').expect(200); expect((await db.pool.query('SELECT count(*) AS n FROM public.token_revocations')).rows[0].n).toBe('0');
});
test('authenticated CSRF refresh is stable and cannot invalidate a live application session', async () => {
  const b = await logged(); for (let i = 0; i < 3; i++) { const r = await b.agent.post('/api/auth/refresh-csrf').expect(200); expect(r.body).toEqual({ success: true, csrfToken: b.csrf }); expect(r.headers['x-session-id']).toBeUndefined(); }
  await b.agent.post('/api/auth/logout').set('x-csrf-token', b.csrf).expect(200);
});
test('JWT/application credentials cannot borrow another Express parent for CSRF', async () => {
  const a = await logged(), b = await boot(); const cookies = { ...responseCookies(a.login), sessionId: responseCookies(b.response).sessionId };
  await request(app).post('/api/auth/logout').set('Cookie', cookieHeader(cookies)).set('x-csrf-token', b.csrf).expect(401);
  await request(app).post('/api/auth/refresh-csrf').set('Cookie', cookieHeader(cookies)).expect(401);
  await a.agent.get('/api/auth/session-info').expect(200);
});
test('header application secret never replaces signed Express SID, even with identical CSRF values', async () => {
  const a = await logged(), b = await boot(); const sid = expressSid(b.response), session = await H.callback(ctx.sessionStore.expressStore, 'get', sid);
  session.csrfToken = a.csrf; await H.callback(ctx.sessionStore.expressStore, 'set', sid, session);
  await b.agent.post('/api/auth/logout').set('Authorization', 'Bearer ' + a.login.body.token).set('x-session-id', a.login.body.sessionId).set('x-csrf-token', a.csrf).expect(401);
  await a.agent.get('/api/auth/session-info').expect(200);
});
test('read-only authentication supports exact header pair without trusting Express JSON identity', async () => {
  const b = await logged(); const r = await request(app).get('/api/auth/session-info').set('Authorization', 'Bearer ' + b.login.body.token).set('x-session-id', b.login.body.sessionId).expect(200); expect(r.body.userId).toBe(H.OWNER);
});
test('conflicting cookie/header credentials fail closed', async () => {
  const b = await logged(); await b.agent.get('/api/auth/session-info').set('x-session-id', 'a'.repeat(43)).expect(401);
  await b.agent.get('/api/auth/session-info').set('Authorization', 'Bearer different').expect(401);
});
test('2FA begins durably without identity/JWT/lastLogin bookkeeping exposure', async () => {
  const b = await begin2fa(); expect(b.login.body).toMatchObject({ requires2FA: true }); expect(b.login.body.userId).toBeUndefined(); expect(b.login.body.token).toBeUndefined(); expect(await applicationCount()).toBe(0); expect((await state()).last_login).toBeNull();
  const poll = await b.agent.get('/api/auth/pending-2fa').expect(200); expect(poll.body.challengeId).toBe(b.login.body.challengeId); noSecrets(poll.body);
  await b.agent.get('/api/auth/session-info').expect(401);
});
test('2FA success atomically rotates Express SID again, binds new parent and issues standard credentials', async () => {
  const b = await begin2fa(), oldSid = expressSid(b.login), oldCsrf = b.csrf;
  const r = await complete(b).expect(200); expect(expressSid(r)).not.toBe(oldSid); expect(expressSid(r)).not.toBe(r.body.sessionId); expect(r.body.csrfToken).not.toBe(oldCsrf);
  expect(responseCookies(r).pending2faChallenge).toBe(''); await b.agent.get('/api/auth/session-info').expect(200); await b.agent.post('/api/auth/logout').set('x-csrf-token', r.body.csrfToken).expect(200);
});
test('negative TOTP advances durable revision/counter and permits a subsequent positive request', async () => {
  const b = await begin2fa(); const r = await complete(b, 'not-a-totp').expect(403); expect(r.body.remainingAttempts).toBe(4); expect((await state()).two_fa_attempts).toBe(1);
  expect((await b.agent.get('/api/auth/pending-2fa').expect(200)).body.challengeId).toBe(b.login.body.challengeId);
  await complete(b).expect(200); expect((await state()).two_fa_attempts).toBe(0);
});
test('fifth TOTP failure tombstones parent and prevents any implicit resurrection', async () => {
  const b = await begin2fa(), sid = expressSid(b.login); for (let n = 0; n < 5; n++) await complete(b, 'bad').expect(n === 4 ? 429 : 403);
  expect((await state()).two_fa_attempts).toBe(5); expect(await H.callback(ctx.sessionStore.expressStore, 'get', sid)).toBeNull(); expect(await applicationCount()).toBe(0);
  await b.agent.get('/api/auth/pending-2fa').expect(401);
});
test('2FA expired challenge fails before issuing any credential', async () => {
  ({ app, ctx } = build({ challengeTtlSeconds: 1 })); const b = await begin2fa(); await db.pool.query('SELECT pg_sleep(1.1)'); await complete(b).expect(401); expect(await applicationCount()).toBe(0);
});
test('consumed challenge replay with original signed cookie is rejected', async () => {
  const b = await begin2fa(), oldCookies = responseCookies(b.login); await complete(b).expect(200);
  await request(app).post('/api/auth/verify-2fa-login').set('Cookie', cookieHeader(oldCookies)).set('x-csrf-token', b.csrf).send({ challengeId: b.login.body.challengeId, code: code() }).expect(403); expect(await applicationCount()).toBe(1);
});
test('concurrent correct 2FA HTTP requests create exactly one session', async () => {
  const b = await begin2fa(), cookies = cookieHeader(responseCookies(b.login));
  const responses = await Promise.all([1, 2].map(() => request(app).post('/api/auth/verify-2fa-login').set('Cookie', cookies).set('x-csrf-token', b.csrf).send({ challengeId: b.login.body.challengeId, code: code() })));
  expect(responses.map(r => r.status).filter(s => s === 200)).toHaveLength(1); expect(await applicationCount()).toBe(1);
});
test('pending challenge works after replacing repository/session/HTTP instances', async () => {
  const b = await begin2fa(), cookies = cookieHeader(responseCookies(b.login)); const restarted = build();
  await request(restarted.app).post('/api/auth/verify-2fa-login').set('Cookie', cookies).set('x-csrf-token', b.csrf).send({ challengeId: b.login.body.challengeId, code: code() }).expect(200);
});
test.each(['userId', 'token', 'rememberDevice', 'deviceId'])('2FA rejects obsolete/injected %s authentication fields', async field => {
  const b = await begin2fa(); await b.agent.post('/api/auth/verify-2fa-login').set('x-csrf-token', b.csrf).send({ challengeId: b.login.body.challengeId, code: code(), [field]: H.OWNER }).expect(400); expect(await applicationCount()).toBe(0);
});
test('challenge secret cannot be transferred to another anonymous Express parent', async () => {
  const a = await begin2fa(), b = await boot(); await b.agent.post('/api/auth/verify-2fa-login').set('x-csrf-token', b.csrf).send({ challengeId: a.login.body.challengeId, code: code() }).expect(401); expect(await applicationCount()).toBe(0);
});
test('Google start contains one-use state, nonce and S256 PKCE; successful callback has clean redirect', async () => {
  const b = await beginGoogle(), url = new URL(b.response.headers.location); expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(url.searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  const r = await callbackGoogle(b, {}, false).expect(302); expect(r.headers.location).toBe('/google-redirect.html'); expect(r.headers.location).not.toMatch(/token|sessionId|state|code/); expect(responseCookies(r).session_token).toBeTruthy();
  await b.agent.get('/api/auth/session-info').expect(200);
});
test.each(['wrong', '', 'a'.repeat(43)])('Google state mismatch %p never exchanges code or links users', async invalid => {
  const b = await beginGoogle(); await callbackGoogle(b, { state: invalid }).expect(401); expect(transport.exchangeAndVerify).not.toHaveBeenCalled(); expect(await applicationCount()).toBe(0);
});
test('Google state is bound to its signed Express cookie, not query/body/client SID', async () => {
  const a = await beginGoogle(), b = await beginGoogle(); await callbackGoogle(b, { state: a.state }).expect(401); expect(transport.exchangeAndVerify).not.toHaveBeenCalled();
});
test('Google state expires in PostgreSQL without contacting provider', async () => {
  ({ app, ctx } = build({ googleStateTtlSeconds: 1 })); const b = await beginGoogle(); await db.pool.query('SELECT pg_sleep(1.1)'); await callbackGoogle(b).expect(401); expect(transport.exchangeAndVerify).not.toHaveBeenCalled();
});
test('Google state replay is rejected after a successful callback', async () => {
  const b = await beginGoogle(), oldCookies = responseCookies(b.response); await callbackGoogle(b).expect(200);
  await request(app).get('/api/auth/google/callback').set('Cookie', cookieHeader(oldCookies)).query({ state: b.state, code: 'test-provider-code' }).expect(401); expect(transport.exchangeAndVerify).toHaveBeenCalledTimes(1); expect(await applicationCount()).toBe(1);
});
test('concurrent OAuth callbacks consume state once, before provider exchange', async () => {
  const b = await beginGoogle(), cookies = cookieHeader(responseCookies(b.response)); const results = await Promise.all([1, 2].map(() => request(app).get('/api/auth/google/callback').set('Cookie', cookies).set('Accept', 'application/json').query({ state: b.state, code: 'test-provider-code' })));
  expect(results.filter(r => r.status === 200)).toHaveLength(1); expect(transport.exchangeAndVerify).toHaveBeenCalledTimes(1); expect(await applicationCount()).toBe(1);
});
test('durable Google state survives an HTTP/service instance replacement', async () => {
  const b = await beginGoogle(), restarted = build(); await request(restarted.app).get('/api/auth/google/callback').set('Cookie', cookieHeader(responseCookies(b.response))).set('Accept', 'application/json').query({ state: b.state, code: 'test-provider-code' }).expect(200);
});
test('Google/local email collision rejects rather than linking or changing provider', async () => {
  payloadPatch = { email: 'u@example.test' }; const before = await state(), b = await beginGoogle(); const r = await callbackGoogle(b).expect(409); expect(r.body.code).toBe('GOOGLE_ACCOUNT_LINK_REQUIRED');
  expect(await state()).toEqual(before); expect(await applicationCount()).toBe(0);
});
test('Google subject collision with another Google email also rejects', async () => {
  await googleOwner(); payloadPatch = { sub: 'different-google', email: 'u@example.test' }; const before = await state(), b = await beginGoogle(); await callbackGoogle(b).expect(409); expect(await state()).toEqual(before);
});
test('existing Google subject whose verified email changed is not auto-linked to local email', async () => {
  await googleOwner(); payloadPatch.email = 'other@example.test'; const b = await beginGoogle(); await callbackGoogle(b).expect(409); expect((await state()).email).toBe('u@example.test'); expect(await applicationCount()).toBe(0);
});
test.each([
  ['unverified', { email_verified: false }], ['string verified', { email_verified: 'true' }], ['issuer', { iss: 'https://evil.test' }],
  ['audience', { aud: 'another-client' }], ['authorized party', { azp: 'another-client' }], ['expired', { exp: 1 }],
  ['future issued', { iat: 9999999999 }], ['nonce', { nonce: 'wrong-nonce' }], ['missing nonce', { nonce: undefined }], ['subject', { sub: '' }]
])('Google rejects invalid verified-provider payload: %s', async (_, patch) => {
  payloadPatch = patch; const b = await beginGoogle(); await callbackGoogle(b).expect(401); expect(await applicationCount()).toBe(0); expect((await db.pool.query('SELECT count(*) AS n FROM public.users')).rows[0].n).toBe('3');
});
test('provider error consumes state and exposes no raw details or credentials', async () => {
  transport.exchangeAndVerify.mockRejectedValueOnce(new Error('private Google target/access token'));
  const b = await beginGoogle(), r = await callbackGoogle(b).expect(401); expect(JSON.stringify(r.body)).not.toContain('private'); await callbackGoogle(b).expect(401); expect(transport.exchangeAndVerify).toHaveBeenCalledTimes(1);
});
test('Google 2FA uses same durable pipeline with clean redirect and authenticated pending read', async () => {
  await googleOwner(); await enable(); const b = await beginGoogle(); const r = await callbackGoogle(b, {}, false).expect(302); expect(r.headers.location).toBe('/login.html?twoFactor=required'); expect(responseCookies(r).session_token).toBeUndefined(); expect(await applicationCount()).toBe(0);
  const pending = await b.agent.get('/api/auth/pending-2fa').expect(200); const completed = await b.agent.post('/api/auth/verify-2fa-login').set('x-csrf-token', pending.body.csrfToken).send({ challengeId: pending.body.challengeId, code: code() }).expect(200); expect(completed.body.user.id).toBe(H.OWNER);
});
test.each(['password', 'google', '2fa'].flatMap(flow => ['user', 'admin'].map(role => [flow, role])))('%s issuance for %s uses current string version, role and standard cookie contract', async (flow, role) => {
  // Removing the local password during Google fixture setup advances the token
  // version. Set the matrix's starting version AFTER that guarded security change.
  if (flow === 'google') await googleOwner();
  await db.pool.query('UPDATE public.users SET role=$2,token_version=7 WHERE id=$1', [H.OWNER, role]); let r, b;
  if (flow === 'google') { b = await beginGoogle(); r = await callbackGoogle(b).expect(200); }
  else if (flow === '2fa') { b = await begin2fa(); r = await complete(b).expect(200); }
  else { b = await logged(); r = b.login; }
  expect(jwt.verify(r.body.token, H.JWT_SECRET)).toMatchObject({ userId: H.OWNER, tokenVersion: '7', role, iss: role === 'admin' ? 'admin-panel' : 'your-app-api' });
  for (const name of ['session_token', 'customSessionId', 'sessionId']) expect(r.headers['set-cookie'].find(c => c.startsWith(name + '='))).toMatch(/HttpOnly; SameSite=Lax/);
  await b.agent.get('/api/auth/session-info').expect(200);
});
test.each(['password', 'google', '2fa'])('%s issued pair is rejected after database version changes', async flow => {
  let b; if (flow === 'google') { await googleOwner(); b = await beginGoogle(); await callbackGoogle(b).expect(200); } else if (flow === '2fa') { b = await begin2fa(); await complete(b).expect(200); } else b = await logged();
  await db.pool.query('UPDATE public.users SET token_version=token_version+1 WHERE id=$1', [H.OWNER]); await b.agent.get('/api/auth/session-info').expect(401);
});
test.each(['expired', 'signature', 'missing-version', 'number-version', 'wrong-issuer', 'wrong-algorithm', 'old-mongo-id'])('invalid/expired JWT: %s', async condition => {
  const b = await logged(), claims = jwt.decode(b.login.body.token); delete claims.iss; let secret = H.JWT_SECRET, opts = { algorithm: 'HS256', issuer: 'your-app-api' };
  if (condition === 'expired') { claims.iat = Math.floor(Date.now() / 1000) - 100; claims.exp = claims.iat + 60; }
  if (condition === 'signature') secret = 'wrong-signature-secret-'.repeat(3);
  if (condition === 'missing-version') delete claims.tokenVersion;
  if (condition === 'number-version') claims.tokenVersion = 1;
  if (condition === 'wrong-issuer') opts.issuer = 'attacker';
  if (condition === 'wrong-algorithm') opts.algorithm = 'HS384';
  if (condition === 'old-mongo-id') claims.userId = 'abcdef0123456789abcdef01';
  const token = jwt.sign(claims, secret, opts), cookies = { ...responseCookies(b.login), session_token: token };
  const r = await request(app).get('/api/auth/session-info').set('Cookie', cookieHeader(cookies)).expect(401); expect(r.body.code).toBe('INVALID_AUTH_TOKEN');
});
test.each(['revoked-token', 'revoked-parent', 'revoked-child', 'inactive-account'])('HTTP rejects current pair after %s', async condition => {
  const b = await logged();
  if (condition === 'revoked-token') await db.pool.query("INSERT INTO public.token_revocations(token_digest,user_id,expires_at,reason) VALUES($1,$2,$3,'logout')", [createHash('sha256').update(b.login.body.token).digest('hex'), H.OWNER, b.login.body.expiresAt]);
  if (condition === 'revoked-parent') await H.callback(ctx.sessionStore.expressStore, 'destroy', expressSid(b.login));
  if (condition === 'revoked-child') await db.pool.query("UPDATE public.application_sessions SET revoked_at=statement_timestamp(),revocation_reason='logout'");
  if (condition === 'inactive-account') await db.pool.query("UPDATE public.users SET account_status='deactivated' WHERE id=$1", [H.OWNER]);
  await b.agent.get('/api/auth/session-info').expect(401);
});
test('UUID owner/admin middleware uses fresh database role, not JWT role or JSON DTOs', async () => {
  const b = await logged(); await b.agent.get('/probe/admin').expect(403); await b.agent.get('/probe/self/' + H.OWNER).expect(200); await b.agent.get('/probe/self/' + H.OTHER).expect(403);
  await b.agent.get('/probe/self/abcdef0123456789abcdef01').expect(400); await b.agent.get('/probe/forged').expect(401);
  await db.pool.query("UPDATE public.users SET role='admin' WHERE id=$1", [H.OWNER]); expect((await b.agent.get('/probe/admin').expect(200)).body.role).toBe('admin');
  await b.agent.get('/probe/self/' + H.OTHER).expect(403); await b.agent.get('/probe/self-or-admin/' + H.OTHER).expect(200);
});
test('profile completion is authenticated, CSRF protected and atomic self-only CAS', async () => {
  await request(app).post('/api/auth/complete-profile').send({ username: 'Changed_Name' }).expect(401);
  const b = await logged(); await b.agent.post('/api/auth/complete-profile').send({ expectedRowVersion: b.login.body.user.rowVersion, username: 'Changed_Name' }).expect(403);
  const r = await b.agent.post('/api/auth/complete-profile').set('x-csrf-token', b.csrf).send({ expectedRowVersion: b.login.body.user.rowVersion, username: 'Changed_Name', phone: '+14155552671' }).expect(200);
  expect(r.body.requiresReauthentication).toBe(true); expect(await state()).toMatchObject({ username: 'Changed_Name', phone: '+14155552671', token_version: '2' }); await b.agent.get('/api/auth/session-info').expect(401);
});
test.each(['country', 'userId', 'role', 'balance', 'fullName'])('complete profile rejects unsupported/injected %s', async field => {
  const b = await logged(); await b.agent.post('/api/auth/complete-profile').set('x-csrf-token', b.csrf).send({ expectedRowVersion: b.login.body.user.rowVersion, username: 'New_Name', [field]: 'injected' }).expect(400); expect((await state()).username).toBe('Owner_U');
});
test('admin suspension/activation is distinct and revokes only target with fresh CAS', async () => {
  const owner = await logged(), admin = await logged('Admin_A');
  await owner.agent.post('/api/auth/admin/update-status').set('x-csrf-token', owner.csrf).send({ userId: H.OTHER, newStatus: 'suspended', expectedRowVersion: '0' }).expect(403);
  const targetVersion = (await state()).row_version;
  await admin.agent.post('/api/auth/admin/update-status').set('x-csrf-token', admin.csrf).send({ userId: H.OWNER, newStatus: 'suspended', expectedRowVersion: targetVersion }).expect(200);
  expect((await state()).account_status).toBe('suspended'); await owner.agent.get('/api/auth/session-info').expect(401); await admin.agent.get('/api/auth/session-info').expect(200);
  await admin.agent.post('/api/auth/admin/update-status').set('x-csrf-token', admin.csrf).send({ userId: H.OWNER, newStatus: 'active', expectedRowVersion: (await state()).row_version }).expect(200); expect((await state()).account_status).toBe('active');
});
test('legacy/non-PG Express composition fails closed before auth writes', async () => {
  const other = express(); other.use((req, res, next) => { req.session = { csrfToken: 'fake', id: 'fake' }; req.sessionID = 'fake'; req.sessionStore = {}; next(); }); other.use('/api/auth', createAuthRouter(ctx));
  await request(other).get('/api/auth/csrf').expect(503); expect(await applicationCount()).toBe(0);
});
test('database outage is sanitized with no stale session autosave', async () => {
  const provider = faultProvider(); ({ app, ctx } = build({ poolProvider: () => provider })); const b = await logged(); fault = 'read';
  const r = await b.agent.get('/api/auth/session-info').expect(503); expect(JSON.stringify(r.body)).not.toContain('private'); fault = null;
});
test.each(['issue-unknown', 'logout-unknown', 'oauth-unknown'])('%s returns no credentials and never repeats the committed body', async mode => {
  const provider = faultProvider(); ({ app, ctx } = build({ poolProvider: () => provider })); let r;
  if (mode === 'issue-unknown') { const b = await boot(); fault = mode; r = await login(b.agent, b.csrf); expect(await applicationCount()).toBe(1); }
  if (mode === 'logout-unknown') { const b = await logged(); fault = mode; r = await b.agent.post('/api/auth/logout').set('x-csrf-token', b.csrf); expect((await db.pool.query('SELECT count(*) AS n FROM public.token_revocations')).rows[0].n).toBe('1'); }
  if (mode === 'oauth-unknown') { const b = await beginGoogle(); fault = mode; r = await callbackGoogle(b); expect(transport.exchangeAndVerify).not.toHaveBeenCalled(); expect(await applicationCount()).toBe(0); }
  expect(r.status).toBe(503); expect(r.body.code).toBe('AUTH_OUTCOME_UNKNOWN'); expect(r.body.token).toBeUndefined(); expect(responseCookies(r).session_token).toBeUndefined(); expect(JSON.stringify(r.body)).not.toContain('private');
});
