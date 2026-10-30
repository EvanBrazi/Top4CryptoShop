'use strict';

// TODO C3: Port icon persistence to PostgreSQL before enabling these routes.
const router = require('express').Router();
const UNAVAILABLE = Object.freeze({ unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' });

router.use((req, res) => res.status(503).json(UNAVAILABLE));

module.exports = router;
