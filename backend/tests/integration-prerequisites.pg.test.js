'use strict';
const H = require('./helpers/disposablePg');
const { randomUUID } = require('node:crypto');
const bcrypt = require('../node_modules/bcryptjs');
const speakeasy = require('../node_modules/speakeasy');
const { createUserRepository } = require('../repositories/userRepository');
const { createSessionStore } = require('../services/sessionStore');
const { createPaymentSubmissionService } = require('../services/paymentSubmissionService');
const { createOrderRepository } = require('../repositories/orderRepository');
const { createFinancialCoordinator } = require('../services/financialCoordinator');
const { PENDING } = require('../services/auth/pendingState');
jest.setTimeout(30000);
let db, repo, sessions;
const SECRET = 'JBSWY3DPEHPK3PXP';
const options = () => ({ poolProvider: () => db.pool, cursorSecret: H.CURSOR_SECRET });
const sessionOptions = () => ({ poolProvider: () => db.pool, userRepository: repo, lookupSecret: H.LOOKUP_SECRET, jwtSecret: H.JWT_SECRET });
const cb = (method, ...args) => H.callback(sessions.expressStore, method, ...args);
const state = (id = H.OWNER) => repo.findAuthStateById(id);
const principal = async (id = H.OWNER) => H.principal(id, (await state(id)).tokenVersion);
const pair = x => ({ token: x.token, sessionId: x.sessionId });
const totp = () => speakeasy.totp({ secret: SECRET, encoding: 'base32' });
async function proof(id = H.OWNER, candidate = H.PASSWORD) {
  const u = await repo.findById(id), h = await repo.findForAuth(u.email); await h.verifyPassword(candidate); return h;
}
async function anonymous(data = H.sessionData()) { const sid = H.sid(); await cb('set', sid, data); return { sid, data }; }
async function login(id = H.OWNER) { const parent = await anonymous(); return { parent, ...(await sessions.issueAuthenticatedSession({ authenticationProof: await proof(id), expressSid: parent.sid })) }; }
async function enable(id = H.OWNER, attempts = 0) {
  await db.pool.query("UPDATE public.users SET two_fa_status='enabled', two_fa_secret=$2, two_fa_attempts=$3 WHERE id=$1::UUID", [id, SECRET, attempts]);
}
async function pending(extra = {}) {
  const parent = await anonymous(), handle = await proof();
  return { parent, handle, ...(await sessions.beginPendingAuthentication({ authenticationProof: handle, expressSid: parent.sid, csrfToken: parent.data.csrfToken, ...extra })) };
}
const finishInput = x => ({ expressSid: x.parent.sid, challengeId: x.challengeId, csrfToken: x.parent.data.csrfToken, code: totp() });
async function ledger() {
  return (await db.pool.query(`SELECT (SELECT count(*)::TEXT FROM public.financial_operations) AS journal,
    (SELECT count(*)::TEXT FROM public.application_sessions) AS sessions,
    (SELECT count(*)::TEXT FROM public.payments) AS payments,
    (SELECT balance_cents FROM public.users WHERE id=$1::UUID) AS balance`, [H.OWNER])).rows[0];
}
// Controlled transport injection around REAL PostgreSQL queries; no mocked DB outcomes.
function injected(hook) {
  return () => ({ query: (...a) => db.pool.query(...a), connect: async () => {
    const c = await db.pool.connect();
    return { on: (...a) => c.on(...a), removeListener: (...a) => c.removeListener(...a), release: x => c.release(x),
      query: async config => hook(config, () => c.query(config)) };
  } });
}
function uploadService(extra = {}) {
  const events = [], receipts = [];
  const parseUpload = jest.fn(async source => { events.push('parse'); return source; });
  const storeReceipt = jest.fn(async () => {
    events.push('store'); const receipt = { publicId: `private_payment_receipts/${randomUUID()}`, format: 'jpg', deliveryType: 'authenticated' };
    receipts.push(receipt); return receipt;
  });
  const cleanupReceipt = jest.fn(async () => { events.push('cleanup'); });
  const service = createPaymentSubmissionService({ ...options(), sessionStore: sessions, parseUpload, storeReceipt, cleanupReceipt, ...extra });
  return { service, events, receipts, parseUpload, storeReceipt, cleanupReceipt };
}
function submission(auth, extra = {}) {
  return { ...pair(auth), expressSid: auth.parent.sid, csrfToken: auth.csrfToken, submissionId: randomUUID(),
    uploadSource: { body: { method: 'visa', amount: '10.00', note: '  deposit  ' }, file: { buffer: Buffer.from('controlled image storage fixture') } }, ...extra };
}
beforeAll(async () => { db = await H.open(); });
beforeEach(async () => { await db.reset(); await db.seed(); repo = createUserRepository(options()); sessions = createSessionStore(sessionOptions()); });
afterEach(() => jest.restoreAllMocks());
afterAll(async () => { await db?.close(); });

// DURABLE TWO-FACTOR AUTHENTICATION

