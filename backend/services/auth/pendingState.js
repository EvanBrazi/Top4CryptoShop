'use strict';
// Private sealed durable first-factor receipt. No reconstruction of WeakMap proofs.
const { createHmac, timingSafeEqual } = require('node:crypto');
const A = require('./persistence');
const PENDING = '__top4PendingAuthentication';
function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length > 0 && a.length <= 256 && b.length <= 256 &&
    Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function createPendingState(lookupSecret) {
  function signature(s, hash, id, csrf) {
    return createHmac('sha256', lookupSecret).update('pending-first-factor:v1\0').update(JSON.stringify([
      hash, id, csrf, s.version, s.userId, s.tokenVersion, s.rowVersion, s.challengeDigest, s.issuedAt, s.expiresAt
    ])).digest('hex');
  }
  function seal(s, hash, id, csrf) { return Object.freeze({ ...s, seal: signature(s, hash, id, csrf) }); }
  function check(s, hash, id, csrf) {
    try {
      A.fields(s, ['version', 'userId', 'tokenVersion', 'rowVersion', 'challengeDigest', 'issuedAt', 'expiresAt', 'seal']);
      A.uuid(s.userId); A.integer(s.tokenVersion); A.integer(s.rowVersion);
      if (s.version !== 1 || !A.match(/^[a-f0-9]{64}$/, s.challengeDigest) || !A.match(/^[a-f0-9]{64}$/, s.seal) ||
          !Number.isSafeInteger(s.issuedAt) || !Number.isSafeInteger(s.expiresAt) || s.expiresAt <= s.issuedAt ||
          s.expiresAt - s.issuedAt > 300000 || !equal(s.seal, signature(s, hash, id, csrf))) throw Error();
      return s;
    } catch (_) { throw A.fail('AUTH_CHALLENGE_INVALID', 401); }
  }
  return { seal, check };
}
module.exports = { PENDING, equal, createPendingState };
