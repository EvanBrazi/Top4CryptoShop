'use strict';
const session = require('express-session');
const { createHmac, timingSafeEqual } = require('node:crypto');
const A = require('./persistence');
const META = '__top4StoreRevision';
function validateJson(value, depth = 0) {
  if (depth > 20) throw A.fail('INVALID_SESSION_DATA', 400);
  if (!value || typeof value !== 'object') return;
  for (const [key, x] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key) || /password|two.?fa.?secret|reset.?password.?token|^token$|^session_token$/i.test(key)) throw A.fail('INVALID_SESSION_DATA', 400);
    validateJson(x, depth + 1);
  }
}
function createExpressStore({ poolProvider, lookupSecret }) {
  if (typeof lookupSecret !== 'string' || Buffer.byteLength(lookupSecret) < 32) throw A.fail('SESSION_LOOKUP_SECRET_REQUIRED', 503);
  const digest = (domain, value) => {
    if (typeof value !== 'string' || !A.match(/^[A-Za-z0-9_-]{16,256}$/, value)) throw A.fail('INVALID_SESSION_ID', 400);
    return createHmac('sha256', lookupSecret).update(domain + ':v1\0').update(value).digest('hex');
  };
  const seal = (sidDigest, id, version) => createHmac('sha256', lookupSecret).update(`revision:v1\0${sidDigest}\0${id}\0${version}`).digest('hex');
  const metadata = (sidDigest, row) => ({ id: row.id, version: row.row_version, seal: seal(sidDigest, row.id, row.row_version) });
  const checked = (sidDigest, m) => {
    A.fields(m, ['id', 'version', 'seal']); A.uuid(m.id); A.integer(m.version);
    if (!A.match(/^[a-f0-9]{64}$/, m.seal) || !timingSafeEqual(Buffer.from(m.seal), Buffer.from(seal(sidDigest, m.id, m.version)))) throw A.fail('SESSION_VERSION_CONFLICT');
    return m;
  };
  const mutable = data => {
    if (!data || typeof data !== 'object') throw A.fail('INVALID_SESSION_DATA', 400);
    const d = Object.getOwnPropertyDescriptor(data, META);
    if (d ? !Object.hasOwn(d, 'value') || !d.writable : !Object.isExtensible(data)) throw A.fail('INVALID_SESSION_DATA', 400);
  };
  const expiry = data => {
    const value = data?.cookie?.expires;
    const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now() || date.getTime() > Date.now() + 86400000 + 1000) throw A.fail('INVALID_SESSION_EXPIRY', 400);
    return date.toISOString();
  };
  class PgSessionStore extends session.Store {
    constructor() { super(); }
    get(sid, callback) {
      Promise.resolve().then(async () => {
        const hash = digest('express', sid);
        const row = A.one(await poolProvider().query({ text: `SELECT id, session_data, row_version FROM public.express_sessions
          WHERE sid_digest = $1 AND revoked_at IS NULL AND expires_at > statement_timestamp()`, values: [hash], query_timeout: 5000 }));
        if (!row) return null;
        validateJson(row.session_data); return { ...row.session_data, [META]: metadata(hash, row) };
      }).then(x => callback(null, x), () => callback(A.fail('SESSION_UNAVAILABLE', 503)));
    }
    set(sid, data, callback = () => {}) {
      Promise.resolve().then(async () => {
        mutable(data);
        const hash = digest('express', sid), expires = expiry(data);
        const plain = { ...data }; delete plain[META];
        const bytes = JSON.stringify(plain); if (Buffer.byteLength(bytes) > 65536) throw A.fail('INVALID_SESSION_DATA', 400);
        const json = JSON.parse(bytes); validateJson(json);
        const m = data[META] ? checked(hash, data[META]) : null;
        const row = await A.transaction(poolProvider, async q => m
          ? A.one(await q(`UPDATE public.express_sessions SET session_data = $1::JSONB, expires_at = $2::TIMESTAMPTZ
              WHERE id = $3::UUID AND sid_digest = $4 AND row_version = $5::BIGINT AND revoked_at IS NULL
              AND expires_at > statement_timestamp() AND (user_id IS NULL OR
                (session_data->'userId' = ($1::JSONB)->'userId' AND session_data->'csrfToken' = ($1::JSONB)->'csrfToken'))
              AND NOT EXISTS (SELECT 1 FROM public.application_sessions a
                WHERE a.express_session_id = $3::UUID AND a.revoked_at IS NULL AND a.expires_at > $2::TIMESTAMPTZ)
              RETURNING id, row_version`, [bytes, expires, m.id, hash, m.version]), 'SESSION_VERSION_CONFLICT')
          : A.one(await q(`INSERT INTO public.express_sessions (sid_digest, session_data, expires_at)
              VALUES ($1, $2::JSONB, $3::TIMESTAMPTZ) ON CONFLICT (sid_digest) DO NOTHING RETURNING id, row_version`, [hash, bytes, expires]), 'SESSION_VERSION_CONFLICT'));
        data[META] = metadata(hash, row);
      }).then(() => callback(null), e => callback(e.name === 'AuthPersistenceError' ? e : A.fail('SESSION_UNAVAILABLE', 503)));
    }
    touch(sid, data, callback = () => {}) {
      Promise.resolve().then(async () => {
        mutable(data);
        const hash = digest('express', sid), expires = expiry(data), m = checked(hash, data[META]);
        const row = await A.transaction(poolProvider, async q => A.one(await q(`UPDATE public.express_sessions SET expires_at = $1::TIMESTAMPTZ
          WHERE id = $2::UUID AND sid_digest = $3 AND row_version = $4::BIGINT AND revoked_at IS NULL
          AND expires_at > statement_timestamp() AND NOT EXISTS (SELECT 1 FROM public.application_sessions a
            WHERE a.express_session_id = $2::UUID AND a.revoked_at IS NULL AND a.expires_at > $1::TIMESTAMPTZ)
          RETURNING id, row_version`, [expires, m.id, hash, m.version]), 'SESSION_VERSION_CONFLICT'));
        data[META] = metadata(hash, row);
      }).then(() => callback(null), e => callback(e.name === 'AuthPersistenceError' ? e : A.fail('SESSION_UNAVAILABLE', 503)));
    }
    destroy(sid, callback = () => {}) {
      Promise.resolve().then(() => A.transaction(poolProvider, async q => {
        const hash = digest('express', sid);
        const hint = A.one(await q('SELECT id, user_id FROM public.express_sessions WHERE sid_digest = $1', [hash]));
        if (!hint) return;
        if (hint.user_id) { await A.lockAccounts(q, [hint.user_id]); await A.revokeGraph(q, hint.user_id, 'express_session_destroyed', hint.id); }
        else {
          const row = A.one(await q('SELECT user_id FROM public.express_sessions WHERE id = $1::UUID FOR UPDATE', [hint.id]));
          if (row?.user_id) throw A.fail('SESSION_VERSION_CONFLICT');
          await q(`UPDATE public.express_sessions SET revoked_at = statement_timestamp(), session_data = '{}'::JSONB WHERE id = $1::UUID AND revoked_at IS NULL`, [hint.id]);
        }
      })).then(() => callback(null), e => callback(e.name === 'AuthPersistenceError' ? e : A.fail('SESSION_UNAVAILABLE', 503)));
    }
  }
  return { store: new PgSessionStore(), digest, metadata, META };
}
module.exports = { createExpressStore };
