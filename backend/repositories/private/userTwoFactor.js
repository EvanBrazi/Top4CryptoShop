'use strict';
const speakeasy = require('speakeasy');
const A = require('../../services/auth/persistence');
const SAFE = `id, username, email, email_verified, phone, provider, theme, balance_cents, balance, avatar, role,
 account_status, two_fa_status, last_login, activated_at, row_version, created_at, updated_at`;
function createTwoFactor({ poolProvider, query, safeUser, record, factors }) {
  async function findFor2FA(input) {
    A.fields(input, ['authenticationContext']); const r = record(input.authenticationContext);
    const row = A.one(await query(`SELECT token_version, row_version, two_fa_secret, two_fa_status, two_fa_attempts
      FROM public.users WHERE id = $1::UUID AND account_status = 'active'`, [r.userId]), 'AUTH_FORBIDDEN');
    if (row.token_version !== r.tokenVersion || row.row_version !== r.rowVersion) throw A.fail('USER_VERSION_CONFLICT');
    const handle = Object.freeze({ getState: () => Object.freeze({ status: row.two_fa_status, attempts: row.two_fa_attempts }),
      async verifyTotp(code) {
        record(handle); if (row.two_fa_attempts >= 5) throw A.fail('TOO_MANY_2FA_ATTEMPTS', 429);
        r.totpVerified = false; r.factorCompared = false;
        const ok = A.match(/^[0-9]{6}$/, code) && Boolean(row.two_fa_secret) && speakeasy.totp.verify({ secret: row.two_fa_secret, encoding: 'base32', token: code, window: 1 });
        r.totpVerified = Boolean(ok); r.factorCompared = true; return Boolean(ok);
      }, toJSON: () => ({ status: row.two_fa_status }) }); factors.set(handle, r); return handle;
  }
  async function update2FA(input) {
    A.fields(input, ['authenticationContext', 'action', 'expectedRowVersion']);
    if (!['begin_enrollment', 'confirm_enrollment', 'disable', 'record_failure', 'reset_attempts'].includes(input.action)) throw A.fail('INVALID_AUTH_INPUT', 400);
    const r = record(input.authenticationContext), version = A.integer(input.expectedRowVersion);
    const secret = input.action === 'begin_enrollment' ? speakeasy.generateSecret({ name: 'Top4CryptoShop', length: 20 }) : null;
    if (['confirm_enrollment', 'disable', 'reset_attempts'].includes(input.action) && !r.totpVerified || input.action === 'record_failure' && (!r.factorCompared || r.totpVerified)) throw A.fail('AUTH_PROOF_REQUIRED', 403);
    r.busy = true;
    try {
      const row = await A.transaction(poolProvider, async q => {
        const rows = await A.lockAccounts(q, [r.userId]); const u = A.authorize({ userId: r.userId, tokenVersion: r.tokenVersion }, rows);
        if (u.row_version !== version || version !== r.rowVersion) throw A.fail('USER_VERSION_CONFLICT');
        if (secret) {
          const es = A.one(await q('SELECT email_verified FROM public.users WHERE id = $1::UUID', [r.userId]));
          if (!es.email_verified || u.two_fa_status !== 'disabled') throw A.fail('TWO_FA_STATE_CONFLICT');
        }
        if (input.action === 'confirm_enrollment' && u.two_fa_status !== 'pending' || input.action === 'disable' && u.two_fa_status !== 'enabled') throw A.fail('TWO_FA_STATE_CONFLICT');
        const security = !['record_failure', 'reset_attempts'].includes(input.action);
        if (security && BigInt(u.token_version) === A.MAX) throw A.fail('USER_VERSION_EXHAUSTED');
        const set = { begin_enrollment: "two_fa_secret = $3, two_fa_status = 'pending', two_fa_attempts = 0",
          confirm_enrollment: "two_fa_status = 'enabled', two_fa_activated_at = statement_timestamp(), two_fa_attempts = 0",
          disable: "two_fa_secret = NULL, two_fa_status = 'disabled', two_fa_activated_at = NULL, two_fa_method = NULL, two_fa_attempts = 0, trusted_devices = '[]'::JSONB",
          record_failure: 'two_fa_attempts = two_fa_attempts + 1', reset_attempts: 'two_fa_attempts = 0' }[input.action];
        const params = [r.userId, version]; if (secret) params.push(secret.base32);
        const result = A.one(await q(`UPDATE public.users SET ${set}${security ? ', token_version = token_version + 1' : ''}
          WHERE id = $1::UUID AND row_version = $2::BIGINT RETURNING ${SAFE}, token_version`, params), 'USER_VERSION_CONFLICT');
        if (security) await A.revokeGraph(q, r.userId, 'two_fa_change'); return result;
      });
      const output = { user: safeUser(row) };
      if (secret) {
        const context = Object.freeze(Object.create(null)); factors.set(context, { kind: 'enrollment', userId: r.userId,
          tokenVersion: row.token_version, rowVersion: row.row_version, expiresAt: Date.now() + 300000, passwordVerified: true, consumed: false, busy: false });
        output.enrollmentContext = context; output.otpauthUrl = secret.otpauth_url;
      }
      return Object.freeze(output);
    } finally { r.busy = false; r.consumed = true; }
  }
  return { findFor2FA, update2FA };
}
module.exports = { createTwoFactor };
