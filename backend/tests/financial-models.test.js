const mongoose = require('../node_modules/mongoose');
const User = require('../models/User');
const FinancialOperation = require('../models/FinancialOperation');
const { MAX_CENTS, formatMoney, parseMoney } = require('../utils/money');

const USER_ID = 'abcdef0123456789abcdef01';
const ACTOR_ID = 'abcdef0123456789abcdef02';
// Use a class instance like ClientSession so Mongoose does not clone a plain-object test double.
class TestSession {
  constructor() { this.hasEnded = false; }
  inTransaction() { return true; }
}
const transaction = () => new TestSession();
function userData(extra = {}) {
  return { _id: new mongoose.Types.ObjectId(USER_ID), username: 'Money_User', email: 'money@example.com', provider: 'google', balance: 100, __v: 0, ...extra };
}
function operationData(extra = {}) {
  return {
    actorId: ACTOR_ID, userId: USER_ID, operationType: 'balance_adjustment', idempotencyKey: 'request-1',
    payloadHash: 'a'.repeat(64), beforeCents: 10000, afterCents: 12500, deltaCents: 2500,
    reason: 'Reviewed administrative adjustment', result: { balanceCents: 12500, balance: '125.00' }, ...extra
  };
}
function code(expected) { return expect.objectContaining({ code: expected }); }

