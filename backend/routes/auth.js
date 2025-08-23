/**
 * @file routes/auth.js
 * @description مسارات المصادقة وتسجيل الدخول والخروج والتحقق من الجلسة
 * @version 2.3.0
 * @author Evan Brazi
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const { validateRegister, validateLogin, handleValidationErrors } = require('../middlewares/validation');
const rateLimit = require('express-rate-limit');
const { attachCsrfToken, doubleCsrfProtection } = require('../middlewares/csrfMiddleware');
const { registerUser } = require('../controllers/authController');
const { body, validationResult } = require('express-validator');
const { verifyToken, checkAdmin, requireRole, checkSession } = require('../middlewares/auth');

// =============================================
// 🛡️ دالة موحدة للاستجابات
// =============================================
function handleAuthResponse(req, res, data) {
  if (req.accepts('html') && !req.accepts('json')) {
    const redirectUrl = data.success && data.redirectTo
      ? data.redirectTo
      : `/login.html?error=${encodeURIComponent(data.error || 'حدث خطأ')}`;
    return res.redirect(redirectUrl);
  }

  return data.status
    ? res.status(data.status).json(data)
    : res.json(data);
}

// =============================================
// 🚦 تحديد معدل المحاولات لتسجيل الدخول
// =============================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  handler: (req, res) => {
    return handleAuthResponse(req, res, {
      status: 429,
      error: 'لقد تجاوزت الحد المسموح من المحاولات. يرجى الانتظار 15 دقيقة',
      solution: 'إذا نسيت كلمة المرور، استخدم إعادة تعيين كلمة المرور'
    });
  }
});

router.use(authLimiter);

// =============================================
// 📝 تسجيل مستخدم جديد
// =============================================
router.post('/register',
  validateRegister,
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await registerUser(req.body); // تنفيذ التسجيل
      req.session.userId = user._id; // تخزين معرف المستخدم في الجلسة

      attachCsrfToken(req, res); // ✅ توليد وإرسال رمز CSRF

      res.status(201).json({ success: true, user });
    } catch (err) {
      console.error('❌ خطأ أثناء التسجيل:', err);
      res.status(500).json({ error: 'حدث خطأ أثناء التسجيل' });
    }
  }
);


// =============================================
// 🔐 تسجيل الدخول
// =============================================
router.post('/login',
  validateLogin,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!password) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال كلمة المرور',
          type: 'missing_password'
        });
      }

      const query = username.includes('@')
        ? { email: username.trim().toLowerCase() }
        : { username: { $regex: new RegExp(`^${username}$`, 'i') } };

      const user = await User.findOne(query).select('+password +loginAttempts +accountStatus +lastLogin');
      if (!user) {
        return handleAuthResponse(req, res, {
          status: 401,
          success: false,
          error: 'بيانات الدخول غير صحيحة',
          type: 'invalid_credentials'
        });
      }

      if (user.accountStatus === 'suspended') {
        return handleAuthResponse(req, res, {
          status: 403,
          success: false,
          error: 'الحساب موقوف مؤقتاً',
          type: 'account_suspended'
        });
      }

      if (user.loginAttempts >= 5) {
        user.accountStatus = 'suspended';
        await user.save();
        return handleAuthResponse(req, res, {
          status: 429,
          success: false,
          error: 'تم تعليق الحساب مؤقتاً',
          type: 'too_many_attempts'
        });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        user.loginAttempts += 1;
        await user.save();
        return handleAuthResponse(req, res, {
          status: 401,
          success: false,
          error: 'كلمة المرور غير صحيحة',
          remainingAttempts: 5 - user.loginAttempts,
          type: 'invalid_password'
        });
      }

      req.session.userId = user._id;
      req.session.role = user.role;

      user.loginAttempts = 0;
      user.lastLogin = new Date();
      await user.save();

      const issuer = user.role === 'admin' ? 'admin-panel' : 'your-app-api';
      const token = jwt.sign(
        { userId: user._id, role: user.role || 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h', issuer, algorithm: 'HS256' }
      );

      res.cookie('session_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600000,
        path: '/'
      });

      attachCsrfToken(req, res); // ✅ توليد رمز CSRF بعد نجاح الدخول

      const userResponse = {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        theme: user.theme,
        balance: user.balance,
        lastLogin: user.lastLogin,
        role: user.role
      };

      return handleAuthResponse(req, res, {
        success: true,
        user: userResponse,
        token,
        redirectTo: user.role === 'admin' ? '/admin' : '/homepage.html'
      });

    } catch (err) {
      return handleAuthResponse(req, res, {
        status: 500,
        success: false,
        error: 'حدث خطأ أثناء تسجيل الدخول',
        details: process.env.NODE_ENV === 'development' ? err.message : null,
        type: 'server_error'
      });
    }
  }
);

// =============================================
// 🔓 تسجيل الخروج
// =============================================
router.post('/logout', doubleCsrfProtection, async (req, res) => {
  console.log('🔐 CSRF من الهيدر:', req.headers['x-csrf-token']);
  console.log('🔐 CSRF من الجلسة:', req.session?.csrfToken);

  try {
    const token = req.cookies.session_token || req.headers.authorization?.split(' ')[1];
    if (!token) {
      return handleAuthResponse(req, res, {
        status: 400,
        success: false,
        error: 'لم يتم توفير رمز الجلسة',
        type: 'missing_token'
      });
    }

    const isRevoked = await RevokedToken.exists({ token });
    if (isRevoked) {
      return handleAuthResponse(req, res, {
        success: false,
        error: 'رمز الجلسة موقوف',
        type: 'revoked_token'
      });
    }

    await RevokedToken.create({
      token,
      revokedAt: new Date(),
      reason: 'user_logout',
      expiresAt: new Date(Date.now() + 3600000)
    });

    res.clearCookie('session_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    return handleAuthResponse(req, res, {
      success: true,
      message: 'تم تسجيل الخروج بنجاح',
      redirectTo: '/logout.html'
    });

  } catch (err) {
    return handleAuthResponse(req, res, {
      status: 500,
      success: false,
      error: 'حدث خطأ أثناء تسجيل الخروج',
      details: process.env.NODE_ENV === 'development' ? err.message : null,
      type: 'server_error'
    });
  }
});

// =============================================
// 🔧 فك حظر المستخدمين (إدمن فقط)
// =============================================
router.post('/admin/update-status',
  verifyToken,
  checkAdmin,
  body('userId').isMongoId(),
  body('newStatus').isIn(['active', 'suspended']),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { userId, newStatus } = req.body;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
      }

      user.accountStatus = newStatus;
      user.loginAttempts = 0;
      await user.save();

      return res.json({
        success: true,
        message: `✅ تم تحديث حالة المستخدم إلى "${newStatus}" بنجاح`
      });

    } catch (err) {
      return res.status(500).json({
        success: false,
        error: 'حدث خطأ أثناء تحديث الحالة'
      });
    }
  }
);

// =============================================
// 🔍 التحقق من الجلسة
// =============================================
router.get('/check-session', checkSession);

module.exports = router;