// Frozen C1 checkpoint router: TESTS ONLY, never runtime-imported.
'use strict';

const express = require('express');
const { randomUUID } = require('node:crypto');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const mongoose = require('mongoose');
const Payment = require('../../models/Payment');
const User = require('../../models/User');
const { verifyToken, checkAdmin } = require('../../middlewares/auth');
const { doubleCsrfProtection } = require('../../middlewares/csrfMiddleware');
const { upload, storeReceipt, cleanupReceipt, receiptLink } = require('../../middlewares/paymentUpload');
const methods = require('../../config/paymentMethods');
const { FinancialError, assertFinancialReady, approvePayment, rejectPayment } = require('../../services/financialService');
const { parseMoney, formatMoney, assertCents } = require('../../utils/money');
const PaymentError = require('../../utils/paymentError');
const router = express.Router();
const SIMPLE = { locale: 'simple' };
const projection = 'paymentId userId amount currency amountInUSD amountCents method note status createdAt submissionVersion';
// Already authenticated here: bind limits to database identity, not spoofable forwarded IPs.
const submissionLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => String(req.user._id) });
function bad(code, message, status = 400) { return new PaymentError(status, code, message); }
function allowFields(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key)) ||
      required.some(key => !Object.hasOwn(value, key))) throw bad('INVALID_PAYMENT_INPUT', 'Only the allowed payment fields are accepted');
}
function validId(id) { return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-z\d][a-z\d._:-]*$/i.test(id) && !/\s/.test(id); }
function userId(id) {
  if (typeof id !== 'string' || id.length !== 24 || !mongoose.isObjectIdOrHexString(id)) throw bad('INVALID_USER_ID', 'A valid owner ID is required');
  return id.toLowerCase();
}
function ownerFilter(req, global = false) {
  if (!global) {
    const owner = String(req.user._id);
    if (req.query.userId !== undefined && userId(req.query.userId) !== owner) throw bad('FORBIDDEN', 'Only your own payments are available here', 403);
    return { userId: owner };
  }
  return req.query.userId === undefined ? {} : { userId: userId(req.query.userId) };
}
function pagination(query) {
  const limit = query.limit === undefined ? 50 : typeof query.limit === 'string' && /^\d{1,3}$/.test(query.limit) ? Number(query.limit) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw bad('INVALID_PAGINATION', 'Page limit must be from 1 to 100');
  const filter = query.before === undefined ? {} : { _id: { $lt: new mongoose.Types.ObjectId(userId(query.before)) } };
  return { limit, filter };
}
function verified(payment) {
  try { return payment.submissionVersion === 1 && payment.status === 'completed' && payment.amountCents > 0 &&
    assertCents(payment.amountCents) === parseMoney(payment.amountInUSD); } catch (_) { return false; }
}
function serialize(payment) {
  const settled = verified(payment);
  const publicId = validId(payment.paymentId) ? payment.paymentId : null;
  // Old submissions accepted arbitrary method/owner strings; do not carry markup into legacy admin UIs.
  const owner = typeof payment.userId === 'string' && /^[a-f\d]{24}$/i.test(payment.userId) ? payment.userId.toLowerCase() : null;
  const note = typeof payment.note === 'string' && payment.note.length <= 500 && !/[<>]/.test(payment.note) ? payment.note : '';
  return { _id: payment._id, paymentId: publicId, userId: owner, amount: payment.amount,
    currency: ['USD', 'SYP', 'USDT'].includes(payment.currency) ? payment.currency : null,
    method: Object.hasOwn(methods, payment.method) ? payment.method : 'legacy', note, createdAt: payment.createdAt,
    status: ['pending', 'completed', 'cancelled'].includes(payment.status) ? payment.status : 'reconciliation_required',
    settlementVerified: settled, amountInUSD: settled ? formatMoney(payment.amountCents) : null,
    ...(settled ? { amountCents: payment.amountCents } : {}), receiptUrl: publicId ? `/api/payments/${encodeURIComponent(publicId)}/receipt` : null };
}
function fail(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof FinancialError || error instanceof PaymentError) {
    return res.status(error.status).json({ success: false, code: error.code, error: error.message,
      ...(error.retryWithSameKey ? { retryWithSameKey: true } : {}) });
  }
  if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false, code: 'INVALID_UPLOAD', error: 'The receipt upload exceeds its allowed limits' });
  if (error.name === 'ValidationError' || error.name === 'CastError' || error.name === 'MoneyError') {
    return res.status(400).json({ success: false, code: 'INVALID_PAYMENT_INPUT', error: 'Invalid payment values' });
  }
  if (error.code === 11000) return res.status(409).json({ success: false, code: 'PAYMENT_CONFLICT', error: 'The payment conflicts with an existing record' });
  return res.status(503).json({ success: false, code: 'PAYMENT_UNAVAILABLE', error: 'Payment operations are unavailable' });
}
const action = work => async (req, res, next) => { try { await work(req, res); } catch (error) { next(error); } };
const ready = async (req, res, next) => { try { await assertFinancialReady(); next(); } catch (error) { next(error); } };

