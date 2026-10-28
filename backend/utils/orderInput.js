'use strict';
const { createHash } = require('node:crypto');
const OrderError = require('./orderError');
const { plain } = require('./fulfillmentTarget');
const keyValid = value => typeof value === 'string' && value.length >= 1 && value.length <= 128 && /^[a-z\d][a-z\d._:-]*$/i.test(value) && !/\s/.test(value);
function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0; }
function normalizePurchase(input) {
  const allowed = ['category', 'productId', 'packageIndex', 'quantity', 'idempotencyKey', 'fulfillmentTarget'];
  if (!plain(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new OrderError(400, 'UNKNOWN_PURCHASE_FIELD', 'Only the allowed purchase fields are accepted');
  if (!['apps', 'games', 'cryptos', 'balances'].includes(input.category) || !positiveInteger(input.productId) || !keyValid(input.idempotencyKey) ||
      Object.hasOwn(input, 'quantity') === Object.hasOwn(input, 'packageIndex') ||
      (Object.hasOwn(input, 'quantity') && !positiveInteger(input.quantity)) ||
      (Object.hasOwn(input, 'packageIndex') && (!Number.isSafeInteger(input.packageIndex) || input.packageIndex < 0 || Object.is(input.packageIndex, -0)))) {
    throw new OrderError(400, 'INVALID_PURCHASE_INPUT', 'A valid product, selection and idempotency key are required');
  }
  const cloned = structuredClone(input);
  // Re-home the two plain input containers in this module's realm. The clone
  // still severs all caller references, including malformed nested values.
  if (plain(input.fulfillmentTarget)) cloned.fulfillmentTarget = { ...cloned.fulfillmentTarget };
  return { ...cloned };
}
function purchaseHash(actorId, input, fulfillment) {
  const parts = [1, 'purchase_order', 'USD', actorId, input.category, input.productId,
    Object.hasOwn(input, 'packageIndex') ? ['package', input.packageIndex] : ['quantity', input.quantity],
    fulfillment ? [fulfillment.schema, fulfillment.validationVersion, fulfillment.network, fulfillment.target[fulfillment.schema]] : null];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
module.exports = { keyValid, positiveInteger, normalizePurchase, purchaseHash };
