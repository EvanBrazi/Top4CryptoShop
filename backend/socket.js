'use strict';

// TODO C3: Implement shared PostgreSQL-backed socket authentication before enabling sockets.
// Order/payment financial notifications remain disabled; no server, listeners or sends are created.
const { activeSessions } = require('./utils/sessionStore');
const UNAVAILABLE = Object.freeze({ unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' });

function setupWebSocket() {
  return UNAVAILABLE;
}

module.exports = { setupWebSocket, activeSessions };
