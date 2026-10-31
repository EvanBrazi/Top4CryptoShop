'use strict';
const { randomBytes } = require('node:crypto');
const speakeasy = require('speakeasy');
const A = require('./persistence');
const { PENDING, equal, createPendingState } = require('./pendingState');
function createPendingChallenges({ poolProvider, userRepository, express, lookupSecret, challengeTtlSeconds, issueForLockedParent }) {
  const codec = createPendingState(lookupSecret);
  const view = (hash, row, data) => Object.freeze({ ...data, [express.META]: Object.freeze(express.metadata(hash, row)) });
  async function parent(q, hash) {
    return A.one(await q(`SELECT id, session_data, row_version, expires_at, statement_timestamp() AS now
      FROM public.express_sessions WHERE sid_digest = $1 AND user_id IS NULL AND revoked_at IS NULL
      AND expires_at > statement_timestamp() FOR UPDATE`, [hash]), 'AUTH_CHALLENGE_INVALID');
  }
  async function beginPendingAuthentication(input) {
    A.fields(input, ['authenticationProof', 'expressSid', 'csrfToken']);
    const hash = express.digest('express', input.expressSid);
    if (!userRepository?.internal?.claimPendingAuthentication) throw A.fail('AUTH_PROOF_REQUIRED', 403);
    const proof = userRepository.internal.claimPendingAuthentication(input.authenticationProof);
    try {
      return await A.transaction(poolProvider, async q => {
        const u = A.authorize(proof, await A.lockAccounts(q, [proof.userId]));
        if (u.row_version !== proof.rowVersion) throw A.fail('USER_VERSION_CONFLICT');
        if (u.two_fa_status !== 'enabled') throw A.fail('TWO_FA_STATE_CONFLICT');
        const factor = A.one(await q('SELECT two_fa_attempts FROM public.users WHERE id = $1::UUID', [u.id]));
        if (factor.two_fa_attempts >= 5) throw A.fail('TOO_MANY_2FA_ATTEMPTS', 429);
        const p = await parent(q, hash);
        if (!equal(input.csrfToken, p.session_data.csrfToken)) throw A.fail('CSRF_INVALID', 403);
        if (Object.hasOwn(p.session_data, PENDING)) throw A.fail('AUTH_CHALLENGE_EXISTS');
        const challengeId = randomBytes(32).toString('base64url');
        const issuedAt = p.now.getTime(), expiresAt = Math.min(issuedAt + challengeTtlSeconds * 1000, p.expires_at.getTime(), proof.expiresAt);
        if (expiresAt <= issuedAt) throw A.fail('AUTH_CHALLENGE_INVALID', 401);
        const receipt = codec.seal({ version: 1, userId: u.id, tokenVersion: u.token_version, rowVersion: u.row_version,
          challengeDigest: express.digest('pending-2fa', challengeId), issuedAt, expiresAt }, hash, p.id, p.session_data.csrfToken);
        const data = { ...p.session_data, [PENDING]: receipt };
        const saved = A.one(await q(`UPDATE public.express_sessions SET session_data = $1::JSONB
          WHERE id = $2::UUID AND row_version = $3::BIGINT RETURNING id, row_version`, [JSON.stringify(data), p.id, p.row_version]), 'SESSION_VERSION_CONFLICT');
        return Object.freeze({ challengeId, expiresAt: new Date(expiresAt).toISOString(), expressSession: view(hash, saved, data) });
      });
    } finally { userRepository.internal.consumeAuthentication(input.authenticationProof); }
  }
  async function completePendingAuthentication(input) {
    A.fields(input, ['expressSid', 'challengeId', 'csrfToken', 'code']);
    if (typeof input.code !== 'string' || input.code.length > 64) throw A.fail('INVALID_AUTH_INPUT', 400);
    const hash = express.digest('express', input.expressSid), challengeDigest = express.digest('pending-2fa', input.challengeId);
    return A.transaction(poolProvider, async q => {
      // Hint is verified before locking an account; never trust a JSON owner/boolean.
      const hint = A.one(await q('SELECT id, session_data FROM public.express_sessions WHERE sid_digest = $1', [hash]), 'AUTH_CHALLENGE_INVALID');
      const h = codec.check(hint.session_data[PENDING], hash, hint.id, hint.session_data.csrfToken);
      const u = A.authorize(h, await A.lockAccounts(q, [h.userId]));
      const p = await parent(q, hash), s = codec.check(p.session_data[PENDING], hash, p.id, p.session_data.csrfToken);
      if (s.userId !== u.id || s.tokenVersion !== u.token_version || s.rowVersion !== u.row_version || u.two_fa_status !== 'enabled' ||
          p.now.getTime() < s.issuedAt || p.now.getTime() >= s.expiresAt || s.expiresAt > p.expires_at.getTime() ||
          !equal(s.challengeDigest, challengeDigest)) throw A.fail('AUTH_CHALLENGE_INVALID', 401);
      if (!equal(input.csrfToken, p.session_data.csrfToken)) throw A.fail('CSRF_INVALID', 403);
      const factor = A.one(await q('SELECT two_fa_attempts, two_fa_secret FROM public.users WHERE id = $1::UUID', [u.id]));
      if (factor.two_fa_attempts >= 5) throw A.fail('TOO_MANY_2FA_ATTEMPTS', 429);
      if (!A.match(/^[A-Z2-7]{16,128}$/, factor.two_fa_secret)) throw A.fail('TWO_FA_STATE_INVALID', 503);
      let valid;
      try { valid = A.match(/^[0-9]{6}$/, input.code) && Boolean(factor.two_fa_secret) && speakeasy.totp.verify({
        secret: factor.two_fa_secret, encoding: 'base32', token: input.code, window: 1 }); }
      catch (_) { throw A.fail('AUTH_UNAVAILABLE', 503); }
      if (!valid) {
        const changed = A.one(await q(`UPDATE public.users SET two_fa_attempts = two_fa_attempts + 1
          WHERE id = $1::UUID AND row_version = $2::BIGINT RETURNING row_version, two_fa_attempts`, [u.id, u.row_version]), 'USER_VERSION_CONFLICT');
        const exhausted = changed.two_fa_attempts >= 5;
        const data = exhausted ? {} : { ...p.session_data, [PENDING]: codec.seal({ ...s, rowVersion: changed.row_version }, hash, p.id, p.session_data.csrfToken) };
        const saved = A.one(await q(`UPDATE public.express_sessions SET session_data = $1::JSONB${exhausted ? ', revoked_at = statement_timestamp()' : ''}
          WHERE id = $2::UUID AND row_version = $3::BIGINT RETURNING id, row_version`, [JSON.stringify(data), p.id, p.row_version]), 'SESSION_VERSION_CONFLICT');
        // Return after COMMIT so the negative attempt is not rolled back by an error.
        return Object.freeze({ authenticated: false, remainingAttempts: 5 - changed.two_fa_attempts,
          ...(exhausted ? { sessionDestroyed: true } : { expressSession: view(hash, saved, data) }) });
      }
      // Consume old SID and mint a fresh parent in the SAME transaction as issuance.
      // The future HTTP adapter installs this server-generated SID, never a header SID.
      const expressSid = randomBytes(32).toString('base64url'), newHash = express.digest('express', expressSid);
      const data = { ...p.session_data }; delete data[PENDING]; delete data.userId;
      const fresh = A.one(await q(`INSERT INTO public.express_sessions (sid_digest, session_data, expires_at)
        VALUES ($1, $2::JSONB, $3::TIMESTAMPTZ) RETURNING id, session_data, row_version, expires_at`,
        [newHash, JSON.stringify(data), p.expires_at.toISOString()]));
      A.one(await q(`UPDATE public.express_sessions SET session_data = '{}'::JSONB, revoked_at = statement_timestamp()
        WHERE id = $1::UUID AND row_version = $2::BIGINT RETURNING id`, [p.id, p.row_version]), 'SESSION_VERSION_CONFLICT');
      const issued = await issueForLockedParent(q, u, fresh, newHash);
      return Object.freeze({ authenticated: true, ...issued, expressSid });
    });
  }
  async function describePendingAuthentication(input) {
    A.fields(input, ['expressSid', 'challengeId']);
    const hash = express.digest('express', input.expressSid), digest = express.digest('pending-2fa', input.challengeId);
    let p;
    try { p = A.one(await poolProvider().query({ text: `SELECT e.id,e.session_data,e.expires_at,statement_timestamp() AS now,
      u.token_version AS owner_token_version,u.row_version AS owner_row_version
      FROM public.express_sessions e JOIN public.users u ON u.id::TEXT=e.session_data->'${PENDING}'->>'userId'
      WHERE e.sid_digest=$1 AND e.user_id IS NULL AND e.revoked_at IS NULL AND e.expires_at>statement_timestamp()
      AND u.account_status='active' AND u.two_fa_status='enabled' AND u.two_fa_attempts<5`, values: [hash], query_timeout: 5000 })); }
    catch (_) { throw A.fail('AUTH_UNAVAILABLE', 503); }
    if (!p) throw A.fail('AUTH_CHALLENGE_INVALID', 401);
    const state = codec.check(p.session_data[PENDING], hash, p.id, p.session_data.csrfToken);
    if (!equal(digest, state.challengeDigest) || p.now.getTime() >= state.expiresAt || state.expiresAt > p.expires_at.getTime() ||
        state.tokenVersion !== p.owner_token_version || state.rowVersion !== p.owner_row_version) throw A.fail('AUTH_CHALLENGE_INVALID', 401);
    return Object.freeze({ expiresAt: new Date(state.expiresAt).toISOString() });
  }
  return { beginPendingAuthentication, completePendingAuthentication, describePendingAuthentication };
}
module.exports = { createPendingChallenges };
