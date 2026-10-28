/** Live uniqueness/rollback tests on a fresh, locally spawned single-node replica set. */
const { spawn, spawnSync } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const mongoose = require('../node_modules/mongoose');
const FinancialOperation = require('../models/FinancialOperation');
const User = require('../models/User');

const hasMongod = spawnSync('mongod', ['--version'], { stdio: 'ignore' }).status === 0;
const liveTests = hasMongod ? describe : describe.skip;
const USER_ID = 'abcdef0123456789abcdef01';
const ACTOR_ID = 'abcdef0123456789abcdef02';
const OTHER_ACTOR = 'abcdef0123456789abcdef03';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const transactionOptions = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' };
function operationData(extra = {}) {
  return { actorId: ACTOR_ID, userId: USER_ID, operationType: 'balance_adjustment', idempotencyKey: 'request-1',
    payloadHash: 'a'.repeat(64), beforeCents: 10000, afterCents: 12500, deltaCents: 2500,
    reason: 'Test administrative adjustment', result: { balanceCents: 12500, balance: '125.00' }, ...extra };
}
function debit(extra = {}) {
  return operationData({ operationType: 'order_debit', sourceType: 'order', sourceId: 'order-1', effect: 'debit',
    beforeCents: 12500, afterCents: 10000, deltaCents: -2500, result: { balanceCents: 10000, balance: '100.00' }, ...extra });
}
async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