// Authentication precedes ALL upload parsing and storage, even malformed/oversized submissions.
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.use(verifyToken);
router.post('/', doubleCsrfProtection, submissionLimit, ready, upload.single('receipt'), action(async (req, res) => {
  allowFields(req.body, ['amount', 'method', 'note'], ['amount', 'method']);
  if (typeof req.body.method !== 'string' || !Object.hasOwn(methods, req.body.method)) throw bad('INVALID_PAYMENT_METHOD', 'A supported method is required');
  const method = methods[req.body.method];
  const cents = parseMoney(req.body.amount);
  if (cents < parseMoney(method.min) || cents > parseMoney(method.max)) throw bad('INVALID_PAYMENT_AMOUNT', 'The amount is outside this method limit');
  if (req.body.note !== undefined && (typeof req.body.note !== 'string' || req.body.note.length > 500 || /[<>]/.test(req.body.note))) throw bad('INVALID_PAYMENT_NOTE', 'A bounded plain-text note is required');
  const amount = Number(formatMoney(cents));
  if (parseMoney(amount) !== cents) throw bad('INVALID_PAYMENT_AMOUNT', 'The claimed amount cannot be represented exactly');
  const receipt = await storeReceipt(req.file);
  const payment = new Payment({ paymentId: `pay-${randomUUID()}`, userId: String(req.user._id), submissionVersion: 1,
    amount, currency: method.currency, amountInUSD: 0, method: req.body.method, note: req.body.note || '', status: 'pending', receipt });
  let persistenceAttempted = false;
  try {
    // Recheck identity after external storage before persisting its ownership.
    if (!await User.exists({ _id: req.user._id, accountStatus: 'active', tokenVersion: req.user.tokenVersion })) throw bad('STALE_AUTHENTICATION', 'Please authenticate again', 401);
    await assertFinancialReady();
    persistenceAttempted = true;
    await payment.save();
  } catch (error) {
    let safeToDelete = !persistenceAttempted || error.name === 'ValidationError' || error.code === 11000;
    if (!safeToDelete) {
      // Never destroy a receipt if a lost save response might have persisted its payment.
      try { safeToDelete = !await Payment.findOne({ paymentId: payment.paymentId }).select('_id').collation(SIMPLE).readConcern('majority').lean(); }
      catch (_) { /* Leave uncertain storage for an owned-asset reconciliation job. */ }
    }
    if (safeToDelete) await cleanupReceipt(receipt);
    throw error;
  }
  // TODO Step 5: payment WebSocket dispatch is intentionally disabled, including submissions.
  res.status(201).json({ status: 'success', paymentId: payment.paymentId });
}));
async function list(req, res, global = false, pending = false) {
  allowFields(req.query, ['userId', 'limit', 'before']);
  const page = pagination(req.query);
  const filter = { ...ownerFilter(req, global), ...page.filter, ...(pending ? { status: 'pending' } : {}) };
  const payments = await Payment.find(filter).select(projection).collation(SIMPLE).sort({ _id: -1 }).limit(page.limit).lean();
  res.setHeader('Cache-Control', 'no-store');
  res.json(payments.map(serialize));
}
router.get('/', action((req, res) => list(req, res)));
router.get('/admin', checkAdmin, action((req, res) => list(req, res, true, true)));
router.get('/all', checkAdmin, action((req, res) => list(req, res, true)));
function total(cents) { return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`; }
async function summary(req, res, global = false) {
  allowFields(req.query, ['userId']);
  const counts = { totalPending: 0, totalCompleted: 0, totalCancelled: 0, reconciliationRequiredCount: 0 };
  const claims = { USD: 0n, SYP: 0n, USDT: 0n };
  let usd = 0n;
  // Bounded memory and exact BigInt sums; NEVER add claimed currencies as if they were USD.
  const cursor = Payment.find(ownerFilter(req, global)).select(projection).collation(SIMPLE).maxTimeMS(5000).lean().cursor({ batchSize: 100 });
  try {
    for await (const payment of cursor) {
      if (payment.status === 'pending') counts.totalPending += 1;
      else if (payment.status === 'completed') counts.totalCompleted += 1;
      else if (payment.status === 'cancelled') counts.totalCancelled += 1;
      let invalid = payment.submissionVersion !== 1;
      try {
        if (!Object.hasOwn(claims, payment.currency)) throw new Error('Legacy currency');
        claims[payment.currency] += BigInt(parseMoney(payment.amount));
        if (verified(payment)) usd += BigInt(payment.amountCents);
        else if (payment.status === 'completed') invalid = true;
      } catch (_) { invalid = true; }
      if (invalid || !['pending', 'completed', 'cancelled'].includes(payment.status)) counts.reconciliationRequiredCount += 1;
    }
  } finally { await cursor.close(); }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ...counts, currency: 'USD', totalInUSD: total(usd), verifiedAmountCents: usd.toString(),
    claimedTotals: Object.fromEntries(Object.entries(claims).map(([currency, cents]) => [currency, total(cents)])) });
}
router.get('/summary', action((req, res) => summary(req, res)));
router.get('/summary/all', checkAdmin, action((req, res) => summary(req, res, true)));
async function lookup(req, receipt = false, adminReview = false) {
  if (!validId(req.params.id)) throw bad('INVALID_PAYMENT_ID', 'A valid payment ID is required');
  allowFields(req.query, []);
  const payment = await Payment.findOne({ paymentId: req.params.id,
    ...((receipt || adminReview) && req.user.role === 'admin' ? {} : { userId: String(req.user._id) }) })
    .select(receipt ? `${projection} +receipt` : projection).collation(SIMPLE).lean();
  if (!payment) throw bad('PAYMENT_NOT_FOUND', 'The payment is not available to this account', 404);
  return payment;
}
router.get('/:id/receipt', action(async (req, res) => {
  const payment = await lookup(req, true);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.json(receiptLink(payment.receipt));
}));
router.get('/admin/:id', checkAdmin, action(async (req, res) => {
  res.json(serialize(await lookup(req, false, true)));
}));
router.get('/:id', action(async (req, res) => {
  const payment = await lookup(req);
  res.setHeader('Cache-Control', 'no-store');
  res.json(serialize(payment));
}));
router.put('/:id/accept', checkAdmin, doubleCsrfProtection, ready, action(async (req, res) => {
  allowFields(req.body, ['approvedAmount', 'idempotencyKey', 'reason'], ['approvedAmount', 'idempotencyKey', 'reason']);
  const result = await approvePayment({ actorId: req.user._id, paymentId: req.params.id,
    approvedAmount: req.body.approvedAmount, idempotencyKey: req.body.idempotencyKey, reason: req.body.reason });
  // TODO Step 5: no notify()/markNotificationSent() until recipients are authenticated.
  res.json(result);
}));
router.put('/:id/reject', checkAdmin, doubleCsrfProtection, ready, action(async (req, res) => {
  allowFields(req.body, ['idempotencyKey', 'reason'], ['idempotencyKey', 'reason']);
  res.json(await rejectPayment({ actorId: req.user._id, paymentId: req.params.id,
    idempotencyKey: req.body.idempotencyKey, reason: req.body.reason }));
}));
router.use(fail);
module.exports = router;
