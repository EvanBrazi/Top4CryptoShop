/**
 * auth.js - JWT authentication and role-based access control
 * يحتوي على ميدل وير التحقق من التوكن، صلاحيات الأدمن، والتحقق من الجلسة
 * @version: 2.2.0
 * @author: Evan Brazi
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');

/**
 * ✅ التحقق من التوكن من الهيدر أو الكوكيز
 * - يتحقق من وجود التوكن
 * - يفك تشفيره باستخدام JWT_SECRET
 * - يتحقق من أنه غير ملغى
 * - يضيف بيانات المستخدم إلى req.user
 */
const verifyToken = async (req, res, next) => {
  try {
    const token =
      req.headers.authorization?.split(' ')[1] ||
      req.cookies?.session_token;

    if (!token) {
      // message: 'يجب توفير رمز الجلسة'
      return res.status(401).redirect('/401.html');
    }

    const isRevoked = await RevokedToken.exists({ token });
    if (isRevoked) {
      // message: 'رمز الجلسة موقوف'
      return res.status(401).redirect('/401.html');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ['your-app-api', 'admin-panel']
    });

    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      // message: 'المستخدم غير موجود'
      return res.status(401).redirect('/401.html');
    }

    req.user = user;
    next();
  } catch (err) {
    // message: '🚫 الجلسة غير صالحة أو التوكن مزور'
    console.error('❌ فشل التحقق من التوكن:', err.message);
    return res.status(401).redirect('/401.html');
  }
};

/**
 * ✅ التحقق من صلاحيات الأدمن
 * - يجب أن يكون المستخدم لديه role = 'admin'
 */
const checkAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    // message: 'صلاحيات الأدمن مطلوبة'
    return res.status(401).redirect('/401.html');
  }
  next();
};

/**
 * ✅ التحقق من صلاحيات حسب الدور
 * - يسمح لك بتمرير أدوار متعددة مثل ['admin', 'moderator']
 */
const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      // message: 'ليس لديك صلاحية الوصول لهذه العملية'
      return res.status(401).redirect('/401.html');
    }
    next();
  };
};

/**
 * ✅ التحقق من حالة الجلسة
 * - يستخدم verifyToken داخليًا
 * - يعيد حالة المصادقة وبيانات المستخدم
 */
const checkSession = async (req, res) => {
  try {
    await verifyToken(req, res, async () => {
      res.json({
        success: true,
        isAuthenticated: true,
        user: {
          id: req.user._id,
          username: req.user.username,
          phone: req.user.phone,
          theme: req.user.theme,
          balance: req.user.balance,
          role: req.user.role
        }
      });
    });
  } catch (err) {
    // message: 'جلسة غير صالحة'
    return res.status(401).redirect('/401.html');
  }
};

module.exports = {
  verifyToken,
  checkAdmin,
  requireRole,
  checkSession
};