liveTests('Financial models: real MongoDB replica-set integration', () => {
  let directory, child, bootstrap, connection, Journal, Account;
  let spawnError;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'financial-models-'));
    const port = await availablePort();
    child = spawn('mongod', ['--dbpath', directory, '--port', String(port), '--bind_ip', '127.0.0.1',
      '--replSet', 'financial-model-tests', '--nounixsocket', '--quiet', '--logpath', path.join(directory, 'mongod.log')], { stdio: 'ignore' });
    child.once('error', error => { spawnError = error; });
    const uri = `mongodb://127.0.0.1:${port}`;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) throw new Error('The isolated MongoDB test process could not start');
      bootstrap = new mongoose.mongo.MongoClient(uri, { directConnection: true, serverSelectionTimeoutMS: 500 });
      try { await bootstrap.connect(); break; }
      catch (_) { await bootstrap.close(); bootstrap = null; await sleep(100); }
    }
    if (!bootstrap) throw new Error('Timed out starting the isolated MongoDB test process');
    // Confirm process ownership before issuing any configuration or cleanup commands.
    const status = await bootstrap.db('admin').command({ serverStatus: 1 });
    if (status.pid !== child.pid) throw new Error('MongoDB test port does not belong to the spawned process');
    await bootstrap.db('admin').command({ replSetInitiate: {
      _id: 'financial-model-tests', members: [{ _id: 0, host: `127.0.0.1:${port}` }],
      settings: { electionTimeoutMillis: 1000 }
    } });
    let primary = false;
    while (Date.now() < deadline) {
      const hello = await bootstrap.db('admin').command({ hello: 1 });
      if (hello.isWritablePrimary) { primary = true; break; }
      await sleep(100);
    }
    if (!primary) throw new Error('The isolated MongoDB replica set did not elect a primary');
    await bootstrap.close();
    bootstrap = null;
    connection = await mongoose.createConnection(`${uri}/financial_model_tests?replicaSet=financial-model-tests`, {
      autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000
    }).asPromise();
    Journal = connection.model('FinancialOperation', FinancialOperation.schema);
    Account = connection.model('User', User.schema);
    await Account.createCollection();
    await Journal.createCollection();
    await Journal.createIndexes();
  }, 60000);

  beforeEach(async () => {
    // Raw collection access is only for fixtures/cleanup in this owned, disposable test database.
    await Journal.collection.deleteMany({});
    await Account.collection.deleteMany({});
  });
  afterAll(async () => {
    if (bootstrap) await bootstrap.close();
    if (connection) await connection.close();
    if (child && child.exitCode === null && child.signalCode === null && !spawnError) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 10000);
      try { await exited; } finally { clearTimeout(force); }
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  }, 30000);

  async function inTransaction(work) {
    const session = await connection.startSession();
    try { return await session.withTransaction(() => work(session), transactionOptions); }
    finally { await session.endSession(); }
  }
  async function insert(data) {
    return inTransaction(async session => {
      const operation = new Journal(data);
      await operation.save({ session });
      return operation;
    });
  }
  async function legacyAccount(balance, balanceCents) {
    const record = { _id: new mongoose.Types.ObjectId(USER_ID), username: 'Legacy_User', email: 'legacy@example.com',
      provider: 'google', balance, __v: 0, tokenVersion: 0 };
    if (balanceCents !== undefined) record.balanceCents = balanceCents;
    await Account.collection.insertOne(record);
  }

  test('the named unique/partial indexes exist in MongoDB and have no TTL', async () => {
    const indexes = await Journal.collection.indexes();
    const idempotency = indexes.find(index => index.name === 'financial_actor_operation_idempotency');
    const source = indexes.find(index => index.name === 'financial_source_effect_once');
    expect(idempotency).toMatchObject({ unique: true, key: { actorId: 1, operationType: 1, idempotencyKey: 1 } });
    expect(source).toMatchObject({ unique: true, key: { sourceType: 1, sourceId: 1, effect: 1 },
      partialFilterExpression: { sourceType: { $type: 'string' }, sourceId: { $type: 'string' }, effect: { $type: 'string' } } });
    for (const index of indexes) expect(index).not.toHaveProperty('expireAfterSeconds');
  });
  test('MongoDB rejects a duplicate actor/type/idempotency key with E11000', async () => {
    await insert(operationData());
    await expect(insert(operationData())).rejects.toMatchObject({ code: 11000,
      keyPattern: { actorId: 1, operationType: 1, idempotencyKey: 1 } });
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('changing the payload hash cannot bypass key uniqueness', async () => {
    await insert(operationData());
    await expect(insert(operationData({ payloadHash: 'b'.repeat(64) }))).rejects.toMatchObject({ code: 11000 });
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('idempotency keys are scoped to actor and operation type', async () => {
    await insert(operationData());
    await insert(operationData({ actorId: OTHER_ACTOR }));
    await insert(debit());
    expect(await Journal.countDocuments()).toBe(3);
  });
  test('source/effect deduplication holds across different actors and retry keys', async () => {
    await insert(debit());
    await expect(insert(debit({ actorId: OTHER_ACTOR, idempotencyKey: 'different-request' }))).rejects.toMatchObject({
      code: 11000, keyPattern: { sourceType: 1, sourceId: 1, effect: 1 }
    });
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('concurrent source-backed inserts commit exactly one effect', async () => {
    const results = await Promise.allSettled([
      insert(debit({ idempotencyKey: 'concurrent-1' })),
      insert(debit({ actorId: OTHER_ACTOR, idempotencyKey: 'concurrent-2' }))
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.code).toBe(11000);
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('the partial index permits independent adjustments with no source group', async () => {
    await insert(operationData());
    await insert(operationData({ idempotencyKey: 'request-2' }));
    expect(await Journal.countDocuments()).toBe(2);
  });
  test('distinct debit/refund effects on the same order are permitted', async () => {
    await insert(debit());
    await insert(operationData({ operationType: 'order_refund', sourceType: 'order', sourceId: 'order-1', effect: 'refund' }));
    expect(await Journal.countDocuments()).toBe(2);
  });
  test('keys use explicit binary case-sensitive comparison', async () => {
    await insert(operationData({ idempotencyKey: 'Key-A' }));
    await insert(operationData({ idempotencyKey: 'key-a' }));
    expect(await Journal.countDocuments()).toBe(2);
  });
  test('exact legacy migration and its journal record commit together', async () => {
    await legacyAccount(12.34);
    await inTransaction(async session => {
      await Account.updateOne({ _id: USER_ID }, { $set: { balance: 12.34, balanceCents: 1234 } }, { session });
      await new Journal(operationData({ operationType: 'balance_migration', sourceType: 'user', sourceId: USER_ID,
        effect: 'migration', beforeCents: 1234, afterCents: 1234, deltaCents: 0,
        result: { balanceCents: 1234, balance: '12.34' } })).save({ session });
    });
    expect(await Account.findById(USER_ID).lean()).toMatchObject({ balance: 12.34, balanceCents: 1234 });
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('aborted transactions leave neither balance changes nor journal inserts', async () => {
    await legacyAccount(100, 10000);
    await expect(inTransaction(async session => {
      await Account.updateOne({ _id: USER_ID }, { $set: { balance: 125, balanceCents: 12500 } }, { session });
      await new Journal(operationData()).save({ session });
      throw new Error('intentional-test-rollback');
    })).rejects.toThrow('intentional-test-rollback');
    expect(await Account.findById(USER_ID).lean()).toMatchObject({ balance: 100, balanceCents: 10000 });
    expect(await Journal.countDocuments()).toBe(0);
  });
  test('invalid legacy precision is rejected before it can be replaced by a rounded pair', async () => {
    await legacyAccount(1.005);
    await expect(inTransaction(session => Account.updateOne({ _id: USER_ID },
      { $set: { balance: 1, balanceCents: 100 } }, { session }))).rejects.toMatchObject({ code: 'LEGACY_BALANCE_INVALID' });
    const account = await Account.findById(USER_ID).lean();
    expect(account.balance).toBe(1.005);
    expect(account).not.toHaveProperty('balanceCents');
    expect(await Journal.countDocuments()).toBe(0);
  });
  test('existing mirror drift cannot be silently repaired by overwriting both fields', async () => {
    await legacyAccount(100, 9999);
    await expect(inTransaction(session => Account.updateOne({ _id: USER_ID },
      { $set: { balance: 125, balanceCents: 12500 } }, { session }))).rejects.toMatchObject({ code: 'BALANCE_STATE_MISMATCH' });
    expect(await Account.findById(USER_ID).lean()).toMatchObject({ balance: 100, balanceCents: 9999 });
  });
  test('a stale document cannot overwrite a newer query-written balance', async () => {
    await legacyAccount(100, 10000);
    const stale = await Account.findById(USER_ID);
    await inTransaction(async session => {
      await Account.updateOne({ _id: USER_ID }, { $set: { balance: 125, balanceCents: 12500 } }, { session });
      await new Journal(operationData()).save({ session });
    });
    await expect(inTransaction(async session => {
      stale.balance = 150;
      stale.balanceCents = 15000;
      await stale.save({ session });
    })).rejects.toBeInstanceOf(mongoose.Error.VersionError);
    expect(await Account.findById(USER_ID).lean()).toMatchObject({ balance: 125, balanceCents: 12500 });
    expect(await Journal.countDocuments()).toBe(1);
  });
  test('$inc cannot alter either balance even inside a real transaction', async () => {
    await legacyAccount(100, 10000);
    await expect(inTransaction(session => Account.updateOne({ _id: USER_ID },
      { $inc: { balance: 1, balanceCents: 100 } }, { session }))).rejects.toMatchObject({ code: 'UNSAFE_FINANCIAL_UPDATE' });
    expect(await Account.findById(USER_ID).lean()).toMatchObject({ balance: 100, balanceCents: 10000 });
  });
});
