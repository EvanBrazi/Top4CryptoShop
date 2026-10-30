'use strict';
const { randomBytes, createHmac, createHash } = require('node:crypto');
const A = require('./persistence');
const { equal } = require('./pendingState');
const OAUTH = '__top4GoogleOAuthState';
function createGoogleOAuth({ poolProvider, lookupSecret, config, transport, stateTtlSeconds = 300 }) {
  if (!Number.isInteger(stateTtlSeconds) || stateTtlSeconds < 1 || stateTtlSeconds > 300) throw A.fail('AUTH_HTTP_CONFIGURATION_INVALID', 503);
  const express = require('./expressStore').createExpressStore({ poolProvider, lookupSecret });
  const identities = new WeakMap(), consumptions = new WeakSet();
  const identityAuthority = Object.freeze({ resolve(handle) {
    const entry = identities.get(handle);
    if (!entry || Date.now() >= entry.expiresAt) throw A.fail('AUTH_PROOF_REQUIRED', 403);
    return entry.identity;
  } });
  const hash = (domain, value) => createHmac('sha256', lookupSecret).update(domain + ':v1\0').update(value).digest('hex');
  const seal = (sidHash, parentId, csrf, s) => hash('google-state', JSON.stringify([
    sidHash, parentId, csrf, s.stateDigest, s.nonceDigest, s.codeVerifier, s.issuedAt, s.expiresAt
  ]));
  function check(parent, sidHash) {
    const s = parent.session_data[OAUTH];
    try {
      A.fields(s, ['stateDigest', 'nonceDigest', 'codeVerifier', 'issuedAt', 'expiresAt', 'seal']);
      if (!A.match(/^[a-f0-9]{64}$/, s.stateDigest) || !A.match(/^[a-f0-9]{64}$/, s.nonceDigest) ||
          !A.match(/^[A-Za-z0-9_-]{43}$/, s.codeVerifier) || !Number.isSafeInteger(s.issuedAt) ||
          !Number.isSafeInteger(s.expiresAt) || s.expiresAt <= s.issuedAt || s.expiresAt - s.issuedAt > 300000 ||
          !equal(s.seal, seal(sidHash, parent.id, parent.session_data.csrfToken, s))) throw new Error();
      return s;
    } catch (_) { throw A.fail('OAUTH_STATE_INVALID', 401); }
  }
  let provider;
  function configuredProvider() {
    if (provider) return provider;
    if (!config || typeof config.clientId !== 'string' || !config.clientId || typeof config.clientSecret !== 'string' || !config.clientSecret) throw A.fail('GOOGLE_AUTH_UNAVAILABLE', 503);
    let callback;
    try { callback = new URL(config.callbackUrl); } catch (_) { throw A.fail('GOOGLE_AUTH_UNAVAILABLE', 503); }
    if (callback.username || callback.password || callback.hash || callback.search ||
        (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(callback.hostname)))) throw A.fail('GOOGLE_AUTH_UNAVAILABLE', 503);
    if (transport) {
      // Trusted composition-root transport ONLY, never a request/profile object.
      if (typeof transport.authorizationUrl !== 'function' || typeof transport.exchangeAndVerify !== 'function') throw A.fail('GOOGLE_AUTH_UNAVAILABLE', 503);
      provider = transport;
    } else {
      const { OAuth2Client } = require('google-auth-library');
      const client = new OAuth2Client(config.clientId, config.clientSecret, config.callbackUrl);
      provider = Object.freeze({
        authorizationUrl: options => client.generateAuthUrl({ scope: ['openid', 'email', 'profile'], ...options }),
        async exchangeAndVerify({ code, codeVerifier }) {
          // The library verifies Google's signature, issuer, audience and expiry.
          const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: config.callbackUrl });
          const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
          return ticket.getPayload();
        }
      });
    }
    return provider;
  }
  async function begin(input) {
    A.fields(input, ['expressSid', 'csrfToken']);
    const p = configuredProvider(), sidHash = express.digest('express', input.expressSid);
    const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url'), codeVerifier = randomBytes(32).toString('base64url');
    const authorizationUrl = p.authorizationUrl({ state, nonce, code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(codeVerifier).digest('base64url') });
    // Do not permit a transport/configuration error to create an open redirect.
    let url; try { url = new URL(authorizationUrl); } catch (_) { throw A.fail('GOOGLE_AUTH_UNAVAILABLE', 503); }
    if (url.origin !== 'https://accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth') throw A.fail('GOOGLE_AUTH_UNAVAILABLE', 503);
    return A.transaction(poolProvider, async q => {
      const parent = A.one(await q(`SELECT id, session_data, row_version, expires_at, statement_timestamp() AS now
        FROM public.express_sessions WHERE sid_digest=$1 AND user_id IS NULL AND revoked_at IS NULL
        AND expires_at>statement_timestamp() FOR UPDATE`, [sidHash]), 'OAUTH_STATE_INVALID');
      if (!equal(input.csrfToken, parent.session_data.csrfToken) || parent.session_data[OAUTH] || parent.session_data.__top4PendingAuthentication) throw A.fail('OAUTH_STATE_INVALID', 401);
      const s = { stateDigest: hash('google-state-secret', state), nonceDigest: hash('google-nonce', nonce), codeVerifier,
        issuedAt: parent.now.getTime(), expiresAt: Math.min(parent.now.getTime() + stateTtlSeconds * 1000, parent.expires_at.getTime()) };
      s.seal = seal(sidHash, parent.id, parent.session_data.csrfToken, s);
      const data = { ...parent.session_data, [OAUTH]: s };
      const updated = A.one(await q(`UPDATE public.express_sessions SET session_data=$1::JSONB
        WHERE id=$2::UUID AND row_version=$3::BIGINT RETURNING id,row_version`, [JSON.stringify(data), parent.id, parent.row_version]), 'SESSION_VERSION_CONFLICT');
      return Object.freeze({ authorizationUrl, expressSession: Object.freeze({ ...data, [express.META]: express.metadata(sidHash, updated) }) });
    });
  }
  async function consumeState(input) {
    A.fields(input, ['expressSid', 'state']);
    if (!A.match(/^[A-Za-z0-9_-]{43}$/, input.state)) throw A.fail('OAUTH_STATE_INVALID', 401);
    const sidHash = express.digest('express', input.expressSid);
    return A.transaction(poolProvider, async q => {
      const parent = A.one(await q(`SELECT id,session_data,row_version,expires_at,statement_timestamp() AS now
        FROM public.express_sessions WHERE sid_digest=$1 AND user_id IS NULL AND revoked_at IS NULL
        AND expires_at>statement_timestamp() FOR UPDATE`, [sidHash]), 'OAUTH_STATE_INVALID');
      const s = check(parent, sidHash);
      if (parent.now.getTime() >= s.expiresAt || s.expiresAt > parent.expires_at.getTime() || !equal(s.stateDigest, hash('google-state-secret', input.state))) throw A.fail('OAUTH_STATE_INVALID', 401);
      const data = { ...parent.session_data }; delete data[OAUTH];
      const updated = A.one(await q(`UPDATE public.express_sessions SET session_data=$1::JSONB
        WHERE id=$2::UUID AND row_version=$3::BIGINT RETURNING id,row_version`, [JSON.stringify(data), parent.id, parent.row_version]), 'SESSION_VERSION_CONFLICT');
      // Persist consumption BEFORE external exchange. Replays never reach Google.
      const receipt = Object.freeze({ codeVerifier: s.codeVerifier, nonceDigest: s.nonceDigest,
        expressSession: Object.freeze({ ...data, [express.META]: express.metadata(sidHash, updated) }) });
      consumptions.add(receipt); return receipt;
    });
  }
  async function verifyCode({ code, consumed }) {
    if (!consumptions.has(consumed)) throw A.fail('OAUTH_STATE_INVALID', 401);
    consumptions.delete(consumed); // Claim synchronously before provider I/O.
    if (typeof code !== 'string' || !code || code.length > 2048 || /\s/.test(code)) throw A.fail('GOOGLE_PROVIDER_INVALID', 401);
    let payload;
    try { payload = await configuredProvider().exchangeAndVerify({ code, codeVerifier: consumed.codeVerifier }); }
    catch (_) { throw A.fail('GOOGLE_PROVIDER_INVALID', 401); }
    const now = Math.floor(Date.now() / 1000);
    if (!payload || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) || payload.aud !== config.clientId ||
        payload.azp !== undefined && payload.azp !== config.clientId || payload.email_verified !== true ||
        !A.match(/^[A-Za-z0-9_-]{1,128}$/, payload.sub) || typeof payload.email !== 'string' || payload.email.length > 254 ||
        !Number.isSafeInteger(payload.exp) || payload.exp <= now || !Number.isSafeInteger(payload.iat) || payload.iat > now + 5 ||
        payload.exp <= payload.iat || typeof payload.nonce !== 'string' || payload.nonce.length > 256 ||
        !equal(hash('google-nonce', payload.nonce), consumed.nonceDigest)) throw A.fail('GOOGLE_PROVIDER_INVALID', 401);
    const handle = Object.freeze({ toJSON: () => ({ provider: 'google' }) });
    identities.set(handle, { identity: Object.freeze({ googleId: payload.sub, email: payload.email, emailVerified: true }),
      expiresAt: Math.min(Date.now() + 300000, payload.exp * 1000) });
    return handle;
  }
  return Object.freeze({ identityAuthority, begin, consumeState, verifyCode });
}
module.exports = { createGoogleOAuth, OAUTH };
