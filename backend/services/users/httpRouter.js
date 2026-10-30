'use strict';
const express = require('express');
const A = require('../auth/persistence');
const { sendFailure } = require('../auth/httpErrors');
function createUsersRouter(context, { upload, cloudinary } = {}) {
  // Trusted composition dependencies only; never request-selected providers.
  upload ||= require('../../middlewares/upload');
  cloudinary ||= require('../../config/cloudinary');
  const { auth, csrf, adapter, userRepository: users } = context;
  const router = express.Router(), json = express.json({ limit: '16kb', strict: true });
  const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (e) { sendFailure(req, res, e); } };
  const self = [auth.verifyToken, auth.requireSelf(), csrf.doubleCsrfProtection];
  const admin = [auth.verifyToken, auth.checkAdmin, auth.requireSelfOrAdmin(), csrf.doubleCsrfProtection];
  const principal = req => req.auth.principal;
  const publicUser = req => { const user = { ...req.user }; delete user._id; delete user.tokenVersion; return user; };
  const finish = async (req, res, body) => { await adapter.persistResponse(req, res); res.json(body); };
  const fields = (body, allowed) => A.fields(body, ['expectedRowVersion', ...allowed], ['expectedRowVersion']);
  const patch = (body, allowed) => Object.fromEntries(allowed.filter(k => Object.hasOwn(body, k)).map(k => [k, body[k]]));
  const owned = id => A.match(/^payments_receipts\/[a-f0-9-]{36}$/, id);
  async function discard(id) {
    if (!owned(id)) return;
    try { await cloudinary.uploader.destroy(id, { resource_type: 'image', type: 'upload', invalidate: true, timeout: 5000 }); }
    catch (_) { /* Best effort, no raw provider errors or arbitrary asset cleanup. */ }
  }
  function oldAsset(url) {
    try {
      const u = new URL(url), name = cloudinary.config().cloud_name;
      if (!name || u.origin !== 'https://res.cloudinary.com' || u.search || u.hash || u.username || u.password ||
          !u.pathname.startsWith(`/${name}/image/upload/`)) return null;
      const id = u.pathname.match(/\/(payments_receipts\/[a-f0-9-]{36})\.jpg$/)?.[1];
      return owned(id) ? id : null;
    } catch (_) { return null; }
  }
  for (const name of ['reserve', 'restore']) router.all(`/:id/${name}`, (req, res) => {
    req.session = null;
    res.set('Cache-Control', 'no-store').status(410).json({ success: false, code: 'ENDPOINT_DISABLED', error: 'ENDPOINT_DISABLED' });
  });
  router.use((req, res, next) => {
    try { adapter.requireSession(req); res.set('Cache-Control', 'no-store'); next(); } catch (e) { sendFailure(req, res, e); }
  });
  router.get('/', auth.verifyToken, auth.checkAdmin, wrap(async (req, res) => {
    A.fields(req.query, ['limit', 'before', 'role', 'accountStatus'], []);
    const input = { principal: principal(req), ...req.query };
    if (input.limit !== undefined) {
      if (!A.match(/^(?:[1-9][0-9]?|100)$/, input.limit)) throw A.fail('INVALID_PAGINATION', 400);
      input.limit = Number(input.limit);
    }
    const page = await users.listUsers(input);
    await finish(req, res, page);
  }));
  router.get('/me', auth.verifyToken, wrap((req, res) => finish(req, res, publicUser(req))));
  router.get('/:id', auth.verifyToken, auth.requireSelfOrAdmin(), wrap(async (req, res) => {
    const user = req.params.id === principal(req).userId ? publicUser(req) : await users.findById(req.params.id);
    if (!user) throw A.fail('USER_NOT_FOUND', 404);
    await finish(req, res, user);
  }));
  router.get('/:id/balance', auth.verifyToken, auth.requireSelfOrAdmin(), wrap(async (req, res) => {
    const user = req.params.id === principal(req).userId ? publicUser(req) : await users.findById(req.params.id);
    if (!user) throw A.fail('USER_NOT_FOUND', 404);
    await finish(req, res, { balanceCents: user.balanceCents, balance: user.balance, rowVersion: user.rowVersion });
  }));
  router.put('/:id', ...self, json, wrap(async (req, res) => {
    const allowed = ['username', 'email', 'phone', 'theme', 'password', 'currentPassword'];
    fields(req.body, allowed);
    const result = await users.updateProfileAtomic({ principal: principal(req), expectedRowVersion: req.body.expectedRowVersion, patch: patch(req.body, allowed) });
    if (result.requiresReauthentication) { adapter.clearCookies(req, res); res.json({ success: true, ...result }); }
    else await finish(req, res, { success: true, ...result });
  }));
  router.put('/:id/theme', ...self, json, wrap(async (req, res) => {
    fields(req.body, ['theme']);
    const result = await users.updateProfileAtomic({ principal: principal(req), expectedRowVersion: req.body.expectedRowVersion, patch: { theme: req.body.theme } });
    await finish(req, res, { success: true, ...result });
  }));
  router.put('/:id/balance', ...admin, (req, res) => {
    req.session = null;
    res.status(503).json({ success: false, code: 'FINANCIAL_UNAVAILABLE', error: 'FINANCIAL_UNAVAILABLE' });
  });
  for (const [method, path, mutate] of [['put', '/:id/activate', users.activateAccount], ['delete', '/:id', users.deactivateAccount]]) {
    router[method](path, ...admin, json, wrap(async (req, res) => {
      fields(req.body, []);
      const result = await mutate({ principal: principal(req), userId: req.params.id, expectedRowVersion: req.body.expectedRowVersion });
      if (req.params.id === principal(req).userId) { adapter.clearCookies(req, res); res.json({ success: true, ...result }); }
      else await finish(req, res, { success: true, ...result });
    }));
  }
  router.post('/:id/avatar', ...self, (req, res, next) => {
    try {
      // Multipart retains fields:0. CAS goes in this dedicated header, not a
      // client URL/public ID or an implicit fresh-version read after upload.
      req.avatarRowVersion = A.integer(req.headers['x-row-version']);
      if (req.avatarRowVersion !== req.user.rowVersion) throw A.fail('USER_VERSION_CONFLICT');
      next();
    } catch (e) { sendFailure(req, res, e); }
  }, upload.single('avatar'), wrap(async (req, res) => {
    let committed = false;
    try {
      A.fields(req.body || {}, [], []);
      if (!req.file || !owned(req.file.filename) || typeof req.file.path !== 'string' || oldAsset(req.file.path) !== req.file.filename) throw A.fail('INVALID_AVATAR', 400);
      const result = await users.updateProfileAtomic({ principal: principal(req), expectedRowVersion: req.avatarRowVersion, patch: { avatar: req.file.path } });
      committed = true;
      await finish(req, res, { success: true, avatar: result.user.avatar, user: result.user });
    } catch (e) {
      // Lost COMMIT acknowledgement is not permission to erase a possibly
      // accepted avatar. Preserve it and return the fixed unknown-outcome error.
      if (!committed && e.code !== 'AUTH_OUTCOME_UNKNOWN') await discard(req.file?.filename);
      throw e;
    }
  }));
  router.post('/:id/avatar/remove', ...self, json, wrap(async (req, res) => {
    fields(req.body, []);
    const id = oldAsset(req.user.avatar);
    const result = await users.updateProfileAtomic({ principal: principal(req), expectedRowVersion: req.body.expectedRowVersion, patch: { avatar: '' } });
    await discard(id); // Only after positively committed CAS; foreign URLs never deleted.
    await finish(req, res, { success: true, avatar: '', user: result.user });
  }));
  router.use((error, req, res, next) => {
    if (error?.name === 'MulterError') return sendFailure(req, res, A.fail('INVALID_AVATAR', 400));
    return context.errorMiddleware(error, req, res, next);
  });
  return router;
}
module.exports = { createUsersRouter };
