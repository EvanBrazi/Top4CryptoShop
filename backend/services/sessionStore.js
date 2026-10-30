'use strict';
// Foundation only: no connection, timer, or singleton on import; no auth fallback.
const jwt = require('jsonwebtoken');
const { createHash } = require('node:crypto');
const { getPool } = require('../db/pg');
const A = require('./auth/persistence');
function createSessionStore({ poolProvider = getPool, userRepository, lookupSecret = process.env.SESSION_LOOKUP_SECRET,
  jwtSecret = process.env.JWT_SECRET, tokenTtlSeconds = 3600 } = {}) {
  if (typeof jwtSecret !== 'string' || Buffer.byteLength(jwtSecret) < 32) throw A.fail('JWT_SECRET_REQUIRED', 503);
  if (!Number.isInteger(tokenTtlSeconds) || tokenTtlSeconds < 60 || tokenTtlSeconds > 86400) throw A.fail('INVALID_SESSION_EXPIRY', 400);
  const express = require('./auth/expressStore').createExpressStore({ poolProvider, lookupSecret });
  const tokenDigest = token => {
    if (typeof token !== 'string' || token.length > 4096) throw A.fail('INVALID_AUTH_TOKEN', 401);
    return createHash('sha256').update(token, 'utf8').digest('hex');
  };
  function verify(token) {
    tokenDigest(token); let c;
    try { c = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], issuer: ['your-app-api', 'admin-panel'] }); }
    catch (_) { throw A.fail('INVALID_AUTH_TOKEN', 401); }
    try { A.uuid(c.userId); A.integer(c.tokenVersion); } catch (_) { throw A.fail('INVALID_AUTH_TOKEN', 401); }
    if (!Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp) || c.exp <= c.iat || c.exp - c.iat > 86400 || c.iat > Math.floor(Date.now() / 1000) + 5) throw A.fail('INVALID_AUTH_TOKEN', 401);
    return c;
  }
  const deps = { poolProvider, userRepository, express, jwtSecret, tokenDigest, tokenTtlSeconds, verify };
  return Object.freeze({ expressStore: express.store, issueAuthenticatedSession: require('./auth/sessionIssuance').createIssuance(deps),
    ...require('./auth/applicationSessions').createApplicationSessions(deps) });
}
module.exports = { createSessionStore };