test('pending challenge stores only sealed first-factor receipt; creates no JWT session or balance effect', async () => {
  await enable(); const x = await pending(); const data = (await cb('get', x.parent.sid));
  expect(data[PENDING]).toMatchObject({ version: 1, userId: H.OWNER });
  expect(data[PENDING].seal).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(data)).not.toContain(x.challengeId); expect(JSON.stringify(data)).not.toContain(SECRET);
  expect(data).not.toHaveProperty('userId'); expect(x).not.toHaveProperty('token');
  expect(await ledger()).toEqual({ journal: '0', sessions: '0', payments: '0', balance: '10000' });
  await expect(sessions.beginPendingAuthentication({ authenticationProof: x.handle, expressSid: x.parent.sid, csrfToken: x.parent.data.csrfToken })).rejects.toMatchObject({ code: 'AUTH_PROOF_REQUIRED' });
});
test.each([{}, { userId: H.OWNER, passwordVerified: true }, Object.freeze({})])('forged first-factor object cannot create challenge: %j', async forged => {
  await enable(); const p = await anonymous();
  await expect(sessions.beginPendingAuthentication({ authenticationProof: forged, expressSid: p.sid, csrfToken: p.data.csrfToken })).rejects.toMatchObject({ code: 'AUTH_PROOF_REQUIRED' });
});
test('failed password comparison cannot create pending challenge', async () => {
  await enable(); const p = await anonymous();
  await expect(sessions.beginPendingAuthentication({ authenticationProof: await proof(H.OWNER, 'wrong'), expressSid: p.sid, csrfToken: p.data.csrfToken })).rejects.toMatchObject({ code: 'AUTH_PROOF_REQUIRED' });
});
test('factor alias cannot start durable challenge', async () => {
  await enable(); const h = await proof(), factor = await repo.findFor2FA({ authenticationContext: h }), p = await anonymous();
  await factor.verifyTotp(totp());
  await expect(sessions.beginPendingAuthentication({ authenticationProof: factor, expressSid: p.sid, csrfToken: p.data.csrfToken })).rejects.toMatchObject({ code: 'AUTH_PROOF_REQUIRED' });
});
test.each(['disabled', 'pending'])('challenge denies two-factor state %s', async status => {
  if (status === 'pending') await db.pool.query("UPDATE public.users SET two_fa_status='pending',two_fa_secret=$1 WHERE id=$2::UUID", [SECRET, H.OWNER]);
  await expect(pending()).rejects.toMatchObject({ code: 'TWO_FA_STATE_CONFLICT' });
});
test('begin requires correct CSRF and consumes proof even when rejected', async () => {
  await enable(); const p = await anonymous(), h = await proof();
  await expect(sessions.beginPendingAuthentication({ authenticationProof: h, expressSid: p.sid, csrfToken: 'wrong' })).rejects.toMatchObject({ code: 'CSRF_INVALID' });
  await expect(sessions.beginPendingAuthentication({ authenticationProof: h, expressSid: p.sid, csrfToken: p.data.csrfToken })).rejects.toMatchObject({ code: 'AUTH_PROOF_REQUIRED' });
});
test('one original proof cannot create concurrent challenges', async () => {
  await enable(); const h = await proof(), a = await anonymous(), b = await anonymous();
  const r = await Promise.allSettled([a, b].map(p => sessions.beginPendingAuthentication({ authenticationProof: h, expressSid: p.sid, csrfToken: p.data.csrfToken })));
  expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1); expect(r.find(x => x.status === 'rejected').reason.code).toBe('AUTH_PROOF_REQUIRED');
});
test('existing pending challenge cannot be overwritten by a new credential', async () => {
  await enable(); const x = await pending();
  await expect(sessions.beginPendingAuthentication({ authenticationProof: await proof(), expressSid: x.parent.sid, csrfToken: x.parent.data.csrfToken })).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_EXISTS' });
});
test('new repository/service instance completes durable challenge without original process proof', async () => {
  await enable(); const x = await pending(); repo = createUserRepository(options()); sessions = createSessionStore(sessionOptions());
  const result = await sessions.completePendingAuthentication(finishInput(x));
  expect(result.authenticated).toBe(true); expect(result.expressSid).not.toBe(x.parent.sid); expect(result.csrfToken).not.toBe(x.parent.data.csrfToken);
  expect((await sessions.authenticate(pair(result))).principal.userId).toBe(H.OWNER);
  expect(await cb('get', x.parent.sid)).toBeNull();
  expect((await cb('get', result.expressSid))[PENDING]).toBeUndefined();
  expect(await ledger()).toMatchObject({ sessions: '1', journal: '0', balance: '10000' });
  const row = (await db.pool.query('SELECT login_attempts,two_fa_attempts,last_login FROM public.users WHERE id=$1::UUID', [H.OWNER])).rows[0];
  expect(row).toMatchObject({ login_attempts: 0, two_fa_attempts: 0, last_login: expect.any(Date) });
});
test('completed challenge cannot replay or resurrect through delayed Express saves', async () => {
  await enable(); const x = await pending(), stale = await cb('get', x.parent.sid);
  await sessions.completePendingAuthentication(finishInput(x));
  await expect(sessions.completePendingAuthentication(finishInput(x))).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
  await expect(cb('set', x.parent.sid, stale)).rejects.toMatchObject({ code: 'SESSION_VERSION_CONFLICT' });
});
test('concurrent valid completions issue exactly one authenticated session', async () => {
  await enable(); const x = await pending(), before = await state();
  const r = await Promise.allSettled([sessions.completePendingAuthentication(finishInput(x)), sessions.completePendingAuthentication(finishInput(x))]);
  expect(r.filter(y => y.status === 'fulfilled')).toHaveLength(1); expect((await ledger()).sessions).toBe('1');
  expect(BigInt((await state()).rowVersion)).toBe(BigInt(before.rowVersion) + 1n);
});
test.each(['expressSid', 'challengeId', 'csrfToken'])('challenge cannot be transferred/guessed: %s', async field => {
  await enable(); const x = await pending(), y = await anonymous();
  const input = { ...finishInput(x), [field]: field === 'expressSid' ? y.sid : field === 'challengeId' ? H.sid() : 'wrong' };
  await expect(sessions.completePendingAuthentication(input)).rejects.toMatchObject({ code: field === 'csrfToken' ? 'CSRF_INVALID' : 'AUTH_CHALLENGE_INVALID' });
  expect((await ledger()).sessions).toBe('0');
});
test('negative TOTP attempt commits and challenge can continue with advanced account version', async () => {
  await enable(); const x = await pending(), input = finishInput(x);
  const failed = await sessions.completePendingAuthentication({ ...input, code: 'invalid' });
  expect(failed).toMatchObject({ authenticated: false, remainingAttempts: 4 });
  expect((await db.pool.query('SELECT two_fa_attempts FROM public.users WHERE id=$1::UUID', [H.OWNER])).rows[0].two_fa_attempts).toBe(1);
  const current = await cb('get', x.parent.sid); expect(current[PENDING].rowVersion).toBe((await state()).rowVersion);
  const result = await sessions.completePendingAuthentication(input); expect(result.authenticated).toBe(true);
  expect((await db.pool.query('SELECT two_fa_attempts FROM public.users WHERE id=$1::UUID', [H.OWNER])).rows[0].two_fa_attempts).toBe(0);
});
test('concurrent negative attempts are serialized without lost counts', async () => {
  await enable(); const x = await pending(), input = { ...finishInput(x), code: 'bad' };
  const r = await Promise.all([sessions.completePendingAuthentication(input), sessions.completePendingAuthentication(input)]);
  expect(r.map(y => y.remainingAttempts).sort()).toEqual([3, 4]);
  expect((await db.pool.query('SELECT two_fa_attempts FROM public.users WHERE id=$1::UUID', [H.OWNER])).rows[0].two_fa_attempts).toBe(2);
});
test('fifth negative attempt destroys challenge and prevents correct-code bypass', async () => {
  await enable(H.OWNER, 4); const x = await pending();
  expect(await sessions.completePendingAuthentication({ ...finishInput(x), code: 'bad' })).toEqual({ authenticated: false, remainingAttempts: 0, sessionDestroyed: true });
  await expect(sessions.completePendingAuthentication(finishInput(x))).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
  await expect(pending()).rejects.toMatchObject({ code: 'TOO_MANY_2FA_ATTEMPTS' });
});
test('challenge lifetime expires using database time and does not issue sessions', async () => {
  await enable(); sessions = createSessionStore({ ...sessionOptions(), challengeTtlSeconds: 1 }); const x = await pending();
  await db.pool.query('SELECT pg_sleep(1.1)');
  await expect(sessions.completePendingAuthentication(finishInput(x))).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
  expect((await ledger()).sessions).toBe('0');
});
test('durable challenge does not extend original first-factor proof lifetime', async () => {
  await enable(); const p = await anonymous(), now = Date.now(); const spy = jest.spyOn(Date, 'now').mockReturnValue(now - 290000);
  const h = await proof(); spy.mockRestore();
  const x = await sessions.beginPendingAuthentication({ authenticationProof: h, expressSid: p.sid, csrfToken: p.data.csrfToken });
  expect(new Date(x.expiresAt).getTime()).toBeLessThanOrEqual(now + 10000);
});
test.each(['tokenVersion', 'rowVersion', 'userId', 'expiresAt', 'challengeDigest', 'seal'])('tampered stored first-factor receipt fails closed: %s', async field => {
  await enable(); const x = await pending(), data = await cb('get', x.parent.sid);
  const changes = { tokenVersion: '9', rowVersion: '9', userId: H.OTHER, expiresAt: Date.now() + 100000, challengeDigest: 'a'.repeat(64), seal: 'a'.repeat(64) };
  data[PENDING][field] = changes[field]; delete data.__top4StoreRevision;
  // Controlled corruption in the guarded disposable DB, not bypassing app store CAS.
  await db.pool.query('UPDATE public.express_sessions SET session_data=$1::JSONB WHERE id=$2::UUID', [JSON.stringify(data), x.expressSession.__top4StoreRevision.id]);
  await expect(sessions.completePendingAuthentication(finishInput(x))).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
});
test.each(['delete', 'modify', 'csrf'])('ordinary session set cannot change protected pending state: %s', async kind => {
  await enable(); const x = await pending(), data = await cb('get', x.parent.sid);
  if (kind === 'delete') delete data[PENDING]; else if (kind === 'csrf') data.csrfToken = 'new'; else data[PENDING].userId = H.OTHER;
  await expect(cb('set', x.parent.sid, data)).rejects.toMatchObject({ code: 'SESSION_VERSION_CONFLICT' });
});
test('ordinary initial set cannot fabricate a pending receipt', async () => {
  const data = H.sessionData(); data[PENDING] = { userId: H.OWNER, verified: true };
  await expect(cb('set', H.sid(), data)).rejects.toMatchObject({ code: 'INVALID_SESSION_DATA' });
});
test('legitimate touch and unchanged set preserve durable challenge and synchronized metadata', async () => {
  await enable(); const x = await pending(), data = await cb('get', x.parent.sid); await cb('touch', x.parent.sid, data);
  data.value = 9; await cb('set', x.parent.sid, data);
  expect((await sessions.completePendingAuthentication(finishInput(x))).authenticated).toBe(true);
});
test.each(['username', 'suspend', 'destroy'])('security/parent invalidation rejects existing challenge: %s', async kind => {
  await enable(); const x = await pending();
  if (kind === 'username') await repo.updateUsername({ principal: await principal(), expectedRowVersion: (await state()).rowVersion, username: 'NewOwner' });
  if (kind === 'suspend') await repo.suspendAccount({ principal: await principal(H.ADMIN), userId: H.OWNER, expectedRowVersion: (await state()).rowVersion });
  if (kind === 'destroy') await cb('destroy', x.parent.sid);
  await expect(sessions.completePendingAuthentication(finishInput(x))).rejects.toBeDefined(); expect((await ledger()).sessions).toBe('0');
});
test('positive TOTP ordinary proof cannot bypass existing pending parent consumption', async () => {
  await enable(); const x = await pending(), h = await proof(), f = await repo.findFor2FA({ authenticationContext: h }); await f.verifyTotp(totp());
  await expect(sessions.issueAuthenticatedSession({ authenticationProof: h, expressSid: x.parent.sid })).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
});
test('lost challenge-creation COMMIT acknowledgement consumes proof and exposes no challenge secret', async () => {
  await enable(); const p = await anonymous(), h = await proof(); let commits = 0;
  const provider = injected(async (config, run) => { const r = await run(); if (config.text === 'COMMIT') { commits++; throw Error('raw secret transport'); } return r; });
  const s = createSessionStore({ ...sessionOptions(), poolProvider: provider });
  await expect(s.beginPendingAuthentication({ authenticationProof: h, expressSid: p.sid, csrfToken: p.data.csrfToken })).rejects.toMatchObject({ code: 'AUTH_OUTCOME_UNKNOWN', message: 'AUTH_OUTCOME_UNKNOWN' });
  expect(commits).toBe(1); expect((await cb('get', p.sid))[PENDING]).toBeDefined();
  await expect(pending({ authenticationProof: h })).rejects.toMatchObject({ code: 'AUTH_PROOF_REQUIRED' });
});
test('lost completion COMMIT acknowledgement never repeats issuance or returns credentials', async () => {
  await enable(); const x = await pending(); let commits = 0;
  const provider = injected(async (config, run) => { const r = await run(); if (config.text === 'COMMIT') { commits++; throw Error('lost acknowledgement'); } return r; });
  const s = createSessionStore({ ...sessionOptions(), poolProvider: provider });
  await expect(s.completePendingAuthentication(finishInput(x))).rejects.toMatchObject({ code: 'AUTH_OUTCOME_UNKNOWN' });
  expect(commits).toBe(1); expect((await ledger()).sessions).toBe('1'); expect(await cb('get', x.parent.sid)).toBeNull();
  await expect(sessions.completePendingAuthentication(finishInput(x))).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
});
test('issuance failure rolls back challenge consumption and fresh-parent creation', async () => {
  await enable(); const x = await pending();
  const provider = injected(async (config, run) => {
    if (config.text.startsWith('INSERT INTO public.application_sessions')) { const e = Error('controlled denial'); e.code = '23514'; e.severity = 'ERROR'; throw e; } return run();
  });
  await expect(createSessionStore({ ...sessionOptions(), poolProvider: provider }).completePendingAuthentication(finishInput(x))).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' });
  expect((await cb('get', x.parent.sid))[PENDING]).toBeDefined(); expect((await ledger()).sessions).toBe('0');
  expect((await sessions.completePendingAuthentication(finishInput(x))).authenticated).toBe(true);
});

