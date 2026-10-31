'use strict';
// Lazy PostgreSQL-only entry. The unported server/session composition fails closed.
const { createAuthRouter } = require('../services/auth/httpRouter');
const { sendFailure } = require('../services/auth/httpErrors');
const router = require('express').Router();
let configured;
router.use((req, res, next) => {
  try {
    configured ||= createAuthRouter(require('../services/auth/httpContext').getDefaultContext());
    return configured(req, res, next);
  } catch (error) { return sendFailure(req, res, error); }
});
module.exports = router;
module.exports.createAuthRouter = createAuthRouter;