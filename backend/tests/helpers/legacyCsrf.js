'use strict';
// TEST ONLY: pinned session/header check for unported Mongo route fixtures.
// This does not provide PostgreSQL session binding or runtime compatibility.
// Current CSRF authorization is exercised through auth-http.pg.test.js.
function doubleCsrfProtection(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  const code = !req.session ? 'NO_SESSION' : !req.session.csrfToken ? 'MISSING_CSRF_SESSION'
    : req.headers['x-csrf-token'] !== req.session.csrfToken ? 'INVALID_CSRF' : null;
  if (code) return res.status(403).json({ success: false, code, error: code });
  return next();
}
module.exports = { doubleCsrfProtection };