test.each([null, '', 'invalid!', 'A'.repeat(129)])('malformed stored TOTP secret fails closed without consuming challenge: %s', async secret => {
  await enable(); const x = await pending();
  await db.pool.query('UPDATE public.users SET two_fa_secret=$2 WHERE id=$1::UUID', [H.OWNER, secret]);
  // Updating secret changes row_version first; even a valid sealed previous receipt is stale.
  await expect(sessions.completePendingAuthentication(finishInput(x))).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
  const p = await anonymous(), h = await proof(), current = { parent: p, ...(await sessions.beginPendingAuthentication({ authenticationProof: h, expressSid: p.sid, csrfToken: p.data.csrfToken })) };
  await expect(sessions.completePendingAuthentication(finishInput(current))).rejects.toMatchObject({ code: 'TWO_FA_STATE_INVALID', status: 503 });
  expect((await ledger()).sessions).toBe('0');
});
test('pending challenge outage remains sanitized and never falls back to process-local authentication', async () => {
  await enable(); const x = await pending();
  const s = createSessionStore({ ...sessionOptions(), poolProvider: () => ({ connect: async () => { throw Error('DATABASE_URL raw credentials'); } }) });
  await expect(s.completePendingAuthentication(finishInput(x))).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE', message: 'AUTH_UNAVAILABLE' }); expect((await ledger()).sessions).toBe('0');
});

