'use strict';
// Trusted composition, lazy pool. No import-time I/O or Mongo fallback.
const { getPool } = require('../../db/pg');
function createFinancialContext(authContext, { poolProvider = getPool, cursorSecret = process.env.CURSOR_SECRET,
  catalogService, receiptOptions = {} } = {}) {
  const coordinator = require('../financialCoordinator').createFinancialCoordinator({ poolProvider, ...(catalogService ? { catalogService } : {}) });
  const orders = require('../../repositories/orderRepository').createOrderRepository({ poolProvider, cursorSecret });
  const payments = require('../../repositories/paymentRepository').createPaymentRepository({ poolProvider, cursorSecret });
  const pipeline = require('../../middlewares/paymentUpload');
  const { upload = pipeline.upload, storeReceipt = pipeline.storeReceipt,
    cleanupReceipt = pipeline.cleanupReceipt, receiptLink = pipeline.receiptLink } = receiptOptions;
  const single = upload.single('receipt');
  function parseUpload({ req, res }) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = error => {
        if (settled) return;
        settled = true; clearTimeout(timer); req.removeListener('aborted', aborted);
        if (error) reject(error); else resolve({ body: req.body, file: req.file });
      };
      const aborted = () => done(new Error('INVALID_PAYMENT_UPLOAD'));
      const timer = setTimeout(aborted, 30000); timer.unref();
      req.once('aborted', aborted);
      if (req.aborted) return aborted();
      try { single(req, res, done); } catch (e) { done(e); }
    });
  }
  const submissions = require('../paymentSubmissionService').createPaymentSubmissionService({ poolProvider,
    sessionStore: authContext.sessionStore, cursorSecret, parseUpload, storeReceipt, cleanupReceipt });
  return Object.freeze({ coordinator, orders, payments, submissions, receiptLink });
}
module.exports = { createFinancialContext };