// These tests exercise Mongoose validation/middleware, not database unique-index enforcement.
describe('User financial validation and write guards', () => {
  beforeEach(() => {
    jest.spyOn(User.collection, 'findOne').mockResolvedValue(userData());
    jest.spyOn(User.collection, 'updateOne').mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    jest.spyOn(User.collection, 'insertOne').mockResolvedValue({ acknowledged: true, insertedId: new mongoose.Types.ObjectId() });
  });
  afterEach(() => jest.restoreAllMocks());

  test('legacy hydration never defaults or migrates balanceCents', async () => {
    const user = User.hydrate(userData({ balance: 12.34 }));
    expect(user.balanceCents).toBeUndefined();
    await user.validate();
    expect(user.balanceCents).toBeUndefined();
    user.theme = 1;
    await user.save();
    expect(user.balanceCents).toBeUndefined();
    const update = User.collection.updateOne.mock.calls[0][1];
    expect(update.$set).not.toHaveProperty('balanceCents');
    expect(update.$set).not.toHaveProperty('balance');
    expect(User.schema.path('balanceCents').defaultValue).toBeUndefined();
  });
  test('new zero-balance accounts explicitly initialize both fields without a transaction', async () => {
    const user = new User(userData({ balance: 0 }));
    await user.save();
    expect(user.balanceCents).toBe(0);
    expect(User.collection.insertOne.mock.calls[0][0]).toMatchObject({ balance: 0, balanceCents: 0 });
  });
  test.each([-1, -0, 0.5, NaN, Infinity, -Infinity, MAX_CENTS + 1, '100', true, false, null, 100n])('rejects invalid/coerced balanceCents: %p', async balanceCents => {
    const user = new User(userData({ balance: 1, balanceCents }));
    await expect(user.validate()).rejects.toHaveProperty('errors.balanceCents');
  });
  test.each([0, 1, 29, 100, 12345])('accepts exact matching cents: %p', async cents => {
    const user = new User(userData({ balance: Number(formatMoney(cents)), balanceCents: cents }));
    await expect(user.validate()).resolves.toBeUndefined();
  });
  test.each([{ balance: 1, balanceCents: 101 }, { balance: 1.005, balanceCents: 101 }, { balance: 0.1 + 0.2, balanceCents: 30 }])('rejects mismatches/excess legacy precision: %p', async fields => {
    const user = User.hydrate(userData(fields));
    expect(user.validateSync()).toHaveProperty('errors.balanceCents');
    await expect(user.validate()).rejects.toHaveProperty('errors.balanceCents');
  });
  test('rejects a cent value whose numeric compatibility mirror cannot round-trip exactly', async () => {
    const user = new User(userData({ balance: Number(formatMoney(MAX_CENTS)), balanceCents: MAX_CENTS }));
    await expect(user.validate()).rejects.toHaveProperty('errors.balanceCents');
  });
  test('rejects mismatches even when save validation is disabled', async () => {
    const user = User.hydrate(userData({ balanceCents: 10000 }));
    user.balance = 125;
    user.balanceCents = 12000;
    user.$session(transaction());
    await expect(user.save({ validateBeforeSave: false })).rejects.toHaveProperty('errors.balanceCents');
    expect(User.collection.updateOne).not.toHaveBeenCalled();
  });
  test('document writes require a transaction and both fields to be marked for writing', async () => {
    const user = User.hydrate(userData());
    user.balance = 125;
    user.balanceCents = 12500;
    await expect(user.save()).rejects.toMatchObject({ code: 'FINANCIAL_TRANSACTION_REQUIRED' });
    expect(User.collection.updateOne).not.toHaveBeenCalled();
    user.$session(transaction());
    await user.save();
    expect(User.collection.updateOne.mock.calls[0][1].$set).toMatchObject({ balance: 125, balanceCents: 12500 });
  });
  test('document writes compare the original money pair and restore caller save conditions', async () => {
    const user = User.hydrate(userData({ balanceCents: 10000 }));
    user.$where = { accountStatus: 'active' };
    user.balance = 125;
    user.balanceCents = 12500;
    user.$session(transaction());
    await user.save();
    expect(User.collection.updateOne.mock.calls[0][0]).toMatchObject({ balance: 100, balanceCents: 10000, accountStatus: 'active' });
    expect(user.$where).toEqual({ accountStatus: 'active' });
    user.balance = 150;
    user.balanceCents = 15000;
    await user.save();
    expect(User.collection.updateOne.mock.calls[1][0]).toMatchObject({ balance: 125, balanceCents: 12500 });
  });
  test('a one-sided document migration is rejected even in a transaction', async () => {
    const user = User.hydrate(userData());
    user.balanceCents = 10000;
    user.$session(transaction());
    await expect(user.save()).rejects.toMatchObject({ code: 'BALANCE_PAIR_REQUIRED' });
    expect(User.collection.updateOne).not.toHaveBeenCalled();
  });
  test('a matching, explicit legacy document migration preserves the mirror', async () => {
    const user = User.hydrate(userData({ balance: 12.34 }));
    user.balanceCents = parseMoney(user.balance);
    user.markModified('balance');
    user.$session(transaction());
    await user.save();
    expect(User.collection.updateOne.mock.calls[0][1].$set).toMatchObject({ balance: 12.34, balanceCents: 1234 });
  });
  test.each([1.005, 0.1 + 0.2, 1e-7])('cannot overwrite and hide an invalid legacy source: %p', async balance => {
    const user = User.hydrate(userData({ balance }));
    user.balance = 1;
    user.balanceCents = 100;
    user.$session(transaction());
    await expect(user.save()).rejects.toMatchObject({ code: 'LEGACY_BALANCE_INVALID' });
    expect(User.collection.updateOne).not.toHaveBeenCalled();
  });
  test('cannot silently repair a previously inconsistent authoritative mirror', async () => {
    const user = User.hydrate(userData({ balanceCents: 9999 }));
    user.balance = 125;
    user.balanceCents = 12500;
    user.$session(transaction());
    await expect(user.save()).rejects.toMatchObject({ code: 'BALANCE_STATE_MISMATCH' });
    expect(User.collection.updateOne).not.toHaveBeenCalled();
  });
  test('cannot migrate a partially projected account with an unknown original balance', async () => {
    const user = User.hydrate({ _id: new mongoose.Types.ObjectId(USER_ID), username: 'Money_User' }, { username: 1 });
    user.balance = 1;
    user.balanceCents = 100;
    user.$session(transaction());
    await expect(user.save({ validateBeforeSave: false })).rejects.toMatchObject({ code: 'LEGACY_BALANCE_INVALID' });
  });
  test('authoritative balances cannot be removed', async () => {
    const user = User.hydrate(userData({ balanceCents: 10000 }));
    user.balanceCents = undefined;
    user.$session(transaction());
    await expect(user.save()).rejects.toHaveProperty('errors.balanceCents');
    expect(User.collection.updateOne).not.toHaveBeenCalled();
  });

  const prohibited = [
    { $inc: { balance: 1 } }, { $inc: { balanceCents: 100 } },
    { $inc: { balance: 1, balanceCents: 100 } }, { $mul: { balance: 2 } },
    { $unset: { balanceCents: 1 } }, { $unset: { balance: 1 } },
    { $rename: { balance: 'other' } }, { $rename: { other: 'balanceCents' } },
    { $min: { balance: 0 } }, { $max: { balanceCents: 100 } },
    { $set: { 'balanceCents.invalid': 1 } }, { $setOnInsert: { balance: 0, balanceCents: 0 } }
  ];
  test.each(prohibited)('financial operator is rejected with or without a session: %p', async update => {
    for (const session of [undefined, transaction()]) {
      await expect(User.updateOne({ _id: USER_ID }, update, { session })).rejects.toEqual(code('UNSAFE_FINANCIAL_UPDATE'));
    }
    expect(User.collection.updateOne).not.toHaveBeenCalled();
    expect(User.collection.findOne).not.toHaveBeenCalled();
  });
  test('matching query pairs still require an active transaction', async () => {
    const update = { $set: { balance: 125, balanceCents: 12500 } };
    await expect(User.updateOne({ _id: USER_ID }, update)).rejects.toEqual(code('FINANCIAL_TRANSACTION_REQUIRED'));
    await expect(User.updateOne({ _id: USER_ID }, update, { session: { inTransaction: () => false } })).rejects.toEqual(code('FINANCIAL_TRANSACTION_REQUIRED'));
    expect(User.collection.updateOne).not.toHaveBeenCalled();
  });
  test.each([{ balance: 125 }, { balanceCents: 12500 }, { balance: 125, balanceCents: 12000 }, { balance: 1.005, balanceCents: 100 }, { balance: 125, balanceCents: '12500' }])('query pair must be complete and exact: %p', async fields => {
    await expect(User.updateOne({ _id: USER_ID }, { $set: fields }, { session: transaction() })).rejects.toEqual(code('BALANCE_PAIR_REQUIRED'));
    expect(User.collection.updateOne).not.toHaveBeenCalled();
  });
  test.each([true, false])('a valid query pair validates stored state in the same session: explicit $set = %p', async explicit => {
    const session = transaction();
    const fields = { balance: 125, balanceCents: 12500 };
    await User.updateOne({ _id: USER_ID }, explicit ? { $set: fields } : fields, { session, runValidators: false });
    expect(User.collection.findOne.mock.calls[0][1].session).toBe(session);
    expect(User.collection.updateOne.mock.calls[0][1].$set).toMatchObject(fields);
  });
  test.each([1.005, 0.1 + 0.2])('query migration cannot overwrite an invalid stored legacy balance: %p', async balance => {
    User.collection.findOne.mockResolvedValueOnce(userData({ balance }));
    await expect(User.updateOne({ _id: USER_ID }, { $set: { balance: 1, balanceCents: 100 } }, { session: transaction() })).rejects.toEqual(code('LEGACY_BALANCE_INVALID'));
    expect(User.collection.updateOne).not.toHaveBeenCalled();
  });
  test('query migration rejects incomplete legacy data instead of supplying hydration defaults', async () => {
    User.collection.findOne.mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId(USER_ID) });
    await expect(User.updateOne({ _id: USER_ID }, { $set: { balance: 0, balanceCents: 0 } }, { session: transaction() })).rejects.toEqual(code('LEGACY_BALANCE_INVALID'));
  });
  test('query writes reject drift in an existing cents/mirror pair', async () => {
    User.collection.findOne.mockResolvedValueOnce(userData({ balanceCents: 9999 }));
    await expect(User.updateOne({ _id: USER_ID }, { $set: { balance: 125, balanceCents: 12500 } }, { session: transaction() })).rejects.toEqual(code('BALANCE_STATE_MISMATCH'));
  });
  test('query upserts, multi-account writes and untargeted financial writes are rejected', async () => {
    const update = { $set: { balance: 125, balanceCents: 12500 } };
    await expect(User.updateOne({ _id: USER_ID }, update, { session: transaction(), upsert: true })).rejects.toEqual(code('UNSAFE_USER_UPSERT'));
    await expect(User.updateMany({}, update, { session: transaction() })).rejects.toEqual(code('UNSAFE_FINANCIAL_UPDATE'));
    await expect(User.updateOne({}, update, { session: transaction() })).rejects.toEqual(code('UNSAFE_FINANCIAL_UPDATE'));
  });
  test('ordinary nonfinancial query updates still work', async () => {
    await User.updateOne({ _id: USER_ID }, { $set: { theme: 1 } });
    expect(User.collection.updateOne).toHaveBeenCalledTimes(1);
    expect(User.collection.findOne).not.toHaveBeenCalled();
  });
});

