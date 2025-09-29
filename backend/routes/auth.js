/**
 * @file routes/auth.js
 * @description مسارات المصادقة وتسجيل الدخول والخروج والتحقق من الجلسة
 * @version 2.3.0
 * @author Evan Brazi
 */
require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const { validateRegister, validateLogin, handleValidationErrors } = require('../middlewares/validation');
const rateLimit = require('express-rate-limit');
const { attachCsrfToken, doubleCsrfProtection } = require('../middlewares/csrfMiddleware');
const { registerUser } = require('../controllers/authController');
const { body } = require('express-validator');
const { verifyToken, checkAdmin, checkSession } = require('../middlewares/auth');
const { createSession, activeSessions } = require('../utils/sessionStore');
const passport = require('passport');
require('../config/googleAuth'); // تأكد من إعداد استراتيجية جوجل في هذا الملف
const speakeasy = require('speakeasy');

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
  max: 100,
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
/**
 * @route   POST /api/auth/register
 * @desc    تسجيل مستخدم جديد مع تحقق من البيانات وتوليد رمز CSRF
 * @access  Public
 */
router.post(
  '/register',
  validateRegister,           // ✅ تحقق من صحة البيانات
  handleValidationErrors,     // ✅ التعامل مع أخطاء التحقق

  async (req, res) => {
    try {
      // ✅ تنفيذ التسجيل وإرجاع كائن المستخدم
      const user = await registerUser(req.body);
      // ✅ تخزين معرف المستخدم في الجلسة
      req.session.userId = user._id;
      // ✅ توليد رمز CSRF وإرساله
      attachCsrfToken(req, res);
      // ✅ الرد النهائي
      res.status(201).json({
        success: true,
        message: 'تم إنشاء الحساب بنجاح',
        user: {
          id: user._id,
          username: user.username,
          email: user.email
        }
      });

    } catch (err) {
      console.error('❌ خطأ أثناء التسجيل:', err);

      let message = 'حدث خطأ أثناء التسجيل. يرجى المحاولة لاحقًا.';
      let status = 500;

      if (err.message === 'MISSING_FIELDS') {
        message = 'يرجى تعبئة جميع الحقول المطلوبة';
        status = 400;
      } else if (err.message === 'USER_EXISTS') {
        message = 'اسم المستخدم أو البريد الإلكتروني مستخدم مسبقًا';
        status = 409;
      }

      res.status(status).json({
        success: false,
        error: err.message || 'SERVER_ERROR',
        message
      });
    }
  }
);
// =============================================
// 🔐 تسجيل الدخول
// =============================================
/**
 * @file auth.js
 * @module AuthRoutes
 * @description
 *  - تسجيل الدخول للمستخدم أو الأدمن
 *  - توليد customSessionId وتخزينه في activeSessions عبر createSession
 *  - إرسال customSessionId و JWT ككوكي
 *  - يدعم الحماية من المحاولات الزائدة والتعليق المؤقت
 *  - يدعم تسجيل الدخول عبر Google و 2FA
 *
 * @author Evan Brazi
 * @lastModified 2025-09-17
 */
// 🔐 تسجيل الدخول
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
          error: 'اسم المستخدم غير صحيح',
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

      // ✅ الجلسة ناجحة
      user.loginAttempts = 0;
      user.lastLogin = new Date();
      await user.save();

      const deviceId = req.body.deviceId;
      if (user.twoFAStatus === 'enabled' && !user.trustedDevices?.some(d => d.deviceId === deviceId)) {
        return res.status(200).json({
          success: true,
          requires2FA: true,
          userId: user._id,
          message: '🔐 يرجى إدخال رمز المصادقة الثنائية'
        });
      }

      // 🧠 توليد customSessionId وتسجيله في الذاكرة
      // 🧠 إنشاء جلسة جديدة بصلاحية ساعة واحدة
      const sessionId = crypto.randomBytes(16).toString('hex');
      createSession(sessionId, user._id.toString(), user.role);

      // 🛡️ توليد JWT
      const issuer = user.role === 'admin' ? 'admin-panel' : 'your-app-api';
      const token = jwt.sign(
        { userId: user._id, role: user.role || 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h', issuer, algorithm: 'HS256' }
      );

      // 🍪 إرسال الكوكيز
      res.cookie('session_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 3600000,
        path: '/'
      });

      res.cookie('customSessionId', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 3600000,
        path: '/'
      });
      console.log('🍪 customSessionId المرسل للمتصفح:', sessionId, 'Token:', token);
      attachCsrfToken(req, res); // توليد رمز CSRF
      const userResponse = {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        theme: user.theme,
        balance: user.balance,
        lastLogin: user.lastLogin,
        role: user.role,
        sessionId: sessionId
      };
      console.log('🧠 الجلسات النشطة:', [...activeSessions.entries()]);
      return handleAuthResponse(req, res, {
        success: true,
        user: userResponse,
        token,
        redirectTo: user.role === 'admin' ? '/admin' : '/homepage.html'
      });
    } catch (err) {
      //console.log('Error:', err);
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
// 🔐 تسجيل الدخول عبر Google OAuth2
// =============================================
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// =============================================
// 🔐 نقطة نهاية رد الاتصال من Google OAuth2
// =============================================
/**
 * @lastModified 2025-09-17
 */
router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    try {
      const user = req.user;

      user.lastLogin = new Date();
      await user.save();

      // 🧠 إنشاء جلسة جديدة بصلاحية ساعة واحدة
      const sessionId = crypto.randomBytes(16).toString('hex');
      createSession(sessionId, user._id.toString(), user.role);

      const issuer = user.role === 'admin' ? 'admin-panel' : 'your-app-api';
      const token = jwt.sign(
        { userId: user._id, role: user.role || 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h', issuer, algorithm: 'HS256' }
      );

      res.cookie('session_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 3600000,
        path: '/'
      });

      res.cookie('customSessionId', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 3600000,
        path: '/'
      });

      attachCsrfToken(req, res);

      const redirectPath = user.role === 'admin'
        ? '/protectedViews/admin.html'
        : `/google-redirect.html?token=${token}&sessionId=${sessionId}`;

      return res.redirect(redirectPath);

    } catch (err) {
      console.error('❌ خطأ أثناء تسجيل الدخول عبر Google:', err);
      return res.redirect('/login.html');
    }
  }
);

