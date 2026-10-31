'use strict';
// Actual server entry, routers, branded auth/CSRF, Multer/Sharp, repositories,
// coordinator and verified-TLS PostgreSQL. Only external Cloudinary is controlled.
jest.mock('../config/cloudinary', () => {
  const provider = require('../node_modules/cloudinary').v2;
  provider.config({ cloud_name: 'financial-http-test', api_key: 'test-key', api_secret: 'test-private-signing-secret' });
  return { utils: provider.utils, uploader: { upload_stream: jest.fn(), destroy: jest.fn() } };
});
const request = require('supertest');
const { Writable } = require('node:stream');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('../node_modules/sharp');
const base58 = require('../node_modules/bs58check').default;
const { createApplication } = require('../server');
const catalog = require('../services/catalogService');
const cloud = require('../config/cloudinary');
const H = require('./helpers/disposablePg');
let db, runtime, app, directory, fixture, image, providerStep, providerFailure, providerPatch,
  uploadBuffers, fault, financialWrites, saveAttempts, preventSave, beforeLocks;
const SECRET = 'financial-http-parent-signing-secret-'.repeat(2);
const bitcoin = base58.encode(Uint8Array.from([0, ...Array(20).fill(17)]));
const tron = base58.encode(Uint8Array.from([0x41, ...Array(20).fill(17)]));
const evm = '0x52908400098527886E0F7030069857D2E4169EE7';
const purchaseBody = extra => ({ category: 'games', productId: 1, packageIndex: 0,
  idempotencyKey: 'purchase-1', fulfillmentTarget: { playerId: 'Player_123' }, ...extra });
const decisionBody = extra => ({ idempotencyKey: 'decision-1', reason: 'Reviewed evidence', ...extra });
const row = async (table, key, value) => (await db.pool.query(`SELECT * FROM public.${table} WHERE ${key}=$1`, [value])).rows[0];
const balance = async (id = H.OWNER) => (await row('users', 'id', id)).balance_cents;
const count = async table => (await db.pool.query(`SELECT count(*) AS n FROM public.${table}`)).rows[0].n;
const operations = async () => (await db.pool.query('SELECT * FROM public.financial_operations ORDER BY created_at, id')).rows;
function cookies(response) {
  return Object.fromEntries((response.headers['set-cookie'] || []).map(v => {
    const part = v.split(';')[0], i = part.indexOf('='); return [part.slice(0, i), part.slice(i + 1)];
  }));
}
const cookieHeader = values => Object.entries(values).map(([k,v]) => `${k}=${v}`).join('; ');
async function logged(username = 'Owner_U') {
  const agent = request.agent(app), boot = await agent.get('/api/auth/csrf').expect(200);
  const login = await agent.post('/api/auth/login').set('x-csrf-token', boot.body.csrfToken)
    .send({ username, password: H.PASSWORD }).expect(200);
  return { agent, csrf: login.body.csrfToken, login };
}
const buy = (b, extra = {}) => b.agent.post('/api/orders/purchase').set('x-csrf-token', b.csrf).send(purchaseBody(extra));
const decide = (b, kind, id, action, extra = {}) => b.agent.put(`/api/${kind}/${id}/${action}`)
  .set('x-csrf-token', b.csrf).send(decisionBody(extra));
function submit(b, { id = randomUUID(), body = { method: 'visa', amount: '15.00', note: 'Receipt claim' },
  buffer = image, type = 'image/png', file = true, name = 'receipt', csrf = b.csrf } = {}) {
  let r = b.agent.post('/api/payments').set('x-submission-id', id);
  if (csrf !== undefined) r = r.set('x-csrf-token', csrf);
  for (const [k,v] of Object.entries(body)) r = r.field(k, v);
  if (file) r = r.attach(name, buffer, { filename: 'receipt.png', contentType: type });
  return r;
}
async function untouched() {
  expect(await balance()).toBe('10000'); expect(await count('orders')).toBe('0');
  expect(await count('payments')).toBe('0'); expect(await count('financial_operations')).toBe('0');
}
function publicOnly(body) {
  expect(JSON.stringify(body)).not.toMatch(/fulfillmentSnapshot|fulfillment_target|receipt_public_id|receipt_format|receipt_delivery_type|private_payment_receipts|Player_123|password_hash|token_version/);
  for (const value of body.items || [body]) {
    for (const key of ['receipt', 'receiptPublicId', 'fulfillmentSnapshot', 'principal', 'token', 'tokenVersion']) expect(value).not.toHaveProperty(key);
  }
}
function modify(filename, mutate) {
  const target = path.join(directory, filename), data = JSON.parse(fs.readFileSync(target, 'utf8'));
  mutate(data); fs.writeFileSync(target, JSON.stringify(data)); fixture.load();
}
// Wrap REAL queries/COMMITs. No fabricated rows or mocked authentication.
function poolProvider() {
  return { query: (...args) => {
    const sql = typeof args[0] === 'string' ? args[0] : args[0].text;
    if (fault?.read && sql.startsWith('WITH actor AS')) throw new Error('private SQL/target/password');
    return db.pool.query(...args);
  }, async connect() {
    if (fault?.lost && fault.blockResolution) throw new Error('private recovery connection target');
    const c = await db.pool.connect(); let matched = false;
    return { connection: c.connection, on: (...args) => c.on(...args), removeListener: (...args) => c.removeListener(...args),
      release: broken => c.release(broken), async query(input) {
        const sql = typeof input === 'string' ? input : input.text;
        if (sql.includes('UPDATE public.express_sessions')) {
          saveAttempts++;
          if (preventSave) throw new Error('private unrelated session CAS failure');
        }
        if (sql.includes('/* financial:accounts */') && beforeLocks) { const hook = beforeLocks; beforeLocks = null; await hook(); }
        if (/INSERT INTO public\.(orders|financial_operations)/.test(sql) || /\/\* financial:decision \*\//.test(sql)) financialWrites++;
        if (fault && !fault.lost && fault.match && sql.includes(fault.match)) matched = true;
        if (matched && sql === 'COMMIT' && fault.disconnectBeforeCommit) {
          fault.lost = true;
          c.connection.stream.destroy(); // Actual network loss: server rolls back, caller lacks acknowledgement.
        }
        const result = await c.query(input);
        if (matched && sql === 'COMMIT') {
          fault.lost = true;
          if (fault.afterCommit) await fault.afterCommit();
          throw new Error('private lost COMMIT acknowledgement/receipt/target');
        }
        return result;
      } };
  } };
}
beforeAll(async () => {
  db = await H.open();
  image = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#abcdef' } }).png().toBuffer();
});
beforeEach(async () => {
  await db.reset(); await db.seed();
  fault = null; beforeLocks = null; preventSave = false; saveAttempts = 0; financialWrites = 0;
  providerStep = null; providerFailure = false; providerPatch = {}; uploadBuffers = [];
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'top4-financial-http-'));
  for (const filename of Object.keys(catalog.FILES)) fs.copyFileSync(path.join(__dirname, '../data', filename), path.join(directory, filename));
  fixture = catalog.createCatalogService({ directory }); fixture.load();
  cloud.uploader.destroy.mockReset().mockResolvedValue({ result: 'ok' });
  cloud.uploader.upload_stream.mockReset().mockImplementation((options, callback) => new Writable({
    write(chunk, enc, done) { uploadBuffers.push(Buffer.from(chunk)); done(); },
    final(done) {
      Promise.resolve().then(async () => {
        if (providerStep) await providerStep();
        if (providerFailure) callback(new Error('private external receipt credentials'));
        else callback(null, { public_id: options.public_id, format: 'jpg', type: 'authenticated', resource_type: 'image', ...providerPatch });
        done();
      }).catch(done);
    }
  }));
  runtime = createApplication({ poolProvider, staticFiles: false,
    authOptions: { lookupSecret: H.LOOKUP_SECRET, jwtSecret: H.JWT_SECRET, sessionSecret: SECRET,
      cursorSecret: H.CURSOR_SECRET, secureCookies: false,
      googleConfig: { clientId: 'financial-test.apps.googleusercontent.com', clientSecret: 'test-google-secret', callbackUrl: 'http://localhost/api/auth/google/callback' } },
    financialOptions: { catalogService: fixture } });
  app = runtime.app; await runtime.initialize();
});
afterEach(async () => { fault = null; preventSave = false; await runtime?.close(); if (directory) fs.rmSync(directory, { recursive: true, force: true }); });
afterAll(async () => { await db?.close(); });

