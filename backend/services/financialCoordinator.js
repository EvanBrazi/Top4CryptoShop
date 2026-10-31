'use strict';
const { randomUUID } = require('node:crypto');
const { getPool } = require('../db/pg');
const { createUserRepository } = require('../repositories/userRepository');
const catalog = require('./catalogService');
const { normalizeTarget } = require('../utils/fulfillmentTarget');
const C = require('./financial/contracts');
const { createPersistence } = require('./financial/persistence');
const RETRYABLE = new Set(['40001', '40P01']);
const DUPLICATES = new Set(['financial_actor_operation_idempotency', 'order_actor_purchase_idempotency',
  'payment_actor_decision_idempotency', 'order_actor_decision_idempotency', 'financial_source_effect_once']);
const COMMIT_REJECTIONS = new Set(['40001', '40P01', '23505', '23503', '23514', '55P03', '57014']);
const PREPARATION_ERRORS = new Set(['FULFILLMENT_CONFIGURATION_INVALID','UNSUPPORTED_NETWORK','PRODUCT_UNAVAILABLE',
  'INVALID_PURCHASE_INPUT','INVALID_FULFILLMENT_TARGET','FULFILLMENT_TARGET_REQUIRED','UNKNOWN_PURCHASE_FIELD']);
function sqlstate(error) { return error?.databaseCode || error?.code; }
class AttemptFailure extends Error {
  constructor(error, unknown) { super('FINANCIAL_ATTEMPT_FAILED'); this.error = error; this.unknown = unknown; }
}
function publicError(error) {
  if (error instanceof C.FinancialCoordinatorError) return error;
  const code = error?.code;
  if (['23503','23514'].includes(sqlstate(error))) return C.fail('FINANCIAL_RECONCILIATION_REQUIRED');
  if (code === 'FINANCIAL_FORBIDDEN') return C.fail(code, 403);
  if (code === 'FINANCIAL_USER_INACTIVE') return C.fail(code);
  if (code === 'USER_NOT_FOUND') return C.fail('FINANCIAL_USER_NOT_FOUND', 404);
  if (['USER_VERSION_CONFLICT','USER_VERSION_EXHAUSTED'].includes(code)) return C.fail('BALANCE_CONFLICT');
  if (['BALANCE_STATE_MISMATCH','BALANCE_MIRROR_UNREPRESENTABLE','USER_STATE_INVALID'].includes(code)) return C.fail('BALANCE_RECONCILIATION_REQUIRED');
  return C.fail('FINANCIAL_UNAVAILABLE', 503, true);
}
function authorize(input, rows) {
  const actor = rows.find(row => row.id === input.actorId);
  if (!actor || actor.account_status !== 'active' || actor.token_version !== input.principal.tokenVersion ||
      input.kind !== 'purchase' && actor.role !== 'admin') throw C.fail('FINANCIAL_FORBIDDEN', 403);
  C.cents(actor.token_version, 'FINANCIAL_RECONCILIATION_REQUIRED');
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/** Construction dependencies are TRUSTED server/test dependencies, never request options. */
function createFinancialCoordinator({ poolProvider = getPool, userRepositoryFactory = createUserRepository, catalogService = catalog,
  retryPolicy = {} } = {}) {
  C.fields(retryPolicy, ['maxAttempts','maxElapsedMs'], []);
  const maxAttempts = retryPolicy.maxAttempts ?? 3, maxElapsedMs = retryPolicy.maxElapsedMs ?? 30000;
  if (typeof poolProvider !== 'function' || typeof userRepositoryFactory !== 'function' ||
      typeof catalogService?.ensureLoaded !== 'function' || typeof catalogService?.resolvePurchase !== 'function' ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3 || !Number.isInteger(maxElapsedMs) || maxElapsedMs < 1 || maxElapsedMs > 30000) {
    throw C.fail('FINANCIAL_COORDINATOR_CONFIG_INVALID', 500);
  }
  const registry = new WeakMap();
  const authority = Object.freeze({ resolve(scope) {
    const record = registry.get(scope);
    if (!record || !record.active || record.state.phase !== 'ACTIVE' || record.state.broken) throw C.fail('FINANCIAL_TRANSACTION_REQUIRED', 503);
    return record.context;
  } });
  const users = userRepositoryFactory({ poolProvider, financialScopeAuthority: authority });
  async function acquire(deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw C.fail('FINANCIAL_UNAVAILABLE', 503, true);
    const pool = poolProvider();
    return new Promise((resolve, reject) => {
      let expired = false;
      const timer = setTimeout(() => { expired = true; reject(C.fail('FINANCIAL_UNAVAILABLE', 503, true)); }, remaining);
      Promise.resolve().then(() => pool.connect()).then(client => {
        clearTimeout(timer);
        if (expired) { try { client.release(); } catch (_) { /* unused late client, no transaction */ } }
        else resolve(client);
      }, error => { clearTimeout(timer); reject(error); });
    });
  }
  async function attempt(input, prepared, ids, deadline, resolutionOnly = false) {
    const state = { phase: 'ACQUIRING', client: null, broken: false, begun: false, commitStarted: false, confirmed: false,
      commitRejected: false, inFlight: false, scopes: [] };
    const onError = () => { state.broken = true; };
    async function query(text, values = []) {
      if (state.broken || state.inFlight) throw C.fail('FINANCIAL_UNAVAILABLE', 503, true);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw C.fail('FINANCIAL_UNAVAILABLE', 503, true);
      state.inFlight = true;
      if (text === 'BEGIN ISOLATION LEVEL READ COMMITTED') state.begun = true;
      if (text === 'COMMIT') { state.commitStarted = true; state.phase = 'COMMITTING'; }
      try { return await state.client.query({ text, values, query_timeout: Math.min(5000, remaining) }); }
      catch (error) {
        if (!/^[0-9A-Z]{5}$/.test(error?.code || '') || ['FATAL','PANIC'].includes(error?.severity) || /^08/.test(error?.code || '') ||
            ['57P01','57P02','57P03','25P03'].includes(error?.code)) state.broken = true;
        throw error;
      } finally { state.inFlight = false; }
    }
    const facade = Object.freeze({ query(text, values) {
      if (state.phase !== 'ACTIVE') throw C.fail('FINANCIAL_TRANSACTION_REQUIRED', 503);
      return query(text, values);
    } });
    function balanceHandle(ownerId) {
      const scope = Object.freeze(Object.create(null));
      const context = Object.freeze({ client: facade, actorId: input.actorId, userId: ownerId,
        actorTokenVersion: input.principal.tokenVersion, operationType: input.operationType, currency: 'USD' });
      const record = { context, state, active: true }; registry.set(scope, record); state.scopes.push(record);
      return users.internal.forFinancialTransaction(scope);
    }
    try {
      state.client = await acquire(deadline); state.client.on?.('error', onError);
      const begin = await query('BEGIN ISOLATION LEVEL READ COMMITTED');
      C.assert(begin?.command === 'BEGIN');
      await query("SET LOCAL search_path = pg_catalog, public");
      await query("SET LOCAL lock_timeout = '2s'");
      await query("SET LOCAL statement_timeout = '5s'");
      await query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
      state.phase = 'ACTIVE';
      const p = createPersistence(facade.query);
      const hint = resolutionOnly ? null : await p.readReplay(input);
      const ownerId = resolutionOnly || hint ? null : await p.findOwner(input);
      if (ownerId) C.uuid(ownerId);
      const accounts = await p.prelock(ownerId ? [input.actorId, ownerId] : [input.actorId]);
      authorize(input, accounts);
      const previous = C.receipt(input, await p.readReplay(input), true);
      if (previous || resolutionOnly) return previous;
      C.assert(!hint); // Append-only committed evidence cannot disappear and permit a fresh write.
      if (!ownerId) throw C.fail(['approve','reject'].includes(input.kind) ? 'PAYMENT_NOT_FOUND' : 'ORDER_NOT_FOUND', 404);
      let handle, owner, resourceRow, resource;
      if (input.operationType) {
        handle = balanceHandle(ownerId);
        const states = await handle.lockUsersForUpdate(); owner = states.find(user => user.id === ownerId);
        C.assert(owner);
      }
      if (!['adjust','purchase'].includes(input.kind)) {
        resourceRow = await p.lockResource(input); resource = resourceRow?.resource;
        if (!resource) throw C.fail(['approve','reject'].includes(input.kind) ? 'PAYMENT_NOT_FOUND' : 'ORDER_NOT_FOUND', 404);
        C.assert(resource.user_id === ownerId);
        if (['approve','reject'].includes(input.kind)) C.validatePayment(resourceRow); else C.validateOrder(resourceRow);
        if (resource.status !== 'pending') throw C.fail(['approve','reject'].includes(input.kind) ? 'PAYMENT_ALREADY_DECIDED' : 'ORDER_ALREADY_DECIDED');
      }
      const hash = input.kind === 'purchase' ? prepared.hash : C.fingerprint(input);
      let updated;
      if (input.operationType) {
        const before = owner.balanceCents;
        let after;
        if (input.kind === 'adjust') {
          if (before !== input.expectedBalanceCents) throw C.fail('EXPECTED_BALANCE_MISMATCH');
          after = input.newBalanceCents;
        } else if (input.kind === 'purchase') {
          if (prepared.error) throw prepared.error;
          after = C.checked(BigInt(before) - BigInt(prepared.chargeCents));
        } else after = C.checked(BigInt(before) + BigInt(input.kind === 'approve' ? input.approvedAmountCents : resource.charge_cents));
        updated = await handle.applyBalanceChange({ beforeCents: before, afterCents: after, expectedRowVersion: owner.rowVersion });
        await p.insertJournal(input, { id: ids.operation, ownerId, before, after, hash,
          resourceId: input.kind === 'purchase' ? ids.resource : resource?.id || null,
          publicId: input.kind === 'purchase' ? ids.publicOrder : resource?.order_id || resource?.payment_id || null });
      }
      if (input.kind === 'purchase') await p.insertOrder(input, prepared, ids, updated.balanceCents);
      else if (input.kind !== 'adjust') await p.decide(input, resource, ids, hash, updated?.balanceCents || null);
      if (updated) await p.verifyBalance(ownerId, updated);
      const result = C.receipt(input, await p.readReplay(input), false); C.assert(result);
      await query('SET CONSTRAINTS ALL IMMEDIATE');
      const committed = await query('COMMIT');
      if (committed?.command === 'ROLLBACK') { state.commitRejected = true; throw C.fail('FINANCIAL_UNAVAILABLE', 503, true); }
      C.assert(committed?.command === 'COMMIT'); state.confirmed = true;
      return result;
    } catch (error) {
      const rejected = state.commitRejected || error?.severity === 'ERROR' && COMMIT_REJECTIONS.has(error?.code);
      const unknown = state.commitStarted && !state.confirmed && !rejected;
      if (unknown) state.broken = true;
      throw new AttemptFailure(error, unknown);
    } finally {
      // All owned queries are sequential and awaited; no callbacks/tasks can escape.
      state.phase = 'CLOSING'; state.scopes.forEach(record => { record.active = false; });
      if (state.client) {
        if (state.begun && !state.confirmed && !state.broken) {
          try {
            const rolledBack = await state.client.query({ text: 'ROLLBACK', values: [], query_timeout: 1000 });
            if (rolledBack?.command !== 'ROLLBACK') state.broken = true;
          } catch (_) { state.broken = true; }
        }
        state.client.removeListener?.('error', onError);
        try { state.client.release(state.broken); }
        catch (_) { console.error('Financial coordinator client cleanup failed'); }
      }
      state.phase = 'CLOSED';
    }
  }
  async function resolve(input, prepared, ids, deadline) {
    for (let n = 0; n < maxAttempts && Date.now() < deadline; n++) {
      try { return await attempt(input, prepared, ids, deadline, true); }
      catch (failure) {
        if (RETRYABLE.has(sqlstate(failure.error)) && n + 1 < maxAttempts) {
          await sleep(Math.min(200, 25 * 2 ** n) * (0.5 + Math.random() * 0.5)); continue;
        }
        throw publicError(failure.error);
      }
    }
    throw C.fail('FINANCIAL_UNAVAILABLE', 503, true);
  }
  async function run(kind, raw) {
    const input = C.normalize(raw, kind), ids = Object.freeze({ operation: randomUUID(), resource: randomUUID(), publicOrder: `ord-${randomUUID()}` });
    let prepared = null;
    if (kind === 'purchase') {
      try {
        catalogService.ensureLoaded();
        const pricing = catalogService.resolvePurchase(input);
        C.numeric(pricing.chargeCents); C.numeric(pricing.quantity); C.assert(pricing.chargeCents > 0 && pricing.quantity > 0);
        C.compatible(String(pricing.chargeCents));
        const fulfillment = normalizeTarget(input.fulfillmentTarget, pricing.snapshot);
        // Clone to sever trusted catalog object references; one immutable snapshot per invocation.
        prepared = C.freeze(structuredClone({ ...pricing, fulfillment, hash: C.fingerprint(input, fulfillment) }));
      } catch (error) {
        prepared = Object.freeze({ error: PREPARATION_ERRORS.has(error?.code) ? C.fail(error.code, error.status || 503) : C.fail('FULFILLMENT_CONFIGURATION_INVALID', 503) });
      }
    }
    const deadline = Date.now() + maxElapsedMs;
    for (let n = 0; n < maxAttempts && Date.now() < deadline; n++) {
      try { return await attempt(input, prepared, ids, deadline); }
      catch (failure) {
        const error = failure.error;
        if (failure.unknown || sqlstate(error) === '23505' && DUPLICATES.has(error.constraint)) {
          try {
            const committed = await resolve(input, prepared, ids, deadline);
            if (committed) return committed;
          } catch (resolutionError) {
            if (resolutionError instanceof C.FinancialCoordinatorError && [403,409].includes(resolutionError.status)) throw resolutionError;
          }
          if (failure.unknown) throw C.fail('FINANCIAL_OUTCOME_UNKNOWN', 503, true);
          if (error.constraint === 'financial_source_effect_once') throw C.fail(['approve','reject'].includes(kind) ? 'PAYMENT_RECONCILIATION_REQUIRED' : 'ORDER_RECONCILIATION_REQUIRED');
          throw C.fail('FINANCIAL_UNAVAILABLE', 503, true);
        }
        if (RETRYABLE.has(sqlstate(error))) {
          if (n + 1 >= maxAttempts || Date.now() >= deadline) throw C.fail('FINANCIAL_RETRY_EXHAUSTED', 503, true);
          await sleep(Math.min(200, 25 * 2 ** n) * (0.5 + Math.random() * 0.5)); continue;
        }
        throw publicError(error);
      }
    }
    throw C.fail('FINANCIAL_RETRY_EXHAUSTED', 503, true);
  }
  return Object.freeze({ adjustBalance: input => run('adjust', input), purchaseOrder: input => run('purchase', input),
    approvePayment: input => run('approve', input), rejectPayment: input => run('reject', input),
    completeOrder: input => run('complete', input), cancelOrder: input => run('cancel', input) });
}
module.exports = Object.freeze({ ...createFinancialCoordinator(), createFinancialCoordinator, FinancialCoordinatorError: C.FinancialCoordinatorError });
