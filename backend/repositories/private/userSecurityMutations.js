'use strict';
const bcrypt = require('bcryptjs');
const validator = require('validator');
const A = require('../../services/auth/persistence');
const SAFE = `id, username, email, email_verified, phone, provider, theme, balance_cents, balance, avatar, role,
 account_status, two_fa_status, last_login, activated_at, row_version, created_at, updated_at`;
function createMutations({ poolProvider, query, safeUser, username, email, phone, password, googleIdentityAuthority = null }) {
  async function mutate(input, kind) {
    const admin = kind === 'activate' || kind === 'deactivate';
    const field = { username: 'username', email: 'email', phone: 'phone', password: 'newPassword' }[kind];
    A.fields(input, ['principal', 'expectedRowVersion', ...(admin ? ['userId'] : [field]), ...(kind === 'password' ? ['currentPassword'] : [])]);
    const p = A.principal(input.principal), id = admin ? A.uuid(input.userId) : p.userId, version = A.integer(input.expectedRowVersion);
    let value, credentialVersion;
    if (kind === 'username') value = username(input.username);
    if (kind === 'email') value = email(input.email);
    if (kind === 'phone') value = input.phone === null ? null : phone(input.phone);
    if (kind === 'password') {
      password(input.newPassword);
      const row = A.one(await query('SELECT provider, password_hash, token_version FROM public.users WHERE id = $1::UUID', [id]), 'USER_NOT_FOUND');
      if (row.provider !== 'local' || !row.password_hash || typeof input.currentPassword !== 'string' || !input.currentPassword ||
          Buffer.byteLength(input.currentPassword, 'utf8') > 72) throw A.fail('CURRENT_PASSWORD_INVALID', 403);
      let verified; try { verified = await bcrypt.compare(input.currentPassword, row.password_hash); }
      catch (_) { throw A.fail('AUTH_UNAVAILABLE', 503); }
      if (!verified) throw A.fail('CURRENT_PASSWORD_INVALID', 403);
      credentialVersion = row.token_version;
      try { value = await bcrypt.hash(input.newPassword, 12); } catch (_) { throw A.fail('AUTH_UNAVAILABLE', 503); }
    }
    return A.transaction(poolProvider, async q => {
      const rows = await A.lockAccounts(q, [p.userId, id]); A.authorize(p, rows, admin); const u = rows.find(r => r.id === id);
      if (u.row_version !== version || BigInt(version) === A.MAX || BigInt(u.token_version) === A.MAX) throw A.fail('USER_VERSION_CONFLICT');
      if (kind === 'email' && u.provider === 'google') throw A.fail('GOOGLE_ACCOUNT_LINK_REQUIRED');
      if (kind === 'password' && credentialVersion !== u.token_version) throw A.fail('USER_VERSION_CONFLICT');
      const set = { username: 'username = $3', email: 'email = $3, email_verified = FALSE', phone: 'phone = $3', password: 'password_hash = $3',
        activate: "account_status = 'active', login_attempts = 0, activated_at = statement_timestamp()", deactivate: "account_status = 'deactivated'" }[kind];
      const params = [id, version]; if (!admin) params.push(value);
      const row = A.one(await q(`UPDATE public.users SET ${set}, token_version = token_version + 1
        WHERE id = $1::UUID AND row_version = $2::BIGINT RETURNING ${SAFE}`, params), 'USER_VERSION_CONFLICT');
      await A.revokeGraph(q, id, admin ? 'account_status_change' : kind === 'password' ? 'password_change' : 'identity_change');
      return Object.freeze({ user: safeUser(row), requiresReauthentication: true });
    });
  }
  async function findByGoogleId(googleId) {
    if (!A.match(/^[A-Za-z0-9_-]{1,128}$/, googleId)) throw A.fail('INVALID_GOOGLE_ID', 400);
    const row = A.one(await query(`SELECT ${SAFE} FROM public.users WHERE google_id = $1`, [googleId])); return row ? safeUser(row) : null;
  }
  async function createGoogleUser(input) {
    A.fields(input, ['verifiedIdentity', 'username', 'avatar'], ['verifiedIdentity', 'username']);
    let identity; try { identity = googleIdentityAuthority?.resolve(input.verifiedIdentity); } catch (_) {}
    if (!identity || !Object.isFrozen(identity) || identity.emailVerified !== true || !A.match(/^[A-Za-z0-9_-]{1,128}$/, identity.googleId)) throw A.fail('AUTH_PROOF_REQUIRED', 403);
    const address = email(identity.email), name = username(input.username), avatar = input.avatar ?? '';
    if (typeof avatar !== 'string' || avatar && !validator.isURL(avatar)) throw A.fail('INVALID_AVATAR', 400);
    return A.transaction(poolProvider, async q => {
      if (A.one(await q('SELECT id FROM public.users WHERE email = $1 OR google_id = $2 LIMIT 1', [address, identity.googleId]))) throw A.fail('GOOGLE_ACCOUNT_LINK_REQUIRED');
      const row = A.one(await q(`INSERT INTO public.users (username, email, email_verified, google_id, provider, avatar, token_version)
        VALUES ($1, $2, TRUE, $3, 'google', $4, 1) RETURNING ${SAFE}`, [name, address, identity.googleId, avatar])); return safeUser(row);
    });
  }
  return { findByGoogleId, createGoogleUser,
    updatePassword: x => mutate(x, 'password'), updateUsername: x => mutate(x, 'username'), updateEmail: x => mutate(x, 'email'), updatePhone: x => mutate(x, 'phone'),
    activateAccount: x => mutate(x, 'activate'), deactivateAccount: x => mutate(x, 'deactivate') };
}
module.exports = { createMutations };
