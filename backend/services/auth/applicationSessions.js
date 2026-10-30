'use strict';
const A = require('./persistence');
function createApplicationSessions({ poolProvider, express, verify, tokenDigest }) {
  async function authenticate(input) {
    A.fields(input, ['token', 'sessionId']); const c = verify(input.token);
    const values = [express.digest('application', input.sessionId), tokenDigest(input.token), c.userId, c.tokenVersion, c.iat, c.exp];
    let row;
    try { row = A.one(await poolProvider().query({ text: `SELECT u.id, u.role, u.account_status, u.token_version, a.expires_at
      FROM public.application_sessions a JOIN public.express_sessions e ON e.id = a.express_session_id AND e.user_id = a.user_id
      JOIN public.users u ON u.id = a.user_id
      WHERE a.session_digest = $1 AND a.token_digest = $2 AND a.user_id = $3::UUID AND a.token_version = $4::BIGINT
      AND a.issued_at = to_timestamp($5) AND a.expires_at = to_timestamp($6)
      AND a.revoked_at IS NULL AND a.expires_at > statement_timestamp() AND e.revoked_at IS NULL AND e.expires_at > statement_timestamp()
      AND u.account_status = 'active' AND u.token_version = a.token_version
      AND NOT EXISTS (SELECT 1 FROM public.token_revocations r WHERE r.token_digest = a.token_digest)`, values, query_timeout: 5000 })); }
    catch (_) { throw A.fail('AUTH_UNAVAILABLE', 503); }
    if (!row) throw A.fail('AUTH_SESSION_INVALID', 401);
    return Object.freeze({ principal: Object.freeze({ userId: row.id, tokenVersion: row.token_version }),
      role: row.role, accountStatus: row.account_status, expiresAt: row.expires_at.toISOString() });
  }
  async function revokeAuthenticatedSession(input) {
    A.fields(input, ['token', 'sessionId']); const c = verify(input.token);
    const hash = tokenDigest(input.token), sessionHash = express.digest('application', input.sessionId);
    return A.transaction(poolProvider, async q => {
      const row = A.one(await q(`SELECT id, express_session_id FROM public.application_sessions
        WHERE session_digest = $1 AND token_digest = $2 AND user_id = $3::UUID AND token_version = $4::BIGINT
        AND issued_at = to_timestamp($5) AND expires_at = to_timestamp($6)`, [sessionHash, hash, c.userId, c.tokenVersion, c.iat, c.exp]), 'AUTH_SESSION_INVALID');
      await A.lockAccounts(q, [c.userId]);
      await A.revokeGraph(q, c.userId, 'logout', row.express_session_id);
      await q(`INSERT INTO public.token_revocations (token_digest, user_id, expires_at, reason)
        VALUES ($1, $2::UUID, to_timestamp($3), 'logout') ON CONFLICT (token_digest) DO NOTHING`, [hash, c.userId, c.exp]);
      return Object.freeze({ revoked: true });
    });
  }
  return { authenticate, revokeAuthenticatedSession,
    ...require('./sessionMaintenance').createMaintenance({ poolProvider }) };
}
module.exports = { createApplicationSessions };
