/** Unported users/admin route fixtures pin the legacy test-only auth adapter.
 * Current shared authentication is verified separately through real HTTP/PostgreSQL.
 * Real legacy model hooks; mocked MongoDB/upload storage; no network connections. */
jest.mock('../middlewares/auth', () => jest.requireActual('./helpers/legacyMongoAuth'));
jest.mock('../middlewares/csrfMiddleware', () => jest.requireActual('./helpers/legacyCsrf'));
jest.mock('../utils/sessionStore', () => ({ activeSessions: new Map() }));
jest.mock('../config/cloudinary', () => ({ uploader: { destroy: jest.fn().mockResolvedValue({ result: 'ok' }) } }));
jest.mock('../middlewares/upload', () => ({
  single: jest.fn(() => jest.fn((req, res, next) => {
    if (req.headers['x-test-upload'] === 'yes') {
      req.file = {
        filename: 'payments_receipts/test-avatar',
        path: 'https://res.cloudinary.com/test-cloud/image/upload/v1/payments_receipts/test-avatar.jpg'
      };
    }
    next();
  }))
}));

const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const mongoose = require('../node_modules/mongoose');
const bcrypt = require('../node_modules/bcryptjs');
const jwt = require('../node_modules/jsonwebtoken');
const { activeSessions } = require('../utils/sessionStore');
const cloudinary = require('../config/cloudinary');
const upload = require('../middlewares/upload');
// Historical pre-C1 contracts only; current routes use users-server.pg.test.js.
const usersRouter = require('./helpers/legacyUsersRoutes');
const adminRouter = require('../routes/admin');
const avatarUpload = upload.single.mock.results[0].value;

const OWNER = 'abcdef0123456789abcdef01';
const OTHER = 'abcdef0123456789abcdef02';
const ADMIN = 'abcdef0123456789abcdef03';
const MISSING = 'abcdef0123456789abcdef04';
const OLD_PASSWORD = 'OriginalPassword1!';
const OLD_HASH = bcrypt.hashSync(OLD_PASSWORD, 4);
const originalSecret = process.env.JWT_SECRET;
const originalCloudName = process.env.CLOUDINARY_NAME;
let records;

function copy(record) { return record ? { ...record } : null; }
function project(record, projection = {}) {
  if (!record) return null;
  const included = Object.keys(projection).filter(key => projection[key] === 1 && key !== '_id');
  const result = included.length ? { _id: record._id } : copy(record);
  for (const key of included) if (Object.hasOwn(record, key)) result[key] = record[key];
  for (const [key, value] of Object.entries(projection)) if (value === 0) delete result[key];
  return result;
}
function matches(record, filter) {
  return !!record && Object.entries(filter).every(([key, value]) =>
    key === '_id' ? String(record._id) === String(value) : record[key] === value);
}
function applyUpdate(record, update) {
  Object.assign(record, update.$set || {});
  for (const [key, value] of Object.entries(update.$inc || {})) record[key] = (record[key] || 0) + value;
  for (const key of Object.keys(update.$unset || {})) delete record[key];
}
function token(userId) {
  return jwt.sign({ userId, tokenVersion: 1, role: 'admin' }, process.env.JWT_SECRET,
    { algorithm: 'HS256', issuer: 'your-app-api', expiresIn: '1h' });
}
function request(router, method, url, { actor = OWNER, body = {}, csrf = true, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      method, url, originalUrl: `/api/${router === usersRouter ? 'users' : 'admin'}${url}`,
      headers: { ...(actor ? { authorization: `Bearer ${token(actor)}`, 'x-session-id': `session-${actor}` } : {}),
        ...(csrf ? { 'x-csrf-token': 'test-csrf' } : {}), ...headers },
      cookies: {}, body, session: { csrfToken: 'test-csrf' }
    };
    const res = {
      statusCode: 200,
      status(value) { this.statusCode = value; return this; },
      json(value) { resolve({ status: this.statusCode, body: JSON.parse(JSON.stringify(value)) }); return this; },
      redirect(value) { resolve({ status: 302, redirect: value }); return this; },
      sendFile(value) { resolve({ status: this.statusCode, file: value }); return this; }
    };
    router.handle(req, res, err => err ? reject(err) : resolve({ status: 404 }));
  });
}
function writes() {
  return User.collection.updateOne.mock.calls.length + User.collection.findOneAndUpdate.mock.calls.length +
    User.collection.findOneAndDelete.mock.calls.length;
}
function assertNoSecrets(record) {
  for (const field of ['password', 'twoFASecret', 'trustedDevices', 'resetPasswordToken', 'resetPasswordExpires', 'tokenVersion', '__v']) {
    expect(record).not.toHaveProperty(field);
  }
}

