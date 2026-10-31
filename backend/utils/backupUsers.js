'use strict';

// TODO C3: Implement an approved PostgreSQL backup strategy before enabling local/Drive backups.
// No database access, filesystem writes, external uploads or success logging.
const UNAVAILABLE = Object.freeze({ unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' });

async function backupUsers() {
  return UNAVAILABLE;
}

async function backupUsersToDrive() {
  return UNAVAILABLE;
}

function logBackupStatus() {
  return UNAVAILABLE;
}

module.exports = { backupUsers, backupUsersToDrive, logBackupStatus };
