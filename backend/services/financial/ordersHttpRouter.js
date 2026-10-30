'use strict';
const { common } = require('./httpCommon');
const { normalizePurchase } = require('../../utils/orderInput');
const C = require('./contracts');
function createOrdersRouter(context, financial) {
  const h = common(context), { router, auth, wrap, json, unsafe } = h;
  const { coordinator, orders } = financial;
  router.post('/', (req, res) => require('./financialErrors').sendFailure(req, res, C.fail('LEGACY_ORDER_CREATION_DISABLED', 410)));
  router.use(auth.verifyToken);
  router.post('/purchase', ...unsafe, json, wrap(async (req, res) => {
    h.fields(req.query, []);
    const input = normalizePurchase(req.body);
    const result = await coordinator.purchaseOrder({ ...input, principal: h.principal(req) });
    h.committed(req, res, result, result.replayed ? 200 : 201);
  }));
  for (const [path, method, admin, pending, summary] of [
    ['/', 'listForOwner', false], ['/summary', 'summarizeForOwner', false, false, true],
    ['/all', 'listForAdmin', true], ['/summary/all', 'summarizeForAdmin', true, false, true],
    ['/admin', 'listPendingForAdmin', true, true]
  ]) router.get(path, ...(admin ? [auth.checkAdmin] : []), wrap(async (req, res) => {
    await h.read(req, res, await orders[method](h.query(req, admin, pending, summary)));
  }));
  for (const [path, method, admin] of [
    ['/admin/:id/fulfillment', 'findFulfillmentForAdmin', true], ['/admin/:id', 'findByOrderIdForAdmin', true],
    ['/:id/fulfillment', 'findFulfillmentForOwner', false], ['/:id', 'findByOrderIdForOwner', false]
  ]) router.get(path, ...(admin ? [auth.checkAdmin] : []), wrap(async (req, res) => {
    const value = await orders[method]({ ...h.query(req, admin, false, false, true), orderId: req.params.id });
    await h.read(req, res, h.found(value, 'order'));
  }));
  for (const [path, method] of [['/:id/accept', 'completeOrder'], ['/:id/reject', 'cancelOrder']])
    router.put(path, auth.checkAdmin, ...unsafe, json, wrap(async (req, res) => {
      h.fields(req.query, []); h.fields(req.body, ['idempotencyKey', 'reason'], ['idempotencyKey', 'reason']);
      const result = await coordinator[method]({ ...req.body, principal: h.principal(req), orderId: req.params.id });
      h.committed(req, res, result);
    }));
  router.use(h.errors);
  return router;
}
module.exports = { createOrdersRouter };
