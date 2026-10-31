'use strict';
const bcrypt = require('bcryptjs');
const validator = require('validator');
const A = require('../../services/auth/persistence');
const SAFE = `id, username, email, email_verified, phone, provider, theme, balance_cents, balance, avatar, role,
 account_status, two_fa_status, last_login, activated_at, row_version, created_at, updated_at`;
function createProfileAtomic({ poolProvider, query, safeUser, username, email, phone, password }) {
  return async function updateProfileAtomic(input) {
    A.fields(input, ['principal', 'expectedRowVersion', 'patch']);
    const p = A.principal(input.principal), version = A.integer(input.expectedRowVersion), patch = input.patch;
    A.fields(patch, ['username', 'email', 'phone', 'password', 'currentPassword', 'theme', 'avatar'], []);
    const values = {};
    if (Object.hasOwn(patch, 'username')) values.username = username(patch.username);
    if (Object.hasOwn(patch, 'email')) values.email = email(patch.email);
    if (Object.hasOwn(patch, 'phone')) values.phone = patch.phone === null ? null : phone(patch.phone);
    if (Object.hasOwn(patch, 'theme')) {
      if (![0, 1].includes(patch.theme)) throw A.fail('INVALID_THEME', 400);
      values.theme = patch.theme;
    }
    if (Object.hasOwn(patch, 'avatar')) {
      if (typeof patch.avatar !== 'string' || patch.avatar !== '' && !validator.isURL(patch.avatar)) throw A.fail('INVALID_AVATAR', 400);
      values.avatar = patch.avatar;
    }
    let credentialVersion;
    if (Object.hasOwn(patch, 'password')) {
      password(patch.password);
      const row = A.one(await query('SELECT provider, password_hash, token_version, row_version FROM public.users WHERE id = $1::UUID', [p.userId]), 'USER_NOT_FOUND');
      if (row.provider !== 'local' || !row.password_hash || typeof patch.currentPassword !== 'string' || !patch.currentPassword ||
          Buffer.byteLength(patch.currentPassword, 'utf8') > 72) throw A.fail('CURRENT_PASSWORD_INVALID', 403);
      if (row.token_version !== p.tokenVersion || row.row_version !== version) throw A.fail('USER_VERSION_CONFLICT');
      let verified;
      try { verified = await bcrypt.compare(patch.currentPassword, row.password_hash); }
      catch (_) { throw A.fail('AUTH_UNAVAILABLE', 503); }
      if (!verified) throw A.fail('CURRENT_PASSWORD_INVALID', 403);
      credentialVersion = row.token_version;
      try { values.password_hash = await bcrypt.hash(patch.password, 12); }
      catch (_) { throw A.fail('AUTH_UNAVAILABLE', 503); }
    } else if (Object.hasOwn(patch, 'currentPassword')) throw A.fail('INVALID_AUTH_INPUT', 400);
    // Only these fixed identifiers enter SQL, never caller-selected columns.
    const columns = ['username', 'email', 'phone', 'password_hash', 'theme', 'avatar'].filter(k => Object.hasOwn(values, k));
    if (!columns.length) throw A.fail('INVALID_AUTH_INPUT', 400);
    const security = columns.some(k => ['username', 'email', 'phone', 'password_hash'].includes(k));
    return A.transaction(poolProvider, async q => {
      const u = A.authorize(p, await A.lockAccounts(q, [p.userId]));
      if (u.row_version !== version) throw A.fail('USER_VERSION_CONFLICT');
      if (BigInt(version) === A.MAX || security && BigInt(u.token_version) === A.MAX) throw A.fail('USER_VERSION_EXHAUSTED');
      if (Object.hasOwn(values, 'email') && u.provider === 'google') throw A.fail('GOOGLE_ACCOUNT_LINK_REQUIRED');
      if (credentialVersion !== undefined && (credentialVersion !== u.token_version || u.provider !== 'local')) throw A.fail('USER_VERSION_CONFLICT');
      const assignments = columns.map((k, i) => `${k} = $${i + 3}`);
      if (Object.hasOwn(values, 'email')) assignments.push('email_verified = FALSE');
      if (security) assignments.push('token_version = token_version + 1');
      const row = A.one(await q(`UPDATE public.users SET ${assignments.join(', ')}
        WHERE id = $1::UUID AND row_version = $2::BIGINT RETURNING ${SAFE}`,
        [p.userId, version, ...columns.map(k => values[k])]), 'USER_VERSION_CONFLICT');
      if (security) await A.revokeGraph(q, p.userId, Object.hasOwn(values, 'password_hash') ? 'password_change' : 'identity_change');
      return Object.freeze({ user: safeUser(row), requiresReauthentication: security });
    });
  };
}
module.exports = { createProfileAtomic };
