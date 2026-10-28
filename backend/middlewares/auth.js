/** Shared HTTP/WebSocket credentials and resource authorization. */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const { activeSessions } = require('../utils/sessionStore');

class AuthError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Upgrade requests do not pass through Express cookie-parser.
function readCookies(header = '') {
  const cookies = Object.create(null);
  if (typeof header !== 'string') throw new AuthError(401, 'INVALID_COOKIE', 'Invalid cookie header');
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    try {
      cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    } catch (_) { /* Malformed cookie values cannot authenticate a request. */ }
  }
  return cookies;
}

function extractCredentials(req) {
  const headers = req.headers || {};
  const cookies = req.cookies || readCookies(headers.cookie);
  let token = cookies.session_token;
  if (headers.authorization !== undefined) {
    const match = typeof headers.authorization === 'string' && /^Bearer ([^\s]+)$/i.exec(headers.authorization);
    if (!match) throw new AuthError(401, 'INVALID_AUTHORIZATION', 'Invalid authorization header');
    token = match[1];
  }
  // The opaque application customSessionId is NOT the Express sessionId.
  const sessionId = headers['x-session-id'] !== undefined ? headers['x-session-id'] : cookies.customSessionId;
  return validateCredentials({ token, sessionId });
}

function validateCredentials(credentials) {
  const { token, sessionId } = credentials || {};
  if (typeof token !== 'string' || typeof sessionId !== 'string' || !token || !sessionId) {
    throw new AuthError(401, 'MISSING_CREDENTIALS', 'Authentication is required');
  }
  if (/\s/.test(token) || /\s/.test(sessionId)) {
    throw new AuthError(401, 'INVALID_CREDENTIALS', 'Invalid authentication credentials');
  }
  return { token, sessionId };
}

async function authenticateCredentials(credentials) {
  const { token, sessionId } = validateCredentials(credentials);
  if (!process.env.JWT_SECRET) throw new AuthError(503, 'AUTH_UNAVAILABLE', 'Authentication unavailable');
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'], issuer: ['your-app-api', 'admin-panel']
    });
  } catch (_) {
    throw new AuthError(401, 'INVALID_TOKEN', 'Invalid or expired token');
  }
  if (!decoded || typeof decoded.userId !== 'string' || !/^[a-f\d]{24}$/i.test(decoded.userId) ||
      !Number.isSafeInteger(decoded.tokenVersion) || decoded.tokenVersion < 0 ||
      !Number.isSafeInteger(decoded.exp) || decoded.exp <= 0 || decoded.exp > Number.MAX_SAFE_INTEGER / 1000) {
    throw new AuthError(401, 'INVALID_TOKEN', 'Invalid token claims');
  }
  const userId = decoded.userId.toLowerCase();
  const now = Date.now();
  const session = activeSessions.get(sessionId);
  if (!session || String(session.userId).toLowerCase() !== userId ||
      !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= now) {
    if (session && (!Number.isSafeInteger(session.expiresAt) || session.expiresAt <= now)) activeSessions.delete(sessionId);
    throw new AuthError(401, 'INVALID_SESSION', 'Invalid or expired session');
  }
  if (await RevokedToken.exists({ token })) {
    throw new AuthError(401, 'REVOKED_TOKEN', 'Session has been revoked');
  }
  const user = await User.findById(userId).select('-password -twoFASecret -trustedDevices -resetPasswordToken -resetPasswordExpires');
  if (!user) throw new AuthError(401, 'INVALID_SESSION', 'User no longer exists');
  if (user.accountStatus !== 'active') throw new AuthError(403, 'ACCOUNT_INACTIVE', 'Account is inactive');
  if (decoded.tokenVersion !== user.tokenVersion) throw new AuthError(401, 'STALE_TOKEN', 'Please sign in again');
  // Role always comes from the database, never from token/session role claims.
  return { user, token, sessionId, expiresAt: Math.min(session.expiresAt, decoded.exp * 1000) };
}

async function authenticateRequest(req) {
  return authenticateCredentials(extractCredentials(req));
}

function deny(req, res, status, code, message) {
  const api = /^\/(?:api|dev)(?:\/|$)/.test(req.originalUrl || req.url || '');
  if (!api && req.accepts && req.accepts('html')) return res.redirect('/401.html');
  return res.status(status).json({ success: false, error: message, code });
}

async function verifyToken(req, res, next) {
  try {
    req.auth = await authenticateRequest(req);
    req.user = req.auth.user;
    return next();
  } catch (err) {
    if (err instanceof AuthError) return deny(req, res, err.status, err.code, err.message);
    return res.status(503).json({ success: false, code: 'AUTH_UNAVAILABLE', error: 'Authentication unavailable' });
  }
}

const requireRole = (roles = []) => (req, res, next) => {
  if (!req.user) return deny(req, res, 401, 'UNAUTHENTICATED', 'Authentication is required');
  if (!roles.includes(req.user.role)) return deny(req, res, 403, 'FORBIDDEN', 'Insufficient permissions');
  return next();
};
const checkAdmin = requireRole(['admin']);

const requireOwnership = (param = 'id', allowAdmin = false) => (req, res, next) => {
  if (!req.user) return deny(req, res, 401, 'UNAUTHENTICATED', 'Authentication is required');
  const id = req.params[param];
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
    return res.status(400).json({ success: false, code: 'INVALID_USER_ID', error: 'Invalid user ID' });
  }
  if (id.toLowerCase() !== String(req.user._id).toLowerCase() && !(allowAdmin && req.user.role === 'admin')) {
    return deny(req, res, 403, 'FORBIDDEN', 'Access to this user is not permitted');
  }
  return next();
};
const requireSelf = (param = 'id') => requireOwnership(param);
const requireSelfOrAdmin = (param = 'id') => requireOwnership(param, true);

const checkSession = (req, res) => verifyToken(req, res, () => res.json({
  success: true, isAuthenticated: true,
  user: {
    id: req.user._id, username: req.user.username, phone: req.user.phone,
    theme: req.user.theme, balance: req.user.balance, role: req.user.role
  }
}));

module.exports = {
  AuthError, extractCredentials, authenticateCredentials, authenticateRequest,
  verifyToken, checkAdmin, requireRole, requireSelf, requireSelfOrAdmin, checkSession
};
