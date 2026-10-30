'use strict';
// Trusted auth-only composition root. No pool connection or env loading on import.
const { getPool } = require('../../db/pg');
const A = require('./persistence');
function createAuthContext({ poolProvider = getPool, lookupSecret = process.env.SESSION_LOOKUP_SECRET,
  jwtSecret = process.env.JWT_SECRET, sessionSecret = process.env.SESSION_SECRET,
  secureCookies = process.env.NODE_ENV === 'production', tokenTtlSeconds = 3600,
  challengeTtlSeconds = 300, googleStateTtlSeconds = 300,
  googleConfig = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL }, googleTransport } = {}) {
  const google = require('./googleOAuth').createGoogleOAuth({ poolProvider, lookupSecret, config: googleConfig,
    transport: googleTransport, stateTtlSeconds: googleStateTtlSeconds });
  const userRepository = require('../../repositories/userRepository').createUserRepository({ poolProvider, googleIdentityAuthority: google.identityAuthority });
  const sessionStore = require('../sessionStore').createSessionStore({ poolProvider, userRepository, lookupSecret, jwtSecret, tokenTtlSeconds, challengeTtlSeconds });
  const adapter = require('./httpSessionAdapter').createHttpSessionAdapter({ sessionStore, sessionSecret, secureCookies, maxAge: tokenTtlSeconds * 1000 });
  const auth = require('../../middlewares/auth').createAuthMiddleware({ sessionStore, adapter });
  const csrf = require('./httpCsrf').createCsrfMiddleware({ sessionStore, adapter, secureCookies });
  const controller = require('../../controllers/authController').createAuthController({ userRepository });
  const errorMiddleware = (error, req, res, next) => {
    if (res.headersSent) return next(A.fail('AUTH_UNAVAILABLE', 503));
    if (error?.type === 'entity.too.large' || error instanceof SyntaxError) error = A.fail('INVALID_AUTH_INPUT', 400);
    return require('./httpErrors').sendFailure(req, res, error);
  };
  return Object.freeze({ userRepository, sessionStore, adapter, auth, csrf, controller, google,
    secureCookies, sessionMiddleware: adapter.sessionMiddleware, errorMiddleware });
}
let defaultContext;
function getDefaultContext() { return defaultContext || (defaultContext = createAuthContext()); }
module.exports = { createAuthContext, getDefaultContext };
