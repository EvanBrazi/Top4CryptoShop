'use strict';

jest.mock('../models/Order', () => ({ find: jest.fn(), updateOne: jest.fn().mockResolvedValue({}) }));
jest.mock('../models/Payment', () => ({ find: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/PendingNotification', () => ({ find: jest.fn(), create: jest.fn() }));
const { EventEmitter } = require('node:events');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Pending = require('../models/PendingNotification');
const notifications = require('../utils/notifications');

let server, socket, queue;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  queue = [];
  Order.find.mockReturnValue({ sort: async () => [], lean: async () => [] });
  Pending.find.mockImplementation(() => ({ limit: async () => queue }));
  server = new EventEmitter();
  socket = new EventEmitter();
  socket.readyState = 1;
  socket.send = jest.fn();
  server.clients = new Set([socket]);
  notifications.initNotifications(server);
  server.emit('connection', socket);
});
afterEach(() => { socket.emit('close'); jest.restoreAllMocks(); });
async function authenticate(role) {
  await socket.listeners('message')[0](JSON.stringify({ type: 'auth', role, userId: 'unverified-client-identity' }));
}
test.each(['newPayment', 'paymentAccepted', 'paymentRejected', 'paymentStatus', 'PAYMENT'])('direct %s dispatch is a no-op and cannot enqueue', async type => {
  await notifications.notify({ type, paymentId: 'private-payment' }, 'user', 'unverified-client-identity');
  expect(socket.send).not.toHaveBeenCalled();
  expect(Pending.create).not.toHaveBeenCalled();
  expect(Payment.find).not.toHaveBeenCalled();
});
test('paymentId payload is blocked even under an unrelated type', async () => {
  await notifications.notify({ type: 'status', paymentId: 'private-payment' });
  expect(socket.send).not.toHaveBeenCalled();
});
test('client-asserted administrator authentication cannot query or dispatch pending payments', async () => {
  await authenticate('admin');
  expect(Payment.find).not.toHaveBeenCalled();
  expect(socket.send).not.toHaveBeenCalled();
});
test.each(['newPayment', 'paymentAccepted', 'paymentRejected', 'paymentStatus'])('client-asserted user cannot replay queued %s payment payloads', async type => {
  const notification = { type, payload: { type, paymentId: 'private-payment' }, save: jest.fn() };
  queue.push(notification);
  await authenticate('user');
  expect(Payment.find).not.toHaveBeenCalled();
  expect(socket.send).not.toHaveBeenCalled();
  expect(notification.save).not.toHaveBeenCalled();
});
test('queue filtering checks both stored type and embedded paymentId', async () => {
  queue.push({ type: 'Payment', payload: { type: 'generic' }, save: jest.fn() });
  queue.push({ type: 'generic', payload: { paymentId: 'private-payment' }, save: jest.fn() });
  await authenticate('user');
  expect(socket.send).not.toHaveBeenCalled();
});
test('markNotificationSent Payment is a no-op', async () => {
  await notifications.markNotificationSent('Payment', 'private-id');
  expect(Payment.updateOne).not.toHaveBeenCalled();
});
test.each(['newOrder', 'orderAccepted', 'orderRejected', 'orderStatus', 'ORDER'])('direct %s dispatch cannot send or enqueue', async type => {
  await notifications.notify({ type, orderId: 'private-order' }, 'user', 'unverified-client-identity');
  expect(socket.send).not.toHaveBeenCalled(); expect(Pending.create).not.toHaveBeenCalled();
});
test.each(['admin', 'user'])('client-asserted %s cannot query Orders', async role => {
  await authenticate(role);
  expect(Order.find).not.toHaveBeenCalled(); expect(Order.updateOne).not.toHaveBeenCalled();
});
test('old queued order payloads and identifiers are suppressed without writes', async () => {
  const entries = [{ type: 'newOrder', payload: { type: 'generic' }, save: jest.fn() }, { type: 'generic', payload: { orderId: 'private-order' }, save: jest.fn() }];
  queue.push(...entries); await authenticate('user');
  expect(socket.send).not.toHaveBeenCalled(); entries.forEach(item => expect(item.save).not.toHaveBeenCalled());
  expect(Pending.find.mock.calls[0][0].$nor).toEqual(expect.arrayContaining([{ 'payload.orderId': { $exists: true } }]));
});
test('Order notification-state writes are disabled', async () => {
  await notifications.markNotificationSent('Order', 'private-id'); expect(Order.updateOne).not.toHaveBeenCalled();
});
test('nonfinancial notice dispatch is preserved', async () => {
  const notice = { type: 'notice', message: 'Unrelated notice' }; await notifications.notify(notice);
  expect(socket.send).toHaveBeenCalledWith(JSON.stringify(notice));
});
