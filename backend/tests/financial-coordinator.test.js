'use strict';
const { EventEmitter } = require('node:events');
jest.mock('../db/pg', () => ({ getPool: jest.fn(() => { throw new Error('Default pool must remain lazy'); }) }));
const service = require('../services/financialCoordinator');
const { createUserRepository } = require('../repositories/userRepository');
const A = '00000000-0000-4000-8000-000000000001', U = '00000000-0000-4000-8000-000000000003';
const input = extra => ({ principal: { userId: A, tokenVersion: '1' }, userId: U, newBalanceCents: '12000', expectedBalanceCents: '10000',
  idempotencyKey: 'key-1', reason: 'Reviewed', ...extra });
const unavailableCatalog = { ensureLoaded() {}, resolvePurchase() { throw Object.assign(new Error('raw catalog secret'), { status: 503, code: 'FULFILLMENT_CONFIGURATION_INVALID' }); } };
function fixture(hook = (_client, _q, next) => next(), options = {}) {
  const db = { balance: '10000', version: '0', journal: null }, events = [], clients = [], scopes = [], handles = [], contexts = [];
  let authority;
  const pool = { connect: jest.fn(async () => {
    const client = new EventEmitter(); clients.push(client); let saved, committed = false;
    const user = id => ({ id, role: id === A ? 'admin' : 'user', account_status: 'active', token_version: '1',
      balance_cents: id === U ? db.balance : '0', balance: id === U ? require('../utils/money').formatMoney(Number(db.balance)) : '0.00', row_version: id === U ? db.version : '0' });
    client.query = jest.fn(async q => {
      events.push(q.text);
      const next = async () => {
        const s = q.text, p = q.values;
        if (s.startsWith('BEGIN')) { saved = { ...db }; return { command: 'BEGIN', rows: [] }; }
        if (s === 'ROLLBACK') { Object.assign(db, saved); return { command: 'ROLLBACK', rows: [] }; }
        if (s === 'COMMIT') { committed = true; return { command: 'COMMIT', rows: [] }; }
        if (s.startsWith('SET')) return { command: 'SET', rows: [] };
        if (s.includes('financial:replay:adjust')) return { rows: db.journal ? [{ ...Object.fromEntries(Object.entries(db.journal).map(([k,v]) => [`j_${k}`,v])), owner_legacy: null, actor_legacy: null }] : [] };
        if (s.includes('ORDER BY id FOR UPDATE')) return { rows: p[0].map(user) };
        if (s.startsWith('UPDATE public.users SET balance_cents')) {
          if (p[2] !== db.version || p[3] !== db.balance) return { rows: [] };
          db.balance = p[0]; db.version = String(BigInt(db.version) + 1n); return { rows: [user(U)] };
        }
        if (s.includes('financial:journal')) {
          db.journal = { id: p[0], legacy_mongo_id: null, actor_id: p[1], user_id: p[2], operation_type: p[3], currency: 'USD',
            idempotency_key: p[4], payload_hash: p[5], before_cents: p[6], after_cents: p[7], delta_cents: String(BigInt(p[7])-BigInt(p[6])),
            source_type: p[8], source_id: p[9], effect: p[10], reason: p[11], result_balance_cents: p[7],
            result_balance: require('../utils/money').formatMoney(Number(p[7])), result_resource_id: p[12], created_at: new Date() };
          return { rows: [{ id: p[0] }] };
        }
        if (s.includes('financial:final-balance')) return { rows: [{ balance_cents: db.balance, row_version: db.version }] };
        throw new Error('Unexpected fake SQL');
      };
      return hook(client, q, next);
    });
    client.release = jest.fn(destroy => { if (destroy && !committed && saved) Object.assign(db, saved); });
    return client;
  }) };
  const coordinator = service.createFinancialCoordinator({ poolProvider: () => pool, catalogService: unavailableCatalog,
    userRepositoryFactory(deps) {
      authority = deps.financialScopeAuthority; const repo = createUserRepository(deps);
      return { internal: { forFinancialTransaction(scope) {
        scopes.push(scope); contexts.push(authority.resolve(scope)); const handle = repo.internal.forFinancialTransaction(scope); handles.push(handle); return handle;
      } } };
    }, ...options });
  return { db, pool, clients, events, scopes, handles, contexts, coordinator, getAuthority: () => authority };
}
const pgError = code => Object.assign(new Error('RAW SQL CREDENTIAL TARGET SECRET'), { code, severity: 'ERROR' });
afterEach(() => jest.restoreAllMocks());
test('default import is lazy and exposes only operations, construction and sanitized error type', () => {
  expect(require('../db/pg').getPool).not.toHaveBeenCalled();
  expect(Object.keys(service).sort()).toEqual(['FinancialCoordinatorError','adjustBalance','approvePayment','cancelOrder','completeOrder','createFinancialCoordinator','purchaseOrder','rejectPayment'].sort());
  for (const name of ['setBalance','withTransaction','internal','issueScope','client','authority']) expect(service[name]).toBeUndefined();
});
test('BEGIN, limits, sorted locks, financial DML, evidence check and COMMIT precede one clean release', async () => {
  const f = fixture(); expect(await f.coordinator.adjustBalance(input())).toMatchObject({ balanceCents: '12000', replayed: false });
  expect(f.events[0]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED');
  expect(f.events.slice(1,5)).toEqual(["SET LOCAL search_path = pg_catalog, public","SET LOCAL lock_timeout = '2s'","SET LOCAL statement_timeout = '5s'","SET LOCAL idle_in_transaction_session_timeout = '10s'"]);
  expect(f.events.slice(-2)).toEqual(['SET CONSTRAINTS ALL IMMEDIATE','COMMIT']);
  expect(f.events).not.toContain('ROLLBACK'); expect(f.clients[0].release.mock.calls).toEqual([[false]]);
  expect(f.clients[0].query.mock.calls.every(([q]) => q.query_timeout > 0 && q.query_timeout <= 5000)).toBe(true);
  expect(f.contexts[0]).toMatchObject({ actorId: A, userId: U, currency: 'USD', operationType: 'balance_adjustment' });
  expect(Object.isFrozen(f.contexts[0])).toBe(true);
});
test('replay ends without financial DML or COMMIT and returns historical balance', async () => {
  const f = fixture(), original = await f.coordinator.adjustBalance(input()); f.db.balance = '50000';
  const start = f.events.length;
  expect(await f.coordinator.adjustBalance(input())).toEqual({ ...original, replayed: true });
  expect(f.events.slice(start)).toContain('ROLLBACK'); expect(f.events.slice(start)).not.toContain('COMMIT');
  expect(f.events.slice(start).some(s => s.includes('financial:journal') || s.startsWith('UPDATE'))).toBe(false);
});
test.each(['40001','40P01'])('%s retries complete transactions with new scopes and preserved input', async code => {
  let failures = 0;
  const f = fixture((_c,q,next) => { if (q.text.includes('financial:journal') && failures++ < 2) throw pgError(code); return next(); });
  expect((await f.coordinator.adjustBalance(input())).balanceCents).toBe('12000');
  expect(f.pool.connect).toHaveBeenCalledTimes(3); expect(f.scopes).toHaveLength(3); expect(new Set(f.scopes).size).toBe(3);
  expect(new Set(f.contexts).size).toBe(3); expect(f.db.version).toBe('1'); expect(f.events.filter(s => s === 'ROLLBACK')).toHaveLength(2);
  for (const scope of f.scopes) expect(() => f.getAuthority().resolve(scope)).toThrow('FINANCIAL_TRANSACTION_REQUIRED');
});
test.each(['40001','40P01'])('mapped user repository %s remains retryable', async code => {
  let failures = 0;
  const f = fixture((_c,q,next) => { if (q.text.startsWith('UPDATE public.users') && failures++ === 0) throw pgError(code); return next(); });
  expect((await f.coordinator.adjustBalance(input())).replayed).toBe(false); expect(f.pool.connect).toHaveBeenCalledTimes(2);
});
test.each(['40001','40P01'])('%s at COMMIT is a definitive failure and retries, not unknown', async code => {
  let failures = 0;
  const f = fixture((_c,q,next) => { if (q.text === 'COMMIT' && failures++ === 0) throw pgError(code); return next(); });
  expect((await f.coordinator.adjustBalance(input())).replayed).toBe(false); expect(f.db.version).toBe('1'); expect(f.pool.connect).toHaveBeenCalledTimes(2);
});
test.each(['40001','40P01'])('%s exhaustion is bounded, sanitized and has no financial effects', async code => {
  const f = fixture((_c,q,next) => { if (q.text.includes('financial:journal')) throw pgError(code); return next(); });
  let error; try { await f.coordinator.adjustBalance(input()); } catch (e) { error = e; }
  expect(error).toMatchObject({ status: 503, code: 'FINANCIAL_RETRY_EXHAUSTED', retryWithSameKey: true });
  expect(JSON.stringify(error)).not.toMatch(/RAW|SECRET|CREDENTIAL/); expect(error.cause).toBeUndefined();
  expect(f.pool.connect).toHaveBeenCalledTimes(3); expect(f.db).toEqual({ balance: '10000', version: '0', journal: null });
});
test('network failure before COMMIT destroys its client but is not an unknown commit or automatic retry', async () => {
  const f = fixture((_c,q,next) => { if (q.text.includes('financial:journal')) throw Object.assign(new Error('raw private error'), { code: 'ECONNRESET' }); return next(); });
  await expect(f.coordinator.adjustBalance(input())).rejects.toMatchObject({ code: 'FINANCIAL_UNAVAILABLE', status: 503 });
  expect(f.clients[0].release.mock.calls).toEqual([[true]]); expect(f.pool.connect).toHaveBeenCalledTimes(1); expect(f.events).not.toContain('COMMIT');
});
test.each(['ECONNRESET','57014','57P01','08006'])('non-definitive COMMIT error %s preserves uncertainty and never repeats the write', async code => {
  const f = fixture((_c,q,next) => { if (q.text === 'COMMIT') throw Object.assign(new Error('lost acknowledgement'), { code }); return next(); });
  await expect(f.coordinator.adjustBalance(input())).rejects.toMatchObject({ code: 'FINANCIAL_OUTCOME_UNKNOWN', retryWithSameKey: true });
  expect(f.clients[0].release.mock.calls).toEqual([[true]]); expect(f.events.filter(s => s.includes('financial:journal'))).toHaveLength(1);
});
test('FATAL with a normally retryable SQLSTATE is still an unknown COMMIT', async () => {
  const f = fixture((_c,q,next) => { if (q.text === 'COMMIT') throw Object.assign(pgError('40001'), { severity: 'FATAL' }); return next(); });
  await expect(f.coordinator.adjustBalance(input())).rejects.toMatchObject({ code: 'FINANCIAL_OUTCOME_UNKNOWN' });
  expect(f.events.filter(s => s === 'COMMIT')).toHaveLength(1);
});
test('confirmed commit followed by lost response resolves a historical receipt on a clean transaction', async () => {
  const f = fixture(async (_c,q,next) => { const result = await next(); if (q.text === 'COMMIT') throw new Error('lost response'); return result; });
  expect((await f.coordinator.adjustBalance(input())).replayed).toBe(true); expect(f.db.balance).toBe('12000');
  expect(f.clients[0].release.mock.calls).toEqual([[true]]); expect(f.clients[1].release.mock.calls).toEqual([[false]]);
});
test('ROLLBACK command returned for COMMIT never reports success or uncertainty', async () => {
  const f = fixture(async (_c,q,next) => q.text === 'COMMIT' ? { command: 'ROLLBACK', rows: [] } : next());
  await expect(f.coordinator.adjustBalance(input())).rejects.toMatchObject({ code: 'FINANCIAL_UNAVAILABLE' });
  expect(f.events.filter(s => s === 'COMMIT')).toHaveLength(1); expect(f.db.balance).toBe('10000');
});
test('failed rollback destroys the client and preserves the original business error', async () => {
  const f = fixture((_c,q,next) => { if (q.text === 'ROLLBACK') throw new Error('cleanup secret'); return next(); });
  await expect(f.coordinator.adjustBalance(input({ expectedBalanceCents: '9000' }))).rejects.toMatchObject({ code: 'EXPECTED_BALANCE_MISMATCH' });
  expect(f.clients[0].release.mock.calls).toEqual([[true]]);
});
test('cleanup failure cannot erase a confirmed financial commit', async () => {
  const f = fixture(); const connect = f.pool.connect;
  f.pool.connect = async () => { const c = await connect(); c.release.mockImplementation(() => { throw new Error('cleanup secret'); }); return c; };
  const log = jest.spyOn(console,'error').mockImplementation(() => {});
  expect((await f.coordinator.adjustBalance(input())).balanceCents).toBe('12000'); expect(log).toHaveBeenCalledWith('Financial coordinator client cleanup failed');
});
test.each(['23503','23514'])('integrity failure %s rolls back without guessing a second effect', async code => {
  const f = fixture((_c,q,next) => { if (q.text === 'SET CONSTRAINTS ALL IMMEDIATE') throw pgError(code); return next(); });
  await expect(f.coordinator.adjustBalance(input())).rejects.toMatchObject({ status: 409, code: 'FINANCIAL_RECONCILIATION_REQUIRED' });
  expect(f.db.balance).toBe('10000'); expect(f.events).not.toContain('COMMIT');
});
test('unknown unique constraints do not enter idempotency recovery', async () => {
  const f = fixture((_c,q,next) => { if (q.text.includes('financial:journal')) throw Object.assign(pgError('23505'), { constraint: 'unrelated_unique' }); return next(); });
  await expect(f.coordinator.adjustBalance(input())).rejects.toMatchObject({ code: 'FINANCIAL_UNAVAILABLE' }); expect(f.pool.connect).toHaveBeenCalledTimes(1);
});
test('scope registry rejects arbitrary values and revoked handles after rollback', async () => {
  const f = fixture();
  for (const scope of [null, 1, {}, { inTransaction: true, client: {} }, Object.freeze({})]) expect(() => f.getAuthority().resolve(scope)).toThrow();
  await expect(f.coordinator.adjustBalance(input({ expectedBalanceCents: '0' }))).rejects.toMatchObject({ code: 'EXPECTED_BALANCE_MISMATCH' });
  await expect(f.handles[0].applyBalanceChange({ beforeCents: '10000', afterCents: '12000', expectedRowVersion: '0' })).rejects.toThrow('FINANCIAL_TRANSACTION_REQUIRED');
});
test.each(['000','01','-1','+1','1.0','1e3',' 1','1\n','9007199254740992',1,1n,undefined,null,-0])('noncanonical or invalid desired cents %s are rejected before connecting', async value => {
  const f = fixture(); await expect(f.coordinator.adjustBalance(input({ newBalanceCents: value }))).rejects.toMatchObject({ status: 400 }); expect(f.pool.connect).not.toHaveBeenCalled();
});
test('canonical zero adjustment is an audited debit to zero', async () => {
  const f = fixture(); expect((await f.coordinator.adjustBalance(input({ newBalanceCents: '0' }))).balanceCents).toBe('0'); expect(f.db.journal.delta_cents).toBe('-10000');
});
test.each(['actorId','role','balance','deltaCents','currency','scope','client','financialScopeAuthority','notification','rowVersion'])('unknown privileged field %s is rejected before any connection', async field => {
  const f = fixture(); await expect(f.coordinator.adjustBalance(input({ [field]: 'secret' }))).rejects.toMatchObject({ status: 400 }); expect(f.pool.connect).not.toHaveBeenCalled();
});
test.each(['userId','tokenVersion'])('missing principal %s is rejected', async field => {
  const f = fixture(), raw = input(); delete raw.principal[field];
  await expect(f.coordinator.adjustBalance(raw)).rejects.toMatchObject({ status: 400 }); expect(f.pool.connect).not.toHaveBeenCalled();
});
test.each(['','bad key','key\n','x'.repeat(129),null,10])('invalid key %j is rejected without acquiring a client', async key => {
  const f = fixture(); await expect(f.coordinator.adjustBalance(input({ idempotencyKey: key }))).rejects.toMatchObject({ code: 'INVALID_IDEMPOTENCY_KEY' }); expect(f.pool.connect).not.toHaveBeenCalled();
});
test.each(['', ' ', 'x'.repeat(501), null, 10])('invalid audit reason %j is rejected', async reason => {
  const f = fixture(); await expect(f.coordinator.adjustBalance(input({ reason }))).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_REASON' }); expect(f.pool.connect).not.toHaveBeenCalled();
});
test('adjustment audit reasons retain existing trim semantics without being echoed in receipts', async () => {
  const f = fixture(); const result = await f.coordinator.adjustBalance(input({ reason: '  Reviewed\n' }));
  expect(f.db.journal.reason).toBe('Reviewed'); expect(result).not.toHaveProperty('reason');
});
test('accessor and symbol fields cannot execute or smuggle operation arguments', async () => {
  const f = fixture(), raw = input(), getter = jest.fn(); Object.defineProperty(raw,'userId',{ get: getter });
  await expect(f.coordinator.adjustBalance(raw)).rejects.toMatchObject({ status: 400 }); expect(getter).not.toHaveBeenCalled();
  const symbolic = input(); symbolic[Symbol('role')] = 'admin'; await expect(f.coordinator.adjustBalance(symbolic)).rejects.toMatchObject({ status: 400 });
});
test.each([{ maxAttempts: 0 },{ maxAttempts: 4 },{ maxElapsedMs: 0 },{ maxElapsedMs: 30001 },{ maxAttempts: 1.5 },{ callback() {} }])('invalid retry policy %j is rejected', retryPolicy => {
  expect(() => fixture(undefined, { retryPolicy })).toThrow();
});
test('late acquisition after deadline is released unused, with no late BEGIN', async () => {
  const client = { query: jest.fn(), release: jest.fn() };
  const coordinator = service.createFinancialCoordinator({ poolProvider: () => ({ connect: () => new Promise(resolve => setTimeout(() => resolve(client),30)) }),
    catalogService: unavailableCatalog, retryPolicy: { maxElapsedMs: 5 } });
  await expect(coordinator.adjustBalance(input())).rejects.toMatchObject({ status: 503 });
  await new Promise(resolve => setTimeout(resolve,40)); expect(client.release).toHaveBeenCalledTimes(1); expect(client.query).not.toHaveBeenCalled();
});
