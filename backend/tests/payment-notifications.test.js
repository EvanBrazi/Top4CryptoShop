'use strict';
// C3.2d1: PN-001..PN-023 retained as portable disabled contracts, plus one
// frozen/uniform-result gap. No removed models, real sockets or listeners.
jest.mock('../db/pg', () => {
  const refused = () => { throw new Error('UNIT_DATABASE_ACTIVITY_REFUSED'); };
  const pool = { query: jest.fn(refused), connect: jest.fn(refused) };
  return { getPool: jest.fn(() => pool), pool };
});
const database = require('../db/pg');
const notifications = require('../utils/notifications');
const MARKER = { unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' };
let server, socket, queue, readClients, readQueue;

beforeEach(() => {
  jest.clearAllMocks();
  socket = { readyState: 1, send: jest.fn(), on: jest.fn(), once: jest.fn(), addListener: jest.fn(), close: jest.fn() };
  queue = [];
  readClients = jest.fn(() => new Set([socket])); readQueue = jest.fn(() => queue);
  server = { on: jest.fn(), once: jest.fn(), addListener: jest.fn() };
  Object.defineProperties(server, { clients: { get: readClients }, pendingNotifications: { get: readQueue } });
});
afterEach(() => {
  for (const spy of [database.getPool, database.pool.query, database.pool.connect,
    server.on, server.once, server.addListener, socket.on, socket.once, socket.addListener,
    socket.send, socket.close, readClients, readQueue]) expect(spy).not.toHaveBeenCalled();
  for (const entry of queue) expect(entry.save).not.toHaveBeenCalled();
});
function fixed(value) { expect(value).toEqual(MARKER); }
function initialize(role) {
  // Client assertions are inert inputs, not verified authentication. There is
  // deliberately no listener to invoke and no synthetic connection/message event.
  return notifications.initNotifications(server, { type: 'auth', role, userId: 'unverified-client-identity' });
}
function queued(type, payload) {
  const entry = { type, payload, save: jest.fn() };
  queue.push(entry); return entry;
}

// PN-001..PN-005
test.each(['newPayment', 'paymentAccepted', 'paymentRejected', 'paymentStatus', 'PAYMENT'])(
  'direct %s returns unavailable without sending queueing or database access', async type => {
    fixed(initialize('user'));
    fixed(await notifications.notify({ type, paymentId: 'private-payment' }, 'user', 'unverified-client-identity'));
  });
// PN-006
test('paymentId under an unrelated type remains unavailable without payload serialization', async () => {
  const serialize = jest.fn(() => { throw new Error('PRIVATE_PAYLOAD_SERIALIZATION_REFUSED'); });
  fixed(await notifications.notify({ type: 'status', paymentId: 'private-payment', toJSON: serialize }));
  expect(serialize).not.toHaveBeenCalled();
});
// PN-007
test('client-asserted administrator initialization cannot query or dispatch pending payments', () => {
  queued('Payment', { paymentId: 'private-payment' });
  fixed(initialize('admin'));
});
// PN-008..PN-011
test.each(['newPayment', 'paymentAccepted', 'paymentRejected', 'paymentStatus'])(
  'client-asserted user cannot replay queued %s payment payloads or save notification state', async type => {
    const entry = queued(type, { type, paymentId: 'private-payment' });
    fixed(initialize('user'));
    fixed(await notifications.notify(entry.payload, 'user', 'unverified-client-identity'));
  });
// PN-012
test('stored Payment type and embedded paymentId both remain unread rather than activating queue filtering', () => {
  queued('Payment', { type: 'generic' }); queued('generic', { paymentId: 'private-payment' });
  fixed(initialize('user'));
});
// PN-013
test('markNotificationSent Payment returns unavailable without reading or updating state', async () => {
  fixed(await notifications.markNotificationSent('Payment', 'private-id'));
});
// PN-014..PN-018
test.each(['newOrder', 'orderAccepted', 'orderRejected', 'orderStatus', 'ORDER'])(
  'direct %s returns unavailable without sending queueing or database access', async type => {
    fixed(initialize('user'));
    fixed(await notifications.notify({ type, orderId: 'private-order' }, 'user', 'unverified-client-identity'));
  });
// PN-019..PN-020
test.each(['admin', 'user'])('client-asserted %s initialization cannot query Orders or activate dispatch', role => {
  queued('Order', { orderId: 'private-order' });
  fixed(initialize(role));
});
// PN-021
test('old queued order types and embedded identifiers remain unread with no saves or dispatch', async () => {
  queued('newOrder', { type: 'generic' }); queued('generic', { orderId: 'private-order' });
  fixed(initialize('user'));
  fixed(await notifications.notify({ type: 'generic', orderId: 'private-order' }));
});
// PN-022
test('markNotificationSent Order returns unavailable without reading or updating state', async () => {
  fixed(await notifications.markNotificationSent('Order', 'private-id'));
});
// PN-023: previous title is obsolete; generic notices are disabled too.
test('nonfinancial notice dispatch also returns unavailable without serialization sending or queueing', async () => {
  const serialize = jest.fn();
  fixed(initialize('admin'));
  fixed(await notifications.notify({ type: 'notice', message: 'Unrelated notice', toJSON: serialize }));
  expect(serialize).not.toHaveBeenCalled();
});
// New contract gap. Do not invent notifyUser/notifyAdmin exports: notify is the
// actual utility API; separate utils/notifyAdmin.js is covered in disabled units.
test('all actual notification entrypoints return one frozen uniform marker that hostile inputs cannot change', async () => {
  expect(Object.keys(notifications).sort()).toEqual(['initNotifications', 'markNotificationSent', 'notify']);
  const reads = jest.fn(() => { throw new Error('DISABLED_INPUT_MUST_NOT_BE_READ'); });
  const input = new Proxy({}, { get: reads, ownKeys: reads });
  const result = notifications.initNotifications(server, input);
  fixed(result); expect(Object.isFrozen(result)).toBe(true);
  expect(await notifications.notify(input, input, input)).toBe(result);
  expect(await notifications.markNotificationSent(input, input)).toBe(result);
  expect(() => { result.unavailable = false; }).toThrow(TypeError);
  expect(() => { result.reason = 'ENABLED'; }).toThrow(TypeError);
  expect(reads).not.toHaveBeenCalled();
  fixed(await notifications.notify({ type: 'notice' }));
});
