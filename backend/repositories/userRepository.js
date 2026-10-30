'use strict';

const bcrypt = require('bcryptjs');
const validator = require('validator');
const { getPool } = require('../db/pg');
const { createUserAuthentication } = require('./private/userAuthentication');
const { MAX_CENTS, parseMoney, formatMoney } = require('../utils/money');
const MAX_INTEGER = BigInt(MAX_CENTS);
const PASSWORD_COST = 12;

// Fixed projections: no SELECT *, request-selected columns, or Mongoose hydration.
const SAFE_COLUMNS = `id, username, email, email_verified, phone, provider, theme,
  balance_cents, balance, avatar, role, account_status, two_fa_status,
  last_login, activated_at, row_version, created_at, updated_at`;
const AUTH_COLUMNS = `${SAFE_COLUMNS}, password_hash, token_version, login_attempts`;
const FINANCIAL_COLUMNS = 'id, role, account_status, token_version, balance_cents, balance, row_version';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/;
const BALANCE_OPERATIONS = new Set(['balance_adjustment', 'order_debit', 'order_refund', 'payment_credit']);
const ROLES = new Set(['user', 'admin', 'moderator']);
const STATUSES = new Set(['active', 'suspended', 'deactivated']);

class UserRepositoryError extends Error {
  constructor(code, databaseCode) {
    super(code); // Fixed codes only: never attach raw database errors or input.
    this.name = 'UserRepositoryError';
    this.code = code;
    if (databaseCode) this.databaseCode = databaseCode;
  }
}
const fail = code => new UserRepositoryError(code);
const fullMatch = (pattern, text) => {
  const match = typeof text === 'string' && pattern.exec(text);
  return Boolean(match && match[0] === text);
};
function uuid(value) {
  if (!fullMatch(UUID, value)) throw fail('INVALID_USER_ID');
  return value;
}
function integer(value, code, stored = false) {
  let result;
  // pg BIGINT must stay a canonical string; never accept a globally coerced Number.
  if (typeof value === 'string' && value.length <= 16 && fullMatch(/^(0|[1-9][0-9]*)$/, value)) result = BigInt(value);
  else if (!stored && typeof value === 'bigint') result = value;
  else if (!stored && Number.isSafeInteger(value) && !Object.is(value, -0)) result = BigInt(value);
  else throw fail(code);
  if (result < 0n || result > MAX_INTEGER) throw fail(code);
  return result;
}
function username(value) {
  if (typeof value !== 'string') throw fail('INVALID_USERNAME');
  const result = value.trim();
  if (!fullMatch(/^[A-Za-z0-9_]{3,30}$/, result)) throw fail('INVALID_USERNAME');
  return result;
}
function email(value) {
  if (typeof value !== 'string') throw fail('INVALID_EMAIL');
  const result = value.trim().toLowerCase();
  if (result.length < 3 || result.length > 254 || !validator.isEmail(result)) throw fail('INVALID_EMAIL');
  return result;
}
function phone(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !validator.isMobilePhone(value.trim(), 'any', { strictMode: true })) throw fail('INVALID_PHONE');
  return value.trim();
}
function fields(value, allowed, code, required = []) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail(code);
  const keys = Reflect.ownKeys(value);
  if (required.some(key => !keys.includes(key)) || keys.some(key => typeof key !== 'string' || !allowed.includes(key) ||
      !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) throw fail(code);
  return keys;
}
function password(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 72 ||
      !fullMatch(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}/, value)) throw fail('INVALID_PASSWORD');
  return value; // No trimming, Unicode normalization, or prehashed-input bypass.
}
function time(value) {
  if (value === null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw fail('USER_STATE_INVALID');
  return value.toISOString();
}
function moneyState(row) {
  const cents = integer(row.balance_cents, 'BALANCE_STATE_MISMATCH', true);
  if (typeof row.balance !== 'string' || row.balance !== formatMoney(Number(cents))) throw fail('BALANCE_STATE_MISMATCH');
  return { balanceCents: cents.toString(), balance: row.balance };
}
function exactCompatibility(cents) {
  // NUMERIC eliminates stored drift, not the existing JS numeric-mirror boundary.
  try {
    if (parseMoney(Number(formatMoney(Number(cents)))) !== Number(cents)) throw fail('BALANCE_MIRROR_UNREPRESENTABLE');
  } catch (_) { throw fail('BALANCE_MIRROR_UNREPRESENTABLE'); }
}
function safeUser(row) {
  const money = moneyState(row);
  return Object.freeze({
    id: uuid(row.id), username: row.username, email: row.email, emailVerified: row.email_verified,
    phone: row.phone, provider: row.provider, theme: row.theme, ...money, avatar: row.avatar,
    role: row.role, accountStatus: row.account_status, twoFAStatus: row.two_fa_status,
    lastLogin: time(row.last_login), activatedAt: time(row.activated_at),
    rowVersion: integer(row.row_version, 'USER_STATE_INVALID', true).toString(),
    createdAt: time(row.created_at), updatedAt: time(row.updated_at)
  });
}
function financialUser(row) {
  if (!ROLES.has(row.role) || !STATUSES.has(row.account_status)) throw fail('USER_STATE_INVALID');
  return Object.freeze({ id: uuid(row.id), role: row.role, accountStatus: row.account_status,
    tokenVersion: integer(row.token_version, 'USER_STATE_INVALID', true).toString(),
    ...moneyState(row), rowVersion: integer(row.row_version, 'USER_STATE_INVALID', true).toString() });
}
function databaseError(error, writeKind) {
  if (error instanceof UserRepositoryError) return error;
  const code = typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : undefined;
  if (code === '23505') {
    const duplicate = { users_email_key: 'USER_EMAIL_TAKEN', users_username_key: 'USER_USERNAME_TAKEN', users_phone_key: 'USER_PHONE_TAKEN' };
    return new UserRepositoryError(Object.hasOwn(duplicate, error.constraint) ? duplicate[error.constraint] : 'USER_DUPLICATE', code);
  }
  if (['40001', '40P01'].includes(code)) return new UserRepositoryError('USER_TRANSACTION_CONFLICT', code);
  // An unacknowledged standalone autocommit write may have succeeded. No blind retry.
  return new UserRepositoryError(writeKind && !code ? 'USER_WRITE_OUTCOME_UNKNOWN' : 'USER_STORAGE_ERROR', code);
}
function oneRow(result, absentCode) {
  if (!result || !Array.isArray(result.rows) || result.rows.length > 1) throw fail('USER_STATE_INVALID');
  if (!result.rows.length) {
    if (absentCode) throw fail(absentCode);
    return null;
  }
  return result.rows[0];
}

/**
 * Dependencies are trusted composition-root inputs, NEVER route/request options.
 * The default repository has no financial authority and cannot mutate balances.
 * A future reviewed coordinator may supply an opaque-scope registry with resolve().
 * It must attest a live transaction, stable frozen context and exclusively owned
 * client, and revoke scopes after COMMIT/ROLLBACK. No coordinator is supplied here.
 */
function createUserRepository({ poolProvider = getPool, financialScopeAuthority = null, googleIdentityAuthority = null, cursorSecret } = {}) {
  if (typeof poolProvider !== 'function') throw fail('USER_REPOSITORY_CONFIG_INVALID');
  if (financialScopeAuthority !== null && (!Object.isFrozen(financialScopeAuthority) ||
      typeof financialScopeAuthority.resolve !== 'function')) throw fail('USER_REPOSITORY_CONFIG_INVALID');

  async function query(sql, parameters, writeKind) {
    let pool;
    try { pool = poolProvider(); } catch (_) { throw fail('USER_STORAGE_ERROR'); }
    try { return await pool.query(sql, parameters); }
    catch (error) { throw databaseError(error, writeKind); }
  }
  const authentication = createUserAuthentication({ poolProvider, query, safeUser, username, email, phone, password, googleIdentityAuthority });
  async function findById(id) {
    const row = oneRow(await query(`SELECT ${SAFE_COLUMNS} FROM public.users WHERE id = $1::UUID`, [uuid(id)]));
    return row ? safeUser(row) : null;
  }
  async function findByEmail(value) {
    const row = oneRow(await query(`SELECT ${SAFE_COLUMNS} FROM public.users WHERE email = $1`, [email(value)]));
    return row ? safeUser(row) : null;
  }
  async function findByUsername(value) {
    const row = oneRow(await query(`SELECT ${SAFE_COLUMNS} FROM public.users WHERE username = $1 COLLATE "C"`, [username(value)]));
    return row ? safeUser(row) : null;
  }
  async function findForAuth(identifier) {
    if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 254) throw fail('INVALID_AUTH_IDENTIFIER');
    const normalized = identifier.trim();
    let predicate, value;
    if (validator.isEmail(normalized)) { predicate = 'email = $1'; value = email(normalized); }
    else if (validator.isMobilePhone(normalized, 'any', { strictMode: true })) { predicate = 'phone = $1'; value = phone(normalized); }
    else { predicate = 'lower(username) = lower($1)'; value = username(normalized); }
    const result = await query(`SELECT ${AUTH_COLUMNS} FROM public.users WHERE ${predicate} ORDER BY id LIMIT 2`, [value]);
    if (!Array.isArray(result?.rows)) throw fail('USER_STATE_INVALID');
    if (result.rows.length > 1) throw fail('USER_IDENTIFIER_AMBIGUOUS');
    if (!result.rows.length) return null;
    const row = result.rows[0];
    const user = safeUser(row);
    const hash = row.password_hash;
    if (hash !== null && !fullMatch(HASH, hash)) throw fail('USER_STATE_INVALID');
    if (row.provider === 'local' && hash === null) throw fail('USER_STATE_INVALID');
    const authState = Object.freeze({ tokenVersion: integer(row.token_version, 'USER_STATE_INVALID', true).toString(),
      loginAttempts: row.login_attempts, accountStatus: row.account_status, role: row.role, lastLogin: user.lastLogin });
    if (!Number.isInteger(authState.loginAttempts) || authState.loginAttempts < 0 || authState.loginAttempts > 5) throw fail('USER_STATE_INVALID');
    // The hash stays in a closure, not in any returned/serializable object.
    const handle = Object.freeze({ user,
      getAuthState: () => authState,
      async verifyPassword(candidate) {
        return authentication.compare(handle, async () => {
          if (typeof candidate !== 'string' || !candidate || Buffer.byteLength(candidate, 'utf8') > 72 || hash === null) return false;
          try { return await bcrypt.compare(candidate, hash); }
          catch (_) { throw fail('USER_PASSWORD_CHECK_FAILED'); }
        });
      },
      toJSON: () => user
    });
    authentication.register(handle, row);
    return handle;
  }
  async function createUser(input) {
    fields(input, ['username', 'email', 'password', 'phone'], 'INVALID_USER_CREATE_FIELDS', ['username', 'email', 'password']);
    const name = username(input.username), address = email(input.email), mobile = phone(input.phone);
    const plaintext = password(input.password);
    let hash;
    try { hash = await bcrypt.hash(plaintext, PASSWORD_COST); }
    catch (_) { throw fail('USER_PASSWORD_HASH_FAILED'); }
    if (!fullMatch(HASH, hash) || bcrypt.getRounds(hash) !== PASSWORD_COST) throw fail('USER_PASSWORD_HASH_FAILED');
    const row = oneRow(await query(`INSERT INTO public.users
      (username, email, password_hash, phone, provider, role, account_status, balance_cents, email_verified, token_version)
      VALUES ($1, $2, $3, $4, 'local', 'user', 'active', 0, FALSE, 1)
      RETURNING ${SAFE_COLUMNS}`, [name, address, hash, mobile], 'create'), 'USER_STATE_INVALID');
    const user = safeUser(row);
    if (user.balanceCents !== '0' || user.rowVersion !== '0' || user.provider !== 'local' ||
        user.role !== 'user' || user.accountStatus !== 'active' || user.emailVerified !== false) throw fail('USER_STATE_INVALID');
    return user;
  }
  async function updateProfile(id, patch, expectedRowVersion) {
    const userId = uuid(id);
    const version = integer(expectedRowVersion, 'INVALID_ROW_VERSION');
    if (version === MAX_INTEGER) throw fail('USER_VERSION_EXHAUSTED');
    const keys = fields(patch, ['theme', 'avatar'], 'INVALID_USER_PROFILE_FIELDS');
    if (!keys.length) throw fail('INVALID_USER_PROFILE_FIELDS');
    if (Object.hasOwn(patch, 'theme') && ![0, 1].includes(patch.theme)) throw fail('INVALID_THEME');
    if (Object.hasOwn(patch, 'avatar') && (typeof patch.avatar !== 'string' ||
        (patch.avatar !== '' && !validator.isURL(patch.avatar)))) throw fail('INVALID_AVATAR');
    // Only these hardcoded identifiers enter SQL; all values are parameters.
    const columns = ['theme', 'avatar'].filter(key => Object.hasOwn(patch, key));
    const values = columns.map(key => patch[key]);
    values.push(userId, version.toString());
    const row = oneRow(await query(`UPDATE public.users SET ${columns.map((key, i) => `${key} = $${i + 1}`).join(', ')}
      WHERE id = $${columns.length + 1}::UUID AND row_version = $${columns.length + 2}::BIGINT
      RETURNING ${SAFE_COLUMNS}`, values, 'profile'), 'USER_VERSION_CONFLICT');
    const user = safeUser(row);
    if (user.id !== userId || BigInt(user.rowVersion) !== version + 1n) throw fail('USER_STATE_INVALID');
    return user; // Trigger, not repository, advances row_version and updated_at.
  }

  function forFinancialTransaction(scope) {
    function resolve() {
      let context;
      try { context = financialScopeAuthority?.resolve(scope); }
      catch (_) { throw fail('FINANCIAL_TRANSACTION_REQUIRED'); }
      if (!context || !Object.isFrozen(context) || !BALANCE_OPERATIONS.has(context.operationType) ||
          context.currency !== 'USD' || typeof context.client?.query !== 'function') throw fail('FINANCIAL_TRANSACTION_REQUIRED');
      uuid(context.actorId); uuid(context.userId);
      integer(context.actorTokenVersion, 'INVALID_TOKEN_VERSION');
      if (context.operationType === 'order_debit' && context.actorId !== context.userId) throw fail('FINANCIAL_FORBIDDEN');
      return context;
    }
    const context = resolve();
    let locked = null;
    let pending = false;
    function current() {
      if (resolve() !== context) throw fail('FINANCIAL_TRANSACTION_REQUIRED');
      return context;
    }
    async function scopedQuery(sql, parameters) {
      current();
      try {
        const result = await context.client.query(sql, parameters);
        current();
        return result;
      } catch (error) { throw databaseError(error); }
    }
    function authorize(states) {
      const actor = states.get(context.actorId), owner = states.get(context.userId);
      if (!actor || !owner) throw fail('USER_NOT_FOUND');
      if (actor.accountStatus !== 'active' || actor.tokenVersion !== integer(context.actorTokenVersion, 'INVALID_TOKEN_VERSION').toString() ||
          (context.operationType !== 'order_debit' && actor.role !== 'admin')) throw fail('FINANCIAL_FORBIDDEN');
      // Preserve refund behavior: inactive owners may receive their original-charge refund.
      if (context.operationType !== 'order_refund' && owner.accountStatus !== 'active') throw fail('FINANCIAL_USER_INACTIVE');
    }
    return Object.freeze({
      async lockUsersForUpdate() {
        current();
        if (pending) throw fail('FINANCIAL_USER_ACCESS_BUSY');
        pending = true;
        locked = null; // A failed re-lock/authorization cannot retain an earlier snapshot.
        try {
          const ids = [...new Set([context.actorId, context.userId])].sort();
          const result = await scopedQuery(`SELECT ${FINANCIAL_COLUMNS} FROM public.users
            WHERE id = ANY($1::UUID[]) ORDER BY id FOR UPDATE`, [ids]);
          if (!Array.isArray(result?.rows) || result.rows.length !== ids.length) throw fail('USER_NOT_FOUND');
          const states = new Map(result.rows.map(row => { const state = financialUser(row); return [state.id, state]; }));
          if (states.size !== ids.length || [...states.keys()].some(id => !ids.includes(id))) throw fail('USER_STATE_INVALID');
          authorize(states);
          locked = states;
          return Object.freeze(ids.map(id => states.get(id)));
        } finally { pending = false; }
      },
      async applyBalanceChange(input) {
        current();
        if (pending) throw fail('FINANCIAL_USER_ACCESS_BUSY');
        if (!locked) throw fail('FINANCIAL_USER_LOCK_REQUIRED');
        fields(input, ['beforeCents', 'afterCents', 'expectedRowVersion'], 'INVALID_BALANCE_CHANGE_FIELDS',
          ['beforeCents', 'afterCents', 'expectedRowVersion']);
        const before = integer(input.beforeCents, 'INVALID_CENTS'), after = integer(input.afterCents, 'INVALID_CENTS');
        const version = integer(input.expectedRowVersion, 'INVALID_ROW_VERSION');
        const owner = locked.get(context.userId);
        authorize(locked);
        if (version === MAX_INTEGER) throw fail('USER_VERSION_EXHAUSTED');
        if (owner.rowVersion !== version.toString()) throw fail('USER_VERSION_CONFLICT');
        if (owner.balanceCents !== before.toString()) throw fail('BALANCE_STATE_MISMATCH');
        const delta = after - before;
        if ((context.operationType === 'order_debit' && delta >= 0n) ||
            (['order_refund', 'payment_credit'].includes(context.operationType) && delta <= 0n)) throw fail('INVALID_FINANCIAL_DIRECTION');
        exactCompatibility(before); exactCompatibility(after);
        pending = true;
        try {
          const row = oneRow(await scopedQuery(`UPDATE public.users SET balance_cents = $1::BIGINT
            WHERE id = $2::UUID AND row_version = $3::BIGINT AND balance_cents = $4::BIGINT
              AND account_status = $5
              AND EXISTS (SELECT 1 FROM public.users AS actor
                WHERE actor.id = $6::UUID AND actor.account_status = 'active'
                  AND actor.token_version = $7::BIGINT AND ($8::BOOLEAN OR actor.role = 'admin'))
            RETURNING ${FINANCIAL_COLUMNS}`, [after.toString(), context.userId, version.toString(), before.toString(), owner.accountStatus,
              context.actorId, integer(context.actorTokenVersion, 'INVALID_TOKEN_VERSION').toString(), context.operationType === 'order_debit']), 'USER_VERSION_CONFLICT');
          const updated = financialUser(row);
          if (updated.id !== context.userId || updated.balanceCents !== after.toString() ||
              BigInt(updated.rowVersion) !== version + 1n || updated.tokenVersion !== owner.tokenVersion ||
              updated.accountStatus !== owner.accountStatus || updated.role !== owner.role) throw fail('USER_STATE_INVALID');
          locked.set(updated.id, updated);
          return Object.freeze({ ...updated, beforeCents: before.toString(), deltaCents: delta.toString() });
        } finally { pending = false; }
      }
    });
  }

  return Object.freeze({ findById, findByEmail, findByUsername, findForAuth, createUser, updateProfile,
    ...authentication.methods,
    listUsers: input => require('./private/userListing').listUsers(poolProvider, safeUser, input, cursorSecret ?? process.env.CURSOR_SECRET),
    internal: Object.freeze({ forFinancialTransaction,
      authenticationSnapshot: authentication.snapshot,
    claimAuthentication: authentication.claim, claimPendingAuthentication: authentication.claimPending, consumeAuthentication: authentication.consume }) });
}

// No authority is installed in this default instance. No route/server imports it.
module.exports = Object.freeze({ ...createUserRepository(), createUserRepository, UserRepositoryError });
