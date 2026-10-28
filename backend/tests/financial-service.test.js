'use strict';

const mongoose = require('../node_modules/mongoose');
const User = require('../models/User');
const Journal = require('../models/FinancialOperation');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const service = require('../services/financialService');
const { MAX_CENTS, formatMoney } = require('../utils/money');
const ACTOR_ID = 'abcdef0123456789abcdef02';
const USER_ID = 'abcdef0123456789abcdef01';
const connection = mongoose.connection;
const request = extra => ({ actorId: ACTOR_ID, userId: USER_ID, balance: '125.00', expectedBalance: '100',
  idempotencyKey: 'request-1', reason: 'Reviewed adjustment', ...extra });
const expectedError = (status, code) => expect.objectContaining({ status, code });

class TestSession {
  constructor() {
    this.active = false;
    this.hasEnded = false;
    this.startTransaction = jest.fn(() => { this.active = true; });
    this.abortTransaction = jest.fn(async () => { this.active = false; });
    this.endSession = jest.fn(async () => { this.active = false; this.hasEnded = true; });
    this.withTransaction = jest.fn(async (work, options) => {
      this.startTransaction(options);
      try { const result = await work(); this.active = false; return result; }
      catch (error) { await this.abortTransaction(); throw error; }
    });
  }
  inTransaction() { return this.active; }
}
function unknownCommit() {
  const error = new Error('private simulated transport detail');
  error.errorLabels = ['UnknownTransactionCommitResult'];
  return error;
}
function duplicate() {
  return Object.assign(new Error('private duplicate detail'), {
    code: 11000, keyPattern: { actorId: 1, operationType: 1, idempotencyKey: 1 }
  });
}

