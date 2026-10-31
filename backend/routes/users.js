'use strict';
// PostgreSQL-only entry. Historical Mongo contracts live exclusively in tests.
const { createUsersRouter } = require('../services/users/httpRouter');
const { sendFailure } = require('../services/auth/httpErrors');
const router = require('express').Router();
let configured;
router.use((req, res, next) => {
  try {
    configured ||= createUsersRouter(require('../services/auth/httpContext').getDefaultContext());
    return configured(req, res, next);
  } catch (error) { return sendFailure(req, res, error); }
});

module.exports = router;
module.exports.createUsersRouter = createUsersRouter;
