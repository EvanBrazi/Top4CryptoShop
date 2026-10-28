'use strict';

// Real routes, JWT verification, password comparison, TOTP and Mongoose save hooks.
// Only OAuth transport, rate limiter, process-local store and MongoDB I/O are mocked.
jest.mock('../config/googleAuth', () => ({}));
jest.mock('../node_modules/passport', () => ({
  authenticate: jest.fn(() => (req, res, next) => { if (req.oauthUser) req.user = req.oauthUser; next(); })
}));
jest.mock('../node_modules/express-rate-limit', () => jest.fn(() => (req, res, next) => next()));
jest.mock('../utils/sessionStore', () => ({ activeSessions: new Map(), createSession: jest.fn() }));

const mongoose = require('../node_modules/mongoose');
const jwt = require('../node_modules/jsonwebtoken');
const bcrypt = require('../node_modules/bcryptjs');
const speakeasy = require('../node_modules/speakeasy');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const { activeSessions, createSession } = require('../utils/sessionStore');
const originalSecret = process.env.JWT_SECRET;
const router = require('../routes/auth');
const USER_ID = 'abcdef0123456789abcdef01';
const PASSWORD = 'TestPassword1!';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
let record;

function project(source, projection = {}) {
  if (!source) return null;
  const included = Object.keys(projection).filter(key => projection[key] === 1 && key !== '_id');
  const result = included.length ? { _id: source._id } : { ...source };
  for (const key of included) if (Object.hasOwn(source, key)) result[key] = source[key];
  for (const [key, value] of Object.entries(projection)) if (value === 0) delete result[key];
  return result;
}
function matches(filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '_id') return String(record._id) === String(value);
    if (key === 'username' && value.$regex) return value.$regex.test(record.username);
    return record[key] === value;
  });
}
function request(method, url, { body = {}, cookies = {}, headers = {}, session, oauthUser } = {}) {
  return new Promise((resolve, reject) => {
    const responseCookies = {};
    const responseHeaders = {};
    const req = {
      method, url, originalUrl: `/api/auth${url}`, headers, cookies, body, oauthUser,
      sessionID: 'express-session-must-not-authenticate',
      session: session === undefined ? { userId: 'untrusted-express-user', csrfToken: 'private-csrf',
        secret: 'private-session-data', save: callback => callback() } : session,
      accepts: type => type === 'json'
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      cookie(name, value, options) { responseCookies[name] = { value, options }; return this; },
      setHeader(name, value) { responseHeaders[name.toLowerCase()] = value; return this; },
      json(value) { resolve({ status: this.statusCode, body: JSON.parse(JSON.stringify(value)),
        cookies: responseCookies, headers: responseHeaders }); return this; },
      redirect(url) { resolve({ status: 302, redirect: url, cookies: responseCookies, headers: responseHeaders }); return this; }
    };
    router.handle(req, res, error => error ? reject(error) : resolve({ status: 404 }));
  });
}
async function issue(flow, extraBody = {}) {
  if (flow === 'password') {
    record.twoFAStatus = 'disabled';
    return request('POST', '/login', { body: { username: record.username, password: PASSWORD, ...extraBody } });
  }
  if (flow === 'google') {
    record.provider = 'google';
    return request('GET', '/google/callback', { oauthUser: await User.findById(USER_ID), body: extraBody });
  }
  record.twoFAStatus = 'enabled';
  return request('POST', '/verify-2fa-login', { body: { userId: USER_ID,
    token: speakeasy.totp({ secret: TOTP_SECRET, encoding: 'base32' }), ...extraBody } });
}
function credentials(response) {
  return { session_token: response.cookies.session_token.value, customSessionId: response.cookies.customSessionId.value };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'isolated-auth-issuance-test-secret';
  record = { _id: new mongoose.Types.ObjectId(USER_ID), __v: 0, username: 'JWT_Test_User', email: 'jwt@example.com',
    provider: 'local', password: PASSWORD_HASH, accountStatus: 'active', role: 'user', tokenVersion: 7,
    balance: 100, balanceCents: 10000, loginAttempts: 0, twoFAStatus: 'disabled',
    twoFASecret: TOTP_SECRET, twoFAAttempts: 0, trustedDevices: [], resetPasswordToken: 'private-reset' };
  activeSessions.clear();
  createSession.mockImplementation((id, userId, role, duration = 3600000) => {
    activeSessions.set(id, { userId, role, expiresAt: Date.now() + duration });
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(RevokedToken, 'exists').mockResolvedValue(null);
  jest.spyOn(User.collection, 'findOne').mockImplementation(async (filter, options = {}) => matches(filter) ? project(record, options.projection) : null);
  jest.spyOn(User.collection, 'updateOne').mockImplementation(async (filter, update) => {
    if (!matches(filter)) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    Object.assign(record, update.$set || {});
    for (const [key, value] of Object.entries(update.$inc || {})) record[key] = (record[key] || 0) + value;
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  });
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  activeSessions.clear();
  if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
});

test.each(['password', 'google', '2fa'].flatMap(flow => ['user', 'admin'].map(role => [flow, role])))
('issues %s JWTs with the database tokenVersion for %s accounts and shared auth accepts them', async (flow, role) => {
  record.role = role;
  const response = await issue(flow, { tokenVersion: 999, role: 'moderator' });
  expect(response.status).toBe(flow === 'google' ? 302 : 200);
  const token = response.cookies.session_token.value;
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: ['your-app-api', 'admin-panel'] });
  expect(decoded).toMatchObject({ userId: USER_ID, role, tokenVersion: 7 });
  expect(decoded.exp - decoded.iat).toBe(3600);
  expect(decoded.iss).toBe(flow !== '2fa' && role === 'admin' ? 'admin-panel' : 'your-app-api');
  expect(response.cookies.session_token.options).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  expect(response.cookies.customSessionId.options.httpOnly).toBe(true);
  expect((await request('GET', '/check-session', { cookies: credentials(response) })).body.isAuthenticated).toBe(true);
  expect((await request('GET', '/session-info', { cookies: credentials(response) })).body.userId).toBe(USER_ID);
});

