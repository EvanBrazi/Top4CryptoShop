'use strict';
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { randomBytes } = require('node:crypto');
const A = require('./persistence');
const { hasCredentials, readCookies } = require('../../middlewares/auth');
const { sendFailure } = require('./httpErrors');
function createAuthRouter(context) {
  const router = express.Router(), { adapter, csrf, auth, sessionStore, userRepository, google } = context;
  const wrap = handler => async (req, res) => { try { await handler(req, res); } catch (e) { sendFailure(req, res, e); } };
  const json = express.json({ limit: '16kb', strict: true });
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res) => sendFailure(req, res, A.fail('AUTH_RATE_LIMITED', 429)) });
  router.use((req, res, next) => {
    try { adapter.requireSession(req); res.set('Cache-Control', 'no-store'); next(); }
    catch (e) { sendFailure(req, res, e); }
  }, limiter);
  const anonymous = (req, res, next) => {
    try { if (hasCredentials(req)) throw A.fail('AUTH_ALREADY_AUTHENTICATED', 409); next(); }
    catch (e) { sendFailure(req, res, e); }
  };
  const cookies = { httpOnly: true, secure: context.secureCookies, sameSite: 'lax', path: '/' };
  const redirectFor = role => role === 'admin' ? '/protectedViews/admin.html' : '/homepage.html';
  async function issuedResponse(req, res, issued, redirect = false) {
    adapter.install(req, issued.expressSession, issued.expressSid || req.sessionID);
    // Safe user and authority come from the SAME exact-session SQL snapshot,
    // including post-issuance bookkeeping, not the stale first-factor DTO.
    const current = await sessionStore.authenticateWithUser({ token: issued.token, sessionId: issued.sessionId });
    await adapter.persistResponse(req, res);
    const expires = new Date(issued.expiresAt);
    res.cookie('session_token', issued.token, { ...cookies, expires });
    res.cookie('customSessionId', issued.sessionId, { ...cookies, expires });
    res.clearCookie('pending2faChallenge', cookies);
    res.cookie('x-csrf-token', issued.csrfToken, { ...cookies, httpOnly: false, sameSite: 'strict', expires });
    res.set('x-csrf-token', issued.csrfToken);
    if (redirect) return res.redirect(current.role === 'admin' ? redirectFor(current.role) : '/google-redirect.html');
    return res.json({ success: true, user: current.user, token: issued.token, sessionId: issued.sessionId,
      csrfToken: issued.csrfToken, expiresAt: issued.expiresAt, redirectTo: redirectFor(current.role) });
  }
  async function firstFactor(req, res, proof, twoFAStatus, redirect = false) {
    await adapter.regenerateAnonymous(req);
    if (twoFAStatus === 'enabled') {
      const result = await sessionStore.beginPendingAuthentication({ authenticationProof: proof,
        expressSid: req.sessionID, csrfToken: req.session.csrfToken });
      adapter.install(req, result.expressSession);
      const csrfToken = await csrf.publish(req, res);
      // HttpOnly pending transport enables a clean Google redirect. The read
      // endpoint validates this secret against the current sealed DB challenge.
      res.cookie('pending2faChallenge', result.challengeId, { ...cookies, expires: new Date(result.expiresAt) });
      if (redirect) return res.redirect('/login.html?twoFactor=required');
      return res.json({ success: true, requires2FA: true, challengeId: result.challengeId, csrfToken, expiresAt: result.expiresAt });
    }
    const issued = await sessionStore.issueAuthenticatedSession({ authenticationProof: proof, expressSid: req.sessionID });
    return issuedResponse(req, res, issued, redirect);
  }
  router.get('/csrf', wrap(async (req, res) => { const csrfToken = await csrf.publish(req, res); res.json({ success: true, csrfToken }); }));
  router.post('/register', anonymous, csrf.doubleCsrfProtection, json, wrap(async (req, res) => {
    const user = await context.controller.registerUser(req.body);
    await adapter.persistResponse(req, res);
    res.status(201).json({ success: true, user });
  }));
  router.post('/login', anonymous, csrf.doubleCsrfProtection, json, wrap(async (req, res) => {
    A.fields(req.body, ['username', 'email', 'identifier', 'password'], ['password']);
    const identifiers = ['username', 'email', 'identifier'].filter(k => Object.hasOwn(req.body, k));
    if (identifiers.length !== 1 || typeof req.body.password !== 'string' || !req.body.password || Buffer.byteLength(req.body.password) > 72) throw A.fail('INVALID_AUTH_INPUT', 400);
    const handle = await userRepository.findForAuth(req.body[identifiers[0]]);
    if (!handle || handle.user.provider !== 'local') throw A.fail('INVALID_LOGIN', 401);
    if (handle.getAuthState().accountStatus !== 'active' || handle.getAuthState().loginAttempts >= 5) throw A.fail('AUTH_FORBIDDEN', 403);
    if (!await handle.verifyPassword(req.body.password)) {
      await userRepository.incrementLoginAttempts({ authHandle: handle, expectedRowVersion: handle.user.rowVersion });
      throw A.fail('INVALID_LOGIN', 401);
    }
    await firstFactor(req, res, handle, handle.user.twoFAStatus);
  }));
  router.get('/pending-2fa', anonymous, wrap(async (req, res) => {
    const challengeId = readCookies(req.headers.cookie).pending2faChallenge;
    if (typeof challengeId !== 'string') throw A.fail('AUTH_CHALLENGE_INVALID', 401);
    const result = await sessionStore.describePendingAuthentication({ expressSid: req.sessionID, challengeId });
    const csrfToken = await csrf.publish(req, res);
    res.json({ success: true, requires2FA: true, challengeId, csrfToken, expiresAt: result.expiresAt });
  }));
  router.post('/verify-2fa-login', anonymous, csrf.doubleCsrfProtection, json, wrap(async (req, res) => {
    A.fields(req.body, ['challengeId', 'code']);
    const result = await sessionStore.completePendingAuthentication({ expressSid: req.sessionID,
      challengeId: req.body.challengeId, code: req.body.code, csrfToken: req.headers['x-csrf-token'] });
    if (result.authenticated) return issuedResponse(req, res, result);
    if (result.sessionDestroyed) adapter.clearCookies(req, res);
    else { adapter.install(req, result.expressSession); await csrf.publish(req, res); }
    res.status(result.sessionDestroyed ? 429 : 403).json({ success: false, code: result.sessionDestroyed ? 'TOO_MANY_2FA_ATTEMPTS' : 'INVALID_2FA_CODE', remainingAttempts: result.remainingAttempts });
  }));
  router.get('/google', anonymous, wrap(async (req, res) => {
    await adapter.regenerateAnonymous(req);
    const result = await google.begin({ expressSid: req.sessionID, csrfToken: req.session.csrfToken });
    adapter.install(req, result.expressSession); await adapter.persistResponse(req, res);
    res.redirect(result.authorizationUrl);
  }));
  router.get('/google/callback', anonymous, wrap(async (req, res) => {
    // Only Google's code + state are accepted; no body user/profile authority.
    A.fields(req.query, ['state', 'code', 'scope', 'authuser', 'prompt', 'error', 'error_description'], ['state']);
    const consumed = await google.consumeState({ expressSid: req.sessionID, state: req.query.state });
    adapter.install(req, consumed.expressSession);
    if (req.query.error !== undefined) throw A.fail('GOOGLE_PROVIDER_INVALID', 401);
    const verifiedIdentity = await google.verifyCode({ code: req.query.code, consumed });
    const identity = google.identityAuthority.resolve(verifiedIdentity);
    let user = await userRepository.findByGoogleId(identity.googleId);
    if (!user) user = await userRepository.createGoogleUser({ verifiedIdentity, username: 'google_' + randomBytes(8).toString('hex') });
    // Subject lookup first. An email collision never mutates or links an account.
    const proof = await userRepository.findForGoogleAuth({ verifiedIdentity });
    await firstFactor(req, res, proof, user.twoFAStatus, req.accepts(['html', 'json']) !== 'json');
  }));
  router.post('/logout', auth.verifyToken, csrf.doubleCsrfProtection, wrap(async (req, res) => {
    await sessionStore.revokeAuthenticatedSession({ token: req.auth.token, sessionId: req.auth.sessionId });
    adapter.clearCookies(req, res);
    res.json({ success: true });
  }));
  router.get('/check-session', auth.checkSession);
  router.get('/session-info', auth.verifyToken, wrap(async (req, res) => {
    const response = { success: true, isAuthenticated: true, userId: req.auth.principal.userId, expiresAt: req.auth.expiresAt };
    await adapter.persistResponse(req, res); res.json(response);
  }));
  router.post('/refresh-csrf', auth.verifyToken, wrap(async (req, res) => {
    const csrfToken = await csrf.publish(req, res); res.json({ success: true, csrfToken });
  }));
  router.post('/complete-profile', auth.verifyToken, csrf.doubleCsrfProtection, json, wrap(async (req, res) => {
    A.fields(req.body, ['expectedRowVersion', 'username', 'phone'], ['expectedRowVersion']);
    const patch = Object.fromEntries(['username', 'phone'].filter(k => Object.hasOwn(req.body, k)).map(k => [k, req.body[k]]));
    const result = await userRepository.updateProfileAtomic({ principal: req.auth.principal, expectedRowVersion: req.body.expectedRowVersion, patch });
    if (result.requiresReauthentication) adapter.clearCookies(req, res); else await adapter.persistResponse(req, res);
    res.json({ success: true, ...result });
  }));
  router.post('/admin/update-status', auth.verifyToken, auth.checkAdmin, csrf.doubleCsrfProtection, json, wrap(async (req, res) => {
    A.fields(req.body, ['userId', 'newStatus', 'expectedRowVersion']);
    if (!['active', 'suspended'].includes(req.body.newStatus)) throw A.fail('INVALID_AUTH_INPUT', 400);
    const mutate = req.body.newStatus === 'active' ? userRepository.activateAccount : userRepository.suspendAccount;
    const result = await mutate({ principal: req.auth.principal, userId: req.body.userId, expectedRowVersion: req.body.expectedRowVersion });
    if (result.user.id === req.auth.principal.userId) adapter.clearCookies(req, res); else await adapter.persistResponse(req, res);
    res.json({ success: true, user: result.user });
  }));
  router.use(context.errorMiddleware);
  return router;
}
module.exports = { createAuthRouter };