beforeAll(() => {
  process.env.JWT_SECRET = 'isolated-route-regression-test-secret';
  process.env.CLOUDINARY_NAME = 'test-cloud';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(RevokedToken, 'exists').mockResolvedValue(null);
  jest.spyOn(User.collection, 'findOne').mockImplementation(async (filter, options = {}) => {
    const record = records.get(String(filter._id));
    return matches(record, filter) ? project(record, options.projection) : null;
  });
  jest.spyOn(User.collection, 'find').mockImplementation((filter, options = {}) => ({
    toArray: async () => [...records.values()].map(record => project(record, options.projection))
  }));
  jest.spyOn(User.collection, 'updateOne').mockImplementation(async (filter, update) => {
    const record = records.get(String(filter._id));
    if (!matches(record, filter)) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    applyUpdate(record, update);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  });
  jest.spyOn(User.collection, 'findOneAndUpdate').mockImplementation(async (filter, update, options = {}) => {
    const record = records.get(String(filter._id));
    if (!matches(record, filter)) return null;
    applyUpdate(record, update);
    return project(record, options.projection);
  });
  jest.spyOn(User.collection, 'findOneAndDelete').mockImplementation(async filter => {
    const record = records.get(String(filter._id));
    if (!matches(record, filter)) return null;
    records.delete(String(filter._id));
    return copy(record);
  });
});
beforeEach(() => {
  jest.clearAllMocks();
  records = new Map([OWNER, OTHER, ADMIN].map((id, index) => [id, {
    _id: new mongoose.Types.ObjectId(id), __v: 0, username: `Test_User_${index}`, email: `test${index}@example.com`,
    provider: 'local', password: OLD_HASH, role: id === ADMIN ? 'admin' : 'user', accountStatus: 'active',
    tokenVersion: 1, balance: 100, theme: 0, avatar: '', loginAttempts: 0,
    twoFASecret: 'private-secret', trustedDevices: [{ deviceId: 'private-device' }],
    resetPasswordToken: 'private-reset', resetPasswordExpires: new Date()
  }]));
  activeSessions.clear();
  for (const id of records.keys()) {
    activeSessions.set(`session-${id}`, { userId: id, role: 'admin', expiresAt: Date.now() + 3600000 });
    activeSessions.set(`extra-${id}`, { userId: id.toUpperCase(), expiresAt: Date.now() + 3600000 });
  }
});
afterAll(() => {
  jest.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
  if (originalCloudName === undefined) delete process.env.CLOUDINARY_NAME; else process.env.CLOUDINARY_NAME = originalCloudName;
  activeSessions.clear();
});