test('runtime imports PostgreSQL financial entries, never legacy financial or Mongo modules', () => {
  expect(runtime.server.listening).toBe(false);
  const files = Object.keys(require.cache);
  for (const name of ['/models/', '/mongoose/', '/services/financialService.js', '/tests/helpers/legacyOrdersRoutes.js', '/tests/helpers/legacyPaymentsRoutes.js', '/utils/notifications.js', '/jobs/scheduler.js']) expect(files.some(f => f.includes(name))).toBe(false);
  for (const name of ['/routes/orders.js', '/routes/payments.js']) expect(files.some(f => f.endsWith(name))).toBe(true);
});
test('purchase is 201, exact committed receipt; replay is 200 with one debit', async () => {
  const b = await logged(), first = await buy(b).expect(201), replay = await buy(b).expect(200);
  expect(first.body).toMatchObject({ userId: H.OWNER, status: 'pending', chargeCents: '99', charge: '0.99', balanceCents: '9901', balance: '99.01', quantity: 60, replayed: false });
  expect(replay.body).toEqual({ ...first.body, replayed: true }); publicOnly(first.body);
  expect(await balance()).toBe('9901'); expect(await count('orders')).toBe('1'); expect(await count('financial_operations')).toBe('1');
  const o = await row('orders', 'order_id', first.body.orderId), [j] = await operations();
  expect(j).toMatchObject({ id: first.body.operationId, user_id: H.OWNER, source_id: o.id, effect: 'debit', before_cents: '10000', after_cents: '9901', delta_cents: '-99' });
  expect(o.debit_operation_id).toBe(j.id);
});
test('insufficient funds is 409 without partial writes', async () => {
  const b = await logged();
  expect((await buy(b, { category: 'apps', productId: 1, quantity: 195000, packageIndex: undefined, fulfillmentTarget: { accountId: 'Acct_123' } }).expect(409)).body.code).toBe('INSUFFICIENT_FUNDS');
  await untouched();
});
test('concurrent different-key purchases cannot overspend', async () => {
  const b = await logged(), body = key => ({ category: 'apps', productId: 1, quantity: 190000, packageIndex: undefined, idempotencyKey: key, fulfillmentTarget: { accountId: 'Acct_123' } });
  const results = await Promise.all([buy(b, body('spend-a')), buy(b, body('spend-b'))]);
  expect(results.map(r => r.status).sort()).toEqual([201,409]); expect(results.find(r => r.status === 409).body.code).toBe('INSUFFICIENT_FUNDS');
  expect(await balance()).toBe('100'); expect(await count('orders')).toBe('1'); expect(await count('financial_operations')).toBe('1');
});
test('concurrent same-key purchases return one receipt and no parent CAS race', async () => {
  const b = await logged(), results = await Promise.all([buy(b), buy(b), buy(b)]);
  expect(results.map(r => r.status).sort()).toEqual([200,200,201]);
  expect(new Set(results.map(r => r.body.orderId)).size).toBe(1); expect(await balance()).toBe('9901'); expect(await count('financial_operations')).toBe('1');
});
test.each([{ fulfillmentTarget: { playerId: 'Different_123' } }, { packageIndex: 1 }])('changed purchase payload under same key conflicts: %p', async extra => {
  const b = await logged(); await buy(b).expect(201); expect((await buy(b, extra).expect(409)).body.code).toBe('IDEMPOTENCY_CONFLICT');
  expect(await count('orders')).toBe('1'); expect(await balance()).toBe('9901');
});
test.each([['apps',1,1900,'accountId','Acct_123','99'], ['cryptos',3,1000,'walletAddress',bitcoin,'549'],
  ['cryptos',4,1000,'walletAddress',tron,'599'], ['cryptos',5,1000,'walletAddress',evm,'449'],
  ['cryptos',7,1000,'accountId','P1234567','599'], ['cryptos',9,1000,'phone','+905551234567','449']])
