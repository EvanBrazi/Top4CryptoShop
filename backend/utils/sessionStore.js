'use strict';

// TODO C3: Retire legacy in-memory session callers in favor of services/sessionStore.js.
// This disabled store holds no sessions and registers no expiry timer.
const UNAVAILABLE = Object.freeze({ unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' });

function createSession() {
  return UNAVAILABLE;
}

// Compatibility marker only, not a Map or an authentication authority.
module.exports = { activeSessions: UNAVAILABLE, createSession };