describe('Financial service: mocked readiness and failure paths', () => {
  let dbBefore, db, client, probes, sessions, actor, target, records, installed;
  beforeEach(() => {
    connection.emit('disconnected');
    dbBefore = connection.db;
    client = {};
    sessions = [];
    actor = { _id: new mongoose.Types.ObjectId(ACTOR_ID), role: 'admin', accountStatus: 'active' };
    target = { _id: new mongoose.Types.ObjectId(USER_ID), accountStatus: 'active', balance: 100, balanceCents: 10000 };
    records = [];
    const writtenProbes = new Map();
    probes = {
      insertOne: jest.fn(async data => { writtenProbes.set(data._id, data); return { acknowledged: true }; }),
      findOne: jest.fn(async (filter, options) => options.session ? writtenProbes.get(filter._id) : null)
    };
    db = {
      admin: () => ({ command: db.command }),
      command: jest.fn().mockResolvedValue({ setName: 'tests', logicalSessionTimeoutMinutes: 30, maxWireVersion: 25 }),
      createCollection: jest.fn().mockResolvedValue({}),
      collection: jest.fn().mockReturnValue(probes)
    };
    connection.db = db;
    // readyState is a non-configurable getter; do not invoke its eventful setter in a disconnected fixture.
    connection._readyState = 1;
    jest.spyOn(connection, 'getClient').mockImplementation(() => client);
    jest.spyOn(connection, 'startSession').mockImplementation(async () => {
      const session = new TestSession(); sessions.push(session); return session;
    });
    installed = Journal.schema.indexes().map(([key, options]) => ({ key, ...options }));
    jest.spyOn(Order, 'createIndexes').mockResolvedValue([]);
    jest.spyOn(Order.collection, 'indexes').mockResolvedValue(Order.schema.indexes().map(([key, options]) => ({ key, ...options })));
    jest.spyOn(Payment, 'createIndexes').mockResolvedValue([]);
    jest.spyOn(Payment.collection, 'indexes').mockResolvedValue(Payment.schema.indexes().map(([key, options]) => ({ key, ...options })));
    jest.spyOn(Journal, 'createIndexes').mockResolvedValue([]);
    jest.spyOn(Journal.collection, 'indexes').mockImplementation(async () => installed);
    jest.spyOn(User.collection, 'findOne').mockImplementation(async filter => String(filter._id) === ACTOR_ID ? actor : target);
    jest.spyOn(User.collection, 'findOneAndUpdate').mockImplementation(async (_filter, update) => ({ ...target, ...update.$set }));
    jest.spyOn(Journal.collection, 'findOne').mockImplementation(async filter => records.find(record =>
      filter.sourceType ? record.sourceType === filter.sourceType && record.sourceId === filter.sourceId && record.effect === filter.effect :
        String(record.actorId) === String(filter.actorId) && record.operationType === filter.operationType && record.idempotencyKey === filter.idempotencyKey) || null);
    jest.spyOn(Journal.collection, 'insertOne').mockImplementation(async record => {
      records.push(record); return { acknowledged: true, insertedId: record._id };
    });
  });
  afterEach(() => {
    connection.emit('disconnected');
    jest.restoreAllMocks();
    connection.db = dbBefore;
    connection._readyState = 0;
  });
  async function ready() { await service.initializeFinancialFoundation(); }

  test('exports only the approved API and no callback/notification API', () => {
    expect(Object.keys(service).sort()).toEqual(['FinancialError', 'adjustBalance', 'assertFinancialReady', 'initializeFinancialFoundation', 'approvePayment', 'rejectPayment', 'purchaseOrder', 'completeOrder', 'cancelOrder'].sort());
  });
  test('uninitialized service refuses financial writes', async () => {
    await expect(service.assertFinancialReady()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    await expect(service.adjustBalance(request())).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    expect(connection.startSession).not.toHaveBeenCalled();
    expect(User.collection.findOneAndUpdate).not.toHaveBeenCalled();
  });
  test('prepares named indexes and writes, reads, aborts and verifies only a private probe', async () => {
    await expect(service.initializeFinancialFoundation()).resolves.toEqual({ ready: true, currency: 'USD' });
    expect(db.createCollection.mock.calls.map(call => call[0])).toEqual([User.collection.collectionName, Journal.collection.collectionName, Payment.collection.collectionName, Order.collection.collectionName, '_financial_transaction_probes']);
    expect(Journal.createIndexes).toHaveBeenCalledTimes(1);
    expect(probes.insertOne).toHaveBeenCalledTimes(1);
    expect(probes.findOne).toHaveBeenCalledTimes(2);
    expect(sessions[0].startTransaction).toHaveBeenCalledWith(expect.objectContaining({
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary'
    }));
    expect(sessions[0].abortTransaction).toHaveBeenCalledTimes(1);
    expect(sessions[0].endSession).toHaveBeenCalledTimes(1);
    expect(sessions[0].withTransaction).not.toHaveBeenCalled();
    expect(User.collection.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Journal.collection.insertOne).not.toHaveBeenCalled();
  });
  test('shares initialization in flight and allows readiness to await it', async () => {
    await Promise.all([ready(), ready(), service.assertFinancialReady()]);
    expect(db.command).toHaveBeenCalledTimes(1);
    expect(probes.insertOne).toHaveBeenCalledTimes(1);
  });
  test.each([
    { logicalSessionTimeoutMinutes: 30, maxWireVersion: 25 },
    { setName: 'tests', maxWireVersion: 25 },
    { setName: 'tests', logicalSessionTimeoutMinutes: 30, maxWireVersion: 6 },
    { msg: 'isdbgrid', logicalSessionTimeoutMinutes: 30, maxWireVersion: 7 }
  ])('rejects unsupported topology/session support: %p', async hello => {
    db.command.mockResolvedValue(hello);
    await expect(ready()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    expect(db.createCollection).not.toHaveBeenCalled();
    expect(probes.insertOne).not.toHaveBeenCalled();
  });
  test('accepts supported mongos only after the probe passes', async () => {
    db.command.mockResolvedValue({ msg: 'isdbgrid', logicalSessionTimeoutMinutes: 30, maxWireVersion: 8 });
    await ready();
    expect(probes.insertOne).toHaveBeenCalledTimes(1);
  });
  test('rejects the actual probe write failure even when hello looks supported', async () => {
    probes.insertOne.mockRejectedValue(Object.assign(new Error('standalone transaction write'), { code: 20 }));
    await expect(ready()).rejects.toMatchObject({ status: 503, code: 'FINANCIAL_UNAVAILABLE', cause: { code: 20 } });
    expect(sessions[0].abortTransaction).toHaveBeenCalledTimes(1);
    expect(sessions[0].endSession).toHaveBeenCalledTimes(1);
    await expect(service.assertFinancialReady()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
  });
  test('fails closed when an aborted probe is visible outside its transaction', async () => {
    probes.findOne.mockResolvedValueOnce({ probe: true }).mockResolvedValueOnce({ probe: true });
    await expect(ready()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    expect(sessions[0].endSession).toHaveBeenCalledTimes(1);
  });
  test('fails closed if the probe abort fails', async () => {
    connection.startSession.mockImplementation(async () => {
      const session = new TestSession();
      session.abortTransaction.mockRejectedValue(new Error('abort failed'));
      sessions.push(session); return session;
    });
    await expect(ready()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    expect(sessions[0].endSession).toHaveBeenCalledTimes(1);
  });
  test.each(['missing', 'notUnique', 'wrongPartial', 'wrongCollation', 'wrongKeyOrder', 'ttl', 'extraTtl'])('rejects an invalid installed index: %s', async mode => {
    if (mode === 'missing') installed.shift();
    if (mode === 'notUnique') installed[0].unique = false;
    if (mode === 'wrongPartial') installed[1].partialFilterExpression = { sourceType: { $exists: true } };
    if (mode === 'wrongCollation') installed[0].collation = { locale: 'en', strength: 2 };
    if (mode === 'wrongKeyOrder') installed[0].key = { operationType: 1, actorId: 1, idempotencyKey: 1 };
    if (mode === 'ttl') installed[0].expireAfterSeconds = 60;
    if (mode === 'extraTtl') installed.push({ name: 'unrelated_ttl', key: { createdAt: 1 }, expireAfterSeconds: 60 });
    await expect(ready()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    expect(probes.insertOne).not.toHaveBeenCalled();
  });
  test.each(['missing', 'notUnique', 'wrongPartial', 'wrongCollation', 'ttl', 'extraTtl'])('rejects invalid Payment decision/replay index: %s', async mode => {
    const paymentIndexes = Payment.schema.indexes().map(([key, options]) => ({ key, ...options }));
    if (mode === 'missing') paymentIndexes.shift();
    if (mode === 'notUnique') paymentIndexes[1].unique = false;
    if (mode === 'wrongPartial') paymentIndexes[1].partialFilterExpression = { 'decision.actorId': { $exists: true } };
    if (mode === 'wrongCollation') paymentIndexes[1].collation = { locale: 'en', strength: 2 };
    if (mode === 'ttl') paymentIndexes[1].expireAfterSeconds = 60;
    if (mode === 'extraTtl') paymentIndexes.push({ name: 'extra_payment_ttl', key: { createdAt: 1 }, expireAfterSeconds: 60 });
    Payment.collection.indexes.mockResolvedValue(paymentIndexes);
    await expect(ready()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    expect(probes.insertOne).not.toHaveBeenCalled();
  });
  test.each(['missing', 'notUnique', 'wrongPartial', 'wrongCollation', 'wrongKeyOrder', 'ttl', 'extraTtl'])('rejects invalid Order purchase/replay index: %s', async mode => {
    const indexes = Order.schema.indexes().map(([key, options]) => ({ key, ...options }));
    if (mode === 'missing') indexes.splice(1, 1);
    if (mode === 'notUnique') indexes[1].unique = false;
    if (mode === 'wrongPartial') indexes[1].partialFilterExpression = { financialVersion: 1 };
    if (mode === 'wrongCollation') indexes[1].collation = { locale: 'en', strength: 2 };
    if (mode === 'wrongKeyOrder') indexes[1].key = { 'request.idempotencyKey': 1, 'request.actorId': 1 };
    if (mode === 'ttl') indexes[1].expireAfterSeconds = 60;
    if (mode === 'extraTtl') indexes.push({ name: 'extra_order_ttl', key: { createdAt: 1 }, expireAfterSeconds: 60 });
    Order.collection.indexes.mockResolvedValue(indexes);
    await expect(ready()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    expect(probes.insertOne).not.toHaveBeenCalled();
  });
  test('an index build error is sanitized and is never repaired destructively', async () => {
    Journal.createIndexes.mockRejectedValue(new Error('secret database URI'));
    const error = await ready().catch(error => error);
    expect(error).toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    expect(JSON.stringify(error)).not.toContain('secret');
    expect(probes.insertOne).not.toHaveBeenCalled();
  });
  test('a client change during the probe cannot mark the new connection ready', async () => {
    probes.insertOne.mockImplementation(async () => { client = {}; });
    await expect(ready()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
  });
  test('disconnect/reconnect requires fresh initialization', async () => {
    await ready();
    connection.emit('disconnected');
    connection.emit('connected');
    await expect(service.assertFinancialReady()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    await ready();
    expect(probes.insertOne).toHaveBeenCalledTimes(2);
  });
  test.each([
    { expectedBalance: undefined }, { balance: '1.005' }, { balance: -1 }, { balance: true },
    { actorId: 'not-an-id' }, { userId: { $ne: null } }, { idempotencyKey: 'x\n' },
    { idempotencyKey: '' }, { reason: '   ' }, { reason: 'x'.repeat(501) }, { role: 'admin' }
  ])('rejects malformed/unknown input before starting a session: %p', async extra => {
    await ready();
    await expect(service.adjustBalance(request(extra))).rejects.toHaveProperty('status', 400);
    expect(connection.startSession).toHaveBeenCalledTimes(1); // Probe only.
    expect(User.collection.findOneAndUpdate).not.toHaveBeenCalled();
  });
  test('rejects an unrepresentable numeric mirror', async () => {
    await ready();
    await expect(service.adjustBalance(request({ balance: formatMoney(MAX_CENTS) })))
      .rejects.toEqual(expectedError(400, 'MONEY_MIRROR_UNREPRESENTABLE'));
  });
  test.each([null, { role: 'user', accountStatus: 'active' }, { role: 'admin', accountStatus: 'suspended' }])('requires a currently active database administrator: %p', async state => {
    await ready(); actor = state;
    await expect(service.adjustBalance(request())).rejects.toEqual(expectedError(403, 'FINANCIAL_FORBIDDEN'));
    expect(User.collection.findOneAndUpdate).not.toHaveBeenCalled();
  });
  test('stale expected balance rejects with no money or journal write', async () => {
    await ready();
    await expect(service.adjustBalance(request({ expectedBalance: '99' }))).rejects.toEqual(expectedError(409, 'EXPECTED_BALANCE_MISMATCH'));
    expect(User.collection.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Journal.collection.insertOne).not.toHaveBeenCalled();
    expect(sessions[1].abortTransaction).toHaveBeenCalledTimes(1);
  });
  test('sets a complete pair with original-value predicates and uses the same session for the journal', async () => {
    await ready();
    const result = await service.adjustBalance(request());
    expect(result).toMatchObject({ userId: USER_ID, balance: '125.00', balanceCents: 12500, replayed: false });
    const [filter, update, options] = User.collection.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ accountStatus: 'active', balance: 100, balanceCents: 10000 });
    expect(update.$set).toMatchObject({ balance: 125, balanceCents: 12500 });
    expect(update).not.toHaveProperty('$inc');
    expect(options.session).toBe(sessions[1]);
    expect(Journal.collection.insertOne.mock.calls[0][1].session).toBe(sessions[1]);
    expect(records[0]).toMatchObject({ beforeCents: 10000, afterCents: 12500, deltaCents: 2500 });
    expect(Journal.collection.findOne.mock.calls[0][1].collation).toEqual({ locale: 'simple' });
    expect(sessions[1].endSession).toHaveBeenCalledTimes(1);
  });
  test('replays the original result before comparing a later balance', async () => {
    await ready();
    const first = await service.adjustBalance(request());
    target.balance = 200; target.balanceCents = 20000;
    const replay = await service.adjustBalance(request({ balance: 125, expectedBalance: '100.00', reason: ' Reviewed adjustment ' }));
    expect(replay).toEqual({ ...first, replayed: true });
    expect(User.collection.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(Journal.collection.insertOne).toHaveBeenCalledTimes(1);
  });
  test.each([{ balance: '126' }, { expectedBalance: '99' }, { reason: 'Different reason' }])('same key with a changed canonical payload conflicts: %p', async extra => {
    await ready(); await service.adjustBalance(request());
    await expect(service.adjustBalance(request(extra))).rejects.toEqual(expectedError(409, 'IDEMPOTENCY_CONFLICT'));
    expect(User.collection.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
  test('resolves E11000 only after the failed transaction session ends', async () => {
    await ready();
    const first = await service.adjustBalance(request());
    const original = Journal.collection.findOne.getMockImplementation();
    Journal.collection.insertOne.mockRejectedValueOnce(duplicate());
    const duplicateSessionIndex = sessions.length;
    Journal.collection.findOne.mockImplementation(async (filter, options) => {
      if (sessions.length > duplicateSessionIndex + 1) expect(sessions[duplicateSessionIndex].hasEnded).toBe(true);
      return original(filter, options);
    }).mockImplementationOnce(async () => null);
    await expect(service.adjustBalance(request())).resolves.toEqual({ ...first, replayed: true });
    expect(sessions[duplicateSessionIndex].abortTransaction).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveLength(4); // Probe, first commit, failed attempt, fresh resolution.
  });
  test('an unrelated duplicate index is not treated as an idempotency replay', async () => {
    await ready();
    Journal.collection.insertOne.mockRejectedValue({ code: 11000, keyPattern: { _id: 1 } });
    await expect(service.adjustBalance(request())).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    expect(sessions).toHaveLength(2);
  });
  test('uncertain commit without a verifiable journal returns 503 and requires the same key', async () => {
    await ready();
    connection.startSession.mockImplementationOnce(async () => {
      const session = new TestSession();
      session.withTransaction.mockImplementation(async work => {
        session.active = true; await work(); session.active = false; records = []; throw unknownCommit();
      });
      sessions.push(session); return session;
    });
    await expect(service.adjustBalance(request())).rejects.toMatchObject({ status: 503,
      code: 'FINANCIAL_OUTCOME_UNKNOWN', retryWithSameKey: true });
    expect(sessions).toHaveLength(3);
    expect(sessions[1].hasEnded).toBe(true);
    expect(User.collection.findOneAndUpdate).toHaveBeenCalledTimes(1); // No replacement write in resolution.
    await expect(service.assertFinancialReady()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
  });
  test('uncertain commit with a verifiable journal resolves to its committed result', async () => {
    await ready();
    connection.startSession.mockImplementationOnce(async () => {
      const session = new TestSession();
      session.withTransaction.mockImplementation(async work => {
        session.active = true; await work(); session.active = false; throw unknownCommit();
      });
      sessions.push(session); return session;
    });
    await expect(service.adjustBalance(request())).resolves.toMatchObject({ balanceCents: 12500, replayed: true });
    expect(User.collection.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(sessions[1].hasEnded).toBe(true);
  });
  test('authorization is revalidated on a retry, without reusing an aborted result', async () => {
    await ready();
    connection.startSession.mockImplementationOnce(async () => {
      const session = new TestSession();
      session.withTransaction.mockImplementation(async work => {
        session.active = true; await work(); records = []; actor.role = 'user';
        return work();
      });
      sessions.push(session); return session;
    });
    await expect(service.adjustBalance(request())).rejects.toEqual(expectedError(403, 'FINANCIAL_FORBIDDEN'));
    expect(User.collection.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
  test('an unavailable journal lookup cannot turn an uncertain commit into a definite failure or replacement write', async () => {
    await ready();
    connection.startSession.mockImplementationOnce(async () => {
      const session = new TestSession();
      session.withTransaction.mockImplementation(async work => {
        session.active = true; await work(); session.active = false;
        Journal.collection.findOne.mockRejectedValueOnce(new Error('Resolution read unavailable'));
        throw unknownCommit();
      });
      sessions.push(session); return session;
    });
    await expect(service.adjustBalance(request())).rejects.toMatchObject({ status: 503,
      code: 'FINANCIAL_OUTCOME_UNKNOWN', retryWithSameKey: true });
    expect(User.collection.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(sessions.every(session => session.hasEnded)).toBe(true);
  });
  test('readiness invalidation before commit aborts the callback instead of returning its pending outcome', async () => {
    await ready();
    Journal.collection.insertOne.mockImplementation(async record => {
      records.push(record); connection.emit('disconnected');
      return { acknowledged: true, insertedId: record._id };
    });
    await expect(service.adjustBalance(request())).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
    expect(sessions[1].abortTransaction).toHaveBeenCalledTimes(1);
    expect(sessions[1].hasEnded).toBe(true);
  });
  test('session cleanup failure does not erase a confirmed commit', async () => {
    await ready();
    connection.startSession.mockImplementationOnce(async () => {
      const session = new TestSession(); session.endSession.mockRejectedValue(new Error('cleanup failure'));
      sessions.push(session); return session;
    });
    await expect(service.adjustBalance(request())).resolves.toMatchObject({ balanceCents: 12500, replayed: false });
    await expect(service.assertFinancialReady()).rejects.toEqual(expectedError(503, 'FINANCIAL_UNAVAILABLE'));
  });
});
