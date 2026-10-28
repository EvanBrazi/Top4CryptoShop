'use strict';

const mongoose = require('../node_modules/mongoose');
const User = require('../models/User');
const Journal = require('../models/FinancialOperation');
const service = require('../services/financialService');
const { hasMongod, startMongoServer } = require('./helpers/mongoServer');
const liveTests = hasMongod ? describe : describe.skip;
const ACTOR_ID = 'abcdef0123456789abcdef02';
const USER_ID = 'abcdef0123456789abcdef01';
const OTHER_USER = 'abcdef0123456789abcdef03';
const OTHER_ACTOR = 'abcdef0123456789abcdef04';
const connectOptions = { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000, monitorCommands: true };
const request = extra => ({ actorId: ACTOR_ID, userId: USER_ID, balance: '125.00', expectedBalance: '100.00',
  idempotencyKey: 'request-1', reason: 'Reviewed adjustment', ...extra });
const expectedError = (status, code) => expect.objectContaining({ status, code });
function record(_id, extra = {}) {
  return { _id: new mongoose.Types.ObjectId(_id), username: `User_${_id}`, email: `${_id}@example.com`,
    provider: 'google', role: 'user', accountStatus: 'active', balance: 100, balanceCents: 10000, tokenVersion: 0, __v: 0, ...extra };
}
function labelledUnknown() {
  const error = new mongoose.mongo.MongoServerError({ message: 'Test-only ambiguous commit response', code: 50 });
  error.addErrorLabel('UnknownTransactionCommitResult');
  return error;
}