test.each([[usersRouter, '/'], [adminRouter, '/users'], [adminRouter, '/panel']])('listing/panel requires authentication', async (router, path) => {
  expect((await request(router, 'GET', path, { actor: null })).status).toBe(401);
  expect(User.collection.find).not.toHaveBeenCalled();
});
test.each([[usersRouter, '/'], [adminRouter, '/users'], [adminRouter, '/panel']])('listing/panel ignores forged token and session admin roles', async (router, path) => {
  expect((await request(router, 'GET', path)).status).toBe(403);
  expect(User.collection.find).not.toHaveBeenCalled();
});
test('admin listing uses safe projections and admin panel remains accessible', async () => {
  const users = await request(usersRouter, 'GET', '/', { actor: ADMIN });
  expect(users.status).toBe(200);
  users.body.forEach(assertNoSecrets);
  const admins = await request(adminRouter, 'GET', '/users', { actor: ADMIN });
  expect(admins.status).toBe(200);
  admins.body.users.forEach(assertNoSecrets);
  expect((await request(adminRouter, 'GET', '/panel', { actor: ADMIN })).file).toMatch(/admin\.html$/);
});
test.each([`/${OTHER}`, `/${OTHER}/balance`])('individual user and balance reads enforce ownership: %s', async path => {
  expect((await request(usersRouter, 'GET', path)).status).toBe(403);
  expect((await request(usersRouter, 'GET', path, { actor: ADMIN })).status).toBe(200);
});
test('owner can read their profile/balance and /me without secrets', async () => {
  for (const path of ['/me', `/${OWNER}`, `/${OWNER}/balance`]) {
    const result = await request(usersRouter, 'GET', path);
    expect(result.status).toBe(200);
    assertNoSecrets(result.body);
  }
});

