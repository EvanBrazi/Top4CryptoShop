'use strict';

// Unported Mongo payment-route regressions: real HTTP, Multer, Sharp, Mongoose
// and owned replica-set transactions; Cloudinary transport is controlled.
// Pin TEST-ONLY legacy auth/CSRF, not the current PostgreSQL middleware.
// Current authentication and CSRF binding are tested in auth-http.pg.test.js.
jest.mock('../middlewares/auth', () => jest.requireActual('./helpers/legacyMongoAuth'));
jest.mock('../middlewares/csrfMiddleware', () => jest.requireActual('./helpers/legacyCsrf'));
jest.mock('../utils/sessionStore', () => ({ activeSessions: new Map() }));
jest.mock('../config/cloudinary', () => {
  const { Writable } = require('node:stream');
  const provider = require('../node_modules/cloudinary').v2;
  provider.config({ cloud_name: 'isolated-test-cloud', api_key: 'isolated-test-key', api_secret: 'isolated-test-signing-secret' });
  const buffers = [];
  return { buffers, utils: provider.utils, uploader: {
    destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
    upload_stream: jest.fn((options, callback) => new Writable({
      write(chunk, encoding, done) { buffers.push(Buffer.from(chunk)); done(); },
      final(done) { callback(null, { public_id: options.public_id, type: options.type, format: 'jpg', resource_type: 'image' }); done(); }
    }))
  } };
});

const { randomUUID } = require('node:crypto');
const express = require('../node_modules/express');
const sharp = require('../node_modules/sharp');
const mongoose = require('../node_modules/mongoose');
const jwt = require('../node_modules/jsonwebtoken');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Journal = require('../models/FinancialOperation');
const RevokedToken = require('../models/RevokedToken');
const service = require('../services/financialService');
const cloudinary = require('../config/cloudinary');
const uploads = require('../middlewares/paymentUpload');
const { activeSessions } = require('../utils/sessionStore');
const { hasMongod, startMongoServer } = require('./helpers/mongoServer');
const { MAX_CENTS, formatMoney } = require('../utils/money');
const live = hasMongod ? describe : describe.skip;
const OWNER = 'abcdef0123456789abcdef01';
const ADMIN = 'abcdef0123456789abcdef02';
const OTHER = 'abcdef0123456789abcdef03';
const ADMIN2 = 'abcdef0123456789abcdef04';
const oid = id => new mongoose.Types.ObjectId(id);
const receipt = () => ({ publicId: `private_payment_receipts/${randomUUID()}`, format: 'jpg', deliveryType: 'authenticated' });
const approval = extra => ({ actorId: ADMIN, paymentId: 'pay-test', approvedAmount: '25.00', idempotencyKey: 'approve-1', reason: 'Verified receipt', ...extra });
const rejection = extra => ({ actorId: ADMIN, paymentId: 'pay-test', idempotencyKey: 'reject-1', reason: 'Receipt rejected', ...extra });
const errorLike = (status, code) => expect.objectContaining({ status, ...(code ? { code } : {}) });
function record(id) {
  return { _id: oid(id), username: `User_${id}`, email: `${id}@example.com`, provider: 'google',
    accountStatus: 'active', role: [ADMIN, ADMIN2].includes(id) ? 'admin' : 'user',
    tokenVersion: 0, balance: 100, balanceCents: 10000, __v: 0 };
}
function unknown() {
  const error = new mongoose.mongo.MongoServerError({ message: 'Test-only lost commit response', code: 50 });
  error.addErrorLabel('UnknownTransactionCommitResult');
  return error;
}

