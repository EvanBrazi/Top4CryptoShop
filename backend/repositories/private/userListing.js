'use strict';
const A = require('../../services/auth/persistence');
const P = require('./pagination');
const SAFE = `id, username, email, email_verified, phone, provider, theme, balance_cents, balance, avatar,
 role, account_status, two_fa_status, last_login, activated_at, row_version, created_at, updated_at`;
async function listUsers(poolProvider, safeUser, input, cursorSecret) {
  A.fields(input, ['principal', 'limit', 'before', 'role', 'accountStatus'], ['principal']);
  const p = A.principal(input.principal), n = P.limit(input.limit);
  if (input.role !== undefined && !['user', 'admin', 'moderator'].includes(input.role) ||
      input.accountStatus !== undefined && !['active', 'suspended', 'deactivated'].includes(input.accountStatus)) throw A.fail('INVALID_AUTH_INPUT', 400);
  const binding = JSON.stringify(['users', p.userId, input.role || null, input.accountStatus || null]);
  const codec = P.cursorCodec(cursorSecret), cursor = input.before !== undefined && input.before !== null ? codec.decode(input.before, binding) : null;
  return A.transaction(poolProvider, async q => {
    const authorized = A.one(await q(`SELECT id, role, account_status, token_version FROM public.users
      WHERE id = $1::UUID`, [p.userId])); A.authorize(p, authorized ? [authorized] : [], true);
    const rows = (await q(`SELECT ${SAFE.split(',').map(c => 'u.' + c.trim()).join(', ')}, ${P.stamp('u')} AS cursor_time
      FROM public.users u WHERE ($1::TEXT IS NULL OR u.role = $1) AND ($2::TEXT IS NULL OR u.account_status = $2)
      AND ($3::TIMESTAMPTZ IS NULL OR (u.created_at, u.id) < ($3::TIMESTAMPTZ, $4::UUID))
      AND EXISTS (SELECT 1 FROM public.users actor WHERE actor.id = $5::UUID AND actor.role = 'admin'
        AND actor.account_status = 'active' AND actor.token_version = $6::BIGINT)
      ORDER BY u.created_at DESC, u.id DESC LIMIT $7`, [input.role || null, input.accountStatus || null, cursor?.time || null,
      cursor?.id || null, p.userId, p.tokenVersion, n + 1])).rows;
    const page = rows.slice(0, n), last = page.at(-1);
    return Object.freeze({ items: Object.freeze(page.map(safeUser)), nextBefore: rows.length > n ? codec.encode(last.cursor_time, last.id, binding) : null });
  });
}
module.exports = { listUsers };