const profileMutations = [
  ['PUT', `/${OTHER}`, { username: 'Changed_Name' }],
  ['PUT', `/${OTHER}/theme`, { theme: 1 }],
  ['POST', `/${OTHER}/avatar`, {}],
  ['POST', `/${OTHER}/avatar/remove`, {}]
];
test.each(profileMutations)('ordinary users cannot mutate another profile: %s %s', async (method, path, body) => {
  expect((await request(usersRouter, method, path, { body, headers: { 'x-test-upload': 'yes' } })).status).toBe(403);
  expect(writes()).toBe(0);
  expect(avatarUpload).not.toHaveBeenCalled();
});
test.each(profileMutations)('admins have no cross-user profile mutation exception: %s %s', async (method, path, body) => {
  expect((await request(usersRouter, method, path, { actor: ADMIN, body, headers: { 'x-test-upload': 'yes' } })).status).toBe(403);
  expect(writes()).toBe(0);
  expect(avatarUpload).not.toHaveBeenCalled();
});
test.each(['balance', 'role', 'accountStatus', 'tokenVersion', 'provider', 'googleId', 'twoFASecret', 'twoFAStatus', 'trustedDevices', 'resetPasswordToken', 'loginAttempts', 'avatar', 'unexpected'])('profile rejects forbidden/unknown field %s', async field => {
  const result = await request(usersRouter, 'PUT', `/${OWNER}`, { body: { username: 'Valid_Name', [field]: 'injected' } });
  expect(result.status).toBe(400);
  expect(writes()).toBe(0);
  expect(records.get(OWNER).username).toBe('Test_User_0');
});
test.each([null, [], {}, 'invalid'])('profile rejects malformed or empty bodies: %p', async body => {
  expect((await request(usersRouter, 'PUT', `/${OWNER}`, { body })).status).toBe(400);
  expect(writes()).toBe(0);
});
test('allowed profile fields save without touching financial/security fields or rehashing', async () => {
  const result = await request(usersRouter, 'PUT', `/${OWNER}`, { body: { username: 'New_Name', email: 'NEW@EXAMPLE.COM', phone: '+14155552671', theme: 1 } });
  expect(result.status).toBe(200);
  expect(records.get(OWNER)).toMatchObject({ username: 'New_Name', email: 'new@example.com', theme: 1, balance: 100, role: 'user', tokenVersion: 1, password: OLD_HASH });
  expect(activeSessions.has(`session-${OWNER}`)).toBe(true);
  assertNoSecrets(result.body.user);
});
test('password change uses the real hashing hook, increments version and invalidates only owner sessions', async () => {
  const password = 'UpdatedPassword2!';
  const result = await request(usersRouter, 'PUT', `/${OWNER}`, { body: { currentPassword: OLD_PASSWORD, password } });
  expect(result.status).toBe(200);
  expect(result.body.requiresReauthentication).toBe(true);
  expect(records.get(OWNER).password).not.toBe(password);
  expect(records.get(OWNER).password).toMatch(/^\$2[aby]\$12\$/);
  expect(await bcrypt.compare(password, records.get(OWNER).password)).toBe(true);
  expect(records.get(OWNER).tokenVersion).toBe(2);
  expect(records.get(ADMIN).tokenVersion).toBe(1);
  expect(activeSessions.has(`session-${OWNER}`)).toBe(false);
  expect(activeSessions.has(`extra-${OWNER}`)).toBe(false);
  expect(activeSessions.has(`session-${ADMIN}`)).toBe(true);
  expect(activeSessions.has(`session-${OTHER}`)).toBe(true);
  assertNoSecrets(result.body.user);
});
test.each([
  [{ password: 'UpdatedPassword2!' }, 400],
  [{ password: 'UpdatedPassword2!', currentPassword: 'wrong' }, 403],
  [{ password: 'weak', currentPassword: OLD_PASSWORD }, 400],
  [{ currentPassword: OLD_PASSWORD }, 400],
  [{ password: '', currentPassword: OLD_PASSWORD }, 400]
])('invalid password changes fail without writes: %p', async (body, status) => {
  expect((await request(usersRouter, 'PUT', `/${OWNER}`, { body })).status).toBe(status);
  expect(writes()).toBe(0);
  expect(records.get(OWNER).password).toBe(OLD_HASH);
});
test('Google users cannot use local password update', async () => {
  records.get(OWNER).provider = 'google';
  expect((await request(usersRouter, 'PUT', `/${OWNER}`, { body: { password: 'UpdatedPassword2!', currentPassword: OLD_PASSWORD } })).status).toBe(403);
  expect(writes()).toBe(0);
});
test('failed concurrent password save does not invalidate sessions or persist plaintext', async () => {
  User.collection.updateOne.mockResolvedValueOnce({ acknowledged: true, matchedCount: 0, modifiedCount: 0 });
  expect((await request(usersRouter, 'PUT', `/${OWNER}`, { body: { password: 'UpdatedPassword2!', currentPassword: OLD_PASSWORD } })).status).toBe(409);
  expect(records.get(OWNER).password).toBe(OLD_HASH);
  expect(activeSessions.has(`session-${OWNER}`)).toBe(true);
});