('HTTP %s product %s snapshots the authoritative %s schema', async (category, productId, quantity, schema, value, cents) => {
  const b = await logged(), result = await buy(b, { category, productId, quantity, packageIndex: undefined, fulfillmentTarget: { [schema]: value } }).expect(201);
  expect(result.body.chargeCents).toBe(cents); const o = await row('orders', 'order_id', result.body.orderId);
  expect(o.fulfillment_schema).toBe(schema); expect(o.fulfillment_validation_version).toBe(1);
  const view = await b.agent.get(`/api/orders/${o.order_id}/fulfillment`).expect(200);
  expect(view.body.fulfillmentSnapshot.schema).toBe(schema);
});
test.each([undefined, {}, null, [], { accountId: 'Acct_123' }, { playerId: 123 }, { playerId: { value: 'abc' } }, { playerId: 'Player_123', userId: H.OTHER }])('strict fulfillment rejects %p before any write', async fulfillmentTarget => {
  const b = await logged(); await buy(b, { fulfillmentTarget }).expect(400); await untouched();
});
test.each(['<script>x</script>', 'abc\n', 'abc\u0000', 'abc\u007f', 'a'.repeat(33), 'ab', 'a b', 'abc&x', 'abc"x'])('invalid target is never echoed: %p', async value => {
  const b = await logged(), r = await buy(b, { fulfillmentTarget: { playerId: value } }).expect(400);
  expect(r.body.code).toBe('INVALID_FULFILLMENT_TARGET'); expect(JSON.stringify(r.body)).not.toContain(value); await untouched();
});
test.each(['userId','actorId','principal','tokenVersion','amount','price','balanceCents','status','fulfillmentSnapshot','network'])('purchase rejects client authority field %s', async key => {
  const b = await logged(); await buy(b, { [key]: H.OTHER }).expect(400); await untouched();
});
test.each([['apps.json','email'],['payments.json','walletAddress'],['mobile-payments.json','accountId'],['cryptos.json','phone']])('catalog contradiction %s fails closed over HTTP', async (filename, schema) => {
  modify(filename, root => { root.products[0].fulfillmentSchema = schema; });
  const b = await logged(), category = catalog.FILES[filename].category;
  expect((await buy(b, category === 'apps' ? { category, quantity: 1900, packageIndex: undefined, fulfillmentTarget: { accountId: 'Acct_123' } }
    : { category, productId: 4, quantity: 1000, packageIndex: undefined, fulfillmentTarget: { walletAddress: tron } }).expect(503)).body.code).toBe('FULFILLMENT_CONFIGURATION_INVALID'); await untouched();
});
test.each(['missing','malformed','duplicate','unsupported-network'])('catalog %s fails closed before debit', async mode => {
  if (mode === 'missing') fs.unlinkSync(path.join(directory, 'payments.json'));
  if (mode === 'malformed') fs.writeFileSync(path.join(directory, 'payments.json'), '{private malformed target');
  if (mode === 'duplicate') modify('payments.json', root => { root.products[0].id = 4; });
  if (mode === 'unsupported-network') modify('cryptos.json', root => { root.products[0].fulfillmentNetwork = 'unreviewed-network'; });
  fixture.load(); const b = await logged();
  const r = await buy(b, { category: 'cryptos', productId: 4, quantity: 1000, packageIndex: undefined, fulfillmentTarget: { walletAddress: tron } }).expect(503);
  expect(['FULFILLMENT_CONFIGURATION_INVALID','UNSUPPORTED_NETWORK']).toContain(r.body.code); await untouched();
});
test('no-target product accepts no snapshot and rejects unsolicited target', async () => {
  modify('games.json', root => { root.products[0].requiresFulfillmentTarget = false; root.products[0].fulfillmentSchema = null; });
  const b = await logged(); await buy(b).expect(400); await untouched();
  const r = await buy(b, { fulfillmentTarget: undefined }).expect(201);
  expect((await b.agent.get(`/api/orders/${r.body.orderId}/fulfillment`).expect(200)).body.fulfillmentSnapshot).toBeNull();
});
test('completion is nonmonetary, replayable, immutable, and keeps original purchase receipt', async () => {
  const owner = await logged(), admin = await logged('Admin_A'), bought = await buy(owner).expect(201);
  const before = await row('orders', 'order_id', bought.body.orderId);
  const completed = await decide(admin, 'orders', before.order_id, 'accept').expect(200);
  expect(completed.body).toMatchObject({ status: 'completed', replayed: false });
  for (const key of ['balanceCents','operationId','chargeCents']) expect(completed.body).not.toHaveProperty(key);
  expect((await decide(admin, 'orders', before.order_id, 'accept').expect(200)).body).toEqual({ ...completed.body, replayed: true });
  const after = await row('orders', 'order_id', before.order_id);
  expect(after.fulfillment_target).toBe(before.fulfillment_target); expect(after.refund_operation_id).toBeNull();
  expect(await balance()).toBe('9901'); expect(await count('financial_operations')).toBe('1');
  const replay = await buy(owner).expect(200); expect(replay.body).toEqual({ ...bought.body, replayed: true });
});
test('cancellation fully refunds once, independent decision conflicts, immutable target survives', async () => {
  const owner = await logged(), admin = await logged('Admin_A'), bought = await buy(owner).expect(201), id = bought.body.orderId;
  const r = await decide(admin, 'orders', id, 'reject').expect(200);
  expect(r.body).toMatchObject({ status: 'cancelled', chargeCents: '99', balanceCents: '10000', replayed: false });
  expect((await decide(admin, 'orders', id, 'reject').expect(200)).body).toEqual({ ...r.body, replayed: true });
  expect((await decide(admin, 'orders', id, 'reject', { idempotencyKey: 'another' }).expect(409)).body.code).toBe('ORDER_ALREADY_DECIDED');
  expect((await decide(admin, 'orders', id, 'accept', { idempotencyKey: 'complete-other' }).expect(409)).body.code).toBe('ORDER_ALREADY_DECIDED');
  const o = await row('orders', 'order_id', id), refund = (await operations()).find(j => j.effect === 'refund');
  expect(o).toMatchObject({ refund_amount_cents: '99', refund_operation_id: refund.id, fulfillment_target: 'Player_123' });
  expect(refund).toMatchObject({ source_id: o.id, delta_cents: '99' }); expect(await count('financial_operations')).toBe('2'); expect(await balance()).toBe('10000');
});
test('competing completion/cancellation permits one decision and at most one refund', async () => {
  const owner = await logged(), admin = await logged('Admin_A'), bought = await buy(owner).expect(201);
  const results = await Promise.all([decide(admin, 'orders', bought.body.orderId, 'accept', { idempotencyKey: 'complete' }), decide(admin, 'orders', bought.body.orderId, 'reject', { idempotencyKey: 'cancel' })]);
  expect(results.map(r => r.status).sort()).toEqual([200,409]);
  const o = await row('orders', 'order_id', bought.body.orderId);
  expect(await balance()).toBe(o.status === 'cancelled' ? '10000' : '9901'); expect(await count('financial_operations')).toBe(o.status === 'cancelled' ? '2' : '1');
});
test.each(['accept','reject'])('order %s is admin-only before mutation', async action => {
  const owner = await logged(), r = await buy(owner).expect(201); await decide(owner, 'orders', r.body.orderId, action).expect(403);
  expect((await row('orders','order_id',r.body.orderId)).status).toBe('pending'); expect(await balance()).toBe('9901');
});
test.each(['orders','payments'])('%s decision rechecks current admin under locks', async kind => {
  const owner = await logged(), admin = await logged('Admin_A');
  const created = kind === 'orders' ? await buy(owner).expect(201) : await submit(owner).expect(201);
  beforeLocks = () => db.pool.query("UPDATE public.users SET role='user' WHERE id=$1", [H.ADMIN]);
  const id = created.body[kind === 'orders' ? 'orderId' : 'paymentId'];
  expect((await decide(admin, kind, id, 'accept', kind === 'payments' ? { approvedAmount: '15.00' } : {}).expect(403)).body.code).toBe('FINANCIAL_FORBIDDEN');
  expect((await row(kind, kind === 'orders' ? 'order_id' : 'payment_id', id)).status).toBe('pending');
});

