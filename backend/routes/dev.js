'use strict';

// TODO C3: Restore simulation only after approved notification persistence and socket authentication.
// Notification simulation remains disabled and never dispatches or queues payloads.
const router = require('express').Router();
const UNAVAILABLE = Object.freeze({ unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' });

router.use((req, res) => res.status(503).json(UNAVAILABLE));

module.exports = router;