const csrfMutations = [
  [usersRouter, 'PUT', `/${OWNER}`, { username: 'New_Name' }, OWNER],
  [usersRouter, 'PUT', `/${OWNER}/theme`, { theme: 1 }, OWNER],
  [usersRouter, 'POST', `/${OWNER}/avatar`, {}, OWNER],
  [usersRouter, 'POST', `/${OWNER}/avatar/remove`, {}, OWNER],
  [usersRouter, 'PUT', `/${OTHER}/activate`, {}, ADMIN],
  [usersRouter, 'DELETE', `/${OTHER}`, {}, ADMIN],
  [usersRouter, 'PUT', `/${OTHER}/balance`, { balance: 10 }, ADMIN],
  [adminRouter, 'PUT', `/update-balance/${OTHER}`, { balance: 10 }, ADMIN]
];
test.each(csrfMutations)('mutation requires CSRF: %s %s %s', async (router, method, path, body, actor) => {
  expect((await request(router, method, path, { actor, body, csrf: false })).status).toBe(403);
  expect(writes()).toBe(0);
  expect(avatarUpload).not.toHaveBeenCalled();
});
test('theme has its own strict allowlist and only writes theme', async () => {
  expect((await request(usersRouter, 'PUT', `/${OWNER}/theme`, { body: { theme: 1, balance: 999 } })).status).toBe(400);
  expect((await request(usersRouter, 'PUT', `/${OWNER}/theme`, { body: null })).status).toBe(400);
  expect(writes()).toBe(0);
  expect((await request(usersRouter, 'PUT', `/${OWNER}/theme`, { body: { theme: 1 } })).status).toBe(200);
  expect(records.get(OWNER)).toMatchObject({ theme: 1, balance: 100, tokenVersion: 1 });
  expect(User.collection.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ accountStatus: 'active', tokenVersion: 1 });
});
test('avatar upload only accepts the uploaded file and cleans up rejected uploads', async () => {
  const rejected = await request(usersRouter, 'POST', `/${OWNER}/avatar`, { body: { role: 'admin' }, headers: { 'x-test-upload': 'yes' } });
  expect(rejected.status).toBe(400);
  expect(writes()).toBe(0);
  expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('payments_receipts/test-avatar');
  expect((await request(usersRouter, 'POST', `/${OWNER}/avatar`)).status).toBe(400);
  const allowed = await request(usersRouter, 'POST', `/${OWNER}/avatar`, { headers: { 'x-test-upload': 'yes' } });
  expect(allowed.status).toBe(200);
  expect(records.get(OWNER)).toMatchObject({ avatar: allowed.body.avatar, balance: 100, role: 'user', tokenVersion: 1 });
});
test('avatar removal rejects extra fields and deletes only an asset from this cloud account', async () => {
  records.get(OWNER).avatar = 'https://res.cloudinary.com/test-cloud/image/upload/v1/payments_receipts/old-avatar.jpg';
  expect((await request(usersRouter, 'POST', `/${OWNER}/avatar/remove`, { body: { avatar: 'injected' } })).status).toBe(400);
  expect(writes()).toBe(0);
  expect((await request(usersRouter, 'POST', `/${OWNER}/avatar/remove`)).status).toBe(200);
  expect(records.get(OWNER).avatar).toBe('');
  expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('payments_receipts/old-avatar');
});
test('avatar removal does not delete assets from a different cloud account', async () => {
  records.get(OWNER).avatar = 'https://res.cloudinary.com/another-cloud/image/upload/v1/payments_receipts/other-avatar.jpg';
  expect((await request(usersRouter, 'POST', `/${OWNER}/avatar/remove`)).status).toBe(200);
  expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
});

test.each([['DELETE', `/${OTHER}`], ['PUT', `/${OTHER}/activate`], ['PUT', `/${OWNER}/balance`]])('account operations and adjustments are admin-only: %s %s', async (method, path) => {
  expect((await request(usersRouter, method, path, { body: { balance: 10 } })).status).toBe(403);
  expect(writes()).toBe(0);
});
test('activation is allowlisted, increments the target version and clears only target sessions', async () => {
  records.get(OTHER).accountStatus = 'suspended';
  expect((await request(usersRouter, 'PUT', `/${OTHER}/activate`, { actor: ADMIN, body: { role: 'admin' } })).status).toBe(400);
  expect(writes()).toBe(0);
  expect((await request(usersRouter, 'PUT', `/${OTHER}/activate`, { actor: ADMIN })).status).toBe(200);
  expect(records.get(OTHER)).toMatchObject({ accountStatus: 'active', role: 'user', tokenVersion: 2, loginAttempts: 0 });
  expect(activeSessions.has(`session-${OTHER}`)).toBe(false);
  expect(activeSessions.has(`extra-${OTHER}`)).toBe(false);
  expect(activeSessions.has(`session-${ADMIN}`)).toBe(true);
});
test('deletion is allowlisted and clears only deleted user sessions', async () => {
  expect((await request(usersRouter, 'DELETE', `/${OTHER}`, { actor: ADMIN, body: { balance: 0 } })).status).toBe(400);
  expect(writes()).toBe(0);
  expect((await request(usersRouter, 'DELETE', `/${OTHER}`, { actor: ADMIN })).status).toBe(200);
  expect(records.has(OTHER)).toBe(false);
  expect(activeSessions.has(`session-${OTHER}`)).toBe(false);
  expect(activeSessions.has(`extra-${OTHER}`)).toBe(false);
  expect(activeSessions.has(`session-${ADMIN}`)).toBe(true);
});
test('nonexistent account operations return 404 and leave sessions unchanged', async () => {
  for (const [method, path] of [['DELETE', `/${MISSING}`], ['PUT', `/${MISSING}/activate`]]) {
    expect((await request(usersRouter, method, path, { actor: ADMIN })).status).toBe(404);
  }
  expect(activeSessions.size).toBe(6);
});
test.each([
  [usersRouter, 'DELETE', '/not-an-id'], [usersRouter, 'PUT', '/not-an-id/activate'],
  [usersRouter, 'PUT', '/not-an-id/balance'], [usersRouter, 'GET', '/not-an-id/balance'],
  [adminRouter, 'PUT', '/update-balance/not-an-id']
])('target IDs are validated before database operations: %s %s %s', async (router, method, path) => {
  expect((await request(router, method, path, { actor: ADMIN, body: { balance: 10 } })).status).toBe(400);
  expect(writes()).toBe(0);
  expect(User.collection.findOne).toHaveBeenCalledTimes(1); // Authentication only.
});

