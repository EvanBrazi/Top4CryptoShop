//Top4CryptoShop/backend/models/User.js
/**
 * @file routes/users.js
 * @description واجهات REST لإدارة المستخدمين مع تحقق من الهوية وتحديث شامل
 * @version 3.0.0
 * @license MIT
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken } = require('../middlewares/auth');

// 📥 جلب جميع المستخدمين (للوحة التحكم)
router.get('/', verifyToken, async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'فشل تحميل المستخدمين' });
  }
});

// 📥 جلب مستخدم واحد (لـ usermanager.js)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'فشل تحميل المستخدم' });
  }
});

// 🔄 تحديث بيانات المستخدم بالكامل
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const allowedFields = ['name', 'email', 'balance', 'theme', 'avatar'];
    const updates = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    res.json({ message: '✅ تم التحديث بنجاح', user });
  } catch (err) {
    res.status(500).json({ message: '❌ خطأ في التحديث' });
  }
});

// 💰 تعديل الرصيد فقط
router.put('/:id/balance', verifyToken, async (req, res) => {
  const balance = parseFloat(req.body.balance);
  if (isNaN(balance) || balance < 0) {
    return res.status(400).json({ message: 'رصيد غير صالح' });
  }

  try {
    const user = await User.findByIdAndUpdate(req.params.id, { balance }, { new: true });
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json({ message: '✅ تم تعديل الرصيد', user });
  } catch (err) {
    res.status(500).json({ message: '❌ خطأ في تعديل الرصيد' });
  }
});

// 🎨 تحديث الثيم الخاص بالمستخدم
router.put('/:id/theme', verifyToken, async (req, res) => {
  try {
    const { theme } = req.body;
    if (typeof theme !== 'number' || ![0, 1].includes(theme)) {
      return res.status(400).json({ message: 'قيمة الثيم يجب أن تكون 0 أو 1' });
    }
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { theme },
      { new: true } // يرجع النسخة المحدثة
    );

    if (!updatedUser) return res.status(404).json({ message: 'المستخدم غير موجود' });

    res.json({ message: '✅ تم تحديث الثيم بنجاح', user: updatedUser });
  } catch (err) {
    res.status(500).json({ message: '❌ خطأ أثناء تحديث الثيم' });
  }
});


// 🔓 تفعيل المستخدم
router.put('/:id/activate', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    if (user.accountStatus === 'active') {
      return res.status(400).json({ message: 'الحساب مفعل بالفعل' });
    }

    user.accountStatus = 'active';
    user.loginAttempts = 0;
    user.activatedAt = new Date();

    await user.save();
    res.json({ message: '✅ تم تفعيل المستخدم', user });
  } catch (err) {
    res.status(500).json({ message: '❌ خطأ أثناء التفعيل' });
  }
});

// 🗑️ حذف المستخدم
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json({ message: '🗑️ تم حذف المستخدم' });
  } catch (err) {
    res.status(500).json({ message: '❌ خطأ أثناء الحذف' });
  }
});

module.exports = router;
