'use strict';
// Unported Mongo order-route regressions: explicitly pin TEST-ONLY legacy
// authentication/CSRF. Current PostgreSQL auth is tested in auth-http.pg.test.js.
jest.mock('../middlewares/auth', () => jest.requireActual('./helpers/legacyMongoAuth'));
jest.mock('../middlewares/csrfMiddleware', () => jest.requireActual('./helpers/legacyCsrf'));
jest.mock('../utils/sessionStore', () => ({ activeSessions: new Map() }));
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('../node_modules/express');
const mongoose = require('../node_modules/mongoose');
const jwt = require('../node_modules/jsonwebtoken');
const base58 = require('../node_modules/bs58check').default;
const User = require('../models/User');
const Order = require('../models/Order');
const Journal = require('../models/FinancialOperation');
const RevokedToken = require('../models/RevokedToken');
const catalog = require('../services/catalogService');
const service = require('../services/financialService');
const { activeSessions } = require('../utils/sessionStore');
const { hasMongod, startMongoServer } = require('./helpers/mongoServer');
const { MAX_CENTS, formatMoney } = require('../utils/money');
const live = hasMongod ? describe : describe.skip;
const OWNER = 'abcdef0123456789abcdef01', ADMIN = 'abcdef0123456789abcdef02', OTHER = 'abcdef0123456789abcdef03', ADMIN2 = 'abcdef0123456789abcdef04';
const oid = id => new mongoose.Types.ObjectId(id);
const tron = base58.encode(Uint8Array.from([0x41, ...Array(20).fill(17)]));
const bitcoin = base58.encode(Uint8Array.from([0, ...Array(20).fill(17)]));
const evm = '0x52908400098527886E0F7030069857D2E4169EE7';
const body = extra => ({ category: 'games', productId: 1, packageIndex: 0, idempotencyKey: 'purchase-1', fulfillmentTarget: { playerId: 'Player_123' }, ...extra });
const purchase = extra => ({ ...body(), actorId: OWNER, ...extra });
const decision = (orderId, extra) => ({ actorId: ADMIN, orderId, idempotencyKey: 'decision-1', reason: 'Reviewed fulfillment', ...extra });
const like = (status, code) => expect.objectContaining({ status, ...(code ? { code } : {}) });
const record = id => ({ _id: oid(id), username: `User_${id}`, email: `${id}@example.com`, provider: 'google', accountStatus: 'active', role: [ADMIN, ADMIN2].includes(id) ? 'admin' : 'user', tokenVersion: 0, balance: 100, balanceCents: 10000, __v: 0 });
function unknown() { const error = new mongoose.mongo.MongoServerError({ message: 'Test-only lost commit response', code: 50 }); error.addErrorLabel('UnknownTransactionCommitResult'); return error; }
live('Orders: real HTTP and owned MongoDB replica-set purchasing', () => {
  let mongo, http, origin, directory, fixture, router;
  const secretBefore = process.env.JWT_SECRET;
  beforeAll(async () => {
    process.env.JWT_SECRET = 'isolated-orders-test-secret';
    mongo = await startMongoServer({ replicaSet: 'order-tests' });
    await mongoose.connect(mongo.uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000, monitorCommands: true });
    await Order.createCollection();
    await Order.collection.createIndex({ orderId: 1 }, { name: 'orderId_1', unique: true });
    await service.initializeFinancialFoundation();
    await RevokedToken.createCollection();
    router = require('../routes/orders');
    const app = express(); app.use(express.json({ limit: '8kb' }));
    app.use((req, res, next) => { req.session = { csrfToken: 'isolated-csrf' }; next(); });
    app.use('/api/orders', router); app.use('/api', require('../routes/catalog'));
    http = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    origin = `http://127.0.0.1:${http.address().port}`;
  }, 60000);
  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'warn').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {});
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'live-order-catalog-'));
    for (const filename of Object.keys(catalog.FILES)) fs.copyFileSync(path.join(__dirname, '../data', filename), path.join(directory, filename));
    fixture = catalog.createCatalogService({ directory }); fixture.load();
    // Redirect the production service to owned fixture files, without replacing pricing/validation logic.
    jest.spyOn(catalog, 'ensureLoaded').mockImplementation(fixture.ensureLoaded);
    jest.spyOn(catalog, 'resolvePurchase').mockImplementation(fixture.resolvePurchase);
    jest.spyOn(catalog, 'getCategory').mockImplementation(fixture.getCategory);
    await Order.collection.deleteMany({}); await Journal.collection.deleteMany({}); await User.collection.deleteMany({}); await RevokedToken.collection.deleteMany({});
    await User.collection.insertMany([OWNER, ADMIN, OTHER, ADMIN2].map(record));
    activeSessions.clear(); for (const id of [OWNER, ADMIN, OTHER, ADMIN2]) activeSessions.set(`session-${id}`, { userId: id, role: 'admin', expiresAt: Date.now() + 3600000 });
    for (const layer of router.stack) for (const middleware of layer.route?.stack || []) if (middleware.handle.resetKey) middleware.handle.resetKey(OWNER);
    await service.initializeFinancialFoundation();
  });
  afterEach(() => { jest.restoreAllMocks(); if (directory) fs.rmSync(directory, { recursive: true, force: true }); });
  afterAll(async () => {
    activeSessions.clear(); if (secretBefore === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secretBefore;
    try { if (http) await new Promise(resolve => http.close(resolve)); await mongoose.disconnect(); } finally { if (mongo) await mongo.stop(); }
  }, 30000);
  const account = () => User.collection.findOne({ _id: oid(OWNER) });
  const stored = orderId => Order.findOne({ orderId }).select('+request +fulfillmentSnapshot +decision +refund').lean();
  async function request(method, endpoint = '/api/orders/purchase', { actor = OWNER, data, csrf = true, version = 0, headers = {} } = {}) {
    const auth = actor ? { authorization: `Bearer ${jwt.sign({ userId: actor, role: 'admin', tokenVersion: version }, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: 'your-app-api', expiresIn: '1h' })}`, 'x-session-id': `session-${actor}` } : {};
    const response = await fetch(origin + endpoint, { method, headers: { ...auth, ...(csrf ? { 'x-csrf-token': 'isolated-csrf' } : {}), ...(data !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: data !== undefined ? JSON.stringify(data) : undefined });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  function modify(filename, mutate) { const file = path.join(directory, filename); const data = JSON.parse(fs.readFileSync(file, 'utf8')); mutate(data); fs.writeFileSync(file, JSON.stringify(data)); fixture.load(); }
  async function untouched() { expect(await account()).toMatchObject({ balance: 100, balanceCents: 10000 }); expect(await Order.countDocuments()).toBe(0); expect(await Journal.countDocuments()).toBe(0); }
  test('atomic HTTP purchase creates a paid pending order and exact debit evidence', async () => {
    const response = await request('POST', undefined, { data: body() });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: 'pending', chargeCents: 99, charge: '0.99', quantity: 60, balanceCents: 9901, balance: '99.01', replayed: false });
    expect(response.body).not.toHaveProperty('fulfillmentSnapshot');
    const order = await stored(response.body.orderId);
    expect(order).toMatchObject({ financialVersion: 1, chargeCents: 99, fulfillmentSnapshot: { schema: 'playerId', network: null, target: { playerId: 'Player_123' } } });
    expect(await Journal.findById(response.body.operationId).lean()).toMatchObject({ sourceType: 'order', sourceId: String(order._id), effect: 'debit', operationType: 'order_debit', beforeCents: 10000, afterCents: 9901, deltaCents: -99 });
    expect(String(order.debitOperationId)).toBe(response.body.operationId); expect(await account()).toMatchObject({ balanceCents: 9901, balance: 99.01 });
  });
  test.each([['apps',1,1900,'accountId','Acct_123',99], ['cryptos',3,1000,'walletAddress',bitcoin,549], ['cryptos',4,1000,'walletAddress',tron,599], ['cryptos',5,1000,'walletAddress',evm,449], ['cryptos',7,1000,'accountId','P1234567',599], ['cryptos',9,1000,'phone','+905551234567',449]])('valid %s product %s uses its file schema', async (category, productId, quantity, schema, value, chargeCents) => {
    const response = await request('POST', undefined, { data: { category, productId, quantity, fulfillmentTarget: { [schema]: value }, idempotencyKey: 'valid-category' } });
    expect(response.status).toBe(201); expect(response.body.chargeCents).toBe(chargeCents); expect((await stored(response.body.orderId)).fulfillmentSnapshot.schema).toBe(schema);
  });
  test('valid balances package purchase', async () => { const result = await service.purchaseOrder(purchase({ category: 'balances', productId: 2 })); expect(result.chargeCents).toBe(399); expect(result.quantity).toBe(500); });
  test.each(['apps','games','cryptos','balances'])('required target precedes any money mutation: %s', async category => {
    const data = category === 'apps' ? { category, productId: 1, quantity: 1900 } : category === 'cryptos' ? { category, productId: 4, quantity: 1000 } : { category, productId: category === 'balances' ? 2 : 1, packageIndex: 0 };
    expect((await request('POST', undefined, { data: { ...data, idempotencyKey: 'missing-target' } })).body.code).toBe('FULFILLMENT_TARGET_REQUIRED'); await untouched();
  });
  test.each([{ amount: 0.01 }, { userId: OTHER }, { actorId: ADMIN }, { service: 'Cheap product' }, { status: 'completed' }, { network: 'bitcoin-mainnet' }, { fulfillmentSchema: 'accountId' }, { quantity: 60 }])('rejects client financial/identity/extra fields: %p', async extra => { expect((await request('POST', undefined, { data: body(extra) })).status).toBe(400); await untouched(); });
  test.each([{}, null, [], { playerId: 123 }, { playerId: 'abc', userId: OTHER }, { accountId: 'abc' }, { playerId: { nested: 'abc' } }])('rejects invalid strict target shape: %p', async fulfillmentTarget => { expect((await request('POST', undefined, { data: body({ fulfillmentTarget }) })).status).toBe(400); await untouched(); });
  test.each(['<script>alert(1)</script>', 'abc\n', '\tabc', 'abc\0', 'abc\x7f', 'abc‮', 'abc&x', 'abc"x', "abc'x", 'a'.repeat(129), 'a'.repeat(33), 'ab', 'a b'])('rejects injection or invalid format without echo: %p', async value => {
    const response = await request('POST', undefined, { data: body({ fulfillmentTarget: { playerId: value } }) }); expect(response.status).toBe(400); expect(response.body.code).toBe('INVALID_FULFILLMENT_TARGET'); expect(JSON.stringify(response.body)).not.toContain(value); await untouched();
  });
  test.each([['payments.json','walletAddress'],['cryptos.json','accountId'],['apps.json','email'],['mobile-payments.json','walletAddress']])('HTTP fails closed on contradictory %s declaration', async (filename, schema) => {
    modify(filename, root => { root.products[0].fulfillmentSchema = schema; }); const category = catalog.FILES[filename].category;
    expect((await request('GET', `/api/${category}`)).body.code).toBe('FULFILLMENT_CONFIGURATION_INVALID');
    const data = category === 'apps' ? { category, productId: 1, quantity: 1900, idempotencyKey: 'config', fulfillmentTarget: { accountId: 'abc' } } : { category, productId: 4, quantity: 1000, idempotencyKey: 'config', fulfillmentTarget: { walletAddress: tron } };
    expect((await request('POST', undefined, { data })).body.code).toBe('FULFILLMENT_CONFIGURATION_INVALID'); await untouched();
  });
  test('insufficient funds leaves no order or journal', async () => {
    await User.collection.updateOne({ _id: oid(OWNER) }, { $set: { balance: 0.98, balanceCents: 98 } }); await expect(service.purchaseOrder(purchase())).rejects.toEqual(like(409, 'INSUFFICIENT_FUNDS'));
    expect(await account()).toMatchObject({ balanceCents: 98 }); expect(await Order.countDocuments()).toBe(0); expect(await Journal.countDocuments()).toBe(0);
  });
  test('concurrent different keys cannot overspend', async () => {
    await User.collection.updateOne({ _id: oid(OWNER) }, { $set: { balance: 1, balanceCents: 100 } });
    const results = await Promise.allSettled([service.purchaseOrder(purchase()), service.purchaseOrder(purchase({ idempotencyKey: 'purchase-2' }))]);
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1); expect(results.find(item => item.status === 'rejected').reason.code).toBe('INSUFFICIENT_FUNDS'); expect(await account()).toMatchObject({ balanceCents: 1 }); expect(await Order.countDocuments()).toBe(1); expect(await Journal.countDocuments()).toBe(1);
  });
  test('same-key concurrent HTTP requests debit once', async () => {
    const results = await Promise.all([request('POST', undefined, { data: body() }), request('POST', undefined, { data: body() })]); expect(results.map(item => item.status).sort()).toEqual([200,201]); expect(results[0].body.orderId).toBe(results[1].body.orderId); expect(await Order.countDocuments()).toBe(1); expect(await Journal.countDocuments()).toBe(1);
  });
  test('same key different target conflicts; spaces normalize equivalently', async () => {
    const first = await service.purchaseOrder(purchase()); await expect(service.purchaseOrder(purchase({ fulfillmentTarget: { playerId: 'Other_123' } }))).rejects.toEqual(like(409, 'IDEMPOTENCY_CONFLICT'));
    expect(await service.purchaseOrder(purchase({ fulfillmentTarget: { playerId: ' Player_123 ' } }))).toEqual({ ...first, replayed: true }); expect(await Journal.countDocuments()).toBe(1);
  });
  test('committed receipt survives missing current catalog and changed balance', async () => {
    const first = await service.purchaseOrder(purchase()); await service.adjustBalance({ actorId: ADMIN, userId: OWNER, balance: '200', expectedBalance: '99.01', idempotencyKey: 'later', reason: 'Later review' });
    fs.unlinkSync(path.join(directory, 'games.json')); fixture.load(); expect(await service.purchaseOrder(purchase())).toEqual({ ...first, replayed: true }); expect(await account()).toMatchObject({ balanceCents: 20000 });
  });
  test.each(['money','journal','order'])('failure AFTER actual %s write rolls back', async stage => {
    const collection = stage === 'money' ? User.collection : stage === 'journal' ? Journal.collection : Order.collection; const method = stage === 'money' ? 'updateOne' : 'insertOne'; const original = collection[method].bind(collection);
    jest.spyOn(collection, method).mockImplementationOnce(async (...args) => { await original(...args); throw new Error('After actual write'); }); await expect(service.purchaseOrder(purchase())).rejects.toEqual(like(503)); await untouched();
  });
  test('full cancellation refunds once and uses original price', async () => {
    const first = await service.purchaseOrder(purchase()); modify('games.json', root => { root.products[0].price[0] = 50; }); const refund = await service.cancelOrder(decision(first.orderId)); expect(refund).toMatchObject({ status: 'cancelled', chargeCents: 99, balanceCents: 10000 });
    expect(await service.cancelOrder(decision(first.orderId))).toEqual({ ...refund, replayed: true }); await expect(service.cancelOrder(decision(first.orderId, { idempotencyKey: 'another' }))).rejects.toEqual(like(409, 'ORDER_ALREADY_DECIDED')); expect(await Journal.countDocuments({ operationType: 'order_refund' })).toBe(1);
  });
  test('competing administrators refund exactly once', async () => {
    const first = await service.purchaseOrder(purchase()); const results = await Promise.allSettled([service.cancelOrder(decision(first.orderId)), service.cancelOrder(decision(first.orderId, { actorId: ADMIN2, idempotencyKey: 'other-admin' }))]);
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1); expect(results.find(item => item.status === 'rejected').reason.status).toBe(409); expect(await Journal.countDocuments({ operationType: 'order_refund' })).toBe(1); expect(await account()).toMatchObject({ balanceCents: 10000 });
  });
  test('completion touches no money and cannot be cancelled', async () => {
    const first = await service.purchaseOrder(purchase()); const before = await account(); const write = jest.spyOn(User.collection, 'updateOne'); const completed = await service.completeOrder(decision(first.orderId)); expect(completed.status).toBe('completed'); expect(write).not.toHaveBeenCalled(); expect(await account()).toEqual(before); expect(await Journal.countDocuments()).toBe(1);
    expect(await service.completeOrder(decision(first.orderId))).toEqual({ ...completed, replayed: true }); await expect(service.cancelOrder(decision(first.orderId))).rejects.toEqual(like(409, 'ORDER_ALREADY_DECIDED'));
  });
  test('completion/cancellation race has one terminal winner', async () => {
    const first = await service.purchaseOrder(purchase()); const results = await Promise.allSettled([service.completeOrder(decision(first.orderId)), service.cancelOrder(decision(first.orderId, { actorId: ADMIN2 }))]); expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1); const final = await stored(first.orderId); expect(await account()).toMatchObject({ balanceCents: final.status === 'cancelled' ? 10000 : 9901 });
  });
  test('suspended owner is refunded without activation', async () => {
    const first = await service.purchaseOrder(purchase()); await User.collection.updateOne({ _id: oid(OWNER) }, { $set: { accountStatus: 'suspended' } }); await service.cancelOrder(decision(first.orderId)); expect(await account()).toMatchObject({ balanceCents: 10000, accountStatus: 'suspended' });
  });
  test.each(['missing','drift','missing-cents'])('refund of %s owner state requires reconciliation', async mode => {
    const first = await service.purchaseOrder(purchase()); if (mode === 'missing') await User.collection.deleteOne({ _id: oid(OWNER) }); else await User.collection.updateOne({ _id: oid(OWNER) }, mode === 'drift' ? { $set: { balanceCents: 9900 } } : { $unset: { balanceCents: '' } }); await expect(service.cancelOrder(decision(first.orderId))).rejects.toEqual(like(409)); expect((await stored(first.orderId)).status).toBe('pending'); expect(await Journal.countDocuments({ operationType: 'order_refund' })).toBe(0);
  });
  test.each(['refund','order'])('failure after actual cancellation %s write rolls back', async stage => {
    const first = await service.purchaseOrder(purchase()); const collection = stage === 'refund' ? Journal.collection : Order.collection; const method = stage === 'refund' ? 'insertOne' : 'updateOne'; const original = collection[method].bind(collection); jest.spyOn(collection, method).mockImplementationOnce(async (...args) => { await original(...args); throw new Error('After actual refund write'); }); await expect(service.cancelOrder(decision(first.orderId))).rejects.toEqual(like(503)); expect((await stored(first.orderId)).status).toBe('pending'); expect(await account()).toMatchObject({ balanceCents: 9901 }); expect(await Journal.countDocuments()).toBe(1);
  });
  test.each(['purchase','complete','cancel'])('lost %s commit response resolves original evidence', async type => {
    const firstOrder = type === 'purchase' ? null : await service.purchaseOrder(purchase()); const start = mongoose.connection.startSession.bind(mongoose.connection); let first = true;
    jest.spyOn(mongoose.connection, 'startSession').mockImplementation(async (...args) => { const session = await start(...args); if (first) { first = false; const tx = session.withTransaction.bind(session); session.withTransaction = async (...arguments_) => { await tx(...arguments_); throw unknown(); }; } return session; });
    const result = await (type === 'purchase' ? service.purchaseOrder(purchase()) : type === 'complete' ? service.completeOrder(decision(firstOrder.orderId)) : service.cancelOrder(decision(firstOrder.orderId))); expect(result.replayed).toBe(true); expect(await Order.countDocuments()).toBe(1); expect(await Journal.countDocuments()).toBe(type === 'cancel' ? 2 : 1);
  });
  test.each(['pending','processing','accepted','rejected','completed','cancelled'])('legacy %s records remain read-only', async status => {
    await Order.collection.insertOne({ orderId: 'legacy-order', userId: OWNER, playerId: 'legacy-target', amount: 1000000, quantity: 1, status }); await expect(service.cancelOrder(decision('legacy-order'))).rejects.toEqual(like(409, 'ORDER_RECONCILIATION_REQUIRED')); await expect(service.completeOrder(decision('legacy-order'))).rejects.toEqual(like(409, 'ORDER_RECONCILIATION_REQUIRED'));
    expect((await request('GET', '/api/orders')).body[0]).toMatchObject({ legacy: true, readOnly: true, financialState: 'unverified', amount: null }); expect((await request('GET', '/api/orders/admin', { actor: ADMIN })).body).toEqual([]); expect((await request('GET', '/api/orders/summary')).body).toMatchObject({ grossChargeCents: '0', legacy: 1 }); expect(await Journal.countDocuments()).toBe(0);
  });
  test('ordinary reads stay owner-scoped; targets only appear on dedicated endpoints', async () => {
    const first = await service.purchaseOrder(purchase()); for (const actor of [OTHER, ADMIN]) { expect((await request('GET', `/api/orders/${first.orderId}`, { actor })).status).toBe(404); expect((await request('GET', `/api/orders/${first.orderId}/fulfillment`, { actor })).status).toBe(404); expect((await request('GET', `/api/orders?userId=${OWNER}`, { actor })).status).toBe(403); }
    for (const endpoint of ['/api/orders', `/api/orders/${first.orderId}`, '/api/orders/all', '/api/orders/admin']) { const result = await request('GET', endpoint, { actor: endpoint.endsWith('all') || endpoint.endsWith('admin') ? ADMIN : OWNER }); expect(JSON.stringify(result.body)).not.toContain('Player_123'); expect(JSON.stringify(result.body)).not.toContain('payloadHash'); }
    expect((await request('GET', `/api/orders/${first.orderId}/fulfillment`)).body.fulfillmentSnapshot.target.playerId).toBe('Player_123'); expect((await request('GET', `/api/orders/admin/${first.orderId}/fulfillment`, { actor: ADMIN })).status).toBe(200); expect((await request('GET', `/api/orders/admin/${first.orderId}/fulfillment`, { actor: OTHER })).status).toBe(403);
  });
  test('authentication, CSRF, token version, session and admin role enforced', async () => {
    expect((await request('POST', undefined, { actor: null, data: body() })).status).toBe(401); expect((await request('POST', undefined, { csrf: false, data: body() })).status).toBe(403); expect((await request('POST', undefined, { version: 1, data: body() })).status).toBe(401); expect((await request('POST', undefined, { headers: { 'x-session-id': 'forged' }, data: body() })).status).toBe(401);
    const first = await service.purchaseOrder(purchase()); expect((await request('PUT', `/api/orders/${first.orderId}/reject`, { data: { idempotencyKey: 'x', reason: 'Reviewed' } })).status).toBe(403); expect((await request('PUT', `/api/orders/${first.orderId}/accept`, { actor: ADMIN, csrf: false, data: { idempotencyKey: 'x', reason: 'Reviewed' } })).status).toBe(403); expect((await request('PUT', `/api/orders/${first.orderId}/reject`, { actor: ADMIN, data: { idempotencyKey: 'x', reason: 'Reviewed', amount: 100 } })).status).toBe(400); expect((await request('PUT', `/api/orders/${first.orderId}/reject`, { actor: ADMIN, data: { idempotencyKey: 'x', reason: 'Reviewed' } })).body.status).toBe('cancelled');
  });
  test.each(['purchase','complete','cancel'])('unresolved %s outcome requires same-key retry and never a fallback write', async type => {
    const firstOrder = type === 'purchase' ? null : await service.purchaseOrder(purchase());
    const start = mongoose.connection.startSession.bind(mongoose.connection); let first = true;
    jest.spyOn(mongoose.connection, 'startSession').mockImplementation(async (...args) => {
      const session = await start(...args);
      if (first) { first = false; session.withTransaction = async (work, options) => { session.startTransaction(options); await work(session); await session.abortTransaction(); throw unknown(); }; }
      return session;
    });
    const response = type === 'purchase' ? await request('POST', undefined, { data: body() }) : await request('PUT', `/api/orders/${firstOrder.orderId}/${type === 'complete' ? 'accept' : 'reject'}`, { actor: ADMIN, data: { idempotencyKey: 'decision-1', reason: 'Reviewed fulfillment' } });
    expect(response.status).toBe(503); expect(response.body).toMatchObject({ code: 'FINANCIAL_OUTCOME_UNKNOWN', retryWithSameKey: true });
    if (type === 'purchase') await untouched(); else { expect((await stored(firstOrder.orderId)).status).toBe('pending'); expect(await account()).toMatchObject({ balanceCents: 9901 }); expect(await Journal.countDocuments()).toBe(1); }
    await service.initializeFinancialFoundation();
    await (type === 'purchase' ? service.purchaseOrder(purchase()) : type === 'complete' ? service.completeOrder(decision(firstOrder.orderId)) : service.cancelOrder(decision(firstOrder.orderId)));
    expect(await Journal.countDocuments()).toBe(type === 'cancel' ? 2 : 1);
  });
  test('real debit idempotency E11000 resolves only after the aborted transaction ends', async () => {
    const first = await service.purchaseOrder(purchase()); const errors = [];
    const client = mongoose.connection.getClient(); const failed = event => { if (event.failure?.code) errors.push(event.failure.code); }; client.on('commandFailed', failed);
    // Write-error replies can have ok:1, so MongoDB reports them as succeeded commands.
    const succeeded = event => { for (const error of event.reply?.writeErrors || []) errors.push(error.code); };
    client.on('commandSucceeded', succeeded);
    const findOrder = Order.collection.findOne.bind(Order.collection), findJournal = Journal.collection.findOne.bind(Journal.collection); let hiddenOrder = false, hiddenJournal = false;
    jest.spyOn(Order.collection, 'findOne').mockImplementation(async (filter, ...args) => { if (!hiddenOrder && filter['request.actorId']) { hiddenOrder = true; return null; } return findOrder(filter, ...args); });
    jest.spyOn(Journal.collection, 'findOne').mockImplementation(async (filter, ...args) => { if (!hiddenJournal && filter.operationType === 'order_debit') { hiddenJournal = true; return null; } return findJournal(filter, ...args); });
    const start = mongoose.connection.startSession.bind(mongoose.connection); const sessions = [];
    jest.spyOn(mongoose.connection, 'startSession').mockImplementation(async (...args) => { if (sessions.length) expect(sessions[0].hasEnded).toBe(true); const session = await start(...args); sessions.push(session); return session; });
    try { expect(await service.purchaseOrder(purchase())).toEqual({ ...first, replayed: true }); expect(errors).toContain(11000); expect(await account()).toMatchObject({ balanceCents: 9901 }); expect(await Journal.countDocuments()).toBe(1); }
    finally { client.off('commandFailed', failed); client.off('commandSucceeded', succeeded); }
  });
  test.each(['available','outage'])('real completion decision-index E11000 resolves with %s reads', async mode => {
    const first = await service.purchaseOrder(purchase()); const second = await service.purchaseOrder(purchase({ idempotencyKey: 'second' })); await service.completeOrder(decision(first.orderId));
    const errors = [], client = mongoose.connection.getClient(), failed = event => { if (event.failure?.code) errors.push(event.failure.code); }; client.on('commandFailed', failed);
    // Write-error replies can have ok:1, so MongoDB reports them as succeeded commands.
    const succeeded = event => { for (const error of event.reply?.writeErrors || []) errors.push(error.code); };
    client.on('commandSucceeded', succeeded);
    const find = Order.collection.findOne.bind(Order.collection); let hidden = false;
    jest.spyOn(Order.collection, 'findOne').mockImplementation(async (filter, ...args) => {
      if (filter['decision.actorId']) { if (!hidden) { hidden = true; return null; } if (mode === 'outage' && errors.includes(11000)) throw new Error('Test-only resolution outage'); }
      return find(filter, ...args);
    });
    try { await expect(service.completeOrder(decision(second.orderId))).rejects.toEqual(like(mode === 'outage' ? 503 : 409)); expect(errors).toContain(11000); expect((await stored(second.orderId)).status).toBe('pending'); expect(await Journal.countDocuments()).toBe(2); }
    finally { client.off('commandFailed', failed); client.off('commandSucceeded', succeeded); }
  });
  test('real source/effect E11000 cannot reopen a previously refunded order', async () => {
    const first = await service.purchaseOrder(purchase()); await service.cancelOrder(decision(first.orderId));
    // Test-only raw corruption: restore pending metadata, but preserve immutable refund evidence.
    await Order.collection.updateOne({ orderId: first.orderId }, { $set: { status: 'pending' }, $unset: { decision: '', refund: '' } });
    const errors = [], client = mongoose.connection.getClient(), failed = event => { if (event.failure?.code) errors.push(event.failure.code); }; client.on('commandFailed', failed);
    // Write-error replies can have ok:1, so MongoDB reports them as succeeded commands.
    const succeeded = event => { for (const error of event.reply?.writeErrors || []) errors.push(error.code); };
    client.on('commandSucceeded', succeeded);
    const find = Journal.collection.findOne.bind(Journal.collection);
    jest.spyOn(Journal.collection, 'findOne').mockImplementation(async (filter, ...args) => filter.sourceType === 'order' && filter.effect === 'refund' ? null : find(filter, ...args));
    try { await expect(service.cancelOrder(decision(first.orderId, { idempotencyKey: 'second-refund' }))).rejects.toEqual(like(409, 'ORDER_RECONCILIATION_REQUIRED')); expect(errors).toContain(11000); expect(await account()).toMatchObject({ balanceCents: 10000 }); expect(await Journal.countDocuments({ operationType: 'order_refund' })).toBe(1); }
    finally { client.off('commandFailed', failed); client.off('commandSucceeded', succeeded); }
  });
  test('journal infrastructure outage is 503, not damaged-evidence reconciliation', async () => {
    const first = await service.purchaseOrder(purchase()); const find = Journal.collection.findOne.bind(Journal.collection);
    jest.spyOn(Journal.collection, 'findOne').mockImplementation(async (filter, ...args) => { if (filter._id) throw new Error('Test-only journal database outage'); return find(filter, ...args); });
    await expect(service.completeOrder(decision(first.orderId))).rejects.toEqual(like(503)); expect((await stored(first.orderId)).status).toBe('pending');
  });
  test('model blocks immutable target changes, bulk writes, deletion and evidence-free decisions', async () => {
    const first = await service.purchaseOrder(purchase()); const order = await Order.findOne({ orderId: first.orderId }).select('+request +fulfillmentSnapshot +decision +refund');
    order.fulfillmentSnapshot.target.playerId = 'Changed'; await expect(order.save({ validateBeforeSave: false })).rejects.toHaveProperty('code', 'UNSAFE_ORDER_UPDATE');
    for (const work of [() => Order.updateOne({ _id: order._id, status: 'pending', financialVersion: 1 }, { $set: { status: 'cancelled' } }), () => Order.updateMany({}, { $set: { status: 'completed' } }), () => Order.deleteOne({ _id: order._id }), () => Order.bulkWrite([{ deleteOne: { filter: {} } }]), () => Order.insertMany([order.toObject()])]) await expect(work()).rejects.toHaveProperty('code', 'UNSAFE_ORDER_UPDATE');
    const session = await mongoose.startSession();
    try { await expect(session.withTransaction(() => Order.updateOne({ _id: order._id, status: 'pending', financialVersion: 1 }, { $set: { 'fulfillmentSnapshot.target.playerId': 'Changed' } }, { session }))).rejects.toHaveProperty('code', 'UNSAFE_ORDER_UPDATE'); } finally { await session.endSession(); }
    expect((await stored(first.orderId)).fulfillmentSnapshot.target.playerId).toBe('Player_123');
  });
  test('even disabled save validation cannot create an order with damaged target evidence', async () => {
    const first = await service.purchaseOrder(purchase()), original = await stored(first.orderId); delete original._id; original.orderId = 'bad-copy'; original.fulfillmentSnapshot.target.playerId = '<script>';
    const order = new Order(original), session = await mongoose.startSession();
    try { await expect(session.withTransaction(() => order.save({ session, validateBeforeSave: false }))).rejects.toThrow(); } finally { await session.endSession(); }
    expect(await Order.countDocuments()).toBe(1); expect(await Journal.countDocuments()).toBe(1);
  });
  test('legacy migration is once-only and insufficient funds or invalid targets never migrate', async () => {
    await User.collection.updateOne({ _id: oid(OWNER) }, { $unset: { balanceCents: '' } });
    await expect(service.purchaseOrder(purchase({ fulfillmentTarget: { playerId: '<script>' } }))).rejects.toEqual(like(400)); expect(await account()).not.toHaveProperty('balanceCents'); expect(await Journal.countDocuments()).toBe(0);
    await User.collection.updateOne({ _id: oid(OWNER) }, { $set: { balance: 0.98 } }); await expect(service.purchaseOrder(purchase())).rejects.toEqual(like(409, 'INSUFFICIENT_FUNDS')); expect(await account()).not.toHaveProperty('balanceCents'); expect(await Order.countDocuments()).toBe(0);
    await User.collection.updateOne({ _id: oid(OWNER) }, { $set: { balance: 100 } }); await service.purchaseOrder(purchase()); await service.purchaseOrder(purchase({ idempotencyKey: 'second' })); expect(await Journal.countDocuments({ operationType: 'balance_migration' })).toBe(1); expect(await account()).toMatchObject({ balanceCents: 9802 });
  });
  test.each([[3,tron],[4,evm],[5,tron],[9,'05551234567'],[7,'a b']])('live network/schema validation refuses product %s', async (productId, value) => {
    const schema = [3,4,5].includes(productId) ? 'walletAddress' : productId === 9 ? 'phone' : 'accountId';
    expect((await request('POST', undefined, { data: { category: 'cryptos', productId, quantity: 1000, fulfillmentTarget: { [schema]: value }, idempotencyKey: 'invalid-network' } })).status).toBe(400); await untouched();
  });
  test('EVM checksummed equivalent replays using original network after metadata changes', async () => {
    const input = purchase({ category: 'cryptos', productId: 5, quantity: 1000, fulfillmentTarget: { walletAddress: evm } }); delete input.packageIndex;
    const first = await service.purchaseOrder(input); modify('cryptos.json', root => { root.products.find(p => p.id === 5).fulfillmentNetwork = 'tron-mainnet'; });
    expect(await service.purchaseOrder({ ...input, fulfillmentTarget: { walletAddress: evm.toLowerCase() } })).toEqual({ ...first, replayed: true }); expect((await stored(first.orderId)).fulfillmentSnapshot.network).toBe('bsc-mainnet');
  });
  test('summary uses exact modern net charges and excludes legacy monetary claims', async () => {
    const first = await service.purchaseOrder(purchase()); await service.purchaseOrder(purchase({ idempotencyKey: 'second' })); await service.cancelOrder(decision(first.orderId));
    await Order.collection.insertOne({ orderId: 'legacy', userId: OWNER, amount: 9999999, status: 'pending' }); expect((await request('GET', '/api/orders/summary')).body).toMatchObject({ grossChargeCents: '198', refundCents: '99', netChargeCents: '99', legacy: 1, pending: 1, cancelled: 1 });
  });
  test.each([['apps',1000001], ['apps',1], ['games',1]])('quantity/charge policy refuses %s selection %s', async (category, quantity) => {
    if (category === 'games') modify('games.json', root => { root.products[0].price[0] = 500.01; });
    const input = category === 'apps' ? { category, productId: 1, quantity, fulfillmentTarget: { accountId: 'Account_123' }, idempotencyKey: 'cap' } : body();
    expect((await request('POST', undefined, { data: input })).status).toBe(400); await untouched();
  });
  test('one final half-up rounding settles proportional cents', async () => {
    const input = purchase({ category: 'cryptos', productId: 4, quantity: 500, fulfillmentTarget: { walletAddress: tron } }); delete input.packageIndex;
    const result = await service.purchaseOrder(input); expect(result.chargeCents).toBe(300); expect(await account()).toMatchObject({ balanceCents: 9700 });
  });
  test('callback retry pins catalog pricing and rechecks current authorization', async () => {
    const original = User.collection.updateOne.bind(User.collection); let first = true;
    jest.spyOn(User.collection, 'updateOne').mockImplementation(async (...args) => {
      const result = await original(...args);
      if (first) { first = false; modify('games.json', root => { root.products[0].price[0] = 50; }); const error = new mongoose.mongo.MongoServerError({ message: 'Test-only retry', code: 112 }); error.addErrorLabel('TransientTransactionError'); throw error; }
      return result;
    });
    expect((await service.purchaseOrder(purchase())).chargeCents).toBe(99); expect(catalog.resolvePurchase).toHaveBeenCalledTimes(1); expect(await Journal.countDocuments()).toBe(1); expect(await account()).toMatchObject({ balanceCents: 9901 });
  });
  test.each(['overflow','unrepresentable'])('refund %s balance fails atomically', async mode => {
    if (mode === 'unrepresentable') modify('games.json', root => { root.products[0].price[0] = 0.01; });
    else modify('games.json', root => { root.products[0].price[0] = 25; });
    const first = await service.purchaseOrder(purchase()); const cents = MAX_CENTS - 1001, balance = Number(formatMoney(cents));
    await User.collection.updateOne({ _id: oid(OWNER) }, { $set: { balanceCents: cents, balance } });
    await expect(service.cancelOrder(decision(first.orderId))).rejects.toEqual(like(400)); expect(await account()).toMatchObject({ balanceCents: cents, balance }); expect((await stored(first.orderId)).status).toBe('pending'); expect(await Journal.countDocuments()).toBe(1);
  });
  test('authorization is rechecked after an actual aborted callback', async () => {
    const start = mongoose.connection.startSession.bind(mongoose.connection); let first = true;
    jest.spyOn(mongoose.connection, 'startSession').mockImplementation(async (...args) => {
      const session = await start(...args);
      if (first) { first = false; const transaction = session.withTransaction.bind(session); session.withTransaction = async (work, options) => {
        session.startTransaction(options); await work(session); await session.abortTransaction();
        await User.collection.updateOne({ _id: oid(OWNER) }, { $set: { tokenVersion: 1 } });
        return transaction(work, options);
      }; }
      return session;
    });
    await expect(service.purchaseOrder(purchase({ tokenVersion: 0 }))).rejects.toEqual(like(403, 'FINANCIAL_FORBIDDEN')); expect(await Order.countDocuments()).toBe(0); expect(await Journal.countDocuments()).toBe(0); expect(await account()).toMatchObject({ balanceCents: 10000 });
  });
  test('legacy creation is disabled', async () => { expect((await request('POST', '/api/orders', { data: body() })).status).toBe(410); await untouched(); });
  test('target-free product requires explicit no-target policy', async () => {
    modify('games.json', root => { root.products[0].requiresFulfillmentTarget = false; root.products[0].fulfillmentSchema = null; }); await expect(service.purchaseOrder(purchase())).rejects.toEqual(like(400, 'UNKNOWN_PURCHASE_FIELD')); const input = purchase(); delete input.fulfillmentTarget; const first = await service.purchaseOrder(input); expect((await stored(first.orderId)).fulfillmentSnapshot).toBeNull();
  });
});
