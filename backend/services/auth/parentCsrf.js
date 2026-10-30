'use strict';
const A = require('./persistence');
const { equal } = require('./pendingState');
function createParentCsrf({ poolProvider, express }) {
  async function validateAnonymousCsrf(input) {
    A.fields(input, ['expressSid', 'csrfToken']);
    const hash = express.digest('express', input.expressSid);
    let row;
    try { row = A.one(await poolProvider().query({ text: `SELECT session_data->>'csrfToken' AS csrf
      FROM public.express_sessions WHERE sid_digest=$1 AND user_id IS NULL AND revoked_at IS NULL
      AND expires_at > statement_timestamp()`, values: [hash], query_timeout: 5000 })); }
    catch (_) { throw A.fail('AUTH_UNAVAILABLE', 503); }
    if (!row || !equal(input.csrfToken, row.csrf)) throw A.fail('CSRF_INVALID', 403);
    return Object.freeze({ csrfValidated: true });
  }
  return { validateAnonymousCsrf };
}
module.exports = { createParentCsrf };
