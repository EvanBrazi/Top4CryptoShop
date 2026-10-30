'use strict';

// TODO C3: Port admin notification persistence to PostgreSQL before enabling storage or dispatch.
const UNAVAILABLE = Object.freeze({ unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' });

async function notifyAdmin() {
  return UNAVAILABLE;
}

module.exports = { notifyAdmin };
