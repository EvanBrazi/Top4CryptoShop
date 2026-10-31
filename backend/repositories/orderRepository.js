'use strict';
const { createReads } = require('./private/resourceReads');
function createOrderRepository(options = {}) {
  const r = createReads('order', options);
  return Object.freeze({
    listForOwner: input => r.read(input, false),
    findByOrderIdForOwner: input => r.read(input, false, true),
    listForAdmin: input => r.read(input, true),
    listPendingForAdmin: input => r.read(input, true, false, true),
    findByOrderIdForAdmin: input => r.read(input, true, true),
    summarizeForOwner: input => r.summary(input, false),
    summarizeForAdmin: input => r.summary(input, true),
    findFulfillmentForOwner: input => r.read(input, false, true, false, true),
    findFulfillmentForAdmin: input => r.read(input, true, true, false, true)
  });
}
module.exports = { createOrderRepository };
