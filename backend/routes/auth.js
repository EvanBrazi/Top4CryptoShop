/**
 * auth.js - مسارات المصادقة
 * يحتوي على:
 * - تسجيل المستخدمين
 * - تسجيل الدخول
 * - تسجيل الخروج
 * - إدارة الجلسات
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const { validateRegister, validateLogin, handleValidationErrors } = require('../middlewares/validation');
const rateLimit = require('express-rate-limit');
const { doubleCsrfProtection } = require('../middlewares/csrfMiddleware');

// 1. معدل الحد للحماية من هجمات Brute Force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 10, // 10 محاولات لكل IP
  handler: (req, res) => {
    return res.status(429).json({
      error: 'لقد تجاوزت الحد المسموح من المحاولات. يرجى الانتظار 15 دقيقة',
      solution: 'إذا نسيت كلمة المرور، استخدم إعادة تعيين كلمة المرور'
    });
  }
});

router.use(authLimiter);

// 2. تسجيل مستخدم جديد
router.post('/register', 
  validateRegister,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { username, password, phone, theme } = req.body;

      // التحقق من عدم تكرار اسم المستخدم
      const existingUser = await User.findOne({ 
        username: { $regex: new RegExp(`^${username}$`, 'i') } 
      });
      
      if (existingUser) {
        return res.status(409).json({ 
          error: 'اسم المستخدم مسجل مسبقاً',
          solution: 'اختر اسم مستخدم آخر'
        });
      }

      // تشفير كلمة المرور
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);

      // إنشاء مستخدم جديد
      const newUser = new User({
        username,
        password: hashedPassword,
        phone: phone || null,
        theme: theme || 0,
        balance: 0,
        createdAt: new Date(),
        lastLogin: null,
        loginAttempts: 0,
        accountStatus: 'active'
      });

      await newUser.save();

      // إنشاء JWT token
      const token = jwt.sign(
        { userId: newUser._id, role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h', issuer: 'your-app-api', algorithm: 'HS256' }
      );

      // إعداد HTTP-only cookie
      res.cookie('session_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600000,
        path: '/'
      });

      // إرجاع بيانات المستخدم (بدون معلومات حساسة)
      const userResponse = {
        id: newUser._id,
        username: newUser.username,
        phone: newUser.phone,
        theme: newUser.theme,
        balance: newUser.balance,
        createdAt: newUser.createdAt
      };

      return res.status(201).json({
        success: true,
        user: userResponse
      });

    } catch (err) {
      console.error('Registration error:', err);
      return res.status(500).json({ 
        error: 'حدث خطأ أثناء التسجيل',
        details: process.env.NODE_ENV === 'development' ? err.message : null,
        requestId: req.id
      });
    }
  }
);

// 3. تسجيل الدخول
router.post('/login', 
  validateLogin,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { username, password } = req.body;
      
      // البحث عن المستخدم
      const user = await User.findOne({ username })
        .select('+password +loginAttempts +accountStatus +lastLogin');
      
      if (!user) {
        return res.status(401).json({ 
          error: 'بيانات الدخول غير صحيحة',
          solution: 'تحقق من اسم المستخدم وكلمة المرور'
        });
      }

      // التحقق من حالة الحساب
      if (user.accountStatus === 'suspended') {
        return res.status(403).json({
          error: 'الحساب موقوف مؤقتاً',
          solution: 'اتصل بدعم العملاء'
        });
      }

      // التحقق من عدد المحاولات الفاشلة
      if (user.loginAttempts >= 5) {
        user.accountStatus = 'suspended';
        await user.save();
        return res.status(429).json({
          error: 'تم تجاوز عدد المحاولات المسموحة',
          solution: 'تم تعليق الحساب مؤقتاً. اتصل بالدعم'
        });
      }

      // التحقق من كلمة المرور
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        user.loginAttempts += 1;
        await user.save();
        return res.status(401).json({ 
          error: 'بيانات الدخول غير صحيحة',
          remainingAttempts: 5 - user.loginAttempts
        });
      }

      // إعادة تعيين المحاولات الفاشلة
      user.loginAttempts = 0;
      user.lastLogin = new Date();
      await user.save();

      // إنشاء JWT token جديد
      const token = jwt.sign(
        { userId: user._id, role: user.role || 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h', issuer: 'your-app-api', algorithm: 'HS256' }
      );

      // إعداد الكوكيز
      res.cookie('session_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600000,
        path: '/'
      });

      // إرجاع بيانات المستخدم
      const userResponse = {
        id: user._id,
        username: user.username,
        phone: user.phone,
        theme: user.theme,
        balance: user.balance,
        lastLogin: user.lastLogin
      };

      return res.json({
        success: true,
        user: userResponse
      });

    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ 
        error: 'حدث خطأ أثناء تسجيل الدخول',
        details: process.env.NODE_ENV === 'development' ? err.message : null,
        requestId: req.id
      });
    }
  }
);

// 4. تسجيل الخروج
router.post('/logout', doubleCsrfProtection, async (req, res) => {
  try {
    const token = req.cookies.session_token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(400).json({ 
        error: 'لم يتم توفير رمز الجلسة',
        solution: 'قد تكون مسجلًا للخروج بالفعل'
      });
    }

    // إضافة التوكن إلى القائمة السوداء
    await RevokedToken.create({ 
      token,
      revokedAt: new Date(),
      reason: 'user_logout',
      expiresAt: new Date(Date.now() + 3600000) // تنتهي بعد ساعة
    });

    // مسح الكوكيز
    res.clearCookie('session_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    return res.json({ 
      success: true, 
      message: 'تم تسجيل الخروج بنجاح' 
    });

  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ 
      error: 'حدث خطأ أثناء تسجيل الخروج',
      details: process.env.NODE_ENV === 'development' ? err.message : null,
      requestId: req.id
    });
  }
});

module.exports = router;
