'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const mongoose = require('mongoose');
const User = require('../models/User');
const FinancialOperation = require('../models/FinancialOperation');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const catalog = require('./catalogService');
const OrderError = require('../utils/orderError');
const { normalizeTarget } = require('../utils/fulfillmentTarget');
const { normalizePurchase, purchaseHash, keyValid } = require('../utils/orderInput');
const { MoneyError, assertCents, parseMoney, formatMoney, addCents, subtractCents } = require('../utils/money');

// No network activity or listener registration on import. Bootstrap must initialize explicitly.
const connection = mongoose.connection;
const PROBE_COLLECTION = '_financial_transaction_probes';
const SIMPLE = Object.freeze({ locale: 'simple' });
const TRANSACTION_OPTIONS = Object.freeze({
  readConcern: Object.freeze({ level: 'snapshot' }),
  writeConcern: Object.freeze({ w: 'majority' }),
  readPreference: 'primary',
  maxCommitTimeMS: 5000,
  timeoutMS: 15000
});
const state = { ready: false, client: null, generation: 0, pending: null, listening: false };

class FinancialError extends Error {
  constructor(status, code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'FinancialError';
    this.status = status;
    this.code = code;
    if (code === 'FINANCIAL_OUTCOME_UNKNOWN') this.retryWithSameKey = true;
  }
}
class UncertainCommitError extends Error {
  constructor(cause) { super('Commit outcome is not established', { cause }); }
}
function unavailable(cause) {
  return new FinancialError(503, 'FINANCIAL_UNAVAILABLE', 'Financial operations are unavailable', cause);
}
function invalidate() {
  state.ready = false;
  state.client = null;
  state.generation += 1;
}
function listenForConnectionChanges() {
  if (state.listening) return;
  state.listening = true;
  for (const event of ['connected', 'disconnected', 'close', 'error']) connection.on(event, invalidate);
}
function currentConnection() {
  return connection.readyState === 1 && connection.db && connection.getClient();
}
async function ensureCollection(name) {
  try { await connection.db.createCollection(name); }
  catch (error) { if (error.code !== 48) throw error; } // NamespaceExists only; never drop/repair.
}
async function prepareIndexes(model) {
  await model.createIndexes();
  const installed = await model.collection.indexes();
  // Even an unrelated TTL index could erase replay evidence and reopen an old operation.
  if (installed.some(index => index.expireAfterSeconds !== undefined)) throw new Error('Financial journals cannot have TTL indexes');
  for (const [key, options] of model.schema.indexes()) {
    const index = installed.find(entry => entry.name === options.name);
    if (!index || !isDeepStrictEqual(Object.entries(index.key), Object.entries(key)) ||
        Boolean(index.unique) !== Boolean(options.unique) || index.sparse === true ||
        !isDeepStrictEqual(index.partialFilterExpression, options.partialFilterExpression) ||
        index.expireAfterSeconds !== undefined ||
        (options.collation && (index.collation?.locale || 'simple') !== options.collation.locale)) {
      throw new Error('Required financial index definition is not installed');
    }
  }
}
async function probeTransactions() {
  const session = await connection.startSession();
  const probes = connection.db.collection(PROBE_COLLECTION);
  const _id = randomUUID();
  try {
    // Deliberately manual: this readiness transaction must ALWAYS abort, never commit.
    session.startTransaction(TRANSACTION_OPTIONS);
    await probes.insertOne({ _id, probe: true }, { session, timeoutMS: 10000 });
    const inside = await probes.findOne({ _id }, { session, timeoutMS: 10000 });
    if (!inside || inside.probe !== true) throw new Error('Transactional probe read failed');
    await session.abortTransaction();
    const outside = await probes.findOne({ _id }, {
      readConcern: { level: 'majority' }, readPreference: 'primary', timeoutMS: 10000
    });
    if (outside !== null) throw new Error('Aborted probe unexpectedly persisted');
  } finally {
    try { if (session.inTransaction()) await session.abortTransaction(); }
    finally { await session.endSession(); }
  }
}
async function initializeFinancialFoundation() {
  listenForConnectionChanges();
  if (state.pending) return state.pending;
  if (state.ready && currentConnection() === state.client) return { ready: true, currency: 'USD' };
  const generation = state.generation;
  const client = currentConnection();
  state.ready = false;
  state.pending = (async () => {
    try {
      if (!client || User.db !== connection || FinancialOperation.db !== connection || Payment.db !== connection || Order.db !== connection) throw new Error('Financial connection is unavailable');
      const hello = await connection.db.admin().command({ hello: 1 }, { timeoutMS: 10000 });
      const router = hello.msg === 'isdbgrid';
      if ((!router && !hello.setName) || !Number.isFinite(hello.logicalSessionTimeoutMinutes) ||
          hello.logicalSessionTimeoutMinutes <= 0 || !Number.isInteger(hello.maxWireVersion) ||
          hello.maxWireVersion < (router ? 8 : 7)) throw new Error('MongoDB transaction topology is unsupported');
      for (const name of [User.collection.collectionName, FinancialOperation.collection.collectionName, Payment.collection.collectionName, Order.collection.collectionName, PROBE_COLLECTION]) {
        await ensureCollection(name);
      }
      await prepareIndexes(FinancialOperation);
      await prepareIndexes(Payment);
      await prepareIndexes(Order);
      await probeTransactions();
      if (generation !== state.generation || currentConnection() !== client) throw new Error('Connection changed during initialization');
      state.client = client;
      state.ready = true;
      return { ready: true, currency: 'USD' };
    } catch (error) {
      state.ready = false;
      throw unavailable(error);
    }
  })();
  try { return await state.pending; }
  finally { state.pending = null; }
}
async function assertFinancialReady() {
  if (state.pending) await state.pending;
  if (!state.ready || currentConnection() !== state.client) throw unavailable();
}
function hasLabel(error, label) {
  return typeof error?.hasErrorLabel === 'function' && error.hasErrorLabel(label) || error?.errorLabels?.includes(label) === true;
}
function uncertain(error) {
  return hasLabel(error, 'UnknownTransactionCommitResult') ||
    ['MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoOperationTimeoutError'].includes(error?.name);
}
// PRIVATE: only internal database-only work may enter this retryable callback.
async function inTransaction(work) {
  await assertFinancialReady();
  const session = await connection.startSession();
  const generation = state.generation;
  let callbackCompleted = false;
  try {
    return await session.withTransaction(async () => {
      callbackCompleted = false;
      // A retry must not revive an operation across a readiness-invalidating reconnect.
      await assertFinancialReady();
      if (generation !== state.generation) throw unavailable();
      const result = await work(session);
      await assertFinancialReady();
      if (generation !== state.generation) throw unavailable();
      callbackCompleted = true;
      return result;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (hasLabel(error, 'UnknownTransactionCommitResult') || callbackCompleted && uncertain(error)) {
      throw new UncertainCommitError(error);
    }
    throw error;
  } finally {
    // Cleanup failure cannot erase a confirmed commit or mask the original failure.
    try { await session.endSession(); } catch (_) { invalidate(); }
  }
}
function identifier(value) {
  if (!mongoose.isObjectIdOrHexString(value) || typeof value === 'string' && value.length !== 24) {
    throw new FinancialError(400, 'INVALID_FINANCIAL_INPUT', 'A valid user identifier is required');
  }
  return String(value).toLowerCase();
}
function fingerprint(parts) {
  // Explicit ordered, versioned tuple; never hash arbitrary client objects or floats.
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
function normalize(input) {
  const fields = ['actorId', 'userId', 'balance', 'expectedBalance', 'idempotencyKey', 'reason'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(input, key))) {
    throw new FinancialError(400, 'INVALID_FINANCIAL_INPUT', 'Only the required financial fields are accepted');
  }
  const actorId = identifier(input.actorId);
  const userId = identifier(input.userId);
  if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length > 128 ||
      !/^[a-z\d][a-z\d._:-]*$/i.test(input.idempotencyKey) || /\s/.test(input.idempotencyKey)) {
    throw new FinancialError(400, 'INVALID_IDEMPOTENCY_KEY', 'A valid idempotency key is required');
  }
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 500) {
    throw new FinancialError(400, 'INVALID_FINANCIAL_REASON', 'A reason of at most 500 characters is required');
  }
  const reason = input.reason.trim();
  let cents, expectedCents;
  try { cents = parseMoney(input.balance); expectedCents = parseMoney(input.expectedBalance); }
  catch (error) {
    if (!(error instanceof MoneyError)) throw error;
    throw new FinancialError(400, error.code, 'Use a nonnegative monetary amount with at most two decimal places');
  }
  const mirror = Number(formatMoney(cents));
  if (parseMoney(mirror) !== cents) throw new FinancialError(400, 'MONEY_MIRROR_UNREPRESENTABLE', 'The balance cannot be represented by the compatibility field');
  return { actorId, userId, cents, expectedCents, mirror, reason, idempotencyKey: input.idempotencyKey,
    payloadHash: fingerprint([1, 'balance_adjustment', 'USD', actorId, userId, cents, expectedCents, reason]) };
}
async function assertAdministrator(actorId, session) {
  const actor = await User.findById(actorId).select('_id role accountStatus').session(session).lean();
  if (!actor || actor.role !== 'admin' || actor.accountStatus !== 'active') {
    throw new FinancialError(403, 'FINANCIAL_FORBIDDEN', 'An active administrator is required');
  }
}
async function existingOperation(input, session) {
  const operation = await FinancialOperation.findOne({ actorId: input.actorId,
    operationType: 'balance_adjustment', idempotencyKey: input.idempotencyKey })
    .collation(SIMPLE).session(session).lean();
  if (operation && operation.payloadHash !== input.payloadHash) {
    throw new FinancialError(409, 'IDEMPOTENCY_CONFLICT', 'The idempotency key was used for a different request');
  }
  return operation;
}
function outcome(operation, replayed) {
  const cents = assertCents(operation.result?.balanceCents);
  if (operation.result.balance !== formatMoney(cents) || operation.afterCents !== cents) throw unavailable();
  return Object.freeze({ operationId: String(operation._id), userId: String(operation.userId), currency: 'USD',
    balance: operation.result.balance, balanceCents: cents, replayed });
}
function reconciliation(cause) {
  return new FinancialError(409, 'BALANCE_RECONCILIATION_REQUIRED', 'The stored balance requires manual reconciliation', cause);
}
function storedCents(user) {
  try {
    if (typeof user.balance !== 'number') throw new Error('Missing stored numeric balance');
    const cents = parseMoney(user.balance);
    if (Object.hasOwn(user, 'balanceCents') && assertCents(user.balanceCents) !== cents) throw new Error('Inconsistent stored monetary pair');
    return cents;
  } catch (error) { throw reconciliation(error); }
}
function idempotencyDuplicate(error) {
  return error?.code === 11000 && isDeepStrictEqual(error.keyPattern, { actorId: 1, operationType: 1, idempotencyKey: 1 });
}
async function resolveCommitted(input) {
  return inTransaction(async session => {
    await assertAdministrator(input.actorId, session);
    const operation = await existingOperation(input, session);
    return operation ? outcome(operation, true) : null;
  });
}
/** actorId MUST come from authenticated server context, never a client body. No side-effect callbacks. */
async function adjustBalance(rawInput) {
  const input = normalize(rawInput);
  try {
    return await inTransaction(async session => {
      await assertAdministrator(input.actorId, session);
      const previous = await existingOperation(input, session);
      if (previous) return outcome(previous, true); // Before target/expected-balance checks.
      const user = await User.findById(input.userId).select('_id accountStatus balance balanceCents').session(session).lean();
      if (!user) throw new FinancialError(404, 'FINANCIAL_USER_NOT_FOUND', 'The target account does not exist');
      if (user.accountStatus !== 'active') throw new FinancialError(409, 'FINANCIAL_USER_INACTIVE', 'The target account is not active');
      const beforeCents = storedCents(user);
      if (beforeCents !== input.expectedCents) throw new FinancialError(409, 'EXPECTED_BALANCE_MISMATCH', 'The balance changed; reload it before adjusting');
      const legacy = !Object.hasOwn(user, 'balanceCents');
      if (legacy) {
        const migrated = await FinancialOperation.findOne({ sourceType: 'user', sourceId: input.userId, effect: 'migration' })
          .collation(SIMPLE).session(session).lean();
        if (migrated) throw reconciliation();
      }
      const updated = await User.findOneAndUpdate({ _id: input.userId, accountStatus: 'active', balance: user.balance,
        balanceCents: legacy ? { $exists: false } : beforeCents },
      { $set: { balance: input.mirror, balanceCents: input.cents } },
      { session, new: true, runValidators: true, projection: { _id: 1, balance: 1, balanceCents: 1 } }).lean();
      if (!updated) throw new FinancialError(409, 'EXPECTED_BALANCE_MISMATCH', 'The balance changed; reload it before adjusting');
      if (legacy) {
        await new FinancialOperation({ actorId: input.actorId, userId: input.userId, operationType: 'balance_migration',
          currency: 'USD', idempotencyKey: `migration-v1:${input.userId}`,
          payloadHash: fingerprint([1, 'balance_migration', 'USD', input.actorId, input.userId, beforeCents]),
          sourceType: 'user', sourceId: input.userId, effect: 'migration', beforeCents, afterCents: beforeCents, deltaCents: 0,
          result: { balanceCents: beforeCents, balance: formatMoney(beforeCents) } }).save({ session });
      }
      const operation = new FinancialOperation({ actorId: input.actorId, userId: input.userId, operationType: 'balance_adjustment',
        currency: 'USD', idempotencyKey: input.idempotencyKey, payloadHash: input.payloadHash, reason: input.reason,
        beforeCents, afterCents: input.cents, deltaCents: Number(BigInt(input.cents) - BigInt(beforeCents)),
        result: { balanceCents: input.cents, balance: formatMoney(input.cents) } });
      await operation.save({ session });
      return outcome(operation, false);
    });
  } catch (error) {
    // withTransaction has unwound and its session has ended before race/outcome resolution.
    if (idempotencyDuplicate(error) || error instanceof UncertainCommitError) {
      try {
        const committed = await resolveCommitted(input);
        if (committed) return committed;
      } catch (resolutionError) {
        if (resolutionError instanceof FinancialError && [403, 409].includes(resolutionError.status)) throw resolutionError;
      }
      invalidate();
      if (error instanceof UncertainCommitError) {
        throw new FinancialError(503, 'FINANCIAL_OUTCOME_UNKNOWN', 'Commit outcome is unknown; retry with the same idempotency key', error.cause);
      }
      throw unavailable(error);
    }
    if (error instanceof FinancialError) throw error;
    if (['LEGACY_BALANCE_INVALID', 'BALANCE_STATE_MISMATCH'].includes(error?.code)) throw reconciliation(error);
    if (error?.code === 11000 && isDeepStrictEqual(error.keyPattern, { sourceType: 1, sourceId: 1, effect: 1 })) throw reconciliation(error);
    invalidate();
    throw unavailable(error);
  }
}