const balanceRoutes = [[usersRouter, `/${OTHER}/balance`], [adminRouter, `/update-balance/${OTHER}`]];
test.each(balanceRoutes)('valid admin adjustments fail closed without balance or token version writes', async (router, path) => {
  const result = await request(router, 'PUT', path, { actor: ADMIN, body: { balance: 10, expectedBalance: 100 } });
  expect(result.status).toBe(503);
  expect(result.body.code).toBe('FINANCIAL_UNAVAILABLE');
  expect(writes()).toBe(0);
  expect(records.get(OTHER)).toMatchObject({ balance: 100, tokenVersion: 1 });
  expect(records.get(ADMIN).tokenVersion).toBe(1);
});
test.each(balanceRoutes)('non-admin adjustments are forbidden', async (router, path) => {
  expect((await request(router, 'PUT', path, { body: { balance: 10 } })).status).toBe(403);
  expect(writes()).toBe(0);
});
test.each(balanceRoutes)('adjustment bodies have strict types, bounds and allowlists', async (router, path) => {
  for (const body of [null, [], {}, { balance: '10' }, { balance: -1 }, { balance: Infinity }, { balance: NaN },
    { balance: Number.MAX_SAFE_INTEGER + 1 }, { balance: 10, expectedBalance: '100' },
    { balance: 10, role: 'admin' }, { balance: 10, tokenVersion: 999 }]) {
    expect((await request(router, 'PUT', path, { actor: ADMIN, body })).status).toBe(400);
  }
  expect(writes()).toBe(0);
});
test.each(['reserve', 'restore'])('disabled %s returns 410 for every method without auth/database/storage effects', async endpoint => {
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const result = await request(usersRouter, method, `/${OWNER}/${endpoint}`, { actor: null, body: { amount: 50 } });
    expect(result.status).toBe(410);
    expect(result.body.code).toBe('ENDPOINT_DISABLED');
  }
  expect(User.collection.findOne).not.toHaveBeenCalled();
  expect(writes()).toBe(0);
  expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
  expect(records.get(OWNER).balance).toBe(100);
});
test('stale token and inactive account checks remain shared across both routers', async () => {
  records.get(OWNER).tokenVersion = 2;
  expect((await request(usersRouter, 'GET', '/me')).status).toBe(401);
  records.get(ADMIN).accountStatus = 'suspended';
  expect((await request(adminRouter, 'GET', '/users', { actor: ADMIN })).status).toBe(403);
});
