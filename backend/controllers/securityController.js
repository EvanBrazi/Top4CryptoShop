'use strict';

// TODO C3: Port legacy 2FA enrollment and security logging to PostgreSQL.
// Disabled controller aliases perform no secret generation, email sending or persistence.
const UNAVAILABLE = Object.freeze({ unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' });

function unavailable(req, res) {
  return res.status(503).json(UNAVAILABLE);
}

module.exports = {
  generateQR: unavailable,
  verifyToken: unavailable,
  send2FAKeyByEmail: unavailable,
  verify2FAFromEmail: unavailable,
  disable2FA: unavailable
};