function normalizePayment(input, type) {
  const fields = ['actorId', 'paymentId', 'idempotencyKey', 'reason', ...(type === 'approve' ? ['approvedAmount'] : [])];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(input, key))) {
    throw new FinancialError(400, 'INVALID_FINANCIAL_INPUT', 'Only the required decision fields are accepted');
  }
  const actorId = identifier(input.actorId);
  for (const field of ['paymentId', 'idempotencyKey']) {
    if (typeof input[field] !== 'string' || input[field].length < 1 || input[field].length > 128 ||
        !/^[a-z\d][a-z\d._:-]*$/i.test(input[field]) || /\s/.test(input[field])) {
      throw new FinancialError(400, 'INVALID_FINANCIAL_INPUT', 'A valid payment ID and idempotency key are required');
    }
  }
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 500) {
    throw new FinancialError(400, 'INVALID_FINANCIAL_REASON', 'A bounded audit reason is required');
  }
  let cents;
  if (type === 'approve') {
    try { cents = parseMoney(input.approvedAmount); }
    catch (error) { throw new FinancialError(400, 'INVALID_APPROVED_AMOUNT', 'An exact USD amount is required', error); }
    if (cents === 0) throw new FinancialError(400, 'INVALID_APPROVED_AMOUNT', 'The verified USD amount must be positive');
    exactMirror(cents);
  }
  const reason = input.reason.trim();
  return { actorId, paymentId: input.paymentId, type, idempotencyKey: input.idempotencyKey, reason, cents,
    payloadHash: fingerprint([1, 'payment_decision', 'USD', actorId, input.paymentId, type, cents ?? null, reason]) };
}
function exactMirror(cents) {
  const mirror = Number(formatMoney(cents));
  if (parseMoney(mirror) !== cents) throw new FinancialError(400, 'MONEY_MIRROR_UNREPRESENTABLE', 'The numeric money mirror cannot represent these cents');
  return mirror;
}
function paymentReconciliation(cause) {
  return new FinancialError(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'The payment requires manual reconciliation; no credit was inferred', cause);
}
async function paymentReplay(input, session) {
  if (input.type === 'approve') {
    const journal = await FinancialOperation.findOne({ actorId: input.actorId, operationType: 'payment_credit', idempotencyKey: input.idempotencyKey })
      .collation(SIMPLE).session(session).lean();
    if (journal) {
      if (journal.payloadHash !== input.payloadHash) throw new FinancialError(409, 'IDEMPOTENCY_CONFLICT', 'The key was used for a different decision');
      const result = outcome(journal, true);
      if (journal.result.resourceId !== input.paymentId || journal.sourceType !== 'payment' || journal.effect !== 'credit' || !(journal.deltaCents > 0)) throw unavailable();
      return Object.freeze({ paymentId: input.paymentId, userId: result.userId, status: 'completed', currency: 'USD',
        amountCents: journal.deltaCents, balanceCents: result.balanceCents, balance: result.balance, operationId: result.operationId, replayed: true });
    }
  }
  const payment = await Payment.findOne({ 'decision.actorId': input.actorId, 'decision.type': input.type, 'decision.idempotencyKey': input.idempotencyKey })
    .select('+decision +receipt').collation(SIMPLE).session(session).lean();
  if (!payment) return null;
  if (payment.decision.payloadHash !== input.payloadHash) throw new FinancialError(409, 'IDEMPOTENCY_CONFLICT', 'The key was used for a different decision');
  if (input.type === 'approve') throw paymentReconciliation(); // A terminal approval without its journal is never assumed uncredited.
  try { await Payment.hydrate(payment).validate(); } catch (error) { throw paymentReconciliation(error); }
  return Object.freeze({ ...payment.decision.result, replayed: true });
}
async function pendingPayment(input, session) {
  const payment = await Payment.findOne({ paymentId: input.paymentId }).select('+receipt +decision').collation(SIMPLE).session(session).lean();
  if (!payment) throw new FinancialError(404, 'PAYMENT_NOT_FOUND', 'The payment does not exist');
  if (payment.submissionVersion !== 1 || !['pending', 'completed', 'cancelled'].includes(payment.status)) throw paymentReconciliation();
  if (payment.status !== 'pending') throw new FinancialError(409, 'PAYMENT_ALREADY_DECIDED', 'A terminal payment cannot receive another decision');
  try { await Payment.hydrate(payment).validate(); } catch (error) { throw paymentReconciliation(error); }
  return payment;
}
async function creditOwner(payment, input, session) {
  const user = await User.findById(payment.userId).select('_id accountStatus balance balanceCents').session(session).lean();
  if (!user) throw new FinancialError(404, 'FINANCIAL_USER_NOT_FOUND', 'The payment owner no longer exists');
  if (user.accountStatus !== 'active') throw new FinancialError(409, 'FINANCIAL_USER_INACTIVE', 'The payment owner is not active');
  const beforeCents = storedCents(user);
  const afterCents = addCents(beforeCents, input.cents);
  const mirror = exactMirror(afterCents);
  const legacy = !Object.hasOwn(user, 'balanceCents');
  if (legacy && await FinancialOperation.findOne({ sourceType: 'user', sourceId: payment.userId, effect: 'migration' }).collation(SIMPLE).session(session).lean()) throw reconciliation();
  const updated = await User.updateOne({ _id: user._id, accountStatus: 'active', balance: user.balance,
    balanceCents: legacy ? { $exists: false } : beforeCents }, { $set: { balance: mirror, balanceCents: afterCents } }, { session });
  if (updated.matchedCount !== 1) throw new FinancialError(409, 'BALANCE_CONFLICT', 'The payment owner balance changed');
  if (legacy) {
    await new FinancialOperation({ actorId: input.actorId, userId: payment.userId, operationType: 'balance_migration', currency: 'USD',
      idempotencyKey: `migration-v1:${payment.userId}`, payloadHash: fingerprint([1, 'balance_migration', 'USD', input.actorId, payment.userId, beforeCents]),
      sourceType: 'user', sourceId: payment.userId, effect: 'migration', beforeCents, afterCents: beforeCents, deltaCents: 0,
      result: { balanceCents: beforeCents, balance: formatMoney(beforeCents) } }).save({ session });
  }
  return { beforeCents, afterCents };
}
async function commitPaymentDecision(payment, input, result, operationId, session) {
  const decision = { actorId: input.actorId, type: input.type, idempotencyKey: input.idempotencyKey,
    payloadHash: input.payloadHash, reason: input.reason, decidedAt: new Date(), result,
    ...(operationId ? { operationId } : {}) };
  const set = { status: result.status, decision,
    ...(input.type === 'approve' ? { amountInUSD: exactMirror(input.cents), amountCents: input.cents } : {}) };
  const updated = await Payment.updateOne({ _id: payment._id, status: 'pending', submissionVersion: 1,
    userId: payment.userId, amount: payment.amount, currency: payment.currency, amountInUSD: 0,
    decision: { $exists: false }, amountCents: { $exists: false } }, { $set: set }, { session });
  if (updated.matchedCount !== 1) throw new FinancialError(409, 'PAYMENT_ALREADY_DECIDED', 'The payment changed before the decision');
}
async function decidePayment(rawInput, type) {
  const input = normalizePayment(rawInput, type);
  try {
    return await inTransaction(async session => {
      await assertAdministrator(input.actorId, session);
      const replay = await paymentReplay(input, session);
      if (replay) return replay;
      const payment = await pendingPayment(input, session);
      // Rejection never reads/migrates/writes the owner's balance or inserts a monetary journal.
      if (type === 'reject') {
        const result = { paymentId: payment.paymentId, userId: payment.userId, status: 'cancelled' };
        await commitPaymentDecision(payment, input, result, null, session);
        return Object.freeze({ ...result, replayed: false });
      }
      const credited = await FinancialOperation.findOne({ sourceType: 'payment', sourceId: String(payment._id), effect: 'credit' })
        .collation(SIMPLE).session(session).lean();
      if (credited) throw paymentReconciliation();
      const { beforeCents, afterCents } = await creditOwner(payment, input, session);
      const journal = new FinancialOperation({ actorId: input.actorId, userId: payment.userId, operationType: 'payment_credit', currency: 'USD',
        idempotencyKey: input.idempotencyKey, payloadHash: input.payloadHash, reason: input.reason,
        sourceType: 'payment', sourceId: String(payment._id), effect: 'credit', beforeCents, afterCents, deltaCents: input.cents,
        result: { balanceCents: afterCents, balance: formatMoney(afterCents), resourceId: payment.paymentId } });
      const result = { paymentId: payment.paymentId, userId: payment.userId, status: 'completed', currency: 'USD', amountCents: input.cents,
        balanceCents: afterCents, balance: formatMoney(afterCents), operationId: String(journal._id) };
      await commitPaymentDecision(payment, input, result, journal._id, session);
      await journal.save({ session });
      return Object.freeze({ ...result, replayed: false });
    });
  } catch (error) {
    const duplicate = idempotencyDuplicate(error) || error?.code === 11000 && isDeepStrictEqual(error.keyPattern,
      { 'decision.actorId': 1, 'decision.type': 1, 'decision.idempotencyKey': 1 });
    if (duplicate || error instanceof UncertainCommitError) {
      let resolutionFailed = false;
      try {
        const result = await inTransaction(async session => { await assertAdministrator(input.actorId, session); return paymentReplay(input, session); });
        if (result) return result;
      } catch (resolutionError) {
        if (resolutionError instanceof FinancialError && [403, 409].includes(resolutionError.status)) throw resolutionError;
        resolutionFailed = true;
      }
      if (error instanceof UncertainCommitError) {
        invalidate();
        throw new FinancialError(503, 'FINANCIAL_OUTCOME_UNKNOWN', 'Commit outcome is unknown; retry with the same idempotency key', error.cause);
      }
      if (resolutionFailed) { invalidate(); throw unavailable(error); }
      throw new FinancialError(409, 'PAYMENT_DECISION_CONFLICT', 'The decision key conflicts with a committed decision');
    }
    if (error instanceof FinancialError) throw error;
    if (error instanceof MoneyError) throw new FinancialError(400, error.code, 'The resulting credit is outside the supported monetary range');
    if (['LEGACY_BALANCE_INVALID', 'BALANCE_STATE_MISMATCH'].includes(error?.code)) throw reconciliation(error);
    if (error?.code === 11000 && isDeepStrictEqual(error.keyPattern, { sourceType: 1, sourceId: 1, effect: 1 })) throw paymentReconciliation(error);
    invalidate();
    throw unavailable(error);
  }
}
/** Trusted server actor identity, explicit reviewed USD amount, no notification hooks. */
const approvePayment = input => decidePayment(input, 'approve');
const rejectPayment = input => decidePayment(input, 'reject');

