'use strict';
const A = require('../../services/auth/persistence');
const STATE = 'id, role, account_status, token_version, row_version, login_attempts, two_fa_status, provider, last_login';
function createUserAuthentication(dependencies) {
  const { poolProvider, query } = dependencies;
  const credentials = new WeakMap(), factors = new WeakMap();
  function record(handle, positive = true) {
    const r = credentials.get(handle) || factors.get(handle);
    if (!r || r.consumed || r.busy || Date.now() >= r.expiresAt || positive && r.passwordVerified !== true) throw A.fail('AUTH_PROOF_REQUIRED', 403);
    return r;
  }
  function snapshot(handle) {
    const r = record(handle); if (!credentials.has(handle) || r.kind !== 'credential') throw A.fail('AUTH_PROOF_REQUIRED', 403);
    return Object.freeze({ userId: r.userId, tokenVersion: r.tokenVersion, rowVersion: r.rowVersion, twoFactorVerified: r.totpVerified === true });
  }
  function claim(handle) { const value = snapshot(handle); credentials.get(handle).busy = true; return value; }
  function claimPending(handle) { const value = claim(handle); return Object.freeze({ ...value, expiresAt: credentials.get(handle).expiresAt }); }
  function consume(handle) { const r = credentials.get(handle); if (r) { r.consumed = true; r.busy = false; } }
  function register(handle, row) {
    credentials.set(handle, { kind: 'credential', userId: row.id, tokenVersion: row.token_version, rowVersion: row.row_version,
      expiresAt: Date.now() + 300000, passwordVerified: null, consumed: false, busy: false });
  }
  async function compare(handle, work) {
    const r = record(handle, false); r.busy = true; r.passwordVerified = null; r.totpVerified = false; r.factorCompared = false;
    try { const ok = await work(); r.passwordVerified = Boolean(ok); r.totpVerified = false; return Boolean(ok); }
    finally { r.busy = false; }
  }
  function state(r) {
    A.integer(r.token_version); A.integer(r.row_version);
    return Object.freeze({ id: r.id, role: r.role, accountStatus: r.account_status, tokenVersion: r.token_version,
      rowVersion: r.row_version, loginAttempts: r.login_attempts, twoFAStatus: r.two_fa_status, lastLogin: r.last_login?.toISOString() || null });
  }
  async function findAuthStateById(id) {
    const row = A.one(await query(`SELECT ${STATE} FROM public.users WHERE id = $1::UUID`, [A.uuid(id)])); return row ? state(row) : null;
  }
  async function findForGoogleAuth(input) {
    A.fields(input, ['verifiedIdentity']);
    let identity; try { identity = dependencies.googleIdentityAuthority?.resolve(input.verifiedIdentity); } catch (_) {}
    if (!identity || !Object.isFrozen(identity) || identity.emailVerified !== true || !A.match(/^[A-Za-z0-9_-]{1,128}$/, identity.googleId)) throw A.fail('AUTH_PROOF_REQUIRED', 403);
    const row = A.one(await query(`SELECT ${STATE}, email FROM public.users WHERE google_id = $1 AND provider = 'google' AND account_status = 'active'`, [identity.googleId]), 'AUTH_FORBIDDEN');
    if (row.email !== dependencies.email(identity.email)) throw A.fail('GOOGLE_ACCOUNT_LINK_REQUIRED');
    const handle = Object.freeze({ toJSON: () => ({ provider: 'google' }) });
    register(handle, row); credentials.get(handle).passwordVerified = true; return handle;
  }
  async function bookkeeping(input, kind) {
    const key = kind === 'last' ? 'authenticationProof' : 'authHandle';
    A.fields(input, [key, 'expectedRowVersion']); A.integer(input.expectedRowVersion);
    const r = record(input[key], kind !== 'failure');
    if (kind === 'failure' && r.passwordVerified !== false || r.kind !== 'credential') throw A.fail('AUTH_PROOF_REQUIRED', 403);
    r.busy = true;
    try {
      return await A.transaction(poolProvider, async q => {
        const rows = await A.lockAccounts(q, [r.userId]); const u = A.authorize({ userId: r.userId, tokenVersion: r.tokenVersion }, rows);
        if (u.row_version !== input.expectedRowVersion || u.row_version !== r.rowVersion) throw A.fail('USER_VERSION_CONFLICT');
        if (kind === 'last' && u.two_fa_status !== 'disabled' && !(u.two_fa_status === 'enabled' && r.totpVerified)) throw A.fail('SECOND_FACTOR_REQUIRED', 403);
        const suspend = kind === 'failure' && u.login_attempts >= 4;
        const set = kind === 'failure' ? `login_attempts = least(login_attempts + 1, 5)${suspend ? ", account_status = 'suspended', token_version = token_version + 1" : ''}`
          : `login_attempts = 0${kind === 'last' ? ', last_login = statement_timestamp()' : ''}`;
        if (suspend && BigInt(u.token_version) === A.MAX) throw A.fail('USER_VERSION_EXHAUSTED');
        const row = A.one(await q(`UPDATE public.users SET ${set} WHERE id = $1::UUID AND row_version = $2::BIGINT RETURNING ${STATE}`,
          [r.userId, input.expectedRowVersion]), 'USER_VERSION_CONFLICT');
        if (suspend) await A.revokeGraph(q, r.userId, 'account_status_change'); return state(row);
      });
    } finally { r.busy = false; r.consumed = true; }
  }
  return { register, compare, snapshot, claim, claimPending, consume, methods: {
    findAuthStateById, findForGoogleAuth, incrementLoginAttempts: x => bookkeeping(x, 'failure'), resetLoginAttempts: x => bookkeeping(x, 'reset'), updateLastLogin: x => bookkeeping(x, 'last'),
    ...require('./userSecurityMutations').createMutations(dependencies),
    ...require('./userTwoFactor').createTwoFactor({ ...dependencies, record, factors })
  } };
}
module.exports = { createUserAuthentication };