// =============================================
// 📝 استكمال ملف التعريف بعد تسجيل الدخول عبر Google
// =============================================
router.post('/complete-profile', async (req, res) => {
  try {
    const { fullName, country, phone } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'غير مصرح' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    user.username = fullName.replace(/\s+/g, '_').toLowerCase();
    user.phone = phone;
    user.country = country;
    await user.save();

    res.json({ message: 'تم التحديث بنجاح' });
  } catch (err) {
    console.error('❌ خطأ أثناء حفظ البيانات:', err);
    res.status(500).json({ message: 'خطأ داخلي في الخادم' });
  }
});

// =============================================
// 🔓 تسجيل الخروج
// =============================================
router.post('/logout', doubleCsrfProtection, async (req, res) => {
  //console.log('🔐 CSRF من الهيدر:', req.headers['x-csrf-token']);
  //console.log('🔐 CSRF من الجلسة:', req.session?.csrfToken);
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
// ✅ للتحقق من رمز 2FA بعد كلمة المرور
// =============================================
/**
 * @lastModified 2025-09-17
 */
router.post('/verify-2fa-login', async (req, res) => {
  const { userId, token } = req.body;
  const user = await User.findById(userId).select('+twoFASecret +twoFAAttempts');
  if (!user) {
    return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
  }

  if (user.twoFAAttempts >= 5) {
    return res.status(429).json({ success: false, error: 'TOO_MANY_2FA_ATTEMPTS' });
  }

  const verified = speakeasy.totp.verify({ secret: user.twoFASecret, encoding: 'base32', token, window: 1 });

  if (!verified) {
    user.twoFAAttempts += 1;
    await user.save();
    return res.status(403).json({ success: false, error: 'INVALID_2FA' });
  }

  user.twoFAAttempts = 0;
  await user.save();

  if (req.body.rememberDevice && req.body.deviceId) {
    await User.findByIdAndUpdate(userId, {
      $push: {
        trustedDevices: {
          deviceId: req.body.deviceId,
          addedAt: new Date()
        }
      }
    });
  }

  // ✅ الآن نمنح الجلسة
  // 🧠 إنشاء جلسة جديدة بصلاحية ساعة واحدة
  const sessionId = crypto.randomBytes(16).toString('hex');
  createSession(sessionId, user._id.toString(), user.role);

  const tokenJWT = jwt.sign(
    { userId: user._id, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h', issuer: 'your-app-api', algorithm: 'HS256' }
  );

  res.cookie('session_token', tokenJWT, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 3600000,
    path: '/'
  });

  res.cookie('customSessionId', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 3600000,
    path: '/'
  });

  attachCsrfToken(req, res);
  res.json({
    success: true,
    message: '✅ تم تسجيل الدخول بنجاح',
    redirectTo: '/homepage.html'
  });
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

// - إضافة endpoints مساعدة
// ✅ endpoint لفحص الجلسة الحالية
router.get('/session-info', (req, res) => {
  res.json({
    sessionId: req.sessionID,
    hasCsrfToken: !!req.session.csrfToken,
    csrfToken: req.session.csrfToken,
    userId: req.session.userId,
    sessionData: req.session
  });
});

// ✅ endpoint لإصلاح CSRF token
router.post('/refresh-csrf', (req, res) => {
  const { attachCsrfToken } = require('./middleware/csrfMiddleware');
  
  if (attachCsrfToken(req, res)) {
    res.json({
      success: true,
      message: 'تم تجديد رمز CSRF',
      csrfToken: req.session.csrfToken,
      sessionId: req.sessionID
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'FAILED_TO_REFRESH_CSRF'
    });
  }
});

module.exports = router;