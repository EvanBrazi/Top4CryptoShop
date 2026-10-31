'use strict';
// Private branded HTTP authentication receipt; NOT an issuance/first-factor proof.
const A = require('./persistence');
const records = new WeakMap();
const sql = `EXISTS (SELECT 1 FROM public.application_sessions a
  JOIN public.express_sessions e ON e.id = a.express_session_id AND e.user_id = a.user_id
  JOIN public.users u ON u.id = a.user_id
  WHERE a.session_digest = $1 AND a.token_digest = $2 AND a.user_id = $3::UUID AND a.token_version = $4::BIGINT
  AND a.issued_at = to_timestamp($5) AND a.expires_at = to_timestamp($6) AND e.sid_digest = $7
  AND e.session_data->>'csrfToken' = $8 AND a.revoked_at IS NULL AND e.revoked_at IS NULL
  AND a.expires_at > statement_timestamp() AND e.expires_at > statement_timestamp()
  AND u.account_status = 'active' AND u.token_version = a.token_version
  AND NOT EXISTS (SELECT 1 FROM public.token_revocations r WHERE r.token_digest = a.token_digest))`;
function register(handle, values) { records.set(handle, Object.freeze([...values])); }
function insertionGuard(handle) {
  const values = records.get(handle);
  if (!values) throw A.fail('AUTH_SESSION_INVALID', 401);
  return Object.freeze({ sql, values });
}
module.exports = { register, insertionGuard };
