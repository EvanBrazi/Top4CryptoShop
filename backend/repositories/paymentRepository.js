'use strict';
const { createReads } = require('./private/resourceReads');
function createPaymentRepository(options = {}) {
  const r = createReads('payment', options);
  return Object.freeze({
    listForOwner: input => r.read(input, false),
    findByPaymentIdForOwner: input => r.read(input, false, true),
    listForAdmin: input => r.read(input, true),
    listPendingForAdmin: input => r.read(input, true, false, true),
    findByPaymentIdForAdmin: input => r.read(input, true, true),
    summarizeForOwner: input => r.summary(input, false),
    summarizeForAdmin: input => r.summary(input, true),
    findReceiptForOwner: input => r.read(input, false, true, false, true),
    findReceiptForAdmin: input => r.read(input, true, true, false, true)
  });
}
module.exports = { createPaymentRepository };
