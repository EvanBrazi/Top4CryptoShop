'use strict';

// TODO C3: Port the legacy security routes to PostgreSQL before mounting them.
const router = require('express').Router();
const { generateQR: unavailable } = require('../controllers/securityController');

router.use(unavailable);

module.exports = router;
