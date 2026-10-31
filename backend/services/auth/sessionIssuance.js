'use strict';
const jwt = require('jsonwebtoken');
const { randomBytes } = require('node:crypto');
const A = require('./persistence');
const { PENDING } = require('./pendingState');
function createIssuance({ poolProvider, userRepository, express, jwtSecret, tokenDigest, tokenTtlSeconds }) {
  // PRIVATE composition helper, never exported by the public session service.
  // Caller owns the account and parent locks and has verified all factors.
  async function issueForLockedParent(q, u, parent, parentDigest) {
    if (Object.hasOwn(parent.session_data, PENDING) || Object.hasOwn(parent.session_data, '__top4GoogleOAuthState')) throw A.fail('AUTH_CHALLENGE_INVALID', 401);
    const iat = Math.floor(Date.now() / 1000), exp = Math.min(iat + tokenTtlSeconds, Math.floor(parent.expires_at.getTime() / 1000));
    if (exp <= iat) throw A.fail('SESSION_NOT_ACTIVE');
    const token = jwt.sign({ userId: u.id, tokenVersion: u.token_version, role: u.role, iat, exp, jti: randomBytes(16).toString('hex') }, jwtSecret,
      { algorithm: 'HS256', issuer: u.role === 'admin' ? 'admin-panel' : 'your-app-api' });
    const sessionId = randomBytes(32).toString('base64url'), csrfToken = randomBytes(32).toString('hex');
    const sessionData = { ...parent.session_data, userId: u.id, csrfToken };
    const bound = A.one(await q(`UPDATE public.express_sessions SET user_id = $1::UUID, session_data = $2::JSONB
      WHERE id = $3::UUID AND row_version = $4::BIGINT AND user_id IS NULL AND revoked_at IS NULL
      AND expires_at > statement_timestamp() RETURNING id, row_version`,
      [u.id, JSON.stringify(sessionData), parent.id, parent.row_version]), 'SESSION_VERSION_CONFLICT');
    await q(`INSERT INTO public.application_sessions (session_digest, user_id, express_session_id, token_digest, token_version, issued_at, expires_at)
      VALUES ($1, $2::UUID, $3::UUID, $4, $5::BIGINT, to_timestamp($6), to_timestamp($7))`,
      [express.digest('application', sessionId), u.id, parent.id, tokenDigest(token), u.token_version, iat, exp]);
    const result = await q(`UPDATE public.users SET login_attempts = 0, two_fa_attempts = 0, last_login = statement_timestamp()
      WHERE id = $1::UUID AND row_version = $2::BIGINT`, [u.id, u.row_version]);
    if (result.rowCount !== 1) throw A.fail('USER_VERSION_CONFLICT');
    return Object.freeze({ token, sessionId, csrfToken, expiresAt: new Date(exp * 1000).toISOString(),
      expressSession: Object.freeze({ ...sessionData, [express.META]: Object.freeze(express.metadata(parentDigest, bound)) }) });
  }
  async function issueAuthenticatedSession(input) {
    A.fields(input, ['authenticationProof', 'expressSid']);
    const parentDigest = express.digest('express', input.expressSid);
    if (!userRepository?.internal?.claimAuthentication) throw A.fail('AUTH_PROOF_REQUIRED', 403);
    const proof = userRepository.internal.claimAuthentication(input.authenticationProof);
    try {
      return await A.transaction(poolProvider, async q => {
        const u = A.authorize(proof, await A.lockAccounts(q, [proof.userId]));
        if (u.row_version !== proof.rowVersion) throw A.fail('USER_VERSION_CONFLICT');
        if (u.two_fa_status !== 'disabled' && !(u.two_fa_status === 'enabled' && proof.twoFactorVerified)) throw A.fail('SECOND_FACTOR_REQUIRED', 403);
        const parent = A.one(await q(`SELECT id, session_data, row_version, expires_at FROM public.express_sessions
          WHERE sid_digest = $1 AND user_id IS NULL AND revoked_at IS NULL AND expires_at > statement_timestamp() FOR UPDATE`, [parentDigest]), 'SESSION_NOT_ACTIVE');
        return issueForLockedParent(q, u, parent, parentDigest);
      });
    } finally { userRepository.internal.consumeAuthentication(input.authenticationProof); }
  }
  return { issueAuthenticatedSession, issueForLockedParent };
}
module.exports = { createIssuance };