test.each(['password', 'google', '2fa'])('freshly issued %s tokens become stale after the stored version advances', async flow => {
  const response = await issue(flow);
  record.tokenVersion += 1;
  const result = await request('GET', '/session-info', { cookies: credentials(response) });
  expect(result.status).toBe(401);
  expect(result.body.code).toBe('STALE_TOKEN');
});

test.each([0, Number.MAX_SAFE_INTEGER])('preserves the valid stored version %p without inventing a fallback', async version => {
  record.tokenVersion = version;
  const response = await issue('password');
  expect(jwt.verify(response.cookies.session_token.value, process.env.JWT_SECRET).tokenVersion).toBe(version);
  expect((await request('GET', '/session-info', { cookies: credentials(response) })).status).toBe(200);
});

test('session-info rejects anonymous access even with a populated Express session', async () => {
  const result = await request('GET', '/session-info');
  expect(result.status).toBe(401);
  expect(result.body.code).toBe('MISSING_CREDENTIALS');
  expect(result.body).not.toHaveProperty('sessionData');
  expect(result.body).not.toHaveProperty('csrfToken');
  expect(User.collection.findOne).not.toHaveBeenCalled();
});

test('session-info uses authenticated identity and expiry, exposes no credentials, and disables caching', async () => {
  const response = await issue('password');
  const cookieValues = credentials(response);
  activeSessions.get(cookieValues.customSessionId).expiresAt = Date.now() + 60000;
  const result = await request('GET', '/session-info', { cookies: cookieValues });
  expect(result.status).toBe(200);
  expect(result.body).toEqual({ success: true, isAuthenticated: true, userId: USER_ID,
    expiresAt: activeSessions.get(cookieValues.customSessionId).expiresAt });
  expect(result.headers['cache-control']).toBe('no-store');
  for (const field of ['sessionData', 'sessionId', 'csrfToken', 'token', 'tokenVersion', 'password', 'twoFASecret']) {
    expect(result.body).not.toHaveProperty(field);
  }
});

test('session-info does not require or read an Express session when shared credentials are valid', async () => {
  const response = await issue('password');
  const result = await request('GET', '/session-info', { cookies: credentials(response), session: null });
  expect(result.status).toBe(200);
  expect(result.body.userId).toBe(USER_ID);
});

test.each([
  ['missing-version', 401, 'INVALID_TOKEN'],
  ['invalid-signature', 401, 'INVALID_TOKEN'],
  ['inactive-account', 403, 'ACCOUNT_INACTIVE'],
  ['expired-session', 401, 'INVALID_SESSION'],
  ['revoked-token', 401, 'REVOKED_TOKEN'],
  ['database-unavailable', 503, 'AUTH_UNAVAILABLE']
])('session-info applies shared authentication for %s', async (condition, status, code) => {
  const response = await issue('password');
  const cookies = credentials(response);
  if (condition === 'missing-version') cookies.session_token = jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET,
    { algorithm: 'HS256', issuer: 'your-app-api', expiresIn: '1h' });
  if (condition === 'invalid-signature') cookies.session_token = jwt.sign({ userId: USER_ID, tokenVersion: 7 }, 'different-test-secret',
    { algorithm: 'HS256', issuer: 'your-app-api', expiresIn: '1h' });
  if (condition === 'inactive-account') record.accountStatus = 'deactivated';
  if (condition === 'expired-session') activeSessions.get(cookies.customSessionId).expiresAt = Date.now() - 1;
  if (condition === 'revoked-token') RevokedToken.exists.mockResolvedValueOnce({ _id: 'revocation' });
  if (condition === 'database-unavailable') User.collection.findOne.mockRejectedValueOnce(new Error('private database error'));
  const result = await request('GET', '/session-info', { cookies });
  expect(result.status).toBe(status);
  expect(result.body.code).toBe(code);
  expect(JSON.stringify(result.body)).not.toContain('private');
});

test('failed password verification and failed TOTP verification issue no JWT or application session', async () => {
  const badPassword = await issue('password', { password: 'WrongPassword1!' });
  expect(badPassword.status).toBe(401);
  expect(badPassword.cookies.session_token).toBeUndefined();
  const badTotp = await issue('2fa', { token: 'not-a-totp' });
  expect(badTotp.status).toBe(403);
  expect(badTotp.cookies.session_token).toBeUndefined();
  expect(createSession).not.toHaveBeenCalled();
});

test('password login no longer logs bearer tokens or dumps the application-session map', async () => {
  const response = await issue('password');
  const logged = console.log.mock.calls.flat().map(value => String(value)).join(' ');
  expect(logged).not.toContain(response.cookies.session_token.value);
  expect(logged).not.toContain(response.cookies.customSessionId.value);
});
