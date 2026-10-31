'use strict';

const { inspect } = require('node:util');
const bcrypt = require('bcryptjs');
const { formatMoney, MAX_CENTS } = require('../utils/money');
jest.mock('../db/pg', () => ({ getPool: jest.fn(() => { throw new Error('Default pool must not be constructed in unit tests'); }) }));
const defaultRepository = require('../repositories/userRepository');
const { createUserRepository } = defaultRepository;
const ID = '00000000-0000-4000-8000-000000000002';
const ADMIN = '00000000-0000-4000-8000-000000000001';
const PASSWORD = 'GoodPassword1!';
const SECRET = 'PRIVATE-SECRET-MUST-NOT-LEAK';
let HASH;

function row(overrides = {}) {
  return { id: ID, username: 'Test_User', email: 'user@example.test', email_verified: false,
    phone: null, provider: 'local', theme: 0, balance_cents: '0', balance: '0.00', avatar: '',
    role: 'user', account_status: 'active', two_fa_status: 'disabled', last_login: null, activated_at: null,
    row_version: '0', created_at: new Date('2026-10-29T00:00:00Z'), updated_at: new Date('2026-10-29T00:00:00Z'),
    password_hash: HASH, token_version: '1', login_attempts: 0, two_fa_secret: SECRET,
    reset_password_token: SECRET, reset_password_expires: SECRET, trusted_devices: [SECRET],
    google_id: SECRET, legacy_mongo_id: 'a'.repeat(24), ...overrides };
}
function fixture(rows = [row()]) {
  const pool = { query: jest.fn(async () => ({ rows, rowCount: rows.length })) };
  const poolProvider = jest.fn(() => pool);
  return { pool, poolProvider, repo: createUserRepository({ poolProvider }) };
}
function registration(extra = {}) { return { username: ' Test_User ', email: ' USER@EXAMPLE.TEST ', password: PASSWORD, ...extra }; }
function publicProjection(sql) { return sql.match(/(?:SELECT|RETURNING)\s+([\s\S]*?)(?:\s+FROM|$)/i)[1]; }
function expectNoSecrets(value) {
  const text = JSON.stringify(value) + inspect(value);
  expect(text).not.toContain(SECRET); expect(text).not.toContain(HASH);
  for (const key of ['password_hash', 'passwordHash', 'password', 'tokenVersion', 'token_version', 'two_fa_secret',
    'reset_password_token', 'trusted_devices', 'legacy_mongo_id', 'google_id']) expect(value).not.toHaveProperty(key);
}

beforeAll(async () => { HASH = await bcrypt.hash(PASSWORD, 12); });
beforeEach(() => { jest.spyOn(bcrypt, 'hash').mockImplementation(async () => HASH); });
afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

test('module import is lazy, has no standalone balance setter, and the default financial interface is disabled', () => {
  expect(require('../db/pg').getPool).not.toHaveBeenCalled();
  expect(defaultRepository.setBalance).toBeUndefined(); expect(defaultRepository.incrementBalance).toBeUndefined();
  expect(defaultRepository.applyBalanceChange).toBeUndefined();
  expect(() => defaultRepository.internal.forFinancialTransaction({ client: { query: jest.fn() }, inTransaction: true }))
    .toThrow('FINANCIAL_TRANSACTION_REQUIRED');
});

test.each([
  ['findById', ID, [ID]], ['findByEmail', ' USER@EXAMPLE.TEST ', ['user@example.test']],
  ['findByUsername', ' Test_User ', ['Test_User']]
])('%s uses fixed safe projections, parameter values and frozen string-valued money/version DTOs', async (method, input, expected) => {
  const f = fixture(); const user = await f.repo[method](input);
  const [sql, values] = f.pool.query.mock.calls[0];
  expect(values).toEqual(expected); expect(sql).not.toMatch(/SELECT\s+\*/i);
  expect(publicProjection(sql)).not.toMatch(/password|token_version|trusted_devices|two_fa_secret|reset_password|legacy_mongo_id|google_id/);
  expectNoSecrets(user); expect(Object.isFrozen(user)).toBe(true);
  expect(user).toMatchObject({ balanceCents: '0', balance: '0.00', rowVersion: '0', createdAt: '2026-10-29T00:00:00.000Z' });
});

test('username ownership lookup preserves exact case-sensitive uniqueness', async () => {
  const f = fixture(); await f.repo.findByUsername('Test_User');
  expect(f.pool.query.mock.calls[0][0]).toContain('username = $1 COLLATE "C"');
  expect(f.pool.query.mock.calls[0][0]).not.toContain('lower(username)');
});

