'use strict';
const session = require('express-session');
const signature = require('cookie-signature');
const A = require('./persistence');
const { randomBytes } = require('node:crypto');
const generateCsrfToken = () => randomBytes(32).toString('hex');
function createHttpSessionAdapter({ sessionStore, sessionSecret, secureCookies, maxAge, cookieName = 'sessionId' }) {
  if (typeof sessionSecret !== 'string' || Buffer.byteLength(sessionSecret) < 32 ||
      !Number.isInteger(maxAge) || maxAge < 60000 || maxAge > 86400000 || typeof secureCookies !== 'boolean' ||
      cookieName !== 'sessionId') throw A.fail('AUTH_HTTP_CONFIGURATION_INVALID', 503);
  const ownedRequests = new WeakSet();
  const native = session({ store: sessionStore.expressStore, name: cookieName, secret: sessionSecret,
    resave: false, saveUninitialized: false, unset: 'keep',
    cookie: { maxAge, httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/' } });
  function sessionMiddleware(req, res, next) {
    native(req, res, error => {
      if (error) { req.session = null; return next(A.fail('SESSION_UNAVAILABLE', 503)); }
      ownedRequests.add(req); next();
    });
  }
  function requireSession(req) {
    if (!ownedRequests.has(req) || req.sessionStore !== sessionStore.expressStore || !req.session ||
        req.session.id !== req.sessionID || typeof req.session.save !== 'function') {
      throw A.fail('AUTH_HTTP_CONFIGURATION_INVALID', 503);
    }
  }
  async function save(req) {
    requireSession(req);
    await new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
  }
  async function regenerateAnonymous(req) {
    requireSession(req);
    await new Promise((resolve, reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
    req.session.csrfToken = generateCsrfToken();
    await save(req);
  }
  function install(req, data, serverSid = req.sessionID) {
    requireSession(req);
    // Only committed service output enters here, NEVER x-session-id or body fields.
    if (!A.match(/^[A-Za-z0-9_-]{16,256}$/, serverSid)) throw A.fail('AUTH_STATE_INVALID', 503);
    req.sessionID = serverSid;
    sessionStore.expressStore.createSession(req, JSON.parse(JSON.stringify(data)));
  }
  async function persistResponse(req, res) {
    requireSession(req);
    // Express's implicit end() save emits headers before its callback and can
    // race newer service CAS revisions. Explicitly finish persistence first.
    if (!req.session.csrfToken && !req.session.__top4StoreRevision) req.session.csrfToken = generateCsrfToken();
    req.session.touch();
    await save(req);
    const sid = req.sessionID, cookie = { ...req.session.cookie.data };
    const signed = 's:' + signature.sign(sid, sessionSecret);
    req.session = null; // unset:'keep': suppress implicit save/touch, NOT destroy.
    // The same signing library/protocol as Express-session; only its standard
    // signed HttpOnly cookie carries this SID, never a public DTO/header.
    res.cookie(cookieName, signed, { ...cookie, httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/' });
  }
  function clearCookies(req, res) {
    req.session = null;
    for (const name of [cookieName, 'session_token', 'customSessionId', 'x-csrf-token', 'pending2faChallenge']) {
      res.clearCookie(name, { path: '/', secure: secureCookies, httpOnly: name !== 'x-csrf-token',
        sameSite: name === 'x-csrf-token' ? 'strict' : 'lax' });
    }
  }
  return Object.freeze({ sessionMiddleware, requireSession, save, regenerateAnonymous, install, persistResponse, clearCookies });
}
module.exports = { createHttpSessionAdapter, generateCsrfToken };