describe('FinancialOperation validation, append-only and index declarations', () => {
  beforeEach(() => {
    jest.spyOn(FinancialOperation.collection, 'insertOne').mockResolvedValue({ acknowledged: true, insertedId: new mongoose.Types.ObjectId() });
  });
  afterEach(() => jest.restoreAllMocks());
  test('valid adjustment without a source group has an exact replay result', async () => {
    const operation = new FinancialOperation(operationData());
    await expect(operation.validate()).resolves.toBeUndefined();
    expect(operation.currency).toBe('USD');
    expect(operation.createdAt).toBeInstanceOf(Date);
    expect(operation.sourceType).toBeUndefined();
  });
  test.each(['beforeCents', 'afterCents', 'deltaCents'])('journal numeric field rejects coercion and unsafe values: %s', async field => {
    for (const value of ['100', true, null, NaN, Infinity, 0.5, MAX_CENTS + 1, -0]) {
      await expect(new FinancialOperation(operationData({ [field]: value })).validate()).rejects.toHaveProperty(`errors.${field}`);
    }
  });
  test('signed deltas are exact, cannot overflow and must agree with before/after', async () => {
    await expect(new FinancialOperation(operationData({ deltaCents: 2499 })).validate()).rejects.toHaveProperty('errors.deltaCents');
    const zero = operationData({ beforeCents: MAX_CENTS, afterCents: 0, deltaCents: -MAX_CENTS, result: { balanceCents: 0, balance: '0.00' } });
    await expect(new FinancialOperation(zero).validate()).resolves.toBeUndefined();
  });
  test.each(['idempotencyKey', 'payloadHash'])('keys/hashes reject whitespace, coercion and malformed values: %s', async field => {
    for (const value of ['', 'bad key', 'value\n', 123, null]) {
      await expect(new FinancialOperation(operationData({ [field]: value })).validate()).rejects.toHaveProperty(`errors.${field}`);
    }
  });
  test('source group is all-or-none for adjustments', async () => {
    for (const extra of [{ sourceType: 'adjustment' }, { sourceId: 'source-1' }, { effect: 'adjustment' }]) {
      await expect(new FinancialOperation(operationData(extra)).validate()).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
    }
    await expect(new FinancialOperation(operationData({ sourceType: 'adjustment', sourceId: 'source-1', effect: 'adjustment' })).validate()).resolves.toBeUndefined();
  });
  test('source-backed effects cannot bypass the deduplication index by omitting source fields', async () => {
    await expect(new FinancialOperation(operationData({ operationType: 'payment_credit', reason: undefined })).validate()).rejects.toHaveProperty('errors.sourceId');
  });
  test('source/effect/type relationships and debit signs are validated', async () => {
    const debit = operationData({ operationType: 'order_debit', sourceType: 'order', sourceId: 'order-1', effect: 'debit', beforeCents: 12500, afterCents: 10000, deltaCents: -2500, result: { balanceCents: 10000, balance: '100.00' } });
    await expect(new FinancialOperation(debit).validate()).resolves.toBeUndefined();
    await expect(new FinancialOperation({ ...debit, effect: 'credit' }).validate()).rejects.toHaveProperty('errors.effect');
    await expect(new FinancialOperation({ ...debit, sourceType: 'payment' }).validate()).rejects.toHaveProperty('errors.sourceType');
    await expect(new FinancialOperation({ ...debit, beforeCents: 7500, deltaCents: 2500 }).validate()).rejects.toHaveProperty('errors.deltaCents');
  });
  test('migration records preserve value and identify the actual target user', async () => {
    const migration = operationData({ operationType: 'balance_migration', beforeCents: 12500, deltaCents: 0, sourceType: 'user', sourceId: USER_ID, effect: 'migration' });
    await expect(new FinancialOperation(migration).validate()).resolves.toBeUndefined();
    await expect(new FinancialOperation({ ...migration, sourceId: ACTOR_ID }).validate()).rejects.toHaveProperty('errors.sourceId');
  });
  test('replay result must agree with afterCents and exact formatting', async () => {
    await expect(new FinancialOperation(operationData({ result: { balanceCents: 12499, balance: '124.99' } })).validate()).rejects.toHaveProperty('errors.result');
    await expect(new FinancialOperation(operationData({ result: { balanceCents: 12500, balance: '125' } })).validate()).rejects.toHaveProperty(['errors', 'result.balance']);
    await expect(new FinancialOperation(operationData({ reason: '   ' })).validate()).rejects.toHaveProperty('errors.reason');
  });
  test('unknown journal/result fields are rejected instead of becoming unbounded metadata', async () => {
    expect(() => new FinancialOperation(operationData({ extra: 'invalid' }))).toThrow(mongoose.Error.StrictModeError);
    await expect(new FinancialOperation(operationData({ result: { balanceCents: 12500, balance: '125.00', password: 'invalid' } })).validate()).rejects.toHaveProperty('errors.result');
  });
  test('inserts require an active transaction', async () => {
    await expect(new FinancialOperation(operationData()).save()).rejects.toMatchObject({ code: 'FINANCIAL_TRANSACTION_REQUIRED' });
    expect(FinancialOperation.collection.insertOne).not.toHaveBeenCalled();
  });
  test('journal validation cannot be disabled at save time', async () => {
    const operation = new FinancialOperation(operationData({ payloadHash: 'invalid' }));
    operation.$session(transaction());
    await expect(operation.save({ validateBeforeSave: false })).rejects.toHaveProperty('errors.payloadHash');
    expect(FinancialOperation.collection.insertOne).not.toHaveBeenCalled();
  });
  test('a valid journal insert forwards the transaction session', async () => {
    const operation = new FinancialOperation(operationData());
    const session = transaction();
    operation.$session(session);
    await operation.save();
    expect(FinancialOperation.collection.insertOne.mock.calls[0][1].session).toBe(session);
    await expect(operation.save()).rejects.toMatchObject({ code: 'FINANCIAL_JOURNAL_APPEND_ONLY' });
  });
  test('all Mongoose journal mutation/bulk APIs are blocked', async () => {
    const filter = { _id: new mongoose.Types.ObjectId() };
    for (const action of [
      () => FinancialOperation.updateOne(filter, { $set: { reason: 'changed' } }),
      () => FinancialOperation.updateMany({}, { $set: { reason: 'changed' } }),
      () => FinancialOperation.findOneAndUpdate(filter, { $set: { reason: 'changed' } }),
      () => FinancialOperation.replaceOne(filter, operationData()),
      () => FinancialOperation.findOneAndReplace(filter, operationData()),
      () => FinancialOperation.deleteOne(filter), () => FinancialOperation.deleteMany({}),
      () => FinancialOperation.findOneAndDelete(filter),
      () => FinancialOperation.insertMany([operationData()]),
      () => FinancialOperation.bulkWrite([{ insertOne: { document: operationData() } }]),
      () => FinancialOperation.hydrate({ ...operationData(), _id: filter._id }).deleteOne()
    ]) await expect(action()).rejects.toMatchObject({ code: 'FINANCIAL_JOURNAL_APPEND_ONLY' });
  });
  test('unique, partial and history indexes are declared without automatic index creation or TTL', () => {
    const indexes = FinancialOperation.schema.indexes();
    expect(indexes).toHaveLength(3);
    expect(indexes[0]).toEqual([{ actorId: 1, operationType: 1, idempotencyKey: 1 }, expect.objectContaining({ unique: true, collation: { locale: 'simple' } })]);
    expect(indexes[1]).toEqual([{ sourceType: 1, sourceId: 1, effect: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { sourceType: { $type: 'string' }, sourceId: { $type: 'string' }, effect: { $type: 'string' } } })]);
    expect(indexes[2][0]).toEqual({ userId: 1, createdAt: -1, _id: -1 });
    for (const [, options] of indexes) expect(options).not.toHaveProperty('expireAfterSeconds');
    expect(FinancialOperation.schema.options.autoIndex).toBe(false);
    expect(FinancialOperation.schema.options.autoCreate).toBe(false);
  });
});
