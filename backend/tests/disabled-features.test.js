'use strict';
// Independent disabled contracts: no PG harness, Mongo models, HTTP listener or SMTP server.
jest.mock('../db/pg', () => {
  const refused = () => { throw new Error('UNIT_DATABASE_ACTIVITY_REFUSED'); };
  const pool = { query: jest.fn(refused), connect: jest.fn(refused) };
  return { getPool: jest.fn(() => pool), closePool: jest.fn(), pool };
});
const net = require('node:net');
const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const database = require('../db/pg');
const MARKER = { unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' };
const MODULES = ['../utils/notifications', '../utils/notifyAdmin', '../utils/cleanupNotifications',
  '../jobs/scheduler', '../utils/backupUsers', '../routes/security', '../controllers/securityController',
  '../routes/icons', '../routes/admin', '../routes/dev', '../socket', '../utils/sessionStore'];
let io;
const hostile = () => new Proxy({}, { get() { throw new Error('DISABLED_INPUT_MUST_NOT_BE_READ'); } });
function response() {
  const res = {};
  res.status = jest.fn(() => res); res.json = jest.fn(() => res);
  return res;
}
function fixedHttp(res) {
  expect(res.status.mock.calls).toEqual([[503]]);
  expect(res.json.mock.calls).toEqual([[MARKER]]);
  expect(Object.isFrozen(res.json.mock.calls[0][0])).toBe(true);
}
function terminal(path) {
  const router = require('../routes/admin');
  return router.stack.find(layer => layer.route?.path === path).route.stack.at(-1).handle;
}
beforeEach(() => {
  jest.clearAllMocks();
  const refused = () => { throw new Error('DISABLED_SIDE_EFFECT_REFUSED'); };
  io = [jest.spyOn(global, 'setInterval'), jest.spyOn(global, 'setTimeout'),
    jest.spyOn(net.Socket.prototype, 'connect'), jest.spyOn(http.Server.prototype, 'listen'),
    jest.spyOn(http, 'request'), jest.spyOn(require('node:https'), 'request'),
    jest.spyOn(fs, 'writeFileSync'), jest.spyOn(fs.promises, 'writeFile'),
    jest.spyOn(crypto, 'randomBytes'), jest.spyOn(console, 'log')];
  for (const spy of io) spy.mockImplementation(refused);
});
afterEach(() => {
  try {
    for (const spy of io) expect(spy).not.toHaveBeenCalled();
    expect(database.getPool).not.toHaveBeenCalled();
    expect(database.pool.query).not.toHaveBeenCalled();
    expect(database.pool.connect).not.toHaveBeenCalled();
  } finally { jest.restoreAllMocks(); }
});

// 12 cold-import cases. Dependencies are loaded inside the isolation as well;
// live PG boundary is mocked, never a removed model. All I/O guards remain active.
test.each(MODULES)('cold import %s is inert without timers connections writes or messages', name => {
  let isolatedDatabase;
  jest.isolateModules(() => {
    isolatedDatabase = require('../db/pg');
    require(name);
  });
  expect(isolatedDatabase.getPool).not.toHaveBeenCalled();
  expect(isolatedDatabase.pool.query).not.toHaveBeenCalled();
  expect(isolatedDatabase.pool.connect).not.toHaveBeenCalled();
  const files = Object.keys(require.cache);
  expect(files.some(file => /\/(models|mongoose)\//.test(file))).toBe(false);
});

// 5 direct security aliases: no authentication bypass or enrollment is added.
test.each(['generateQR', 'verifyToken', 'send2FAKeyByEmail', 'verify2FAFromEmail', 'disable2FA'])(
  'disabled securityController.%s returns frozen 503 without reading secrets or request data', name => {
    const res = response();
    expect(require('../controllers/securityController')[name](hostile(), res)).toBe(res);
    fixedHttp(res);
  });

// 8 disabled function contracts, deliberately separate from the notification PN suite.
test.each(['backupUsers', 'backupUsersToDrive', 'logBackupStatus'])(
  'backupUsers.%s never reads writes uploads or logs and returns the fixed marker', async name => {
    const result = await require('../utils/backupUsers')[name](hostile(), hostile());
    expect(result).toEqual(MARKER); expect(Object.isFrozen(result)).toBe(true);
  });
test('cleanupNotifications does not inspect retention inputs or delete stored notifications', async () => {
  const result = await require('../utils/cleanupNotifications').cleanOldNotifications(hostile());
  expect(result).toEqual(MARKER); expect(Object.isFrozen(result)).toBe(true);
});
test('notifyAdmin ignores financial and generic inputs without storage or dispatch', async () => {
  const { notifyAdmin } = require('../utils/notifyAdmin');
  for (const input of [{ type: 'newPayment', paymentId: 'private-payment' },
    { type: 'newOrder', orderId: 'private-order' }, { type: 'notice', message: 'Generic notice' }, hostile()]) {
    const result = await notifyAdmin(input);
    expect(result).toEqual(MARKER); expect(Object.isFrozen(result)).toBe(true);
  }
});
test('scheduler repeated starts cannot register cron work timers or callbacks', () => {
  const { startScheduler } = require('../jobs/scheduler');
  const callback = jest.fn();
  const first = startScheduler(callback, hostile()), second = startScheduler(callback, hostile());
  expect(first).toEqual(MARKER); expect(second).toBe(first); expect(Object.isFrozen(first)).toBe(true);
  expect(callback).not.toHaveBeenCalled();
});
test('old socket setup never registers listeners opens a connection or sends to clients', () => {
  const session = require('../utils/sessionStore'), socket = require('../socket');
  const client = { send: jest.fn(), close: jest.fn() };
  const server = { on: jest.fn(), once: jest.fn(), addListener: jest.fn(), listen: jest.fn(), clients: new Set([client]) };
  const result = socket.setupWebSocket(server, hostile());
  expect(result).toEqual(MARKER); expect(Object.isFrozen(result)).toBe(true);
  expect(socket.activeSessions).toBe(session.activeSessions);
  for (const spy of [server.on, server.once, server.addListener, server.listen, client.send, client.close]) {
    expect(spy).not.toHaveBeenCalled();
  }
});
test('old session store is a frozen compatibility marker not a mutable Map or an expiry authority', () => {
  const { activeSessions, createSession } = require('../utils/sessionStore');
  expect(activeSessions).toEqual(MARKER); expect(Object.isFrozen(activeSessions)).toBe(true);
  expect(activeSessions).not.toBeInstanceOf(Map);
  expect(activeSessions.set).toBeUndefined(); expect(activeSessions.get).toBeUndefined();
  const before = Reflect.ownKeys(activeSessions);
  expect(createSession(hostile(), hostile())).toBe(activeSessions);
  expect(createSession('asserted-admin', { role: 'admin', tokenVersion: 999 })).toBe(activeSessions);
  expect(Reflect.ownKeys(activeSessions)).toEqual(before);
});

// 5 router terminal contracts. Direct routers differ from createApplication's
// FEATURE_UNAVAILABLE prefix; no listener or fake authenticated router is created.
test.each(['security', 'icons', 'dev'])('isolated %s router preserves migration 503 for every method including HEAD and OPTIONS', name => {
  const router = require('../routes/' + name);
  for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
    const res = response(), next = jest.fn();
    router.handle({ method, url: '/nested', originalUrl: '/nested', headers: {} }, res, next);
    fixedHttp(res); expect(next).not.toHaveBeenCalled();
  }
});
test.each(['/users', '/panel'])('guarded legacy admin %s terminal handler is migration-unavailable rather than a listing or page', path => {
  const res = response();
  terminal(path)(hostile(), res);
  fixedHttp(res);
});

// 3 legacy admin-specific validation/guard obligations. These are handler-level
// units, not claims that authentication was executed; application auth stays PG-tested.
test('legacy admin balance terminal handler preserves valid-input FINANCIAL_UNAVAILABLE without writes', () => {
  const handler = terminal('/update-balance/:userId');
  for (const body of [{ balance: 0 }, { balance: 10, expectedBalance: 100 }, { balance: Number.MAX_SAFE_INTEGER }]) {
    const res = response(); handler({ body }, res);
    expect(res.status.mock.calls).toEqual([[503]]);
    expect(res.json.mock.calls).toEqual([[{ success: false, code: 'FINANCIAL_UNAVAILABLE',
      error: 'Balance adjustments are disabled until the financial service is available' }]]);
  }
});
test('legacy admin balance terminal handler retains strict body types bounds and allowlist', () => {
  const handler = terminal('/update-balance/:userId');
  for (const body of [undefined, null, [], 10, {}, { balance: '10' }, { balance: NaN }, { balance: Infinity },
    { balance: -1 }, { balance: Number.MAX_SAFE_INTEGER + 1 }, { balance: 10, expectedBalance: '100' },
    { balance: 10, expectedBalance: -1 }, { balance: 10, role: 'admin' }]) {
    const res = response(); handler({ body }, res);
    expect(res.status.mock.calls).toEqual([[400]]);
    expect(res.json.mock.calls).toEqual([[{ success: false, error: 'Invalid balance adjustment fields or values' }]]);
  }
});
test('legacy admin router retains real authentication admin authorization ownership and CSRF guards', () => {
  jest.isolateModules(() => {
    const auth = require('../middlewares/auth');
    const ownership = jest.spyOn(auth, 'requireSelfOrAdmin'); // observe the real factory, do not replace it
    const router = require('../routes/admin');
    const { doubleCsrfProtection } = require('../middlewares/csrfMiddleware');
    const middleware = router.stack.filter(layer => !layer.route).map(layer => layer.handle);
    expect(middleware).toEqual([auth.verifyToken, auth.checkAdmin]);
    expect(ownership.mock.calls).toEqual([['userId']]);
    const balance = router.stack.find(layer => layer.route?.path === '/update-balance/:userId').route;
    expect(balance.methods).toEqual({ put: true });
    expect(balance.stack).toHaveLength(3);
    expect(balance.stack[0].handle).toBe(ownership.mock.results[0].value);
    expect(balance.stack[1].handle).toBe(doubleCsrfProtection);
  });
});