// ATOMIC PROFILE AND ADMINISTRATIVE SUSPENSION

test('combined identity/password/profile update commits once and revokes every application session', async () => {
  const a = await login(), b = await login(), before = await state();
  const result = await repo.updateProfileAtomic({ principal: await principal(), expectedRowVersion: before.rowVersion,
    patch: { username: 'Changed_U', email: 'new@example.test', phone: '+12025550123', password: 'NewCorrect1!pass', currentPassword: H.PASSWORD, theme: 1, avatar: 'https://example.test/avatar.jpg' } });
  expect(result).toMatchObject({ requiresReauthentication: true, user: { username: 'Changed_U', email: 'new@example.test', emailVerified: false, phone: '+12025550123', theme: 1 } });
  const after = await state(); expect(BigInt(after.rowVersion)).toBe(BigInt(before.rowVersion) + 1n); expect(BigInt(after.tokenVersion)).toBe(BigInt(before.tokenVersion) + 1n);
  const auth = await repo.findForAuth('new@example.test'); expect(await auth.verifyPassword('NewCorrect1!pass')).toBe(true); expect(await auth.verifyPassword(H.PASSWORD)).toBe(false);
  const hash = (await db.pool.query('SELECT password_hash FROM public.users WHERE id=$1::UUID', [H.OWNER])).rows[0].password_hash; expect(bcrypt.getRounds(hash)).toBe(12);
  await expect(sessions.authenticate(pair(a))).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' }); await expect(sessions.authenticate(pair(b))).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' });
  expect(JSON.stringify(result)).not.toMatch(/password|hash|trusted_devices|secret/); expect(await ledger()).toMatchObject({ journal: '0', balance: '10000' });
});
test('metadata-only atomic update requires fresh authority but does not invalidate token/session', async () => {
  const x = await login(), before = await state(); const result = await repo.updateProfileAtomic({ principal: await principal(), expectedRowVersion: before.rowVersion, patch: { theme: 1, avatar: '' } });
  expect(result.requiresReauthentication).toBe(false); expect((await state()).tokenVersion).toBe(before.tokenVersion); expect((await sessions.authenticate(pair(x))).principal.userId).toBe(H.OWNER);
});
test('one concurrent profile CAS succeeds; no partial identity fields from loser', async () => {
  const p = await principal(), version = (await state()).rowVersion;
  const r = await Promise.allSettled([repo.updateProfileAtomic({ principal: p, expectedRowVersion: version, patch: { username: 'Winner_A', email: 'a1@example.test' } }),
    repo.updateProfileAtomic({ principal: p, expectedRowVersion: version, patch: { username: 'Winner_B', email: 'b1@example.test' } })]);
  expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1); const row = await repo.findById(H.OWNER);
  expect([['Winner_A', 'a1@example.test'], ['Winner_B', 'b1@example.test']]).toContainEqual([row.username, row.email]); expect((await state()).tokenVersion).toBe('2');
});
test.each(['balanceCents', 'role', 'provider', 'accountStatus', 'userId', 'tokenVersion', 'twoFAStatus', 'country'])('profile cannot mutate protected/unsupported field %s', async field => {
  await expect(repo.updateProfileAtomic({ principal: await principal(), expectedRowVersion: (await state()).rowVersion, patch: { username: 'Changed_U', [field]: 'bad' } })).rejects.toMatchObject({ code: 'INVALID_AUTH_INPUT' });
  expect((await repo.findById(H.OWNER)).username).toBe('Owner_U');
});
test.each([{}, { currentPassword: H.PASSWORD }, { theme: 'dark' }, { avatar: 'javascript:bad' }, { email: 'bad' }, { phone: 'bad' }, { password: 'weak', currentPassword: H.PASSWORD }])('invalid combined patch changes nothing: %j', async patch => {
  const before = await state(); await expect(repo.updateProfileAtomic({ principal: await principal(), expectedRowVersion: before.rowVersion, patch })).rejects.toBeDefined(); expect(await state()).toEqual(before);
});
test('wrong current password prevents every identity field from changing', async () => {
  await expect(repo.updateProfileAtomic({ principal: await principal(), expectedRowVersion: (await state()).rowVersion, patch: { username: 'Changed_U', email: 'new@example.test', password: 'NewCorrect1!pass', currentPassword: 'wrong' } })).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' });
  expect((await repo.findById(H.OWNER)).username).toBe('Owner_U');
});
test('combined update duplicate email rolls back username, token version, and sessions', async () => {
  const x = await login(), before = await state();
  await expect(repo.updateProfileAtomic({ principal: await principal(), expectedRowVersion: before.rowVersion, patch: { username: 'Changed_U', email: 'other@example.test' } })).rejects.toMatchObject({ code: 'AUTH_CONFLICT' });
  expect(await state()).toEqual(before); expect((await repo.findById(H.OWNER)).username).toBe('Owner_U'); await sessions.authenticate(pair(x));
});
test('security-graph invalidation failure rolls back the entire combined update', async () => {
  const x = await login(), before = await state();
  const provider = injected(async (config, run) => { if (config.text.startsWith('UPDATE public.application_sessions')) { const e = Error('controlled failure'); e.code = '23514'; e.severity = 'ERROR'; throw e; } return run(); });
  const r = createUserRepository({ ...options(), poolProvider: provider });
  await expect(r.updateProfileAtomic({ principal: await principal(), expectedRowVersion: before.rowVersion, patch: { username: 'Changed_U', phone: '+12025550123', theme: 1 } })).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' });
  expect(await state()).toEqual(before); expect((await repo.findById(H.OWNER)).theme).toBe(0); await sessions.authenticate(pair(x));
});
test.each(['stale', 'suspended', 'deactivated'])('profile fresh authority rejects %s principal even with latest row version', async kind => {
  const p = await principal();
  if (kind === 'stale') await repo.updateUsername({ principal: p, expectedRowVersion: (await state()).rowVersion, username: 'NewOwner' });
  else await db.pool.query('UPDATE public.users SET account_status=$2 WHERE id=$1::UUID', [H.OWNER, kind]);
  await expect(repo.updateProfileAtomic({ principal: p, expectedRowVersion: (await state()).rowVersion, patch: { theme: 1 } })).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
});
test('atomic self update cannot accept an administrative target override', async () => {
  await expect(repo.updateProfileAtomic({ principal: await principal(H.ADMIN), userId: H.OWNER, expectedRowVersion: '0', patch: { username: 'Changed_U' } })).rejects.toMatchObject({ code: 'INVALID_AUTH_INPUT' });
});
test('Google email change fails without partially updating metadata or username', async () => {
  await db.pool.query("UPDATE public.users SET provider='google',google_id='google-subject',password_hash=NULL WHERE id=$1::UUID", [H.OWNER]);
  const before = await state();
  await expect(repo.updateProfileAtomic({ principal: await principal(), expectedRowVersion: before.rowVersion, patch: { username: 'Changed_U', email: 'new@example.test', theme: 1 } })).rejects.toMatchObject({ code: 'GOOGLE_ACCOUNT_LINK_REQUIRED' });
  expect(await state()).toEqual(before); expect((await repo.findById(H.OWNER)).username).toBe('Owner_U');
});
test('lost profile COMMIT acknowledgement returns unknown, changes once, and revokes sessions', async () => {
  const x = await login(); let commits = 0;
  const provider = injected(async (config, run) => { const r = await run(); if (config.text === 'COMMIT') { commits++; throw Error('lost'); } return r; });
  await expect(createUserRepository({ ...options(), poolProvider: provider }).updateProfileAtomic({ principal: await principal(), expectedRowVersion: (await state()).rowVersion, patch: { username: 'Changed_U', email: 'new@example.test' } })).rejects.toMatchObject({ code: 'AUTH_OUTCOME_UNKNOWN' });
  expect(commits).toBe(1); expect((await state()).tokenVersion).toBe('2'); expect((await repo.findById(H.OWNER)).username).toBe('Changed_U'); await expect(sessions.authenticate(pair(x))).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' });
});
test('suspendAccount is distinct from deactivation and atomically revokes sessions without financial effects', async () => {
  const x = await login(), before = await state();
  const result = await repo.suspendAccount({ principal: await principal(H.ADMIN), userId: H.OWNER, expectedRowVersion: before.rowVersion });
  expect(result).toMatchObject({ requiresReauthentication: true, user: { accountStatus: 'suspended' } });
  expect(BigInt((await state()).tokenVersion)).toBe(BigInt(before.tokenVersion) + 1n); await expect(sessions.authenticate(pair(x))).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' });
  expect((await db.pool.query('SELECT revocation_reason FROM public.application_sessions')).rows[0].revocation_reason).toBe('account_status_change'); expect(await ledger()).toMatchObject({ journal: '0', balance: '10000' });
});
test.each(['user', 'moderator', 'inactive', 'stale'])('suspension requires current active admin, not %s', async kind => {
  let p = await principal(H.ADMIN);
  if (kind === 'user' || kind === 'moderator') await db.pool.query('UPDATE public.users SET role=$2 WHERE id=$1::UUID', [H.ADMIN, kind]);
  if (kind === 'inactive') await db.pool.query("UPDATE public.users SET account_status='suspended' WHERE id=$1::UUID", [H.ADMIN]);
  if (kind === 'stale') { await repo.updateUsername({ principal: p, expectedRowVersion: (await state(H.ADMIN)).rowVersion, username: 'ChangedAdmin' }); }
  await expect(repo.suspendAccount({ principal: p, userId: H.OWNER, expectedRowVersion: (await state()).rowVersion })).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' }); expect((await state()).accountStatus).toBe('active');
});
test('suspension obeys target CAS and existing deactivate method remains distinct', async () => {
  await expect(repo.suspendAccount({ principal: await principal(H.ADMIN), userId: H.OWNER, expectedRowVersion: '9' })).rejects.toMatchObject({ code: 'USER_VERSION_CONFLICT' });
  const result = await repo.deactivateAccount({ principal: await principal(H.ADMIN), userId: H.OWNER, expectedRowVersion: (await state()).rowVersion }); expect(result.user.accountStatus).toBe('deactivated');
});
test('suspension graph failure rolls back status and token changes', async () => {
  const x = await login(), before = await state();
  const provider = injected(async (config, run) => { if (config.text.startsWith('UPDATE public.application_sessions')) { const e = Error('denied'); e.code = '23514'; e.severity = 'ERROR'; throw e; } return run(); });
  await expect(createUserRepository({ ...options(), poolProvider: provider }).suspendAccount({ principal: await principal(H.ADMIN), userId: H.OWNER, expectedRowVersion: before.rowVersion })).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' });
  expect(await state()).toEqual(before); await sessions.authenticate(pair(x));
});

