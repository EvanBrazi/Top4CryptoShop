'use strict';
// Prerequisite only: NOT mounted. No Mongo imports, balance writes, or notifications.
const { getPool } = require('../db/pg');
const A = require('./auth/persistence');
const methods = require('../config/paymentMethods');
const { parseMoney, formatMoney } = require('../utils/money');
const { createPaymentRepository } = require('../repositories/paymentRepository');
const OWNED = /^private_payment_receipts\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function createPaymentSubmissionService({ poolProvider = getPool, sessionStore, parseUpload,
  storeReceipt = file => require('../middlewares/paymentUpload').storeReceipt(file),
  cleanupReceipt = receipt => require('../middlewares/paymentUpload').cleanupReceipt(receipt),
  cursorSecret = process.env.CURSOR_SECRET } = {}) {
  // All callbacks are trusted composition-root dependencies, not body options.
  if (typeof poolProvider !== 'function' || typeof parseUpload !== 'function' || typeof storeReceipt !== 'function' ||
      typeof cleanupReceipt !== 'function' || typeof sessionStore?.authenticateForExpressSession !== 'function' ||
      typeof sessionStore?.authenticate !== 'function') throw A.fail('PAYMENT_SERVICE_CONFIG_INVALID', 503);
  const reads = createPaymentRepository({ poolProvider, cursorSecret });
  async function clean(receipt) {
    try { if (A.match(OWNED, receipt?.publicId)) await cleanupReceipt(receipt); } catch (_) { /* Retain for reconciliation. */ }
  }
  function claim(body) {
    A.fields(body, ['method', 'amount', 'note'], ['method', 'amount']);
    if (typeof body.method !== 'string' || !Object.hasOwn(methods, body.method)) throw A.fail('INVALID_PAYMENT_METHOD', 400);
    const method = methods[body.method]; let cents;
    try {
      cents = parseMoney(body.amount);
      if (cents < parseMoney(method.min) || cents > parseMoney(method.max) || parseMoney(Number(formatMoney(cents))) !== cents) throw Error();
    } catch (_) { throw A.fail('INVALID_PAYMENT_AMOUNT', 400); }
    if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500 || /[<>]/.test(body.note))) throw A.fail('INVALID_PAYMENT_NOTE', 400);
    return Object.freeze({ method: body.method, currency: method.currency, claimedMinor: String(cents), note: body.note?.trim() || '' });
  }
  async function submit(input) {
    A.fields(input, ['token', 'sessionId', 'expressSid', 'csrfToken', 'submissionId', 'uploadSource']);
    const paymentId = `pay-${A.uuid(input.submissionId)}`;
    const authInput = { token: input.token, sessionId: input.sessionId, expressSid: input.expressSid, csrfToken: input.csrfToken };
    const auth = await sessionStore.authenticateForExpressSession(authInput), p = A.principal(auth.principal);
    // Owner-only early conflict/readiness check, before parsing or external storage.
    let check;
    try { check = A.one(await poolProvider().query({ text: `SELECT EXISTS (SELECT 1 FROM public.users WHERE id = $1::UUID
      AND token_version = $2::BIGINT AND account_status = 'active') AS authorized,
      EXISTS (SELECT 1 FROM public.payments WHERE payment_id = $3 AND user_id = $1::UUID) AS existing`,
      values: [p.userId, p.tokenVersion, paymentId], query_timeout: 5000 })); }
    catch (_) { throw A.fail('PAYMENT_SUBMISSION_UNAVAILABLE', 503); }
    if (!check?.authorized) throw A.fail('AUTH_FORBIDDEN', 403);
    // Submission IDs are recovery identifiers, NOT permission to change/replay payloads.
    if (check.existing) throw A.fail('PAYMENT_SUBMISSION_EXISTS');
    let uploaded;
    try { uploaded = await parseUpload(input.uploadSource); }
    catch (e) { throw A.fail('INVALID_PAYMENT_UPLOAD', e?.code === 'LIMIT_FILE_SIZE' ? 413 : 400); }
    A.fields(uploaded, ['body', 'file']);
    const data = claim(uploaded.body);
    let receipt;
    try { receipt = await storeReceipt(uploaded.file); }
    catch (_) { throw A.fail('RECEIPT_STORAGE_UNAVAILABLE', 503); }
    let rolledBack = false, transactionStarted = false;
    try {
      try {
        A.fields(receipt, ['publicId', 'format', 'deliveryType']);
        if (!A.match(OWNED, receipt.publicId) || receipt.format !== 'jpg' || receipt.deliveryType !== 'authenticated') throw Error();
      } catch (_) { throw A.fail('INVALID_RECEIPT_STORAGE', 503); }
      // Copy only immutable server-generated metadata, never receipt URLs/body IDs.
      const metadata = Object.freeze({ publicId: receipt.publicId, format: receipt.format, deliveryType: receipt.deliveryType });
      transactionStarted = true;
      return await A.transaction(poolProvider, async q => {
        A.authorize(p, await A.lockAccounts(q, [p.userId]));
        // One owned client, fresh session/CSRF/expiry/revocation authority INSIDE the INSERT.
        const guard = require('./auth/authenticatedRequests').insertionGuard(auth);
        const row = A.one(await q(`INSERT INTO public.payments
          (payment_id, user_id, submission_version, claimed_amount_minor, currency, method, note,
           receipt_public_id, receipt_format, receipt_delivery_type, status)
          SELECT $9, $3::UUID, 1, $10::BIGINT, $11, $12, $13, $14, $15, $16, 'pending'
          WHERE ${guard.sql} RETURNING payment_id, status`, [...guard.values, paymentId, data.claimedMinor,
          data.currency, data.method, data.note, metadata.publicId, metadata.format, metadata.deliveryType]), 'AUTH_SESSION_INVALID');
        return Object.freeze({ paymentId: row.payment_id, status: row.status });
      }, { onRollbackConfirmed: () => { rolledBack = true; } });
    } catch (e) {
      if (!transactionStarted || rolledBack) await clean(receipt);
      if (e.code === 'AUTH_OUTCOME_UNKNOWN') {
        const error = A.fail('PAYMENT_SUBMISSION_OUTCOME_UNKNOWN', 503);
        error.paymentId = paymentId; error.retrySubmission = false;
        throw error; // No second insert and no receipt deletion after uncertain COMMIT.
      }
      if (e.code === 'AUTH_CONFLICT') throw A.fail('PAYMENT_SUBMISSION_EXISTS');
      if (e.name === 'AuthPersistenceError' || e.name === 'UserRepositoryError') throw e;
      throw A.fail('PAYMENT_SUBMISSION_UNAVAILABLE', 503);
    }
  }
  async function resolveSubmission(input) {
    A.fields(input, ['token', 'sessionId', 'submissionId']);
    const paymentId = `pay-${A.uuid(input.submissionId)}`;
    const auth = await sessionStore.authenticate({ token: input.token, sessionId: input.sessionId });
    const payment = await reads.findByPaymentIdForOwner({ principal: auth.principal, paymentId });
    return Object.freeze(payment ? { outcome: 'committed', payment } : { outcome: 'unresolved', paymentId, retrySubmission: false });
  }
  return Object.freeze({ submit, resolveSubmission });
}
module.exports = { createPaymentSubmissionService };
