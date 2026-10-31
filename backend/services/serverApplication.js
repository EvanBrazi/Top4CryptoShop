'use strict';
// Import-safe C1 composition. Startup NEVER applies migrations or grants.
const express = require('express');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const { getPool } = require('../db/pg');
const { verifyRuntime } = require('../db/verify-runtime');
const { createAuthContext } = require('./auth/httpContext');
const { createAuthRouter } = require('../routes/auth');
const { createUsersRouter } = require('../routes/users');
const { createOrdersRouter } = require('../routes/orders');
const { createPaymentsRouter } = require('../routes/payments');
const { createFinancialContext } = require('./financial/httpContext');
const ORIGINS = ['https://top4cryptoshop.giize.com', 'https://top4cryptoshop.giize.com:10000',
  'http://localhost:10000', 'http://localhost:8081', 'http://192.168.43.108:8081',
  'exp://192.168.43.108:8081', 'http://localhost:19006', 'http://localhost:19000',
  'https://top4cryptoshop.onrender.com:10000'];
function createApplication({ poolProvider = getPool, authOptions = {}, avatarOptions = {}, financialOptions = {},
  allowedOrigins = ORIGINS, trustProxy = false, staticFiles = true } = {}) {
  const context = createAuthContext({ ...authOptions, poolProvider });
  const financial = createFinancialContext(context, { ...financialOptions, poolProvider,
    cursorSecret: authOptions.cursorSecret ?? process.env.CURSOR_SECRET });
  const app = express(); app.disable('x-powered-by'); app.set('trust proxy', trustProxy);
  const server = http.createServer(app);
  let ready = false, starting = false;
  const unavailable = (req, res) => {
    req.session = null;
    res.set('Cache-Control', 'no-store').status(503).json({ success: false, code: 'FEATURE_UNAVAILABLE', error: 'FEATURE_UNAVAILABLE' });
  };
  app.use(require('../middleware/security')); // Helmet only, NOT routes/security.
  app.get('/health', async (req, res) => {
    let healthy = ready;
    if (healthy) {
      try {
        await poolProvider().query({ text: 'SELECT 1 AS connected', query_timeout: 2000 });
        healthy = ready; // Shutdown/reinitialization during the live probe must not publish stale readiness.
      } catch (_) { healthy = false; }
    }
    res.set('Cache-Control', 'no-store').status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'NOT_READY', ready: healthy, database: 'postgresql'
    });
  });
  app.use((req, res, next) => {
    if (ready) return next();
    res.set('Cache-Control', 'no-store').status(503).json({ success: false, code: 'SERVICE_NOT_READY', error: 'SERVICE_NOT_READY' });
  });
  app.use(require('cors')({ origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(Object.assign(new Error('CORS_FORBIDDEN'), { code: 'CORS_FORBIDDEN' }));
  }, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'x-session-id', 'x-row-version', 'x-submission-id'],
  exposedHeaders: ['x-csrf-token'], maxAge: 86400 }));
  app.use(require('cookie-parser')());
  app.use('/api', require('express-rate-limit').rateLimit({ windowMs: 15 * 60 * 1000, limit: 10000,
    message: { success: false, code: 'RATE_LIMITED', error: 'RATE_LIMITED' } }));
  // C2: reviewed sessions and PostgreSQL-only financial routes; no notifications.
  app.use('/api/orders', context.sessionMiddleware, createOrdersRouter(context, financial));
  app.use('/api/payments', context.sessionMiddleware, createPaymentsRouter(context, financial));
  // C3/C4 TODO: notifications and WebSocket initialization remain DISABLED.
  // C3/C4 TODO: backups and jobs/scheduler remain DISABLED (no Mongo imports).
  // C3/C4 TODO: routes/security and routes/icons remain DISABLED (no imports).
  // Other unported Mongo entry points are unavailable, not runtime fallbacks.
  for (const prefix of ['/api/notifications', '/api/backups', '/api/security', '/api/icons', '/api/admin', '/api/cards', '/dev', '/api/compare-token']) app.use(prefix, unavailable);
  app.use('/api/auth', context.sessionMiddleware, createAuthRouter(context));
  // Hard-disabled endpoints must not even consult session storage.
  app.all(['/api/users/:id/reserve', '/api/users/:id/restore'], (req, res) => {
    res.set('Cache-Control', 'no-store').status(410).json({ success: false, code: 'ENDPOINT_DISABLED', error: 'ENDPOINT_DISABLED' });
  });
  app.use('/api/users', context.sessionMiddleware, createUsersRouter(context, avatarOptions));
  app.use('/api', require('../routes/catalog')); // Filesystem-only, fail-closed catalogs.
  app.get('/api/essential', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(JSON.parse(await fs.readFile(path.join(__dirname, '../data/essential.json'), 'utf8'))); }
    catch (_) { res.status(503).json({ code: 'CONFIGURATION_UNAVAILABLE', error: 'CONFIGURATION_UNAVAILABLE' }); }
  });
  app.use('/api', (req, res) => res.status(404).json({ code: 'NOT_FOUND', error: 'NOT_FOUND' }));
  // Block private legacy receipts before BOTH static roots; no file migration.
  app.use('/images/payments', (req, res) => res.set('Cache-Control', 'no-store').status(410).json({ code: 'LEGACY_RECEIPT_UNAVAILABLE' }));
  const staticPath = path.join(__dirname, '../../frontend/public');
  const page = file => (req, res) => res.sendFile(file, error => {
    if (error && !res.headersSent) res.status(404).send('NOT_FOUND');
  });
  const protectedPage = file => async (req, res, next) => {
    try { await context.adapter.persistResponse(req, res); page(file)(req, res); }
    catch (error) { next(error); }
  };
  app.get(['/homepage', '/homepage.html'], context.sessionMiddleware, context.auth.verifyToken, context.auth.checkAdmin,
    protectedPage(path.join(staticPath, 'homepage.html')));
  app.get(['/admin', '/admin.html'], context.sessionMiddleware, context.auth.verifyToken, context.auth.checkAdmin,
    protectedPage(path.join(__dirname, '../protectedViews/admin.html')));
  if (staticFiles) {
    for (const [route, name] of [['/', 'dashboard'], ['/dashboard', 'dashboard'], ['/register', 'register'], ['/login', 'login']]) app.get(route, page(path.join(staticPath, name + '.html')));
    app.use(express.static(path.join(__dirname, '../public')));
    app.use(express.static(staticPath, { maxAge: '1d' }));
  }
  app.use((req, res) => res.status(404).json({ code: 'NOT_FOUND', error: 'NOT_FOUND' }));
  app.use((error, req, res, next) => {
    if (error?.code === 'CORS_FORBIDDEN') return res.status(403).json({ code: 'CORS_FORBIDDEN', error: 'CORS_FORBIDDEN' });
    return context.errorMiddleware(error, req, res, next);
  });
  async function initialize() {
    ready = false;
    const result = await verifyRuntime({ poolProvider });
    ready = true; return result;
  }
  async function start({ port = Number(process.env.PORT || 10000), host = '127.0.0.1' } = {}) {
    if (starting || server.listening) throw new Error('SERVER_ALREADY_STARTED');
    starting = true;
    try {
      await initialize();
      await new Promise((resolve, reject) => {
        const onError = error => { server.removeListener('listening', onListen); reject(error); };
        const onListen = () => { server.removeListener('error', onError); resolve(); };
        server.once('error', onError); server.once('listening', onListen); server.listen(port, host);
      });
      return server;
    } catch (error) { ready = false; throw error; }
    finally { starting = false; }
  }
  async function close() {
    ready = false;
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  return Object.freeze({ app, server, initialize, start, close, get ready() { return ready; } });
}
module.exports = { createApplication };
