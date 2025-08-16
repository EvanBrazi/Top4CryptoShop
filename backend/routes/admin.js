/**
 * @file routes/admin.js
 * @description واجهات الأدمن لإدارة المستخدمين وتحديث الرصيد
 * @version 1.2.0
 * @license MIT
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken, checkAdmin, verifyAdmin } = require('../middlewares/auth');
const { doubleCsrfProtection } = require('../middlewares/csrfMiddleware');

/**
 * ✅ تحديث رصيد مستخدم
 * @route PUT /api/admin/update-balance/:userId
 * @access Admin
 */
router.put('/update-balance/:userId', verifyToken, checkAdmin, doubleCsrfProtection, async (req, res) => {
  try {
    const { balance } = req.body;

    if (!Number.isFinite(balance) || balance < 0) {
      return res.status(400).json({ error: 'الرصيد يجب أن يكون رقمًا موجبًا' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      {
        $set: {
          balance,
          tokenVersion: (req.user.tokenVersion || 0) + 1
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    res.json({
      success: true,
      newBalance: updatedUser.balance
    });
  } catch (err) {
    console.error('❌ خطأ في التحديث:', err.message);
    res.status(500).json({ error: 'فشل التحديث' });
  }
});

/**
 * ✅ جلب قائمة المستخدمين
 * @route GET /api/admin/users
 * @access Admin
 */
router.get('/users', verifyToken, checkAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '_id username balance');
    res.json(users);
  } catch (err) {
    console.error('❌ خطأ في جلب المستخدمين:', err.message);
    res.status(500).json({ error: 'فشل في جلب البيانات' });
  }
});

router.get('/admin', verifyAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'protectedViews', 'admin.html'));
});

module.exports = router;