'use strict';
// C3.2b1: 45 real HTTP/PG18 cases: 7 success, 9 guards, 11 multipart,
// 11 provider failures/evidence, 7 cleanup/races/outcomes. No legacy fixtures.
// Runtime delegates conversion to Cloudinary, not local Sharp. Real Sharp below
// creates fixtures and implements ONLY the controlled provider's requested
// JPEG/800px transformation. Original uploaded bytes remain observable.
const request = require('supertest');
const { Writable } = require('node:stream');
const { performance } = require('node:perf_hooks');
const sharp = require('../node_modules/sharp');
const cloudinary = require('../config/cloudinary');
const { createApplication } = require('../server');
const H = require('./helpers/disposablePg');
const CLOUD = 'avatar-pg-test-cloud';
const SECRET = 'avatar-http-parent-signing-secret-'.repeat(2);
const MAX_BYTES = 5 * 1024 * 1024;
const OWNED = /^payments_receipts\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const FORMAT_POLICY = ['jpg', 'png', 'jpeg', 'webp', 'bmp', 'tiff'];
const PRIVATE = 'private-provider-secret';
let db, runtime, origin, image, largeImage, oldConfig, uploadSpy, destroySpy;
let mode, patch, calls, held, fault, events;
const users = async () => (await db.pool.query('SELECT * FROM public.users ORDER BY id')).rows;
const user = async (id = H.OWNER) => (await users()).find(row => row.id === id);
const graph = async () => ({
  parents: (await db.pool.query('SELECT * FROM public.express_sessions ORDER BY id')).rows,
  children: (await db.pool.query('SELECT * FROM public.application_sessions ORDER BY id')).rows,
  revocations: (await db.pool.query('SELECT * FROM public.token_revocations ORDER BY id')).rows
});
async function noFinancialEffects() {
  expect((await users()).map(row => [row.balance_cents, row.balance])).toEqual([
    ['10000', '100.00'], ['10000', '100.00'], ['10000', '100.00']
  ]);
  for (const table of ['financial_operations', 'orders', 'payments']) {
    expect((await db.pool.query(`SELECT count(*) AS n FROM public.${table}`)).rows[0].n).toBe('0');
  }
}
async function unchanged(before) { expect(await users()).toEqual(before); await noFinancialEffects(); }
function safe(value) {
  for (const key of ['_id', 'tokenVersion', 'password', 'password_hash', 'twoFASecret', 'two_fa_secret',
    'trustedDevices', 'trusted_devices', 'resetPasswordToken', 'reset_password_token', '__top4StoreRevision']) {
    expect(value).not.toHaveProperty(key);
  }
}
function failure(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ success: false, code, error: code });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(JSON.stringify(response.body)).not.toMatch(/private-provider|private-pg|test-signing|api_secret|password_hash/);
}
function ownedCleanup(id, count = 1) {
  expect(id).toMatch(OWNED); expect(destroySpy).toHaveBeenCalledTimes(count);
  for (const args of destroySpy.mock.calls) {
    expect(args).toEqual([id, { resource_type: 'image', type: 'upload', invalidate: true, timeout: 5000 }]);
  }
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate) {
  const deadline = performance.now() + 3000;
  while (!predicate() && performance.now() < deadline) await pause(10);
  expect(predicate()).toBe(true);
}
// Faults wrap real drivers, never fabricate rows or disable guards. Known failure
// is raised by PG AFTER the real UPDATE; unknown failure loses the acknowledgement
// AFTER the actual COMMIT. Every unrelated query passes through unchanged.
function poolProvider() {
  return {
    query: (...args) => db.pool.query(...args),
    async connect() {
      const raw = await db.pool.connect();
      const trace = { statements: [], releases: [], avatarWrites: 0 }; events.push(trace);
      return {
        connection: raw.connection,
        on: (...args) => raw.on(...args), removeListener: (...args) => raw.removeListener(...args),
        release(broken) { trace.releases.push(broken); raw.release(broken); },
        async query(input, values) {
          const sql = typeof input === 'string' ? input : input.text;
          trace.statements.push(sql);
          const result = await raw.query(input, values);
          if (/^UPDATE public\.users SET avatar\s*=/.test(sql)) {
            trace.avatarWrites++;
            if (fault === 'rollback') {
              fault = null;
              return raw.query("DO $$ BEGIN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='private-pg-avatar-rollback-detail'; END $$");
            }
          }
          if (trace.avatarWrites && sql === 'COMMIT' && fault === 'unknown') {
            fault = null;
            throw Object.assign(new Error('private-pg-lost-COMMIT-acknowledgement'), { code: 'ECONNRESET' });
          }
          return result;
        }
      };
    }
  };
}
function installTransport() {
  uploadSpy.mockImplementation((options, callback) => {
    const call = { options, chunks: [], output: null, replies: 0, stream: null }; calls.push(call);
    if (mode === 'throw') throw new Error(PRIVATE);
    if (mode === 'sync-error') callback(new Error(PRIVATE));
    const stream = new Writable({
      write(chunk, encoding, done) { call.chunks.push(Buffer.from(chunk)); done(); },
      final(done) {
        const transformation = options.transformation[0];
        sharp(Buffer.concat(call.chunks)).resize({ width: transformation.width, height: transformation.height,
          fit: 'inside', withoutEnlargement: true }).jpeg().toBuffer().then(output => {
          call.output = output;
          const reply = () => {
            call.replies++;
            callback(null, { public_id: options.public_id, resource_type: 'image', type: 'upload', format: 'jpg', bytes: output.length,
              secure_url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${options.public_id}.jpg`, ...patch });
          };
          call.confirm = reply; // Allow duplicate confirmation after DB commit.
          if (mode === 'hold') held.push(reply);
          else if (mode === 'callback-error') callback(new Error(PRIVATE));
          else if (mode === 'stream-error') { done(new Error(PRIVATE)); return; }
          else { reply(); if (mode === 'twice') reply(); }
          done();
        }, done);
      }
    });
    call.stream = stream; return stream;
  });
}
async function logged(username = 'Owner_U') {
  const agent = request.agent(runtime.server);
  const boot = await agent.get('/api/auth/csrf').expect(200);
  const login = await agent.post('/api/auth/login').set('x-csrf-token', boot.body.csrfToken)
    .send({ username, password: H.PASSWORD }).expect(200);
  const id = login.body.user.id, state = await user(id);
  expect(login.body.user).toMatchObject({ id, rowVersion: state.row_version, balanceCents: '10000', balance: '100.00' });
  expect(state.row_version).toMatch(/^(0|[1-9][0-9]*)$/); safe(login.body.user);
  // Prove HTTP login created a real, active, parent-bound PG session graph.
  const bound = (await db.pool.query(`SELECT a.user_id, a.express_session_id, e.id AS parent_id,
    e.user_id AS parent_user, e.session_data FROM public.application_sessions a
    JOIN public.express_sessions e ON e.id=a.express_session_id
    WHERE a.user_id=$1::UUID AND a.revoked_at IS NULL AND e.revoked_at IS NULL`, [id])).rows;
  expect(bound).toHaveLength(1);
  expect(bound[0]).toMatchObject({ user_id: id, parent_user: id, parent_id: bound[0].express_session_id });
  expect(bound[0].session_data.csrfToken).toBe(login.body.csrfToken);
  return { agent, id, version: state.row_version, csrf: login.body.csrfToken,
    cookie: login.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') };
}
function upload(browser, { mime = 'image/png', bytes = image, field = 'avatar', extra, extraFirst = false,
  second = false, target = H.OWNER, csrf = browser?.csrf, version = browser?.version } = {}) {
  let r = (browser?.agent || request(runtime.server)).post(`/api/users/${target}/avatar`);
  if (csrf !== null && csrf !== undefined) r = r.set('x-csrf-token', csrf);
  if (version !== null && version !== undefined) r = r.set('x-row-version', version);
  if (extra && extraFirst) r = r.field('role', 'admin');
  if (bytes !== null) r = r.attach(field, bytes, { filename: 'untrusted-original.png', contentType: mime });
  if (extra && !extraFirst) r = r.field('role', 'admin');
  if (second) r = r.attach('avatar', image, { filename: 'second.png', contentType: mime });
  return r;
}
async function success(browser, response, before, expectedBytes = image) {
  expect(response.status).toBe(200); expect(response.body.success).toBe(true); safe(response.body.user);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(uploadSpy).toHaveBeenCalledTimes(1); expect(calls).toHaveLength(1);
  const call = calls[0], id = call.options.public_id; expect(id).toMatch(OWNED);
  expect(call.options).toEqual({ public_id: id, resource_type: 'image', type: 'upload', format: 'jpg',
    allowed_formats: FORMAT_POLICY, overwrite: false, timeout: 30000,
    transformation: [{ format: 'jpg', width: 800, height: 800, crop: 'limit' }] });
  expect(Buffer.concat(call.chunks)).toEqual(expectedBytes);
  const metadata = await sharp(call.output).metadata();
  expect(metadata.format).toBe('jpeg'); expect(metadata.width).toBeLessThanOrEqual(800); expect(metadata.height).toBeLessThanOrEqual(800);
  expect(response.body.avatar).toBe(`https://res.cloudinary.com/${CLOUD}/image/upload/v1/${id}.jpg`);
  const after = await users(), original = before.find(row => row.id === browser.id), changed = after.find(row => row.id === browser.id);
  const rowVersion = (BigInt(original.row_version) + 1n).toString();
  expect(response.body.user).toMatchObject({ id: browser.id, avatar: response.body.avatar, rowVersion, balanceCents: '10000', balance: '100.00' });
  expect(changed).toEqual({ ...original, avatar: response.body.avatar, row_version: rowVersion, updated_at: changed.updated_at });
  expect(changed.updated_at.getTime()).toBeGreaterThanOrEqual(original.updated_at.getTime());
  expect(after.filter(row => row.id !== browser.id)).toEqual(before.filter(row => row.id !== browser.id));
  expect(events.filter(e => e.avatarWrites).reduce((n, e) => n + e.avatarWrites, 0)).toBe(1);
  expect(destroySpy).not.toHaveBeenCalled(); await noFinancialEffects();
  const current = await browser.agent.get('/api/users/me').expect(200);
  expect(current.body).toMatchObject({ avatar: response.body.avatar, rowVersion }); safe(current.body);
}
beforeAll(async () => {
  db = await H.open(); oldConfig = { ...cloudinary.config() };
  cloudinary.config({ cloud_name: CLOUD, api_key: 'test-avatar-key', api_secret: 'test-signing-secret' });
  uploadSpy = jest.spyOn(cloudinary.uploader, 'upload_stream');
  destroySpy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
  image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#abcdef' } }).png().toBuffer();
  largeImage = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#abcdef' } }).png().toBuffer();
});
beforeEach(async () => {
  await db.reset(); await db.seed();
  mode = 'normal'; patch = {}; calls = []; held = []; fault = null; events = [];
  uploadSpy.mockReset(); destroySpy.mockReset().mockResolvedValue({ result: 'ok' }); installTransport();
  runtime = createApplication({ poolProvider, staticFiles: false, authOptions: {
    lookupSecret: H.LOOKUP_SECRET, jwtSecret: H.JWT_SECRET, sessionSecret: SECRET, cursorSecret: H.CURSOR_SECRET, secureCookies: false,
    googleConfig: { clientId: 'avatar-test.apps.googleusercontent.com', clientSecret: 'avatar-google-test-secret',
      callbackUrl: 'http://localhost/api/auth/google/callback' }
  } });
  await runtime.start({ port: 0, host: '127.0.0.1' });
  origin = `http://127.0.0.1:${runtime.server.address().port}`;
});
afterEach(async () => { runtime?.server.closeIdleConnections(); await runtime?.close(); });
afterAll(async () => {
  uploadSpy?.mockRestore(); destroySpy?.mockRestore(); if (oldConfig) cloudinary.config(oldConfig); await db?.close();
});

// Success/MIME policy: 7 cases (6 accepted MIME variants + provider transform).
describe('Success/MIME policy (7)', () => {
  test.each(['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/x-ms-bmp', 'image/tiff'])(
    'accepted avatar MIME policy persists through PostgreSQL CAS: %s', async mime => {
      const b = await logged(), before = await users();
      await success(b, await upload(b, { mime }), before);
      // Advertised MIME allowlisting is not content sniffing. The historical
      // policy accepts this genuine PNG under each allowed advertised MIME.
      const meta = await sharp(calls[0].output).metadata(); expect([meta.width, meta.height]).toEqual([8, 8]);
    }
  );
  test('provider JPEG transformation limits a genuine large image without changing the uploaded bytes', async () => {
    const b = await logged(), before = await users();
    await success(b, await upload(b, { bytes: largeImage }), before, largeImage);
    const meta = await sharp(calls[0].output).metadata(); expect([meta.width, meta.height]).toEqual([800, 600]);
  });
});

// Auth/ownership/CSRF/CAS: 9 cases, rejected before Multer/provider and writes.
describe('Auth/ownership/CSRF/CAS (9)', () => {
  const guards = [
    ['anonymous', null, {}, 401, 'MISSING_CREDENTIALS'],
    ['ordinary cross-user', 'Other_U', {}, 403, 'FORBIDDEN'],
    ['administrator cross-user', 'Admin_A', {}, 403, 'FORBIDDEN'],
    ['missing parent CSRF', 'Owner_U', { csrf: null }, 403, 'CSRF_INVALID'],
    ['wrong parent CSRF', 'Owner_U', { csrf: 'wrong' }, 403, 'CSRF_INVALID'],
    ['missing CAS header', 'Owner_U', { version: null }, 400, 'INVALID_AUTH_VERSION'],
    ['noncanonical CAS header', 'Owner_U', { version: '01' }, 400, 'INVALID_AUTH_VERSION'],
    ['stale CAS header', 'Owner_U', { version: '0' }, 409, 'USER_VERSION_CONFLICT'],
    ['invalid UUID', 'Owner_U', { target: 'abcdef0123456789abcdef01' }, 400, 'INVALID_USER_ID']
  ];
  test.each(guards)('avatar authorization failure prevents provider and PostgreSQL writes: %p',
    async (name, username, options, status, code) => {
      const b = username ? await logged(username) : null, before = await users(), sessions = await graph();
      // Oversized/extra-field bodies must not reach storage on guard failure.
      const response = await upload(b, { version: (await user()).row_version, bytes: Buffer.alloc(MAX_BYTES + 1), extra: true, ...options });
      failure(response, status, code);
      expect(uploadSpy).not.toHaveBeenCalled(); expect(destroySpy).not.toHaveBeenCalled();
      await unchanged(before); expect(await graph()).toEqual(sessions);
    });
});

// Invalid multipart/MIME: 11 cases, entire multipart is parsed before storage.
describe('Invalid multipart/MIME (11)', () => {
  test.each(['image/svg+xml', 'image/gif', 'application/octet-stream'])(
    'unsupported avatar MIME rejects before provider or persistence: %s', async mime => {
      const b = await logged(), before = await users();
      failure(await upload(b, { mime }), 400, 'INVALID_AVATAR');
      expect(uploadSpy).not.toHaveBeenCalled(); expect(destroySpy).not.toHaveBeenCalled(); await unchanged(before);
    });
  test.each([
    { extra: true }, { extra: true, extraFirst: true }, { second: true }, { field: 'receipt' },
    { bytes: 'oversized' }, { bytes: 'empty' }, { bytes: null }
  ])('invalid avatar multipart prevents provider and persistence: %p', async options => {
    const b = await logged(), before = await users();
    const bytes = options.bytes === 'oversized' ? Buffer.alloc(MAX_BYTES + 1) : options.bytes === 'empty' ? Buffer.alloc(0) : options.bytes;
    const input = { ...options }; if (Object.hasOwn(options, 'bytes')) input.bytes = bytes;
    failure(await upload(b, input), 400, 'INVALID_AVATAR');
    expect(uploadSpy).not.toHaveBeenCalled(); expect(destroySpy).not.toHaveBeenCalled(); await unchanged(before);
  });
  test('malformed avatar boundary creates no asset or persistence', async () => {
    const b = await logged(), before = await users();
    const r = await b.agent.post(`/api/users/${H.OWNER}/avatar`).set('x-csrf-token', b.csrf).set('x-row-version', b.version)
      .set('Content-Type', 'multipart/form-data; boundary=bad').send('--bad\r\nmalformed');
    failure(r, 400, 'INVALID_AVATAR');
    expect(uploadSpy).not.toHaveBeenCalled(); expect(destroySpy).not.toHaveBeenCalled(); await unchanged(before);
  });
});

// Provider failures/evidence: 11 cases (4 transport faults + 7 contradictions).
describe('Provider failures/evidence (11)', () => {
  test.each(['throw', 'callback-error', 'stream-error', 'sync-error'])(
    'avatar provider failure is sanitized and cleans only owned ID: %s', async providerMode => {
      const b = await logged(), before = await users(); mode = providerMode;
      failure(await upload(b), 502, 'AVATAR_UPLOAD_FAILED');
      expect(uploadSpy).toHaveBeenCalledTimes(1); ownedCleanup(calls[0].options.public_id); await unchanged(before);
      if (providerMode === 'sync-error') {
        expect(Buffer.concat(calls[0].chunks)).toHaveLength(0); expect(calls[0].stream.destroyed).toBe(true);
      }
    });
  test.each([
    { public_id: 'someone-elses-asset' }, { type: 'authenticated' }, { resource_type: 'raw' },
    { format: 'png' }, { bytes: NaN }, { secure_url: 'https://attacker.example/asset.jpg' },
    { secure_url: 'https://res.cloudinary.com/another-cloud/image/upload/asset.jpg' }
  ])('contradictory avatar provider evidence cannot persist or delete foreign assets: %p', async evidence => {
    const b = await logged(), before = await users(); patch = evidence;
    failure(await upload(b), 502, 'AVATAR_UPLOAD_FAILED');
    expect(uploadSpy).toHaveBeenCalledTimes(1); ownedCleanup(calls[0].options.public_id); await unchanged(before);
    if (evidence.public_id) expect(destroySpy).not.toHaveBeenCalledWith(evidence.public_id, expect.anything());
  });
});

// Cleanup/races/timeout/unknown outcome: 7 cases. No blind COMMIT cleanup.
describe('Cleanup/races/timeout/unknown outcome (7)', () => {
  test('duplicate provider success cannot delete or persist an accepted avatar twice', async () => {
    const b = await logged(), before = await users(); mode = 'twice';
    await success(b, await upload(b), before); expect(calls[0].replies).toBe(2);
    const committed = await users(); calls[0].confirm(); await pause(10);
    expect(calls[0].replies).toBe(3); expect(destroySpy).not.toHaveBeenCalled();
    expect(events.filter(e => e.avatarWrites).reduce((n, e) => n + e.avatarWrites, 0)).toBe(1);
    await unchanged(committed);
  });
  test('known avatar rollback cleans only returned owned asset', async () => {
    const b = await logged(), before = await users(), sessions = await graph(); fault = 'rollback';
    let cleanupAfter;
    destroySpy.mockImplementation(async () => {
      cleanupAfter = events.filter(e => e.avatarWrites).map(e => e.statements.slice());
      throw new Error('private-provider-cleanup-failure'); // Best effort, not raw error disclosure.
    });
    failure(await upload(b), 503, 'AUTH_UNAVAILABLE');
    const writes = events.filter(e => e.avatarWrites); expect(writes).toHaveLength(1);
    expect(writes[0].avatarWrites).toBe(1); expect(writes[0].statements.at(-1)).toBe('ROLLBACK');
    expect(writes[0].statements).not.toContain('COMMIT'); expect(writes[0].releases).toEqual([false]);
    expect(cleanupAfter).toEqual([writes[0].statements]); // Confirmed rollback preceded cleanup attempt.
    ownedCleanup(calls[0].options.public_id); await unchanged(before); expect(await graph()).toEqual(sessions);
  });
  test('token-version change during avatar upload prevents persistence', async () => {
    // Independent token-version AND account-status assertions within one case;
    // neither failure is inferred from the other. Every query hits real PG.
    for (const change of ['token-version', 'deactivation']) {
      if (change === 'deactivation') {
        await db.reset(); await db.seed();
        calls = []; held = []; events = []; uploadSpy.mockClear(); destroySpy.mockClear();
      }
      const b = await logged(); mode = 'hold';
      const pending = upload(b).then(r => r); await waitFor(() => held.length === 1);
      if (change === 'token-version') await db.pool.query('UPDATE public.users SET token_version=token_version+1 WHERE id=$1::UUID', [H.OWNER]);
      else await db.pool.query("UPDATE public.users SET account_status='deactivated' WHERE id=$1::UUID", [H.OWNER]);
      const authoritative = await users(); held[0]();
      failure(await pending, 403, 'AUTH_FORBIDDEN');
      expect(events.filter(e => e.avatarWrites)).toHaveLength(0);
      ownedCleanup(calls[0].options.public_id); await unchanged(authoritative);
      await b.agent.get('/api/users/me').expect(401);
    }
  });
  test('CAS change during upload preserves newer profile and rejects the owned avatar', async () => {
    const b = await logged(); mode = 'hold';
    const pending = upload(b).then(r => r); await waitFor(() => held.length === 1);
    await db.pool.query('UPDATE public.users SET theme=1 WHERE id=$1::UUID', [H.OWNER]);
    const authoritative = await users(); held[0]();
    failure(await pending, 409, 'USER_VERSION_CONFLICT');
    expect(events.filter(e => e.avatarWrites)).toHaveLength(0);
    ownedCleanup(calls[0].options.public_id); await unchanged(authoritative);
    const current = await b.agent.get('/api/users/me').expect(200);
    expect(current.body).toMatchObject({ theme: 1, avatar: '', rowVersion: authoritative.find(r => r.id === H.OWNER).row_version });
  });
  test('avatar interruption and late provider confirmation clean only owned ID', async () => {
    const b = await logged(), before = await users(); mode = 'hold';
    const controller = new AbortController(), body = new FormData();
    body.append('avatar', new Blob([image], { type: 'image/png' }), 'untrusted-original.png');
    const pending = fetch(`${origin}/api/users/${H.OWNER}/avatar`, { method: 'POST', body, signal: controller.signal,
      headers: { cookie: b.cookie, 'x-csrf-token': b.csrf, 'x-row-version': b.version } }).then(
      () => { throw new Error('An interrupted request must not resolve successfully'); }, error => error);
    try {
      await waitFor(() => held.length === 1); controller.abort(); expect((await pending).name).toBe('AbortError');
      await waitFor(() => destroySpy.mock.calls.length === 1); ownedCleanup(calls[0].options.public_id);
      expect(calls[0].stream.destroyed).toBe(true); held[0]();
      await waitFor(() => destroySpy.mock.calls.length === 2); ownedCleanup(calls[0].options.public_id, 2);
      expect(events.filter(e => e.avatarWrites)).toHaveLength(0); await unchanged(before);
    } finally { controller.abort(); }
  });
  test('avatar provider timeout is bounded and does not persist', async () => {
    const b = await logged(), before = await users(); mode = 'hold';
    const original = global.setTimeout, schedules = [], start = performance.now();
    // Keep PG/session/HTTP timers real. Accelerate ONLY upload's fixed deadline.
    const timer = jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => {
      if (delay === 30000 && new Error().stack.includes('/middlewares/upload.js')) {
        schedules.push(delay); return original(fn, 150, ...args);
      }
      return original(fn, delay, ...args);
    });
    try {
      failure(await upload(b), 504, 'AVATAR_UPLOAD_TIMEOUT');
      expect(schedules).toEqual([30000]); expect(performance.now() - start).toBeLessThan(3000);
      expect(held).toHaveLength(1); expect(calls[0].stream.destroyed).toBe(true);
      ownedCleanup(calls[0].options.public_id); held[0]();
      await waitFor(() => destroySpy.mock.calls.length === 2); ownedCleanup(calls[0].options.public_id, 2);
      expect(events.filter(e => e.avatarWrites)).toHaveLength(0); await unchanged(before);
    } finally { timer.mockRestore(); }
  });
  test('unknown actual avatar COMMIT retains the possibly accepted asset without replacement writes', async () => {
    const b = await logged(), before = await users(), sessions = await graph(); fault = 'unknown';
    failure(await upload(b), 503, 'AUTH_OUTCOME_UNKNOWN');
    expect(uploadSpy).toHaveBeenCalledTimes(1); expect(destroySpy).not.toHaveBeenCalled();
    const writes = events.filter(e => e.avatarWrites); expect(writes).toHaveLength(1);
    expect(writes[0].avatarWrites).toBe(1); expect(writes[0].statements.at(-1)).toBe('COMMIT');
    expect(writes[0].releases).toEqual([true]);
    const id = calls[0].options.public_id, after = await users(), original = before.find(row => row.id === H.OWNER), current = after.find(row => row.id === H.OWNER);
    expect(id).toMatch(OWNED);
    expect(current).toEqual({ ...original, avatar: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${id}.jpg`,
      row_version: (BigInt(original.row_version) + 1n).toString(), updated_at: current.updated_at });
    expect(after.filter(row => row.id !== H.OWNER)).toEqual(before.filter(row => row.id !== H.OWNER));
    expect(await graph()).toEqual(sessions); await noFinancialEffects();
    const recovered = await b.agent.get('/api/users/me').expect(200);
    expect(recovered.body).toMatchObject({ avatar: current.avatar, rowVersion: current.row_version });
    expect(uploadSpy).toHaveBeenCalledTimes(1); expect(destroySpy).not.toHaveBeenCalled();
    expect(events.filter(e => e.avatarWrites)).toHaveLength(1);
  });
});
