'use strict';
// Private authentication persistence. Never a route-facing transaction API.
const MAX = 9007199254740991n;
class AuthPersistenceError extends Error {
  constructor(code, status = 409) { super(code); this.name = 'AuthPersistenceError'; this.code = code; this.status = status; }
}
const fail = (code, status) => new AuthPersistenceError(code, status);
const match = (re, x) => typeof x === 'string' && re.exec(x)?.[0] === x;
function fields(x, allowed, required = allowed) {
  if (!x || ![Object.prototype, null].includes(Object.getPrototypeOf(x))) throw fail('INVALID_AUTH_INPUT', 400);
  const keys = Reflect.ownKeys(x);
  if (required.some(k => !keys.includes(k)) || keys.some(k => typeof k !== 'string' || !allowed.includes(k) ||
      !Object.hasOwn(Object.getOwnPropertyDescriptor(x, k), 'value'))) throw fail('INVALID_AUTH_INPUT', 400);
}
function uuid(x) { if (!match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, x)) throw fail('INVALID_USER_ID', 400); return x; }
function integer(x) { if (!match(/^(0|[1-9][0-9]{0,15})$/, x) || BigInt(x) > MAX) throw fail('INVALID_AUTH_VERSION', 400); return x; }
function principal(x) { fields(x, ['userId', 'tokenVersion']); return Object.freeze({ userId: uuid(x.userId), tokenVersion: integer(x.tokenVersion) }); }
function one(r, code) { if (!Array.isArray(r?.rows) || r.rows.length > 1) throw fail('AUTH_STATE_INVALID'); if (!r.rows.length && code) throw fail(code); return r.rows[0] || null; }
function authorize(p, rows, admin = false) {
  const actor = rows.find(r => r.id === p.userId);
  if (!actor || actor.account_status !== 'active' || actor.token_version !== p.tokenVersion || admin && actor.role !== 'admin') throw fail('AUTH_FORBIDDEN', 403);
  return actor;
}
const ACCOUNT_COLUMNS = `id, role, account_status, token_version, row_version, login_attempts, two_fa_status, provider`;
async function lockAccounts(q, ids) {
  const unique = [...new Set(ids)].sort(); unique.forEach(uuid);
  const r = await q(`SELECT ${ACCOUNT_COLUMNS} FROM public.users WHERE id = ANY($1::UUID[]) ORDER BY id FOR UPDATE`, [unique]);
  if (r.rows.length !== unique.length) throw fail('USER_NOT_FOUND', 404);
  return r.rows;
}
async function revokeGraph(q, userId, reason, parentId = null) {
  // Caller holds account locks. Lock complete parent set before any child.
  const parents = (await q(`SELECT id FROM public.express_sessions WHERE user_id = $1::UUID
    AND ($2::UUID IS NULL OR id = $2::UUID) ORDER BY id FOR UPDATE`, [userId, parentId])).rows;
  const ids = parents.map(r => r.id);
  await q(`SELECT id FROM public.application_sessions WHERE user_id = $1::UUID
    AND ($2::UUID IS NULL OR express_session_id = $2::UUID) ORDER BY id FOR UPDATE`, [userId, parentId]);
  await q(`UPDATE public.express_sessions SET revoked_at = statement_timestamp(), session_data = '{}'::JSONB
    WHERE id = ANY($1::UUID[]) AND revoked_at IS NULL`, [ids]);
  await q(`UPDATE public.application_sessions SET revoked_at = statement_timestamp(), revocation_reason = $2
    WHERE user_id = $1::UUID AND revoked_at IS NULL AND ($3::UUID IS NULL OR express_session_id = $3::UUID)`, [userId, reason, parentId]);
}
// Confirmed rollback is the prerequisite for retry. Unknown COMMIT never retries.
async function transaction(poolProvider, work, { readOnlySnapshot = false, onRollbackConfirmed = null } = {}) {
  const deadline = Date.now() + 30000;
  for (let attempt = 0; attempt < 3; attempt++) {
    let client, begun = false, broken = false, committing = false, confirmed = false, rejected = false, busy = false;
    const onError = () => { broken = true; };
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw fail('AUTH_UNAVAILABLE', 503);
      client = await new Promise((resolve, reject) => {
        let expired = false;
        const timer = setTimeout(() => { expired = true; reject(fail('AUTH_UNAVAILABLE', 503)); }, remaining);
        Promise.resolve().then(() => poolProvider().connect()).then(c => {
          clearTimeout(timer); if (expired) { try { c.release(); } catch (_) {} } else resolve(c);
        }, e => { clearTimeout(timer); reject(e); });
      });
      client.on?.('error', onError);
      const q = async (text, values = []) => {
        if (busy || broken || Date.now() >= deadline) throw fail('AUTH_UNAVAILABLE', 503);
        busy = true;
        try { return await client.query({ text, values, query_timeout: Math.min(5000, deadline - Date.now()) }); }
        catch (e) {
          if (!match(/^[0-9A-Z]{5}$/, e.code) || ['FATAL', 'PANIC'].includes(e.severity) || /^(08|57P|25P03)/.test(e.code)) broken = true;
          throw e;
        } finally { busy = false; }
      };
      begun = true;
      if ((await q(readOnlySnapshot ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN ISOLATION LEVEL READ COMMITTED')).command !== 'BEGIN') throw fail('AUTH_UNAVAILABLE', 503);
      await q('SET LOCAL search_path = pg_catalog, public');
      await q("SET LOCAL lock_timeout = '2s'");
      await q("SET LOCAL statement_timeout = '5s'");
      await q("SET LOCAL idle_in_transaction_session_timeout = '10s'");
      const result = await work(q);
      committing = true;
      const commit = await q('COMMIT');
      if (commit.command === 'ROLLBACK') { rejected = true; throw fail('AUTH_UNAVAILABLE', 503); }
      if (commit.command !== 'COMMIT') throw fail('AUTH_OUTCOME_UNKNOWN', 503);
      confirmed = true;
      return result;
    } catch (e) {
      const definitive = rejected || e.severity === 'ERROR' && ['40001', '40P01', '23505', '23503', '23514', '55P03', '57014'].includes(e.code);
      if (committing && !confirmed && !definitive) { broken = true; throw fail('AUTH_OUTCOME_UNKNOWN', 503); }
      let rolledBack = !begun;
      if (client && begun && !broken) {
        try { rolledBack = (await client.query({ text: 'ROLLBACK', values: [], query_timeout: 1000 })).command === 'ROLLBACK'; }
        catch (_) { rolledBack = false; }
        broken = !rolledBack;
      }
      begun = false;
      if (rolledBack && ['40001', '40P01'].includes(e.databaseCode || e.code) && attempt < 2 && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 25 * 2 ** attempt)); continue;
      }
      // Private observer: only the FINAL positively rolled-back failure, not a retry.
      if (rolledBack && onRollbackConfirmed) { try { onRollbackConfirmed(); } catch (_) {} }
      if (e instanceof AuthPersistenceError || e.name === 'UserRepositoryError' || e.name === 'FinancialCoordinatorError') throw e;
      if (e.code === '23505') throw fail('AUTH_CONFLICT');
      if (['40001', '40P01'].includes(e.code)) throw fail('AUTH_RETRY_EXHAUSTED', 503);
      throw fail('AUTH_UNAVAILABLE', 503);
    } finally {
      if (client) {
        if (begun && !confirmed && !broken) {
          try { if ((await client.query({ text: 'ROLLBACK', values: [], query_timeout: 1000 })).command !== 'ROLLBACK') broken = true; }
          catch (_) { broken = true; }
        }
        client.removeListener?.('error', onError);
        try { client.release(broken); } catch (_) { console.error('Authentication client cleanup failed'); }
      }
    }
  }
  throw fail('AUTH_RETRY_EXHAUSTED', 503);
}
module.exports = { fail, fields, uuid, integer, principal, one, authorize, lockAccounts, revokeGraph, transaction, match, MAX };
