'use strict';

// TODO C3: Port notification persistence and shared socket authentication before enabling dispatch.
// Order/payment WebSocket notifications remain disabled: no reads, writes, queueing or sends.
const UNAVAILABLE = Object.freeze({ unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' });

function initNotifications() {
  return UNAVAILABLE;
}

async function notify() {
  return UNAVAILABLE;
}

async function markNotificationSent() {
  return UNAVAILABLE;
}

module.exports = { initNotifications, notify, markNotificationSent };
