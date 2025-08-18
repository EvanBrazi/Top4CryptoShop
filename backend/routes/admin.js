/**
 * @file routes/admin.js
 * @description واجهات الأدمن لإدارة المستخدمين وتحديث الرصيد
 * @version 2.0.0
 * @license MIT
 * @author EVAN BRAZI
 */

const express = require('express');
const path = require('path');
const router = express.Router();

const User = require('../models/User');
const { verifyToken, checkAdmin } = require('../middlewares/auth');
const { doubleCsrfProtection } = require('../middlewares/csrfMiddleware');

/**
 * @function isValidBalance
 * @description يتحقق من أن الرصيد رقم موجب وصحيح
 * @param {number} balance
 * @returns {boolean}
 */
const isValidBalance = (balance) => {
  return Number.isFinite(balance) && balance >= 0;
};

/**
 * ✅ تحديث رصيد مستخدم
 * @route PUT /update-balance/:userId
 * @access Admin
 */
router.put('/update-balance/:userId', verifyToken, checkAdmin, doubleCsrfProtection, async (req, res) => {
  try {
    const { balance } = req.body;

    if (!isValidBalance(balance)) {
      return res.status(400).json({
        success: false,
        error: 'الرصيد غير صالح',
        message: 'يجب أن يكون الرصيد رقمًا موجبًا وصحيحًا'
      });
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
      return res.status(404).json({
        success: false,
        error: 'المستخدم غير موجود',
        message: 'تعذر العثور على المستخدم المحدد'
      });
    }

    res.json({
      success: true,
      message: 'تم تحديث الرصيد بنجاح',
      newBalance: updatedUser.balance
    });
  } catch (err) {
    console.error('❌ خطأ في التحديث:', err.message);
    res.status(500).json({
      success: false,
      error: 'فشل التحديث',
      message: 'حدث خطأ غير متوقع أثناء تعديل الرصيد'
    });
  }
});

/**
 * ✅ جلب قائمة المستخدمين
 * @route GET /users
 * @access Admin
 */
router.get('/users', verifyToken, checkAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '_id username balance');
    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (err) {
    console.error('❌ خطأ في جلب المستخدمين:', err.message);
    res.status(500).json({
      success: false,
      error: 'فشل في جلب البيانات',
      message: 'حدث خطأ أثناء محاولة جلب قائمة المستخدمين'
    });
  }
});

/**
 * ✅ عرض صفحة الأدمن المحمية
 * @route GET /panel
 * @access Admin
 */
router.get('/panel', verifyToken, checkAdmin, (req, res) => {
  const adminPagePath = path.join(__dirname, '..', 'protectedViews', 'admin.html');
  res.sendFile(adminPagePath);
});

module.exports = router;