// PENDING PAYMENT SUBMISSIONS

test('submission authenticates, parses, validates, stores receipt, and inserts pending with no credit', async () => {
  const x = await login(), u = uploadService(), input = submission(x), before = await ledger();
  const result = await u.service.submit(input); expect(result).toEqual({ paymentId: `pay-${input.submissionId}`, status: 'pending' });
  expect(u.events).toEqual(['parse', 'store']); const row = (await db.pool.query('SELECT * FROM public.payments')).rows[0];
  expect(row).toMatchObject({ user_id: H.OWNER, submission_version: 1, claimed_amount_minor: '1000', currency: 'USD', amount_cents: null, amount_in_usd: '0.00', note: 'deposit', receipt_public_id: u.receipts[0].publicId, status: 'pending', decision_operation_id: null });
  expect(await ledger()).toEqual({ ...before, payments: '1' }); expect(JSON.stringify(result)).not.toMatch(/receipt|private|balance/);
});
test.each(['token', 'sessionId', 'expressSid', 'csrfToken'])('bad %s rejected before parsing/storage', async field => {
  const x = await login(), u = uploadService(); await expect(u.service.submit(submission(x, { [field]: field === 'csrfToken' ? 'wrong' : H.sid() }))).rejects.toBeDefined();
  expect(u.parseUpload).not.toHaveBeenCalled(); expect(u.storeReceipt).not.toHaveBeenCalled(); expect((await ledger()).payments).toBe('0');
});
test('valid but unrelated Express parent and CSRF cannot authorize payment for another session', async () => {
  const a = await login(), b = await login(H.OTHER), u = uploadService();
  await expect(u.service.submit(submission(a, { expressSid: b.parent.sid, csrfToken: b.csrfToken }))).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' }); expect(u.parseUpload).not.toHaveBeenCalled();
});
test.each(['userId', 'currency', 'amountCents', 'amountInUSD', 'status', 'receipt', 'submissionVersion', 'idempotencyKey'])('submission refuses body authority field %s', async field => {
  const x = await login(), u = uploadService(), input = submission(x); input.uploadSource.body[field] = 'bad';
  await expect(u.service.submit(input)).rejects.toMatchObject({ code: 'INVALID_AUTH_INPUT' }); expect(u.storeReceipt).not.toHaveBeenCalled();
});
test.each(['01', '1e2', '10.001', ' 10', '10\n', '-10', '9.99', '100.01', Number.NaN, null])('invalid claimed amount fails before storage: %s', async amount => {
  const x = await login(), u = uploadService(), input = submission(x); input.uploadSource.body.amount = amount;
  await expect(u.service.submit(input)).rejects.toMatchObject({ code: 'INVALID_PAYMENT_AMOUNT' }); expect(u.storeReceipt).not.toHaveBeenCalled();
});
test.each([['visa', '100.00', 'USD', '10000'], ['shamcashdol', '200000', 'USD', '20000000'], ['shamcash', '10000', 'SYP', '1000000'], ['syriatel', '5000', 'SYP', '500000'], ['mtn', '550000', 'SYP', '55000000'], ['bank', '50', 'USD', '5000'], ['webmoney', '20', 'USD', '2000'], ['usdt', '200000000', 'USDT', '20000000000']])('method %s uses authoritative claimed currency and exact minor units', async (method, amount, currency, minor) => {
  const x = await login(), u = uploadService(), input = submission(x); input.uploadSource.body = { method, amount };
  await u.service.submit(input); const row = (await db.pool.query('SELECT currency,claimed_amount_minor,amount_cents FROM public.payments')).rows[0];
  expect(row).toEqual({ currency, claimed_amount_minor: minor, amount_cents: null }); expect((await ledger()).journal).toBe('0');
});
test.each(['unknown', '__proto__', 'constructor'])('unsupported payment method %s fails closed', async method => {
  const x = await login(), u = uploadService(), input = submission(x); input.uploadSource.body.method = method;
  await expect(u.service.submit(input)).rejects.toMatchObject({ code: 'INVALID_PAYMENT_METHOD' }); expect(u.storeReceipt).not.toHaveBeenCalled();
});
test.each(['<script>', 'x'.repeat(501), {}])('invalid note fails before receipt storage: %s', async note => {
  const x = await login(), u = uploadService(), input = submission(x); input.uploadSource.body.note = note;
  await expect(u.service.submit(input)).rejects.toMatchObject({ code: 'INVALID_PAYMENT_NOTE' }); expect(u.storeReceipt).not.toHaveBeenCalled();
});
test('upload parser error is sanitized and no external storage occurs', async () => {
  const x = await login(), u = uploadService({ parseUpload: async () => { const e = Error('raw upload secret'); e.code = 'LIMIT_FILE_SIZE'; throw e; } });
  await expect(u.service.submit(submission(x))).rejects.toMatchObject({ code: 'INVALID_PAYMENT_UPLOAD', status: 413, message: 'INVALID_PAYMENT_UPLOAD' }); expect(u.storeReceipt).not.toHaveBeenCalled();
});
test('external storage error is sanitized with no transaction or payment', async () => {
  const x = await login(), u = uploadService({ storeReceipt: async () => { throw Error('cloudinary credential SQL'); } });
  await expect(u.service.submit(submission(x))).rejects.toMatchObject({ code: 'RECEIPT_STORAGE_UNAVAILABLE', message: 'RECEIPT_STORAGE_UNAVAILABLE' }); expect((await ledger()).payments).toBe('0');
});
test.each(['suspend', 'identity', 'logout', 'parentDestroy'])('authentication changed during storage rolls back and cleans owned receipt: %s', async kind => {
  const x = await login(), receipt = { publicId: `private_payment_receipts/${randomUUID()}`, format: 'jpg', deliveryType: 'authenticated' };
  const u = uploadService({ storeReceipt: async () => {
    if (kind === 'suspend') await repo.suspendAccount({ principal: await principal(H.ADMIN), userId: H.OWNER, expectedRowVersion: (await state()).rowVersion });
    if (kind === 'identity') await repo.updateUsername({ principal: await principal(), expectedRowVersion: (await state()).rowVersion, username: 'Changed_U' });
    if (kind === 'logout') await sessions.revokeAuthenticatedSession(pair(x));
    if (kind === 'parentDestroy') await cb('destroy', x.parent.sid);
    return receipt;
  } });
  await expect(u.service.submit(submission(x))).rejects.toBeDefined(); expect(u.cleanupReceipt).toHaveBeenCalledWith(receipt); expect((await ledger()).payments).toBe('0'); expect((await ledger()).journal).toBe('0');
});
test('token expiry during external storage is checked inside insert and cleans rolled-back receipt', async () => {
  const data = H.sessionData(); data.cookie.expires = new Date(Date.now() + 3000).toISOString();
  const parent = await anonymous(data), x = { parent, ...(await sessions.issueAuthenticatedSession({ authenticationProof: await proof(), expressSid: parent.sid })) };
  const u = uploadService({ storeReceipt: async () => {
    await db.pool.query('SELECT pg_sleep(3.1)');
    return { publicId: `private_payment_receipts/${randomUUID()}`, format: 'jpg', deliveryType: 'authenticated' };
  } });
  await expect(u.service.submit(submission(x))).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' }); expect(u.cleanupReceipt).toHaveBeenCalled(); expect((await ledger()).payments).toBe('0');
});
test('same submission ID cannot create two pending payments concurrently; loser cleans only its own receipt', async () => {
  const x = await login(), u = uploadService(), input = submission(x);
  const r = await Promise.allSettled([u.service.submit(input), u.service.submit(input)]);
  expect(r.filter(y => y.status === 'fulfilled')).toHaveLength(1); expect(r.find(y => y.status === 'rejected').reason.code).toBe('PAYMENT_SUBMISSION_EXISTS');
  expect((await ledger()).payments).toBe('1'); const used = (await db.pool.query('SELECT receipt_public_id FROM public.payments')).rows[0].receipt_public_id;
  for (const [receipt] of u.cleanupReceipt.mock.calls) expect(receipt.publicId).not.toBe(used);
});
test('known submission cannot be replayed with changed payload and avoids upload work', async () => {
  const x = await login(), u = uploadService(), input = submission(x); await u.service.submit(input); input.uploadSource.body.amount = '20';
  await expect(u.service.submit(input)).rejects.toMatchObject({ code: 'PAYMENT_SUBMISSION_EXISTS' }); expect(u.storeReceipt).toHaveBeenCalledTimes(1);
});
test('submission resolution is owner scoped and missing evidence never authorizes another insert', async () => {
  const x = await login(), y = await login(H.OTHER), u = uploadService(), input = submission(x); await u.service.submit(input);
  expect((await u.service.resolveSubmission({ ...pair(x), submissionId: input.submissionId })).outcome).toBe('committed');
  const missing = await u.service.resolveSubmission({ ...pair(y), submissionId: input.submissionId }); expect(missing).toEqual({ outcome: 'unresolved', paymentId: `pay-${input.submissionId}`, retrySubmission: false });
  expect(JSON.stringify(await u.service.resolveSubmission({ ...pair(x), submissionId: input.submissionId }))).not.toMatch(/private_payment_receipts|receipt|balance/);
});
test('cross-owner submission ID conflict cannot overwrite first receipt or reveal its owner', async () => {
  const x = await login(), y = await login(H.OTHER), u = uploadService(), input = submission(x); await u.service.submit(input);
  await expect(u.service.submit(submission(y, { submissionId: input.submissionId }))).rejects.toMatchObject({ code: 'PAYMENT_SUBMISSION_EXISTS', message: 'PAYMENT_SUBMISSION_EXISTS' });
  expect((await ledger()).payments).toBe('1'); expect(u.cleanupReceipt).toHaveBeenCalledTimes(1);
});
test('lost submission COMMIT acknowledgement retains receipt and resolves real committed payment', async () => {
  const x = await login(); let commits = 0;
  const provider = injected(async (config, run) => { const r = await run(); if (config.text === 'COMMIT') { commits++; throw Error('lost SQL credential'); } return r; });
  const u = uploadService({ poolProvider: provider }), input = submission(x);
  await expect(u.service.submit(input)).rejects.toMatchObject({ code: 'PAYMENT_SUBMISSION_OUTCOME_UNKNOWN', paymentId: `pay-${input.submissionId}`, retrySubmission: false });
  expect(commits).toBe(1); expect(u.cleanupReceipt).not.toHaveBeenCalled(); expect((await ledger()).payments).toBe('1');
  expect((await u.service.resolveSubmission({ ...pair(x), submissionId: input.submissionId })).outcome).toBe('committed');
});
test('unknown COMMIT with no evidence retains receipt and explicitly stays unresolved', async () => {
  const x = await login(); let inserts = 0;
  // Real rollback, but hide its acknowledgement from the caller; no mocked rows.
  const localProvider = () => ({ query: (...a) => db.pool.query(...a), connect: async () => {
    const c = await db.pool.connect();
    return { on: (...a) => c.on(...a), removeListener: (...a) => c.removeListener(...a), release: x => c.release(x),
      query: async config => { if (config.text === 'COMMIT') { await c.query('ROLLBACK'); throw Error('unknown acknowledgement'); } if (config.text.startsWith('INSERT INTO public.payments')) inserts++; return c.query(config); } };
  } });
  const u = uploadService({ poolProvider: localProvider }), input = submission(x);
  await expect(u.service.submit(input)).rejects.toMatchObject({ code: 'PAYMENT_SUBMISSION_OUTCOME_UNKNOWN' }); expect(inserts).toBe(1); expect(u.cleanupReceipt).not.toHaveBeenCalled();
  expect((await u.service.resolveSubmission({ ...pair(x), submissionId: input.submissionId })).outcome).toBe('unresolved');
});
test('known insert failure and positive rollback permit cleanup; failed cleanup cannot erase error', async () => {
  const x = await login();
  const provider = injected(async (config, run) => { if (config.text.startsWith('INSERT INTO public.payments')) { const e = Error('raw statement'); e.code = '23514'; e.severity = 'ERROR'; throw e; } return run(); });
  const u = uploadService({ poolProvider: provider, cleanupReceipt: async () => { throw Error('cleanup failed'); } });
  await expect(u.service.submit(submission(x))).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' }); expect((await ledger()).payments).toBe('0');
});
test('failed rollback never authorizes receipt cleanup', async () => {
  const x = await login();
  const provider = injected(async (config, run) => { if (config.text.startsWith('INSERT INTO public.payments') || config.text === 'ROLLBACK') { const e = Error('denied'); e.code = '23514'; e.severity = 'ERROR'; throw e; } return run(); });
  const u = uploadService({ poolProvider: provider }); await expect(u.service.submit(submission(x))).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' }); expect(u.cleanupReceipt).not.toHaveBeenCalled();
});
test('confirmed-rollback retry inserts once and does not delete successful receipt', async () => {
  const x = await login(); let inserts = 0;
  const provider = injected(async (config, run) => { if (config.text.startsWith('INSERT INTO public.payments') && ++inserts === 1) { const e = Error('controlled serialization'); e.code = '40001'; e.severity = 'ERROR'; throw e; } return run(); });
  const u = uploadService({ poolProvider: provider }); await u.service.submit(submission(x)); expect(inserts).toBe(2); expect(u.cleanupReceipt).not.toHaveBeenCalled(); expect((await ledger()).payments).toBe('1');
});