test('actual multipart/Sharp/private provider submission is pending with no settlement or credit', async () => {
  const b = await logged(), id = randomUUID(), r = await submit(b, { id }).expect(201);
  expect(r.body).toEqual({ paymentId: `pay-${id}`, status: 'pending' });
  const p = await row('payments','payment_id',r.body.paymentId);
  expect(p).toMatchObject({ user_id: H.OWNER, submission_version: 1, currency: 'USD', claimed_amount_minor: '1500', amount_cents: null, status: 'pending', receipt_format: 'jpg', receipt_delivery_type: 'authenticated' });
  expect(p.receipt_public_id).toMatch(/^private_payment_receipts\/[a-f0-9-]{36}$/);
  expect(cloud.uploader.upload_stream).toHaveBeenCalledWith(expect.objectContaining({ public_id: p.receipt_public_id, type: 'authenticated', overwrite: false, format: 'jpg' }), expect.any(Function));
  const metadata = await sharp(Buffer.concat(uploadBuffers)).metadata(); expect(metadata.format).toBe('jpeg'); expect(metadata.width).toBeLessThanOrEqual(800); expect(metadata.height).toBeLessThanOrEqual(800);
  expect(await balance()).toBe('10000'); expect(await count('financial_operations')).toBe('0');
  publicOnly((await b.agent.get(`/api/payments/${r.body.paymentId}`).expect(200)).body);
  expect(cloud.uploader.destroy).not.toHaveBeenCalled();
});
test('submission duplicate is 409, never payload replay or second upload', async () => {
  const b = await logged(), id = randomUUID(); await submit(b, { id }).expect(201);
  const r = await submit(b, { id, body: { method: 'visa', amount: '16.00' } }).expect(409);
  expect(r.body.code).toBe('PAYMENT_SUBMISSION_EXISTS'); expect(cloud.uploader.upload_stream).toHaveBeenCalledTimes(1);
  expect(await count('payments')).toBe('1'); expect(await balance()).toBe('10000');
});
test.each([undefined, 'bad', 'A'.repeat(36), '00000000-0000-4000-8000-000000000099\n', `${H.OWNER},${H.OTHER}`])('submission rejects invalid recovery header %p before upload', async id => {
  const b = await logged(); let r = b.agent.post('/api/payments').set('x-csrf-token', b.csrf);
  // Newline cannot be transported by Node; use a trailing space for that wire case.
  if (id !== undefined) r = r.set('x-submission-id', id.replace('\n',' x'));
  expect((await r.attach('receipt', image, { filename: 'r.png', contentType: 'image/png' }).expect(400)).body.code).toBe('INVALID_SUBMISSION_ID');
  expect(cloud.uploader.upload_stream).not.toHaveBeenCalled(); await untouched();
});
test.each(['userId','currency','amountCents','approvedAmount','status','receipt','submissionVersion','idempotencyKey','principal'])('multipart rejects forbidden field %s before storage', async key => {
  const b = await logged(); await submit(b, { body: { method: 'visa', amount: '15.00', [key]: 'untrusted' } }).expect(400);
  expect(cloud.uploader.upload_stream).not.toHaveBeenCalled(); await untouched();
});
test.each(['01.00','1e2','+15','15.001',' 15','-0','NaN','9.99','100.01','9007199254740992'])('claimed amount %s is rejected exactly', async amount => {
  const b = await logged(); expect((await submit(b, { body: { method: 'visa', amount } }).expect(400)).body.code).toBe('INVALID_PAYMENT_AMOUNT'); await untouched();
});
test.each([['visa','10.00','USD','1000'],['shamcashdol','10','USD','1000'],['shamcash','10000','SYP','1000000'],['syriatel','5000','SYP','500000'],['mtn','5000','SYP','500000'],['bank','50','USD','5000'],['webmoney','20','USD','2000'],['usdt','10','USDT','1000']])('method %s uses server currency and exact minor units', async (method, amount, currency, minor) => {
  const b = await logged(), r = await submit(b, { body: { method, amount } }).expect(201);
  expect(await row('payments','payment_id',r.body.paymentId)).toMatchObject({ currency, claimed_amount_minor: minor, amount_cents: null }); expect(await balance()).toBe('10000');
});
test.each([{ method: 'unknown', amount: '15' }, { method: 'visa', amount: '15', note: '<unsafe>' }, { method: 'visa', amount: '15', note: 'a'.repeat(501) }])('invalid claim metadata is rejected: %p', async body => {
  const b = await logged(); await submit(b, { body }).expect(400); expect(cloud.uploader.upload_stream).not.toHaveBeenCalled(); await untouched();
});
test.each(['missing','wrong-field','wrong-mime','invalid-content','oversized','second-file'])('invalid receipt %s cannot create a payment', async mode => {
  const b = await logged(); let r;
  if (mode === 'second-file') r = submit(b).attach('receipt', image, { filename: 'second.png', contentType: 'image/png' });
  else r = submit(b, { file: mode !== 'missing', name: mode === 'wrong-field' ? 'avatar' : 'receipt',
    type: mode === 'wrong-mime' ? 'text/plain' : 'image/png', buffer: mode === 'invalid-content' ? Buffer.from('private invalid content') : mode === 'oversized' ? Buffer.alloc(5 * 1024 * 1024 + 1) : image });
  const result = await r;
  expect(result.status).toBe(mode === 'oversized' ? 413 : ['missing','invalid-content'].includes(mode) ? 503 : 400);
  expect(cloud.uploader.upload_stream).not.toHaveBeenCalled(); await untouched();
});
test('provider rejection cleans only the generated owned ID and exposes no raw error', async () => {
  const b = await logged(); providerFailure = true;
  const r = await submit(b).expect(503); expect(r.body.code).toBe('RECEIPT_STORAGE_UNAVAILABLE'); expect(JSON.stringify(r.body)).not.toContain('private external');
  expect(cloud.uploader.destroy).toHaveBeenCalledWith(expect.stringMatching(/^private_payment_receipts\//), expect.objectContaining({ type: 'authenticated' })); await untouched();
});
test('foreign provider metadata is rejected; foreign asset is never deleted', async () => {
  const b = await logged(); providerPatch = { public_id: 'someone-elses-asset' }; await submit(b).expect(503);
  expect(cloud.uploader.destroy).toHaveBeenCalledWith(expect.stringMatching(/^private_payment_receipts\//), expect.any(Object));
  expect(cloud.uploader.destroy).not.toHaveBeenCalledWith('someone-elses-asset', expect.anything()); await untouched();
});
test.each(['inactive','token-version','session-revocation'])('fresh INSERT guard rejects %s changed during upload and cleans owned receipt', async mode => {
  const b = await logged(); providerStep = async () => {
    if (mode === 'inactive') await db.pool.query("UPDATE public.users SET account_status='suspended' WHERE id=$1", [H.OWNER]);
    if (mode === 'token-version') await db.pool.query('UPDATE public.users SET token_version=token_version+1 WHERE id=$1', [H.OWNER]);
    if (mode === 'session-revocation') await db.pool.query("UPDATE public.application_sessions SET revoked_at=statement_timestamp(),revocation_reason='administrative_revocation' WHERE user_id=$1", [H.OWNER]);
  };
  const r = await submit(b); expect([401,403]).toContain(r.status); expect(cloud.uploader.destroy).toHaveBeenCalledTimes(1);
  expect(await count('payments')).toBe('0'); expect(await count('financial_operations')).toBe('0'); expect(await balance()).toBe('10000');
});
test('uncertain submission retains receipt; owner-only read recovery never reinserts or reuploads', async () => {
  const b = await logged(), other = await logged('Other_U'), admin = await logged('Admin_A'), id = randomUUID();
  fault = { match: 'INSERT INTO public.payments' };
  const r = await submit(b, { id }).expect(503);
  expect(r.body).toEqual({ success: false, code: 'PAYMENT_SUBMISSION_OUTCOME_UNKNOWN', error: 'PAYMENT_SUBMISSION_OUTCOME_UNKNOWN', paymentId: `pay-${id}`, retrySubmission: false });
  expect(fault.lost).toBe(true); fault = null; expect(cloud.uploader.destroy).not.toHaveBeenCalled();
  const found = await b.agent.get(`/api/payments/submissions/${id}`).expect(200); expect(found.body.outcome).toBe('committed'); publicOnly(found.body.payment);
  for (const person of [other,admin]) expect((await person.agent.get(`/api/payments/submissions/${id}`).expect(200)).body).toEqual({ outcome: 'unresolved', paymentId: `pay-${id}`, retrySubmission: false });
  await submit(b, { id }).expect(409); expect(cloud.uploader.upload_stream).toHaveBeenCalledTimes(1); expect(await count('payments')).toBe('1'); expect(await balance()).toBe('10000');
});
test('missing submission recovery stays unresolved and creates nothing', async () => {
  const b = await logged(), id = randomUUID();
  expect((await b.agent.get(`/api/payments/submissions/${id}`).expect(200)).body).toEqual({ outcome: 'unresolved', paymentId: `pay-${id}`, retrySubmission: false });
  await b.agent.get('/api/payments/submissions/not-a-uuid').expect(400); await untouched();
});
test('approval explicitly credits USD atomically once, replay succeeds, second key conflicts', async () => {
  const owner = await logged(), admin = await logged('Admin_A'), p = await submit(owner, { body: { method: 'shamcash', amount: '10000' } }).expect(201), id = p.body.paymentId;
  const first = await decide(admin,'payments',id,'accept',{ approvedAmount: '15.00' }).expect(200);
  expect(first.body).toMatchObject({ status: 'completed', currency: 'USD', amountCents: '1500', balanceCents: '11500', replayed: false });
  expect((await decide(admin,'payments',id,'accept',{ approvedAmount: '15.00' }).expect(200)).body).toEqual({ ...first.body, replayed: true });
  expect((await decide(admin,'payments',id,'accept',{ approvedAmount: '15.00', idempotencyKey: 'other-approval' }).expect(409)).body.code).toBe('PAYMENT_ALREADY_DECIDED');
  const payment = await row('payments','payment_id',id), [j] = await operations();
  expect(payment).toMatchObject({ currency: 'SYP', claimed_amount_minor: '1000000', amount_cents: '1500', decision_operation_id: j.id });
  expect(j).toMatchObject({ id: first.body.operationId, source_id: payment.id, effect: 'credit', delta_cents: '1500', after_cents: '11500' });
  expect(await count('financial_operations')).toBe('1'); expect(await balance()).toBe('11500');
});
test('payment rejection is nonmonetary and replayable; later approval conflicts', async () => {
  const owner = await logged(), admin = await logged('Admin_A'), p = await submit(owner).expect(201), id = p.body.paymentId;
  const rejected = await decide(admin,'payments',id,'reject').expect(200); expect(rejected.body.status).toBe('cancelled');
  for (const key of ['operationId','balanceCents','amountCents']) expect(rejected.body).not.toHaveProperty(key);
  expect((await decide(admin,'payments',id,'reject').expect(200)).body).toEqual({ ...rejected.body, replayed: true });
  expect((await decide(admin,'payments',id,'accept',{ approvedAmount: '15.00', idempotencyKey: 'approve-later' }).expect(409)).body.code).toBe('PAYMENT_ALREADY_DECIDED');
  expect(await count('financial_operations')).toBe('0'); expect(await balance()).toBe('10000');
});
test.each(['double-approval','approve-vs-reject'])('concurrent payment %s permits one decision', async mode => {
  const owner = await logged(), admin = await logged('Admin_A'), p = await submit(owner).expect(201);
  const results = await Promise.all([decide(admin,'payments',p.body.paymentId,'accept',{ approvedAmount: '15.00', idempotencyKey: 'a' }),
    decide(admin,'payments',p.body.paymentId,mode === 'double-approval' ? 'accept' : 'reject',{ ...(mode === 'double-approval' ? { approvedAmount: '15.00' } : {}), idempotencyKey: 'b' })]);
  expect(results.map(r => r.status).sort()).toEqual([200,409]); expect(results.find(r => r.status === 409).body.code).toBe('PAYMENT_ALREADY_DECIDED');
  const payment = await row('payments','payment_id',p.body.paymentId);
  expect(await balance()).toBe(payment.status === 'completed' ? '11500' : '10000'); expect(await count('financial_operations')).toBe(payment.status === 'completed' ? '1' : '0');
});
test.each(['accept','reject'])('payment %s is admin-only', async action => {
  const b = await logged(), p = await submit(b).expect(201); await decide(b,'payments',p.body.paymentId,action, action === 'accept' ? { approvedAmount: '15.00' } : {}).expect(403);
  expect((await row('payments','payment_id',p.body.paymentId)).status).toBe('pending'); expect(await balance()).toBe('10000'); expect(await count('financial_operations')).toBe('0');
});
test.each([15,0,'0','-1','+15','01.00','15.001','1e2',' 15','NaN','9007199254740992'])('approval rejects ambiguous/noncanonical decimal %p', async approvedAmount => {
  const owner = await logged(), admin = await logged('Admin_A'), p = await submit(owner).expect(201);
  await decide(admin,'payments',p.body.paymentId,'accept',{ approvedAmount }).expect(400); expect(await balance()).toBe('10000'); expect(await count('financial_operations')).toBe('0');
});
test.each([{ approvedAmount: '16.00' }, { reason: 'Different review' }])('changed approval fingerprint conflicts: %p', async extra => {
  const owner = await logged(), admin = await logged('Admin_A'), p = await submit(owner).expect(201);
  await decide(admin,'payments',p.body.paymentId,'accept',{ approvedAmount: '15.00' }).expect(200);
  expect((await decide(admin,'payments',p.body.paymentId,'accept',{ approvedAmount: '15.00', ...extra }).expect(409)).body.code).toBe('IDEMPOTENCY_CONFLICT'); expect(await balance()).toBe('11500');
});

test.each(['orders','payments'])('%s owner history/detail/summary are SQL-scoped; admin uses explicit admin endpoints', async kind => {
  const owner = await logged(), other = await logged('Other_U'), admin = await logged('Admin_A');
  const created = kind === 'orders' ? await buy(owner).expect(201) : await submit(owner).expect(201);
  const foreign = kind === 'orders' ? await buy(other).expect(201) : await submit(other).expect(201);
  const key = kind === 'orders' ? 'orderId' : 'paymentId', id = created.body[key];
  const history = await owner.agent.get(`/api/${kind}`).expect(200); expect(history.body.items).toHaveLength(1); expect(history.body.items[0][key]).toBe(id); publicOnly(history.body);
  expect((await other.agent.get(`/api/${kind}`).expect(200)).body.items[0][key]).toBe(foreign.body[key]);
  for (const person of [other,admin]) await person.agent.get(`/api/${kind}/${id}`).expect(404);
  await other.agent.get(`/api/${kind}/missing-public-id`).expect(404);
  await owner.agent.get(`/api/${kind}?userId=${H.OTHER}`).expect(400);
  const mine = await owner.agent.get(`/api/${kind}/summary`).expect(200); expect(mine.body.counts.pending).toBe('1');
  const all = await admin.agent.get(`/api/${kind}/all`).expect(200); expect(all.body.items).toHaveLength(2); publicOnly(all.body);
  expect((await admin.agent.get(`/api/${kind}/admin`).expect(200)).body.items).toHaveLength(2);
  expect((await admin.agent.get(`/api/${kind}/all?userId=${H.OWNER}`).expect(200)).body.items).toHaveLength(1);
  expect((await admin.agent.get(`/api/${kind}/summary/all`).expect(200)).body.counts.pending).toBe('2');
  expect((await admin.agent.get(`/api/${kind}/summary/all?userId=${H.OWNER}`).expect(200)).body.counts.pending).toBe('1');
  publicOnly((await admin.agent.get(`/api/${kind}/admin/${id}`).expect(200)).body);
});
test.each(['orders','payments'])('%s admin reads reject ordinary users and ignore JWT role claims', async kind => {
  const b = await logged();
  for (const suffix of ['/all','/admin','/summary/all','/admin/missing-id']) await b.agent.get(`/api/${kind}${suffix}`).expect(403);
  const admin = await logged('Admin_A'); await db.pool.query("UPDATE public.users SET role='user' WHERE id=$1", [H.ADMIN]);
  for (const suffix of ['/all','/admin','/summary/all']) await admin.agent.get(`/api/${kind}${suffix}`).expect(403);
});
test('owner/admin fulfillment views authorize independently of public details', async () => {
  const owner = await logged(), other = await logged('Other_U'), admin = await logged('Admin_A'), r = await buy(owner).expect(201), id = r.body.orderId;
  const expected = { schema: 'playerId', validationVersion: 1, network: null, target: { playerId: 'Player_123' } };
  expect((await owner.agent.get(`/api/orders/${id}/fulfillment`).expect(200)).body.fulfillmentSnapshot).toEqual(expected);
  await other.agent.get(`/api/orders/${id}/fulfillment`).expect(404); await admin.agent.get(`/api/orders/${id}/fulfillment`).expect(404);
  await owner.agent.get(`/api/orders/admin/${id}/fulfillment`).expect(403);
  expect((await admin.agent.get(`/api/orders/admin/${id}/fulfillment`).expect(200)).body.fulfillmentSnapshot).toEqual(expected);
  publicOnly((await owner.agent.get(`/api/orders/${id}`).expect(200)).body);
});
test('private receipt link is owner/current-admin only, signed and short lived', async () => {
  const owner = await logged(), other = await logged('Other_U'), admin = await logged('Admin_A'), r = await submit(owner).expect(201), id = r.body.paymentId;
  await other.agent.get(`/api/payments/${id}/receipt`).expect(404);
  for (const b of [owner,admin]) {
    const link = await b.agent.get(`/api/payments/${id}/receipt`).expect(200);
    expect(link.headers['cache-control']).toBe('no-store'); expect(link.headers['referrer-policy']).toBe('no-referrer');
    const url = new URL(link.body.url); expect(url.protocol).toBe('https:'); expect(url.searchParams.get('signature')).toBeTruthy();
    expect(url.searchParams.get('type')).toBe('authenticated'); expect(link.body.expiresAt - Date.now()).toBeGreaterThan(50000); expect(link.body.expiresAt - Date.now()).toBeLessThanOrEqual(60000);
    expect(Object.keys(link.body).sort()).toEqual(['expiresAt','url']);
  }
  publicOnly((await owner.agent.get('/api/payments').expect(200)).body);
  await db.pool.query("UPDATE public.users SET role='user' WHERE id=$1", [H.ADMIN]); await admin.agent.get(`/api/payments/${id}/receipt`).expect(404);
});
test.each(['orders','payments'])('%s cursor pagination is bounded, complete and filter-bound', async kind => {
  const owner = await logged(), other = await logged('Other_U'), admin = await logged('Admin_A');
  for (let i=0;i<3;i++) { if (kind === 'orders') await buy(owner,{ idempotencyKey: `page-${i}` }).expect(201); else await submit(owner).expect(201); }
  const first = await owner.agent.get(`/api/${kind}?limit=1`).expect(200); expect(first.body.items).toHaveLength(1); expect(first.body.nextBefore).toEqual(expect.any(String));
  const next = await owner.agent.get(`/api/${kind}`).query({ limit: '1', before: first.body.nextBefore }).expect(200);
  const last = await owner.agent.get(`/api/${kind}`).query({ limit: '1', before: next.body.nextBefore }).expect(200);
  expect(last.body.nextBefore).toBeNull(); expect(new Set([...first.body.items,...next.body.items,...last.body.items].map(r => r.id)).size).toBe(3);
  for (const [b, target, extra] of [[other,kind,{}],[admin,kind,{ path: '/all' }],[owner,kind,{ status: 'pending' }],[owner,kind === 'orders' ? 'payments' : 'orders',{}]]) {
    await b.agent.get(`/api/${target}${extra.path || ''}`).query({ before: first.body.nextBefore, ...(extra.status ? { status: extra.status } : {}) }).expect(400);
  }
  await owner.agent.get(`/api/${kind}`).query({ before: first.body.nextBefore.slice(0,-3)+'abc' }).expect(400);
  const adminPage = await admin.agent.get(`/api/${kind}/all`).query({ limit: '1', userId: H.OWNER }).expect(200);
  await admin.agent.get(`/api/${kind}/all`).query({ before: adminPage.body.nextBefore, userId: H.OTHER }).expect(400);
});
test.each(['0','101','-1','1.0','01','1e2','garbage'])('list rejects noncanonical limit %s', async limit => {
  const b = await logged(); for (const kind of ['orders','payments']) await b.agent.get(`/api/${kind}`).query({ limit }).expect(400); await untouched();
});
test.each(['orders','payments'])('%s rejects malformed filters, summary pagination and pending queue override', async kind => {
  const owner = await logged(), admin = await logged('Admin_A');
  await owner.agent.get(`/api/${kind}?status=wrong`).expect(400);
  await owner.agent.get(`/api/${kind}?limit=1&limit=2`).expect(400);
  await owner.agent.get(`/api/${kind}/summary?limit=1`).expect(400);
  await admin.agent.get(`/api/${kind}/admin?status=completed`).expect(400);
  await admin.agent.get(`/api/${kind}/all?userId=not-a-uuid`).expect(400);
  await owner.agent.get(`/api/${kind}/bad%20identifier`).expect(400); await untouched();
});
test('summaries and admin queues reflect exact decided effects without mixing currencies', async () => {
  const owner = await logged(), admin = await logged('Admin_A');
  const order = await buy(owner).expect(201); await decide(admin,'orders',order.body.orderId,'reject').expect(200);
  const p = await submit(owner,{ body: { method: 'shamcash', amount: '10000' } }).expect(201);
  await decide(admin,'payments',p.body.paymentId,'accept',{ approvedAmount: '15.00' }).expect(200);
  await submit(owner,{ body: { method: 'usdt', amount: '10' } }).expect(201);
  expect((await owner.agent.get('/api/orders/summary').expect(200)).body).toEqual({ counts: { pending: '0', completed: '0', cancelled: '1' }, chargedCents: '99', refundedCents: '99', netChargeCents: '0' });
  expect((await owner.agent.get('/api/payments/summary').expect(200)).body).toEqual({ counts: { pending: '1', completed: '1', cancelled: '0' }, approvedUsdCents: '1500', claimedMinorByCurrency: { USD: '0', SYP: '1000000', USDT: '1000' } });
  expect((await admin.agent.get('/api/orders/admin').expect(200)).body.items).toHaveLength(0);
  expect((await admin.agent.get('/api/payments/admin').expect(200)).body.items).toHaveLength(1);
});
test.each(['orders','payments'])('%s unsafe requests need exact parent CSRF; header credentials alone cannot mutate', async kind => {
  const b = await logged(), target = kind === 'orders' ? '/api/orders/purchase' : '/api/payments';
  for (const csrf of [undefined,'wrong']) {
    let r = b.agent.post(target); if (csrf !== undefined) r = r.set('x-csrf-token',csrf);
    if (kind === 'orders') r = r.send(purchaseBody()); else r = r.set('x-submission-id',randomUUID()).attach('receipt',image,{ filename: 'r.png', contentType: 'image/png' });
    await r.expect(403);
  }
  let r = request(app).post(target).set('Authorization','Bearer '+b.login.body.token).set('x-session-id',b.login.body.sessionId).set('x-csrf-token',b.csrf);
  if (kind === 'orders') r = r.send(purchaseBody()); else r = r.set('x-submission-id',randomUUID()).attach('receipt',image,{ filename: 'r.png', contentType: 'image/png' });
  expect([401,403]).toContain((await r).status);
  expect(cloud.uploader.upload_stream).not.toHaveBeenCalled(); await untouched();
});
test('borrowed signed parent cannot authorize purchase even with authenticated JWT/application pair', async () => {
  const b = await logged(), otherParent = await request(app).get('/api/auth/csrf').expect(200);
  const c = { ...cookies(b.login), sessionId: cookies(otherParent).sessionId };
  await request(app).post('/api/orders/purchase').set('Cookie',cookieHeader(c)).set('x-csrf-token',otherParent.body.csrfToken).send(purchaseBody()).expect(401); await untouched();
});
test.each(['orders','payments'])('%s read-only exact header pair works without adopting application secret as Express SID', async kind => {
  const b = await logged();
  await request(app).get(`/api/${kind}`).set('Authorization','Bearer '+b.login.body.token).set('x-session-id',b.login.body.sessionId).expect(200);
  const sessions = (await db.pool.query('SELECT session_data FROM public.express_sessions')).rows;
  expect(JSON.stringify(sessions)).not.toContain(b.login.body.sessionId);
});
test.each(['orders','payments'])('%s conflicting or duplicate credential cookies fail closed', async kind => {
  const b = await logged();
  await b.agent.get(`/api/${kind}`).set('Authorization','Bearer conflicting').expect(401);
  await b.agent.get(`/api/${kind}`).set('x-session-id','x'.repeat(43)).expect(401);
  const c = cookieHeader(cookies(b.login)); await request(app).get(`/api/${kind}`).set('Cookie',c+'; customSessionId=duplicate').expect(401); await untouched();
});
test.each(['expired','revoked','inactive','token-version'])('financial authentication rejects %s current state', async mode => {
  const b = await logged(), retained = cookies(b.login);
  if (mode === 'expired') {
    const jwt = require('../node_modules/jsonwebtoken'), claims = jwt.decode(b.login.body.token);
    claims.iat = Math.floor(Date.now()/1000)-100; claims.exp = claims.iat+60;
    retained.session_token = jwt.sign(claims,H.JWT_SECRET,{ algorithm: 'HS256' });
  }
  if (mode === 'revoked') await b.agent.post('/api/auth/logout').set('x-csrf-token',b.csrf).expect(200);
  if (mode === 'inactive') await db.pool.query("UPDATE public.users SET account_status='suspended' WHERE id=$1",[H.OWNER]);
  if (mode === 'token-version') await db.pool.query('UPDATE public.users SET token_version=token_version+1 WHERE id=$1',[H.OWNER]);
  await request(app).post('/api/orders/purchase').set('Cookie',cookieHeader(retained)).set('x-csrf-token',b.csrf).send(purchaseBody()).expect(401); await untouched();
});
test.each(['malformed','array','oversized'])('strict bounded purchase JSON rejects %s safely', async mode => {
  const b = await logged(), payload = mode === 'malformed' ? '{private broken target' : mode === 'array' ? '[]' : JSON.stringify(purchaseBody({ fulfillmentTarget: { playerId: 'a'.repeat(17000) } }));
  const r = await b.agent.post('/api/orders/purchase').set('x-csrf-token',b.csrf).set('Content-Type','application/json').send(payload).expect(400);
  expect(JSON.stringify(r.body)).not.toContain('private broken'); await untouched();
});
test.each(['orders','payments'])('%s decisions reject client authority, query overrides and missing reason/key', async kind => {
  const owner = await logged(), admin = await logged('Admin_A'), r = kind === 'orders' ? await buy(owner).expect(201) : await submit(owner).expect(201);
  const id = r.body[kind === 'orders' ? 'orderId' : 'paymentId'];
  for (const extra of [{ userId: H.OTHER }, { principal: H.principal(H.OTHER) }, { fulfillmentTarget: { playerId: 'other' } }, { reason: '' }, { idempotencyKey: '' }, { reason: undefined }, { idempotencyKey: undefined }]) await decide(admin,kind,id,'reject',extra).expect(400);
  await admin.agent.put(`/api/${kind}/${id}/reject?userId=${H.OTHER}`).set('x-csrf-token',admin.csrf).send(decisionBody()).expect(400);
  expect((await row(kind,kind === 'orders' ? 'order_id' : 'payment_id',id)).status).toBe('pending');
});
test('approval rejects ambiguous dual decimal/cents amount fields', async () => {
  const owner = await logged(), admin = await logged('Admin_A'), p = await submit(owner).expect(201);
  await decide(admin,'payments',p.body.paymentId,'accept',{ approvedAmount: '15.00', approvedAmountCents: '1500' }).expect(400); expect(await balance()).toBe('10000');
});
test('CORS accepts the new submission header but rejects an unapproved origin', async () => {
  const r = await request(app).options('/api/payments').set('Origin','http://localhost:10000').set('Access-Control-Request-Method','POST').set('Access-Control-Request-Headers','x-submission-id,x-csrf-token').expect(204);
  expect(r.headers['access-control-allow-headers']).toContain('x-submission-id');
  await request(app).options('/api/payments').set('Origin','https://not-approved.invalid').set('Access-Control-Request-Method','POST').expect(403);
});
test('legacy creation and manual balance writes remain disabled; no financial notifications', async () => {
  const owner = await logged(), admin = await logged('Admin_A'); await owner.agent.post('/api/orders').send(purchaseBody()).expect(410);
  await admin.agent.put(`/api/users/${H.OWNER}/balance`).set('x-csrf-token',admin.csrf).send({ balance: '1000' }).expect(503);
  await request(app).get('/api/notifications').expect(503); await untouched();
});
test.each(['purchase','approval','cancellation','completion','rejection','submission'])('%s success suppresses unrelated session persistence/CAS and keeps durable parent', async command => {
  const owner = await logged(), admin = await logged('Admin_A'); let id;
  if (['cancellation','completion'].includes(command)) id = (await buy(owner).expect(201)).body.orderId;
  if (['approval','rejection'].includes(command)) id = (await submit(owner).expect(201)).body.paymentId;
  const before = (await db.pool.query('SELECT id,row_version,expires_at,session_data FROM public.express_sessions ORDER BY id')).rows;
  saveAttempts = 0; preventSave = true;
  const r = command === 'purchase' ? await buy(owner).expect(201) : command === 'submission' ? await submit(owner).expect(201)
    : await decide(admin,['cancellation','completion'].includes(command) ? 'orders' : 'payments',id,['approval','completion'].includes(command) ? 'accept' : 'reject',command === 'approval' ? { approvedAmount: '15.00' } : {}).expect(200);
  expect(saveAttempts).toBe(0); expect(r.headers['set-cookie']).toBeUndefined();
  expect((await db.pool.query('SELECT id,row_version,expires_at,session_data FROM public.express_sessions ORDER BY id')).rows).toEqual(before);
  preventSave = false; await owner.agent.get('/api/auth/session-info').expect(200);
});
test.each(['purchase','approval','cancellation','completion','rejection'])('%s lost COMMIT acknowledgement resolves to replay without repeating body', async command => {
  const owner = await logged(), admin = await logged('Admin_A'); let id;
  if (['cancellation','completion'].includes(command)) id = (await buy(owner).expect(201)).body.orderId;
  if (['approval','rejection'].includes(command)) id = (await submit(owner).expect(201)).body.paymentId;
  fault = { match: command === 'purchase' ? 'INSERT INTO public.orders' : `UPDATE public.${['cancellation','completion'].includes(command) ? 'orders' : 'payments'}` };
  financialWrites = 0;
  const r = command === 'purchase' ? await buy(owner).expect(200) : await decide(admin,['cancellation','completion'].includes(command) ? 'orders' : 'payments',id,['approval','completion'].includes(command) ? 'accept' : 'reject',command === 'approval' ? { approvedAmount: '15.00' } : {}).expect(200);
  expect(fault.lost).toBe(true); expect(r.body.replayed).toBe(true);
  expect(financialWrites).toBe(['completion','rejection'].includes(command) ? 1 : 2);
  expect(await count('financial_operations')).toBe(command === 'cancellation' ? '2' : command === 'rejection' ? '0' : '1');
  expect(await balance()).toBe(command === 'approval' ? '11500' : ['cancellation','rejection'].includes(command) ? '10000' : '9901'); fault = null;
});
test.each(['purchase','approval','cancellation','completion','rejection'])('%s unresolved COMMIT returns 503 and same-key retry resolves without duplicate effect', async command => {
  const owner = await logged(), admin = await logged('Admin_A'); let id;
  if (['cancellation','completion'].includes(command)) id = (await buy(owner).expect(201)).body.orderId;
  if (['approval','rejection'].includes(command)) id = (await submit(owner).expect(201)).body.paymentId;
  fault = { match: command === 'purchase' ? 'INSERT INTO public.orders' : `UPDATE public.${['cancellation','completion'].includes(command) ? 'orders' : 'payments'}`, blockResolution: true };
  const send = () => command === 'purchase' ? buy(owner) : decide(admin,['cancellation','completion'].includes(command) ? 'orders' : 'payments',id,['approval','completion'].includes(command) ? 'accept' : 'reject',command === 'approval' ? { approvedAmount: '15.00' } : {});
  financialWrites = 0; const unknown = await send().expect(503);
  expect(unknown.body).toEqual({ success: false, code: 'FINANCIAL_OUTCOME_UNKNOWN', error: 'FINANCIAL_OUTCOME_UNKNOWN', retryWithSameKey: true });
  expect(fault.lost).toBe(true); const writes = financialWrites, journals = await count('financial_operations'), settled = await balance();
  expect(writes).toBe(['completion','rejection'].includes(command) ? 1 : 2); fault = null;
  expect((await send().expect(200)).body.replayed).toBe(true); expect(financialWrites).toBe(writes);
  expect(await count('financial_operations')).toBe(journals); expect(await balance()).toBe(settled);
});
test('unknown COMMIT recovery reauthorizes instead of returning evidence to revoked principal', async () => {
  const b = await logged(); fault = { match: 'INSERT INTO public.orders', afterCommit: () => db.pool.query('UPDATE public.users SET token_version=token_version+1 WHERE id=$1',[H.OWNER]) };
  const r = await buy(b).expect(403); expect(r.body.code).toBe('FINANCIAL_FORBIDDEN'); expect(fault.lost).toBe(true); fault = null;
  expect(await count('orders')).toBe('1'); expect(await count('financial_operations')).toBe('1'); expect(await balance()).toBe('9901');
});
test.each(['orders','payments'])('%s repository outage has fixed errors, no private SQL/targets', async kind => {
  const b = await logged(); fault = { read: true }; const r = await b.agent.get(`/api/${kind}`).expect(503);
  expect(r.body).toEqual({ success: false, code: 'RESOURCE_READ_UNAVAILABLE', error: 'RESOURCE_READ_UNAVAILABLE' }); fault = null; await untouched();
});
test('network loss before submission COMMIT retains receipt and resolves only to unresolved', async () => {
  const b = await logged(), id = randomUUID(); fault = { match: 'INSERT INTO public.payments', disconnectBeforeCommit: true };
  const r = await submit(b,{ id }).expect(503);
  expect(r.body).toMatchObject({ code: 'PAYMENT_SUBMISSION_OUTCOME_UNKNOWN', paymentId: `pay-${id}`, retrySubmission: false });
  expect(fault.lost).toBe(true); fault = null;
  expect(cloud.uploader.destroy).not.toHaveBeenCalled();
  expect((await b.agent.get(`/api/payments/submissions/${id}`).expect(200)).body).toEqual({ outcome: 'unresolved', paymentId: `pay-${id}`, retrySubmission: false });
  expect(cloud.uploader.upload_stream).toHaveBeenCalledTimes(1); expect(await count('payments')).toBe('0'); expect(await count('financial_operations')).toBe('0'); expect(await balance()).toBe('10000');
});
test.each(['', 'key with spaces', 'x'.repeat(129), 'bad<key>'])('purchase rejects invalid financial key %p before writes', async idempotencyKey => {
  const b = await logged(); await buy(b,{ idempotencyKey }).expect(400); await untouched();
});
test.each([['cryptos',3,'wrong-bitcoin'],['cryptos',4,bitcoin],['cryptos',5,'0x0000000000000000000000000000000000000000'],['cryptos',5,'0x52908400098527886e0F7030069857D2E4169EE7']])
('HTTP wallet product %s/%s rejects wrong network/address without echo', async (category, productId, walletAddress) => {
  const b = await logged(), r = await buy(b,{ category, productId, quantity: 1000, packageIndex: undefined, fulfillmentTarget: { walletAddress } }).expect(400);
  expect(r.body.code).toBe('INVALID_FULFILLMENT_TARGET'); expect(JSON.stringify(r.body)).not.toContain(walletAddress); await untouched();
});
