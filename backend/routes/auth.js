/**
 * auth.js - مسارات المصادقة
 * إصدار: 2.3.0
 * يحتوي على:
 * - تسجيل المستخدمين
 * - تسجيل الدخول (يدعم JSON وHTML)
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
const { registerUser } = require('../controllers/authController');
const { checkSession } = require('../middlewares/auth');

// =============================================
//          دالة مساعدة للاستجابات
// =============================================
/**
 * تعالج استجابات المصادقة بناءً على نوع المحتوى المطلوب
 * @param {Object} req - طلب Express
 * @param {Object} res - رد Express
 * @param {Object} data - بيانات الاستجابة
 */
function handleAuthResponse(req, res, data) {
  // إذا كان الطلب يتوقع HTML أو كان من متصفح
  if (req.accepts('html') && !req.accepts('json')) {
    if (data.success && data.redirectTo) {
      // تحويل ناجح إلى الصفحة المطلوبة
      return res.redirect(data.redirectTo);
    } else {
      // في حالة الخطأ، إعادة تحويل إلى صفحة تسجيل الدخول مع رسالة خطأ
      const redirectUrl = `/login.html?error=${encodeURIComponent(data.error || 'حدث خطأ')}`;
      return res.redirect(redirectUrl);
    }
  }

  // الافتراضي: إرجاع JSON
  if (data.status) {
    return res.status(data.status).json(data);
  }
  return res.json(data);
}

// =============================================
//          معدل الحد للحماية من هجمات Brute Force
// =============================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 10, // 10 محاولات لكل IP
  handler: (req, res) => {
    return handleAuthResponse(req, res, {
      status: 429,
      error: 'لقد تجاوزت الحد المسموح من المحاولات. يرجى الانتظار 15 دقيقة',
      solution: 'إذا نسيت كلمة المرور، استخدم إعادة تعيين كلمة المرور'
    });
  }
});

// =============================================
//          وسائط Router العامة
// =============================================
router.use((req, res, next) => {
  // لا نفرض نوع محتوى معين، نتركه للطلب ليحدد
  next();
});

router.use(authLimiter);

// =============================================
//          تسجيل مستخدم جديد
// =============================================
router.post('/register',
  validateRegister,
  handleValidationErrors,
  registerUser
);

// =============================================
//          تسجيل الدخول (يدعم JSON وHTML)
// =============================================
router.post('/login',
  doubleCsrfProtection,
  validateLogin,
  handleValidationErrors,
  async (req, res) => {
    console.log("📥 تم استقبال طلب تسجيل الدخول:", req.body);
    try {
      const { username, password } = req.body;
      // إضافة تسجيل الأحداث المهمة
      console.log(`User login attempt: ${username}`);

      const query = username.includes('@')
        ? { email: username.trim().toLowerCase() }
        : { username: { $regex: new RegExp(`^${username}$`, 'i') } };

      console.log('passwore: ' + password);

      if (!password) {
        console.error('كلمة المرور غير موجودة في السجل');
        return res.status(500).json({ message: 'حدث خطأ في بيانات المستخدم' });
      }


      const user = await User.findOne(query)
        .select('+password +loginAttempts +accountStatus +lastLogin');

      if (!user) {
        return handleAuthResponse(req, res, {
          status: 401,
          success: false,
          error: 'بيانات الدخول غير صحيحة',
          solution: 'تحقق من اسم المستخدم أو البريد وكلمة المرور',
          type: 'invalid_credentials'
        });
      }

      if (user.accountStatus === 'suspended') {
        return handleAuthResponse(req, res, {
          status: 403,
          success: false,
          error: 'الحساب موقوف مؤقتاً',
          solution: 'اتصل بدعم العملاء',
          type: 'account_suspended'
        });
      }

      if (user.loginAttempts >= 5) {
        user.accountStatus = 'suspended';
        await user.save();
        return handleAuthResponse(req, res, {
          status: 429,
          success: false,
          error: 'تم تجاوز عدد المحاولات المسموحة',
          solution: 'تم تعليق الحساب مؤقتاً. اتصل بالدعم',
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
          error: 'بيانات الدخول غير صحيحة',
          remainingAttempts: 5 - user.loginAttempts,
          type: 'invalid_password'
        });
      }

      if (user && user.role === 'admin') {
        req.session.userId = user._id;
        req.session.role = 'admin';
      }

      user.loginAttempts = 0;
      user.lastLogin = new Date();
      await user.save();

      const token = jwt.sign(
        { userId: user._id, role: user.role || 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h', issuer: 'your-app-api', algorithm: 'HS256' }
      );

      res.cookie('session_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600000,
        path: '/'
      });

      const userResponse = {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        theme: user.theme,
        balance: user.balance,
        lastLogin: user.lastLogin
      };

      return handleAuthResponse(req, res, {
        success: true,
        user: userResponse,
        token: token,
        redirectTo: '/homepage.html'
      });

    } catch (err) {
      console.error('Login error:', err);
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

router.post('/ping', (req, res) => {
  console.log("✅ وصل طلب ping");
  res.json({ message: "pong" });
});


// =============================================
//          تسجيل الخروج
// =============================================
router.post('/logout', doubleCsrfProtection, async (req, res) => {
  try {
    const token = req.cookies.session_token || req.headers.authorization?.split(' ')[1];
    const revoked = await RevokedToken.findOne({ token });

    if (revoked) {
      return handleAuthResponse(req, res, {
        success: false,
        isAuthenticated: false,
        message: 'رمز الجلسة موقوف'
      });
    }


    if (!token) {
      return handleAuthResponse(req, res, {
        status: 400,
        success: false,
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
      sameSite: 'lax',
      path: '/'
    });

    return handleAuthResponse(req, res, {
      success: true,
      message: 'تم تسجيل الخروج بنجاح',
      redirectTo: '/login.html'
    });

  } catch (err) {
    console.error('Logout error:', err);
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
//          التحقق من حالة المصادقة
// =============================================
// ✅ التحقق من حالة الجلسة
router.get('/check-session', checkSession);

module.exports = router;