test.each(['findById', 'findByEmail', 'findByUsername'])('%s returns null for a missing user', async method => {
  const f = fixture([]); const input = { findById: ID, findByEmail: 'user@example.test', findByUsername: 'Test_User' }[method];
  await expect(f.repo[method](input)).resolves.toBeNull();
});

test.each([
  ['findById', 'a'.repeat(24)], ['findById', `${ID}\n`], ['findById', "' OR TRUE --"],
  ['findByEmail', 'not-an-email'], ['findByEmail', null], ['findByUsername', 'ab'],
  ['findByUsername', "Test_User' OR TRUE --"], ['findByUsername', true]
])('%s rejects invalid lookup input %j before acquiring a pool', async (method, input) => {
  const f = fixture(); await expect(f.repo[method](input)).rejects.toThrow(/^INVALID_/);
  expect(f.poolProvider).not.toHaveBeenCalled();
});

test('safe mappings reject coerced BIGINT and inconsistent generated balance, without creating defaults', async () => {
  for (const override of [{ balance_cents: 0 }, { balance_cents: undefined }, { balance_cents: '00' },
    { balance_cents: '9007199254740992' }, { balance: '1.00' }, { row_version: 0 }]) {
    const f = fixture([row(override)]);
    await expect(f.repo.findById(ID)).rejects.toThrow(/BALANCE_STATE_MISMATCH|USER_STATE_INVALID/);
  }
});

test('exact decimal strings remain readable even when a numeric compatibility mirror is unrepresentable', async () => {
  const f = fixture([row({ balance_cents: String(MAX_CENTS), balance: formatMoney(MAX_CENTS) })]);
  await expect(f.repo.findById(ID)).resolves.toMatchObject({ balanceCents: String(MAX_CENTS), balance: formatMoney(MAX_CENTS) });
});

test.each([
  ['email', ' USER@EXAMPLE.TEST ', 'email = $1', 'user@example.test'],
  ['username', ' test_user ', 'lower(username) = lower($1)', 'test_user'],
  ['phone', '+14155552671', 'phone = $1', '+14155552671']
])('findForAuth performs a private, bounded %s lookup without returning a hash', async (_kind, input, predicate, expected) => {
  const f = fixture(); const auth = await f.repo.findForAuth(input);
  const [sql, values] = f.pool.query.mock.calls[0];
  expect(sql).toContain(predicate); expect(sql).toContain('ORDER BY id LIMIT 2');
  expect(sql).toContain('password_hash, token_version, login_attempts'); expect(values).toEqual([expected]);
  expectNoSecrets(auth); expectNoSecrets(auth.user); expectNoSecrets(JSON.parse(JSON.stringify(auth)));
  expect(auth.getAuthState()).toMatchObject({ tokenVersion: '1', loginAttempts: 0, accountStatus: 'active' });
  expect(Object.isFrozen(auth)).toBe(true); expect(Object.isFrozen(auth.getAuthState())).toBe(true);
});

test('real bcrypt verifies a cost-12 password through an opaque auth record', async () => {
  // bcryptjs.compare internally calls bcrypt.hash with a callback; do not stub it here.
  bcrypt.hash.mockRestore();
  const f = fixture(); const auth = await f.repo.findForAuth('Test_User');
  expect(bcrypt.getRounds(HASH)).toBe(12);
  await expect(auth.verifyPassword(PASSWORD)).resolves.toBe(true);
  await expect(auth.verifyPassword('OtherPassword1!')).resolves.toBe(false);
  expectNoSecrets(auth);
});

test('authentication does not reapply registration strength rules to legacy candidate passwords', async () => {
  const f = fixture(); const auth = await f.repo.findForAuth('Test_User');
  const compare = jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
  await expect(auth.verifyPassword('legacy')).resolves.toBe(true); expect(compare).toHaveBeenCalledWith('legacy', HASH);
});

test.each(['', null, 123, 'A1a!' + 'é'.repeat(35)])('invalid authentication candidate %j never reaches bcrypt', async candidate => {
  const f = fixture(); const auth = await f.repo.findForAuth('Test_User'); const compare = jest.spyOn(bcrypt, 'compare');
  await expect(auth.verifyPassword(candidate)).resolves.toBe(false); expect(compare).not.toHaveBeenCalled();
});