liveTests('Financial service: owned real standalone MongoDB', () => {
  let server;
  beforeAll(async () => {
    server = await startMongoServer();
    await mongoose.connect(server.uri, connectOptions);
  }, 60000);
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    try { await mongoose.disconnect(); } finally { if (server) await server.stop(); }
  }, 30000);

  test('rejects actual standalone hello before any probe or financial write', async () => {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    expect(hello.setName).toBeUndefined();
    const collectionsBefore = await mongoose.connection.db.listCollections().toArray();
    await expect(service.initializeFinancialFoundation()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    await expect(service.adjustBalance(request())).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    expect(await mongoose.connection.db.listCollections().toArray()).toEqual(collectionsBefore);
  });
  test('the actual write-and-abort probe ALSO fails on standalone if preliminary hello is misleading', async () => {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    // Test-only deception of the preliminary check; actual insert still goes to the real standalone.
    jest.spyOn(mongoose.connection.db, 'admin').mockReturnValue({ command: jest.fn().mockResolvedValue({ ...hello, setName: 'test-only-misleading-hello' }) });
    await expect(service.initializeFinancialFoundation()).rejects.toMatchObject({ status: 503,
      code: 'FINANCIAL_UNAVAILABLE', cause: { code: 20 } });
    expect(await mongoose.connection.db.collection('_financial_transaction_probes').countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
    expect(await Journal.countDocuments()).toBe(0);
    await expect(service.assertFinancialReady()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
  });
});

liveTests('Financial service: real replica-set transaction integration', () => {
  let server;
  beforeAll(async () => {
    server = await startMongoServer({ replicaSet: 'financial-service-tests' });
    await mongoose.connect(server.uri, connectOptions);
    await service.initializeFinancialFoundation();
  }, 60000);
  beforeEach(async () => {
    // Raw APIs are restricted to fixtures/cleanup in this owned, disposable database.
    await Journal.collection.deleteMany({});
    await User.collection.deleteMany({});
    await User.collection.insertOne(record(ACTOR_ID, { role: 'admin', balance: 0, balanceCents: 0 }));
    await User.collection.insertOne(record(USER_ID));
    await service.initializeFinancialFoundation();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    try { await mongoose.disconnect(); } finally { if (server) await server.stop(); }
  }, 30000);
  async function account(userId = USER_ID) { return User.findById(userId).lean(); }

  test('initialization installs real unique/partial indexes and leaves no persisted probe', async () => {
    await expect(service.assertFinancialReady()).resolves.toBeUndefined();
    expect(await mongoose.connection.db.collection('_financial_transaction_probes').countDocuments()).toBe(0);
    const indexes = await Journal.collection.indexes();
    expect(indexes.find(index => index.name === 'financial_actor_operation_idempotency')).toMatchObject({ unique: true,
      key: { actorId: 1, operationType: 1, idempotencyKey: 1 } });
    expect(indexes.find(index => index.name === 'financial_source_effect_once')).toMatchObject({ unique: true,
      partialFilterExpression: { sourceType: { $type: 'string' }, sourceId: { $type: 'string' }, effect: { $type: 'string' } } });
    for (const index of indexes) expect(index).not.toHaveProperty('expireAfterSeconds');
    expect(await Journal.countDocuments()).toBe(0);
  });
  test('atomically commits both balance fields and the exact adjustment journal', async () => {
    const outcome = await service.adjustBalance(request());
    expect(outcome).toMatchObject({ userId: USER_ID, currency: 'USD', balance: '125.00', balanceCents: 12500, replayed: false });
    expect(await account()).toMatchObject({ balance: 125, balanceCents: 12500 });
    const operation = await Journal.findById(outcome.operationId).lean();
    expect(operation).toMatchObject({ operationType: 'balance_adjustment', beforeCents: 10000, afterCents: 12500, deltaCents: 2500,
      reason: 'Reviewed adjustment', result: { balanceCents: 12500, balance: '125.00' } });
    expect(operation.payloadHash).toMatch(/^[a-f\d]{64}$/);
    expect(operation.sourceId).toBeUndefined();
  });
  test('real commands use snapshot reads, majority commit and the same transaction session', async () => {
    const commands = [];
    const client = mongoose.connection.getClient();
    const observe = event => { if (['find', 'findAndModify', 'insert', 'commitTransaction'].includes(event.commandName)) commands.push(event.command); };
    client.on('commandStarted', observe);
    try { await service.adjustBalance(request()); }
    finally { client.off('commandStarted', observe); }
    expect(commands[0]).toMatchObject({ readConcern: { level: 'snapshot' }, autocommit: false });
    expect(commands.find(command => command.commitTransaction)).toMatchObject({ writeConcern: { w: 'majority' } });
    expect(commands.some(command => command.findAndModify)).toBe(true);
    expect(commands.some(command => command.insert === Journal.collection.collectionName)).toBe(true);
    for (const command of commands) expect(command.lsid).toEqual(commands[0].lsid);
  });
  test('replay returns the original committed result even after a later adjustment changes the balance', async () => {
    const first = await service.adjustBalance(request());
    await service.adjustBalance(request({ balance: '200', expectedBalance: '125', idempotencyKey: 'request-2' }));
    const replay = await service.adjustBalance(request({ balance: 125, expectedBalance: '100', reason: ' Reviewed adjustment ' }));
    expect(replay).toEqual({ ...first, replayed: true });
    expect(await account()).toMatchObject({ balance: 200, balanceCents: 20000 });
    expect(await Journal.countDocuments()).toBe(2);
  });
  test('a stale expected balance rejects without changing either balance or the journal', async () => {
    await expect(service.adjustBalance(request({ expectedBalance: '99.99' }))).rejects.toEqual(expectedError(409, 'EXPECTED_BALANCE_MISMATCH'));
    expect(await account()).toMatchObject({ balance: 100, balanceCents: 10000 });
    expect(await Journal.countDocuments()).toBe(0);
  });
  test.each([{ balance: '126' }, { expectedBalance: '99' }, { reason: 'A different audit reason' }, { userId: OTHER_USER }])('conflicting payload under the same key rejects: %p', async extra => {
    await service.adjustBalance(request());
    await expect(service.adjustBalance(request(extra))).rejects.toEqual(expectedError(409, 'IDEMPOTENCY_CONFLICT'));
    expect(await account()).toMatchObject({ balance: 125, balanceCents: 12500 });
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('concurrent identical requests commit once and all return the same operation', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => service.adjustBalance(request())));
    expect(new Set(results.map(result => result.operationId)).size).toBe(1);
    expect(results.filter(result => !result.replayed)).toHaveLength(1);
    expect(await account()).toMatchObject({ balance: 125, balanceCents: 12500 });
    expect(await Journal.countDocuments()).toBe(1);
  }, 30000);
  test('concurrent conflicting requests survive a real write-conflict retry without updating the losing target', async () => {
    await User.collection.insertOne(record(OTHER_USER));
    let releaseSecond, markSecondPrepared;
    const firstCommitted = new Promise(resolve => { releaseSecond = resolve; });
    const secondPrepared = new Promise(resolve => { markSecondPrepared = resolve; });
    const save = Journal.prototype.save;
    const insert = Journal.collection.insertOne.bind(Journal.collection);
    const duplicateCodes = [];
    jest.spyOn(Journal.collection, 'insertOne').mockImplementation(async (...args) => {
      try { return await insert(...args); } catch (error) { duplicateCodes.push(error.code); throw error; }
    });
    jest.spyOn(Journal.prototype, 'save').mockImplementation(async function (...args) {
      if (String(this.userId) === OTHER_USER) { markSecondPrepared(); await firstCommitted; }
      else await secondPrepared;
      return save.apply(this, args);
    });
    const first = service.adjustBalance(request());
    const second = service.adjustBalance(request({ userId: OTHER_USER }));
    const settledSecond = second.then(value => ({ value }), error => ({ error }));
    try { await first; } finally { releaseSecond(); }
    const loser = await settledSecond;
    expect(duplicateCodes).toContain(112); // MongoDB retries this stale-snapshot collision as WriteConflict.
    expect(loser.error).toEqual(expectedError(409, 'IDEMPOTENCY_CONFLICT'));
    expect(await account()).toMatchObject({ balance: 125, balanceCents: 12500 });
    expect(await account(OTHER_USER)).toMatchObject({ balance: 100, balanceCents: 10000 });
    expect(await Journal.countDocuments()).toBe(1);
  }, 30000);
  test('concurrent terminal E11000 failures resolve the original result after aborting, not through replacement writes', async () => {
    const input = request({ balance: '100' });
    const first = await service.adjustBalance(input);
    const find = Journal.collection.findOne.bind(Journal.collection);
    const insert = Journal.collection.insertOne.bind(Journal.collection);
    const duplicateCodes = [];
    let misses = 2;
    // MongoDB ordinarily reports stale-snapshot races as 112. Force two lookup misses
    // against an ALREADY committed key to exercise terminal 11000 from the REAL unique index.
    // No fake database error is injected, and all writes/aborts/resolution are real transactions.
    jest.spyOn(Journal.collection, 'findOne').mockImplementation(async (filter, ...args) => {
      const result = await find(filter, ...args);
      if (filter.operationType === 'balance_adjustment' && misses > 0) { misses -= 1; return null; }
      return result;
    });
    jest.spyOn(Journal.collection, 'insertOne').mockImplementation(async (...args) => {
      try { return await insert(...args); } catch (error) { duplicateCodes.push(error.code); throw error; }
    });
    const outcomes = await Promise.all([service.adjustBalance(input), service.adjustBalance(input)]);
    expect(duplicateCodes).toContain(11000);
    for (const result of outcomes) expect(result).toEqual({ ...first, replayed: true });
    expect(await account()).toMatchObject({ balance: 100, balanceCents: 10000 });
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('different keys competing for the same expected balance cannot both overwrite funds', async () => {
    const results = await Promise.allSettled([
      service.adjustBalance(request()),
      service.adjustBalance(request({ idempotencyKey: 'request-2', balance: '150' }))
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason).toEqual(expectedError(409, 'EXPECTED_BALANCE_MISMATCH'));
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('zero-delta adjustments are journaled, not silently skipped', async () => {
    await service.adjustBalance(request({ balance: '100' }));
    expect(await Journal.findOne().lean()).toMatchObject({ deltaCents: 0, beforeCents: 10000, afterCents: 10000 });
  });
  test('negative deltas are exact and cannot make the balance negative', async () => {
    await service.adjustBalance(request({ balance: '0.29' }));
    expect(await account()).toMatchObject({ balance: 0.29, balanceCents: 29 });
    expect(await Journal.findOne().lean()).toMatchObject({ deltaCents: -9971 });
  });
  test('case-sensitive keys remain distinct', async () => {
    await service.adjustBalance(request({ idempotencyKey: 'Case-A' }));
    await service.adjustBalance(request({ idempotencyKey: 'case-a', expectedBalance: '125', balance: '150' }));
    expect(await Journal.countDocuments()).toBe(2);
  });
  test('the same key is independently scoped to different authorized actors', async () => {
    await User.collection.insertOne(record(OTHER_ACTOR, { role: 'admin' }));
    await service.adjustBalance(request());
    await service.adjustBalance(request({ actorId: OTHER_ACTOR, expectedBalance: '125', balance: '150' }));
    expect(await Journal.countDocuments()).toBe(2);
  });
  test('a revoked administrator cannot even replay a previously committed operation', async () => {
    await service.adjustBalance(request());
    await User.updateOne({ _id: ACTOR_ID }, { $set: { role: 'user' } });
    await expect(service.adjustBalance(request())).rejects.toEqual(expectedError(403, 'FINANCIAL_FORBIDDEN'));
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('inactive administrators are rejected without writes', async () => {
    await User.updateOne({ _id: ACTOR_ID }, { $set: { accountStatus: 'suspended' } });
    await expect(service.adjustBalance(request())).rejects.toEqual(expectedError(403, 'FINANCIAL_FORBIDDEN'));
    expect(await account()).toMatchObject({ balanceCents: 10000 });
    expect(await Journal.countDocuments()).toBe(0);
  });
  test('missing/inactive targets are rejected before financial writes', async () => {
    await expect(service.adjustBalance(request({ userId: OTHER_USER }))).rejects.toEqual(expectedError(404, 'FINANCIAL_USER_NOT_FOUND'));
    await User.updateOne({ _id: USER_ID }, { $set: { accountStatus: 'suspended' } });
    await expect(service.adjustBalance(request())).rejects.toEqual(expectedError(409, 'FINANCIAL_USER_INACTIVE'));
    expect(await Journal.countDocuments()).toBe(0);
  });
  test('exact legacy adoption and adjustment commit with a single globally deduplicated migration', async () => {
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(USER_ID) }, { $set: { balance: 12.34 }, $unset: { balanceCents: '' } });
    const first = await service.adjustBalance(request({ expectedBalance: '12.34' }));
    expect(await account()).toMatchObject({ balance: 125, balanceCents: 12500 });
    const migration = await Journal.findOne({ operationType: 'balance_migration' }).lean();
    expect(migration).toMatchObject({ sourceType: 'user', sourceId: USER_ID, effect: 'migration',
      beforeCents: 1234, afterCents: 1234, deltaCents: 0, result: { balanceCents: 1234, balance: '12.34' } });
    await expect(service.adjustBalance(request({ expectedBalance: '12.34' }))).resolves.toEqual({ ...first, replayed: true });
    await service.adjustBalance(request({ balance: '150', expectedBalance: '125', idempotencyKey: 'request-2' }));
    expect(await Journal.countDocuments({ operationType: 'balance_migration' })).toBe(1);
    expect(await Journal.countDocuments()).toBe(3);
  });
  test.each([
    { balance: 1.005, balanceCents: undefined }, { balance: 0.1 + 0.2, balanceCents: undefined },
    { balance: 100, balanceCents: 9999 }, { balance: 100, balanceCents: null },
    { balance: '100', balanceCents: undefined }, { balance: undefined, balanceCents: undefined }
  ])('invalid raw monetary state requires reconciliation, not silent replacement: %p', async state => {
    const raw = record(USER_ID, state);
    for (const key of ['balance', 'balanceCents']) if (raw[key] === undefined) delete raw[key];
    await User.collection.replaceOne({ _id: raw._id }, raw);
    await expect(service.adjustBalance(request())).rejects.toEqual(expectedError(409, 'BALANCE_RECONCILIATION_REQUIRED'));
    const after = await account();
    expect(after.balance).toEqual(raw.balance);
    expect(after.balanceCents).toEqual(raw.balanceCents);
    expect(await Journal.countDocuments()).toBe(0);
  });
  test('a stale expected balance on a legacy account does not opportunistically migrate it', async () => {
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(USER_ID) }, { $unset: { balanceCents: '' } });
    await expect(service.adjustBalance(request({ expectedBalance: '99' }))).rejects.toEqual(expectedError(409, 'EXPECTED_BALANCE_MISMATCH'));
    expect(await account()).not.toHaveProperty('balanceCents');
    expect(await Journal.countDocuments()).toBe(0);
  });
  test('a journal failure rolls back the balance update, migration and adjustment together', async () => {
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(USER_ID) }, { $unset: { balanceCents: '' } });
    const save = Journal.prototype.save;
    jest.spyOn(Journal.prototype, 'save').mockImplementation(function (...args) {
      if (this.operationType === 'balance_adjustment') throw new Error('Test-only failure after migration insert');
      return save.apply(this, args);
    });
    await expect(service.adjustBalance(request())).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    expect(await account()).toMatchObject({ balance: 100 });
    expect(await account()).not.toHaveProperty('balanceCents');
    expect(await Journal.countDocuments()).toBe(0);
  });
  test('a previously journaled migration cannot be silently repeated after raw cents removal', async () => {
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(USER_ID) }, { $unset: { balanceCents: '' } });
    await service.adjustBalance(request());
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(USER_ID) }, { $unset: { balanceCents: '' } });
    await expect(service.adjustBalance(request({ expectedBalance: '125', balance: '150', idempotencyKey: 'request-2' })))
      .rejects.toEqual(expectedError(409, 'BALANCE_RECONCILIATION_REQUIRED'));
    expect(await account()).not.toHaveProperty('balanceCents');
    expect(await Journal.countDocuments()).toBe(2);
  });
  test('a real commit failpoint yields 503 unknown outcome, with no unsafe write fallback', async () => {
    const admin = mongoose.connection.db.admin();
    await admin.command({ configureFailPoint: 'failCommand', mode: { times: 1 }, data: {
      failCommands: ['commitTransaction'], errorCode: 50, errorLabels: ['UnknownTransactionCommitResult']
    } });
    try {
      await expect(service.adjustBalance(request())).rejects.toMatchObject({ status: 503,
        code: 'FINANCIAL_OUTCOME_UNKNOWN', retryWithSameKey: true });
    } finally { await admin.command({ configureFailPoint: 'failCommand', mode: 'off' }); }
    expect(await account()).toMatchObject({ balance: 100, balanceCents: 10000 });
    expect(await Journal.countDocuments()).toBe(0);
    await expect(service.assertFinancialReady()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    await service.initializeFinancialFoundation();
    await expect(service.adjustBalance(request())).resolves.toMatchObject({ balanceCents: 12500 });
    expect(await Journal.countDocuments()).toBe(1);
  }, 30000);
  test('an ambiguous response AFTER a real commit is resolved from the durable journal', async () => {
    const original = mongoose.mongo.ClientSession.prototype.withTransaction;
    let first = true;
    jest.spyOn(mongoose.mongo.ClientSession.prototype, 'withTransaction').mockImplementation(async function (...args) {
      const result = await original.apply(this, args);
      if (first) { first = false; throw labelledUnknown(); }
      return result;
    });
    const result = await service.adjustBalance(request());
    expect(result).toMatchObject({ balance: '125.00', balanceCents: 12500, replayed: true });
    expect(await account()).toMatchObject({ balance: 125, balanceCents: 12500 });
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('a real conflicting index definition prevents readiness without destructive index repair', async () => {
    const name = 'financial_actor_operation_idempotency';
    const key = { actorId: 1, operationType: 1, idempotencyKey: 1 };
    await mongoose.disconnect();
    await mongoose.connect(server.uri, connectOptions);
    await Journal.collection.dropIndex(name); // Owned disposable fixture only.
    await Journal.collection.createIndex(key, { name, unique: false, collation: { locale: 'simple' } });
    try {
      await expect(service.initializeFinancialFoundation()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
      await expect(service.assertFinancialReady()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
      expect((await Journal.collection.indexes()).find(index => index.name === name).unique).not.toBe(true);
      expect(await Journal.countDocuments()).toBe(0);
    } finally {
      await Journal.collection.dropIndex(name);
      await Journal.createIndexes();
      await service.initializeFinancialFoundation();
    }
  });
  test('disconnecting and reconnecting does not reuse old readiness', async () => {
    await mongoose.disconnect();
    await expect(service.assertFinancialReady()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    await mongoose.connect(server.uri, connectOptions);
    await expect(service.assertFinancialReady()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    await service.initializeFinancialFoundation();
    await expect(service.assertFinancialReady()).resolves.toBeUndefined();
    expect(await mongoose.connection.db.collection('_financial_transaction_probes').countDocuments()).toBe(0);
  });
});
