'use strict';
const { common } = require('./httpCommon');
const C = require('./contracts');
const { parseMoney } = require('../../utils/money');
function createPaymentsRouter(context, financial) {
  const h = common(context), { router, auth, wrap, json, unsafe } = h;
  const { coordinator, payments, submissions, receiptLink } = financial;
  router.use(auth.verifyToken);
  router.post('/', ...unsafe, wrap(async (req, res) => {
    h.fields(req.query, []);
    const submissionId = req.headers['x-submission-id'];
    C.uuid(submissionId, 'INVALID_SUBMISSION_ID');
    if (!req.is('multipart/form-data')) throw C.fail('INVALID_PAYMENT_UPLOAD', 400);
    const { token, sessionId } = req.auth;
    const result = await submissions.submit({ token, sessionId, expressSid: req.sessionID,
      csrfToken: req.headers['x-csrf-token'], submissionId, uploadSource: { req, res } });
    h.committed(req, res, result, 201);
  }));
  router.get('/submissions/:submissionId', wrap(async (req, res) => {
    h.fields(req.query, []);
    C.uuid(req.params.submissionId, 'INVALID_SUBMISSION_ID');
    const { token, sessionId } = req.auth;
    await h.read(req, res, await submissions.resolveSubmission({ token, sessionId, submissionId: req.params.submissionId }));
  }));
  for (const [path, method, admin, pending, summary] of [
    ['/', 'listForOwner', false], ['/summary', 'summarizeForOwner', false, false, true],
    ['/all', 'listForAdmin', true], ['/summary/all', 'summarizeForAdmin', true, false, true],
    ['/admin', 'listPendingForAdmin', true, true]
  ]) router.get(path, ...(admin ? [auth.checkAdmin] : []), wrap(async (req, res) => {
    await h.read(req, res, await payments[method](h.query(req, admin, pending, summary)));
  }));
  router.get('/:id/receipt', wrap(async (req, res) => {
    const method = req.auth.role === 'admin' ? 'findReceiptForAdmin' : 'findReceiptForOwner';
    const value = h.found(await payments[method]({ ...h.query(req, false, false, false, true), paymentId: req.params.id }), 'payment');
    res.set('Referrer-Policy', 'no-referrer');
    await h.read(req, res, await receiptLink(value.receipt));
  }));
  for (const [path, method, admin] of [['/admin/:id', 'findByPaymentIdForAdmin', true], ['/:id', 'findByPaymentIdForOwner', false]])
    router.get(path, ...(admin ? [auth.checkAdmin] : []), wrap(async (req, res) => {
      const value = await payments[method]({ ...h.query(req, admin, false, false, true), paymentId: req.params.id });
      await h.read(req, res, h.found(value, 'payment'));
    }));
  router.put('/:id/accept', auth.checkAdmin, ...unsafe, json, wrap(async (req, res) => {
    h.fields(req.query, []);
    h.fields(req.body, ['approvedAmount', 'idempotencyKey', 'reason'], ['approvedAmount', 'idempotencyKey', 'reason']);
    let approvedAmountCents;
    try {
      if (typeof req.body.approvedAmount !== 'string') throw Error();
      approvedAmountCents = String(parseMoney(req.body.approvedAmount));
    } catch (_) { throw C.fail('INVALID_APPROVED_AMOUNT', 400); }
    const result = await coordinator.approvePayment({ principal: h.principal(req), paymentId: req.params.id,
      approvedAmountCents, idempotencyKey: req.body.idempotencyKey, reason: req.body.reason });
    h.committed(req, res, result);
  }));
  router.put('/:id/reject', auth.checkAdmin, ...unsafe, json, wrap(async (req, res) => {
    h.fields(req.query, []); h.fields(req.body, ['idempotencyKey', 'reason'], ['idempotencyKey', 'reason']);
    const result = await coordinator.rejectPayment({ ...req.body, principal: h.principal(req), paymentId: req.params.id });
    h.committed(req, res, result);
  }));
  router.use(h.errors);
  return router;
}
module.exports = { createPaymentsRouter };