test('Google-only credentials do not acquire a fabricated password', async () => {
  const f = fixture([row({ provider: 'google', password_hash: null, token_version: '0' })]);
  const auth = await f.repo.findForAuth('user@example.test');
  await expect(auth.verifyPassword(PASSWORD)).resolves.toBe(false); expectNoSecrets(auth);
});

test.each([undefined, 'not-a-hash', null])('local auth fails closed on missing or malformed stored hash %j', async password_hash => {
  const f = fixture([row({ password_hash })]); await expect(f.repo.findForAuth('Test_User')).rejects.toThrow('USER_STATE_INVALID');
});

test('ambiguous case-insensitive usernames fail closed even when one spelling matches exactly', async () => {
  const f = fixture([row({ username: 'Test_User' }), row({ id: ADMIN, username: 'test_user' })]);
  await expect(f.repo.findForAuth('Test_User')).rejects.toThrow('USER_IDENTIFIER_AMBIGUOUS');
  expect(bcrypt.hash).not.toHaveBeenCalled();
});

test('findForAuth returns null for an absent account and rejects empty identifiers before SQL', async () => {
  const f = fixture([]); await expect(f.repo.findForAuth('Missing')).resolves.toBeNull();
  f.poolProvider.mockClear(); await expect(f.repo.findForAuth('   ')).rejects.toThrow('INVALID_AUTH_IDENTIFIER');
  expect(f.poolProvider).not.toHaveBeenCalled();
});

test('bcrypt comparison errors are sanitized without leaking stored credentials', async () => {
  const f = fixture(); const auth = await f.repo.findForAuth('Test_User');
  jest.spyOn(bcrypt, 'compare').mockRejectedValue(new Error(HASH + SECRET));
  let error; try { await auth.verifyPassword(PASSWORD); } catch (e) { error = e; }
  expect(error.code).toBe('USER_PASSWORD_CHECK_FAILED'); expectNoSecrets(error);
});

test('createUser hashes cost 12 before pool access and writes only validated registration values', async () => {
  const f = fixture(); let finish;
  bcrypt.hash.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.repo.createUser(registration());
  expect(bcrypt.hash).toHaveBeenCalledWith(PASSWORD, 12); expect(f.poolProvider).not.toHaveBeenCalled();
  finish(HASH); const user = await pending;
  const [sql, values] = f.pool.query.mock.calls[0];
  expect(values).toEqual(['Test_User', 'user@example.test', HASH, null]);
  expect(sql).toContain("'local', 'user', 'active', 0, FALSE, 1");
  expect(sql).not.toMatch(/\b(balance|row_version)\s*=/); expectNoSecrets(user);
  expect(user).toMatchObject({ balanceCents: '0', rowVersion: '0', emailVerified: false });
});

test('createUser generates a real cost-12 bcrypt hash, never stores plaintext, and returns no hash', async () => {
  bcrypt.hash.mockRestore();
  const f = fixture(); const user = await f.repo.createUser(registration());
  const storedHash = f.pool.query.mock.calls[0][1][2];
  expect(bcrypt.getRounds(storedHash)).toBe(12); expect(storedHash).not.toBe(PASSWORD);
  await expect(bcrypt.compare(PASSWORD, storedHash)).resolves.toBe(true);
  expect(JSON.stringify(user)).not.toContain(storedHash); expectNoSecrets(user);
});

test('registration preserves the exact 72-byte password including leading/trailing spaces', async () => {
  const f = fixture(); const boundary = 'A1a!' + 'é'.repeat(34);
  expect(Buffer.byteLength(boundary, 'utf8')).toBe(72);
  await f.repo.createUser(registration({ password: boundary })); expect(bcrypt.hash).toHaveBeenLastCalledWith(boundary, 12);
  await f.repo.createUser(registration({ password: ' GoodPassword1! ' }));
  expect(bcrypt.hash).toHaveBeenLastCalledWith(' GoodPassword1! ', 12);
});

test.each(['short1!', 'alllowercase1!', 'ALLUPPERCASE1!', 'NoDigitsHere!', 'NoSymbols123',
  'A1a!' + 'é'.repeat(35), 'GoodPassword1!\n', '', null, 123])('weak/invalid password %j fails before bcrypt or SQL', async password => {
  const f = fixture(); await expect(f.repo.createUser(registration({ password }))).rejects.toThrow('INVALID_PASSWORD');
  expect(bcrypt.hash).not.toHaveBeenCalled(); expect(f.poolProvider).not.toHaveBeenCalled();
});

