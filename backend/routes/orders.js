'use strict';
// PostgreSQL-only entry. Historical Mongo routers live exclusively in tests.
const { createOrdersRouter } = require('../services/financial/ordersHttpRouter');
const { sendFailure } = require('../services/financial/financialErrors');
const router = require('express').Router();
let configured;
router.use((req, res, next) => {
  try {
    if (!configured) {
      const auth = require('../services/auth/httpContext').getDefaultContext();
      const financial = require('../services/financial/httpContext').createFinancialContext(auth);
      configured = createOrdersRouter(auth, financial);
    }
    return configured(req, res, next);
  } catch (e) { return sendFailure(req, res, e); }
});
module.exports = router;
module.exports.createOrdersRouter = createOrdersRouter;