live('Payments: real HTTP and owned MongoDB replica-set integration', () => {
  let mongo, http, origin, image, uploadCalls;
  const secretBefore = process.env.JWT_SECRET;
  beforeAll(async () => {
    process.env.JWT_SECRET = 'isolated-payment-test-jwt-secret';
    mongo = await startMongoServer({ replicaSet: 'payment-tests' });
    await mongoose.connect(mongo.uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000, monitorCommands: true });
    // Exercise reuse of the real old paymentId_1 index, not just an empty new deployment.
    await Payment.createCollection();
    await Payment.collection.createIndex({ paymentId: 1 }, { name: 'paymentId_1', unique: true });
    await service.initializeFinancialFoundation();
    await RevokedToken.createCollection();
    image = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#abcdef' } }).png().toBuffer();
    const originalSingle = uploads.upload.single.bind(uploads.upload);
    jest.spyOn(uploads.upload, 'single').mockImplementation(name => {
      const middleware = originalSingle(name);
      return (req, res, next) => { uploadCalls += 1; middleware(req, res, next); };
    });
    const app = express();
    app.use(express.json());
    // Legacy fixture session consumed only by the explicitly pinned TEST-ONLY CSRF adapter.
    app.use((req, res, next) => { req.session = { csrfToken: 'isolated-csrf' }; next(); });
    app.use('/api/payments', require('../routes/payments'));
    http = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    origin = `http://127.0.0.1:${http.address().port}/api/payments`;
  }, 60000);
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    uploadCalls = 0;
    cloudinary.buffers.length = 0;
    await Payment.collection.deleteMany({});
    await Journal.collection.deleteMany({});
    await User.collection.deleteMany({});
    await RevokedToken.collection.deleteMany({});
    await User.collection.insertMany([OWNER, ADMIN, OTHER, ADMIN2].map(record));
    activeSessions.clear();
    for (const id of [OWNER, ADMIN, OTHER, ADMIN2]) activeSessions.set(`session-${id}`, { userId: id, role: 'admin', expiresAt: Date.now() + 3600000 });
    await service.initializeFinancialFoundation();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    activeSessions.clear();
    if (secretBefore === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secretBefore;
    try {
      if (http) await new Promise((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
      await mongoose.disconnect();
    } finally { if (mongo) await mongo.stop(); }
  }, 30000);
  async function pending(extra = {}) {
    return new Payment({ paymentId: 'pay-test', userId: OWNER, submissionVersion: 1, amount: 50,
      currency: 'USD', amountInUSD: 0, method: 'visa', status: 'pending', receipt: receipt(), ...extra }).save();
  }
  async function account(id = OWNER) { return User.collection.findOne({ _id: oid(id) }); }
  async function stored(id = 'pay-test') { return Payment.findOne({ paymentId: id }).select('+receipt +decision').lean(); }
  async function request(method, path = '/', { actor = OWNER, body, multipart, csrf = true, headers = {}, version = 0 } = {}) {
    const auth = actor ? { authorization: `Bearer ${jwt.sign({ userId: actor, role: 'admin', tokenVersion: version }, process.env.JWT_SECRET,
      { algorithm: 'HS256', issuer: 'your-app-api', expiresIn: '1h' })}`, 'x-session-id': `session-${actor}` } : {};
    const response = await fetch(`${origin}${path}`, { method, headers: { ...auth, ...(csrf ? { 'x-csrf-token': 'isolated-csrf' } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: multipart || (body ? JSON.stringify(body) : undefined) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  function form(extra = {}, file = image, mime = 'image/png') {
    const data = new FormData();
    for (const [key, value] of Object.entries({ method: 'visa', amount: '50.00', ...extra })) data.append(key, value);
    if (file) data.append('receipt', new Blob([file], { type: mime }), 'receipt.png');
    return data;
  }
  function decisionBody(extra = {}) { return { approvedAmount: '25.00', idempotencyKey: 'approve-1', reason: 'Verified receipt', ...extra }; }
  async function assertUntouched() {
    expect(await account()).toMatchObject({ balance: 100, balanceCents: 10000 });
    expect(await stored()).toMatchObject({ status: 'pending', amountInUSD: 0 });
    expect(await Journal.countDocuments()).toBe(0);
  }

  test('readiness installs the actual unique Payment indexes, with no TTL replay erasure', async () => {
    const indexes = await Payment.collection.indexes();
    expect(indexes.find(index => index.name === 'paymentId_1')).toMatchObject({ unique: true, key: { paymentId: 1 } });
    expect(indexes.find(index => index.name === 'payment_actor_decision_idempotency')).toMatchObject({ unique: true,
      partialFilterExpression: { 'decision.actorId': { $type: 'objectId' }, 'decision.type': { $type: 'string' }, 'decision.idempotencyKey': { $type: 'string' } } });
    expect(indexes.every(index => index.expireAfterSeconds === undefined)).toBe(true);
  });
  test.each([['POST', '/'], ['GET', '/'], ['GET', '/all'], ['GET', '/summary'], ['GET', '/summary/all'],
    ['GET', '/pay-test/receipt'], ['PUT', '/pay-test/accept'], ['PUT', '/pay-test/reject']])('unauthenticated %s %s is rejected before any upload', async (method, path) => {
    expect((await request(method, path, { actor: null, ...(method === 'POST' ? { multipart: form() } : {}) })).status).toBe(401);
    expect(uploadCalls).toBe(0);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
    expect(await Payment.countDocuments()).toBe(0);
  });
  test('CSRF rejection precedes parsing/storage', async () => {
    expect((await request('POST', '/', { multipart: form(), csrf: false })).status).toBe(403);
    expect(uploadCalls).toBe(0);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });
  test('stale token versions are rejected before parsing/storage', async () => {
    expect((await request('POST', '/', { multipart: form(), version: 1 })).status).toBe(401);
    expect(uploadCalls).toBe(0);
  });
  test('submission derives ownership/currency, preserves unverified zero, sanitizes and privately stores receipt', async () => {
    const response = await request('POST', '/', { multipart: form({ note: 'Reference verified by reviewer' }) });
    expect(response.status).toBe(201);
    const payment = await stored(response.body.paymentId);
    expect(payment).toMatchObject({ userId: OWNER, submissionVersion: 1, currency: 'USD', amount: 50, amountInUSD: 0, status: 'pending' });
    expect(payment).not.toHaveProperty('amountCents');
    expect(payment).not.toHaveProperty('decision');
    expect(payment.receipt.deliveryType).toBe('authenticated');
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(expect.objectContaining({ type: 'authenticated', format: 'jpg', overwrite: false }), expect.any(Function));
    const metadata = await sharp(Buffer.concat(cloudinary.buffers)).metadata();
    expect(metadata).toMatchObject({ format: 'jpeg', width: 800, height: 800 });
    expect(metadata.exif).toBeUndefined();
    expect(await account()).toMatchObject({ balance: 100, balanceCents: 10000 });
    expect(await Journal.countDocuments()).toBe(0);
  });
  test.each(['userId', 'amountInUSD', 'status', 'currency', 'amountCents', 'decision', 'receiptImage', 'actorId'])('submission rejects client-owned %s before external storage', async field => {
    expect((await request('POST', '/', { multipart: form({ [field]: field === 'userId' ? OTHER : '1' }) })).status).toBe(400);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
    expect(await Payment.countDocuments()).toBe(0);
  });
  test.each([{ amount: '1.005' }, { amount: '9' }, { amount: '101' }, { method: '__proto__' }, { method: 'unknown' }, { note: '<script>bad</script>' }])('invalid form is rejected without external storage: %p', async extra => {
    expect((await request('POST', '/', { multipart: form(extra) })).status).toBe(400);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });
  test('claimed MIME without valid image content is rejected', async () => {
    expect((await request('POST', '/', { multipart: form({}, Buffer.from('not an image')) })).status).toBe(400);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });
  test('oversized receipt is rejected by real Multer without storage', async () => {
    expect((await request('POST', '/', { multipart: form({}, Buffer.alloc(5 * 1024 * 1024 + 1)) })).status).toBe(413);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });
  test('missing receipt is rejected', async () => {
    expect((await request('POST', '/', { multipart: form({}, null) })).status).toBe(400);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });
  test('persistence failure cleans up only the server-owned authenticated receipt', async () => {
    jest.spyOn(Payment.collection, 'insertOne').mockRejectedValueOnce(new Error('private database detail'));
    const response = await request('POST', '/', { multipart: form() });
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('private');
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(expect.stringMatching(/^private_payment_receipts\//),
      { resource_type: 'image', type: 'authenticated', invalidate: true });
    expect(await Payment.countDocuments()).toBe(0);
  });
  test.each(['/admin', '/all', '/summary/all'])('global read %s ignores forged JWT/session admin roles', async path => {
    expect((await request('GET', path)).status).toBe(403);
  });
  test.each(['accept', 'reject'])('decision %s requires database admin role and CSRF', async decision => {
    await pending();
    expect((await request('PUT', `/pay-test/${decision}`, { body: decisionBody() })).status).toBe(403);
    expect((await request('PUT', `/pay-test/${decision}`, { actor: null, body: decisionBody() })).status).toBe(401);
    expect((await request('PUT', `/pay-test/${decision}`, { actor: ADMIN, csrf: false, body: decisionBody() })).status).toBe(403);
    await assertUntouched();
  });
  test.each([OWNER, ADMIN])('normal listing/summary stays self-only for actor %s', async actor => {
    await pending();
    await pending({ paymentId: 'pay-other', userId: OTHER });
    const list = await request('GET', '/', { actor });
    expect(list.status).toBe(200);
    expect(list.body.every(payment => payment.userId === actor)).toBe(true);
    expect((await request('GET', `/?userId=${OTHER}`, { actor })).status).toBe(403);
    expect((await request('GET', `/summary?userId=${OTHER}`, { actor })).status).toBe(403);
  });
  test('owner-scoped list uses safe projections and bounded cursor pagination', async () => {
    await pending();
    await pending({ paymentId: 'pay-second' });
    const first = await request('GET', '/?limit=1');
    expect(first.body).toHaveLength(1);
    expect(first.headers.get('cache-control')).toBe('no-store');
    for (const secret of ['receipt', 'receiptImage', 'decision', 'amountCents']) expect(first.body[0]).not.toHaveProperty(secret);
    expect(first.body[0].amountInUSD).toBeNull();
    const second = await request('GET', `/?limit=1&before=${first.body[0]._id}`);
    expect(second.body).toHaveLength(1);
    expect(second.body[0]._id).not.toBe(first.body[0]._id);
    expect((await request('GET', '/?limit=101')).status).toBe(400);
    expect((await request('GET', '/?userId[$ne]=x')).status).toBe(400);
  });
  test('receipt and single-payment reads hide other ownership but allow explicit admin review', async () => {
    await pending();
    expect((await request('GET', '/pay-test', { actor: OTHER })).status).toBe(404);
    expect((await request('GET', '/pay-test', { actor: ADMIN })).status).toBe(404);
    expect((await request('GET', '/admin/pay-test', { actor: ADMIN })).status).toBe(200);
    expect((await request('GET', '/admin/pay-test', { actor: OTHER })).status).toBe(403);
    expect((await request('GET', '/pay-test/receipt', { actor: OTHER })).status).toBe(404);
    for (const actor of [OWNER, ADMIN]) {
      const response = await request('GET', '/pay-test/receipt', { actor });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const url = new URL(response.body.url);
      expect(url.searchParams.get('type')).toBe('authenticated');
      expect(url.searchParams.get('signature')).toMatch(/^[a-f\d]+$/);
      expect(Number(url.searchParams.get('expires_at'))).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 60);
      expect(JSON.stringify(response.body)).not.toContain('isolated-test-signing-secret');
    }
    expect((await request('GET', '/all', { actor: ADMIN })).body).toHaveLength(1);
  });
  test('legacy receipt URL is never returned or signed', async () => {
    await Payment.collection.insertOne({ paymentId: 'pay-old', userId: OWNER, status: 'accepted', receiptImage: 'https://public.example/private-old.jpg',
      method: '<img src=x onerror=alert(1)>', note: '<script>legacy markup</script>' });
    const list = await request('GET', '/');
    expect(JSON.stringify(list.body)).not.toContain('public.example');
    expect(list.body[0]).toMatchObject({ method: 'legacy', note: '', status: 'reconciliation_required' });
    expect((await request('GET', '/pay-old/receipt')).status).toBe(410);
  });
  test('admin HTTP approval commits status, both balance fields and payment_credit journal together', async () => {
    const payment = await pending();
    const response = await request('PUT', '/pay-test/accept', { actor: ADMIN, body: decisionBody() });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'completed', amountCents: 2500, balance: '125.00', balanceCents: 12500, replayed: false });
    expect(await account()).toMatchObject({ balance: 125, balanceCents: 12500 });
    expect(await stored()).toMatchObject({ status: 'completed', amountInUSD: 25, amountCents: 2500,
      decision: { type: 'approve', idempotencyKey: 'approve-1', reason: 'Verified receipt', result: { balance: '125.00' } } });
    const journal = await Journal.findById(response.body.operationId).lean();
    expect(journal).toMatchObject({ operationType: 'payment_credit', sourceType: 'payment', sourceId: String(payment._id), effect: 'credit',
      beforeCents: 10000, afterCents: 12500, deltaCents: 2500, result: { resourceId: 'pay-test' } });
    expect(String((await stored()).decision.operationId)).toBe(response.body.operationId);
  });
  test.each(['payment', 'journal'])('failure after actual %s write rolls back status, credit and journal', async stage => {
    await pending();
    const collection = stage === 'payment' ? Payment.collection : Journal.collection;
    const method = stage === 'payment' ? 'updateOne' : 'insertOne';
    const original = collection[method].bind(collection);
    jest.spyOn(collection, method).mockImplementationOnce(async (...args) => { await original(...args); throw new Error('Test-only failure AFTER actual write'); });
    await expect(service.approvePayment(approval())).rejects.toEqual(errorLike(503));
    await assertUntouched();
  });
  test('same-key HTTP replay preserves original result after later money changes', async () => {
    await pending();
    const first = await request('PUT', '/pay-test/accept', { actor: ADMIN, body: decisionBody() });
    await service.adjustBalance({ actorId: ADMIN, userId: OWNER, balance: '200', expectedBalance: '125', idempotencyKey: 'later-adjustment', reason: 'Later review' });
    const replay = await request('PUT', '/pay-test/accept', { actor: ADMIN, body: decisionBody({ approvedAmount: '25', reason: ' Verified receipt ' }) });
    expect(replay.body).toEqual({ ...first.body, replayed: true });
    expect(await account()).toMatchObject({ balance: 200, balanceCents: 20000 });
    expect(await Journal.countDocuments({ operationType: 'payment_credit' })).toBe(1);
  });
  test.each([{ approvedAmount: '26' }, { reason: 'Changed reason' }, { paymentId: 'pay-other' }])('changed same-key payload conflicts: %p', async extra => {
    await pending();
    await service.approvePayment(approval());
    await expect(service.approvePayment(approval(extra))).rejects.toEqual(errorLike(409, 'IDEMPOTENCY_CONFLICT'));
    expect(await Journal.countDocuments()).toBe(1);
  });
  test.each([{ approvedAmount: '0' }, { approvedAmount: '1.005' }, { approvedAmount: true }, { approvedAmount: formatMoney(MAX_CENTS) },
    { userId: OTHER }, { role: 'admin' }, { idempotencyKey: 'key\n' }])('invalid approval input cannot write: %p', async extra => {
    await pending();
    await expect(service.approvePayment(approval(extra))).rejects.toEqual(errorLike(400));
    await assertUntouched();
  });
  test('HTTP approval refuses forged owner and legacy amountInUSD input', async () => {
    await pending();
    for (const extra of [{ userId: OTHER }, { amountInUSD: 1000000 }, { actorId: ADMIN2 }]) {
      expect((await request('PUT', '/pay-test/accept', { actor: ADMIN, body: decisionBody(extra) })).status).toBe(400);
    }
    await assertUntouched();
  });
  test('concurrent same-key approvals both resolve one original committed credit', async () => {
    await pending();
    const results = await Promise.all([service.approvePayment(approval()), service.approvePayment(approval())]);
    expect(results[0]).toEqual({ ...results[1], replayed: results[0].replayed });
    expect(results.filter(result => !result.replayed)).toHaveLength(1);
    expect(await Journal.countDocuments()).toBe(1);
    expect(await account()).toMatchObject({ balanceCents: 12500 });
  });
  test('different administrators racing approval cannot double-credit the source', async () => {
    await pending();
    const results = await Promise.allSettled([service.approvePayment(approval()), service.approvePayment(approval({ actorId: ADMIN2, idempotencyKey: 'approve-2' }))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.status).toBe(409);
    expect(await Journal.countDocuments()).toBe(1);
    expect(await account()).toMatchObject({ balanceCents: 12500 });
  });
  test('approval/rejection race commits exactly one terminal outcome, with credit only for approval', async () => {
    await pending();
    const results = await Promise.allSettled([service.approvePayment(approval()), service.rejectPayment(rejection({ actorId: ADMIN2 }))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.status).toBe(409);
    const payment = await stored();
    const approved = payment.status === 'completed';
    expect(await account()).toMatchObject({ balanceCents: approved ? 12500 : 10000 });
    expect(await Journal.countDocuments()).toBe(approved ? 1 : 0);
  });
  test.each(['available', 'outage'])('actual terminal decision-index E11000 rolls back credit with resolution %s', async mode => {
    await pending();
    await service.approvePayment(approval());
    await pending({ paymentId: 'pay-other', userId: OTHER });
    const findJournal = Journal.collection.findOne.bind(Journal.collection);
    const findPayment = Payment.collection.findOne.bind(Payment.collection);
    let journalMiss = false, paymentMiss = false;
    jest.spyOn(Journal.collection, 'findOne').mockImplementation((filter, ...args) => {
      if (!journalMiss && filter.operationType === 'payment_credit' && filter.idempotencyKey === 'approve-1') { journalMiss = true; return Promise.resolve(null); }
      if (mode === 'outage' && errors.includes(11000) && filter.operationType === 'payment_credit') throw new Error('Test-only resolution lookup outage');
      return findJournal(filter, ...args);
    });
    jest.spyOn(Payment.collection, 'findOne').mockImplementation((filter, ...args) => {
      if (!paymentMiss && filter['decision.idempotencyKey'] === 'approve-1') { paymentMiss = true; return Promise.resolve(null); }
      return findPayment(filter, ...args);
    });
    const update = Payment.collection.updateOne.bind(Payment.collection), errors = [];
    jest.spyOn(Payment.collection, 'updateOne').mockImplementation(async (...args) => { try { return await update(...args); } catch (error) { errors.push(error.code); throw error; } });
    await expect(service.approvePayment(approval({ paymentId: 'pay-other' }))).rejects.toEqual(mode === 'outage'
      ? errorLike(503, 'FINANCIAL_UNAVAILABLE') : errorLike(409, 'IDEMPOTENCY_CONFLICT'));
    if (mode === 'outage') await expect(service.assertFinancialReady()).rejects.toEqual(errorLike(503));
    expect(errors).toEqual([11000]);
    expect(await account(OTHER)).toMatchObject({ balance: 100, balanceCents: 10000 });
    expect((await stored('pay-other')).status).toBe('pending');
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('actual source/effect E11000 prevents credit even when an existing journal lookup misses', async () => {
    const payment = await pending();
    await service.approvePayment(approval());
    // Test-only corrupted pending state: absence of terminal metadata must NEVER reopen its source effect.
    await Payment.collection.updateOne({ _id: payment._id }, { $set: { status: 'pending', amountInUSD: 0 }, $unset: { decision: '', amountCents: '' } });
    const find = Journal.collection.findOne.bind(Journal.collection);
    jest.spyOn(Journal.collection, 'findOne').mockImplementation((filter, ...args) => filter.sourceType === 'payment' ? Promise.resolve(null) : find(filter, ...args));
    const insert = Journal.collection.insertOne.bind(Journal.collection), errors = [];
    jest.spyOn(Journal.collection, 'insertOne').mockImplementation(async (...args) => { try { return await insert(...args); } catch (error) { errors.push(error.code); throw error; } });
    await expect(service.approvePayment(approval({ actorId: ADMIN2, idempotencyKey: 'other-key' }))).rejects.toEqual(errorLike(409, 'PAYMENT_RECONCILIATION_REQUIRED'));
    expect(errors).toEqual([11000]);
    expect(await account()).toMatchObject({ balanceCents: 12500 });
    expect((await stored()).status).toBe('pending');
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('rejection is audited/idempotent and does not read or write any owner funds or journal', async () => {
    await pending();
    const commands = [], client = mongoose.connection.getClient();
    const observe = event => commands.push(event.command);
    client.on('commandStarted', observe);
    let result;
    try { result = await service.rejectPayment(rejection()); } finally { client.off('commandStarted', observe); }
    expect(result).toEqual({ paymentId: 'pay-test', userId: OWNER, status: 'cancelled', replayed: false });
    expect(commands.some(command => command.find === User.collection.collectionName && String(command.filter?._id) === OWNER)).toBe(false);
    expect(commands.some(command => command.update === User.collection.collectionName || command.findAndModify === User.collection.collectionName)).toBe(false);
    expect(commands.some(command => command.find === Journal.collection.collectionName || command.insert === Journal.collection.collectionName)).toBe(false);
    expect(await account()).toMatchObject({ balance: 100, balanceCents: 10000 });
    expect(await Journal.countDocuments()).toBe(0);
    expect(await service.rejectPayment(rejection({ reason: ' Receipt rejected ' }))).toEqual({ ...result, replayed: true });
    expect((await stored()).decision).toMatchObject({ type: 'reject', idempotencyKey: 'reject-1', reason: 'Receipt rejected' });
    expect((await stored()).decision).not.toHaveProperty('operationId');
  });
  test.each(['legacy', 'drift', 'inactive', 'missing'])('rejection does not inspect or migrate %s owner money', async mode => {
    await pending();
    if (mode === 'legacy') await User.collection.updateOne({ _id: oid(OWNER) }, { $unset: { balanceCents: '' } });
    if (mode === 'drift') await User.collection.updateOne({ _id: oid(OWNER) }, { $set: { balance: 100.001 } });
    if (mode === 'inactive') await User.collection.updateOne({ _id: oid(OWNER) }, { $set: { accountStatus: 'suspended' } });
    if (mode === 'missing') await User.collection.deleteOne({ _id: oid(OWNER) });
    const before = await account();
    await service.rejectPayment(rejection());
    expect(await account()).toEqual(before);
    expect(await Journal.countDocuments()).toBe(0);
  });
  test('HTTP rejection returns canonical cancelled and cannot later be approved', async () => {
    await pending();
    const response = await request('PUT', '/pay-test/reject', { actor: ADMIN, body: { idempotencyKey: 'reject-1', reason: 'Receipt rejected' } });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('cancelled');
    await expect(service.approvePayment(approval())).rejects.toEqual(errorLike(409));
    await expect(service.rejectPayment(rejection({ reason: 'Different reason' }))).rejects.toEqual(errorLike(409, 'IDEMPOTENCY_CONFLICT'));
    expect(await Journal.countDocuments()).toBe(0);
  });
  test('rejection same-key reuse for another payment conflicts and leaves it pending', async () => {
    await pending();
    await pending({ paymentId: 'pay-other' });
    await service.rejectPayment(rejection());
    await expect(service.rejectPayment(rejection({ paymentId: 'pay-other' }))).rejects.toEqual(errorLike(409, 'IDEMPOTENCY_CONFLICT'));
    expect((await stored('pay-other')).status).toBe('pending');
    expect(await Journal.countDocuments()).toBe(0);
  });
  test('approval migrates exact legacy owner cents once in the same transaction', async () => {
    await pending();
    await User.collection.updateOne({ _id: oid(OWNER) }, { $unset: { balanceCents: '' } });
    await service.approvePayment(approval());
    expect(await account()).toMatchObject({ balanceCents: 12500, balance: 125 });
    expect(await Journal.countDocuments({ operationType: 'balance_migration' })).toBe(1);
    expect(await Journal.countDocuments({ operationType: 'payment_credit' })).toBe(1);
  });
  test.each(['pending', 'accepted', 'rejected', 'processing'])('legacy %s payment requires reconciliation, never inferred unpaid', async status => {
    await Payment.collection.insertOne({ paymentId: 'pay-test', userId: OWNER, status, amount: 50, amountInUSD: 50, method: 'visa' });
    await expect(service.approvePayment(approval())).rejects.toEqual(errorLike(409, 'PAYMENT_RECONCILIATION_REQUIRED'));
    await expect(service.rejectPayment(rejection())).rejects.toEqual(errorLike(409, 'PAYMENT_RECONCILIATION_REQUIRED'));
    expect(await account()).toMatchObject({ balanceCents: 10000 });
    expect(await Journal.countDocuments()).toBe(0);
  });
  test('approval with incompatible owner money rolls back without terminal status', async () => {
    await pending();
    await User.collection.updateOne({ _id: oid(OWNER) }, { $set: { balanceCents: 9999 } });
    await expect(service.approvePayment(approval())).rejects.toEqual(errorLike(409, 'BALANCE_RECONCILIATION_REQUIRED'));
    expect((await stored()).status).toBe('pending');
    expect(await Journal.countDocuments()).toBe(0);
  });
  test.each(['overflow', 'unrepresentable'])('resulting owner balance %s rejects without status or journal', async mode => {
    await pending();
    const cents = MAX_CENTS - 1001;
    const mirror = Number(formatMoney(cents));
    await User.collection.updateOne({ _id: oid(OWNER) }, { $set: { balance: mirror, balanceCents: cents } });
    await expect(service.approvePayment(approval({ approvedAmount: mode === 'overflow' ? '25.00' : '0.01' })))
      .rejects.toEqual(errorLike(400));
    expect(await account()).toMatchObject({ balance: mirror, balanceCents: cents });
    expect((await stored()).status).toBe('pending');
    expect(await Journal.countDocuments()).toBe(0);
  });
  test.each(['approve', 'reject'])('lost %s commit response resolves from fresh authorization-checked durable evidence', async type => {
    await pending();
    const start = mongoose.connection.startSession.bind(mongoose.connection);
    let first = true;
    jest.spyOn(mongoose.connection, 'startSession').mockImplementation(async (...args) => {
      const session = await start(...args);
      if (first) {
        first = false;
        const transaction = session.withTransaction.bind(session);
        session.withTransaction = async (...args) => { await transaction(...args); throw unknown(); };
      }
      return session;
    });
    const result = await (type === 'approve' ? service.approvePayment(approval()) : service.rejectPayment(rejection()));
    expect(result.replayed).toBe(true);
    expect((await stored()).status).toBe(type === 'approve' ? 'completed' : 'cancelled');
    expect(await Journal.countDocuments()).toBe(type === 'approve' ? 1 : 0);
  });
  test.each(['approve', 'reject'])('unresolved %s outcome returns 503 and safe same-key retry contract', async type => {
    await pending();
    const start = mongoose.connection.startSession.bind(mongoose.connection);
    let first = true;
    jest.spyOn(mongoose.connection, 'startSession').mockImplementation(async (...args) => {
      const session = await start(...args);
      if (first) {
        first = false;
        session.withTransaction = async (work, options) => {
          session.startTransaction(options);
          await work(session);
          await session.abortTransaction();
          throw unknown();
        };
      }
      return session;
    });
    const path = type === 'approve' ? 'accept' : 'reject';
    const body = type === 'approve' ? decisionBody() : { idempotencyKey: 'reject-1', reason: 'Receipt rejected' };
    const response = await request('PUT', `/pay-test/${path}`, { actor: ADMIN, body });
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: 'FINANCIAL_OUTCOME_UNKNOWN', retryWithSameKey: true });
    await assertUntouched();
    await expect(service.assertFinancialReady()).rejects.toEqual(errorLike(503));
    await service.initializeFinancialFoundation();
    expect((await request('PUT', `/pay-test/${path}`, { actor: ADMIN, body })).status).toBe(200);
    expect(await Journal.countDocuments()).toBe(type === 'approve' ? 1 : 0);
  });
  test('summary groups claims by currency and sums only reviewed USD settlement exactly', async () => {
    await pending();
    await pending({ paymentId: 'pay-syp', method: 'shamcash', currency: 'SYP', amount: 10000 });
    await service.approvePayment(approval({ approvedAmount: '0.10' }));
    await service.approvePayment(approval({ paymentId: 'pay-syp', approvedAmount: '0.20', idempotencyKey: 'second-review' }));
    await pending({ paymentId: 'pay-unverified' });
    const response = await request('GET', '/summary');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ totalInUSD: '0.30', verifiedAmountCents: '30', totalCompleted: 2, totalPending: 1,
      claimedTotals: { USD: '100.00', SYP: '10000.00', USDT: '0.00' } });
  });
  test('model guards block nontransactional, bulk, delete, pipeline and terminal re-writes', async () => {
    const payment = await pending();
    for (const work of [
      () => Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'completed' } }),
      () => Payment.updateMany({}, { $set: { status: 'cancelled' } }),
      () => Payment.updateOne({ _id: payment._id }, [{ $set: { status: 'cancelled' } }]),
      () => Payment.deleteOne({ _id: payment._id }),
      () => Payment.bulkWrite([{ deleteOne: { filter: {} } }]),
      () => Payment.insertMany([{ ...payment.toObject(), paymentId: 'bulk-payment' }])
    ]) await expect(work()).rejects.toHaveProperty('code', 'UNSAFE_PAYMENT_UPDATE');
    await service.approvePayment(approval());
    const terminal = await Payment.findById(payment._id).select('+decision +receipt');
    await expect(terminal.save()).rejects.toHaveProperty('code', 'UNSAFE_PAYMENT_UPDATE');
    expect(await Journal.countDocuments()).toBe(1);
  });
  test.each([{ amount: '50' }, { amountInUSD: 1 }, { amountCents: 0 }, { submissionVersion: undefined },
    { status: 'accepted' }, { receipt: { publicId: 'outside-folder', format: 'jpg', deliveryType: 'authenticated' } }])('model rejects invalid pending data even with save validation disabled: %p', async extra => {
    const payment = new Payment({ paymentId: 'invalid-test', userId: OWNER, submissionVersion: 1, amount: 50,
      currency: 'USD', method: 'visa', amountInUSD: 0, status: 'pending', receipt: receipt(), ...extra });
    await expect(payment.save({ validateBeforeSave: false })).rejects.toBeDefined();
    expect(await Payment.countDocuments()).toBe(0);
  });
});
