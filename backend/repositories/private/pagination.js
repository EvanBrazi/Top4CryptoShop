'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');
const A = require('../../services/auth/persistence');
function cursorCodec(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw A.fail('CURSOR_SECRET_REQUIRED', 503);
  const sign = body => createHmac('sha256', secret).update('pagination:v1\0').update(body).digest('base64url');
  return Object.freeze({
    encode(time, id, binding) { return (() => { const b = Buffer.from(JSON.stringify([1, time, id, binding])).toString('base64url'); return `${b}.${sign(b)}`; })(); },
    decode(cursor, binding) {
      if (typeof cursor !== 'string' || cursor.length > 2048 || !A.match(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/, cursor)) throw A.fail('INVALID_PAGINATION', 400);
      const [b, s] = cursor.split('.'), expected = sign(b);
      if (!timingSafeEqual(Buffer.from(s), Buffer.from(expected))) throw A.fail('INVALID_PAGINATION', 400);
      let data; try { data = JSON.parse(Buffer.from(b, 'base64url').toString('utf8')); } catch (_) { throw A.fail('INVALID_PAGINATION', 400); }
      if (!Array.isArray(data) || data.length !== 4 || data[0] !== 1 || data[3] !== binding ||
          !A.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/, data[1]) || !Number.isFinite(Date.parse(data[1]))) throw A.fail('INVALID_PAGINATION', 400);
      A.uuid(data[2]); return { time: data[1], id: data[2] };
    }
  });
}
function limit(value = 50) { if (!Number.isInteger(value) || value < 1 || value > 100) throw A.fail('INVALID_PAGINATION', 400); return value; }
const stamp = alias => `to_char(${alias}.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
module.exports = { cursorCodec, limit, stamp };
