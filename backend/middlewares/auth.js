/**
 * @file auth.js
 * @description ميدل وير التحقق من التوكن، صلاحيات الوصول، والتحقق من الجلسة النشطة
 * @version 3.0.0
 * @author Evan Brazi
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const { activeSessions } = require('../utils/sessionStore');

/**
 * ✅ التحقق من التوكن وصلاحية الجلسة
 * - يتحقق من وجود التوكن في الهيدر أو الكوكيز
 * - يتحقق من أن التوكن غير ملغى
 * - يتحقق من أن الجلسة موجودة ولم تنتهِ
 * - يضيف بيانات المستخدم إلى req.user
 */
const verifyToken = async (req, res, next) => {
  try {
    const token =
      req.headers.authorization?.split(' ')[1] ||
      req.cookies?.session_token;
    console.log('🧪 customSessionId من الهيدر:', req.headers['x-session-id']);
    const rawSessionId = req.headers['x-session-id'] || req.cookies?.customSessionId;
    const sessionId = rawSessionId?.startsWith('s:') ? rawSessionId.split('.')[0].slice(2) : rawSessionId;
    console.log('1-verifyToken:: token:', token, 'customSessionId:', sessionId);
    if (!token || !sessionId) {
      console.log('Error 1');
      return res.status(401).redirect('/401.html');
    }
    console.log('2-verifyToken')
    // ✅ التحقق من أن التوكن غير ملغى
    const isRevoked = await RevokedToken.exists({ token });
    if (isRevoked) {
      return res.status(401).redirect('/401.html');
    }
    // ✅ فك التوكن والتحقق من صلاحيته الزمنية
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ['your-app-api', 'admin-panel']
    });
    console.log('✅ customSessionId بعد التنظيف:', sessionId);
    console.log('🧠 الجلسة:', activeSessions.get(sessionId));
    // ✅ التحقق من الجلسة النشطة
    const session = activeSessions.get(sessionId);
    if (!session || session.userId !== decoded.userId) {
      return res.status(403).redirect('/401.html');
    }

    // ✅ التحقق من انتهاء الجلسة
    if (Date.now() > session.expiresAt) {
      activeSessions.delete(sessionId);
      return res.status(403).redirect('/401.html');
    }
    // ✅ جلب بيانات المستخدم
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).redirect('/401.html');
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('❌ فشل التحقق من التوكن أو الجلسة:', err.message);
    return res.status(401).redirect('/401.html');
  }
};

/**
 * ✅ التحقق من صلاحيات الأدمن فقط
 */
const checkAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(401).redirect('/401.html');
  }
  next();
};

/**
 * ✅ التحقق من صلاحيات متعددة حسب الدور
 * @param {Array} roles - قائمة بالأدوار المسموح بها
 */
const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(401).redirect('/401.html');
    }
    next();
  };
};

/**
 * ✅ التحقق من حالة الجلسة (API)
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
    return res.status(401).redirect('/401.html');
  }
};

module.exports = {
  verifyToken,
  checkAdmin,
  requireRole,
  checkSession
};
