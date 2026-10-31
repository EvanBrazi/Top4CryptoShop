/**
 * @file routes/admin.js
 * @description واجهات الأدمن لإدارة المستخدمين وتحديث الرصيد
 * @version 2.0.0
 * @license MIT
 * @author EVAN BRAZI
 */

const express = require('express');
const router = express.Router();

// TODO C3: Port legacy admin user listing/panel routes to PostgreSQL before enabling them.
const UNAVAILABLE = Object.freeze({ unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' });
function unavailable(req, res) {
  return res.status(503).json(UNAVAILABLE);
}
const { verifyToken, checkAdmin, requireSelfOrAdmin } = require('../middlewares/auth');
const { doubleCsrfProtection } = require('../middlewares/csrfMiddleware');

// Every admin route is authenticated and admin-only, including routes added later.
router.use(verifyToken, checkAdmin);

function allowFields(body, fields) {
  return body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every(key => fields.includes(key));
}
function isValidBalance(balance) {
  return typeof balance === 'number' && Number.isFinite(balance) && balance >= 0 && balance <= Number.MAX_SAFE_INTEGER;
}

/**
 * ✅ تحديث رصيد مستخدم
 * @route PUT /update-balance/:userId
 * @access Admin
 */
router.put('/update-balance/:userId', requireSelfOrAdmin('userId'), doubleCsrfProtection, (req, res) => {
  if (!allowFields(req.body, ['balance', 'expectedBalance']) || !isValidBalance(req.body.balance) ||
      (Object.hasOwn(req.body, 'expectedBalance') && !isValidBalance(req.body.expectedBalance))) {
    return res.status(400).json({ success: false, error: 'Invalid balance adjustment fields or values' });
  }
  // No direct balance writes or unrelated tokenVersion changes: Step 2 supplies the financial service.
  return res.status(503).json({ success: false, code: 'FINANCIAL_UNAVAILABLE', error: 'Balance adjustments are disabled until the financial service is available' });
});

/**
 * ✅ جلب قائمة المستخدمين
 * @route GET /users
 * @access Admin
 */
router.get('/users', unavailable);

/**
 * ✅ عرض صفحة الأدمن المحمية
 * @route GET /panel
 * @access Admin
 */
router.get('/panel', unavailable);

module.exports = router;