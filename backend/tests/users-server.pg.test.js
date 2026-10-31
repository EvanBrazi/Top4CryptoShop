'use strict';
// Real server entry, HTTP, reviewed sessions, repositories and verified-TLS PG18.
// Only Cloudinary's EXTERNAL transport is controlled; actual Multer runs.
jest.mock('../config/cloudinary', () => ({ config: jest.fn(), uploader: { upload_stream: jest.fn(), destroy: jest.fn() } }));
const request = require('supertest');
const { Writable } = require('node:stream');
const { Pool } = require('../node_modules/pg');
const bcrypt = require('../node_modules/bcryptjs');
const { connectionOptions } = require('../db/connection');
const { createApplication } = require('../server');
const cloud = require('../config/cloudinary');
const H = require('./helpers/disposablePg');
const SECRET = 'users-http-parent-signing-secret-'.repeat(2);
const MISSING = '00000000-0000-4000-8000-000000000099';
let db, runtime, app, providerStep, providerFailure, resultPatch, fault, uploadId;
function options(poolProvider = () => db.pool) {
  return { poolProvider, staticFiles: false, authOptions: { lookupSecret: H.LOOKUP_SECRET, jwtSecret: H.JWT_SECRET,
    sessionSecret: SECRET, cursorSecret: H.CURSOR_SECRET, secureCookies: false,
    googleConfig: { clientId: 'users-test.apps.googleusercontent.com', clientSecret: 'test-google-secret', callbackUrl: 'http://localhost/api/auth/google/callback' } } };
}
async function logged(username = 'Owner_U') {
  const agent = request.agent(app), bootstrap = await agent.get('/api/auth/csrf').expect(200);
  const r = await agent.post('/api/auth/login').set('x-csrf-token', bootstrap.body.csrfToken).send({ username, password: H.PASSWORD }).expect(200);
  return { agent, csrf: r.body.csrfToken, login: r, version: r.body.user.rowVersion };
}
const readUser = async (id = H.OWNER) => (await db.pool.query('SELECT * FROM public.users WHERE id=$1', [id])).rows[0];
const version = async (id = H.OWNER) => (await readUser(id)).row_version;
function write(b, method = 'put', suffix = '', body = {}, id = H.OWNER) {
  return b.agent[method]('/api/users/' + id + suffix).set('x-csrf-token', b.csrf).send({ expectedRowVersion: b.version, ...body });
}
function avatar(b, rowVersion = b.version, id = H.OWNER) {
  let r = b.agent.post('/api/users/' + id + '/avatar').set('x-csrf-token', b.csrf);
  if (rowVersion !== undefined) r = r.set('x-row-version', rowVersion);
  return r.attach('avatar', Buffer.from('bounded-image-provider-fixture'), { filename: 'avatar.png', contentType: 'image/png' });
}
function safe(value) {
  for (const key of ['_id', 'tokenVersion', 'password', 'password_hash', 'twoFASecret', 'two_fa_secret', 'trustedDevices', 'resetPasswordToken', '__top4StoreRevision']) expect(value).not.toHaveProperty(key);
}
async function noFinancialChanges() {
  expect((await db.pool.query('SELECT count(*) AS n FROM public.financial_operations')).rows[0].n).toBe('0');
  expect((await db.pool.query('SELECT count(*) AS n FROM public.orders')).rows[0].n).toBe('0');
  expect((await db.pool.query('SELECT count(*) AS n FROM public.payments')).rows[0].n).toBe('0');
  expect((await db.pool.query('SELECT balance_cents FROM public.users ORDER BY id')).rows.map(r => r.balance_cents)).toEqual(['10000', '10000', '10000']);
}
// Faults wrap real drivers. Never return fabricated database rows.
function faultProvider() {
  return { query: (...args) => { if (fault === 'read') throw new Error('private target/password'); return db.pool.query(...args); },
    async connect() {
      const c = await db.pool.connect(); let matched = false;
      return { connection: c.connection, on: (...a) => c.on(...a), removeListener: (...a) => c.removeListener(...a), release: broken => c.release(broken),
        async query(input) {
          const sql = typeof input === 'string' ? input : input.text;
          if (fault === 'avatar-unknown' && sql.includes('UPDATE public.users SET') && /\bavatar\s*=/.test(sql)) matched = true;
          const result = await c.query(input);
          if (matched && sql === 'COMMIT') { fault = null; throw new Error('private lost COMMIT acknowledgement'); }
          return result;
        } };
    } };
}
beforeAll(async () => { db = await H.open(); });
beforeEach(async () => {
  await db.reset(); await db.seed(); providerStep = null; providerFailure = false; resultPatch = {}; fault = null; uploadId = null;
  cloud.config.mockReturnValue({ cloud_name: 'users-test-cloud' });
  cloud.uploader.destroy.mockReset().mockResolvedValue({ result: 'ok' });
  cloud.uploader.upload_stream.mockReset().mockImplementation((opts, callback) => {
    uploadId = opts.public_id;
    return new Writable({ write(chunk, enc, done) { done(); }, final(done) {
      Promise.resolve().then(async () => {
        if (providerStep) await providerStep();
        if (providerFailure) callback(new Error('private provider key/target'));
        else callback(null, { public_id: opts.public_id, resource_type: 'image', type: 'upload', format: 'jpg', bytes: 128,
          secure_url: `https://res.cloudinary.com/users-test-cloud/image/upload/v123/${opts.public_id}.jpg`, ...resultPatch });
        done();
      }).catch(done);
    } });
  });
  runtime = createApplication(options()); app = runtime.app; await runtime.initialize();
});
afterEach(async () => { await runtime?.close(); });
afterAll(async () => { await db?.close(); });