test('whole-JWT revocation during storage is enforced by insert authority', async () => {
  const x = await login(), u = uploadService({ storeReceipt: async () => {
    await db.pool.query("INSERT INTO public.token_revocations(token_digest,user_id,expires_at,reason) SELECT token_digest,user_id,expires_at,'logout' FROM public.application_sessions WHERE user_id=$1::UUID", [H.OWNER]);
    return { publicId: `private_payment_receipts/${randomUUID()}`, format: 'jpg', deliveryType: 'authenticated' };
  } });
  await expect(u.service.submit(submission(x))).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' }); expect(u.cleanupReceipt).toHaveBeenCalled(); expect((await ledger()).payments).toBe('0');
});
test('real image normalization and private upload helper are used with only Cloudinary transport controlled', async () => {
  const { Writable } = require('node:stream'), sharp = require('../node_modules/sharp');
  const cloudinary = require('../config/cloudinary'), upload = require('../middlewares/paymentUpload');
  let sent;
  jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((options, callback) => {
    const chunks = []; return new Writable({ write(chunk, _, next) { chunks.push(chunk); next(); }, final(next) {
      sent = Buffer.concat(chunks); callback(null, { public_id: options.public_id, format: 'jpg', type: 'authenticated', resource_type: 'image' }); next();
    } });
  });
  const image = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#abcdef' } }).png().toBuffer();
  const x = await login(), u = uploadService({ storeReceipt: upload.storeReceipt }), input = submission(x); input.uploadSource.file = { buffer: image, mimetype: 'image/png' };
  await u.service.submit(input); expect((await sharp(sent).metadata()).format).toBe('jpeg');
  expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(expect.objectContaining({ overwrite: false, type: 'authenticated' }), expect.any(Function));
  expect((await ledger()).payments).toBe('1'); expect((await ledger()).journal).toBe('0');
});
test('real image helper rejects forged image content with no Cloudinary call or payment', async () => {
  const cloudinary = require('../config/cloudinary'), upload = require('../middlewares/paymentUpload');
  const spy = jest.spyOn(cloudinary.uploader, 'upload_stream'); const x = await login(), u = uploadService({ storeReceipt: upload.storeReceipt });
  await expect(u.service.submit(submission(x))).rejects.toMatchObject({ code: 'RECEIPT_STORAGE_UNAVAILABLE' }); expect(spy).not.toHaveBeenCalled(); expect((await ledger()).payments).toBe('0');
});
test.each(['format', 'deliveryType', 'publicId'])('invalid storage metadata never becomes a payment: %s', async field => {
  const x = await login(), receipt = { publicId: `private_payment_receipts/${randomUUID()}`, format: 'jpg', deliveryType: 'authenticated', [field]: 'bad' }, u = uploadService({ storeReceipt: async () => receipt });
  await expect(u.service.submit(submission(x))).rejects.toMatchObject({ code: 'INVALID_RECEIPT_STORAGE' });
  if (field === 'publicId') expect(u.cleanupReceipt).not.toHaveBeenCalled(); else expect(u.cleanupReceipt).toHaveBeenCalledWith(receipt);
});
test('plain claimed principal cannot forge private insertion authorization receipt', () => {
  expect(() => require('../services/auth/authenticatedRequests').insertionGuard({ principal: H.principal(), role: 'admin' })).toThrow('AUTH_SESSION_INVALID');
});
test('service configuration fails before database connection when required capabilities are missing', () => {
  expect(() => createPaymentSubmissionService()).toThrow('PAYMENT_SERVICE_CONFIG_INVALID');
  expect(() => createPaymentSubmissionService({ ...options(), sessionStore: sessions })).toThrow('PAYMENT_SERVICE_CONFIG_INVALID');
  expect(() => createSessionStore({ ...sessionOptions(), challengeTtlSeconds: 301 })).toThrow('INVALID_CHALLENGE_EXPIRY');
});
test('payment pool outage fails before parser/storage without fallback', async () => {
  const x = await login(), u = uploadService({ poolProvider: () => ({ query: async () => { throw Error('DATABASE_URL raw'); } }) });
  await expect(u.service.submit(submission(x))).rejects.toMatchObject({ code: 'PAYMENT_SUBMISSION_UNAVAILABLE', message: 'PAYMENT_SUBMISSION_UNAVAILABLE' }); expect(u.parseUpload).not.toHaveBeenCalled();
});
test('suspension unknown COMMIT changes exactly once with no acknowledgement-based replay', async () => {
  const x = await login(); let commits = 0;
  const provider = injected(async (config, run) => { const r = await run(); if (config.text === 'COMMIT') { commits++; throw Error('lost'); } return r; });
  await expect(createUserRepository({ ...options(), poolProvider: provider }).suspendAccount({ principal: await principal(H.ADMIN), userId: H.OWNER, expectedRowVersion: (await state()).rowVersion })).rejects.toMatchObject({ code: 'AUTH_OUTCOME_UNKNOWN' });
  expect(commits).toBe(1); expect((await state()).accountStatus).toBe('suspended'); expect((await state()).tokenVersion).toBe('2'); await expect(sessions.authenticate(pair(x))).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' });
});
test('admin self-suspension revokes its own authenticated sessions', async () => {
  const x = await login(H.ADMIN); await repo.suspendAccount({ principal: await principal(H.ADMIN), userId: H.ADMIN, expectedRowVersion: (await state(H.ADMIN)).rowVersion });
  await expect(sessions.authenticate(pair(x))).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' });
});
test('combined update rejects stale CAS even with fresh token version', async () => {
  await repo.updateProfileAtomic({ principal: await principal(), expectedRowVersion: '0', patch: { theme: 1 } });
  await expect(repo.updateProfileAtomic({ principal: await principal(), expectedRowVersion: '0', patch: { username: 'Changed_U' } })).rejects.toMatchObject({ code: 'USER_VERSION_CONFLICT' });
});
test('empty phone and unchanged security value still use atomic invalidation rules', async () => {
  const before = await state(); await repo.updateProfileAtomic({ principal: await principal(), expectedRowVersion: before.rowVersion, patch: { phone: null, username: 'Owner_U' } });
  expect((await state()).tokenVersion).toBe('2'); expect((await repo.findById(H.OWNER)).phone).toBeNull();
});
test('verified Google first-factor challenge is durable without email linking or local password', async () => {
  const handle = Object.freeze({}), identity = Object.freeze({ googleId: 'verified-google-subject', email: 'u@example.test', emailVerified: true });
  await db.pool.query("UPDATE public.users SET provider='google',google_id=$2,password_hash=NULL,two_fa_status='enabled',two_fa_secret=$3 WHERE id=$1::UUID", [H.OWNER, identity.googleId, SECRET]);
  repo = createUserRepository({ ...options(), googleIdentityAuthority: Object.freeze({ resolve: x => x === handle ? identity : null }) }); sessions = createSessionStore(sessionOptions());
  const first = await repo.findForGoogleAuth({ verifiedIdentity: handle }), p = await anonymous();
  const x = { parent: p, ...(await sessions.beginPendingAuthentication({ authenticationProof: first, expressSid: p.sid, csrfToken: p.data.csrfToken })) };
  repo = createUserRepository(options()); sessions = createSessionStore(sessionOptions());
  expect((await sessions.completePendingAuthentication(finishInput(x))).authenticated).toBe(true);
});

