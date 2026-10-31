'use strict';
// Real listener and application composition against guarded verified-TLS PG18.
// HTTP requests use loopback even when the listener binds all IPv4 interfaces.
const request = require('supertest');
const { createApplication } = require('../server');
const H = require('./helpers/disposablePg');

jest.setTimeout(30000);
const UP = { status: 'ok', ready: true, database: 'postgresql' };
let db, runtime, savedEnv;

function setNodeEnv(value) {
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
}
function options() {
  return { poolProvider: () => db.pool, staticFiles: false, authOptions: {
    lookupSecret: H.LOOKUP_SECRET, jwtSecret: H.JWT_SECRET,
    sessionSecret: 'bind-session-secret-'.repeat(4), cursorSecret: H.CURSOR_SECRET,
    googleConfig: { clientId: 'bind-test.apps.googleusercontent.com', clientSecret: 'test-google-secret',
      callbackUrl: 'http://localhost/api/auth/google/callback' }
  } };
}
async function started(startOptions, expectedHost) {
  runtime = createApplication(options());
  expect(runtime.ready).toBe(false);
  expect(runtime.server.listening).toBe(false);
  expect(runtime.server.address()).toBeNull();
  const server = await runtime.start(startOptions);
  expect(server).toBe(runtime.server);
  expect(runtime.ready).toBe(true);
  expect(server.listening).toBe(true);
  const address = server.address();
  expect(address).toEqual({ address: expectedHost, family: 'IPv4', port: expect.any(Number) });
  expect(address.port).toBeGreaterThan(0);
  expect(address.port).toBeLessThanOrEqual(65535);
  const response = await request(`http://127.0.0.1:${address.port}`).get('/health').expect(200);
  expect(response.body).toEqual(UP);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['set-cookie']).toBeUndefined();
}

beforeAll(async () => { db = await H.open(); });
beforeEach(async () => {
  savedEnv = ['NODE_ENV', 'PORT'].map(name => [name, process.env[name]]);
  process.env.PORT = '0'; // Exercise the PORT default with an OS-assigned ephemeral port.
  runtime = null;
  await db.reset();
});
afterEach(async () => {
  try {
    await runtime?.close();
    if (runtime) {
      expect(runtime.ready).toBe(false);
      expect(runtime.server.listening).toBe(false);
      expect(runtime.server.address()).toBeNull();
    }
  } finally {
    for (const [name, value] of savedEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    runtime = null;
  }
});
afterAll(async () => { await db?.close(); });

test.each([
  { label: 'production', nodeEnv: 'production', host: '0.0.0.0' },
  { label: 'development', nodeEnv: 'development', host: '127.0.0.1' },
  { label: 'test', nodeEnv: 'test', host: '127.0.0.1' },
  { label: 'unset', nodeEnv: undefined, host: '127.0.0.1' }
])('NODE_ENV=$label default binds $host and serves PostgreSQL health', async ({ nodeEnv, host }) => {
  setNodeEnv(nodeEnv);
  await started(undefined, host); // No explicit host or port: exercise start() defaults.
});

test.each([
  { nodeEnv: 'production', host: '127.0.0.1' },
  { nodeEnv: 'development', host: '0.0.0.0' }
])('NODE_ENV=$nodeEnv honors explicit host=$host and serves PostgreSQL health', async ({ nodeEnv, host }) => {
  setNodeEnv(nodeEnv);
  await started({ host, port: 0 }, host);
});
