'use strict';

// TODO C3: Port backup/notification jobs to PostgreSQL and explicitly start them in the composition root.
// Importing or calling this stub does not register cron jobs or timers.
const UNAVAILABLE = Object.freeze({ unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' });

function startScheduler() {
  return UNAVAILABLE;
}

module.exports = { startScheduler };