function orderReconciliation(cause) {
  return new FinancialError(409, 'ORDER_RECONCILIATION_REQUIRED', 'The order requires manual reconciliation; no debit or refund was inferred', cause);
}
function conflict() { return new FinancialError(409, 'IDEMPOTENCY_CONFLICT', 'The key was used for a different request'); }
async function assertPurchaser(input, session) {
  const actor = await User.findById(input.actorId).select('_id accountStatus tokenVersion').session(session).lean();
  if (!actor || actor.accountStatus !== 'active' || input.tokenVersion !== undefined && actor.tokenVersion !== input.tokenVersion) {
    throw new FinancialError(403, 'FINANCIAL_FORBIDDEN', 'An active authenticated purchaser is required');
  }
}
async function validOrder(order, session) {
  if (order.financialVersion !== 1) throw orderReconciliation();
  try {
    await Order.hydrate(order).validate();
    await Order.journalEvidence(order, session);
    if (order.status === 'cancelled') await Order.journalEvidence(order, session, 'refund');
  } catch (error) {
    // Damaged persisted evidence is a reconciliation case; database outages and
    // transient transaction errors must retain their retry/unavailable semantics.
    if (error instanceof mongoose.Error.ValidationError || error?.code === 'UNSAFE_ORDER_UPDATE') throw orderReconciliation(error);
    throw error;
  }
}
async function purchaseReplay(input, session) {
  const order = await Order.findOne({ 'request.actorId': input.actorId, 'request.idempotencyKey': input.request.idempotencyKey })
    .select('+request +fulfillmentSnapshot +decision +refund').collation(SIMPLE).session(session).lean();
  const journal = await FinancialOperation.findOne({ actorId: input.actorId, operationType: 'order_debit', idempotencyKey: input.request.idempotencyKey })
    .collation(SIMPLE).session(session).lean();
  if (!order && !journal) return null;
  if (!order || !journal) throw orderReconciliation();
  await validOrder(order, session);
  if (order.catalogSnapshot.category !== input.request.category || order.catalogSnapshot.productId !== input.request.productId ||
      !isDeepStrictEqual(order.selection, Object.hasOwn(input.request, 'packageIndex') ? { packageIndex: input.request.packageIndex } : { quantity: input.request.quantity })) throw conflict();
  let fulfillment;
  try { fulfillment = normalizeTarget(input.request.fulfillmentTarget, order.catalogSnapshot); }
  catch (_) { throw conflict(); }
  if (order.request.payloadHash !== purchaseHash(input.actorId, input.request, fulfillment)) throw conflict();
  return Object.freeze({ ...order.request.result, replayed: true });
}
async function migrateMoney(user, actorId, beforeCents, session) {
  if (Object.hasOwn(user, 'balanceCents')) return;
  if (await FinancialOperation.findOne({ sourceType: 'user', sourceId: String(user._id), effect: 'migration' }).collation(SIMPLE).session(session).lean()) throw reconciliation();
  await new FinancialOperation({ actorId, userId: user._id, operationType: 'balance_migration', currency: 'USD',
    idempotencyKey: `migration-v1:${user._id}`, payloadHash: fingerprint([1, 'balance_migration', 'USD', actorId, String(user._id), beforeCents]),
    sourceType: 'user', sourceId: String(user._id), effect: 'migration', beforeCents, afterCents: beforeCents, deltaCents: 0,
    result: { balanceCents: beforeCents, balance: formatMoney(beforeCents) } }).save({ session });
}
async function writeMoney(user, actorId, beforeCents, afterCents, session, active) {
  const legacy = !Object.hasOwn(user, 'balanceCents');
  const mirror = exactMirror(afterCents);
  await migrateMoney(user, actorId, beforeCents, session);
  const updated = await User.updateOne({ _id: user._id, ...(active ? { accountStatus: 'active' } : {}), balance: user.balance,
    balanceCents: legacy ? { $exists: false } : beforeCents }, { $set: { balanceCents: afterCents, balance: mirror } }, { session });
  if (updated.matchedCount !== 1) throw new FinancialError(409, 'BALANCE_CONFLICT', 'The account balance changed');
}
async function resolveOrderFailure(error, replay) {
  const duplicate = idempotencyDuplicate(error) || error?.code === 11000 && (
    isDeepStrictEqual(error.keyPattern, { 'request.actorId': 1, 'request.idempotencyKey': 1 }) ||
    isDeepStrictEqual(error.keyPattern, { 'decision.actorId': 1, 'decision.type': 1, 'decision.idempotencyKey': 1 }));
  if (duplicate || error instanceof UncertainCommitError) {
    let failed = false;
    try { const result = await inTransaction(replay); if (result) return result; }
    catch (resolutionError) {
      if ((resolutionError instanceof FinancialError || resolutionError instanceof OrderError) && [403, 409].includes(resolutionError.status)) throw resolutionError;
      failed = true;
    }
    if (error instanceof UncertainCommitError) {
      invalidate();
      throw new FinancialError(503, 'FINANCIAL_OUTCOME_UNKNOWN', 'Commit outcome is unknown; retry with the same idempotency key', error.cause);
    }
    if (failed) { invalidate(); throw unavailable(error); }
    throw new FinancialError(409, 'ORDER_REQUEST_CONFLICT', 'The request key conflicts with a committed operation');
  }
  if (error instanceof FinancialError || error instanceof OrderError) throw error;
  if (error instanceof MoneyError) throw new FinancialError(400, error.code, 'The resulting amount is outside the supported monetary range');
  if (['LEGACY_BALANCE_INVALID', 'BALANCE_STATE_MISMATCH'].includes(error?.code)) throw reconciliation(error);
  if (error?.code === 'UNSAFE_ORDER_UPDATE' || error?.code === 11000 && isDeepStrictEqual(error.keyPattern, { sourceType: 1, sourceId: 1, effect: 1 })) throw orderReconciliation(error);
  invalidate();
  throw unavailable(error);
}
/** Trusted actor identity only; selectors and target cannot identify the balance owner. */
async function purchaseOrder(rawInput) {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) throw new OrderError(400, 'INVALID_PURCHASE_INPUT', 'A purchase request is required');
  const { actorId, tokenVersion, ...request } = rawInput;
  if (tokenVersion !== undefined && (!Number.isSafeInteger(tokenVersion) || tokenVersion < 0)) throw new OrderError(400, 'INVALID_PURCHASE_INPUT', 'Invalid authorization context');
  const input = { actorId: identifier(actorId), tokenVersion, request: normalizePurchase(request) };
  catalog.ensureLoaded(); // Filesystem work outside the retryable database callback; replay does not require a healthy current category.
  let resolved;
  const replay = async session => { await assertPurchaser(input, session); return purchaseReplay(input, session); };
  try {
    return await inTransaction(async session => {
      const previous = await replay(session);
      if (previous) return previous;
      if (!resolved) {
        const pricing = catalog.resolvePurchase(input.request);
        const fulfillment = normalizeTarget(input.request.fulfillmentTarget, pricing.snapshot);
        resolved = { ...pricing, fulfillment, payloadHash: purchaseHash(input.actorId, input.request, fulfillment) };
      }
      const user = await User.findById(input.actorId).select('_id accountStatus balance balanceCents').session(session).lean();
      if (!user || user.accountStatus !== 'active') throw new FinancialError(403, 'FINANCIAL_FORBIDDEN', 'An active purchaser is required');
      const beforeCents = storedCents(user);
      if (beforeCents < resolved.chargeCents) throw new FinancialError(409, 'INSUFFICIENT_FUNDS', 'The available balance is insufficient');
      const afterCents = subtractCents(beforeCents, resolved.chargeCents);
      const orderId = `ord-${randomUUID()}`;
      const order = new Order({ orderId, userId: input.actorId, financialVersion: 1, catalogSnapshot: resolved.snapshot,
        selection: Object.hasOwn(input.request, 'packageIndex') ? { packageIndex: input.request.packageIndex } : { quantity: input.request.quantity },
        quantity: resolved.quantity, chargeCents: resolved.chargeCents, chargeCurrency: 'USD', amount: exactMirror(resolved.chargeCents),
        method: resolved.snapshot.category, service: resolved.snapshot.productName, fulfillmentSnapshot: resolved.fulfillment, status: 'pending' });
      const journal = new FinancialOperation({ actorId: input.actorId, userId: input.actorId, operationType: 'order_debit', currency: 'USD',
        idempotencyKey: input.request.idempotencyKey, payloadHash: resolved.payloadHash, reason: 'Catalog purchase',
        sourceType: 'order', sourceId: String(order._id), effect: 'debit', beforeCents, afterCents, deltaCents: -resolved.chargeCents,
        result: { balanceCents: afterCents, balance: formatMoney(afterCents), resourceId: orderId } });
      const result = { orderId, userId: input.actorId, status: 'pending', chargeCurrency: 'USD', chargeCents: resolved.chargeCents,
        charge: formatMoney(resolved.chargeCents), quantity: resolved.quantity, balanceCents: afterCents, balance: formatMoney(afterCents), operationId: String(journal._id) };
      order.debitOperationId = journal._id;
      order.request = { actorId: input.actorId, idempotencyKey: input.request.idempotencyKey, payloadHash: resolved.payloadHash, result };
      await writeMoney(user, input.actorId, beforeCents, afterCents, session, true);
      await journal.save({ session });
      await order.save({ session });
      return Object.freeze({ ...result, replayed: false });
    });
  } catch (error) { return resolveOrderFailure(error, replay); }
}
function normalizeOrderDecision(raw, type) {
  const fields = ['actorId', 'orderId', 'idempotencyKey', 'reason'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !fields.includes(key)) ||
      fields.some(key => !Object.hasOwn(raw, key)) || !keyValid(raw.orderId) || !keyValid(raw.idempotencyKey) ||
      typeof raw.reason !== 'string' || !raw.reason.trim() || raw.reason.length > 500 || /[\x00-\x1f\x7f<>&'"`]/.test(raw.reason)) {
    throw new OrderError(400, 'INVALID_PURCHASE_INPUT', 'A valid order, key and bounded plain-text reason are required');
  }
  const input = { actorId: identifier(raw.actorId), orderId: raw.orderId, idempotencyKey: raw.idempotencyKey, reason: raw.reason.trim(), type };
  input.payloadHash = fingerprint([1, 'order_decision', 'USD', input.actorId, input.orderId, type, input.reason]);
  return input;
}
async function decisionReplay(input, session) {
  const order = await Order.findOne({ 'decision.actorId': input.actorId, 'decision.type': input.type, 'decision.idempotencyKey': input.idempotencyKey })
    .select('+request +decision +refund +fulfillmentSnapshot').collation(SIMPLE).session(session).lean();
  let journal = null;
  if (input.type === 'cancel') journal = await FinancialOperation.findOne({ actorId: input.actorId, operationType: 'order_refund', idempotencyKey: input.idempotencyKey })
    .collation(SIMPLE).session(session).lean();
  if (!order) { if (journal) throw orderReconciliation(); return null; }
  if (order.decision.payloadHash !== input.payloadHash) throw conflict();
  await validOrder(order, session);
  return Object.freeze({ ...order.decision.result, replayed: true });
}
async function decideOrder(raw, type) {
  const input = normalizeOrderDecision(raw, type);
  const replay = async session => { await assertAdministrator(input.actorId, session); return decisionReplay(input, session); };
  try {
    return await inTransaction(async session => {
      const previous = await replay(session);
      if (previous) return previous;
      const order = await Order.findOne({ orderId: input.orderId }).select('+request +decision +refund +fulfillmentSnapshot').collation(SIMPLE).session(session).lean();
      if (!order) throw new FinancialError(404, 'ORDER_NOT_FOUND', 'The order does not exist');
      await validOrder(order, session);
      if (order.status !== 'pending') throw new FinancialError(409, 'ORDER_ALREADY_DECIDED', 'The order already has a terminal decision');
      let result = { orderId: order.orderId, userId: order.userId, status: type === 'complete' ? 'completed' : 'cancelled' }, refund;
      if (type === 'cancel') {
        if (await FinancialOperation.findOne({ sourceType: 'order', sourceId: String(order._id), effect: 'refund' }).collation(SIMPLE).session(session).lean()) throw orderReconciliation();
        const user = await User.findById(order.userId).select('_id balance balanceCents').session(session).lean();
        if (!user) throw orderReconciliation();
        const beforeCents = storedCents(user);
        if (!Object.hasOwn(user, 'balanceCents')) throw reconciliation(); // A modern debit already established cents; do not reconstruct damaged evidence.
        const afterCents = addCents(beforeCents, order.chargeCents);
        await writeMoney(user, input.actorId, beforeCents, afterCents, session, false);
        const journal = new FinancialOperation({ actorId: input.actorId, userId: order.userId, operationType: 'order_refund', currency: 'USD',
          idempotencyKey: input.idempotencyKey, payloadHash: input.payloadHash, reason: input.reason,
          sourceType: 'order', sourceId: String(order._id), effect: 'refund', beforeCents, afterCents, deltaCents: order.chargeCents,
          result: { balanceCents: afterCents, balance: formatMoney(afterCents), resourceId: order.orderId } });
        await journal.save({ session });
        refund = { operationId: journal._id, amountCents: order.chargeCents, refundedAt: new Date() };
        result = { ...result, chargeCurrency: 'USD', chargeCents: order.chargeCents, charge: formatMoney(order.chargeCents), quantity: order.quantity,
          balanceCents: afterCents, balance: formatMoney(afterCents), operationId: String(journal._id) };
      }
      const decision = { actorId: input.actorId, type, idempotencyKey: input.idempotencyKey, payloadHash: input.payloadHash,
        reason: input.reason, decidedAt: new Date(), result };
      const set = { status: result.status, decision, ...(refund ? { refund } : {}) };
      const updated = await Order.updateOne({ _id: order._id, financialVersion: 1, status: 'pending', decision: { $exists: false }, refund: { $exists: false } }, { $set: set }, { session });
      if (updated.matchedCount !== 1) throw new FinancialError(409, 'ORDER_ALREADY_DECIDED', 'The order changed before the decision');
      return Object.freeze({ ...result, replayed: false });
    });
  } catch (error) { return resolveOrderFailure(error, replay); }
}
const completeOrder = input => decideOrder(input, 'complete');
const cancelOrder = input => decideOrder(input, 'cancel');
// No generic transaction API, external callback, or notification emitter is exported.
module.exports = { FinancialError, initializeFinancialFoundation, assertFinancialReady, adjustBalance, approvePayment, rejectPayment, purchaseOrder, completeOrder, cancelOrder };
