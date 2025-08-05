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
  keyGenerator: (req) => {
    // استخدام IP العميل الحقيقي عند وجود proxy
    return req.headers['x-forwarded-for'] || req.ip;
  },
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
  async (req, res) => {
    try {
      const { username, password, phone, theme } = req.body;

      // التحقق من عدم تكرار اسم المستخدم
      const existingUser = await User.findOne({ 
        username: { $regex: new RegExp(`^${username}$`, 'i') } 
      });
      
      if (existingUser) {
        return handleAuthResponse(req, res, {
          status: 409,
          success: false,
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
        sameSite: 'lax',
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

      return handleAuthResponse(req, res, {
        success: true,
        user: userResponse,
        token: token,
        redirectTo: '/homepage.html'
      });

    } catch (err) {
      console.error('Registration error:', err);
      return handleAuthResponse(req, res, {
        status: 500,
        success: false,
        error: 'حدث خطأ أثناء التسجيل',
        details: process.env.NODE_ENV === 'development' ? err.message : null,
        requestId: req.id
      });
    }
  }
);

// =============================================
//          تسجيل الدخول (يدعم JSON وHTML)
// =============================================
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
        return handleAuthResponse(req, res, {
          status: 401,
          success: false,
          error: 'بيانات الدخول غير صحيحة',
          solution: 'تحقق من اسم المستخدم وكلمة المرور',
          type: 'invalid_credentials'
        });
      }

      // التحقق من حالة الحساب
      if (user.accountStatus === 'suspended') {
        return handleAuthResponse(req, res, {
          status: 403,
          success: false,
          error: 'الحساب موقوف مؤقتاً',
          solution: 'اتصل بدعم العملاء',
          type: 'account_suspended'
        });
      }

      // التحقق من عدد المحاولات الفاشلة
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

      // التحقق من كلمة المرور
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
        sameSite: 'lax',
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

// =============================================
//          تسجيل الخروج
// =============================================
router.post('/logout', doubleCsrfProtection, async (req, res) => {
  try {
    const token = req.cookies.session_token || req.headers.authorization?.split(' ')[1];
    
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
router.get('/check-auth', async (req, res) => {
  try {
    const token = req.cookies.session_token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return handleAuthResponse(req, res, {
        success: false,
        isAuthenticated: false,
        message: 'لم يتم توفير رمز الجلسة'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return handleAuthResponse(req, res, {
        success: false,
        isAuthenticated: false,
        message: 'المستخدم غير موجود'
      });
    }

    return handleAuthResponse(req, res, {
      success: true,
      isAuthenticated: true,
      user: {
        id: user._id,
        username: user.username,
        phone: user.phone,
        theme: user.theme,
        balance: user.balance
      }
    });

  } catch (err) {
    return handleAuthResponse(req, res, {
      success: false,
      isAuthenticated: false,
      message: 'جلسة غير صالحة'
    });
  }
});

module.exports = router;
