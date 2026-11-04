'use strict';
// Real application composition, test-only auth configuration, and no database I/O.
const { createApplication } = require('../services/serverApplication');

const AUTH_OPTIONS = {
  lookupSecret: 'trust-proxy-test-lookup-secret-'.repeat(3),
  jwtSecret: 'trust-proxy-test-jwt-secret-'.repeat(3),
  sessionSecret: 'trust-proxy-test-session-secret-'.repeat(3),
  cursorSecret: 'trust-proxy-test-cursor-secret-'.repeat(3),
  secureCookies: false,
  googleConfig: { clientId: 'proxy-test.apps.googleusercontent.com', clientSecret: 'test-google-secret',
    callbackUrl: 'http://localhost/api/auth/google/callback' }
};

const CASES = [
  { label: 'explicit false overrides TRUST_PROXY=1', env: '1', options: { trustProxy: false }, expected: false },
  { label: 'explicit 1 overrides TRUST_PROXY=false', env: 'false', options: { trustProxy: 1 }, expected: 1 },
  { label: 'unset TRUST_PROXY defaults to false', env: undefined, expected: false },
  { label: 'empty TRUST_PROXY defaults to false', env: '', expected: false },
  { label: 'TRUST_PROXY=false resolves to false', env: 'false', expected: false },
  { label: 'TRUST_PROXY=1 resolves to one hop', env: '1', expected: 1 },
  { label: 'TRUST_PROXY=2 resolves to two hops', env: '2', expected: 2 },
  { label: 'TRUST_PROXY=true fails closed', env: 'true',
    error: 'TRUST_PROXY=true is rejected. Use a numeric hop count.' },
  { label: 'TRUST_PROXY=abc fails closed', env: 'abc',
    error: 'TRUST_PROXY invalid: abc. Allowed: unset, "false", or positive integer 1-9.' },
  { label: 'TRUST_PROXY=0 fails closed', env: '0',
    error: 'TRUST_PROXY invalid: 0. Allowed: unset, "false", or positive integer 1-9.' },
  { label: 'TRUST_PROXY=10 fails closed', env: '10',
    error: 'TRUST_PROXY invalid: 10. Allowed: unset, "false", or positive integer 1-9.' }
];

test.each(CASES)('$label', async ({ env, options = {}, expected, error }) => {
  const previous = process.env.TRUST_PROXY;
  const poolProvider = jest.fn(() => { throw new Error('Config tests must not access a database'); });
  let runtime;
  try {
    if (env === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = env;
    const build = () => createApplication({ poolProvider, staticFiles: false,
      authOptions: AUTH_OPTIONS, ...options });
    if (error) {
      expect(build).toThrow(error);
    } else {
      runtime = build();
      expect(runtime.app.get('trust proxy')).toBe(expected);
      expect(runtime.ready).toBe(false);
      expect(runtime.server.listening).toBe(false);
    }
    expect(poolProvider).not.toHaveBeenCalled();
  } finally {
    try { await runtime?.close(); }
    finally {
      if (previous === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = previous;
    }
  }
});
