'use strict';

// REVIEW DRAFT: no environment loading, driver loading or network activity here.
const { isIP } = require('node:net');

function invalid(code) {
  // Never include a URL, password, host, or parser exception in configuration errors.
  return Object.assign(new Error(code), { code });
}

function connectionOptions(env, variable, { direct = false } = {}) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw invalid('PG_TLS_VERIFICATION_DISABLED');
  const raw = env[variable];
  if (typeof raw !== 'string' || !raw || raw !== raw.trim()) throw invalid('PG_URL_REQUIRED');
  if (/[\u0000- \u007f]/.test(raw)) throw invalid('PG_URL_INVALID');
  let url;
  try { url = new URL(raw); } catch (_) { throw invalid('PG_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.hash) {
    throw invalid('PG_URL_INVALID');
  }
  const allowed = new Set(['sslmode', 'channel_binding']);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) throw invalid('PG_URL_OPTION_UNSUPPORTED');
  }
  const mode = url.searchParams.get('sslmode');
  if (mode !== null && !['require', 'verify-full'].includes(mode)) throw invalid('PG_SSLMODE_UNSUPPORTED');
  const binding = url.searchParams.get('channel_binding');
  // pg 8.23.1 enables SCRAM-PLUS when offered, but does not enforce libpq's
  // channel_binding=require. Reject that request rather than silently downgrade it.
  if (binding !== null && binding !== 'prefer') throw invalid('PG_CHANNEL_BINDING_UNSUPPORTED');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (direct && /(?:^|-)pooler(?:\.|$)/i.test(host)) throw invalid('PG_DIRECT_URL_IS_POOLED');
  let user, password, database;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch (_) { throw invalid('PG_URL_INVALID'); }
  if (!user || !password || !database || [host, user, password, database].some(value => value.includes('\0')) ||
      database.includes('/') || (url.port && (!/^\d+$/.test(url.port) || +url.port < 1 || +url.port > 65535))) {
    throw invalid('PG_URL_INVALID');
  }
  // Do NOT forward connectionString. pg's URL parser can replace an explicit ssl
  // object when sslmode/sslcert/sslkey/sslrootcert options are present in the URL.
  return {
    host, port: url.port ? Number(url.port) : 5432, user, password, database,
    ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2', ...(isIP(host) ? {} : { servername: host }) },
    enableChannelBinding: true,
    connectionTimeoutMillis: 15000,
    keepAlive: true,
    application_name: direct ? 'top4cryptoshop-migrations' : 'top4cryptoshop-api'
  };
}

module.exports = { connectionOptions };