test.each(['username', 'email', 'password'])('registration requires its own %s field', async field => {
  const f = fixture(); const input = registration(); delete input[field];
  await expect(f.repo.createUser(input)).rejects.toThrow('INVALID_USER_CREATE_FIELDS');
  expect(bcrypt.hash).not.toHaveBeenCalled(); expect(f.poolProvider).not.toHaveBeenCalled();
});

test.each(['role', 'balance', 'balanceCents', 'balance_cents', 'row_version', 'token_version', 'password_hash',
  'provider', 'legacy_mongo_id', 'email_verified', 'google_id'])('registration rejects privileged/unknown field %s', async field => {
  const f = fixture(); await expect(f.repo.createUser(registration({ [field]: SECRET }))).rejects.toThrow('INVALID_USER_CREATE_FIELDS');
  expect(bcrypt.hash).not.toHaveBeenCalled(); expect(f.poolProvider).not.toHaveBeenCalled();
});

test('registration rejects accessor/symbol payloads without invoking a getter', async () => {
  const f = fixture(); const input = registration(); const getter = jest.fn(() => PASSWORD);
  Object.defineProperty(input, 'password', { get: getter, enumerable: true });
  await expect(f.repo.createUser(input)).rejects.toThrow('INVALID_USER_CREATE_FIELDS'); expect(getter).not.toHaveBeenCalled();
  await expect(f.repo.createUser({ ...registration(), [Symbol('unknown')]: true })).rejects.toThrow('INVALID_USER_CREATE_FIELDS');
});

test.each([{ username: 'ab' }, { email: 'invalid' }, { phone: '123' }])('registration validates identifiers %j before hashing', async invalid => {
  const f = fixture(); await expect(f.repo.createUser(registration(invalid))).rejects.toThrow(/^INVALID_/);
  expect(bcrypt.hash).not.toHaveBeenCalled(); expect(f.poolProvider).not.toHaveBeenCalled();
});

test.each([
  ['users_email_key', 'USER_EMAIL_TAKEN'], ['users_username_key', 'USER_USERNAME_TAKEN'],
  ['users_phone_key', 'USER_PHONE_TAKEN'], ['owned_unknown_key', 'USER_DUPLICATE'],
  ['constructor', 'USER_DUPLICATE'], ['__proto__', 'USER_DUPLICATE']
])('uniqueness constraint %s maps to sanitized %s without a preflight check', async (constraint, code) => {
  const f = fixture(); f.pool.query.mockRejectedValue(Object.assign(new Error(SECRET + HASH), { code: '23505', constraint, detail: SECRET }));
  let error; try { await f.repo.createUser(registration()); } catch (e) { error = e; }
  expect(error.code).toBe(code); expect(error.databaseCode).toBe('23505'); expectNoSecrets(error);
  expect(f.pool.query).toHaveBeenCalledTimes(1); expect(f.pool.query.mock.calls[0][0]).toMatch(/^INSERT/);
});

