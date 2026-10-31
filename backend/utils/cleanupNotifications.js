'use strict';

// TODO C3: Port notification retention to PostgreSQL; cleanup remains disabled.
const UNAVAILABLE = Object.freeze({ unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' });

async function cleanOldNotifications() {
  return UNAVAILABLE;
}

module.exports = { cleanOldNotifications };
