'use strict';
const A = require('./persistence');
function createMaintenance({ poolProvider }) {
  async function revokeUserSessions(input) {
    A.fields(input, ['principal', 'userId', 'expectedRowVersion']);
    const p = A.principal(input.principal), id = A.uuid(input.userId), version = A.integer(input.expectedRowVersion);
    return A.transaction(poolProvider, async q => {
      const rows = await A.lockAccounts(q, [p.userId, id]); A.authorize(p, rows, p.userId !== id);
      const target = rows.find(r => r.id === id);
      if (target.row_version !== version) throw A.fail('USER_VERSION_CONFLICT');
      if (BigInt(target.token_version) === A.MAX) throw A.fail('USER_VERSION_EXHAUSTED');
      await q('UPDATE public.users SET token_version = token_version + 1 WHERE id = $1::UUID', [id]);
      await A.revokeGraph(q, id, 'administrative_revocation'); return Object.freeze({ revoked: true });
    });
  }
  async function cleanupExpired(input = {}) {
    A.fields(input, ['limit'], []); const limit = input.limit === undefined ? 100 : input.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw A.fail('INVALID_CLEANUP_LIMIT', 400);
    // Explicit maintenance only. Keep Express tombstones beyond request budgets.
    return A.transaction(poolProvider, async q => {
      const counts = {};
      for (const table of ['application_sessions', 'token_revocations', 'express_sessions']) {
        const predicate = table === 'express_sessions' ? "expires_at <= statement_timestamp() - interval '1 day' AND NOT EXISTS (SELECT 1 FROM public.application_sessions a WHERE a.express_session_id = express_sessions.id)" : 'expires_at <= statement_timestamp()';
        const result = await q(`WITH victims AS (SELECT id FROM public.${table} WHERE ${predicate} ORDER BY expires_at, id LIMIT $1 FOR UPDATE SKIP LOCKED)
          DELETE FROM public.${table} t USING victims v WHERE t.id = v.id RETURNING t.id`, [limit]); counts[table] = result.rows.length;
      }
      return Object.freeze(counts);
    });
  }
  return { revokeUserSessions, cleanupExpired };
}
module.exports = { createMaintenance };
