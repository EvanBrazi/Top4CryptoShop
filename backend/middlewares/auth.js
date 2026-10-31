'use strict';
/** PostgreSQL-only shared credentials and UUID resource authorization. */
const A = require('../services/auth/persistence');
const { sendFailure } = require('../services/auth/httpErrors');
class AuthError extends Error {
  constructor(status, code) { super(code); this.name = 'AuthError'; this.status = status; this.code = code; }
}
function readCookies(header = '') {
  const cookies = Object.create(null);
  if (typeof header !== 'string' || header.length > 16384) throw new AuthError(401, 'INVALID_COOKIE');
  for (const part of header.split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (Object.hasOwn(cookies, key)) throw new AuthError(401, 'INVALID_COOKIE');
    try { cookies[key] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch (_) { throw new AuthError(401, 'INVALID_COOKIE'); }
  }
  return cookies;
}
function presentedCookies(req) { return req.headers?.cookie === undefined ? req.cookies || {} : readCookies(req.headers.cookie); }
function hasCredentials(req) {
  const c = presentedCookies(req), h = req.headers || {};
  return c.session_token !== undefined || c.customSessionId !== undefined || h.authorization !== undefined || h['x-session-id'] !== undefined;
}
function validateCredentials(value) {
  const { token, sessionId } = value || {};
  if (typeof token !== 'string' || typeof sessionId !== 'string' || !token || !sessionId) throw new AuthError(401, 'MISSING_CREDENTIALS');
  if (token.length > 4096 || !A.match(/^[A-Za-z0-9_-]{16,256}$/, sessionId) || /\s/.test(token)) throw new AuthError(401, 'INVALID_CREDENTIALS');
  return Object.freeze({ token, sessionId });
}
function extractCredentials(req) {
  const c = presentedCookies(req), h = req.headers || {};
  let token = c.session_token, sessionId = c.customSessionId;
  if (h.authorization !== undefined) {
    const m = typeof h.authorization === 'string' && /^Bearer ([^\s]+)$/i.exec(h.authorization);
    if (!m || m[0] !== h.authorization) throw new AuthError(401, 'INVALID_AUTHORIZATION');
    if (token !== undefined && token !== m[1]) throw new AuthError(401, 'CREDENTIAL_CONFLICT');
    token = m[1];
  }
  if (h['x-session-id'] !== undefined) {
    if (sessionId !== undefined && sessionId !== h['x-session-id']) throw new AuthError(401, 'CREDENTIAL_CONFLICT');
    sessionId = h['x-session-id'];
  }
  return validateCredentials({ token, sessionId });
}
function createAuthMiddleware({ sessionStore, adapter }) {
  const verified = new WeakMap();
  async function authenticateCredentials(input) {
    const credentials = validateCredentials(input);
    const result = await sessionStore.authenticateWithUser(credentials);
    const user = Object.freeze({ ...result.user, _id: result.user.id, tokenVersion: result.principal.tokenVersion });
    return Object.freeze({ ...result, user, ...credentials, expiresAt: Date.parse(result.expiresAt) });
  }
  const authenticateRequest = req => authenticateCredentials(extractCredentials(req));
  async function verifyToken(req, res, next) {
    try {
      adapter.requireSession(req); // Reject the unported Mongo Express composition.
      const result = await authenticateRequest(req);
      verified.set(req, result); req.auth = result; req.principal = result.principal; req.user = result.user;
      return next();
    } catch (e) { return sendFailure(req, res, e); }
  }
  function authorized(req) { const a = verified.get(req); return a && req.auth === a && req.user === a.user ? a : null; }
  const requireRole = (roles = []) => (req, res, next) => {
    const a = authorized(req);
    if (!a) return sendFailure(req, res, A.fail('UNAUTHENTICATED', 401));
    if (!roles.includes(a.role)) return sendFailure(req, res, A.fail('FORBIDDEN', 403));
    return next();
  };
  const ownership = (param, admin) => (req, res, next) => {
    const a = authorized(req);
    if (!a) return sendFailure(req, res, A.fail('UNAUTHENTICATED', 401));
    let id; try { id = A.uuid(req.params[param]); } catch (e) { return sendFailure(req, res, e); }
    if (id !== a.principal.userId && !(admin && a.role === 'admin')) return sendFailure(req, res, A.fail('FORBIDDEN', 403));
    return next();
  };
  const checkSession = (req, res) => verifyToken(req, res, async () => {
    try {
      const a = authorized(req), user = { ...a.user }; delete user._id; delete user.tokenVersion;
      await adapter.persistResponse(req, res);
      res.set('Cache-Control', 'no-store'); res.json({ success: true, isAuthenticated: true, user });
    } catch (e) { sendFailure(req, res, e); }
  });
  return Object.freeze({ authenticateCredentials, authenticateRequest, verifyToken, requireRole,
    checkAdmin: requireRole(['admin']), requireSelf: (param = 'id') => ownership(param, false),
    requireSelfOrAdmin: (param = 'id') => ownership(param, true), checkSession });
}
const current = () => require('../services/auth/httpContext').getDefaultContext().auth;
const delegate = name => (...args) => { try { return current()[name](...args); } catch (e) { if (args[1]?.status) return sendFailure(args[0], args[1], e); throw e; } };
function delegateFactory(name, args) { return (req, res, next) => { try { return current()[name](...args)(req, res, next); } catch (e) { return sendFailure(req, res, e); } }; }
module.exports = { AuthError, readCookies, hasCredentials, validateCredentials, extractCredentials, createAuthMiddleware,
  ...Object.fromEntries(['authenticateCredentials', 'authenticateRequest', 'verifyToken', 'checkAdmin', 'checkSession'].map(k => [k, delegate(k)])),
  requireRole: (...args) => delegateFactory('requireRole', args), requireSelf: (...args) => delegateFactory('requireSelf', args),
  requireSelfOrAdmin: (...args) => delegateFactory('requireSelfOrAdmin', args) };