// OWNER-SCOPED PRIVATE FULFILLMENT READ
const catalog = { ensureLoaded: async () => {}, resolvePurchase: () => ({ chargeCents: 1000, quantity: 100, snapshot: { category: 'apps', productId: 1, productName: 'Disposable service', sourceFile: 'apps.json', catalogRevision: 'a'.repeat(64), pricingVersion: 1, mode: 'proportional', priceCents: 1000, baseQuantity: 100, minQuantity: 1, maxQuantity: 1000000, minChargeCents: 50, maxChargeCents: 100000, requiresFulfillmentTarget: true, fulfillmentSchema: 'accountId', fulfillmentValidationVersion: 1, fulfillmentNetwork: null } }) };
async function purchase(owner = H.OWNER) { return createFinancialCoordinator({ poolProvider: () => db.pool, catalogService: catalog }).purchaseOrder({ principal: await principal(owner), category: 'apps', productId: 1, quantity: 100, fulfillmentTarget: { accountId: 'private_owner_target' }, idempotencyKey: randomUUID() }); }
test('owner fulfillment method returns immutable private snapshot, not public history', async () => {
  const order = await purchase(), reads = createOrderRepository(options());
  const result = await reads.findFulfillmentForOwner({ principal: await principal(), orderId: order.orderId });
  expect(result).toEqual({ orderId: order.orderId, userId: H.OWNER, fulfillmentSnapshot: { schema: 'accountId', validationVersion: 1, network: null, target: { accountId: 'private_owner_target' } } });
  expect(Object.isFrozen(result.fulfillmentSnapshot.target)).toBe(true); expect(JSON.stringify(await reads.listForOwner({ principal: await principal() }))).not.toContain('private_owner_target');
});
test('owner private method cannot read another owner even for administrator', async () => {
  const order = await purchase(), reads = createOrderRepository(options());
  expect(await reads.findFulfillmentForOwner({ principal: await principal(H.OTHER), orderId: order.orderId })).toBeNull();
  expect(await reads.findFulfillmentForOwner({ principal: await principal(H.ADMIN), orderId: order.orderId })).toBeNull();
  expect((await reads.findFulfillmentForAdmin({ principal: await principal(H.ADMIN), orderId: order.orderId })).userId).toBe(H.OWNER);
});
test.each(['userId', 'target', 'fulfillmentSnapshot'])('owner private read rejects scope override %s', async field => {
  const order = await purchase(); await expect(createOrderRepository(options()).findFulfillmentForOwner({ principal: await principal(), orderId: order.orderId, [field]: H.OTHER })).rejects.toMatchObject({ code: 'INVALID_AUTH_INPUT' });
});
test('private fulfillment read rejects stale token and inactive owner', async () => {
  const order = await purchase(), p = await principal(), reads = createOrderRepository(options());
  await repo.updateUsername({ principal: p, expectedRowVersion: (await state()).rowVersion, username: 'Changed_U' });
  await expect(reads.findFulfillmentForOwner({ principal: p, orderId: order.orderId })).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
  const current = await principal(); await repo.suspendAccount({ principal: await principal(H.ADMIN), userId: H.OWNER, expectedRowVersion: (await state()).rowVersion });
  await expect(reads.findFulfillmentForOwner({ principal: current, orderId: order.orderId })).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
});
test('private fulfillment transport errors never echo target or raw SQL', async () => {
  const reads = createOrderRepository({ ...options(), poolProvider: () => ({ query: async () => { throw Error('private_owner_target SELECT secret'); } }) });
  await expect(reads.findFulfillmentForOwner({ principal: H.principal(), orderId: 'ord-safe' })).rejects.toMatchObject({ code: 'RESOURCE_READ_UNAVAILABLE', message: 'RESOURCE_READ_UNAVAILABLE' });
});
