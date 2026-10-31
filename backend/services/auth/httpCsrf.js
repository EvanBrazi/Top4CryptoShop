'use strict';
const A = require('./persistence');
const { equal } = require('./pendingState');
const { generateCsrfToken } = require('./httpSessionAdapter');
const { hasCredentials, extractCredentials } = require('../../middlewares/auth');
const { sendFailure } = require('./httpErrors');
function createCsrfMiddleware({ sessionStore, adapter, secureCookies }) {
  async function verify(req) {
    adapter.requireSession(req);
    const csrfToken = req.headers['x-csrf-token'];
    if (!equal(csrfToken, req.session.csrfToken)) throw A.fail('CSRF_INVALID', 403);
    if (hasCredentials(req)) return sessionStore.authenticateForExpressSession({ ...extractCredentials(req), expressSid: req.sessionID, csrfToken });
    return sessionStore.validateAnonymousCsrf({ expressSid: req.sessionID, csrfToken });
  }
  async function publish(req, res) {
    adapter.requireSession(req);
    if (!req.session.csrfToken) {
      if (req.session.__top4StoreRevision || hasCredentials(req) || req.session.userId) throw A.fail('CSRF_INVALID', 403);
      req.session.csrfToken = generateCsrfToken(); await adapter.save(req);
    }
    const csrfToken = req.session.csrfToken;
    if (hasCredentials(req)) await sessionStore.authenticateForExpressSession({ ...extractCredentials(req), expressSid: req.sessionID, csrfToken });
    else await sessionStore.validateAnonymousCsrf({ expressSid: req.sessionID, csrfToken });
    await adapter.persistResponse(req, res);
    res.set('Cache-Control', 'no-store'); res.set('x-csrf-token', csrfToken);
    res.cookie('x-csrf-token', csrfToken, { httpOnly: false, secure: secureCookies, sameSite: 'strict', path: '/' });
    return csrfToken;
  }
  async function doubleCsrfProtection(req, res, next) {
    if (req.method === 'OPTIONS') return next();
    try { await verify(req); return next(); } catch (e) { return sendFailure(req, res, e); }
  }
  return Object.freeze({ verify, publish, attachCsrfToken: publish, doubleCsrfProtection });
}
module.exports = { createCsrfMiddleware, generateCsrfToken,
  attachCsrfToken: (...args) => require('./httpContext').getDefaultContext().csrf.publish(...args),
  doubleCsrfProtection: (req, res, next) => { try { return require('./httpContext').getDefaultContext().csrf.doubleCsrfProtection(req, res, next); } catch (e) { return sendFailure(req, res, e); } } };