test('concurrent duplicate-email creation relies on the unique constraint, not read-before-write', async () => {
  const f = fixture(); let inserted = false;
  f.pool.query.mockImplementation(async () => {
    if (inserted) throw Object.assign(new Error(SECRET), { code: '23505', constraint: 'users_email_key' });
    inserted = true; return { rows: [row()] };
  });
  const results = await Promise.allSettled([f.repo.createUser(registration()), f.repo.createUser(registration())]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected').reason.code).toBe('USER_EMAIL_TAKEN');
  expect(f.pool.query.mock.calls.every(([sql]) => sql.startsWith('INSERT'))).toBe(true);
});

test('hash failure or a wrong-cost hash never acquires a connection', async () => {
  const f = fixture(); bcrypt.hash.mockRejectedValue(new Error(PASSWORD + SECRET));
  await expect(f.repo.createUser(registration())).rejects.toThrow('USER_PASSWORD_HASH_FAILED'); expect(f.poolProvider).not.toHaveBeenCalled();
  bcrypt.hash.mockResolvedValue(HASH.replace('$12$', '$04$'));
  await expect(f.repo.createUser(registration())).rejects.toThrow('USER_PASSWORD_HASH_FAILED'); expect(f.poolProvider).not.toHaveBeenCalled();
});

test('transport failure on autocommit creation reports unknown outcome and never retries', async () => {
  const f = fixture(); f.pool.query.mockRejectedValue(Object.assign(new Error(SECRET), { code: 'ECONNRESET' }));
  await expect(f.repo.createUser(registration())).rejects.toThrow('USER_WRITE_OUTCOME_UNKNOWN');
  expect(f.pool.query).toHaveBeenCalledTimes(1);
});

test('read/storage failures are sanitized without sensitive causes or SQL detail', async () => {
  const f = fixture(); f.pool.query.mockRejectedValue(Object.assign(new Error(SECRET), { code: '42601', detail: SECRET }));
  let error; try { await f.repo.findById(ID); } catch (e) { error = e; }
  expect(error.code).toBe('USER_STORAGE_ERROR'); expect(error.databaseCode).toBe('42601'); expectNoSecrets(error);
});

test('updateProfile uses a narrow parameterized patch and lets the trigger advance the version', async () => {
  const f = fixture([row({ theme: 1, avatar: 'https://example.test/a.png', row_version: '1' })]);
  const user = await f.repo.updateProfile(ID, { avatar: 'https://example.test/a.png', theme: 1 }, '0');
  const [sql, values] = f.pool.query.mock.calls[0];
  expect(values).toEqual([1, 'https://example.test/a.png', ID, '0']);
  expect(sql).toContain('SET theme = $1, avatar = $2'); expect(sql).toContain('WHERE id = $3::UUID AND row_version = $4::BIGINT');
  expect(sql.split('WHERE')[0]).not.toMatch(/row_version|updated_at|balance_cents/);
  expect(user.rowVersion).toBe('1'); expectNoSecrets(user);
});

test('a stale or absent profile produces a conflict without a second racy query', async () => {
  const f = fixture([]); await expect(f.repo.updateProfile(ID, { theme: 1 }, '0')).rejects.toThrow('USER_VERSION_CONFLICT');
  expect(f.pool.query).toHaveBeenCalledTimes(1);
});

test('two concurrent same-version profile changes cannot silently overwrite each other', async () => {
  const f = fixture(); let current = row();
  f.pool.query.mockImplementation(async (_sql, values) => {
    if (values.at(-1) !== current.row_version) return { rows: [] };
    current = row({ theme: values[0], row_version: String(BigInt(current.row_version) + 1n) });
    return { rows: [current] };
  });
  const results = await Promise.allSettled([f.repo.updateProfile(ID, { theme: 1 }, '0'), f.repo.updateProfile(ID, { theme: 0 }, '0')]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected').reason.code).toBe('USER_VERSION_CONFLICT');
});

test.each(['balance', 'balanceCents', 'balance_cents', 'role', 'account_status', 'password_hash', 'username',
  'email', 'token_version', 'row_version', 'id', 'updated_at'])('profile patch cannot modify protected field %s', async field => {
  const f = fixture(); await expect(f.repo.updateProfile(ID, { [field]: SECRET }, '0')).rejects.toThrow('INVALID_USER_PROFILE_FIELDS');
  expect(f.poolProvider).not.toHaveBeenCalled();
});

test.each([{ theme: '1' }, { theme: 2 }, { theme: true }, { avatar: 'javascript:alert(1)' }, { avatar: null }, {}])('profile patch validates %j before SQL', async patch => {
  const f = fixture(); await expect(f.repo.updateProfile(ID, patch, '0')).rejects.toThrow(/^INVALID_/);
  expect(f.poolProvider).not.toHaveBeenCalled();
});

test.each(['00', '-0', '-1', '1.0', '1e2', '0\n', true, -0, Number.NaN, '9007199254740992'])('optimistic version %j must be canonical and safe', async version => {
  const f = fixture(); await expect(f.repo.updateProfile(ID, { theme: 1 }, version)).rejects.toThrow('INVALID_ROW_VERSION');
  expect(f.poolProvider).not.toHaveBeenCalled();
});

test('row-version exhaustion fails before any write, and an absent trigger increment fails closed', async () => {
  const f = fixture(); await expect(f.repo.updateProfile(ID, { theme: 1 }, String(MAX_CENTS))).rejects.toThrow('USER_VERSION_EXHAUSTED');
  expect(f.poolProvider).not.toHaveBeenCalled();
  await expect(f.repo.updateProfile(ID, { theme: 1 }, '0')).rejects.toThrow('USER_STATE_INVALID');
});

// Coordinator authority fixtures attest scope ownership only in memory, not a real PostgreSQL transaction.
function financialFixture(options = {}) {
  const actorId = options.operationType === 'order_debit' ? ID : ADMIN;
  const owner = row({ balance_cents: '1000', balance: '10.00', ...options.owner });
  const actor = actorId === ID ? owner : row({ id: ADMIN, role: 'admin', balance_cents: '0', balance: '0.00', ...options.actor });
  const rows = new Map([[actor.id, actor], [owner.id, owner]]);
  const client = { query: jest.fn(async (sql, values) => {
    if (sql.startsWith('SELECT')) return { rows: values[0].map(id => rows.get(id)).filter(Boolean) };
    const [after, id, version, before, status, actorId, actorVersion, shopper] = values;
    const old = rows.get(id), freshActor = rows.get(actorId);
    if (!old || old.row_version !== version || old.balance_cents !== before || old.account_status !== status ||
        !freshActor || freshActor.account_status !== 'active' || freshActor.token_version !== actorVersion ||
        (!shopper && freshActor.role !== 'admin')) return { rows: [] };
    const updated = row({ ...old, balance_cents: after, balance: formatMoney(Number(after)), row_version: String(BigInt(version) + 1n) });
    rows.set(id, updated); return { rows: [updated] };
  }) };
  const scope = Object.freeze({});
  const context = Object.freeze({ client, actorId, userId: ID, actorTokenVersion: '1', operationType: 'payment_credit', currency: 'USD', ...options.context,
    ...(options.operationType ? { operationType: options.operationType } : {}) });
  const registry = new WeakMap([[scope, context]]);
  const authority = Object.freeze({ resolve: key => registry.get(key) });
  const poolProvider = jest.fn(() => { throw new Error('Financial access must not fall back to pool.query'); });
  const repo = createUserRepository({ poolProvider, financialScopeAuthority: authority });
  return { client, rows, scope, context, registry, repo, poolProvider, access: repo.internal.forFinancialTransaction(scope) };
}

test('financial access locks only the bound actor/owner IDs in consistent order and authorizes fresh state', async () => {
  const f = financialFixture(); const states = await f.access.lockUsersForUpdate();
  expect(states).toHaveLength(2); expect(Object.isFrozen(states)).toBe(true);
  const [sql, values] = f.client.query.mock.calls[0];
  expect(sql).toContain('ORDER BY id FOR UPDATE'); expect(values).toEqual([[ADMIN, ID]]);
  expect(sql).not.toMatch(/password_hash|two_fa_secret|trusted_devices|reset_password/);
  expect(f.poolProvider).not.toHaveBeenCalled();
});

test('financial cents compare-and-swap uses one scoped client and neither writes mirrors nor commits', async () => {
  const f = financialFixture(); await f.access.lockUsersForUpdate();
  const receipt = await f.access.applyBalanceChange({ beforeCents: 1000n, afterCents: '1500', expectedRowVersion: '0' });
  const [sql, values] = f.client.query.mock.calls[1];
  expect(values).toEqual(['1500', ID, '0', '1000', 'active', ADMIN, '1', false]);
  expect(sql).toContain("actor.account_status = 'active'"); expect(sql).toContain('actor.token_version = $7::BIGINT');
  expect(sql).toContain('SET balance_cents = $1::BIGINT');
  expect(sql).toContain('row_version = $3::BIGINT AND balance_cents = $4::BIGINT');
  expect(sql.split('WHERE')[0]).not.toMatch(/\bbalance\s*=|row_version\s*=|updated_at\s*=/);
  expect(receipt).toMatchObject({ beforeCents: '1000', balanceCents: '1500', deltaCents: '500', rowVersion: '1' });
  expect(f.client.query.mock.calls.every(([text]) => !/\b(BEGIN|COMMIT|ROLLBACK)\b/.test(text))).toBe(true);
  expect(f.poolProvider).not.toHaveBeenCalled();
  await expect(f.access.applyBalanceChange({ beforeCents: '1500', afterCents: 1600, expectedRowVersion: 1n }))
    .resolves.toMatchObject({ balanceCents: '1600', rowVersion: '2' });
});

test('a revoked or forged scope cannot be used, including through a retained bound handle', async () => {
  const f = financialFixture();
  expect(() => f.repo.internal.forFinancialTransaction(Object.freeze({ ...f.context }))).toThrow('FINANCIAL_TRANSACTION_REQUIRED');
  await f.access.lockUsersForUpdate(); f.registry.delete(f.scope); f.client.query.mockClear();
  await expect(f.access.applyBalanceChange({ beforeCents: 1000, afterCents: 1500, expectedRowVersion: 0 })).rejects.toThrow('FINANCIAL_TRANSACTION_REQUIRED');
  expect(f.client.query).not.toHaveBeenCalled();
});

test('scope context/client rebinding is rejected even if the replacement metadata looks identical', async () => {
  const f = financialFixture(); f.registry.set(f.scope, Object.freeze({ ...f.context }));
  await expect(f.access.lockUsersForUpdate()).rejects.toThrow('FINANCIAL_TRANSACTION_REQUIRED'); expect(f.client.query).not.toHaveBeenCalled();
});

test('financial balance access requires prior locks and never selects another arbitrary owner', async () => {
  const f = financialFixture();
  await expect(f.access.applyBalanceChange({ beforeCents: 1000, afterCents: 1500, expectedRowVersion: 0 })).rejects.toThrow('FINANCIAL_USER_LOCK_REQUIRED');
  expect(f.client.query).not.toHaveBeenCalled(); await f.access.lockUsersForUpdate(); f.client.query.mockClear();
  await expect(f.access.applyBalanceChange({ userId: ADMIN, beforeCents: 1000, afterCents: 1500, expectedRowVersion: 0 }))
    .rejects.toThrow('INVALID_BALANCE_CHANGE_FIELDS'); expect(f.client.query).not.toHaveBeenCalled();
});

test.each([
  [{ actor: { role: 'user' } }, 'FINANCIAL_FORBIDDEN'],
  [{ actor: { account_status: 'suspended' } }, 'FINANCIAL_FORBIDDEN'],
  [{ actor: { token_version: '2' } }, 'FINANCIAL_FORBIDDEN'],
  [{ owner: { account_status: 'deactivated' } }, 'FINANCIAL_USER_INACTIVE']
])('financial locks reject unauthorized/stale account state %j', async (options, code) => {
  const f = financialFixture(options); await expect(f.access.lockUsersForUpdate()).rejects.toThrow(code);
  expect(f.client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});

test('purchases use the owner as actor and do not require an administrator', async () => {
  const f = financialFixture({ operationType: 'order_debit' });
  await expect(f.access.lockUsersForUpdate()).resolves.toHaveLength(1);
  await expect(f.access.applyBalanceChange({ beforeCents: '1000', afterCents: '500', expectedRowVersion: '0' }))
    .resolves.toMatchObject({ deltaCents: '-500' });
  expect(f.client.query.mock.calls[0][1]).toEqual([[ID]]);
});

test('original-charge refunds preserve inactive-owner eligibility, while fresh admin authorization remains mandatory', async () => {
  const f = financialFixture({ operationType: 'order_refund', owner: { account_status: 'deactivated' } });
  await f.access.lockUsersForUpdate();
  await expect(f.access.applyBalanceChange({ beforeCents: 1000, afterCents: 1500, expectedRowVersion: 0 })).resolves.toMatchObject({ deltaCents: '500' });
  expect(f.client.query.mock.calls[1][1][4]).toBe('deactivated');
});

test.each([
  ['payment_credit', 1000, 'INVALID_FINANCIAL_DIRECTION'], ['payment_credit', 500, 'INVALID_FINANCIAL_DIRECTION'],
  ['order_refund', 1000, 'INVALID_FINANCIAL_DIRECTION'], ['order_debit', 1500, 'INVALID_FINANCIAL_DIRECTION'],
  ['balance_adjustment', -1, 'INVALID_CENTS'], ['balance_adjustment', '9007199254740992', 'INVALID_CENTS'],
  ['balance_adjustment', '1e3', 'INVALID_CENTS'], ['balance_adjustment', '-0', 'INVALID_CENTS'],
  ['balance_adjustment', '00', 'INVALID_CENTS'], ['balance_adjustment', '0\n', 'INVALID_CENTS']
])('operation %s rejects unsafe or wrongly directed afterCents %j', async (operationType, afterCents, code) => {
  const f = financialFixture({ operationType }); await f.access.lockUsersForUpdate(); f.client.query.mockClear();
  await expect(f.access.applyBalanceChange({ beforeCents: 1000, afterCents, expectedRowVersion: 0 })).rejects.toThrow(code);
  expect(f.client.query).not.toHaveBeenCalled();
});

test('unrepresentable numeric mirrors are rejected before a cents update', async () => {
  const f = financialFixture({ operationType: 'balance_adjustment' }); await f.access.lockUsersForUpdate(); f.client.query.mockClear();
  await expect(f.access.applyBalanceChange({ beforeCents: 1000, afterCents: BigInt(MAX_CENTS), expectedRowVersion: 0 }))
    .rejects.toThrow('BALANCE_MIRROR_UNREPRESENTABLE'); expect(f.client.query).not.toHaveBeenCalled();
});

test.each(['beforeCents', 'afterCents', 'expectedRowVersion'])('financial CAS requires its own %s field', async field => {
  const f = financialFixture(); await f.access.lockUsersForUpdate(); f.client.query.mockClear();
  const input = { beforeCents: 1000, afterCents: 1500, expectedRowVersion: 0 }; delete input[field];
  await expect(f.access.applyBalanceChange(input)).rejects.toThrow('INVALID_BALANCE_CHANGE_FIELDS');
  expect(f.client.query).not.toHaveBeenCalled();
});

test('financial stale versions and changed before cents fail before mutation', async () => {
  const f = financialFixture(); await f.access.lockUsersForUpdate(); f.client.query.mockClear();
  await expect(f.access.applyBalanceChange({ beforeCents: 1000, afterCents: 1500, expectedRowVersion: 1 })).rejects.toThrow('USER_VERSION_CONFLICT');
  await expect(f.access.applyBalanceChange({ beforeCents: 999, afterCents: 1500, expectedRowVersion: 0 })).rejects.toThrow('BALANCE_STATE_MISMATCH');
  expect(f.client.query).not.toHaveBeenCalled();
});

test.each([{ role: 'user' }, { account_status: 'suspended' }, { token_version: '2' }])(
  'financial CAS rechecks actor authority after locking, including own-transaction changes %j', async changed => {
    const f = financialFixture(); await f.access.lockUsersForUpdate();
    f.rows.set(ADMIN, row({ id: ADMIN, role: 'admin', ...changed }));
    await expect(f.access.applyBalanceChange({ beforeCents: 1000, afterCents: 1500, expectedRowVersion: 0 }))
      .rejects.toThrow('USER_VERSION_CONFLICT');
    expect(f.rows.get(ID).balance_cents).toBe('1000');
  });

test('a zero-match financial CAS is a conflict and does not retry or use a different connection', async () => {
  const f = financialFixture(); await f.access.lockUsersForUpdate(); f.client.query.mockResolvedValue({ rows: [] });
  await expect(f.access.applyBalanceChange({ beforeCents: 1000, afterCents: 1500, expectedRowVersion: 0 })).rejects.toThrow('USER_VERSION_CONFLICT');
  expect(f.client.query).toHaveBeenCalledTimes(2); expect(f.poolProvider).not.toHaveBeenCalled();
});

test('a failed re-lock clears previously authorized snapshots', async () => {
  const f = financialFixture(); await f.access.lockUsersForUpdate(); f.rows.set(ADMIN, row({ id: ADMIN, role: 'user' }));
  await expect(f.access.lockUsersForUpdate()).rejects.toThrow('FINANCIAL_FORBIDDEN');
  await expect(f.access.applyBalanceChange({ beforeCents: 1000, afterCents: 1500, expectedRowVersion: 0 })).rejects.toThrow('FINANCIAL_USER_LOCK_REQUIRED');
});

test('concurrent use of the same scoped handle is rejected without interleaving queries', async () => {
  const f = financialFixture(); let finish; f.client.query.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.access.lockUsersForUpdate();
  await expect(f.access.lockUsersForUpdate()).rejects.toThrow('FINANCIAL_USER_ACCESS_BUSY');
  finish({ rows: [...f.rows.values()] }); await pending;
  expect(f.client.query).toHaveBeenCalledTimes(1);
});

test('the coordinator remains responsible for transaction outcome; scoped query failures do not commit, retry or fallback', async () => {
  const f = financialFixture(); await f.access.lockUsersForUpdate();
  f.client.query.mockRejectedValue(Object.assign(new Error(SECRET), { code: '40001' }));
  await expect(f.access.applyBalanceChange({ beforeCents: 1000, afterCents: 1500, expectedRowVersion: 0 })).rejects.toThrow('USER_TRANSACTION_CONFLICT');
  expect(f.poolProvider).not.toHaveBeenCalled();
  expect(f.client.query.mock.calls.every(([sql]) => !/\b(COMMIT|ROLLBACK)\b/.test(sql))).toBe(true);
});
