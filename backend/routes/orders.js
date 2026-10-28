'use strict';
const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const Order = require('../models/Order');
const { verifyToken, checkAdmin } = require('../middlewares/auth');
const { doubleCsrfProtection } = require('../middlewares/csrfMiddleware');
const { FinancialError, assertFinancialReady, purchaseOrder, completeOrder, cancelOrder } = require('../services/financialService');
const { normalizePurchase, keyValid } = require('../utils/orderInput');
const OrderError = require('../utils/orderError');
const { formatMoney } = require('../utils/money');
const router = express.Router();
const projection = 'orderId userId financialVersion catalogSnapshot selection quantity chargeCents chargeCurrency amount method service status createdAt';
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: req => String(req.user._id) });
const action = work => async (req, res, next) => { try { await work(req, res); } catch (error) { next(error); } };
const ready = async (req, res, next) => { try { await assertFinancialReady(); next(); } catch (error) { next(error); } };
function owner(req, admin = false) {
  const id = String(req.user._id);
  if (!admin && req.query.userId !== undefined && req.query.userId !== id) throw new OrderError(403, 'FORBIDDEN', 'Only your own orders are available here');
  if (admin && req.query.userId !== undefined) {
    if (typeof req.query.userId !== 'string' || !/^[a-f\d]{24}$/.test(req.query.userId)) throw new OrderError(400, 'INVALID_PURCHASE_INPUT', 'A valid owner filter is required');
    return { userId: req.query.userId };
  }
  return admin ? {} : { userId: id };
}
function pagination(query) {
  const limit = query.limit === undefined ? 50 : typeof query.limit === 'string' && /^\d{1,3}$/.test(query.limit) ? Number(query.limit) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || query.before !== undefined && (typeof query.before !== 'string' || !/^[a-f\d]{24}$/.test(query.before))) throw new OrderError(400, 'INVALID_PURCHASE_INPUT', 'Valid bounded pagination is required');
  return { limit, filter: query.before === undefined ? {} : { _id: { $lt: new mongoose.Types.ObjectId(query.before) } } };
}
function serialize(order) {
  const modern = order.financialVersion === 1;
  const text = value => typeof value === 'string' && value.length <= 200 && !/[\x00-\x1f<>&'"`]/.test(value) ? value : null;
  return { _id: order._id, orderId: keyValid(order.orderId) ? order.orderId : null, createdAt: order.createdAt,
    userId: typeof order.userId === 'string' && /^[a-f\d]{24}$/.test(order.userId) ? order.userId : null,
    method: ['apps', 'games', 'cryptos', 'balances'].includes(order.method) ? order.method : 'legacy', service: text(order.service),
    quantity: Number.isSafeInteger(order.quantity) && order.quantity > 0 ? order.quantity : null,
    legacy: !modern, readOnly: !modern, financialState: modern ? 'journal_backed' : 'unverified', status: modern ? order.status : 'reconciliation_required',
    ...(modern ? { chargeCurrency: 'USD', chargeCents: order.chargeCents, charge: formatMoney(order.chargeCents), amount: formatMoney(order.chargeCents), productId: order.catalogSnapshot.productId, catalogRevision: order.catalogSnapshot.catalogRevision } : { amount: null }) };
}
async function list(req, res, filter) {
  const page = pagination(req.query);
  const values = await Order.find({ ...filter, ...page.filter }).select(projection).sort({ _id: -1 }).limit(page.limit).maxTimeMS(5000).lean();
  res.json(values.map(serialize));
}
async function summary(req, res, filter) {
  const totals = { pending: 0, completed: 0, cancelled: 0, legacy: 0 };
  let charges = 0n, refunds = 0n;
  const cursor = Order.find(filter).select('financialVersion status chargeCents').maxTimeMS(5000).lean().cursor({ batchSize: 100 });
  try {
    for await (const order of cursor) {
      if (order.financialVersion !== 1 || !Number.isSafeInteger(order.chargeCents) || order.chargeCents <= 0 || !['pending', 'completed', 'cancelled'].includes(order.status)) { totals.legacy++; continue; }
      totals[order.status]++; charges += BigInt(order.chargeCents);
      if (order.status === 'cancelled') refunds += BigInt(order.chargeCents);
    }
  } finally { await cursor.close(); }
  const decimal = value => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
  res.json({ ...totals, currency: 'USD', grossChargeCents: String(charges), refundCents: String(refunds), netChargeCents: String(charges - refunds), grossCharges: decimal(charges), refunds: decimal(refunds), netCharges: decimal(charges - refunds) });
}
async function one(req, res, admin = false, fulfillment = false) {
  if (!keyValid(req.params.id)) throw new OrderError(400, 'INVALID_PURCHASE_INPUT', 'A valid order ID is required');
  const order = await Order.findOne({ orderId: req.params.id, ...(admin ? {} : { userId: String(req.user._id) }) }).select(`${projection}${fulfillment ? ' +fulfillmentSnapshot' : ''}`).lean();
  if (!order) throw new OrderError(404, 'ORDER_NOT_FOUND', 'The order does not exist');
  if (fulfillment) {
    if (order.financialVersion !== 1) throw new OrderError(409, 'ORDER_RECONCILIATION_REQUIRED', 'Legacy fulfillment information is unverified');
    return res.json({ orderId: order.orderId, fulfillmentSnapshot: order.fulfillmentSnapshot });
  }
  res.json(serialize(order));
}
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.use(verifyToken);
router.post('/', (req, res) => res.status(410).json({ success: false, code: 'LEGACY_ORDER_CREATION_DISABLED', error: 'Use the atomic purchase endpoint' }));
router.post('/purchase', doubleCsrfProtection, limiter, ready, action(async (req, res) => {
  const result = await purchaseOrder({ ...normalizePurchase(req.body), actorId: String(req.user._id), tokenVersion: req.user.tokenVersion });
  res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
}));
router.get('/', action((req, res) => list(req, res, owner(req))));
router.get('/summary', action((req, res) => summary(req, res, owner(req))));
router.get('/all', checkAdmin, action((req, res) => list(req, res, owner(req, true))));
router.get('/summary/all', checkAdmin, action((req, res) => summary(req, res, owner(req, true))));
router.get('/admin', checkAdmin, action((req, res) => list(req, res, { ...owner(req, true), financialVersion: 1, status: 'pending' })));
router.get('/admin/:id/fulfillment', checkAdmin, action((req, res) => one(req, res, true, true)));
router.get('/admin/:id', checkAdmin, action((req, res) => one(req, res, true)));
router.get('/:id/fulfillment', action((req, res) => one(req, res, false, true)));
router.get('/:id', action((req, res) => one(req, res)));
for (const [path, operation] of [['accept', completeOrder], ['reject', cancelOrder]]) {
  router.put(`/:id/${path}`, checkAdmin, doubleCsrfProtection, ready, action(async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(key => !['idempotencyKey', 'reason'].includes(key))) throw new OrderError(400, 'INVALID_PURCHASE_INPUT', 'Only the required decision fields are accepted');
    res.json({ success: true, ...await operation({ ...req.body, actorId: String(req.user._id), orderId: req.params.id }) });
  }));
}
// Step 5: no Order socket reads, dispatch, or notification-state writes.
router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof FinancialError || error instanceof OrderError) return res.status(error.status).json({ success: false, code: error.code, error: error.message, ...(error.retryWithSameKey ? { retryWithSameKey: true } : {}) });
  res.status(503).json({ success: false, code: 'ORDER_UNAVAILABLE', error: 'Order operations are unavailable' });
});
module.exports = router;