test('entry import is inert and current composition never imports disabled Mongo modules', () => {
  expect(runtime.server.listening).toBe(false);
  const files = Object.keys(require.cache);
  for (const name of ['/models/', '/services/financialService.js', '/routes/security.js', '/routes/icons.js', '/routes/admin.js', '/routes/cards.js', '/routes/dev.js', '/utils/notifications.js', '/jobs/scheduler.js', '/tests/helpers/legacyUsersRoutes.js', '/tests/helpers/legacyOrdersRoutes.js', '/tests/helpers/legacyPaymentsRoutes.js', '/mongoose/']) expect(files.some(f => f.includes(name))).toBe(false);
  for (const name of ['/routes/orders.js', '/routes/payments.js']) expect(files.some(f => f.endsWith(name))).toBe(true);
});
test('health is 503 before verification, 200 after it, without session writes', async () => {
  const unready = createApplication(options());
  try {
    expect((await request(unready.app).get('/health').expect(503)).body.ready).toBe(false);
    await request(unready.app).get('/api/users/me').expect(503);
    await unready.initialize(); await request(unready.app).get('/health').expect(200);
    expect((await db.pool.query('SELECT count(*) AS n FROM public.express_sessions')).rows[0].n).toBe('0');
  } finally { await unready.close(); }
});
test('unavailable real PostgreSQL refuses to listen and remains not ready', async () => {
  const pool = new Pool({ ...connectionOptions(process.env, 'DATABASE_URL'), port: 1, connectionTimeoutMillis: 250 });
  const unavailable = createApplication(options(() => pool)), listen = jest.spyOn(unavailable.server, 'listen');
  try {
    await expect(unavailable.start({ port: 0 })).rejects.toMatchObject({ code: 'PG_BOOTSTRAP_UNAVAILABLE' });
    expect(listen).not.toHaveBeenCalled(); expect(unavailable.server.listening).toBe(false);
    await request(unavailable.app).get('/health').expect(503);
  } finally { await unavailable.close(); await pool.end(); }
});
test.each(['checksum', 'filename', 'missing', 'extra'])('migration ledger %s mismatch refuses real server boot', async kind => {
  const original = (await db.pool.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows;
  try {
    if (kind === 'checksum') await db.pool.query("UPDATE public.schema_migrations SET checksum=repeat('0',64) WHERE version=5");
    if (kind === 'filename') await db.pool.query("UPDATE public.schema_migrations SET filename='005_wrong.sql' WHERE version=5");
    if (kind === 'missing') await db.pool.query('DELETE FROM public.schema_migrations WHERE version=5');
    if (kind === 'extra') await db.pool.query("INSERT INTO public.schema_migrations(version,filename,checksum) VALUES(6,'006_extra.sql',repeat('0',64))");
    const bad = createApplication(options()), listen = jest.spyOn(bad.server, 'listen');
    try { await expect(bad.start({ port: 0 })).rejects.toMatchObject({ code: 'PG_BOOTSTRAP_LEDGER_MISMATCH' }); expect(listen).not.toHaveBeenCalled(); await request(bad.app).get('/health').expect(503); }
    finally { await bad.close(); }
  } finally {
    await db.pool.query('DELETE FROM public.schema_migrations');
    for (const r of original) await db.pool.query('INSERT INTO public.schema_migrations(version,filename,checksum,applied_at) VALUES($1,$2,$3,$4)', [r.version, r.filename, r.checksum, r.applied_at]);
  }
});
test.each([
  'ALTER TABLE public.express_sessions DISABLE TRIGGER express_session_update_guard',
  'ALTER TABLE public.application_sessions DISABLE TRIGGER application_session_update_guard',
  'ALTER TABLE public.token_revocations DISABLE TRIGGER token_revocation_row_guard',
  'ALTER TABLE public.token_revocations DISABLE TRIGGER token_revocation_no_truncate',
  'ALTER TABLE public.users DISABLE TRIGGER users_metadata_guard',
  'ALTER TABLE public.orders DISABLE TRIGGER order_immutable_rows',
  'DROP INDEX public.application_session_active_owner',
  'ALTER TABLE public.application_sessions DROP CONSTRAINT application_session_express_owner',
  'ALTER TABLE public.express_sessions DROP CONSTRAINT express_session_revocation',
  'ALTER TABLE public.application_sessions ALTER COLUMN token_version DROP NOT NULL',
  'GRANT SELECT ON public.express_sessions TO PUBLIC'
])('schema drift refuses boot: %s', async sql => {
  await db.pool.query(sql); // Only the guarded disposable schema; next reset restores it.
  const bad = createApplication(options()), listen = jest.spyOn(bad.server, 'listen');
  try { await expect(bad.start({ port: 0 })).rejects.toMatchObject({ code: 'PG_BOOTSTRAP_SCHEMA_MISMATCH' }); expect(listen).not.toHaveBeenCalled(); }
  finally { await bad.close(); }
});
test('listen occurs only after real ledger/catalog verification commits', async () => {
  const sql = [];
  const poolProvider = () => ({ async connect() {
    const c = await db.pool.connect(); return { connection: c.connection, release: broken => c.release(broken), query: async input => { sql.push(typeof input === 'string' ? input : input.text); return c.query(input); } };
  }, query: (...args) => db.pool.query(...args) });
  const live = createApplication(options(poolProvider));
  live.server.once('listening', () => { expect(sql.at(-1)).toBe('COMMIT'); expect(sql.some(s => s.includes('pg_trigger'))).toBe(true); });
  try { await live.start({ port: 0 }); await request(live.server).get('/health').expect(200); expect(live.ready).toBe(true); }
  finally { await live.close(); }
});
test('live health outage is sanitized and can recover without a session', async () => {
  const healthy = createApplication(options(faultProvider)); await healthy.initialize();
  try { fault = 'read'; const r = await request(healthy.app).get('/health').expect(503); expect(r.body).toEqual({ status: 'NOT_READY', ready: false, database: 'postgresql' }); fault = null; await request(healthy.app).get('/health').expect(200); }
  finally { await healthy.close(); }
});
test.each(['/api/orders', '/api/orders/purchase', '/api/payments', '/api/payments/submit', '/api/notifications', '/api/backups', '/api/security', '/api/icons', '/api/admin', '/api/cards', '/dev'])('financial mount or remaining disabled feature %s rejects without persistence or legacy imports', async url => {
  for (const method of ['get', 'post', 'put', 'delete']) {
    const financial = url.startsWith('/api/orders') || url.startsWith('/api/payments');
    const legacyCreate = url === '/api/orders' && method === 'post';
    const status = legacyCreate ? 410 : financial ? 401 : 503;
    const code = legacyCreate ? 'LEGACY_ORDER_CREATION_DISABLED' : financial ? 'MISSING_CREDENTIALS' : 'FEATURE_UNAVAILABLE';
    expect((await request(app)[method](url).send({ arbitrary: true }).expect(status)).body.code).toBe(code);
  }
  expect((await db.pool.query('SELECT count(*) AS n FROM public.express_sessions')).rows[0].n).toBe('0'); await noFinancialChanges();
});
test.each(['reserve', 'restore'])('disabled %s is 410 for all methods without authentication or writes', async name => {
  for (const method of ['get', 'post', 'put', 'delete', 'patch']) expect((await request(app)[method]('/api/users/' + H.OWNER + '/' + name).send({ quantity: 5 }).expect(410)).body.code).toBe('ENDPOINT_DISABLED');
  expect((await db.pool.query('SELECT count(*) AS n FROM public.express_sessions')).rows[0].n).toBe('0'); await noFinancialChanges();
});
test('administrative list is bounded, cursor-paginated and safely projected', async () => {
  const b = await logged('Admin_A'); const first = (await b.agent.get('/api/users?limit=2').expect(200)).body;
  expect(first.items).toHaveLength(2); first.items.forEach(safe); expect(first.nextBefore).toBeTruthy();
  const next = (await b.agent.get('/api/users').query({ limit: 2, before: first.nextBefore }).expect(200)).body;
  expect(next.items).toHaveLength(1); expect(new Set([...first.items, ...next.items].map(u => u.id)).size).toBe(3);
  expect((await b.agent.get('/api/users?role=user&accountStatus=active').expect(200)).body.items).toHaveLength(2);
});
test.each(['0', '101', '-1', '1.5', '01', 'abc'])('list rejects invalid limit %s', async limit => {
  const b = await logged('Admin_A'); await b.agent.get('/api/users').query({ limit }).expect(400);
});
test('list rejects altered cursor, mismatched filters and unknown query fields', async () => {
  const b = await logged('Admin_A'), first = (await b.agent.get('/api/users?limit=1').expect(200)).body;
  await b.agent.get('/api/users').query({ before: first.nextBefore + 'tamper' }).expect(400);
  await b.agent.get('/api/users').query({ before: first.nextBefore, role: 'user' }).expect(400);
  await b.agent.get('/api/users?principal=injected').expect(400);
});
test('regular users cannot list and a demoted current admin cannot rely on the JWT role', async () => {
  const u = await logged(); await u.agent.get('/api/users').expect(403);
  const a = await logged('Admin_A'); await db.pool.query("UPDATE public.users SET role='user' WHERE id=$1", [H.ADMIN]);
  await a.agent.get('/api/users').expect(403);
});
test.each(['/me', '/' + H.OWNER, '/' + H.OWNER + '/balance'])('self read %s returns exact string money/version without secrets', async suffix => {
  const b = await logged(); const r = await b.agent.get('/api/users' + suffix).expect(200);
  safe(r.body); expect(r.body).toMatchObject({ balanceCents: '10000', balance: '100.00', rowVersion: await version() });
});
test.each(['', '/balance'])('detail ownership is enforced for %s', async suffix => {
  const b = await logged(); await b.agent.get('/api/users/' + H.OTHER + suffix).expect(403);
  const a = await logged('Admin_A'); safe((await a.agent.get('/api/users/' + H.OTHER + suffix).expect(200)).body);
  await a.agent.get('/api/users/' + MISSING + suffix).expect(404);
  await a.agent.get('/api/users/not-a-uuid' + suffix).expect(400);
});
test('identity profile update is atomic, clears email verification and revokes every old session', async () => {
  const b = await logged(), second = await logged(); b.version = await version();
  const r = await write(b, 'put', '', { username: 'Renamed_U', email: 'RENAMED@EXAMPLE.TEST', phone: '+12025550101', theme: 1 }).expect(200);
  expect(r.body.requiresReauthentication).toBe(true); safe(r.body.user);
  expect(await readUser()).toMatchObject({ username: 'Renamed_U', email: 'renamed@example.test', email_verified: false, phone: '+12025550101', theme: 1, balance_cents: '10000', token_version: '2' });
  expect(r.headers['set-cookie'].some(c => c.startsWith('session_token=;'))).toBe(true);
  await second.agent.get('/api/users/me').expect(401); await b.agent.get('/api/users/me').expect(401); await noFinancialChanges();
});
test('invalid multi-field update rolls back every field and preserves credentials', async () => {
  const b = await logged(), original = await readUser();
  await write(b, 'put', '', { username: 'Would_Change', email: 'not-an-email', theme: 1 }).expect(400);
  expect(await readUser()).toEqual(original); await b.agent.get('/api/users/me').expect(200);
});
test.each(['role', 'accountStatus', 'balance', 'balanceCents', 'tokenVersion', 'userId', 'avatar'])('profile rejects forbidden field %s without effects', async field => {
  const b = await logged(), original = await readUser(); await write(b, 'put', '', { [field]: 'injected' }).expect(400); expect(await readUser()).toEqual(original);
});
test.each([undefined, 1, '01', '-1', '9007199254740992'])('profile requires canonical CAS version %s', async expectedRowVersion => {
  const b = await logged(), original = await readUser(); await write(b, 'put', '', { expectedRowVersion, theme: 1 }).expect(400); expect(await readUser()).toEqual(original);
});
test('stale CAS cannot overwrite a newly committed theme', async () => {
  const b = await logged(); await write(b, 'put', '/theme', { theme: 1 }).expect(200);
  const r = await write(b, 'put', '/theme', { theme: 0 }).expect(409); expect(r.body.code).toBe('USER_VERSION_CONFLICT'); expect((await readUser()).theme).toBe(1);
});
test('competing theme CAS permits exactly one committed user mutation', async () => {
  const b = await logged(), second = await logged(); b.version = second.version = await version();
  const responses = await Promise.all([write(b, 'put', '/theme', { theme: 1 }), write(second, 'put', '/theme', { theme: 0 })]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]); expect((await readUser()).row_version).toBe((BigInt(b.version) + 1n).toString()); await noFinancialChanges();
});
test('theme-only update keeps token version, sessions and money unchanged', async () => {
  const b = await logged(); const r = await write(b, 'put', '/theme', { theme: 1 }).expect(200);
  expect(r.body.requiresReauthentication).toBe(false); expect(r.body.user.theme).toBe(1); await b.agent.get('/api/users/me').expect(200); expect((await readUser()).token_version).toBe('1'); await noFinancialChanges();
});
test.each(['', '/theme'])('self-only mutation %s rejects even another administrator', async suffix => {
  const a = await logged('Admin_A'), original = await readUser(); await write(a, 'put', suffix, { theme: 1 }, H.OWNER).expect(403); expect(await readUser()).toEqual(original);
});
test('profile requires exact parent-bound CSRF before JSON parsing or persistence', async () => {
  const b = await logged(), original = await readUser();
  await b.agent.put('/api/users/' + H.OWNER).send({ expectedRowVersion: b.version, theme: 1 }).expect(403);
  await b.agent.put('/api/users/' + H.OWNER).set('x-csrf-token', 'wrong').send({ expectedRowVersion: b.version, theme: 1 }).expect(403);
  expect(await readUser()).toEqual(original);
});
test.each(['malformed', 'oversized'])('profile JSON %s is rejected safely without writes', async kind => {
  const b = await logged(), original = await readUser();
  await b.agent.put('/api/users/' + H.OWNER).set('x-csrf-token', b.csrf).set('Content-Type', 'application/json').send(kind === 'malformed' ? '{' : JSON.stringify({ phone: 'x'.repeat(17000) })).expect(400);
  expect(await readUser()).toEqual(original);
});
test('local password mutation uses cost 12, revokes old graph and authenticates only new password', async () => {
  const b = await logged(); const r = await write(b, 'put', '', { currentPassword: H.PASSWORD, password: 'NewCorrect1!pass' }).expect(200);
  expect(r.body.requiresReauthentication).toBe(true); expect((await readUser()).password_hash).toMatch(/^\$2[aby]\$12\$/); expect(await bcrypt.compare('NewCorrect1!pass', (await readUser()).password_hash)).toBe(true);
  await b.agent.get('/api/users/me').expect(401);
  const next = request.agent(app), bootstrap = await next.get('/api/auth/csrf').expect(200);
  await next.post('/api/auth/login').set('x-csrf-token', bootstrap.body.csrfToken).send({ username: 'Owner_U', password: 'NewCorrect1!pass' }).expect(200);
});
test('incorrect current password rejects the whole mixed profile mutation', async () => {
  const b = await logged(), original = await readUser(); await write(b, 'put', '', { username: 'No_Write', currentPassword: 'Wrong1!pass', password: 'NewCorrect1!pass' }).expect(403); expect(await readUser()).toEqual(original);
});
test('manual balance remains admin/CSRF protected and never writes money', async () => {
  const b = await logged(); await write(b, 'put', '/balance', { balance: 999 }).expect(403);
  const a = await logged('Admin_A'); await a.agent.put('/api/users/' + H.OWNER + '/balance').send({ balance: 999 }).expect(403);
  const r = await write(a, 'put', '/balance', { balance: 999 }).expect(503); expect(r.body.code).toBe('FINANCIAL_UNAVAILABLE'); await noFinancialChanges();
});
test('DELETE logically deactivates and preserves user/money while revoking only target sessions', async () => {
  const b = await logged(), a = await logged('Admin_A'); a.version = await version();
  const r = await write(a, 'delete').expect(200); safe(r.body.user); expect(r.body.user.accountStatus).toBe('deactivated');
  expect(await readUser()).toMatchObject({ id: H.OWNER, balance_cents: '10000', token_version: '2', account_status: 'deactivated' });
  expect((await db.pool.query('SELECT count(*) AS n FROM public.users')).rows[0].n).toBe('3');
  await b.agent.get('/api/users/me').expect(401); await a.agent.get('/api/users/me').expect(200); await noFinancialChanges();
});
test('activation uses current admin and target CAS and resets suspension bookkeeping', async () => {
  await db.pool.query("UPDATE public.users SET account_status='suspended',login_attempts=5 WHERE id=$1", [H.OWNER]);
  const a = await logged('Admin_A'); a.version = await version();
  const r = await write(a, 'put', '/activate').expect(200); expect(r.body.user.accountStatus).toBe('active');
  expect(await readUser()).toMatchObject({ login_attempts: 0, account_status: 'active', token_version: '2' }); expect((await readUser()).activated_at).not.toBeNull(); await logged();
});
test.each([['put', '/activate'], ['delete', '']])('lifecycle %s %s is admin-only, CSRF-protected and CAS', async (method, suffix) => {
  const b = await logged(); await write(b, method, suffix).expect(403);
  const a = await logged('Admin_A'); await a.agent[method]('/api/users/' + H.OWNER + suffix).send({ expectedRowVersion: await version() }).expect(403);
  a.version = '0'; await write(a, method, suffix).expect(409); expect((await readUser()).account_status).toBe('active');
});
test('self-deactivating administrator clears its revoked cookies after commit', async () => {
  const a = await logged('Admin_A'); const r = await write(a, 'delete', '', {}, H.ADMIN).expect(200); expect(r.body.user.accountStatus).toBe('deactivated'); await a.agent.get('/api/users/me').expect(401);
});
test('actual multipart avatar persists owned HTTPS URL through guarded CAS', async () => {
  const b = await logged(), r = await avatar(b).expect(200); safe(r.body.user);
  expect(uploadId).toMatch(/^payments_receipts\/[a-f0-9-]{36}$/); expect(r.body.avatar).toContain(uploadId); expect((await readUser()).avatar).toBe(r.body.avatar);
  expect(cloud.uploader.upload_stream).toHaveBeenCalledWith(expect.objectContaining({ overwrite: false, timeout: 30000, format: 'jpg' }), expect.any(Function));
  expect(cloud.uploader.destroy).not.toHaveBeenCalled(); await b.agent.get('/api/users/me').expect(200); await noFinancialChanges();
});
test.each(['missing-auth', 'ownership', 'csrf', 'missing-version', 'stale-version'])('avatar %s fails before provider write', async kind => {
  const b = await logged(), original = await readUser(); let r;
  if (kind === 'missing-auth') r = request(app).post('/api/users/' + H.OWNER + '/avatar').set('x-row-version', b.version).attach('avatar', Buffer.from('x'), 'a.png');
  else if (kind === 'ownership') r = avatar(b, b.version, H.OTHER);
  else if (kind === 'csrf') { b.csrf = 'wrong'; r = avatar(b); }
  else if (kind === 'missing-version') r = b.agent.post('/api/users/' + H.OWNER + '/avatar').set('x-csrf-token', b.csrf).attach('avatar', Buffer.from('x'), 'a.png');
  else r = avatar(b, '0');
  const response = await r; expect([400, 401, 403, 409]).toContain(response.status); expect(cloud.uploader.upload_stream).not.toHaveBeenCalled(); expect(await readUser()).toEqual(original);
});
test.each(['extra-field', 'wrong-field', 'oversized', 'mime', 'missing-file'])('multipart %s cannot create a provider asset', async kind => {
  const b = await logged(), original = await readUser(); let r = b.agent.post('/api/users/' + H.OWNER + '/avatar').set('x-csrf-token', b.csrf).set('x-row-version', b.version);
  if (kind === 'extra-field') r = r.field('expectedRowVersion', b.version);
  if (kind !== 'missing-file') r = r.attach(kind === 'wrong-field' ? 'other' : 'avatar', Buffer.alloc(kind === 'oversized' ? 5 * 1024 * 1024 + 1 : 20), { filename: 'a.png', contentType: kind === 'mime' ? 'text/plain' : 'image/png' });
  await r.expect(400); expect(cloud.uploader.upload_stream).not.toHaveBeenCalled(); expect(await readUser()).toEqual(original);
});
test('provider errors are sanitized and clean only generated assets', async () => {
  const b = await logged(), original = await readUser(); providerFailure = true;
  const r = await avatar(b).expect(502); expect(r.body.code).toBe('AVATAR_UPLOAD_FAILED'); expect(JSON.stringify(r.body)).not.toContain('private'); expect(await readUser()).toEqual(original);
  expect(cloud.uploader.destroy).toHaveBeenCalledWith(uploadId, expect.any(Object));
});
test('provider cannot inject a foreign asset ID/URL into persistence or cleanup', async () => {
  const b = await logged(), original = await readUser(); resultPatch = { public_id: 'foreign/asset', secure_url: 'https://evil.test/asset.jpg' };
  await avatar(b).expect(502); expect(await readUser()).toEqual(original); expect(cloud.uploader.destroy.mock.calls.every(c => c[0] === uploadId)).toBe(true);
});
test('CAS change during provider upload preserves newer profile and cleans rejected owned upload', async () => {
  const b = await logged(); providerStep = () => db.pool.query('UPDATE public.users SET theme=1 WHERE id=$1', [H.OWNER]);
  expect((await avatar(b).expect(409)).body.code).toBe('USER_VERSION_CONFLICT'); expect((await readUser()).avatar).toBe(''); expect((await readUser()).theme).toBe(1); expect(cloud.uploader.destroy).toHaveBeenCalledWith(uploadId, expect.any(Object));
});
test('fresh account deactivation during upload rejects CAS body and cleans only owned new asset', async () => {
  const b = await logged(); providerStep = () => db.pool.query("UPDATE public.users SET account_status='deactivated',token_version=token_version+1 WHERE id=$1", [H.OWNER]);
  await avatar(b).expect(403); expect((await readUser()).avatar).toBe(''); expect(cloud.uploader.destroy).toHaveBeenCalledWith(uploadId, expect.any(Object));
});
test('lost actual avatar COMMIT acknowledgement preserves potentially accepted asset and never repeats body', async () => {
  await runtime.close(); runtime = createApplication(options(faultProvider)); app = runtime.app; await runtime.initialize();
  const b = await logged(); fault = 'avatar-unknown'; const r = await avatar(b).expect(503);
  expect(r.body.code).toBe('AUTH_OUTCOME_UNKNOWN'); expect((await readUser()).avatar).toContain(uploadId); expect((await readUser()).row_version).toBe((BigInt(b.version) + 1n).toString());
  expect(cloud.uploader.destroy).not.toHaveBeenCalled(); expect(cloud.uploader.upload_stream).toHaveBeenCalledTimes(1);
});
test('avatar removal commits DB CAS before best-effort provider cleanup', async () => {
  const b = await logged(); await avatar(b).expect(200); b.version = await version();
  cloud.uploader.destroy.mockImplementation(async id => { expect(id).toBe(uploadId); expect((await readUser()).avatar).toBe(''); throw new Error('private provider failure'); });
  const r = await write(b, 'post', '/avatar/remove').expect(200); expect(r.body.avatar).toBe(''); expect((await readUser()).avatar).toBe(''); await b.agent.get('/api/users/me').expect(200);
});
test('stale removal cannot delete accepted asset', async () => {
  const b = await logged(); const r = await avatar(b).expect(200); await write(b, 'post', '/avatar/remove').expect(409); expect((await readUser()).avatar).toBe(r.body.avatar); expect(cloud.uploader.destroy).not.toHaveBeenCalled();
});
test.each(['https://evil.test/avatar.jpg', 'https://res.cloudinary.com/foreign-cloud/image/upload/payments_receipts/00000000-0000-4000-8000-000000000001.jpg'])('removal never deletes foreign URL %s', async url => {
  await db.pool.query('UPDATE public.users SET avatar=$2 WHERE id=$1', [H.OWNER, url]); const b = await logged(); await write(b, 'post', '/avatar/remove').expect(200); expect(cloud.uploader.destroy).not.toHaveBeenCalled(); expect((await readUser()).avatar).toBe('');
});
test('legacy receipt static paths remain unavailable before both static roots', async () => {
  await request(app).get('/images/payments/sensitive.jpg').expect(410);
});
test('protected pages do not trust anonymous Express JSON or ordinary user role', async () => {
  const agent = request.agent(app); await agent.get('/api/auth/csrf').expect(200); await agent.get('/homepage.html').expect(401);
  const b = await logged(); await b.agent.get('/homepage').expect(403); await b.agent.get('/admin.html').expect(403);
});
