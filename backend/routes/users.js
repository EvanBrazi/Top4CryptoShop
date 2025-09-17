//Top4CryptoShop/backend/models/User.js
/**
 * @file routes/users.js
 * @description واجهات REST لإدارة المستخدمين مع تحقق من الهوية وتحديث شامل
 * @version 3.0.0
 * @license MIT
 */
require('dotenv').config();
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken } = require('../middlewares/auth');
const upload = require('../middlewares/upload'); // نفس إعداد multer الذي تستخدمه
const cloudinary = require('../config/cloudinary');
const { activeSessions } = require('../utils/sessionStore');
// استيراد jwt للتحقق من التوكن
const jwt = require('jsonwebtoken');
const {
  validateProfileUpdate,
  handleValidationErrors
} = require('../middlewares/validation');

// 📥 جلب جميع المستخدمين (للوحة التحكم)
router.get('/', verifyToken, async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'فشل تحميل المستخدمين' });
  }
});

// ✅ نقطة جلب بيانات المستخدم الحالي
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const sessionId = req.headers['x-session-id'];

    if (!token || !sessionId) {
      return res.status(401).json({ error: 'رمز الجلسة أو التوكن مفقود' });
    }

    const session = activeSessions.get(sessionId);
    if (!session) {
      return res.status(403).json({ error: 'جلسة غير صالحة أو منتهية' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'توكن غير صالح أو منتهي' });
    }

    if (decoded.userId !== session.userId) {
      return res.status(403).json({ error: 'توكن غير متطابق مع الجلسة' });
    }

    const user = await User.findById(decoded.userId).select('-password -loginAttempts');
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      balance: user.balance,
      role: user.role,
      lastLogin: user.lastLogin
    });
  } catch (err) {
    console.error('❌ خطأ في /users/me:', err);
    res.status(500).json({ error: 'فشل في جلب بيانات المستخدم' });
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
router.put('/:id',
  verifyToken,
  validateProfileUpdate,
  handleValidationErrors,
  async (req, res) => {
    console.log('📥 الحقول المستلمة:', req.body);
    try {
      const allowedFields = ['name', 'email', 'balance', 'theme', 'avatar', 'password'];
      const fieldLabels = {
        name: 'الاسم',
        email: 'البريد الإلكتروني',
        phone: 'رقم الهاتف',
        password: 'كلمة المرور',
        avatar: 'الصورة الشخصية',
        balance: 'الرصيد',
        theme: 'الثيم'
      };
      const updates = {};
      const messages = [];

      // ✅ تحقق من الأخطاء
      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      const rejectedFields = errors.array().map(e => e.param);

      // ✅ مرر فقط الحقول المعدلة والصحيحة
      Object.entries(fieldLabels).forEach(([key, label]) => {
        const value = req.body[key]; // ✅ المفتاح الصحيح
        if (value !== undefined && !rejectedFields.includes(key)) {
          updates[key] = value;
          messages.push(`✅ تم حفظ ${label} بنجاح`);
        } else if (value !== undefined) {
          messages.push(`❌ تم رفض ${label} لأنه غير صالح`);
        }
      });

      // ✅ نفذ التحديث فقط إذا كان هناك حقول صالحة
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          message: '❌ لم يتم تعديل أي حقل بسبب أخطاء التحقق',
          details: messages
        });
      }
      const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
      if (!user) return res.status(404).json({ message: '❌ المستخدم غير موجود' });

      res.json({
        success: true,
        message: '🔄 تم تنفيذ التحديث الجزئي',
        details: messages,
        user
      });
    } catch (err) {
      console.error('❌ خطأ في التحديث:', err.message);
      res.status(500).json({
        success: false,
        message: '❌ خطأ في التحديث',
        error: err.message
      });
    }
  }
);

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

// 📤 جلب رصيد المستخدم فقط
router.get('/:id/balance', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('balance');
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json({ balance: user.balance });
  } catch (err) {
    res.status(500).json({ message: '❌ خطأ أثناء جلب الرصيد' });
  }
});

// 💰 حجز رصيد مؤقت قبل تنفيذ الطلب
router.post('/:id/reserve', verifyToken, async (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: 'قيمة غير صالحة للحجز' });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    if (user.balance < amount) {
      return res.status(400).json({ message: 'الرصيد غير كافٍ' });
    }

    user.balance -= amount;
    await user.save();

    res.json({ message: '✅ تم حجز الرصيد', balance: user.balance });
  } catch (err) {
    res.status(500).json({ message: '❌ خطأ أثناء الحجز' });
  }
});

// ♻️ استرجاع الرصيد في حال فشل الطلب
router.post('/:id/restore', verifyToken, async (req, res) => {
  const amount = parseFloat(req.body.amount);
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: 'قيمة غير صالحة للاسترجاع' });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    user.balance += amount;
    await user.save();

    res.json({ message: '✅ تم استرجاع الرصيد', balance: user.balance });
  } catch (err) {
    res.status(500).json({ message: '❌ خطأ أثناء الاسترجاع' });
  }
});

/**
 * @route POST /api/users/:id/avatar
 * @desc رفع صورة شخصية للمستخدم وتحديث رابطها
 * @access خاص بالمستخدم
 */
router.post('/:id/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  try {
    const userId = req.params.id;
    const imageUrl = req.file?.path;

    if (!imageUrl) return res.status(400).json({ error: 'لم يتم رفع الصورة' });

    const user = await User.findByIdAndUpdate(userId, { avatar: imageUrl }, { new: true });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    res.json({ message: '✅ تم تحديث الصورة الشخصية', avatar: user.avatar });
  } catch (err) {
    console.error('❌ خطأ في رفع الصورة الشخصية:', err);
    res.status(500).json({ error: 'فشل رفع الصورة الشخصية' });
  }
});

/**
 * @route POST /api/users/:id/avatar/remove
 * @desc إزالة الصورة الشخصية من قاعدة البيانات وCloudinary
 * @access خاص بالمستخدم
 */
router.post('/:id/avatar/remove', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    // ✅ استخراج public_id من رابط Cloudinary
    const avatarUrl = user.avatar;
    if (avatarUrl && avatarUrl.includes('cloudinary.com')) {
      const parts = avatarUrl.split('/');
      const publicIdWithExtension = parts.slice(-1)[0]; // مثل receipt-abc123.jpg
      const publicId = publicIdWithExtension.split('.')[0]; // إزالة الامتداد

      await cloudinary.uploader.destroy(`payments_receipts/${publicId}`);
    }
    user.avatar = '';
    await user.save();
    res.json({ message: '✅ تم إزالة الصورة الشخصية', avatar: '' });
  } catch (err) {
    console.error('❌ خطأ في إزالة الصورة من Cloudinary:', err);
    res.status(500).json({ error: 'فشل إزالة الصورة الشخصية' });
  }
});

module.exports = router;
