'use strict';
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const C = require('./contracts');
const { sendFailure } = require('./financialErrors');
function common(context) {
  const { auth, csrf, adapter } = context;
  const router = express.Router();
  const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (e) { sendFailure(req, res, e); } };
  router.use((req, res, next) => {
    try { adapter.requireSession(req); res.set('Cache-Control', 'no-store'); next(); }
    catch (e) { sendFailure(req, res, e); }
  });
  const json = express.json({ limit: '16kb', strict: true });
  const limiter = rateLimit({ windowMs: 60000, limit: 60, keyGenerator: req => req.auth.principal.userId,
    handler: (req, res) => sendFailure(req, res, C.fail('FINANCIAL_RATE_LIMITED', 429)) });
  const unsafe = [csrf.doubleCsrfProtection, limiter];
  const principal = req => req.auth.principal; // From reviewed verifyToken, NEVER body.
  const fields = (value, allowed, required = []) => C.fields(value, allowed, required);
  function query(req, admin = false, pending = false, summary = false, detail = false) {
    const allowed = [...(admin && !detail ? ['userId'] : []),
      ...(!summary && !detail ? ['limit', 'before', ...(pending ? [] : ['status'])] : [])];
    fields(req.query, allowed);
    const result = { principal: principal(req), ...req.query };
    if (result.limit !== undefined) {
      if (!C.matches(/^(?:[1-9][0-9]?|100)$/, result.limit)) throw C.fail('INVALID_PAGINATION', 400);
      result.limit = Number(result.limit);
    }
    return result;
  }
  async function read(req, res, value) { await adapter.persistResponse(req, res); res.json(value); }
  function committed(req, res, value, status = 200) {
    // No session JSON changes. A parent CAS/save failure must not mask a commit.
    req.session = null;
    res.status(status).json(value);
  }
  function found(value, kind) { if (!value) throw C.fail(kind === 'order' ? 'ORDER_NOT_FOUND' : 'PAYMENT_NOT_FOUND', 404); return value; }
  function errors(error, req, res, next) {
    if (res.headersSent) { req.session = null; return next(C.fail('FINANCIAL_UNAVAILABLE', 503)); }
    if (error?.type === 'entity.too.large' || error?.type === 'entity.parse.failed' || error instanceof SyntaxError) error = C.fail('INVALID_FINANCIAL_INPUT', 400);
    return sendFailure(req, res, error);
  }
  return { router, auth, wrap, json, unsafe, principal, fields, query, read, committed, found, errors };
}
module.exports = { common };
